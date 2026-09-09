/**
 * GET /api/seed-readings?secret=X
 * Populates reading_items from hardcoded course manual data.
 * Uses exact Canvas IDs. Idempotent — safe to run multiple times.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readingItems, timetableEvents } from "@/drizzle/schema";
import { eq, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

type Reading = {
  lectureLabel: string;
  readingText:  string;
  detail:       string | null;
  weekNumber:   number | null;
  sessionIndex: number | null;  // for session-based courses: 0-indexed order
  lectureSlot:  "lecture_1" | "lecture_2" | "unknown";
  source:       "manual";
};

// Canvas course IDs (confirmed from DB)
const CANVAS_IDS = {
  MARKETING: "57921",  // BT1203 Foundations of international marketing
  IB:        "57918",  // BT1201 Introduction to business
  OB:        "57916",  // BT1202 Organisational behaviour
};

const READINGS_BY_COURSE: Record<string, Reading[]> = {

  // BT1203 — Marketing: session-indexed (matched to timetable events by order)
  [CANVAS_IDS.MARKETING]: [
    { lectureLabel: "Session 1 — Introduction",                              readingText: "Marketing Strategy - An Overview",                                                    detail: null, weekNumber: null, sessionIndex: 0, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 1 — Introduction",                              readingText: "Marketing Myopia",                                                                   detail: null, weekNumber: null, sessionIndex: 0, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 1 — Introduction",                              readingText: "Strategic Insight in Three Circles",                                                 detail: null, weekNumber: null, sessionIndex: 0, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 2 — Competitive Analysis & Consumer Behavior",  readingText: "The Coherence Premium",                                                             detail: null, weekNumber: null, sessionIndex: 1, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 2 — Competitive Analysis & Consumer Behavior",  readingText: "Are You Ignoring Trends That Could Shake Up Your Business?",                       detail: null, weekNumber: null, sessionIndex: 1, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 2 — Competitive Analysis & Consumer Behavior",  readingText: "Strategies to Fight Low-Cost Rivals",                                              detail: null, weekNumber: null, sessionIndex: 1, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 2 — Competitive Analysis & Consumer Behavior",  readingText: "Branding in the Digital Age",                                                      detail: null, weekNumber: null, sessionIndex: 1, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 3 — Segmentation & Targeting",                  readingText: "Note on Consumer Segmentation",                                                    detail: null, weekNumber: null, sessionIndex: 2, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 3 — Segmentation & Targeting",                  readingText: "Segmenting the Base of the Pyramid",                                               detail: null, weekNumber: null, sessionIndex: 2, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 3 — Segmentation & Targeting",                  readingText: "Rediscovering Market Segmentation",                                                detail: null, weekNumber: null, sessionIndex: 2, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 3 — Segmentation & Targeting",                  readingText: "Customer Value Propositions in Business Markets",                                  detail: null, weekNumber: null, sessionIndex: 2, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 4 — Positioning & Pricing Strategy",            readingText: "Analyzing Consumer Perceptions",                                                   detail: null, weekNumber: null, sessionIndex: 3, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 4 — Positioning & Pricing Strategy",            readingText: "How to Stop Customers from Fixating on Price",                                    detail: null, weekNumber: null, sessionIndex: 3, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 4 — Positioning & Pricing Strategy",            readingText: "Pricing to Create Shared Value",                                                   detail: null, weekNumber: null, sessionIndex: 3, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 5 — Product and Channel Strategy",              readingText: "Principles of Product Policy",                                                     detail: null, weekNumber: null, sessionIndex: 4, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 5 — Product and Channel Strategy",              readingText: "Strategic Brand Valuation",                                                        detail: null, weekNumber: null, sessionIndex: 4, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 5 — Product and Channel Strategy",              readingText: "Strategic Channel Design",                                                         detail: null, weekNumber: null, sessionIndex: 4, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 5 — Product and Channel Strategy",              readingText: "The Future of Shopping",                                                           detail: null, weekNumber: null, sessionIndex: 4, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 6 — Promotion & Neuromarketing",                readingText: "The One Thing You Must Get Right When Building a Brand",                          detail: null, weekNumber: null, sessionIndex: 5, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 6 — Promotion & Neuromarketing",                readingText: "For Mobile Devices, Think Apps, Not Ads",                                         detail: null, weekNumber: null, sessionIndex: 5, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Session 6 — Promotion & Neuromarketing",                readingText: "Consumer Neuroscience: Applications, Challenges, and Possible Solutions",         detail: null, weekNumber: null, sessionIndex: 5, lectureSlot: "lecture_1", source: "manual" },
  ],

  // BT1201 — Introduction to Business: ISO week-based
  [CANVAS_IDS.IB]: [
    { lectureLabel: "Module 1 — Introduction (wk36)",                        readingText: "Chapter 1 — The Concept of Business in Context",              detail: null, weekNumber: 36, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 2 — Globalization (wk37)",                       readingText: "Chapter 2 — Globalization",                                  detail: null, weekNumber: 37, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 2 — Globalization (wk37)",                       readingText: "Chapter 3 — The Economy and the State",                      detail: null, weekNumber: 37, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 3 — Environment & Business (wk38)",              readingText: "Chapter 3 — The Economy and the State",                      detail: null, weekNumber: 38, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 3 — Environment & Business (wk38)",              readingText: "Chapter 4 — Technology and Labour",                          detail: null, weekNumber: 38, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 4 — Cultural & Institutional Frameworks (wk39)", readingText: "Chapter 5 — Cultural and Institutional Frameworks",          detail: null, weekNumber: 39, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 5 — Cultural Frameworks Origins (wk40)",         readingText: "Chapter 3 — The Economy and the State",                      detail: null, weekNumber: 40, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 5 — Cultural Frameworks Origins (wk40)",         readingText: "Chapter 5 — Cultural and Institutional Frameworks",          detail: null, weekNumber: 40, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 6 — Organization and Structure (wk41)",          readingText: "Chapter 2 — Globalization",                                  detail: null, weekNumber: 41, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 6 — Organization and Structure (wk41)",          readingText: "Chapter 6 — Organizational Aspects of Business",             detail: null, weekNumber: 41, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 7 — Founders, Owners & Managers (wk44)",         readingText: "Chapter 7 — Management & Leadership",                       detail: null, weekNumber: 44, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 8 — What is Strategy? (wk45)",                   readingText: "Chapter 8 — Strategy",                                      detail: null, weekNumber: 45, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 9 — Strategic Analyses (wk46)",                  readingText: "Chapter 8 — Strategy",                                      detail: null, weekNumber: 46, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 10 — Strategy Formulation (wk47)",               readingText: "Chapter 8 — Strategy",                                      detail: null, weekNumber: 47, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 11 — Business Ethics & CSR (wk48)",              readingText: "Chapter 9 — Business Ethics, Sustainability and CSR",        detail: null, weekNumber: 48, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 12 — Wrapping Up (wk49)",                        readingText: "Chapter 10 — Innovation",                                   detail: null, weekNumber: 49, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 12 — Wrapping Up (wk49)",                        readingText: "Chapter 11 — Operations",                                   detail: null, weekNumber: 49, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 12 — Wrapping Up (wk49)",                        readingText: "Chapter 12 — Marketing",                                    detail: null, weekNumber: 49, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 12 — Wrapping Up (wk49)",                        readingText: "Chapter 13 — Human Resource Management",                    detail: null, weekNumber: 49, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Module 12 — Wrapping Up (wk49)",                        readingText: "Chapter 14 — Finance and Accounting",                       detail: null, weekNumber: 49, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
  ],

  // BT1202 — Organisational Behaviour: ISO week-based
  [CANVAS_IDS.OB]: [
    { lectureLabel: "Week 36 — Lecture 1: What is OB?",                      readingText: "Chapter 1",                    detail: "Introduction to OB and core outcomes",                    weekNumber: 36, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Week 36 — Lecture 1: What is OB?",                      readingText: "Chapter 3",                    detail: "Introduction to OB and core outcomes",                    weekNumber: 36, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Week 37 — Lecture 2: Diversity in Organisations",        readingText: "Chapter 2",                    detail: "Individual characteristics, ability, personality, values", weekNumber: 37, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Week 37 — Lecture 2: Diversity in Organisations",        readingText: "Chapter 5",                    detail: "Individual characteristics, ability, personality, values", weekNumber: 37, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Week 38 — Lecture 3: Motivation",                        readingText: "Chapter 7",                    detail: "Motivation",                                              weekNumber: 38, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Week 38 — Lecture 3: Motivation",                        readingText: "Chapter 8",                    detail: "Motivation",                                              weekNumber: 38, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Week 39 — Lecture 4: Perception & Decision Making",      readingText: "Chapter 6",                    detail: "Perception and decision making",                          weekNumber: 39, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Week 40 — Lecture 5: Groups & Teams",                    readingText: "Chapter 9",                    detail: "Groups and teams",                                        weekNumber: 40, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Week 40 — Lecture 5: Groups & Teams",                    readingText: "Chapter 10",                   detail: "Groups and teams",                                        weekNumber: 40, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
    { lectureLabel: "Week 41 — Lecture 6: Leadership & Power",                readingText: "Chapters 12 & 13 (13.1–13.4)", detail: "Leadership and power",                                    weekNumber: 41, sessionIndex: null, lectureSlot: "lecture_1", source: "manual" },
  ],
};

// ── ISO week → Monday date ─────────────────────────────────────────────────
function isoWeekToMonday(year: number, week: number): string {
  const jan4      = new Date(Date.UTC(year, 0, 4));
  const dow       = (jan4.getUTCDay() + 6) % 7;
  const week1Mon  = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - dow);
  const target    = new Date(week1Mon);
  target.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  return target.toISOString();
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];
  let totalInserted = 0;

  try {
    // Clear old manual readings first to avoid stale data
    await db.delete(readingItems).where(eq(readingItems.source, "manual"));
    results.push("✓ Cleared old manual readings");

    // For Marketing: get timetable events ordered by date to map sessions
    const marketingEvents = await db.select()
      .from(timetableEvents)
      .where(eq(timetableEvents.courseCanvasId, CANVAS_IDS.MARKETING))
      .orderBy(asc(timetableEvents.startAt));
    results.push(`✓ Marketing timetable events found: ${marketingEvents.length}`);
    marketingEvents.forEach((e, i) =>
      results.push(`  Session ${i + 1}: ${e.startAt.slice(0, 10)} — ${e.title}`)
    );

    const year = 2026;

    for (const [courseCanvasId, readings] of Object.entries(READINGS_BY_COURSE)) {
      let inserted = 0;

      for (const r of readings) {
        let lectureDate: string | null = null;

        if (r.weekNumber !== null) {
          // ISO week → Monday of that week
          lectureDate = isoWeekToMonday(year, r.weekNumber);
        } else if (r.sessionIndex !== null) {
          // Session-based: use timetable event by position
          const event = marketingEvents[r.sessionIndex];
          lectureDate = event?.startAt ?? null;
        }

        try {
          await db.insert(readingItems).values({
            courseCanvasId,
            courseName:   courseCanvasId === CANVAS_IDS.MARKETING
              ? "Foundations of international marketing"
              : courseCanvasId === CANVAS_IDS.IB
              ? "Introduction to business"
              : "Organisational behaviour",
            lectureLabel: r.lectureLabel,
            readingText:  r.readingText,
            detail:       r.detail,
            weekNumber:   r.weekNumber,
            lectureSlot:  r.lectureSlot,
            lectureDate,
            source:       "manual",
            completedAt:  null,
            createdAt:    new Date().toISOString(),
            updatedAt:    new Date().toISOString(),
          }).onConflictDoNothing();
          inserted++;
        } catch (e) {
          results.push(`  ! insert error: ${e}`);
        }
      }

      totalInserted += inserted;
      results.push(`✓ ${courseCanvasId}: ${inserted} readings seeded`);
    }

    const count = await db.select({ n: sql<number>`count(*)` }).from(readingItems);
    results.push(`Total reading_items in DB: ${count[0]?.n}`);

  } catch (err) {
    return NextResponse.json({ error: String(err), results }, { status: 500 });
  }

  return NextResponse.json({ ok: true, totalInserted, results });
}
