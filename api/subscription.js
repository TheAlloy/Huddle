// Returns the org's current live subscription (price id + status) from Stripe,
// resolving/back-filling the customer if we didn't save it. Used to highlight
// the current plan and to make Manage billing reliable.
// Requires: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";

async function sGet(path, secret) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${secret}` } });
  return { ok: r.ok, body: await r.json() };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { orgId, accessToken } = req.body || {};
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return res.status(200).json({ configured: false });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: userInfo } = await admin.auth.getUser(accessToken);
  if (!userInfo?.user) return res.status(401).json({ error: "Not signed in." });
  const { data: mem } = await admin.from("memberships").select("role").eq("org_id", orgId).eq("user_id", userInfo.user.id).maybeSingle();
  if (!mem) return res.status(403).json({ error: "Not a member." });

  // Free internal users (e.g. your own staff) bypass billing entirely.
  const FREE_DOMAINS = (process.env.FREE_DOMAINS || "thealloy.com").split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
  const emailDomain = (userInfo.user.email || "").split("@")[1]?.toLowerCase();
  if (emailDomain && FREE_DOMAINS.includes(emailDomain)) {
    return res.status(200).json({ configured: true, free: true, hasSubscription: false });
  }

  const { data: org } = await admin.from("organizations").select("stripe_customer_id,stripe_subscription_id,settings").eq("id", orgId).single();

  let customer = org?.stripe_customer_id || null;
  if (!customer && userInfo.user.email) {
    const cs = await sGet(`customers?email=${encodeURIComponent(userInfo.user.email)}&limit=1`, secret);
    if (cs.ok && cs.body.data?.[0]) customer = cs.body.data[0].id;
  }

  // find the active-ish subscription
  let sub = null;
  if (org?.stripe_subscription_id) {
    const r = await sGet(`subscriptions/${org.stripe_subscription_id}`, secret);
    if (r.ok && r.body.id) sub = r.body;
  }
  if (!sub && customer) {
    const r = await sGet(`subscriptions?customer=${customer}&status=all&limit=10`, secret);
    if (r.ok && r.body.data?.length) {
      const rank = { active: 0, trialing: 1, past_due: 2, unpaid: 3, canceled: 9 };
      sub = r.body.data.slice().sort((a, b) => (rank[a.status] ?? 5) - (rank[b.status] ?? 5))[0];
    }
  }
  if (!sub) return res.status(200).json({ configured: true, hasSubscription: false, customerId: customer || null });

  const priceId = sub.items?.data?.[0]?.price?.id || null;
  const status = sub.status;

  // Read the plan's seat limit from Stripe (price or product metadata) so seats are authoritative even without a webhook.
  let seats = null; // null = unlimited
  if (priceId) {
    try {
      const pr = await fetch(`https://api.stripe.com/v1/prices/${priceId}?expand[]=product`, { headers: { Authorization: `Bearer ${secret}` } });
      const pj = await pr.json();
      if (pr.ok) {
        const raw = pj.metadata?.seats ?? pj.product?.metadata?.seats;
        const n = raw != null ? parseInt(raw, 10) : NaN;
        seats = Number.isFinite(n) && n > 0 ? n : null;
      }
    } catch (_) {}
  }
  const seatsForDb = seats == null ? 999999 : seats;

  // back-fill our record so Manage billing, the highlight, and seat limits keep working
  const patch = {};
  if (customer && customer !== org?.stripe_customer_id) patch.stripe_customer_id = customer;
  if (sub.id && sub.id !== org?.stripe_subscription_id) patch.stripe_subscription_id = sub.id;
  if (priceId && org?.settings?.stripe_price_id !== priceId) patch.settings = { ...(org?.settings || {}), stripe_price_id: priceId };
  if (org?.seats !== seatsForDb) patch.seats = seatsForDb;
  if (Object.keys(patch).length) await admin.from("organizations").update(patch).eq("id", orgId);

  return res.status(200).json({ configured: true, hasSubscription: true, priceId, status, seats, customerId: customer, cancelAtPeriodEnd: !!sub.cancel_at_period_end, trialEnd: sub.trial_end || null, currentPeriodEnd: sub.current_period_end || null });
}
