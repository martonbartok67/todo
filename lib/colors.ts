/**
 * 🎨 Per-course accent colours.
 *
 * Previously duplicated (with drifting values) in TaskDashboard and
 * TimetableDashboard. One palette, one hash, so a subject is the same
 * colour everywhere in the app.
 *
 * The palette is deliberately hue-spread rather than a single-hue ramp:
 * subjects need to be told apart at a glance, not ordered.
 */

const PALETTE = [
  "#2C6958", // green
  "#7A4F83", // plum
  "#286982", // teal-blue
  "#B4622F", // burnt orange
  "#C9991A", // ochre
  "#C1524A", // clay red
  "#5A63A6", // indigo
  "#4E7FA6", // steel blue
  "#3D7C6F", // sea green
  "#8A5A6E", // mauve
] as const;

/** Subjects whose colour should be stable regardless of their exact title. */
const BY_KEYWORD: Record<string, string> = {
  economics:     "#2C6958",
  mathematics:   "#7A4F83",
  math:          "#7A4F83",
  statistics:    "#286982",
  marketing:     "#3D7C6F",
  psychology:    "#C9991A",
  strategy:      "#C1524A",
  biology:       "#5A63A6",
  communication: "#4E7FA6",
  organisational:"#B4622F",
  organizational:"#B4622F",
  business:      "#2C6958",
};

function hashPick(name: string): string {
  // FNV-ish rolling hash — stable across server and client renders, which
  // matters because these colours are emitted during SSR.
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** The accent colour for a course. An explicit `accentColor` always wins. */
export function courseColor(name: string, accentColor?: string | null): string {
  if (accentColor) return accentColor;
  const lc = (name ?? "").toLowerCase();
  for (const [key, val] of Object.entries(BY_KEYWORD)) {
    if (lc.includes(key)) return val;
  }
  return hashPick(name ?? "");
}

/** Short initials for a course, for avatar-style badges. E.g. "OB", "IB". */
export function courseInitials(name: string): string {
  const words = (name ?? "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^\d+$/.test(w));
  if (!words.length) return (name ?? "?").slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
