import { AppHeader } from "@/components/AppHeader";
import { PaperPicker } from "@/components/PaperPicker";

/**
 * Settings. One preference today, stored per viewer in localStorage — v1 has
 * no accounts and wants none.
 */
export default function SettingsPage() {
  return (
    <>
      <AppHeader back="/" trail={[{ label: "Settings" }]} />
      <main className="mx-auto flex max-w-[44rem] flex-col gap-6 p-6">
        <div>
          <h1 className="t-display">Settings</h1>
          <p className="t-body mt-1.5 max-w-[60ch]" style={{ color: "var(--text-secondary)" }}>
            Kept in this browser only. Nothing here is sent anywhere, and there is no account.
          </p>
        </div>

        <PaperPicker />

        {/* Reserved ad slot. Menus and the landing page only, never an exercise page. */}
        <div className="h-[90px] w-full max-w-[728px] mx-auto" aria-hidden="true" />
      </main>
    </>
  );
}
