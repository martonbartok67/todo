/**
 * 🕐 Date / time formatting helpers.
 *
 * The single biggest source of React hydration mismatches in this app
 * is calling `Date.toLocale*String()` without an explicit locale —
 * the server and the client may have different default locales
 * (server: en-NL, browser: whatever the OS is set to), and they format
 * numbers/dates differently.
 *
 * Rule: every `.toLocale*()` call in this codebase MUST go through
 * these helpers. They hard-code the locale and time zone so the
 * output is identical on both sides of the wire.
 *
 * Locale: `en-GB` → dd/mm/yyyy, 24h time, e.g. "09 Jul 2026, 15:15"
 * Time zone: Europe/Amsterdam (EUR sits here) — explicit so the server
 * (which often runs in UTC) and the client (browser) both render the
 * same wall-clock time.
 */

const LOCALE = "en-GB";
const TIME_ZONE = "Europe/Amsterdam";

/** "09 Jul 2026, 15:15" — full date + time, short. */
export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

/** "09 Jul" — date only, no time. */
export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(LOCALE, {
    day: "2-digit",
    month: "short",
    timeZone: TIME_ZONE,
  });
}

/** "Thursday, 9 Jul" — long weekday + day + month. */
export function formatDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: TIME_ZONE,
  });
}

/** "15:15" — time only, 24h. */
export function formatTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

/** "09 Jul, 15:15" — short date + time, no year. For compact task rows. */
export function formatDateTimeShort(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString(LOCALE, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  });
}
