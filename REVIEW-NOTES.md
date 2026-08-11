# Repo review notes — August 2026

A hygiene review of the repository as cloned from `main`. All changes live on the
`review/repo-cleanup` branch; `main` is untouched. Each change is a separate commit so
any of them can be dropped before merging.

## Changes made on this branch

1. **Added `.gitignore`** (previously only existed locally, never committed).
   Ignores `node_modules/`, build output, `.env` files, and machine-local Claude Code
   settings (`.claude/settings.local.json`).

2. **Rewrote `README.md`.** The old one was a handoff note from before the product was
   renamed from Cadence to Huddle, addressed to the previous owner and containing a
   personal email in an example. All setup instructions were kept and updated; added a
   stack overview and local development section.

3. **Added `CLAUDE.md`** — architecture and convention notes for AI-assisted
   development (also a decent quick orientation for humans).

4. **Pinned the desktop build.** `desktop/` had no lockfile and CI ran plain
   `npm install`, so each installer build resolved dependency versions fresh. Added
   `desktop/package-lock.json`, switched the workflow to `npm ci`, and enabled npm
   caching.

5. **Deleted the `cadence/` folder** (44 files). It was a complete stale duplicate of
   the app (source, API functions, desktop wrapper, schema) left over from uploading
   folders through the GitHub web UI. The root copy is newer and has screens and
   migrations the duplicate lacked. It was the biggest risk in the repo — someone
   editing the wrong copy — and remains recoverable from git history.

## Security fixes (from the follow-up audit)

6. **Membership privilege escalation closed.** The old `mem_write` RLS policy let
   any user write their own membership row unrestricted — including setting their own
   `role` to owner, or inserting themselves into another studio by id. Now: inserts
   require `team.manage`; a trigger blocks role/permission/status changes by anyone
   without `team.manage` (and always on their own row); only owners can grant the
   owner role. Ships as `migrations/2026-08-membership-write-guard.sql` — **run it in
   the Supabase SQL editor** — and is folded into `schema.sql`.

7. **Stripe webhook signature verification.** `api/stripe-webhook.js` previously
   trusted any POSTed event (forgeable subscriptions/cancellations). It now verifies
   the `stripe-signature` header against the raw body and fails closed. **Add
   `STRIPE_WEBHOOK_SECRET` to Vercel** (the endpoint's signing secret from the
   Stripe dashboard) when Stripe goes live.

8. **Open endpoints authenticated.** `api/extract.js` (spent Anthropic credits,
   no auth) and `api/feedback.js` (spent Resend credits, no auth + HTML injection
   into the notification email) now verify the caller's token and membership,
   mirroring `api/invite.js`.

## Observations (no action taken)

- **No secrets are committed.** Supabase/Stripe keys all come from environment
  variables; a sweep for hardcoded keys and URLs found nothing. Good.
- **`node_modules/` and `dist/` were never tracked** despite the missing .gitignore.
- **Dependency audit:**
  - Root app: 2 advisories (1 moderate, 1 high), both in dev tooling
    (esbuild/Vite dev server). Not in shipped code. Fix is a major Vite upgrade —
    worth doing at some point, not urgent.
  - Desktop: 9 advisories (8 high, 1 critical), all in `tar` via `electron-builder`
    — build-time tooling only, nothing shipped to users. Fix is
    `electron-builder@26` (breaking change to the build config). Electron itself
    (`^31`) is also a couple of major versions behind; upgrading is routine but
    should be tested.
- **All prior history is "Add files via upload"** — the repo was maintained through
  the GitHub web uploader, which explains the duplicate folder and missing
  .gitignore. Normal git workflow going forward avoids this.
- **Git commit identity on this machine is auto-guessed.** Before merging/pushing,
  set it explicitly:
  `git config --global user.name "Your Name"` and
  `git config --global user.email "you@thealloy.com"`.
- The README's pre-launch checklist still applies before charging customers:
  legal documents, Supabase backups/PITR, error monitoring, code-signing
  certificates, and a production SMTP provider.
