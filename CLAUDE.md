# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Huddle — a multi-tenant SaaS for studio scheduling and time tracking. React SPA on
Vercel, Supabase (Postgres + Auth + RLS) as the backend, Vercel serverless functions
for privileged operations, and an Electron desktop wrapper that just loads the
deployed web app.

## Commands

```bash
npm run dev        # Vite dev server
npm run build      # production build to dist/
npm run preview    # serve the production build locally
```

Frontend needs a `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`;
without them the app boots to a "not configured" screen (`CONFIGURED` flag in
`src/lib/supabase.js`).

Desktop (from `desktop/`): `npm start` runs Electron locally, `npm run dist` builds
installers. CI equivalent is `.github/workflows/desktop-build.yml` (manual dispatch or
`v*` tags).

There are no tests and no linter. Screens are plain JSX; the shadcn/ui registry
components (`src/components/ui/*.tsx`) and `src/components/confirm.tsx` are
TypeScript. `npm run typecheck` runs `tsc --noEmit`; beyond that, changes are
verified by running the app.

**UI is stock shadcn/ui (base-nova style on Base UI, preset `b7Uc5YiUE`).**
`src/components/ui/` must stay registry-pristine — never edit those files; restyle
nothing. Screens pour content into the stock components (see
`docs/foundations-plan.md` for the pattern rules: one size tier per control row,
FieldGroup forms, popup Select with `items` map, ghost icon-sm row actions,
Badge/semantic tokens for status colors, data colors kept for clients/leave/avatars).

**No shims or wrapper components around shadcn components.** Always compose the
stock components directly at the call site, exactly as the shadcn docs show —
even when that repeats a few lines. Do not add convenience wrappers to `src/ui.jsx`,
`src/studio/core.jsx`, or anywhere else: wrappers hide which component is in play
and inevitably accumulate styling overrides. The legacy shims still in `ui.jsx`
(Field, Card, Modal, Pill, Empty, Spinner) and core.jsx (ModalShell/ModalHead/
ModalFoot) are scheduled for dissolution — inline their stock anatomy at call
sites when touching code that uses them, and never add new usages.

## Architecture

**Single-page app, no router.** `src/App.jsx` owns all top-level state (session,
profile, memberships, active org, current tab) and renders one screen from
`src/screens/` per tab. Org-scoped data is loaded in one shot by `loadOrgData()` in
`src/lib/api.js` and passed down; screens refresh by calling back into it.

**Multi-tenancy lives in the database.** Every business table carries `org_id` and is
protected by Row Level Security in `schema.sql`. The SQL helper functions
`app_is_member(org)`, `app_has(org, perm)`, and `app_is_platform_admin()` are the
security boundary; the frontend's permission checks are cosmetic on top of them.

**Permissions are defined twice, on purpose.** `src/lib/permissions.js` (permission
keys, role presets, `can()`) must stay in sync with `app_has()` and the role presets
in `schema.sql`. If you add or change a permission or role, change both files.
`Paywall`/plan gating and org suspension are likewise enforced in both layers.

**Serverless functions in `api/` are the only place the service-role key is used.**
They run with `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS), so each handler must do its
own auth: verify the caller's `accessToken` via `admin.auth.getUser()`, then check
membership/role/permissions manually before acting (see `api/invite.js` for the
pattern). Never let the service-role key or this pattern leak into `src/`.

**Schema changes are manual.** `schema.sql` is the canonical full schema for a fresh
Supabase project; `migrations/*.sql` are incremental changes run by hand in the
Supabase SQL editor, named `YYYY-MM-description.sql`. A change to the live database
needs a new migration file *and* the same change folded into `schema.sql`.

**Desktop wrapper is intentionally thin.** `desktop/main.js` loads the deployed URL
(`APP_URL`, overridable via `HUDDLE_URL`); shipping web changes requires no desktop
release. It has its own `package.json` and is built independently by CI.

## Conventions and gotchas

- The product name is defined once: `const PRODUCT = "Huddle"` in `src/App.jsx`.
- localStorage keys use the legacy `cadence_` prefix (e.g. `cadence_org` for the
  active org). Renaming them would silently reset users' state — leave them.
- `src/studio/core.jsx` holds shared constants (colors, leave types, working-day
  math) and date helpers used across screens; `src/ui.jsx` holds the shared UI
  primitives (`Btn`, `Avatar`, `Modal`, etc.). Reuse these rather than redefining.
- Supabase query errors for permission-gated tables (e.g. `billing_entries`) are
  expected for users without access; treat a denial as "no data", not a failure.
