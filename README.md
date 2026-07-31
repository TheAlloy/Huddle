# Cadence — the sellable product

This is a **new, separate project**. Your internal Studio Schedule is untouched and keeps
running exactly as it does today.

Cadence is the multi-customer version: studios sign up, get their own private workspace, invite
their team by email, and each person gets exactly the access you give them. You get a console to
manage every subscriber.

> **Rename it whenever you like** — the product name appears once, in `src/App.jsx`
> (`const PRODUCT = "Cadence"`).

---

## What's built and working now

**Accounts & security**
- Real sign-up / sign-in / password reset (Supabase Auth).
- **Every customer studio is a separate "organization"**, and *the database itself* refuses to
  return one studio's data to another — not just the app. This is the piece that makes it safe
  to sell.
- A user can belong to several studios and switch between them.

**Onboarding**
- 3-step first-run wizard: name your studio → invite your team → add a first client/project.

**Team & permissions**
- Invite by email; pending invites can be resent or revoked; seat limits enforced.
- 7 role presets: Owner, Administrator, Manager, Finance, Team member, Time-tracking only, Viewer.
- **15 granular permissions** on top of roles, exactly as you asked:
  see/edit schedule · see summaries · edit anyone's hours · track own time · manual upload ·
  see/edit tasks · manage projects · manage clients · see/edit billing · see team ·
  invite &amp; set permissions · company settings.
- Permissions are enforced **twice**: the UI hides what you can't use, and the database blocks
  it even if someone tries to bypass the app.
- Suspend a person without deleting them.

**Your management console** (visible only to you)
- Every subscriber studio, member counts, seats, plan, status, sign-up date.
- Change anyone's plan/seats, or suspend a studio that stops paying.
- Live totals: studios, active, on trial, monthly revenue.

**Subscriptions**
- Organizations carry plan, status, seats, trial end date, and Stripe IDs.
- Stripe customer portal + webhook wiring included (`api/billing-portal.js`,
  `api/stripe-webhook.js`) — add your Stripe keys and price IDs to switch it on.

**Desktop app** — the same Electron wrapper, pointing at Cadence, with the GitHub build workflow.

**Working screens today:** Auth, Onboarding, People/permissions, Clients &amp; Projects, Time
tracker, Settings/subscription, Admin console.

**Screens still to port from your internal tool:** Schedule board, Summary/calendar, Tasks board,
Billing plan. They're stubbed with permission gates already in place — this is the next chunk of
work, and it's feature-porting rather than new architecture.

---

## Setup — about 30 minutes

### 1. New Supabase project
1. supabase.com → **New project** (choose the London region for UK data).
2. **SQL Editor** → paste all of `schema.sql` → **Run**.
3. **Authentication → Providers → Email**: enable it. Turn on "Confirm email".
4. **Authentication → URL Configuration**: set Site URL to your app address (below), and add
   `https://your-app.vercel.app/**` to Redirect URLs.
5. **Project Settings → API**: copy the **Project URL**, the **anon key**, and the
   **service_role key** (the service_role key is secret — server only, never in the browser).

### 2. New GitHub repo + Vercel project
1. Create a new repo (e.g. `cadence`) and upload everything in this folder.
2. Vercel → **Add New Project** → import that repo → Deploy.
3. Vercel → Settings → **Environment Variables**:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = anon key
   - `SUPABASE_URL` = same project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key
   - `APP_URL` = your Vercel address
   - (later) `STRIPE_SECRET_KEY`
4. Redeploy.

### 3. Make yourself the platform admin
Sign up once in the app, then in Supabase SQL Editor:
```sql
update profiles set platform_admin = true where email = 'you@thealloy.com';
```
Refresh — the **Admin** button appears in the header.

### 4. Test it end to end
1. Sign up with a second email → you'll get the onboarding wizard → create a test studio.
2. Invite a third address as "Time tracking only" → open the emailed link → confirm that
   account can *only* see the tracker.
3. In your Admin console, confirm both studios appear and neither can see the other's data.

### 5. Stripe (when you're ready to charge)
1. Create products/prices in Stripe; put the price IDs into `PLAN_BY_PRICE` in
   `api/stripe-webhook.js`.
2. Add a webhook endpoint pointing at `https://your-app.vercel.app/api/stripe-webhook` for
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
3. Add `STRIPE_SECRET_KEY` to Vercel. Pass `org_id` as `client_reference_id` when you create a
   Checkout session so the webhook knows which studio paid.

### 6. Desktop installers
Edit the one URL line in `desktop/main.js`, then GitHub → **Actions** → "Build desktop
installers" → Run. Download the `.exe` / `.dmg` / `.AppImage` from Artifacts.

---

## Honest status

- **The foundation is real, not a mock**: accounts, org separation, invites, permissions
  (enforced in the database), the admin console and the subscription model all work.
- **The four big feature screens are stubs.** Porting the schedule, summary, tasks and billing
  from your internal tool is the next phase — a big job, but a mechanical one now the hard
  architecture is done.
- **Before charging real customers** you still need: Terms of Service, a Privacy Policy and a
  Data Processing Agreement (get these written/reviewed by a solicitor — I'm not a lawyer),
  Supabase backups/point-in-time recovery switched on, error monitoring, and code-signing
  certificates for the desktop installers.
- Email sending uses Supabase's built-in mailer, which is rate-limited and fine for testing.
  For production, connect a proper SMTP provider (Postmark, Resend, SES) in Supabase settings so
  invitations always arrive.
