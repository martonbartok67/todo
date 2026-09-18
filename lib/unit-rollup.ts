/**
 * Unit roll-up — collapse a unit's satellite items into the unit itself.
 *
 * Canvas courses that teach in numbered units publish the same unit three
 * or four times over as separate module items / external-tool assignments:
 *
 *   Unit 4.5: Modeling Skills - Partial Elasticities        (Page)
 *   Clip 4.5: Partial Elasticities                          (External, 1 pt)
 *   Clip Unit 4.6: Example Unconstrained Optimization ...    (External, 1 pt)
 *   Slides 4.6                                              (File)
 *
 * Every one of those lands in the Tasks list with the same derived
 * deadline, so a single lecture shows up as three or four rows. This is
 * not Canvas duplication (each row is a distinct Canvas object with its
 * own id), so the content_id de-dup in lib/canvas/sync.ts cannot see it —
 * it is an editorial duplication that only a title-shape rule can spot.
 *
 * The rule: when a course has a "Unit <n>" row, any media/reference row
 * for the same unit number (clip, slides, recording, notes ...) folds
 * into it. The folded rows are NOT deleted and NOT filtered out of the
 * database — they are handed back on the surviving row as `rolledUp`, so
 * the UI can still list them, link to them, and tick them off.
 *
 * Deliberately NOT folded: exercises, quizzes, tests, assignments,
 * problem sets and anything else that reads like work to hand in. Those
 * keep their own row even when they carry a unit number, because losing
 * one behind a collapsed page costs marks.
 *
 * Pure and dependency-free so scripts/test-unit-rollup.mjs can compile
 * and exercise it on its own.
 */

/** The words that mark a row as the unit itself. */
const PARENT_WORD = "(?:unit|topic|session|lecture)";

/**
 * The words that mark a row as one of the unit's satellites. Longer
 * phrases come first: the alternation is first-match, so "lecture notes"
 * has to be tried before a bare "notes" can swallow it.
 */
const CHILD_WORD =
  "(?:knowledge\\s*clips?|lecture\\s*notes?|slide\\s*decks?|slidedecks?" +
  "|clips?|videos?|slides?|recordings?|screencasts?|webcasts?|podcasts?" +
  "|handouts?|transcripts?|notes?|summar(?:y|ies))";

/** A dotted unit number: 4, 4.5, 4.5.2 ... */
const NUMBER = "(\\d+(?:\\.\\d+)*)";

/** Whitespace, colon or dash between a word and its number. */
const GAP = "[\\s:.\\-–—]*";

const PARENT_RE = new RegExp(`^${GAP}${PARENT_WORD}${GAP}${NUMBER}(?!\\d)`, "i");
const CHILD_RE  = new RegExp(
  `^${GAP}${CHILD_WORD}${GAP}(?:${PARENT_WORD}${GAP})?${NUMBER}(?!\\d)`, "i",
);

/**
 * Rows that are work to hand in never fold away, whatever their title
 * looks like. Checked against the title because item_type is unreliable:
 * these courses publish graded clips as `external_tool` assignments, the
 * same type a real graded activity uses.
 */
const NEVER_FOLD_RE =
  /\b(quiz|quizzes|exam|midterm|resit|test|assignment|assessment|exercise|exercises|problem\s*set|homework|hand-?in|submission|deliverable|report|essay|paper|presentation|case)\b/i;

export type UnitRole = "parent" | "child";
export type UnitRef  = { key: string; role: UnitRole };

/**
 * Classify a title as a unit heading, one of a unit's satellites, or
 * neither. Exported for the tests and for anything that wants to explain
 * a roll-up to the user.
 */
export function parseUnitRef(title: string): UnitRef | null {
  const child = CHILD_RE.exec(title);
  if (child) {
    if (NEVER_FOLD_RE.test(title)) return null;
    return { key: child[1], role: "child" };
  }
  const parent = PARENT_RE.exec(title);
  if (parent) return { key: parent[1], role: "parent" };
  return null;
}

/** True when `childKey` is the same unit as, or nested under, `parentKey`. */
function isUnder(childKey: string, parentKey: string): boolean {
  return childKey === parentKey || childKey.startsWith(parentKey + ".");
}

/** The shape rollUpUnits needs to read off each row. */
export type RollupRow = {
  id:              number;
  courseCanvasId:  string;
  title:           string;
  dueAt:           string | null;
  url?:            string | null;
  itemType?:       string | null;
  pointsPossible?: number | null;
  deadlineSource?: string | null;
};

/** A row that folded into its unit, kept for display on the unit's card. */
export type RolledUpChild = {
  id:             number;
  title:          string;
  url:            string | null;
  itemType:       string | null;
  pointsPossible: number | null;
  dueAt:          string | null;
};

export type RolledUp<T> = T & { rolledUp: RolledUpChild[] };

/**
 * Fold each course's unit satellites into the unit row that covers them.
 *
 * Returns the surviving rows in their original order, every one of them
 * carrying a `rolledUp` array (empty for rows that absorbed nothing). A
 * satellite with no matching unit row in the same course is left alone —
 * hiding it would make the unit disappear from the list entirely.
 */
export function rollUpUnits<T extends RollupRow>(rows: T[]): RolledUp<T>[] {
  // course → parent key → the row that owns that key (first one wins).
  const parents = new Map<string, Map<string, T>>();
  const refs    = new Map<number, UnitRef>();

  for (const row of rows) {
    const ref = parseUnitRef(row.title);
    if (!ref) continue;
    refs.set(row.id, ref);
    if (ref.role !== "parent") continue;
    let byKey = parents.get(row.courseCanvasId);
    if (!byKey) parents.set(row.courseCanvasId, (byKey = new Map()));
    if (!byKey.has(ref.key)) byKey.set(ref.key, row);
  }

  const absorbed = new Map<number, RolledUpChild[]>();
  const dropped  = new Set<number>();

  for (const row of rows) {
    const ref = refs.get(row.id);
    if (!ref || ref.role !== "child") continue;
    const byKey = parents.get(row.courseCanvasId);
    if (!byKey) continue;

    // Most specific unit wins: "Clip 4.5.2" prefers "Unit 4.5" over "Unit 4".
    let owner: T | null = null;
    let ownerKey = "";
    for (const [key, parent] of byKey) {
      if (!isUnder(ref.key, key)) continue;
      if (key.length > ownerKey.length) { owner = parent; ownerKey = key; }
    }
    if (!owner || owner.id === row.id) continue;

    dropped.add(row.id);
    const list = absorbed.get(owner.id) ?? [];
    list.push({
      id:             row.id,
      title:          row.title,
      url:            row.url ?? null,
      itemType:       row.itemType ?? null,
      pointsPossible: row.pointsPossible ?? null,
      dueAt:          row.dueAt,
    });
    absorbed.set(owner.id, list);
  }

  return rows
    .filter((row) => !dropped.has(row.id))
    .map((row) => {
      const children = (absorbed.get(row.id) ?? []).sort((a, b) =>
        a.title.localeCompare(b.title),
      );
      // A unit page with no date of its own inherits the earliest date
      // its satellites carry, so folding them away can never push the
      // unit out of the dated list and into "undated".
      if (row.dueAt == null && children.length > 0) {
        const dated = children.filter((c) => c.dueAt != null);
        if (dated.length > 0) {
          const donor = dated.reduce((a, b) => (a.dueAt! <= b.dueAt! ? a : b));
          const source = rows.find((r) => r.id === donor.id)?.deadlineSource ?? null;
          // Cast: the spread widens T's own `deadlineSource` (a union of
          // literals on the caller's row type) to RollupRow's `string |
          // null`. The value is one the caller itself stored, so the
          // narrower type still holds.
          return { ...row, dueAt: donor.dueAt, deadlineSource: source, rolledUp: children } as RolledUp<T>;
        }
      }
      return { ...row, rolledUp: children };
    });
}
