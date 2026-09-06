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
}, (t) => ({
  canvasSourceIdx: uniqueIndex("tasks_canvas_source_idx").on(t.canvasId, t.sourceType),
  courseIdx:       index("tasks_course_idx").on(t.courseCanvasId),
  dueAtIdx:        index("tasks_due_at_idx").on(t.dueAt),
  completedIdx:    index("tasks_completed_idx").on(t.completedAt),
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
 * AI-extracted reading items from course syllabi / manuals.
 * One row per reading entry (e.g. "Week 3 — Chapter 4, Smith 2019").
 * Unique on (courseCanvasId, lectureLabel, readingText) to allow safe upsert.
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
  // Which Canvas page this was extracted from
  sourcePageUrl:  text("source_page_url"),
  createdAt:      text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt:      text("updated_at").notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  courseIdx: index("reading_items_course_idx").on(t.courseCanvasId),
  uniqueReading: uniqueIndex("reading_items_unique_idx").on(
    t.courseCanvasId, t.lectureLabel, t.readingText
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
export type ReadingItem        = typeof readingItems.$inferSelect;
export type NewReadingItem     = typeof readingItems.$inferInsert;
