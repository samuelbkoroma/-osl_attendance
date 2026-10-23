# Orange SL — Workforce Attendance

Attendance and shift-management app for Orange SL, built with Next.js (App
Router) and Supabase. Staff clock in/out against a branch geofence, HR works an
08:45 `Africa/Freetown` cutoff report, and missed clock-ins escalate up the
line-manager chain by email and in-app notification.

## Features

- **Employee** — clock in/out within a branch geofence, view personal
  attendance, request leave, submit attendance corrections.
- **Manager** — branch-scoped attendance for the people who report to you.
- **HR** — daily 08:45 cutoff report, leave approval, correction approval,
  manual attendance recording, org/branch/department/schedule settings, and an
  email-outbox console.
- **Alerts** — every self-service clock-in/out immediately notifies active HR
  and the employee's line manager in-app and by email, including the captured
  location. When someone is absent at the cutoff, the HR director(s) and each
  manager up the reporting chain (until a Director/CEO) are notified too. A
  daily attendance digest is emailed to HR directors.
- **Recovery** — staff can reset a forgotten password from the login page by
  email, without involving HR.
- **Hierarchy** — employees carry a rank
  (`ceo > director > senior_manager > manager > staff > temporary_staff > intern`)
  and an employment category (`permanent | temporary | intern`; temporary staff
  are managed by the external company **XL**).

## Tech stack

- Next.js 16 (App Router) + React 19, Tailwind, Radix UI primitives
- Supabase (Postgres + Auth + Realtime) via `@supabase/ssr`
- Vitest for unit tests; a throwaway-Postgres harness for SQL/migration tests

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example` and fill in the Supabase URL, anon
   key, and service-role key. The email variables are optional — without a
   transport, alerts are still queued in `public.email_outbox` but not sent.

3. Apply the database migrations in `supabase/migrations/` (in numeric order)
   via the Supabase SQL editor or CLI. See **Migrations** below. In Supabase
   **Authentication → URL Configuration**, add your app URL and
   `<app-url>/auth/callback` to the allowed redirect URLs so password-reset
   links work.

4. (Optional) Seed demo data:

   ```bash
   npm run seed:workforce   # reads .env.local
   ```

5. Run the dev server:

   ```bash
   npm run dev
   ```

## Migrations

Migrations live in `supabase/migrations/` and are written to be idempotent
(safe to re-run). The workforce schema starts at `020`:

| Migration | Purpose |
|-----------|---------|
| `020` | Core workforce schema (employees, branches, departments, schedules, attendance, leave, corrections, reports, notifications, audit) |
| `021` | RPC functions (check-in/out, cutoff processing, HR recording, review flows) |
| `022` | Row-level security policies |
| `023` | `pg_cron` schedule for the cutoff job |
| `024` | Reference seed data (schedules, branches, departments, settings) |
| `025` | Realtime publication |
| `026` | Corporate hierarchy: `rank`, `employment_category`, `managed_by_company`, `seniority` |
| `027` | Missed-clock-in alert chain + `email_outbox` + drain helpers |
| `028` | RLS/grants for `email_outbox` |
| `030` | Daily attendance digest |
| `031` | **Bundle:** convenience paste of `027` + `028` + `030` |
| `032` | Immediate clock-in/out alerts (HR + line manager, with location) |
| `033` | Leave overlap protection + employee cancellation + correction validation |
| `034` | Offboarding: terminate disables sign-in and closes pending requests |

`031_apply_alerts_digest.sql` concatenates `027 → 028 → 030` so a project that
was created before the alert chain existed can be brought up to date with a
single paste into the SQL editor.

## Automated cutoff

The protected endpoint `GET /api/cron/cutoff-report` (header
`Authorization: Bearer $CRON_SECRET`) runs the 08:45 snapshot, queues
missed-clock-in alerts, queues the daily digest, and drains the email outbox.
Schedule it with `pg_cron` (see `023`), Vercel Cron, or any external scheduler.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm start` | Start the production server |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run seed:workforce` | Seed demo workforce data |

## Testing the database

`scripts/db-test/run.sh` boots a throwaway PostgreSQL cluster, installs a small
Supabase auth shim, applies migrations `020`–`034`, and runs the assertions in
`scripts/db-test/test.sql` (schema, classification rules, check-in flow, cutoff
idempotency, leave/corrections, RLS scoping, hierarchy sync, the alert chain,
the digest, outbox RLS, immediate alerts, request cancellation, and offboarding).

```bash
bash scripts/db-test/run.sh          # run, then tear down
KEEP=1 bash scripts/db-test/run.sh   # leave the cluster up for inspection
```

Requires a local PostgreSQL install providing `initdb`, `pg_ctl`, and `psql`
(configure the paths at the top of `run.sh` if they live outside
`/usr/local/bin`).
