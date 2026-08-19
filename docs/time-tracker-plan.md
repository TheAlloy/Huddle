# Time tracker redesign — implementation plan

*August 2026, branch `ux/time-tracker`. Inputs:
[time-tracker-ux-audit.md](time-tracker-ux-audit.md) — its §5 records the
settled design decisions (D1–D13); this plan decides **in what order** and
slices the work so each step is verifiable on its own. Status: draft.*

## Ground rules

- Every slice leaves the app working — verified by running it and
  `npm run typecheck`; there are no tests.
- **Verification happens in demo mode** (`npm run dev:demo` — the in-memory
  Supabase stand-in in [demo.js](../src/lib/demo.js), seeded studio data, no
  network). Its role switcher is how permission gates get checked (e.g. the
  `tracker` persona for `time.track`-only, `manager` for `summary.view`).
  Two consequences:
  - Any new table the UI reads/writes (slice 3's `running_timers`) must also
    be added to demo.js's in-memory DB, or demo verification breaks.
  - What demo mode *cannot* prove: RLS policies, cross-device sync, and
    realtime. Those few checks run once against the real backend when the
    slice's migration is applied.
- UI is stock shadcn (base-nova); **no shims** — compose stock anatomy at call
  sites. Feature-level components (a tracker row, the week board) are fine;
  wrappers around ui/* primitives are not.
- Schema changes = a new `migrations/2026-08-*.sql` file **and** the same change
  folded into `schema.sql` (CLAUDE.md rule). Slices 3 and 6 carry migrations.
- Commits happen only after Troy has reviewed each slice.

## Current state (measured)

| Fact | Where |
|---|---|
| 4 timer implementations | [Tracker.jsx](../src/screens/Tracker.jsx), `DashTracker` in [Schedule.jsx:521](../src/screens/Schedule.jsx:521), `HeaderTracker` in [App.jsx:247](../src/App.jsx:247), dead [MiniTracker.jsx](../src/screens/MiniTracker.jsx) |
| Timer state | localStorage `tracker_run_<memberId>`; header polls it every 1s and mirrors to `huddle_tracking` |
| `huddle_tracking` consumer | [desktop/main.js:77](../desktop/main.js:77) — minimize reminder. **Must keep working after the timer moves to the DB.** |
| `time_logs` | date + minutes only; `note` column exists, no UI. Write paths all in `makeHandlers` ([core.jsx:165–173](../src/studio/core.jsx)) |
| Set-total semantics | `setTimeLogTotal` already exists (core.jsx:171) — the merged screen's typed-hours verb |
| Combobox | already installed ([src/components/ui/combobox.tsx](../src/components/ui/combobox.tsx)) |
| Tasks | `tasks.project_id` / `phase_id` exist in schema; tracker currently logs task time with `project_id: null` |
| Nav | `NAV` array + `visible` filter in [App.jsx:181](../src/App.jsx:181); `tracker` tab default for juniors (App.jsx:130) |
| Planned hours | `assignments.mode = "hours_per_day"`, `value` defaults 0; member daily hours = `members.daily` (default 8) |

---

## Slice 1 — Consolidate: one tracker implementation

*Goal: delete two of the four copies with no intended visual change to the
Tracker page. Pure refactor + deletion; everything after builds on one code
path.*

- Delete `src/screens/MiniTracker.jsx` (dead, divergent).
- Remove `DashTracker` and its render site from Schedule.jsx (the Schedule
  screen simply loses the embedded tracker; the header button still reaches
  the Tracker page in one click). Also remove Schedule's private `lsGet`/`lsSet`
  copies if now unused.
- Extract the duplicated tracker logic into `src/screens/tracker/shared.jsx`:
  a `useRunningTimer(meId)` hook (read/subscribe/start/stop/cancel around the
  localStorage key — DB comes in slice 3, behind this same hook), and the
  derived-data helpers (today's scheduled rows, per-project logged minutes)
  currently cloned between Tracker.jsx and DashTracker.
- Tracker.jsx and HeaderTracker consume the hook. HeaderTracker keeps its 1s
  interval for the clock display and keeps writing `huddle_tracking`.

**Verify:** timer start/stop/discard on the Tracker page; header mirrors within
a second; PiP still opens and stops; Schedule renders clean with no tracker;
`npm run typecheck` passes; grep shows one definition of the start/stop logic.

## Slice 2 — Combobox + continue (quick wins inside the old layout)

*Goal: kill the two worst frictions without waiting for the new screen.*

- Replace `ProjectSelect` (grouped Select) with the stock **Combobox**:
  type-ahead over `index — name`, grouped by client, with a **Recents** group
  at the top (this member's distinct project+phase from the last 14 days of
  `time_logs`, most recent first). Same composition used by start-another,
  log-manually, and inline edit.
- Add a **continue** affordance (ghost play icon) to each "Logged today" entry:
  starts a timer with that entry's project/phase (or task).

**Verify:** typing filters; recents appear first and are correct; continue on a
logged entry starts the right timer; phase select still cascades.

## Slice 3 — Timer moves to the DB + protections

*Goal: D6–D8. The timer gets one owner, survives devices, and can no longer
corrupt data. Migration: `2026-08-running-timers.sql`.*

Schema (+ fold into `schema.sql`):

```sql
create table running_timers (
  org_id uuid not null references organizations(id) on delete cascade,
  membership_id uuid primary key references memberships(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  phase_id text, task_id uuid references tasks(id) on delete cascade,
  started_at timestamptz not null default now()
);
-- RLS: select/insert/update/delete only own row (membership → auth.uid()),
-- gated on app_has(org_id,'time.track'); mirrors the tl_write self-clause.
```

- `useRunningTimer` swaps its storage from localStorage to this table:
  start = upsert, stop = delete + `addTimeLog`, discard = delete. Fetch on
  mount + a Supabase realtime subscription on own row (covers PiP, header, and
  a second device); the subscription must no-op gracefully in demo mode. Keep
  a localStorage mirror **only** for `huddle_tracking` (desktop reminder) and
  instant-boot display; the DB row is truth.
- Add `running_timers` to demo.js's in-memory DB so the slice is verifiable in
  demo mode.
- **Cap** (D7): elapsed is clamped at `max(member.daily, 12)h`. Stopping past
  the cap logs the capped minutes **to the start date**. On app open with an
  over-cap timer, show an adjust dialog (keep capped / edit duration /
  discard) via `useConfirm`-style stock Dialog — no silent logging.
- **Discard confirm** (D7): >5 min elapsed → confirmation dialog.
- **Note at stop** (D8): stop flow gains an optional note input (skippable,
  Enter logs); `addTimeLog` learns to pass `note`; entry edit exposes it too.

**Verify (demo):** start, reload, timer survives; force `started_at` to
yesterday via the demo API/console → adjust prompt appears, chosen outcome
logs to yesterday's date; discard under/over 5 min behaves; note lands on the
entry. **Verify (real backend, once, when the migration is applied):** second
browser sees the running timer; a second test user cannot see/write my row
(RLS).

## Slice 4 — The merged "Time" screen (week board)

*Goal: D1–D5, D9, D12–D13. The big slice — new screen replacing the Tracker
page, absorbing Summary's logged-hours views. Legacy Summary stays in the nav.*

- New `src/screens/Time.jsx` (+ `src/screens/time/` subcomponents). Layout:
  **week board** — 7 day columns (Mon-anchored, ButtonGroup + Today nav as in
  Summary), each column holding that day's rows; today highlighted.
- A **row** = project+phase (or task) for that day: color chip, label, hours
  field, and on today a start/stop verb. Sources merged per day:
  scheduled assignments (suggestion rows), logged entries (grouped to totals,
  Summary-style), running timer (live row).
- **Typed hours set the day's total** for that row (`setTimeLogTotal`); Enter
  confirms. Timer stop adds, display re-groups.
- **Ghost suggestions** (D4): placeholder hours = assignment `value` when > 0,
  else `member.daily` split evenly across that day's scheduled rows; one-tap
  "Log Xh" accept; never auto-submitted.
- **Add row**: per-day combobox (slice 2's composition) + recent-project chips.
- **Scope**: defaults to me + this week. `summary.view` holders get the
  existing PeoplePicker (each person renders as their own board section, like
  Summary's calendar layout); `summary.edit` gates editing others.
  `time.manual` no longer gates typing (D13; keep the key defined).
- **Parked sections** (D11): budget-vs-logged and the Holiday mode move over
  as collapsed sections/tabs pending the future Project plan screen.
- **Nav**: `tracker` entry becomes `time` ("Time", Clock icon), visible when
  `time.track` **or** `summary.view` (NAV filter gains an `anyPerm` case);
  `summary` stays (legacy) until removal; junior default tab → `time`.
  Old Tracker.jsx is deleted here — its page is replaced.
- **Responsive** (D2/Q22): below a width breakpoint render one day column
  full-width with a week strip switcher — same row components.

**Verify:** normal day = N one-taps (accept suggestions); type into yesterday's
column backfills; start/stop from a today row; unplanned add via combobox;
manager widens scope and edits someone else's day; totals match legacy Summary
for the same week (spot-check per person + grand total); budgets/holiday
sections still render their old numbers; narrow window collapses to day view;
no-schedule empty state offers combobox + recents.

## Slice 5 — Header popover mini-tracker

*Goal: D10 — quick-start from any screen; the DashTracker successor.*

- HeaderTracker's button opens a **Popover**: running → live clock, project,
  stop-with-note, discard, PiP, "Open Time"; idle → today's suggestion rows +
  recents as one-tap starts, and an "Open Time" link. Composed from the same
  row components as slice 4.

**Verify:** start/stop/switch from Schedule and Projects tabs without
navigation; the Time screen reflects immediately; desktop minimize reminder
still keys off `huddle_tracking`.

## Slice 6 — Task time attributes to its project

*Goal: D11 — task time counts toward phase budgets when the task is assigned
to a project. Migration: `2026-08-task-log-projects.sql` (data backfill).*

- Start/log flows write `project_id` + `phase_id` from the task when set
  (keeping `task_id`).
- Sweep every consumer that assumes task logs have no project — at minimum:
  Tracker/Time row grouping keys, Summary's `if(l.taskId) continue` client
  filter, `phaseLogged` (core.jsx), Billing if it aggregates by project.
  Task entries render under their project with a task badge.
- Backfill migration: `update time_logs set project_id = t.project_id,
  phase_id = t.phase_id from tasks t where time_logs.task_id = t.id and
  time_logs.project_id is null and t.project_id is not null;` — **run after
  Troy confirms** historical budgets *should* absorb old task time; otherwise
  scope it to new logs only.

**Verify:** track a project-assigned task → phase budget increments; a
project-less task still logs and displays as before; Summary (legacy) and Time
agree on totals.

## Slice 7 — Retirement (gated on trust, possibly after merge to main)

*Not started until Troy is happy with the Time screen in real use.*

- Delete legacy Summary.jsx + its nav entry; Time takes the `summary` label's
  place fully. Delete any remaining old-tracker leftovers.
- Revisit D8: keep or drop notes based on actual use.

---

## Deferred (explicitly out of scope, per audit §5)

Project plan screen (budgets' real home), task-board rework + side-by-side
layout, Holiday → Team screen, copy-last-week, keyboard shortcuts beyond
Enter, idle detection, manager visibility of running timers.

## Slice order rationale

1–2 are pure improvement with zero schema risk and shrink the surface the big
slice must rebuild. 3 lands the data model the week board's live row needs,
verified inside the *old* UI where behavior is known. 4 is the payoff and the
only slice with real UX risk — everything around it is already stable. 5–6 are
small and independent once 4's components exist. 7 is cleanup behind a human
gate.
