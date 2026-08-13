# UX brief — Huddle redesign

*August 2026. Inputs: [competitive-landscape.md](competitive-landscape.md),
[target-users.md](target-users.md), and the codebase audit. This brief aims
the frontend rebuild: every screen decision below traces to a persona job or a
research finding. Status: draft for review.*

## Design principles

1. **The schedule is the product.** Every other screen either feeds it or is
   its payoff. Interaction polish budget goes here first (the bar is Float,
   G2's #1, and it's beatable on *scope* not *smoothness* — so smoothness is
   non-negotiable).
2. **See schedule ↔ log time is one motion.** The maker's planned day
   pre-fills their timesheet; confirming it is one tap (Resource Guru's
   best-loved pattern + Streamtime's drag-to-done, unified). "Your schedule is
   your timesheet."
3. **Calm frame, dense content.** Studios like dense boards; they hate noisy
   chrome. One accent color for actions, one for warnings; filters collapsed
   by default; nothing permanently begging in the nav.
4. **Two apps in one shell:** a manager's studio view (schedule, billing,
   people) and a maker's personal view (my week, my timer, my tasks). Roles
   determine which is *home*, not just which tabs exist.
5. **Capacity math must be true.** Per-person hours/day, PTO and part-days on
   the board, logged-vs-planned fills, placeholders for unconfirmed work. This
   is the verified #1 complaint against generic tools — being right here IS
   the differentiation.
6. **Thirty minutes to a working studio.** Nothing added to onboarding that
   delays first value; the proposal reader is onboarding magic (paste a
   proposal → a scheduled, billable project), not an "AI feature".

## Structural changes (before any screen)

- **URL routing** (hash or history): every tab, project, person and date range
  linkable; refresh keeps place. Prereq for everything.
- **Design tokens + proper Tailwind build:** colors/type/spacing defined once
  (kills the triple-defined constants); CDN script gone.
- **Responsive frame:** desktop-first layouts, but the shell, My Week, and
  Tracker must work on a phone. Read-only responsive schedule exceeds the
  entire category's mobile story.
- **Realtime on assignments + time_logs** (Supabase channels): two producers
  on the board see each other's moves; kills the stale-board problem the
  audit flagged.
- **Replace native alert()/confirm()** with in-app dialogs/toasts; undo where
  cheap (drag operations especially).

## Screen-by-screen

### Schedule (primary: Producer/Director — the product)
- Keep: person×phase timeline concept, client colors, drag mechanics,
  logged-vs-planned fill on bars (already better than most of the market).
- Fix: **zoom fluidity** (keyboard W/M/Q + smooth pinch/ctrl-scroll; the
  two-button zoom goes), performance headroom (virtualize rows), drag
  precision + undo toast.
- Add: **placeholders** (schedule unconfirmed work/roles before people —
  verified gap), part-day visual truth, per-person capacity line (hours/day
  from membership), conflict softening (warn, don't block).
- Calm down: collapse search/people/holiday/client filters into one Filter
  control with active-filter chips; legend into an overflow; footer hints go.
- Cut: nothing structural — this screen's scope is right; its noise isn't.

### My Week (NEW — primary: Maker; their home screen)
- The maker's landing view: today + this week's bars, large and personal, with
  one-tap "confirm day" / adjust, and the timer.
- This is principle 2 made into a screen: planned bars become logged time with
  one interaction; discrepancies (forgot yesterday) fixable inline.
- Replaces: Tracker-as-home for maker roles; the full Tracker page remains for
  timer devotees and manual entry.

### Tracker / MiniTracker (primary: Maker, Freelancer)
- Keep: timer, popout (desktop wrapper's always-on-top timer is a genuine
  differentiator), manual add.
- Fix: timer state moves server-side (survives devices/restarts; feeds
  realtime); tracker-only role gets the most minimal possible UI.

### Summary (primary: Director/Producer)
- Keep: week/person heat grid, phase budget-vs-logged panel (research: this is
  rare and valuable).
- Reframe: this is the Director's Monday "studio pulse" — pull the three
  questions (booked? on budget? slipping?) into a compact header strip instead
  of burying them in the grid.
- Cut: nothing; tighten presentation density.

### Billing (primary: Director — the payoff screen)
- Keep: schedule-derived phase income timeline (the differentiator NO
  competitor has at our price — this screen is why the integrated loop
  matters), overheads, pipeline likely/less-likely.
- Fix: visual hierarchy (it's currently a wall of table); month columns should
  read at a glance; connect visibly to the schedule ("this number exists
  because these phases are scheduled").
- Defer: invoice PDF generation (README promise) until after relaunch.

### Tasks (primary: Maker/Producer)
- Keep: board + timeline pinning of tasks (scheduling a task onto a person's
  lane is a feature Streamtime users ask for).
- Fix: drag-to-person interaction polish; mobile usability.
- Watch scope: tasks stay light — the research warns against becoming a PM
  tool; "real tasks next to a real schedule" is the wedge, not ClickUp parity.

### Projects & Clients (primary: Producer)
- Keep: phases with day/hour budgets, proposal-reader entry point.
- Fix: make phase budgets visibly connected to Schedule fills and Billing
  income (same numbers, three lenses).

### People (primary: Producer/Director)
- Keep: roles + granular permission editing (a differentiator at this price),
  invite links, seat usage.
- Fix: invite flow copy (link-first, email as bonus — research shows invite
  emails are a universal pain); role explanations inline.

### Settings / Onboarding / Auth
- Onboarding: keep 3-step wizard; add "try the demo studio" path (demo mode
  doubles as product tour); target < 30 min to scheduled-and-tracking.
- Auth: real ToS/Privacy links (legal docs are a launch blocker regardless).
- Settings: subscription UI stays; terminology switch (client/team) stays —
  it serves the broader-creative-services segment.

### Admin console (platform)
- Unchanged this cycle; it's ours, not customers'.

### Cut / demote list (from evidence)
- Permanent feedback beg-box in nav → occasional post-action toast instead.
- ComingSoonBilling dead component; duplicate modal kits; legacy adapter
  vocabulary (rebuild uses DB field names end to end).
- No CRM, no client portal, no report builder ambitions.

## Rebuild order (each step ships something usable in demo mode)

1. **Foundations:** tokens + Tailwind build, router, app shell (nav/header),
   responsive frame, dialog/toast system.
2. **Schedule** (the product) + realtime.
3. **My Week + Tracker** (the maker loop — principle 2).
4. **Summary + Billing** (the payoff screens).
5. **Tasks, Projects, People, Settings, Onboarding** (bring across, calmed).
6. Polish pass: keyboard shortcuts, empty states, performance profiling with
   large seed data.

## Open questions (parked, non-blocking)

- Pricing model (flexible until release — constraints in target-users.md).
- Mobile *apps* (out of scope; responsive web only this cycle).
- Realtime presence indicators (nice-to-have after realtime data lands).
