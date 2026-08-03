// Keeps each studio's plan/status in step with Stripe.
// Point a Stripe webhook at /api/stripe-webhook for:
//   checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
// Requires: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: true } };

const UNLIMITED = 999999;
const seatsFor = (raw) => { const n = parseInt(raw, 10); return Number.isFinite(n) && n > 0 ? n : UNLIMITED; };

// Given a Stripe price id, fetch its product name + any seats metadata.
async function priceInfo(priceId) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!priceId || !secret) return {};
  try {
    const r = await fetch(`https://api.stripe.com/v1/prices/${priceId}?expand[]=product`, { headers: { Authorization: `Bearer ${secret}` } });
    const p = await r.json();
    if (!r.ok) return {};
    return { plan: p.product?.name || null, seats: p.metadata?.seats || p.product?.metadata?.seats || null };
  } catch (_) { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const event = req.body;
  try {
    const obj = event?.data?.object || {};
    const orgId = obj.metadata?.org_id || obj.client_reference_id;
    if (!orgId) return res.status(200).json({ ignored: true });

    // Merge helper — keeps existing settings jsonb and records the current price id.
    const mergeSettings = async (extra) => {
      const { data: cur } = await admin.from("organizations").select("settings").eq("id", orgId).single();
      return { ...(cur?.settings || {}), ...extra };
    };

    if (event.type === "checkout.session.completed") {
      const priceId = obj.metadata?.price_id || null;
      const patch = { stripe_customer_id: obj.customer, stripe_subscription_id: obj.subscription, status: "active" };
      if (obj.metadata?.plan) patch.plan = obj.metadata.plan;
      patch.seats = seatsFor(obj.metadata?.seats); // number, or "unlimited" fallback
      if (priceId) patch.settings = await mergeSettings({ stripe_price_id: priceId });
      await admin.from("organizations").update(patch).eq("id", orgId);
    }

    if (event.type === "customer.subscription.updated") {
      const priceId = obj.items?.data?.[0]?.price?.id || null;
      const status = obj.status === "active" || obj.status === "trialing" ? "active"
        : obj.status === "past_due" ? "past_due" : "suspended";
      const patch = { status };
      const info = await priceInfo(priceId);
      if (info.plan) patch.plan = info.plan;
      const qty = obj.items?.data?.[0]?.quantity;
      if (qty && qty > 1) patch.seats = qty;
      else patch.seats = seatsFor(info.seats);
      if (priceId) patch.settings = await mergeSettings({ stripe_price_id: priceId });
      await admin.from("organizations").update(patch).eq("id", orgId);
    }

    if (event.type === "customer.subscription.deleted") {
      await admin.from("organizations").update({ status: "cancelled" }).eq("id", orgId);
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
