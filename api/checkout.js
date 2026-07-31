// Starts a Stripe Checkout (subscription) so a studio can subscribe to Cadence.
// Requires (Vercel env vars):
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL
//   STRIPE_PRICE_STARTER, STRIPE_PRICE_STUDIO, STRIPE_PRICE_ENTERPRISE  (Stripe price IDs)
import { createClient } from "@supabase/supabase-js";

// How many seats each plan grants (adjust to match your Stripe pricing).
const PLAN_SEATS = { starter: 5, studio: 20, enterprise: 100 };

function priceForPlan(plan) {
  return {
    starter: process.env.STRIPE_PRICE_STARTER,
    studio: process.env.STRIPE_PRICE_STUDIO,
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
  }[plan];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { orgId, plan, accessToken } = req.body || {};
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: "Billing is not connected yet (no Stripe key set)." });
  if (!orgId || !plan) return res.status(400).json({ error: "Missing details." });

  const priceId = priceForPlan(plan);
  if (!priceId) return res.status(400).json({ error: `No Stripe price is set for the ${plan} plan yet. Add STRIPE_PRICE_${plan.toUpperCase()} in Vercel.` });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Only an owner/admin of this org may start a subscription.
  const { data: userInfo } = await admin.auth.getUser(accessToken);
  if (!userInfo?.user) return res.status(401).json({ error: "Not signed in." });
  const { data: mem } = await admin.from("memberships").select("role").eq("org_id", orgId).eq("user_id", userInfo.user.id).maybeSingle();
  if (!mem || !["owner", "admin"].includes(mem.role)) return res.status(403).json({ error: "Only owners and admins can manage billing." });

  const { data: org } = await admin.from("organizations").select("stripe_customer_id,name").eq("id", orgId).single();
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const seats = PLAN_SEATS[plan] || 5;

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("client_reference_id", orgId);
  params.set("metadata[org_id]", orgId);
  params.set("metadata[plan]", plan);
  params.set("metadata[seats]", String(seats));
  params.set("subscription_data[metadata][org_id]", orgId);
  params.set("subscription_data[metadata][plan]", plan);
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
