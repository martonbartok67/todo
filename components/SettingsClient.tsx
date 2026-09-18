"use client";
import { useEffect, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { saveIcalUrl, clearIcalUrl } from "@/app/actions/timetable";
import { toast } from "sonner";

// A Web Push applicationServerKey must be raw bytes, but env vars can only
// carry text — the VAPID public key is generated URL-safe-base64, so this
// undoes that encoding before handing it to pushManager.subscribe().
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

type Course = { canvasId: string; name: string; code: string | null };
type LastSync = { startedAt: string; status: string; tasksUpserted: number } | null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "24px" }}>
      <p className="section-label" style={{ marginBottom: "8px", paddingLeft: "4px" }}>
        {title}
      </p>
      <div className="card">
        {children}
      </div>
    </section>
  );
}

function Row({ label, sublabel, children }: {
  label: string; sublabel?: string; children?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4"
      style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}
    >
      <div className="min-w-0">
        <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>{label}</p>
        {sublabel && <p className="page-subtitle">{sublabel}</p>}
      </div>
      {children && <div style={{ flexShrink: 0 }}>{children}</div>}
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
      style={{
        position: "relative",
        width: "48px",
        height: "28px",
        borderRadius: "14px",
        border: checked ? "none" : "2px solid var(--border)",
        background: checked ? "var(--accent)" : "var(--surface-1)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.2s, border 0.2s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: checked ? "4px" : "3px",
          left: checked ? "3px" : "3px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "transform 0.2s",
          transform: checked ? "translateX(20px)" : "translateX(0)",
        }}
      />
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
  // next-themes can only know the theme in the browser, so the server render
  // has no active button. Deferring the active state to after mount keeps
  // SSR and hydration byte-identical instead of logging a mismatch.
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => setThemeReady(true), []);
  const [icalInput, setIcalInput]   = useState(icalUrl   ?? "");
  const [labelInput, setLabelInput] = useState(icalLabel ?? "");
  const [isSaving, startSave]       = useTransition();
  const [isClearing, startClear]    = useTransition();

  // Two separate questions, not one boolean: "has the browser granted
  // notification permission" and "does an active push subscription exist
  // right now." Collapsing them into a single flag was the actual bug —
  // permission=granted plus no subscription yet (the ordinary first-time
  // state) got misread as "blocked," disabling the switch even though
  // tapping it would have worked fine. `hasSubscription` alone drives
  // on/off; `permission === "denied"` alone drives the disabled/blocked
  // state.
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [permission, setPermission]           = useState<NotificationPermission | null>(null);
  const [isSubscribing, setSubscribing]       = useState(false);
  const [diag, setDiag]                       = useState<string>("");

  // Temporary diagnostic — every plausible cause of a stuck "Blocked"
  // state (stale origin permission, device restriction profile, Screen
  // Time) has been ruled out on the reporting device, so this reads the
  // raw browser APIs directly instead of guessing further. Remove once
  // the iOS push issue is resolved.
  async function runDiagnostics() {
    const lines: string[] = [];
    lines.push(`Notification in window: ${"Notification" in window}`);
    lines.push(`Notification.permission: ${typeof Notification !== "undefined" ? Notification.permission : "n/a"}`);
    lines.push(`serviceWorker in navigator: ${"serviceWorker" in navigator}`);
    lines.push(`PushManager in window: ${"PushManager" in window}`);
    lines.push(`navigator.standalone: ${(navigator as unknown as { standalone?: boolean }).standalone}`);
    lines.push(`display-mode standalone: ${window.matchMedia("(display-mode: standalone)").matches}`);
    lines.push(`userAgent: ${navigator.userAgent}`);
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      lines.push(`SW registrations: ${regs.length}`);
      regs.forEach((r, i) => lines.push(`  [${i}] scope=${r.scope} active=${!!r.active} waiting=${!!r.waiting} installing=${!!r.installing}`));
    } catch (e) {
      lines.push(`SW registrations error: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      lines.push(`register() ok, scope=${reg.scope}`);
      const sub = await reg.pushManager.getSubscription();
      lines.push(`existing subscription: ${sub ? sub.endpoint : "none"}`);
    } catch (e) {
      lines.push(`register() error: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    }
    setDiag(lines.join("\n"));
  }

  async function rawRequestPermission() {
    try {
      const result = await Notification.requestPermission();
      setDiag((d) => `${d}\n\n[raw requestPermission()] -> "${result}"`);
    } catch (e) {
      setDiag((d) => `${d}\n\n[raw requestPermission() threw] ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    }
  }

  // The toggle's on/off state was never actually derived from anything —
  // it lived in useState with no initial read, so a reload always showed
  // "off" no matter what the user had chosen, and no subscription was
  // ever registered with the server for the cron to push to. The Push API
  // subscription itself IS the durable "preference" (the browser persists
  // it), so on mount we ask the browser what's actually there instead of
  // tracking a separate flag.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
    if (Notification.permission === "denied") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let cancelled = false;
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (!cancelled) setHasSubscription(!!sub); })
      .catch(() => { /* unknown state — leave as null */ });
    return () => { cancelled = true; };
  }, []);

  async function handlePushToggle(next: boolean) {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Your browser doesn't support push notifications.");
      return;
    }
    setSubscribing(true);
    try {
      if (!next) {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          await fetch("/api/push", {
            method:  "DELETE",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ endpoint: existing.endpoint }),
          });
          await existing.unsubscribe();
        }
        setHasSubscription(false);
        toast.success("Notifications disabled.");
        return;
      }

      // iOS/WebKit only honors requestPermission() as a real user gesture
      // if it's the very first await in this handler — anything awaited
      // ahead of it (even a fast serviceWorker.register()) drops the
      // "triggered by a tap" flag, and the prompt silently never appears.
      // So this has to run before any other await, including registering
      // the service worker.
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        toast.error("Permission denied. Enable notifications in your browser settings.");
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        toast.error("Push notifications aren't configured yet — missing VAPID key.");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const json = subscription.toJSON();
      const res = await fetch("/api/push", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint:   json.endpoint,
          keys:       json.keys,
          userAgent:  navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error("Failed to save subscription");

      setHasSubscription(true);
      toast.success("Notifications enabled!");
    } catch {
      toast.error("Couldn't update notification settings.");
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
      {/* Sticky header */}
      <header className="page-header md:!static md:!backdrop-blur-none md:mb-5">
        <h1 className="page-title">
          Settings
        </h1>
        {lastSync && (
          <p className="page-subtitle">
            Last sync: {new Date(lastSync.startedAt).toLocaleString("en-NL", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            })} · {lastSync.tasksUpserted} items · {lastSync.status}
          </p>
        )}
      </header>

      <div style={{ padding: "18px 16px", paddingBottom: "88px" }} className="md:!p-0">
        {/* Appearance */}
        <Section title="Appearance">
          <Row label="Theme" sublabel={theme === "dark" ? "Dark mode" : "Light mode"}>
            <div
              className="segmented"
            >
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  data-active={themeReady && theme === t}
                >
                  {t === "light" ? "☀️ Light" : "🌙 Dark"}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <Row
            label="Push notifications"
            sublabel={
              hasSubscription === true
                ? "Enabled — you'll get deadline alerts"
                : permission === "denied"
                ? "Blocked — allow in browser settings"
                : "Get notified before deadlines"
            }
          >
            <Toggle
              checked={hasSubscription === true}
              onChange={handlePushToggle}
              disabled={isSubscribing || permission === "denied"}
            />
          </Row>
          <Row
            label="iOS Home Screen"
            sublabel='Add to Home Screen from Safari, then enable notifications'
          >
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>Safari only</span>
          </Row>
          <div style={{ padding: "12px 16px" }}>
            <button
              onClick={() => {
                if (Notification.permission === "granted") {
                  new Notification("Canvas Sync", { body: "Test notification working! 🎉" });
                  toast.success("Test notification sent.");
                } else {
                  toast.error("Enable notifications first.");
                }
              }}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "10px",
                border: "1px solid var(--border)",
                background: "var(--surface-1)",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--foreground)",
                cursor: "pointer",
              }}
            >
              Send test notification
            </button>
          </div>
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="flex gap-2">
              <button
                onClick={runDiagnostics}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px",
                  border: "1px solid var(--border)", background: "var(--surface-1)",
                  fontSize: "12px", fontWeight: 600, color: "var(--foreground)", cursor: "pointer",
                }}
              >
                Run diagnostics
              </button>
              <button
                onClick={rawRequestPermission}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px",
                  border: "1px solid var(--border)", background: "var(--surface-1)",
                  fontSize: "12px", fontWeight: 600, color: "var(--foreground)", cursor: "pointer",
                }}
              >
                Raw request permission
              </button>
            </div>
            {diag && (
              <pre style={{
                fontSize: "10px", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all",
                background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "10px",
                padding: "10px", color: "var(--foreground)", margin: 0,
              }}>{diag}</pre>
            )}
          </div>
        </Section>

        {/* Timetable / iCal */}
        <Section title="Timetable feed">
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div>
              <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "6px" }}>
                iCal URL (MyTimetable)
              </label>
              <input
                type="url"
                value={icalInput}
                onChange={e => setIcalInput(e.target.value)}
                placeholder="https://mytimetable.eur.nl/...ics"
                style={{
                  width: "100%",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  fontSize: "13px",
                  color: "var(--foreground)",
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "6px" }}>
                Label (optional)
              </label>
              <input
                type="text"
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                placeholder="My Timetable"
                style={{
                  width: "100%",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  fontSize: "13px",
                  color: "var(--foreground)",
                  outline: "none",
                }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveIcal}
                disabled={isSaving || !icalInput.trim()}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "10px",
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: isSaving || !icalInput.trim() ? "not-allowed" : "pointer",
                  opacity: isSaving || !icalInput.trim() ? 0.4 : 1,
                }}
              >
                {isSaving ? "Saving…" : "Save feed"}
              </button>
              {icalUrl && (
                <button
                  onClick={handleClearIcal}
                  disabled={isClearing}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "1px solid var(--border)",
                    background: "var(--surface-1)",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--foreground)",
                    cursor: "pointer",
                    opacity: isClearing ? 0.4 : 1,
                  }}
                >
                  {isClearing ? "…" : "Clear"}
                </button>
              )}
            </div>
            {icalUrl && (
              <p style={{ fontSize: "11px", color: "var(--muted)" }} className="truncate">
                Active: {icalLabel ?? icalUrl}
              </p>
            )}
          </div>
        </Section>

        {/* Courses */}
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
                style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 600 }}
                className="hover:opacity-80 transition-opacity"
              >
                View →
              </a>
            </Row>
          ))}
        </Section>

        {/* Sync */}
        <Section title="Sync">
          <Row
            label="Manual sync"
            sublabel="Re-pulls all Canvas tasks and timetable events"
          >
            <a
              href={`/api/sync?phase=tasks&secret=${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}
              className="hover:opacity-80 transition-opacity"
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
              style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}
              className="hover:opacity-80 transition-opacity"
            >
              Run ↗
            </a>
          </Row>
        </Section>
      </div>
    </>
  );
}
