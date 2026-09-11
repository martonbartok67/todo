import {
  sqliteTable, text, integer, real, index, uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const courses = sqliteTable("courses", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  canvasId:    text("canvas_id").notNull(),
  name:        text("name").notNull(),
  courseCode:  text("course_code"),
  term:        text("term"),
  accentColor: text("accent_color"),
  lastSeenAt:  text("last_seen_at").notNull().default(sql`(datetime('now'))`),
  createdAt:   text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  canvasIdIdx: uniqueIndex("courses_canvas_id_idx").on(t.canvasId),
}));

export const tasks = sqliteTable("tasks", {
  id:             integer("id").primaryKey({ autoIncrement: true }),
  courseCanvasId: text("course_canvas_id").notNull(),
  canvasId:       text("canvas_id").notNull(),
  sourceType:     text("source_type", { enum: ["assignment","module_item"] }).notNull(),
  title:          text("title").notNull(),
  itemType:       text("item_type"),
  dueAt:          text("due_at"),
  pointsPossible: real("points_possible"),
  url:            text("url"),
  description:    text("description"),
  completedAt:    text("completed_at"),
  snoozedUntil:   text("snoozed_until"),
  lastSyncedAt:   text("last_synced_at").notNull().default(sql`(datetime('now'))`),
  createdAt:      text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt:      text("updated_at").notNull().default(sql`(datetime('now'))`),

  // ── Step 2: AI classification ────────────────────────────────────────
  // "task"   → show in the actionable Tasks list
  // "info"   → hide from Tasks, show in the new Resources tab
  // "unclassified" → default; treated as "task" until the AI runs
  classification:       text("classification", { enum: ["task","info","unclassified"] })
                          .notNull()
                          .default("unclassified"),
  classificationReason: text("classification_reason"),     // short AI explanation
  classifiedAt:         text("classified_at"),             // ISO timestamp
}, (t) => ({
  canvasSourceIdx:   uniqueIndex("tasks_canvas_source_idx").on(t.canvasId, t.sourceType),
  courseIdx:         index("tasks_course_idx").on(t.courseCanvasId),
  dueAtIdx:          index("tasks_due_at_idx").on(t.dueAt),
  completedIdx:      index("tasks_completed_idx").on(t.completedAt),
  classificationIdx: index("tasks_classification_idx").on(t.classification),
}));

export const syncLog = sqliteTable("sync_log", {
  id:               integer("id").primaryKey({ autoIncrement: true }),
  status:           text("status", { enum: ["success","partial","error"] }).notNull(),
  tasksUpserted:    integer("tasks_upserted").notNull().default(0),
  coursesProcessed: integer("courses_processed").notNull().default(0),
  errorMessage:     text("error_message"),
  durationMs:       integer("duration_ms"),
  startedAt:        text("started_at").notNull().default(sql`(datetime('now'))`),
  finishedAt:       text("finished_at"),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  endpoint:  text("endpoint").notNull(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey:   text("auth_key").notNull(),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  endpointIdx: uniqueIndex("push_endpoint_idx").on(t.endpoint),
}));

/**
 * Calendar / timetable entries pulled from Canvas `/calendar_events` or
 * a personal iCal feed (e.g. MyTimetable). Used to infer deadlines for
 * tasks that Canvas itself doesn't expose a due date for (e.g. workshop
 * activities, lectures) and to render a class schedule.
 *
 * `canvasId` is the source-specific unique id:
 *   - "canvas" source: the Canvas calendar event id
 *   - "ical" source:    the iCal VEVENT UID
 * The same physical event re-pulled on the next sync should hit the
 * unique index and just update mutable fields.
 */
export const timetableEvents = sqliteTable("timetable_events", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  canvasId:     text("canvas_id").notNull(),
  source:       text("source", { enum: ["canvas", "ical"] }).notNull().default("canvas"),
  courseCanvasId: text("course_canvas_id"), // null for personal events
  courseName:   text("course_name"),
  title:        text("title").notNull(),
  description:  text("description"),
  location:     text("location"),
  startAt:      text("start_at").notNull(),
  endAt:        text("end_at"),
  allDay:       integer("all_day", { mode: "boolean" }).notNull().default(false),
  eventType:    text("event_type"), // "event" | "assignment" | "calendar"
  sourceUrl:    text("source_url"),
  createdAt:    text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt:    text("updated_at").notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  canvasIdIdx: uniqueIndex("timetable_events_canvas_id_idx").on(t.canvasId),
  startAtIdx:  index("timetable_events_start_at_idx").on(t.startAt),
  courseIdx:   index("timetable_events_course_idx").on(t.courseCanvasId),
}));

/**
 * Single-row user settings. We don't have auth yet, so this is just one
 * row; the schema supports a future move to per-user settings without a
 * migration.
 */
export const userSettings = sqliteTable("user_settings", {
  id:         integer("id").primaryKey(), // always 1
  icalUrl:    text("ical_url"),
  icalLabel:  text("ical_label"),
  createdAt:  text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt:  text("updated_at").notNull().default(sql`(datetime('now'))`),
});

/**
 * AI-extracted (or manually added) reading items from course syllabi /
 * manuals. One row per reading entry (e.g. "Week 3 — Chapter 4, Smith 2019").
 *
 * Step 3 expands this with structured week/lecture info so the deadlines
 * pipeline (Step 4) can attach due dates to specific lectures.
 *
 * Unique on (courseCanvasId, lectureLabel, readingText, source) so the
 * AI re-runs don't overwrite user-added manual entries.
 */
export const readingItems = sqliteTable("reading_items", {
  id:             integer("id").primaryKey({ autoIncrement: true }),
  courseCanvasId: text("course_canvas_id").notNull(),
  courseName:     text("course_name").notNull(),
  // e.g. "Week 1", "Lecture 3", "Session 2 — Introduction"
  lectureLabel:   text("lecture_label").notNull(),
  // The reading itself, e.g. "Smith (2019) Ch. 4 — Market Structures"
  readingText:    text("reading_text").notNull(),
  // Optional: page range, URL, or extra note extracted by AI
  detail:         text("detail"),
  // Whether the student has marked this reading done locally
  completedAt:    text("completed_at"),
  // Which Canvas page this was extracted from (null for manual entries)
  sourcePageUrl:  text("source_page_url"),
  createdAt:      text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt:      text("updated_at").notNull().default(sql`(datetime('now'))`),

  // ── Step 3: structured syllabus data ──────────────────────────────
  // ISO-style week number (e.g. 36 for "Week 36"). NULL when the source
  // page doesn't mention a week — Step 4 will tolerate NULLs.
  weekNumber:  integer("week_number"),
  // Which lecture slot within the week. Defaults to "unknown" when the
  // AI can't determine; user can correct it via the edit UI.
  lectureSlot: text("lecture_slot", {
    enum: ["lecture_1", "lecture_2", "lecture_3", "unknown"],
  }).default("unknown"),
  // "ai" for AI-extracted rows, "manual" for user-added rows. Drives the
  // unique index so manual rows aren't clobbered when the AI re-runs.
  source:      text("source", { enum: ["ai", "manual"] })
                  .notNull()
                  .default("ai"),
  // Concrete date the lecture happens. NULL until Step 4's deadline
  // alignment fills it in by matching against timetable_events.
  lectureDate: text("lecture_date"),
  // ── Step 4: Deadline alignment ────────────────────────────────────
  // Foreign key to timetable_events — links this reading to the specific
  // lecture session it belongs to. NULL until the alignment pipeline runs.
  linkedTimetableEventId: integer("linked_timetable_event_id"),
  // Confidence score (0-1) for the deadline assignment. NULL when unassigned.
  deadlineConfidence:      real("deadline_confidence"),
}, (t) => ({
  courseIdx: index("reading_items_course_idx").on(t.courseCanvasId),
  weekIdx:   index("reading_items_week_idx").on(
    t.courseCanvasId, t.weekNumber, t.lectureSlot
  ),
  // Composite index for fast retrieval by course and lecture label
  courseLectureIdx: index("reading_items_course_lecture_idx").on(
    t.courseCanvasId, t.lectureLabel
  ),
  // Index for linked timetable events
  linkedEventIdx: index("reading_items_linked_event_idx").on(t.linkedTimetableEventId),
  // Note: the unique index now includes `source` so a manual row can
  // coexist with an AI row that happens to have the same text. The
  // `lecture_slot` column default ("unknown") ensures older rows
  // written before the new column existed satisfy the index.
  uniqueReading: uniqueIndex("reading_items_unique_idx").on(
    t.courseCanvasId, t.lectureLabel, t.readingText, t.source
  ),
}));

export type Course             = typeof courses.$inferSelect;
export type NewCourse          = typeof courses.$inferInsert;
export type Task               = typeof tasks.$inferSelect;
export type NewTask            = typeof tasks.$inferInsert;
export type SyncLog            = typeof syncLog.$inferSelect;
export type NewSyncLog         = typeof syncLog.$inferInsert;
export type PushSubscription   = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type TimetableEvent      = typeof timetableEvents.$inferSelect;
export type NewTimetableEvent   = typeof timetableEvents.$inferInsert;
export type UserSettings        = typeof userSettings.$inferSelect;
export type NewUserSettings     = typeof userSettings.$inferInsert;
export type ReadingItem        = typeof readingItems.$inferSelect;
export type NewReadingItem     = typeof readingItems.$inferInsert;
