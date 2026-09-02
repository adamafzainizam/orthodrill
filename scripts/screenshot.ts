/**
 * Screenshot a running page, optionally after driving it.
 *
 * WHY THIS EXISTS. AGENTS.md §6 records two defect classes that a green test
 * suite cannot see: authored prose that contradicts the answer key, and a
 * rendered layout that collides or disappears. §7 makes "render it and read it
 * as a student" a standing requirement for new content. That check kept being
 * done ad hoc and thrown away; this makes it repeatable.
 *
 * Chrome DevTools Protocol over Node's built-in WebSocket — deliberately NO
 * new dependency (AGENTS.md §2.1: ask before adding anything, and a headless
 * browser driver is a big thing to add for a screenshot).
 *
 * Usage:
 *   npm run dev                      # in another terminal
 *   google-chrome --headless=new --remote-debugging-port=9222 \
 *     --user-data-dir=/tmp/cdp about:blank &
 *   node --experimental-strip-types scripts/screenshot.ts <url> <out.png> [scene.mjs]
 *
 * A scene module exports `run(helpers)` and may click, type and hover before
 * the shot is taken — which is the only way to reach a mid-gesture state such
 * as a live preview or an angle readout.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { writeFileSync } from "node:fs";

/** Whatever the CDP method returns; narrowed at each call site by use. */
type CdpResult = { [k: string]: unknown };

async function main(): Promise<void> {
  const [url, outfile, scenePath] = process.argv.slice(2);
  if (!url || !outfile) {
    console.error("usage: screenshot.ts <url> <out.png> [scene.mjs]");
    process.exit(1);
  }

  const port = process.env.CDP_PORT ?? "9222";
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = (targets as { type: string; webSocketDebuggerUrl: string }[])
    .find((t) => t.type === "page");
  if (!page) throw new Error("no page target — is headless Chrome running?");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r as () => void, { once: true }));

  let id = 0;
  const pending = new Map<number, (v: CdpResult) => void>();
  ws.addEventListener("message", (e: MessageEvent) => {
    const m = JSON.parse(String(e.data));
    if (m.id && pending.has(m.id)) { pending.get(m.id)?.(m.result); pending.delete(m.id); }
  });
  // CDP results are method-specific and untyped here on purpose: this is a
  // dev tool, and typing the whole protocol would be more code than the tool.
  const send = (method: string, params: Record<string, unknown> = {}): Promise<CdpResult> =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  const evaluate = async (expression: string): Promise<unknown> =>
    ((await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))
      ?.result as { value?: unknown } | undefined)?.value;

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url });
  await sleep(3500);

  /** Grid point -> client coords, through the sheet's real rendered box. */
  const clientFor = async (gx: number, gy: number) => await evaluate(`(() => {
    const svg = document.querySelector('svg[aria-label="Drawing sheet"]');
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return {
      x: box.left + (${gx} * 20 + 16) * (box.width / vb.width),
      y: box.top + (${gy} * 20 + 16) * (box.height / vb.height),
    };
  })()`);

  const mouse = (type: string, p: { x: number; y: number }) =>
    send("Input.dispatchMouseEvent", {
      type, x: p.x, y: p.y,
      button: type === "mouseMoved" ? "none" : "left",
      clickCount: type === "mouseMoved" ? 0 : 1,
      buttons: type === "mousePressed" ? 1 : 0,
    });

  const clickAt = async (gx: number, gy: number) => {
    const p = await clientFor(gx, gy) as { x: number; y: number };
    await mouse("mouseMoved", p);
    await mouse("mousePressed", p);
    await sleep(40);
    await mouse("mouseReleased", p);
    await sleep(80);
  };

  const key = async (k: string) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, text: k });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k });
    await sleep(120);
  };

  if (scenePath) {
    const scene = await import(scenePath);
    await (scene as { run: (h: Record<string, unknown>) => Promise<void> })
      .run({ evaluate, clickAt, key, clientFor, mouse, sleep, send });
  }

  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(outfile, Buffer.from(String(shot.data), "base64"));
  console.log("saved", outfile);
  ws.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
