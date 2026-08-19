# Time tracker — UX audit

*August 2026, on branch `ux/time-tracker`. Code audit of the current tracking
surfaces plus a competitor benchmark. Input to the redesign, not a spec.*

## 1. What exists today

Time tracking is spread across **four implementations** of the same feature:

| Surface | File | What it is |
|---|---|---|
| Tracker page | [Tracker.jsx](../src/screens/Tracker.jsx) | Full-page tracker: status card, Today's Projects bubbles, Tasks bubbles, Start another row, Log manually row, Logged today list, week strip |
| Schedule inline tracker | [Schedule.jsx:521](../src/screens/Schedule.jsx:521) (`DashTracker`) | Collapsible near-duplicate of the whole page embedded at the top of the Schedule screen (~150 lines of copied logic and UI) |
| Header button | [App.jsx:247](../src/App.jsx:247) (`HeaderTracker`) | Polls localStorage every second to mirror the running timer in the top bar |
| Mini tracker | [MiniTracker.jsx](../src/screens/MiniTracker.jsx) | **Dead code** — imported nowhere, uses a *different* localStorage key (`cad_run_` vs `tracker_run_`) and raw column names. If ever rendered it would run a second, independent timer. |

Plus a floating always-on-top timer via the document Picture-in-Picture API
(`openFloatingTimer` in core.jsx) — genuinely nice, worth keeping.

### Data model

`time_logs`: `membership_id, project_id, phase_id, task_id, log_date, minutes, source ('timer'|'manual'), note`.

- **Duration-only.** No start/end timestamps — a "timer" entry is
  indistinguishable from a manual one except by `source`.
- **`note` exists in the schema but no UI reads or writes it.** Entries can only
  say *project + phase*, never *what was done*.
- The **running timer lives only in localStorage** (`tracker_run_<memberId>`:
  `{projectId, phaseId, taskId, startedAt}`). It is not in the database at all
  until Stop is pressed.

### The one good idea already present

The app knows the user's schedule. `Today's Projects` is derived from
`assignments` covering today, so the primary action is **one tap on a bubble**.
That is genuinely better than most competitors' cold-start flow and should be
the anchor of the redesign, not a casualty of it.

## 2. Findings

### Structural

- **F1 — Four copies of one feature.** Tracker.jsx and DashTracker are ~300
  lines of duplicated state, handlers, and markup that have already drifted
  (sorting of bubbles differs; MiniTracker diverged completely and died).
  Any redesign must first collapse this to one shared implementation.
- **F2 — Timer state has no owner.** localStorage-only state means: not synced
  across devices (web vs desktop wrapper each have their own timer), invisible
  to managers, and the header keeps in sync by *polling localStorage every
  second*. The 1s poll is a symptom: state with no owner, so everyone
  re-derives it.
- **F3 — Everything is visible at once.** The page stacks seven zones with no
  hierarchy: status card, Today's Projects, Tasks, Start another, Log manually,
  Logged today, This week. The common case (tap today's project) has the same
  visual weight as the rare cases (backfill a past day). This is the "too many
  actions" feeling.

### Friction / flow

- **F4 — Two parallel forms with duplicate pickers.** "Start another" and "Log
  manually" are separate rows, each with its own project Select + phase Select.
  Mode choice is forced *before* project choice; competitors do the reverse
  (pick what, then timer-or-duration is one toggle).
- **F5 — Project picker doesn't scale.** A plain grouped `Select` with no
  typeahead. Starting an unassigned project = open → scroll full client-grouped
  list → pick → maybe phase → Start (3–5 interactions). Standard elsewhere is a
  searchable combobox with recents at the top.
- **F6 — No "continue".** A logged entry can't be restarted. Repeat work — the
  most common tracking action after lunch — requires re-picking from the full
  list. Every competitor has one-click continue on recent entries.
- **F7 — Duration entry is two spinner inputs** (`h` + `m`), defaulting to
  1h 0m. Industry standard is one free-text field that parses "1:30", "90m",
  "1.5". Also: while a timer runs, the bubbles disappear — "switch project"
  is stop → wait → re-find → tap, instead of a single switch action.
- **F8 — Backfill is blind.** The week strip is inert display. To log against
  Tuesday you set a date in a popover with no visibility of what's already
  logged that day. There's no per-day view for anything except today.
- **F9 — Tasks and Projects are duplicate sections** with identical
  interaction, split only by data type (internal task vs client project). Every
  task bubble is titled "Task"; the split doubles vertical space for no user
  benefit.

### Correctness / trust

- **F10 — Forgotten timers corrupt data.** `stop()` logs
  `round(now − startedAt)` minutes **all to today's date**, uncapped. A timer
  left running overnight logs 16h to the wrong day. No idle detection, no
  "you've been running 8h+" prompt, no cap.
- **F11 — Discard is one misclick from data loss.** The X button (no confirm)
  sits directly beside the pop-out button; a running timer of any length is
  silently thrown away.
- **F12 — Rounding**: minimum 1 minute, rounds to nearest minute; sub-30s
  timers still log 1m. Fine, but undocumented behavior.

## 3. What the feature actually needs (jobs)

1. **"I'm starting on X now"** — one tap when X is scheduled (already good),
   ≤2 interactions when it isn't. Switching projects is one action, not
   stop+start.
2. **"Log my day/backfill"** — enter durations against a *visible* day, with
   the schedule as pre-filled suggestion, not from memory into a blind form.
3. **"Fix a mistake"** — edit/delete an entry in place (works today; keep).
4. **"Don't let me screw it up"** — forgotten-timer protection, confirm before
   discarding tracked time, timer visible wherever I am (header — keep; PiP —
   keep).
5. **"Managers can trust it"** — plausible durations, correct dates, and
   (open question) visibility of running timers.

Non-goals worth confirming: billable flags, per-entry approval workflows,
auto-tracking. Nothing in the schema or product suggests these are wanted.

## 4. Competitor benchmark

*Toggl Track, Harvest, Clockify, Everhour, Timely, Float — from official docs
and help centers (Aug 2026).*

### Per-product, in one line each

- **Toggl Track** — description field + play button, nothing required upfront
  (`N` to start, `M` to toggle timer/manual on the same bar). Hover-play
  **continue** on any past entry, `C` for the latest, pinned favorites. Idle
  detection, reminders, tray/mini always-on-top timer, elapsed time in tab title.
- **Harvest** — timesheet-centric; project+task required in a modal (~3–4
  clicks fresh), but once a row exists on today's sheet restart is **1 click**.
  "Copy rows from most recent timesheet" onto a blank day. Idle detection plus
  an **email nudge when a timer runs unusually long**.
- **Clockify** — Toggl clone: 1-action start, optional everything (admins can
  force fields). Continue on past entries, favorites on keys 1–5,
  **auto-stop at a set time**, "no timer running" interval reminders.
- **Everhour** — task-first: search a task, one click to start. Extension embeds
  start buttons inside Asana/Jira/ClickUp/etc. **Work-hours auto-stop kills all
  running timers at day's end.**
- **Timely** — no timer to forget: passive desktop capture; AI drafts entries
  which the user **reviews and approves** (~2 min/day). Corrections train the
  classifier. Private-by-design; nothing publishes without approval.
- **Float** (closest to Huddle) — **the schedule is the entry**: "Log my time"
  pre-fills the week with a row per scheduled allocation at planned hours;
  logging is one click per row ("Log"), adjust first if reality differed, and
  auto-submit exists for people whose plan matches reality. A one-click timer
  can run *on a scheduled allocation* (Pro). Scheduled-vs-logged is a
  first-class report.

### Consensus patterns (all or nearly all products)

1. **Capture first, classify later** — one always-visible start affordance with
   nothing required upfront; categorization never blocks starting.
2. **Timer and manual are peer modes of one surface** (a toggle on the same
   bar/modal, not separate forms) + a weekly timesheet grid for batch loggers.
3. **Continue/restart a previous entry is the #1 friction reducer** — most days
   repeat previous days; every product makes that one click.
4. **Searchable combobox with recents** for project/task; keyboard shortcuts
   (`N`/`M`/`C`) and `@project` inline syntax in the tracker-first tools.
5. **Three views of the same data**: day list, calendar/timeline, weekly grid.
6. **Forgotten-timer protection is table stakes** — idle detection, "not
   tracking" reminders, and increasingly *auto-stop at end of workday*.
7. **Running timer visible outside the app** — tray, tab title, badge,
   always-on-top mini window.

### Divergences that are actually decisions

- *What an entry attaches to*: free text first, project optional
  (Toggl/Clockify) vs project+task mandatory (Harvest/Everhour). Capture
  quality vs billing-data quality.
- *Duration vs timestamps*: Harvest makes it an account-level either/or;
  Toggl/Clockify store both.
- *Who does the remembering*: stopwatch discipline vs Timely's AI drafts vs
  **Float's schedule-derived pre-fill** — the latter two reframe the core
  action from "start tracking" to "**confirm what we think happened**."

### Implication for Huddle

Huddle is in Float's exact situation: assignments already say what each person
should be doing today. The highest-leverage model is therefore
**confirm-don't-compose**:

1. Pre-fill today from the schedule; logging planned work = confirm (or
   adjust-then-confirm). Removes the *what* decision, not just the start click.
2. Keep a one-click timer on those pre-filled rows for live-accuracy people.
3. Escape hatch for unplanned work: combobox with recents, project only.
4. Continue/copy-forward for recurring unplanned work.
5. Scheduled vs actual per day/week — the report a studio actually wants.
6. If a timer ships: auto-stop at workday end + visible running indicator
   (already partly there: header + PiP). Idle detection can wait.
7. A weekly grid matters less when the pre-filled week list *is* the grid.

## 5. Design decisions (settled with Troy, Aug 2026)

Outcome of the grilling session. These are the agreed intent — the spec/plan
derives from here.

### Model

- **D1 — Hybrid confirm+timer on schedule-prefilled rows.** The day arrives
  pre-filled with a row per scheduled assignment. Each row has two peer verbs:
  type hours (confirm) or start a live timer. This replaces the bubbles /
  "Start another" / "Log manually" trio. Both verbs are first-class — usage is
  a mix of live-timer people and end-of-day typers.
- **D2 — Week board layout.** 7 day columns, each holding that day's rows
  (scheduled suggestions + logged entries), today highlighted. Backfill = type
  into a past day's column; the week grid and the pre-filled week are the same
  thing. On narrow viewports it collapses to a single-day focus with a week
  strip (same components, one column).
- **D3 — Typing sets the day's total** for that project+phase (the existing
  `setTimeLogTotal` semantics); a stopping timer *adds* to it. Enter confirms.
- **D4 — Pre-fill suggestions are ghosts, never auto-submitted.** Suggested
  hours = assignment `hours_per_day` value when > 0, else the member's `daily`
  hours split evenly across that day's scheduled rows; shown as a placeholder
  with a one-tap "Log Xh" accept.
- **D5 — Unplanned work**: searchable combobox (type-ahead, recents first)
  replaces the scrolling Select, plus recent-projects chips as one-click adds.
  No copy-last-week in v1.

### Timer

- **D6 — Running timer moves to the DB** (schema addition + migration).
  Cross-device, header stops polling localStorage, self-visible only — no
  manager visibility for now.
- **D7 — Forgotten-timer protection**: cap elapsed at `max(member.daily, 12h)`
  attributed to the *start* date; past the cap the next app-open shows an
  adjust prompt (keep / adjust / discard) instead of silently logging.
  Discarding a running timer with > 5 min on the clock requires confirmation.
- **D8 — Optional note at stop-time** (and on entry edit). `time_logs.note`
  finally gets UI. Never required. Notes may be revisited/removed later.

### Structure

- **D9 — Tracker + Summary merge into one "Time" screen.** Defaults to
  *me + this week*; managers widen scope with the existing people picker
  exactly where `summary.view`/`summary.edit` allow. The legacy Summary screen
  **stays in the nav during the transition** and is removed once the merged
  screen is trusted.
- **D10 — One shared implementation.** Kill the Schedule-embedded DashTracker;
  delete dead MiniTracker.jsx; the header becomes a popover mini-tracker
  (today's rows + recents + stop/note) so quick-start works from any screen.
  Keep the PiP floating timer.
- **D11 — Tasks log under their project.** Task time fills both `task_id` and
  `project_id` (column already exists), so task time counts toward the
  project's phase budget *when the task is assigned to a project*. The full
  task-board rework (Trello view side-by-side with the tracker) is a
  follow-up project, as is the Float-style **Project plan** screen — until it
  exists, Summary's budget-vs-logged section stays parked on the Time screen,
  and the Holiday mode stays as a tab (moving to Team later).
- **D12 — Screen roles after the merge**: Schedule = planning (who *will*
  work), Time = actuals (what *was* worked), Project plan (later) =
  per-project lens. Schedule is otherwise untouched by this redesign.
- **D13 — Permissions**: `time.track` remains the gate; `time.manual` stops
  gating the UI (key kept for compat). No keyboard shortcuts in v1 beyond
  Enter-to-confirm.

### Proposed build order

1. Consolidate: one shared tracker component; kill DashTracker + MiniTracker.
2. Combobox with recents + continue chips (works in the old layout too).
3. DB timer + forgotten-timer protections + discard confirm.
4. Merged "Time" screen with the week board (legacy Summary kept alongside).
5. Header popover mini-tracker.
6. Task→project attribution.
