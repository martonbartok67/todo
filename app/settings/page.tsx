import { PageChrome } from "@/components/PageChrome";

export const dynamic = "force-dynamic";

/**
 * ⚙️ /settings — placeholder.
 *
 * The full Settings screen (push notifications, per-course mutes,
 * quiet hours, etc.) lands as part of Step 5 (PWA & iOS push).
 *
 * For now we render a minimal placeholder so the nav links don't 404.
 */
export default function SettingsPage() {
  return (
    <PageChrome active="settings">
      <header className="mb-5">
        <h1 className="text-lg md:text-base font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted mt-0.5">
          Notification preferences and account options.
        </p>
      </header>

      <section className="rounded-xl bg-surface-1 border border-border px-4 py-5 text-sm text-muted space-y-2">
        <p className="text-foreground font-medium">Coming in Step 5</p>
        <p>
          Push notifications (browser + iOS Home Screen), per-course
          mute toggles, quiet hours, and the test-notification button
          all land here in the PWA milestone.
        </p>
        <p className="text-[11px] text-muted/80">
          For now, this page exists so the sidebar / tab bar don't link
          to a 404.
        </p>
      </section>
    </PageChrome>
  );
}
