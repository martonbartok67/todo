# Canvas Task Sync

Zero-maintenance Canvas LMS task tracker. Automatically pulls all assignments
and module items every 6 hours via Vercel Cron.

## Stack
- Next.js 14 (App Router) + TypeScript
- Turso (libSQL) + Drizzle ORM
- Tailwind CSS + Framer Motion + Sonner
- Vercel Cron for background sync

## Setup

```bash
cp .env.local.example .env.local
# Fill in TURSO_DATABASE_URL, TURSO_AUTH_TOKEN,
# CANVAS_BASE_URL, CANVAS_BEARER_TOKEN, CRON_SECRET

npm install
npm run db:push   # push schema to Turso
npm run dev
```

## Architecture

| Path | Purpose |
|---|---|
| `drizzle/schema.ts` | Database schema |
| `lib/db.ts` | Turso client |
| `lib/canvas/client.ts` | Canvas API client + pagination |
| `lib/canvas/transform.ts` | Assignment/ModuleItem → Task |
| `lib/canvas/sync.ts` | Full sync orchestrator |
| `app/api/sync/route.ts` | Cron endpoint (POST /api/sync) |
| `app/actions/tasks.ts` | Server Actions for local state |
