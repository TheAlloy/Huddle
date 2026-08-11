# Huddle

Multi-tenant studio scheduling and time-tracking SaaS. Studios sign up, get their own
private workspace, invite their team by email, and each person gets exactly the access
they're given. A platform admin console manages every subscriber.

> The product name appears once in the frontend, in `src/App.jsx` (`const PRODUCT = "Huddle"`).

## Stack

- **Frontend** — React 18 + Vite, single-page app in `src/` (screens in `src/screens/`)
- **Backend** — Supabase (Postgres + Auth + Row Level Security); schema in `schema.sql`,
  incremental changes in `migrations/`
- **API** — Vercel serverless functions in `api/` (invites, Stripe billing, webhooks)
- **Desktop** — Electron wrapper in `desktop/` that loads the deployed web app;
  installers built by the GitHub Actions workflow

## What's built and working

**Accounts & security**
- Sign-up / sign-in / password reset (Supabase Auth).
- Every customer studio is a separate organization, isolated at the database level via
  Row Level Security — the database refuses to return one studio's data to another,
  not just the app.
- A user can belong to several studios and switch between them.

**Onboarding** — 3-step first-run wizard: name your studio → invite your team → add a
first client/project.

**Team & permissions**
- Invite by email; pending invites can be resent or revoked; seat limits enforced.
- 7 role presets: Owner, Administrator, Manager, Finance, Team member,
  Time-tracking only, Viewer.
- 15 granular permissions on top of roles (schedule, summaries, hours, tasks,
  projects, clients, billing, team, invites, company settings).
- Permissions are enforced twice: the UI hides what you can't use, and the database
  blocks it even if someone bypasses the app.
- Members can be suspended without being deleted.

**Platform admin console** (platform admins only)
- Every subscriber studio: member counts, seats, plan, status, sign-up date.
- Change any studio's plan/seats, or suspend a studio.
- Live totals: studios, active, on trial, monthly revenue.

**Subscriptions**
- Organizations carry plan, status, seats, trial end date, and Stripe IDs.
- Stripe customer portal + webhook wiring in `api/billing-portal.js` and
  `api/stripe-webhook.js` — add Stripe keys and price IDs to switch it on.

**Desktop app** — Electron wrapper pointing at the deployed app, with a GitHub Actions
build workflow for Windows/macOS/Linux installers.

## Local development

```bash
npm install
npm run dev
```

Create a `.env` file (not committed) with:

```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Without these the app boots to a "not configured" state.

## Deployment setup

### 1. Supabase project
1. supabase.com → **New project** (choose the London region for UK data).
2. **SQL Editor** → paste all of `schema.sql` → **Run**, then run each file in
   `migrations/` in date order.
3. **Authentication → Providers → Email**: enable it. Turn on "Confirm email".
4. **Authentication → URL Configuration**: set Site URL to your app address, and add
   `https://your-app.vercel.app/**` to Redirect URLs.
5. **Project Settings → API**: copy the **Project URL**, the **anon key**, and the
   **service_role key** (the service_role key is secret — server only, never in the
   browser).

### 2. Vercel
1. Vercel → **Add New Project** → import this repo → Deploy.
2. Vercel → Settings → **Environment Variables**:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = anon key
   - `SUPABASE_URL` = same project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key
   - `APP_URL` = your Vercel address
   - (later) `STRIPE_SECRET_KEY`
3. Redeploy.

### 3. Make yourself the platform admin
Sign up once in the app, then in the Supabase SQL Editor:
```sql
update profiles set platform_admin = true where email = 'you@example.com';
```
Refresh — the **Admin** button appears in the header.

### 4. Test it end to end
1. Sign up with a second email → onboarding wizard → create a test studio.
2. Invite a third address as "Time tracking only" → open the emailed link → confirm
   that account can only see the tracker.
3. In the Admin console, confirm both studios appear and neither can see the other's
   data.

### 5. Stripe (when ready to charge)
1. Create products/prices in Stripe; put the price IDs into `PLAN_BY_PRICE` in
   `api/stripe-webhook.js`.
2. Add a webhook endpoint pointing at `https://your-app.vercel.app/api/stripe-webhook`
   for `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`.
3. Add `STRIPE_SECRET_KEY` **and** `STRIPE_WEBHOOK_SECRET` (the endpoint's signing
   secret, shown when you create the webhook) to Vercel. The webhook refuses all
   events until the signing secret is set. Pass `org_id` as `client_reference_id` when
   creating a Checkout session so the webhook knows which studio paid.

### 6. Desktop installers
The app URL lives in `desktop/main.js` (`APP_URL`, overridable via the `HUDDLE_URL`
env var). GitHub → **Actions** → "Build desktop installers" → Run, then download the
`.exe` / `.dmg` / `.AppImage` from Artifacts. Pushing a `v*` tag also attaches the
installers to a GitHub Release.

## Before charging real customers

- Terms of Service, Privacy Policy, and a Data Processing Agreement (written or
  reviewed by a solicitor).
- Supabase backups / point-in-time recovery switched on.
- Error monitoring.
- Code-signing certificates for the desktop installers.
- A production SMTP provider (Postmark, Resend, SES) connected in Supabase settings —
  the built-in mailer is rate-limited and only suitable for testing.
