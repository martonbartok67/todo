/**
 * GET /api/seed-readings?secret=X
 * Populates reading_items from hardcoded course manual data.
 * Idempotent — uses onConflictDoNothing.
 * Run once after deploy whenever course manuals change.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readingItems, courses } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

// ── Course manual data ─────────────────────────────────────────────────────

type Reading = {
  lectureLabel: string;
  readingText:  string;
  detail:       string | null;
  weekNumber:   number | null;   // ISO week number, null for session-based courses
  lectureSlot:  "lecture_1" | "lecture_2" | "unknown";
  source:       "manual";
};

const COURSE_READINGS: Record<string, { nameFragment: string; readings: Reading[] }> = {

  // BT1203 — International Marketing (session-based, no ISO weeks)
  "BT1203": {
    nameFragment: "Marketing",
    readings: [
      { lectureLabel: "Session 1 — Introduction",                           readingText: "Marketing Strategy - An Overview",                          detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 1 — Introduction",                           readingText: "Marketing Myopia",                                          detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 1 — Introduction",                           readingText: "Strategic Insight in Three Circles",                        detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 2 — Competitive Analysis & Consumer Behavior", readingText: "The Coherence Premium",                                  detail: null, weekNumber: null, lectureSlot: "lecture_2", source: "manual" },
      { lectureLabel: "Session 2 — Competitive Analysis & Consumer Behavior", readingText: "Are You Ignoring Trends That Could Shake Up Your Business?", detail: null, weekNumber: null, lectureSlot: "lecture_2", source: "manual" },
      { lectureLabel: "Session 2 — Competitive Analysis & Consumer Behavior", readingText: "Strategies to Fight Low-Cost Rivals",                    detail: null, weekNumber: null, lectureSlot: "lecture_2", source: "manual" },
      { lectureLabel: "Session 2 — Competitive Analysis & Consumer Behavior", readingText: "Branding in the Digital Age",                            detail: null, weekNumber: null, lectureSlot: "lecture_2", source: "manual" },
      { lectureLabel: "Session 3 — Segmentation & Targeting",               readingText: "Note on Consumer Segmentation",                            detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 3 — Segmentation & Targeting",               readingText: "Segmenting the Base of the Pyramid",                       detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 3 — Segmentation & Targeting",               readingText: "Rediscovering Market Segmentation",                        detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 3 — Segmentation & Targeting",               readingText: "Customer Value Propositions in Business Markets",           detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 4 — Positioning & Pricing Strategy",         readingText: "Analyzing Consumer Perceptions",                           detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 4 — Positioning & Pricing Strategy",         readingText: "How to Stop Customers from Fixating on Price",             detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 4 — Positioning & Pricing Strategy",         readingText: "Pricing to Create Shared Value",                           detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 5 — Product and Channel Strategy",           readingText: "Principles of Product Policy",                             detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 5 — Product and Channel Strategy",           readingText: "Strategic Brand Valuation",                                detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 5 — Product and Channel Strategy",           readingText: "Strategic Channel Design",                                 detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 5 — Product and Channel Strategy",           readingText: "The Future of Shopping",                                   detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 6 — Promotion & Neuromarketing",             readingText: "The One Thing You Must Get Right When Building a Brand",   detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 6 — Promotion & Neuromarketing",             readingText: "For Mobile Devices, Think Apps, Not Ads",                  detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Session 6 — Promotion & Neuromarketing",             readingText: "Consumer Neuroscience: Applications, Challenges, and Possible Solutions", detail: null, weekNumber: null, lectureSlot: "lecture_1", source: "manual" },
    ],
  },

  // BT1201 — Introduction to Business (module-based, ISO weeks)
  "BT1201": {
    nameFragment: "Business",
    readings: [
      { lectureLabel: "Module 1 — Introduction (wk36)", readingText: "Chapter 1 — The Concept of Business in Context",              detail: null, weekNumber: 36, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 2 — Globalization (wk37)", readingText: "Chapter 2 — Globalization",                                  detail: null, weekNumber: 37, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 2 — Globalization (wk37)", readingText: "Chapter 3 — The Economy and the State",                      detail: null, weekNumber: 37, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 3 — Environment & Business (wk38)", readingText: "Chapter 3 — The Economy and the State",             detail: null, weekNumber: 38, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 3 — Environment & Business (wk38)", readingText: "Chapter 4 — Technology and Labour",                 detail: null, weekNumber: 38, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 4 — Cultural & Institutional Frameworks (wk39)", readingText: "Chapter 5 — Cultural and Institutional Frameworks", detail: null, weekNumber: 39, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 5 — Cultural & Institutional Frameworks Origins (wk40)", readingText: "Chapter 3 — The Economy and the State", detail: null, weekNumber: 40, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 5 — Cultural & Institutional Frameworks Origins (wk40)", readingText: "Chapter 5 — Cultural and Institutional Frameworks", detail: null, weekNumber: 40, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 6 — Organization and Structure (wk41)", readingText: "Chapter 2 — Globalization",                     detail: null, weekNumber: 41, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 6 — Organization and Structure (wk41)", readingText: "Chapter 6 — Organizational Aspects of Business", detail: null, weekNumber: 41, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 7 — Founders, Owners & Managers (wk44)", readingText: "Chapter 7 — Management & Leadership",          detail: null, weekNumber: 44, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 8 — What is Strategy? (wk45)", readingText: "Chapter 8 — Strategy",                                  detail: null, weekNumber: 45, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 9 — Strategic Analyses (wk46)", readingText: "Chapter 8 — Strategy",                                 detail: null, weekNumber: 46, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 10 — Strategy Formulation (wk47)", readingText: "Chapter 8 — Strategy",                              detail: null, weekNumber: 47, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 11 — Business Ethics & CSR (wk48)", readingText: "Chapter 9 — Business Ethics, Sustainability and CSR", detail: null, weekNumber: 48, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 12 — Wrapping Up (wk49)", readingText: "Chapter 10 — Innovation",                                    detail: null, weekNumber: 49, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 12 — Wrapping Up (wk49)", readingText: "Chapter 11 — Operations",                                    detail: null, weekNumber: 49, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 12 — Wrapping Up (wk49)", readingText: "Chapter 12 — Marketing",                                     detail: null, weekNumber: 49, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 12 — Wrapping Up (wk49)", readingText: "Chapter 13 — Human Resource Management",                     detail: null, weekNumber: 49, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Module 12 — Wrapping Up (wk49)", readingText: "Chapter 14 — Finance and Accounting",                        detail: null, weekNumber: 49, lectureSlot: "lecture_1", source: "manual" },
    ],
  },

  // BT1202 — Organisational Behaviour (week + lecture, ISO weeks)
  "BT1202": {
    nameFragment: "Organisational",
    readings: [
      { lectureLabel: "Week 36 — Lecture 1: What is OB?",                    readingText: "Chapter 1",                       detail: "Introduction to OB and core outcomes",                       weekNumber: 36, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Week 36 — Lecture 1: What is OB?",                    readingText: "Chapter 3",                       detail: "Introduction to OB and core outcomes",                       weekNumber: 36, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Week 37 — Lecture 2: Diversity in Organisations",      readingText: "Chapter 2",                       detail: "Individual characteristics, ability, personality, values",    weekNumber: 37, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Week 37 — Lecture 2: Diversity in Organisations",      readingText: "Chapter 5",                       detail: "Individual characteristics, ability, personality, values",    weekNumber: 37, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Week 38 — Lecture 3: Motivation",                      readingText: "Chapter 7",                       detail: "Motivation",                                                 weekNumber: 38, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Week 38 — Lecture 3: Motivation",                      readingText: "Chapter 8",                       detail: "Motivation",                                                 weekNumber: 38, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Week 39 — Lecture 4: Perception & Decision Making",    readingText: "Chapter 6",                       detail: "Perception and decision making",                             weekNumber: 39, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Week 40 — Lecture 5: Groups & Teams",                  readingText: "Chapter 9",                       detail: "Groups and teams",                                           weekNumber: 40, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Week 40 — Lecture 5: Groups & Teams",                  readingText: "Chapter 10",                      detail: "Groups and teams",                                           weekNumber: 40, lectureSlot: "lecture_1", source: "manual" },
      { lectureLabel: "Week 41 — Lecture 6: Leadership & Power",              readingText: "Chapters 12 & 13 (13.1–13.4)",    detail: "Leadership and power",                                       weekNumber: 41, lectureSlot: "lecture_1", source: "manual" },
    ],
  },
};

// ── ISO week → Monday date ─────────────────────────────────────────────────
function isoWeekToMonday(year: number, week: number): string {
  // Jan 4 is always in week 1
  const jan4    = new Date(year, 0, 4);
  const dayOfWeek = (jan4.getDay() + 6) % 7; // Mon=0
  const week1Mon  = new Date(jan4);
  week1Mon.setDate(jan4.getDate() - dayOfWeek);
  const targetMon = new Date(week1Mon);
  targetMon.setDate(week1Mon.getDate() + (week - 1) * 7);
  return targetMon.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];
  let totalInserted = 0;

  try {
    // Get all courses to match name fragments to canvas IDs
    const allCourses = await db.select({
      canvasId: courses.canvasId,
      name:     courses.name,
    }).from(courses);

    for (const [courseCode, { nameFragment, readings }] of Object.entries(COURSE_READINGS)) {
      // Match by name fragment (case-insensitive)
      const course = allCourses.find(c =>
        c.name.toLowerCase().includes(nameFragment.toLowerCase()) ||
        c.name.toLowerCase().includes(courseCode.toLowerCase())
      );

      if (!course) {
        results.push(`⚠ No course found for ${courseCode} (fragment: "${nameFragment}")`);
        results.push(`  Available: ${allCourses.map(c => c.name).join(", ")}`);
        continue;
      }

      const year = 2026;
      let inserted = 0;

      for (const r of readings) {
        // Compute lecture_date from ISO week number
        const lectureDate = r.weekNumber
          ? isoWeekToMonday(year, r.weekNumber)
          : null;

        try {
          await db.insert(readingItems).values({
            courseCanvasId: course.canvasId,
            courseName:     course.name,
            lectureLabel:   r.lectureLabel,
            readingText:    r.readingText,
            detail:         r.detail,
            weekNumber:     r.weekNumber,
            lectureSlot:    r.lectureSlot,
            lectureDate,
            source:         "manual",
            completedAt:    null,
            createdAt:      new Date().toISOString(),
            updatedAt:      new Date().toISOString(),
          }).onConflictDoNothing();
          inserted++;
        } catch (e) {
          results.push(`  ! insert error: ${e}`);
        }
      }

      totalInserted += inserted;
      results.push(`✓ ${course.name}: ${inserted}/${readings.length} readings seeded`);
    }

    // Count total
    const countRows = await db.select().from(readingItems);
    results.push(`Total reading_items in DB: ${countRows.length}`);

  } catch (err) {
    return NextResponse.json({ error: String(err), results }, { status: 500 });
  }

  return NextResponse.json({ ok: true, totalInserted, results });
}
