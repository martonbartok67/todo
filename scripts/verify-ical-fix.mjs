// Standalone verifier for the iCal→course matching fix in lib/canvas/sync.ts.
// Re-implements parseIcal + the new fallback matcher so we can exercise it
// without spinning up the full app + DB.
import fs from "node:fs";

function unescapeIcal(s) {
  return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function parseIcalDate(value, fullName) {
  if (/^\d{8}$/.test(value)) {
    return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`);
  }
  const m = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`;
  if (value.endsWith("Z")) return new Date(`${m}.000Z`);
  return new Date(m);
}

function parseIcal(text) {
  const raw = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const lines = raw.split(/\r?\n/);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { current = {}; continue; }
    if (line === "END:VEVENT") {
      if (current?.uid && current?.summary && current?.start) {
        events.push({
          uid: current.uid,
          summary: current.summary,
          start: current.start,
          end: current.end ?? null,
          allDay: current.allDay ?? false,
          location: current.location ?? null,
          description: current.description ?? null,
          categories: current.categories ?? null,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const name = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const semi = name.indexOf(";");
    const prop = (semi < 0 ? name : name.slice(0, semi)).toUpperCase();
    switch (prop) {
      case "UID":         current.uid = unescapeIcal(value); break;
      case "SUMMARY":     current.summary = unescapeIcal(value); break;
      case "DTSTART":
        current.start = parseIcalDate(value, name);
        current.allDay = /VALUE=DATE(?!-)/i.test(name);
        break;
      case "DTEND":       current.end = parseIcalDate(value, name); break;
      case "LOCATION":    current.location = unescapeIcal(value); break;
      case "DESCRIPTION": current.description = unescapeIcal(value); break;
      case "CATEGORIES":  current.categories = unescapeIcal(value); break;
    }
  }
  return events;
}

// Mirror the new matching logic in runIcalSync().
function matchEvent(e, courseCodeByName, summaryCodeRegex) {
  const cat = (e.categories ?? "").toLowerCase().split(/[,;]/).map(s => s.trim()).filter(Boolean)[0] ?? "";
  let matched = courseCodeByName.get(cat);
  if (!matched && summaryCodeRegex && e.categories) {
    const m = e.categories.match(summaryCodeRegex);
    if (m) matched = courseCodeByName.get(m[0].toLowerCase());
  }
  if (!matched && summaryCodeRegex && e.summary) {
    const m = e.summary.match(summaryCodeRegex);
    if (m) matched = courseCodeByName.get(m[0].toLowerCase());
  }
  return matched;
}

// Real courses from your debug output:
const knownCourses = [
  { canvasId: "56744", name: "Bachelor 1 IBA 26-27",        code: null },
  { canvasId: "56741", name: "BSc IBA Student Onboarding",  code: "RSM-IBA-ONB-26" },
  { canvasId: "57921", name: "Foundations of intl marketing",code: "BT1203" },
  { canvasId: "42446", name: "IBA Notice Board",            code: "RSM-iba-bb" },
  { canvasId: "57918", name: "Introduction to business",    code: "BT1201" },
  { canvasId: "57923", name: "Mathematics",                 code: "BT1304" },
  { canvasId: "57916", name: "Organisational behaviour",    code: "BT1202" },
  { canvasId: "57925", name: "Professional development I",  code: "BT1205" },
  { canvasId: "43161", name: "RSM Bachelor Exchange",        code: "IO-BE-23" },
];

const courseCodeByName = new Map();
const knownCodes = [];
for (const c of knownCourses) {
  if (c.code) {
    courseCodeByName.set(c.code.toLowerCase(), { id: c.canvasId, name: c.name });
    knownCodes.push(c.code);
  }
}
const summaryCodeRegex = knownCodes.length
  ? new RegExp(`\\b(?:${knownCodes.map(escapeRegex).join("|")})\\b`, "i")
  : null;

// Synthetic MyTimetable feed using your real unmatchedTitles from the debug.
const feed = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:mtt-1@eur",
  "DTSTART:20260908T090000Z",
  "DTEND:20260908T100000Z",
  "SUMMARY:BMTTIBA1 - Bachelor 1 International Business Administration",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:mtt-2@eur",
  "DTSTART:20260908T110000Z",
  "DTEND:20260908T120000Z",
  "SUMMARY:BT1205 - Professional development & mentoring I",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:mtt-3@eur",
  "DTSTART:20260908T130000Z",
  "DTEND:20260908T140000Z",
  "SUMMARY:BT1304 - Mathematics",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:mtt-4@eur",
  "DTSTART:20260908T110000Z",
  "DTEND:20260908T120000Z",
  "SUMMARY:BT1205 - Professional development & mentoring I",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:mtt-5@eur",
  "DTSTART:20260908T150000Z",
  "DTEND:20260908T160000Z",
  "SUMMARY:BT1203 - Foundations of international marketing",
  "END:VEVENT",
  // Sanity cases:
  "BEGIN:VEVENT",
  "UID:mtt-6@eur",
  "DTSTART:20260908T170000Z",
  "DTEND:20260908T180000Z",
  "SUMMARY:Lunch with mentor",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:mtt-7@eur",
  "DTSTART:20260908T190000Z",
  "DTEND:20260908T200000Z",
  "CATEGORIES:BT1204",
  "SUMMARY:Guest lecture", // CATEGORIES has a code we don't know
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:mtt-8@eur",
  "DTSTART:20260908T210000Z",
  "DTEND:20260908T220000Z",
  "CATEGORIES:BT1205",
  "SUMMARY:Workshop", // CATEGORIES hit should win even without code in summary
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:mtt-9@eur",
  "DTSTART:20260908T230000Z",
  "DTEND:20260909T000000Z",
  "CATEGORIES:Course\\, BT1205",
  "SUMMARY:Seminar", // CATEGORIES with escaped comma, should still pick first token
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const events = parseIcal(feed);
console.log(`parsed ${events.length} events`);
console.log(`known codes: ${knownCodes.join(", ")}`);
console.log(`summaryCodeRegex: ${summaryCodeRegex}`);
console.log("");
let matched = 0, unmatched = 0;
for (const e of events) {
  const m = matchEvent(e, courseCodeByName, summaryCodeRegex);
  if (m) matched++; else unmatched++;
  const tag = m ? "✓" : "✗";
  console.log(`${tag}  uid=${e.uid}  summary=${JSON.stringify(e.summary)}  cat=${JSON.stringify(e.categories)}  →  ${m ? `${m.name} (${m.id})` : "UNMATCHED"}`);
}
console.log("");
console.log(`matched=${matched}  unmatched=${unmatched}`);

const expectedMatched = 6; // mtt-2,3,4,5 by SUMMARY prefix; mtt-8,9 by CATEGORIES
                          // mtt-1 (BMTTIBA1 not a known code), mtt-6 (no code), mtt-7 (BT1204 unknown) correctly stay unmatched.
if (matched === expectedMatched && unmatched === events.length - expectedMatched) {
  console.log(`PASS: matched ${matched}/${events.length} as expected`);
  process.exit(0);
} else {
  console.log(`FAIL: expected matched=${expectedMatched}, got matched=${matched}`);
  process.exit(1);
}