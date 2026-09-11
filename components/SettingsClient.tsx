"use client";
import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { saveIcalUrl, clearIcalUrl } from "@/app/actions/timetable";
import { toast } from "sonner";

type Course = { canvasId: string; name: string; code: string | null };
type LastSync = { startedAt: string; status: string; tasksUpserted: number } | null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-2 px-1">
        {title}
      </p>
      <div className="rounded-xl border border-border bg-surface-1 divide-y divide-border overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function Row({ label, sublabel, children }: {
  label: string; sublabel?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {sublabel && <p className="text-[11px] text-muted mt-0.5">{sublabel}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
        checked ? "bg-foreground" : "bg-surface-3",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span className={[
        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow transition-transform duration-200",
        checked ? "translate-x-5" : "translate-x-0",
      ].join(" ")} />
    </button>
  );
}

export function SettingsClient({ icalUrl, icalLabel, courses, lastSync }: {
  icalUrl:   string | null;
  icalLabel: string | null;
  courses:   Course[];
  lastSync:  LastSync;
}) {
  const { theme, setTheme } = useTheme();
  const [icalInput, setIcalInput]   = useState(icalUrl   ?? "");
  const [labelInput, setLabelInput] = useState(icalLabel ?? "");
  const [isSaving, startSave]       = useTransition();
  const [isClearing, startClear]    = useTransition();

  // Push notification state
  const [pushGranted, setPushGranted]   = useState<boolean | null>(null);
  const [isSubscribing, setSubscribing] = useState(false);

  async function handlePushToggle() {
    if (!("Notification" in window)) {
      toast.error("Your browser doesn't support push notifications.");
      return;
    }
    setSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      setPushGranted(permission === "granted");
      if (permission === "granted") {
        toast.success("Notifications enabled! You'll be alerted before deadlines.");
      } else {
        toast.error("Permission denied. Enable notifications in your browser settings.");
      }
    } finally {
      setSubscribing(false);
    }
  }

  function handleSaveIcal() {
    startSave(async () => {
      const r = await saveIcalUrl(icalInput, labelInput || null);
      if (r.status === "ok") {
        toast.success("iCal feed saved.");
      } else {
        toast.error("Failed to save iCal URL.");
      }
    });
  }

  function handleClearIcal() {
    startClear(async () => {
      await clearIcalUrl();
      setIcalInput("");
      setLabelInput("");
      toast.success("iCal feed cleared.");
    });
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[18px] font-semibold tracking-tight">Settings</h1>
        {lastSync && (
          <p className="text-[11px] text-muted mt-1">
            Last sync: {new Date(lastSync.startedAt).toLocaleString("en-NL", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            })} · {lastSync.tasksUpserted} items · {lastSync.status}
          </p>
        )}
      </header>

      {/* ── Appearance ───────────────────────────────────────────────── */}
      <Section title="Appearance">
        <Row label="Theme" sublabel={theme === "dark" ? "Dark" : "Light"}>
          <div className="flex items-center gap-1.5 bg-surface-2 border border-border rounded-lg p-1">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={[
                  "px-3 py-1 rounded-md text-[11px] font-medium transition-all",
                  theme === t
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted hover:text-foreground",
                ].join(" ")}
              >
                {t === "light" ? "☀️ Light" : "🌙 Dark"}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {/* ── Notifications ────────────────────────────────────────────── */}
      <Section title="Notifications">
        <Row
          label="Push notifications"
          sublabel={
            pushGranted === true
              ? "Enabled — you'll get deadline alerts"
              : pushGranted === false
              ? "Blocked — allow in browser settings"
              : "Get notified before deadlines"
          }
        >
          <Toggle
            checked={pushGranted === true}
            onChange={handlePushToggle}
            disabled={isSubscribing || pushGranted === false}
          />
        </Row>
        <Row
          label="iOS Home Screen"
          sublabel='Add to Home Screen from Safari, then enable notifications'
        >
          <span className="text-[11px] text-muted">Safari only</span>
        </Row>
        <div className="px-4 py-3">
          <button
            onClick={() => {
              if (Notification.permission === "granted") {
                new Notification("Canvas Sync", { body: "Test notification working! 🎉" });
                toast.success("Test notification sent.");
              } else {
                toast.error("Enable notifications first.");
              }
            }}
            className="w-full py-2 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 text-[12px] font-medium text-foreground transition-colors"
          >
            Send test notification
          </button>
        </div>
      </Section>

      {/* ── Timetable / iCal ─────────────────────────────────────────── */}
      <Section title="Timetable feed">
        <div className="px-4 py-4 space-y-3">
          <div>
            <label className="text-[11px] text-muted block mb-1.5">iCal URL (MyTimetable)</label>
            <input
              type="url"
              value={icalInput}
              onChange={e => setIcalInput(e.target.value)}
              placeholder="https://mytimetable.eur.nl/...ics"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-foreground/30"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1.5">Label (optional)</label>
            <input
              type="text"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              placeholder="My Timetable"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-foreground/30"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveIcal}
              disabled={isSaving || !icalInput.trim()}
              className="flex-1 py-2 rounded-lg bg-foreground text-background text-[12px] font-medium transition-opacity disabled:opacity-40"
            >
              {isSaving ? "Saving…" : "Save feed"}
            </button>
            {icalUrl && (
              <button
                onClick={handleClearIcal}
                disabled={isClearing}
                className="px-4 py-2 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 text-[12px] font-medium text-foreground transition-colors disabled:opacity-40"
              >
                {isClearing ? "…" : "Clear"}
              </button>
            )}
          </div>
          {icalUrl && (
            <p className="text-[11px] text-muted truncate">
              Active: {icalLabel ?? icalUrl}
            </p>
          )}
        </div>
      </Section>

      {/* ── Courses ──────────────────────────────────────────────────── */}
      <Section title="Courses">
        {courses.length === 0 && (
          <Row label="No courses synced yet" sublabel="Trigger a sync to populate" />
        )}
        {courses.map(c => (
          <Row
            key={c.canvasId}
            label={c.name}
            sublabel={c.code ?? undefined}
          >
            <a
              href={`/subjects/${c.canvasId}`}
              className="text-[11px] text-muted hover:text-foreground transition-colors"
            >
              View →
            </a>
          </Row>
        ))}
      </Section>

      {/* ── Sync ─────────────────────────────────────────────────────── */}
      <Section title="Sync">
        <Row
          label="Manual sync"
          sublabel="Re-pulls all Canvas tasks and timetable events"
        >
          <a
            href={`/api/sync?phase=tasks&secret=${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted hover:text-foreground transition-colors"
          >
            Run ↗
          </a>
        </Row>
        <Row
          label="Reseed readings"
          sublabel="Re-populates course manual readings"
        >
          <a
            href={`/api/seed-readings?secret=${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted hover:text-foreground transition-colors"
          >
            Run ↗
          </a>
        </Row>
      </Section>
    </>
  );
}
