# Technical brief — Huddle platform

*August 2026. Inputs: [ux-brief.md](research/ux-brief.md),
[target-users.md](research/target-users.md), and the current codebase. This
brief aims the technical rebuild the way the UX brief aims the frontend one:
it records the stack and structure we're building toward so work can be
planned against it. Status: draft for review.*

## Principles

1. **The client owns the interaction.** Nothing in a drag, a zoom, an undo or
   a time-log confirmation should wait on a network round trip. Smoothness is
   a property of *not asking a server*, so state the user manipulates lives in
   memory on the client and syncs behind them.
2. **One dataset, many lenses.** A studio's working set (people, projects,
   phases, assignments, time logs) is small — tens to low thousands of rows at
   our design center. Load it once, keep it live, and let Schedule, Summary
   and Billing render from the same normalized store. Same numbers, three
   lenses ([ux-brief.md](research/ux-brief.md) §Projects & Clients).
3. **The database is the security boundary.** RLS in `schema.sql` decides what
   a user can read and write. Frontend permission checks are cosmetic; they
   shape UI, they don't protect data.
4. **Demo mode is the development substrate.** Today it's how changes get
   exercised without pushing to main or the live product, and how each rebuild
   step gets verified ([ux-brief.md](research/ux-brief.md) §Rebuild order). It
   works because the app runs with no backend at all — preserving that means
   exactly one place swaps real data for fake. (The UX brief plans a
   user-facing "try the demo studio" onboarding path on top of it; if that
   ships, this constraint gets stricter, not looser.)
5. **The marketing surface and the app are different products.** Different
   audiences, different cadences, different performance profiles. They share a
   domain and a brand, not a deployment.

## Shape

Three independently deployed pieces behind one domain:

| Piece | What it is | Deploys as |
|---|---|---|
| **App** | The logged-in product | Static SPA on CDN |
| **Marketing** | Landing, pricing, content, ad destinations | Static/SSG site |
| **API** | Privileged operations (`api/`) | Serverless functions |

## App stack

- **Vite + React + TypeScript.** Types are load-bearing here, not hygiene:
  permission keys and role presets are defined twice on purpose
  (`src/lib/permissions.js` and `app_has()` / role presets in `schema.sql`).
  Typing the permission surface turns silent drift between those two into a
  build error.
- **TanStack Router.** (decision) Chosen over the alternatives for typed,
  validated search params — the UX brief requires "every tab, project, person
  **and date range** linkable", and date-range and filter state in the URL is
  the case that gets messy without schema-validated params.
- **TanStack Query** as the cache and mutation layer, with Supabase realtime
  events patching the cache. Gives optimistic updates with rollback, which is
  what the undo-toast requirement on drag operations actually needs.
- **Tailwind as a build dependency**, with design tokens defined once. Removes
  the CDN script and the triple-defined color/type constants.
- **Vitest + Playwright**, aimed first at the tenancy boundary (see Testing).

## Data architecture

The direction is a client-owned store that syncs, rather than per-screen
fetching:

1. **Normalized in-memory store.** One entity graph per active org, not a
   result set per screen. Screens select from it; they don't own fetches.
2. **Optimistic mutations with rollback.** The UI applies the change, the
   mutation goes out behind it, failure reverts and surfaces a toast. This is
   the mechanism behind drag confidence and one-tap day confirmation.
3. **Realtime patches.** Supabase channels on `assignments` and `time_logs`
   feed the same store, so two producers on one board see each other and the
   stale-board problem goes away. Server-side timer state lands here too.
4. **Local persistence.** (decision — later, not first cycle.) Once the store
   is normalized and sync is patch-based, persisting it to IndexedDB for
   instant cold starts and offline resilience is an additive step. Worth
   designing *toward*; not worth building yet.

Today's `loadOrgData()` one-shot is a rough version of step 1 — the rebuild
formalizes it rather than replacing the idea.

**Demo mode** ([src/lib/demo.js](../src/lib/demo.js)) swaps in at the data
layer, below the store and above Supabase. Because the app is client-only it
runs with no server at all — which is what lets us exercise changes in
isolation today, and what would make a public demo cheap later.

Keeping that single swap point is a constraint on every data-layer change: a
data path that only works against real Supabase is a path that can't be
tested without deploying. In practice this means the store talks to a data
interface, and Supabase and the in-memory fake are two implementations of it.

## API layer

`api/` stays as-is structurally: Vercel serverless functions, the only place
`SUPABASE_SERVICE_ROLE_KEY` is used. Each handler verifies the caller's token
via `admin.auth.getUser()` and then checks membership/role/permissions itself
before acting — `api/invite.js` is the reference pattern. As this surface
grows (proposal reader, Stripe, exports), the auth preamble should become one
shared helper rather than nine hand-rolled copies.

The service-role key and this pattern must never appear in `src/`.

## Marketing site

SEO-led growth plus paid acquisition is a launch priority, so this is a real
build, not a placeholder page.

- **Separate project, separate deployment.** Copy changes must not redeploy
  the app, and the two have opposite performance goals.
- **(decision — open) Astro or Next.js.** Astro is the lean if the surface
  stays content: it ships zero JS by default, which feeds Core Web Vitals,
  which feeds both organic ranking and paid landing-page quality. Next is the
  safer pick if we expect interactive or gated content (live product demos,
  logged-in content, a customer dashboard). Decide when the content plan is
  scoped.
- Needs from day one: sitemap, structured data, per-page metadata, fast LCP on
  ad destinations, and a story for landing-page variants.

## Domain routing

One brand domain, three deployments, stitched with Vercel rewrites:

```
huddle.com/          → marketing (root, /pricing, /features, /blog/*)
huddle.com/app/*     → app SPA
huddle.com/api/*     → serverless functions
```

The marketing project owns the domain and rewrites `/app/:path*` through to
the app deployment. Rewrites match first-to-last, so specific rules sit above
general ones. The SPA needs `base: '/app/'` in its Vite config and a matching
router basename — that's the whole integration cost.

**(decision) Reserved `/app/` prefix, not root-level org slugs.** Letting org
slugs occupy root paths means maintaining a reserved-words list forever so
`/pricing` can never be a customer's slug. Not worth the collision risk.

`/app/*` must be `noindex` — it's behind auth and would only add crawl noise.

## Desktop wrapper

Stays thin: `desktop/main.js` loads the deployed URL, so web deploys ship to
desktop with no release. The always-on-top timer is a genuine differentiator
([ux-brief.md](research/ux-brief.md) §Tracker), and server-side timer state
plus realtime makes it stronger.

Because the app builds to static files, bundling it *inside* the Electron
package stays available if we later want instant launch or offline resilience
for the timer. Nothing in this brief should close that door.

## Testing

There are no tests today. Demo mode is the natural fixture for most of what
follows — deterministic seed data, no network, fast enough to run per commit —
so the work is less "build a test harness" than "point one at the surface we
already develop against."

The first tests to write are not unit tests:

1. **Tenancy.** Can a member of org A read org B's `assignments`,
   `time_logs`, `billing_entries`? This is the test suite a multi-tenant
   product cannot ship without, and nothing currently proves it.
2. **Permission presets.** Each role gets what `schema.sql` says it gets, from
   both sides of the double definition.
3. **The maker loop**, end to end in demo mode: see schedule → confirm day →
   time logged. Principle 2 of the UX brief, protected by a Playwright run.

## Sequencing

Maps onto the UX brief's rebuild order rather than competing with it.

- **Before step 1:** TypeScript in place, Tailwind build + tokens, test
  harness scaffolded. These are cheapest before the rebuild, not after.
- **Step 1 (Foundations):** router and URL schema, app shell, normalized store
  + query layer, dialog/toast system.
- **Step 2 (Schedule):** realtime channels, optimistic mutations, undo, row
  virtualization.
- **Step 3 (My Week + Tracker):** server-side timer state on the same sync
  path.
- **Steps 4–6:** screens migrate onto the store; no further structural work
  expected.
- **Marketing site:** independent track, can start any time, blocks nothing in
  the app rebuild. Should be live before launch, obviously.

## What this rules out

- Server-rendering the app, or per-route server data fetching — both fight the
  client-owned store that principles 1 and 2 depend on.
- A second demo-mode implementation. One swap point, at the data layer.
- Any privileged operation outside `api/`, and any service-role key in `src/`.
- Local persistence in the first cycle (designed toward, not built).

## Open questions

- Marketing framework (Astro vs Next) — pending the content plan.
- Whether the app repo and marketing repo are one monorepo or two. Low stakes
  either way; deployments stay separate regardless.
- When local persistence becomes worth it — likely driven by cold-start
  complaints or a genuine offline ask, not by a date.
- **Demo mode's long-term shape.** A hand-written in-memory backend
  (`demo.js`) is right if the user-facing "try the demo studio" tour ships —
  it's a real product surface then. If demo mode stays internal, request-level
  mocking (e.g. MSW intercepting Supabase calls) is likely the better shape:
  tests exercise the real data paths instead of a parallel implementation that
  can drift from them. Decide when the onboarding tour is scoped; either way
  the single-swap-point constraint above holds.
