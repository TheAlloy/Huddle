// Starts a Stripe Checkout (subscription) for a specific price the studio picked.
// Works for paid, 1p, or £0 plans — a payment method is always collected so
// "Manage billing" works afterwards.
// Requires: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { orgId, priceId, accessToken } = req.body || {};
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: "Billing is not connected yet (no Stripe key set)." });
  if (!orgId || !priceId) return res.status(400).json({ error: "Missing plan details." });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Only an owner/admin of this org may start a subscription.
  const { data: userInfo } = await admin.auth.getUser(accessToken);
  if (!userInfo?.user) return res.status(401).json({ error: "Not signed in." });
  const { data: mem } = await admin.from("memberships").select("role").eq("org_id", orgId).eq("user_id", userInfo.user.id).maybeSingle();
  if (!mem || !["owner", "admin"].includes(mem.role)) return res.status(403).json({ error: "Only owners and admins can manage billing." });

  const { data: org } = await admin.from("organizations").select("stripe_customer_id,name").eq("id", orgId).single();

  // Look up the price so we can label the plan and read seats + trial length.
  let planName = "", seats = "", trialDays = 0;
  try {
    const pr = await fetch(`https://api.stripe.com/v1/prices/${priceId}?expand[]=product`, { headers: { Authorization: `Bearer ${secret}` } });
    const pj = await pr.json();
    if (pr.ok) {
      planName = pj.product?.name || "";
      seats = pj.metadata?.seats || pj.product?.metadata?.seats || "";
      trialDays = parseInt(pj.metadata?.trial_days || pj.product?.metadata?.trial_days || "0", 10) || 0;
    }
  } catch (_) {}

  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("payment_method_collection", "always"); // capture a card even during a trial or on £0/1p plans
  if (trialDays > 0) params.set("subscription_data[trial_period_days]", String(trialDays)); // free trial, then auto-charge
  params.set("client_reference_id", orgId);
  params.set("metadata[org_id]", orgId);
  params.set("metadata[price_id]", priceId);
  if (planName) params.set("metadata[plan]", planName);
  if (seats) params.set("metadata[seats]", String(seats));
  params.set("subscription_data[metadata][org_id]", orgId);
  params.set("subscription_data[metadata][price_id]", priceId);
  if (planName) params.set("subscription_data[metadata][plan]", planName);
  params.set("allow_promotion_codes", "true");
  params.set("success_url", `${appUrl}/?billing=success`);
  params.set("cancel_url", `${appUrl}/?billing=cancelled`);
  if (org?.stripe_customer_id) params.set("customer", org.stripe_customer_id);
  else if (userInfo.user.email) params.set("customer_email", userInfo.user.email);

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const body = await r.json();
  if (!r.ok) return res.status(500).json({ error: body.error?.message || "Stripe error" });
  return res.status(200).json({ url: body.url });
}
