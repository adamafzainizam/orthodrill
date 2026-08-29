"use client";

import { useEffect, useRef } from "react";

/**
 * A cursor-tracked backlight for the controls inside it.
 *
 * Each child marked `data-backlit` gets two custom properties written to it:
 * `--bl-x`/`--bl-y`, the cursor's position within that element, and
 * `--bl-on`, how lit it should be. The lighting falls off with DISTANCE, so
 * the control you are reaching for brightens before you arrive — the interface
 * anticipating the gesture rather than waiting for it. CSS in globals.css
 * turns those three numbers into a radial highlight.
 *
 * Written on one pointermove listener on the container, batched into a single
 * animation frame, and only ever touching custom properties that feed
 * `background-image` — nothing here triggers layout.
 *
 * Reduced motion is respected by the CSS, not here: the glow is a static
 * highlight rather than movement, but a reader who has asked for calm gets a
 * flat hover state instead of something that follows them around.
 */
const RADIUS = 220; // px beyond a control's edge at which its light dies

export function Backlight({ children, className, ...rest }: React.ComponentProps<"div">) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (el === null) return;

    let frame = 0;
    let pending: { x: number; y: number } | null = null;

    const paint = () => {
      frame = 0;
      const point = pending;
      if (point === null) return;
      for (const node of el.querySelectorAll<HTMLElement>("[data-backlit]")) {
        const box = node.getBoundingClientRect();
        // Distance from the cursor to the nearest point of the control, so a
        // wide button is not treated as being at its centre.
        const dx = Math.max(box.left - point.x, 0, point.x - box.right);
        const dy = Math.max(box.top - point.y, 0, point.y - box.bottom);
        const distance = Math.hypot(dx, dy);
        const lit = Math.max(0, 1 - distance / RADIUS);
        node.style.setProperty("--bl-x", `${point.x - box.left}px`);
        node.style.setProperty("--bl-y", `${point.y - box.top}px`);
        node.style.setProperty("--bl-on", lit.toFixed(3));
      }
    };

    const onMove = (e: PointerEvent) => {
      pending = { x: e.clientX, y: e.clientY };
      if (frame === 0) frame = requestAnimationFrame(paint);
    };

    const onLeave = () => {
      pending = null;
      if (frame !== 0) { cancelAnimationFrame(frame); frame = 0; }
      for (const node of el.querySelectorAll<HTMLElement>("[data-backlit]")) {
        node.style.setProperty("--bl-on", "0");
      }
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={host} className={className} {...rest}>{children}</div>;
}
