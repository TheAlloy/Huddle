# Competitive landscape — Huddle

*Working draft, August 2026. Research inputs: vendor sites, G2/Capterra reviews,
Reddit/forum threads. This document feeds the target-user and positioning work;
nothing in it is a decision yet.*

## 0. Huddle baseline (what we're comparing against)

What the product is today, for honest comparison:

- **Scope:** team schedule (drag-and-drop person/timeline board with project
  phases), time tracking (timer + manual + desktop wrapper), task board,
  summary/reporting, billing timeline (phase income, overheads, invoices,
  pipeline), clients & projects, roles/permissions (7 presets + 15 granular),
  multi-studio accounts, platform admin console, Stripe subscriptions.
- **Differentiators (hypotheses to test against research):**
  1. Schedule → time → billing in one connected loop: phase budgets fill as
     time is logged; the billing timeline derives from scheduled phases.
  2. AI proposal reader: PDF/text proposal → extracted client, phases,
     durations, value → scheduled project in one flow.
  3. Genuinely granular permissions for a small-team price point.
  4. ~30-minute self-serve setup (vs. weeks for agency all-in-ones).
  5. Desktop app with an always-on-top popout timer.
- **Known weaknesses (from our own audit):** desktop-only in practice (no
  responsive/mobile), no realtime collaboration, dense/busy UI, no URL routing,
  four screens ported from an internal tool built for one studio's workflow.
- **Pricing:** not yet set. Plans exist as Stripe placeholders.

## 1. Dedicated resource schedulers

*The polish benchmark for Huddle's core screen. Prices from vendor pricing
pages, Aug 2026.*

### Float (float.com) — the category leader
- **Pricing:** Starter $7 / Pro $12 per *scheduled person*/mo (scheduled people
  count even if they never log in; guests free). 30-day trial, no free plan.
- **Target:** professional-services delivery teams; heavy agency/design skew
  (Ogilvy, W+K logos). Positions as the resourcing layer *alongside* your
  PM/finance tools — deliberately not a replacement.
- **UX model:** rows = people, colors = projects, drag to create/move/split
  allocations by hours-per-day or % capacity; live utilization and
  over-capacity warnings inline. G2 #1 in resource management, 4.5/5 (2,000+
  reviews) — the interaction-design bar for our Schedule board.
- **Doesn't do:** real task management, invoicing (stops at margins/billable
  reporting).
- **Recurring complaints:** performance/lag at scale; weak task management;
  shallow reporting (constant exporting); scheduling edit bugs; mobile sync
  glitches (G2/Capterra).
- **Trajectory:** moving up-market into project financials (estimates vs
  actuals, margins, revenue dashboards, rate cards) — converging on Huddle's
  billing-planning territory from the other side.

### Resource Guru (resourceguruapp.com)
- **Pricing:** $4.16–$10/person/mo (annual). Highest satisfaction in the
  cluster (4.7/5, 538 Capterra reviews).
- **UX model:** rows = resources (people AND rooms/equipment); signature clash
  detection + waiting list; capacity heatmaps. Recently added Gantt project
  planning and **an MCP server so AI assistants can query your schedule**.
- **Timesheets pre-filled from the schedule** (booked work → one-click
  confirm) — a pattern worth stealing; no live timer, no invoicing, no task
  boards.
- **Recurring complaints:** limited reporting; limited integrations; clunky
  guest access/coarse permissions; poor mobile browser experience (Capterra).

### Toggl Plan → Toggl 2.0 (in transition)
- **Toggl Plan is being sunset**; Toggl 2.0 (launched Jun 2026) merges
  planning + tracking: free up to 3 users, then $9/$16 per user/mo.
- **UX notes worth stealing:** Plan's keyboard zoom (W/M/Q/A for
  week/month/quarter/year) is the most fluid documented; a "Taskbox" holds
  unscheduled tasks; 2.0 switches Board/Calendar/Timeline views without losing
  context.
- **Recurring complaints:** laggy at task volume; weak reporting; doesn't
  scale past small teams; 2026 migration friction (missing features, one
  reported data-loss incident) — **poachable users right now**.
- No invoicing; billable reporting only.

### Harvest Forecast — maintenance mode
- $5/person/mo add-on to Harvest; deliberately minimal (no tasks, no
  reporting depth, no AI, feature-static since ~2024).
- **The big story:** post-acquisition (Bending Spoons) Harvest pricing chaos —
  legacy plans closed, usage fees added, reports of costs jumping 2–7×,
  profitability reporting moved behind Enterprise. **Churn-motivated shopping
  among Harvest+Forecast agencies is happening now.**

### Cluster takeaways
1. **Price band:** $4–12/scheduled person/mo. This cluster is what a small
   studio can actually afford — but none of them do tasks or invoicing, so
   studios end up paying for 2–3 tools (e.g. Float + Harvest + a task app).
2. **Universal UX grammar** (rows = people, drag allocations, color = client/
   project, capacity warnings inline, day→quarter zoom) — Huddle's board
   already speaks this language; the gap is polish, performance, and zoom
   fluidity, not concept.
3. **Universal complaint set:** performance at scale, shallow reporting, weak
   tasks, weak mobile. Mobile is weak *across the whole market* — a persistent
   open flank.
4. **Nobody in either cluster bridges schedule → invoice** at a small-studio
   price. The affordable tools stop at scheduling; the tools that reach
   billing cost $25–50/user with weeks of setup. That's Huddle's structural
   gap, confirmed from both directions.

## 2. Studio-management all-in-ones

*The closest cluster to Huddle's scope. Prices verified on vendor pricing pages
Aug 2026; complaints sourced from G2/Capterra reviews and named review sites.*

### Productive (productive.io)
- **Pricing:** Essential $9/user/mo (annual) with resourcing + time tracking;
  **invoicing and rate cards gated to Professional at $24**; Ultimate custom.
  14-day trial. No seat minimum.
- **Target:** agencies/consultancies/professional services — SMB-to-mid-market,
  ops-mature; bigger than a 5-person studio.
- **UX model:** PSA/profitability platform. Resource planner + budgets are the
  core; everything prices through rate cards; deal → budget → bookings → time →
  invoice → margin.
- **Strengths:** resourcing + profitability core; furthest ahead on AI (AI time
  tracking from calendar, AI reporting, notetaker, AI project setup).
- **Recurring complaints:** steep learning curve from modularity; confusing
  information architecture (multiple boards per project); fiddly custom
  reporting; retainer work needs workarounds (Capterra; phloz.com review).
- **Setup burden:** 2–6 weeks to fully configured per reviews.

### Scoro (scoro.com)
- **Pricing:** Core $19.90 → Growth $32.90 → **Performance $49.90/user/mo
  (annual) — resource planner is locked to this tier**. **5-seat minimum on
  every plan** → ~$250/mo entry for resourcing. 14-day trial; paid onboarding
  packages.
- **Target:** consultancies, agencies, IT, architecture — mid-market; least
  creative-studio-flavored of the cluster.
- **UX model:** "quote-to-cash" — the quote/project is the organizing unit;
  dashboards are the home screen; scheduling is a secondary tool. Deepest
  quote→invoice pipeline.
- **Recurring complaints:** steep learning curve is the #1 cited issue;
  cluttered UI; expensive for small teams; weak mobile app; key features
  bait-gated to higher tiers (G2/Capterra via agiled.app roundup).
- **Setup burden:** 4–8 weeks reported by smaller teams.

### Streamtime (streamtime.net) — closest positioning overlap with Huddle
- **Pricing:** **no published pricing anymore** — consultative quote based on
  headcount, freelancers, and *annual revenue*. Historically ~$49/user/mo for
  Studio tier (dated, unverified). Users already called it "too expensive for
  the sector" (Capterra).
- **Target:** explicitly design studios, creative agencies, in-house teams,
  architects. Designer-led brand. Exactly Huddle's 5–30 person space.
- **UX model:** the personal to-do list + Jobs. Signature move: dragging a
  planned to-do into "done" *is* the time entry ("no timesheets"). The job plan
  is simultaneously quote, schedule source, and invoice basis — the tightest
  schedule↔time↔billing loop in the market and the design bar for Huddle.
- **Recurring complaints:** task management too light; schedule view lacks
  zoom/big-picture across the portfolio; price; limited quote/invoice
  customization (Capterra, 4.7/5 from ~235 reviews — refinement-level, not
  structural; notably NO bloat complaints).
- **Setup burden:** days, not weeks — but human-assisted onboarding, not
  self-serve.

### Workamajig (workamajig.com)
- **Pricing:** flat $49/user/mo at 10+ users (volume discounts above);
  onboarding/training baked in; **no free trial** (demo-led).
- **Target:** established mid-size ad/creative agencies and in-house
  departments; effectively an agency ERP with real accounting (AR/AP/GL).
- **Recurring complaints:** dated clunky UI is the dominant one; steep learning
  curve; laggy performance; click-heavy workflows; clunky parallel-task
  scheduling. **3.7/5 on both G2 and Capterra** — weakest of the cluster.
- **Setup burden:** ~3-month structured implementation with mandatory training
  sessions (vendor's own docs). The anti-pattern for a 30-minute-setup pitch.

### Cluster takeaways
1. **Setup-time spectrum:** Workamajig ~3 months → Scoro 4–8 wks → Productive
   2–6 wks → Streamtime days. *Nobody* is self-serve-fast; a genuine
   30-minute setup is unclaimed territory in this cluster.
2. **Complexity complaints are structural for 3 of 4.** Streamtime avoided
   bloat but pays for it with "tasks too light" and weak schedule zoom — the
   exact combination (real timeline + real task board) Huddle already has.
3. **Pricing floors exclude small studios:** Scoro ~$250/mo entry for
   resourcing, Workamajig ~$490/mo floor, Streamtime opaque revenue-based
   quotes. Transparent low-friction pricing for 5–10 seat studios is a wedge.
4. **Resource scheduling is treated as a premium feature** (Scoro gates it at
   $49.90). Making the schedule the entry-level hero inverts the category norm.

## 3. Generic PM tools studios misuse for scheduling

*Sourcing note: Reddit was inaccessible directly (crawler + policy blocks);
community evidence below is from vendor forums (primary, verified), G2/Capterra,
and Reddit-aggregating articles (secondhand, marked). The strongest findings
here are verified on the vendors' own forums.*

### The workload-view failure pattern (verified on all four vendors' forums)
The same complaint appears independently on monday Community, Asana Forum, and
ClickUp Canny — generic tools' workload views don't model real
people-scheduling:
- **monday.com:** hours smear evenly across a date range (a 6.5h task can't
  fill day 1 and roll over); unassigned work is invisible in Workload view.
  Timeline/Workload need Pro ($19); real Resource Planner/Capacity Manager are
  **Enterprise-only**.
- **ClickUp:** capacity math uses time *estimates* only, ignoring hours
  already tracked; daily capacity is always weekly÷5 (can't model a 4-day
  week); **no PTO handling at all** in workload view. Workload unlocks at
  Business ($12).
- **Asana:** workload is gated at Advanced (**$24.99** — the most expensive
  gate of the four); no per-day capacity; seeing one person's true load
  requires manually adding every project to a portfolio first; subtask effort
  invisible to capacity.
- **Notion:** no capacity view at all — a cottage industry of paid
  capacity-planning templates exists, which is itself evidence of the unmet
  need.

### The cost math for a 10-person studio on generic tools
monday Pro ($190/mo) + Float Pro (~$125/mo) + an invoicing tool ≈ **$300–350/mo
across three disconnected systems** — and the workload half still mis-models
capacity.

## 4. What studios say they want (community/review mining)

- **Recommendation lists are dominated by Float and Resource Guru** for
  people-scheduling; Teamwork/Notion/flat-rate tools for the cost-conscious.
- **Why people switch away:** price shocks (Harvest's post-acquisition usage
  fees — one 20-seat consultancy reported ~600% increase; monday's 18% hike),
  configuration burden ("we spent more time configuring ClickUp than managing
  projects… using maybe 10% of the features, paying for 100%"), and workload
  views that don't match reality.
- **Price sensitivity:** the comfort band is **$10–15/user/mo**; ~$110–150/mo
  total is where a 10-person studio's owner starts doing the math. Asana's
  $24.99 workload gate is the most-cited balk price. Per-seat resentment is
  real (paying for freelancers/inactive seats); flat-rate outliers (ProofHub)
  exist specifically to court it.
- **What the evidence does NOT show:** no meaningful user demand for AI
  features, client portals, or CRM in this tool class — those appear in vendor
  marketing only. Complaint mass is: capacity math wrong, price gates, tool
  fragmentation.

## 5. Pricing landscape (per user/month, annual)

| Band | Who's there | What you get |
|---|---|---|
| $0–8 | Resource Guru, Float Starter, ClickUp Unlimited, Toggl 2.0 free (≤3) | Scheduling only (RG/Float) or tasks-without-capacity |
| $9–15 | Float Pro, monday Standard, ClickUp Business, Asana Starter | The band studios want to live in; workload barely/doesn't unlock |
| $19–50 | monday Pro, Asana Advanced, Scoro, Productive Pro, Workamajig | Where real resourcing + billing live; priced/complexified for 15–50+ headcount |
| Enterprise | monday Resource Planner, ClickUp custom capacity, Kantata | True capacity planning in generic tools |

**Structural pattern:** capacity planning is consistently gated 1–2 tiers above
task management, and *good* capacity planning is enterprise-gated — while for a
10-person studio it's a daily survival need.

## 6. Gap analysis → candidate positioning

Synthesis of sections 1–5. Evidence strength noted.

**The structural gap (strong, confirmed from both directions):** no tool
bridges schedule → time → billing at a small-studio price and setup burden.
The affordable cluster ($4–12) stops at scheduling; the integrated cluster
($20–50/user, 5–10 seat minimums, weeks-to-months of setup) prices and
complexifies for larger agencies. The middle — *integrated but light,
affordable, self-serve* — is structurally empty. Huddle's existing scope
(schedule + time + tasks + billing timeline, 30-min setup target) sits exactly
in that hole.

**Timing tailwinds (verified):** two active churn events — Harvest/Forecast's
post-acquisition repricing and Toggl's forced 2.0 migration — plus monday's
price hikes are pushing exactly our target users into the market now.

**Candidate positioning statement (draft, to pressure-test):**
> For creative studios of 5–30 people, Huddle is the schedule-first studio
> tool that connects who's-doing-what to hours logged to money billed — set up
> in an afternoon, priced in the $10–15 band, without the bloat of an agency
> OS or the fragmentation of three separate tools.

**What the evidence says to double down on:**
1. **Phase-level scheduling** — creative work is planned concept → design →
   production; generic tools force task-level assignment first. Huddle's
   person × phase timeline matches how studios think (supported: Adobe's
   creative-resourcing framing + verified prerequisite complaints).
2. **Correct capacity math** — per-day capacity, PTO/half-days on the board,
   logged-vs-estimated awareness. The #1 verified complaint about generic
   tools; table stakes in the dedicated cluster; a checklist for our board.
3. **Schedule-derived billing** — the billing timeline deriving from scheduled
   phases is the thing neither cluster does at our price. Streamtime is the
   only comparable loop and it's now opaquely priced.
4. **Transparent, simple pricing** — one price, workload/billing NOT
   tier-gated; consider Float-style per-scheduled-person or a flat small-studio
   band. Category-wide resentment to exploit.
5. **Unscheduled/tentative work** — placeholders and a "taskbox" for
   pipeline/unconfirmed projects (verified gap in monday; Float sells
   placeholders as premium).

**What the evidence says to de-prioritize:** AI marketing (users don't ask for
it — keep the proposal reader as a delight, not the pitch), CRM/client
portals, deep custom reporting (complaints show people want *correct simple*
numbers, not report builders).

**Threats:** Float is moving down into project financials from above and owns
the interaction-quality bar (G2 #1, 2,000+ reviews); Streamtime owns the
closest positioning with a beloved product (4.7/5) — our wedge vs. them is
transparent pricing + real tasks + schedule zoom + self-serve. Huddle's
current weaknesses (no realtime, no mobile, desktop-only, performance
unproven) sit exactly on the cluster's universal complaint list — we'd be
entering with the same known flaws unless the rebuild addresses them.

## 7. Implications for Huddle's UX (starting points — to finalize with the
target-user definition)

1. The Schedule board is the product. Float-level interaction polish there
   beats feature breadth everywhere else.
2. Capacity correctness checklist for the board: per-person hours/day,
   part-day leave, PTO visible, logged-vs-planned fill (we have this),
   placeholders for unstaffed work (we don't).
3. Zoom fluidity matters (Toggl's W/M/Q/A keyboard zoom is the documented
   best; our current two-button zoom is far from it).
4. Billing timeline is the differentiator screen — it should feel like the
   payoff of the schedule, not a separate ledger.
5. Setup-to-first-value must stay under 30 minutes self-serve — it's the
   single clearest unclaimed position in the market.
6. Mobile: the whole market is weak here. Even a read-only responsive
   schedule + timer would exceed the category norm.
7. Per the evidence, cut/demote: CRM-ish ambitions, report builders,
   permanent feedback beg-box. Keep AI proposal-reader as onboarding magic
   (it collapses setup time — which IS a validated need — rather than as an
   "AI feature").
