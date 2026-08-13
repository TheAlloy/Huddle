# Target users & jobs-to-be-done — Huddle

*August 2026. Source: founding team's direct experience with studios (in lieu
of interviews), cross-checked against the competitive research
([competitive-landscape.md](competitive-landscape.md)). Decisions here aim the
UX brief; anything marked (decision) can be revisited before release.*

## Segment

**Creative-services companies, 5–50 people.** Broader than design studios:
branding, motion, digital/agency work, and adjacent fields (architecture,
games art). Not verticalized to one discipline — the product language stays
"clients, projects, phases", which all of these share.

**(decision) Design center: the 8–15 person studio.** The stated band is 5–50,
but defaults can only be tuned for one center. At 8–15: one or two people run
the schedule, most of the team makes things, billing is real but there's no
finance department. We design every default for this studio and make sure
nothing *breaks* at 50 (teams, permissions and multi-lane scheduling already
exist for the upper band). Rationale: the research shows the 15+ band has
credible options (Productive, Scoro); the under-15 band is the structurally
underserved one.

## Personas

### 1. The Director (buyer, weekly power user)
Founder / creative director / MD. **Usually the person who finds and buys the
tool.** Also schedules projects and plans billing in smaller studios.

Jobs to be done:
- "When I open Huddle on Monday, show me the studio's pulse" — the three
  questions in one view: **who's booked / are projects on budget / what's
  slipping**. (Which of the three matters most varies by team — so the answer
  is one composed view, not three reports.)
- "When a proposal is agreed, get it onto the schedule and the billing
  timeline in minutes" (the AI proposal reader serves this).
- "When cash matters, show me what invoices should exist this month" —
  schedule-derived billing.
- Buying-trigger pain: outgrew spreadsheets/whiteboard, or fed up paying for
  2–3 disconnected tools.

### 2. The Producer / Studio manager (daily heavy user)
Runs the schedule day to day. In the design-center studio this is often the
same person as the Director; from ~15 people it's a distinct role.

Jobs to be done:
- "When priorities change, reschedule people in seconds without breaking
  anything" — drag precision, conflict/capacity warnings, undo confidence.
- "When new work lands, find who has capacity" — capacity truth: per-person
  hours/day, PTO and part-days visible, tentative work placeable before it's
  confirmed (placeholders).
- "When someone's away or overloaded, see it before it hurts."

### 3. The Maker (designer / animator / developer — most seats)
Opens Huddle briefly, several times a day. **The core loop: see my schedule →
log my time against it, seamlessly.** These two actions are one motion, not
two features.

Jobs to be done:
- "When I sit down, show me instantly what I'm on today and next" — my week,
  not the studio's admin view.
- "When I work, logging time against what I was scheduled to do should be
  near-zero effort" — the schedule pre-fills the timesheet; confirming or
  nudging a planned day into a logged day is one interaction. Timer for those
  who want it; confirm-what-was-planned for everyone else.
- "When I forgot yesterday, fixing it takes seconds."

### 4. The Freelancer (peripheral, not forgotten)
Joins for a project via invite link, tracks time, leaves. Not central to the
product (decision) but explicitly supported: instant invite-link onboarding,
the tracker-only role's minimal UI, and a pricing model that doesn't punish
rotating seats (per-seat resentment is a verified market complaint).

## Pricing posture

**(decision — deliberately open until release.)** Constraints from research to
design within: land in the **$10–15/user comfort band**; never gate
scheduling/capacity behind a higher tier (the category's most-resented move);
handle rotating freelancer seats gracefully (Float's per-*scheduled*-person
model and flat small-studio pricing are the candidate shapes).

## What this definition rules OUT

- Verticalized features for one discipline (stay creative-services-generic).
- Finance-department depth (rate cards per client currency, revenue
  recognition) — that's the 50+ band we're not designing for.
- CRM/sales pipeline, client portals, report builders — no complaint mass in
  research, and they pull toward the bloat that defines the incumbents.
