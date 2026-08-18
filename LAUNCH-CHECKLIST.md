# Launch checklist

Two tasks that must be done before Huddle goes live. Neither blocks development —
both were deferred when the shadcn UI rebuild merged (18 Aug 2026) because they
need Vercel / Supabase account access. Tick them off here when done.

---

## 1. Apply the membership write guard — Supabase (do this first)

**Status:** ⬜ not applied

**Why it matters.** Any signed-in user can currently set their own membership
`role` to `owner` with a direct API call, or insert themselves into another
studio if they learn its id. The fix is committed
(`migrations/2026-08-membership-write-guard.sql`, folded into `schema.sql`) but
**a migration does nothing until it is run against the database** — deploying the
code does not apply it.

> ⚠️ This repository is public, so the migration file — which describes the
> vulnerability in detail — is world-readable. Treat the hole as publicly known
> and patch it before anyone other than the founders has an account.

**How.** Supabase → SQL Editor → paste the full contents of
`migrations/2026-08-membership-write-guard.sql` → Run.

**Verify.** This should return 4 rows (three policies + one trigger):

```sql
select policyname as object, 'policy' as kind from pg_policies
  where tablename = 'memberships' and policyname in ('mem_ins','mem_upd','mem_del')
union all
select tgname, 'trigger' from pg_trigger
  where tgname = 'trg_huddle_guard_membership_write';
```

If `mem_write` still appears in `pg_policies` for `memberships`, it did not apply.

**Then sanity-check the app.** On the People page: invite someone, change a
member's role, suspend a member. Self-service edits (display name, job title,
hours, teams) must still work for ordinary members.

---

## 2. Set `STRIPE_WEBHOOK_SECRET` — Vercel (before taking real payments)

**Status:** ⬜ not set

**Why it matters.** `api/stripe-webhook.js` verifies Stripe's signature before
trusting an event (previously any caller could POST fake subscription events).
It **fails closed**: with the variable unset it returns 500 for every event, so
`checkout.session.completed` never lands and plan/status stops syncing into the
database.

Low impact pre-launch — the subscription gate falls back to `/api/subscription`,
which checks Stripe live — but new subscriptions will not activate correctly
once real money is involved.

**How.** Vercel → project → Settings → Environment Variables → Add:

| Field | Value |
|---|---|
| Key | `STRIPE_WEBHOOK_SECRET` |
| Value | the endpoint's signing secret (`whsec_…`) from Stripe → Developers → Webhooks → your production endpoint |
| Sensitive | on |
| Environments | Production (Preview optional) |

Match the Stripe **mode**: Test and Live endpoints have different signing secrets.

Environment variables are baked in at build time, so **redeploy afterwards** —
Vercel → Deployments → latest → ⋯ → Redeploy.

**Verify.** Stripe → Developers → Webhooks → your endpoint → recent deliveries
should show 200s. Any events that failed while the variable was missing can be
replayed from that same page — nothing is lost.

---

## Related decisions worth making before launch

- **Repository visibility.** `TheAlloy/Huddle` is public: full schema, RLS
  policies and API logic are readable by anyone. That is a legitimate choice, but
  it means security fixes are disclosed the moment they are pushed.
- **Preview deployment protection.** Preview URLs currently require a Vercel
  account on the `alloy-studio` team. Disabling that makes previews publicly
  reachable — and previews talk to the *production* Supabase project, so treat it
  as another public front door rather than a private staging area.
