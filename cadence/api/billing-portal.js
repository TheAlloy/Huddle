// Opens the Stripe customer portal so a studio can manage its own subscription.
// Resolves the Stripe customer even if it wasn't saved on our side yet
// (by stored id, then by subscription id, then by the signed-in user's email).
// Requires: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL
import { createClient } from "@supabase/supabase-js";

async function stripeGet(path, secret) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${secret}` } });
  return { ok: r.ok, body: await r.json() };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { orgId, accessToken } = req.body || {};
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: "Billing is not connected yet." });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: userInfo } = await admin.auth.getUser(accessToken);
  if (!userInfo?.user) return res.status(401).json({ error: "Not signed in." });
  const { data: mem } = await admin.from("memberships").select("role").eq("org_id", orgId).eq("user_id", userInfo.user.id).maybeSingle();
  if (!mem || !["owner", "admin"].includes(mem.role)) return res.status(403).json({ error: "Only owners and admins can manage billing." });

  const { data: org } = await admin.from("organizations").select("stripe_customer_id,stripe_subscription_id,name").eq("id", orgId).single();

  let customer = org?.stripe_customer_id || null;
  // 2) via the stored subscription
  if (!customer && org?.stripe_subscription_id) {
    const sub = await stripeGet(`subscriptions/${org.stripe_subscription_id}`, secret);
    if (sub.ok && sub.body.customer) customer = sub.body.customer;
  }
  // 3) via the signed-in user's email
  if (!customer && userInfo.user.email) {
    const cs = await stripeGet(`customers?email=${encodeURIComponent(userInfo.user.email)}&limit=1`, secret);
    if (cs.ok && cs.body.data && cs.body.data[0]) customer = cs.body.data[0].id;
  }
  if (!customer) return res.status(400).json({ error: "No billing account found yet — start a subscription first." });

  // back-fill so it's saved for next time
  if (customer !== org?.stripe_customer_id) await admin.from("organizations").update({ stripe_customer_id: customer }).eq("id", orgId);

  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const r = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ customer, return_url: appUrl }),
  });
  const body = await r.json();
  if (!r.ok) {
    const msg = body.error?.message || "Stripe error";
    const hint = /No configuration provided|default configuration/i.test(msg)
      ? " — activate the Customer Portal in Stripe: Settings → Billing → Customer portal → Save."
      : "";
    return res.status(500).json({ error: msg + hint });
  }
  return res.status(200).json({ url: body.url });
}
