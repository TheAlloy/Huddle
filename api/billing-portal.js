// Opens the Stripe customer portal so a studio can manage its own subscription.
// Requires: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { orgId, accessToken } = req.body || {};
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: "Billing is not connected yet." });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
  const { data: userInfo } = await admin.auth.getUser(accessToken);
  if (!userInfo?.user) return res.status(401).json({ error: "Not signed in." });
  const { data: mem } = await admin.from("memberships").select("role").eq("org_id", orgId).eq("user_id", userInfo.user.id).maybeSingle();
  if (!mem || !["owner","admin"].includes(mem.role)) return res.status(403).json({ error: "Only owners can manage billing." });

  const { data: org } = await admin.from("organizations").select("stripe_customer_id,name").eq("id", orgId).single();
  if (!org?.stripe_customer_id) return res.status(400).json({ error: "No billing account yet — start a subscription first." });

  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const r = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ customer: org.stripe_customer_id, return_url: appUrl }),
  });
  const body = await r.json();
  if (!r.ok) return res.status(500).json({ error: body.error?.message || "Stripe error" });
  return res.status(200).json({ url: body.url });
}
