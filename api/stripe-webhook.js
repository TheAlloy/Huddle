// Keeps each studio's plan/status in step with Stripe.
// Point a Stripe webhook at /api/stripe-webhook for:
//   checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
// Requires: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (the endpoint's signing
// secret from the Stripe dashboard), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Signature verification needs the exact bytes Stripe signed, so body
// parsing is off and we read the raw request stream ourselves.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Verify Stripe's "stripe-signature: t=...,v1=..." header (HMAC-SHA256 of
// "<timestamp>.<raw body>" with the endpoint's signing secret).
function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!header) return false;
  let timestamp = null; const signatures = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") timestamp = v;
    else if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

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

  // Never act on an event we can't prove came from Stripe.
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signingSecret) return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET is not set — refusing to process webhooks." });
  const rawBody = await readRawBody(req);
  if (!verifyStripeSignature(rawBody, req.headers["stripe-signature"], signingSecret)) {
    return res.status(400).json({ error: "Invalid webhook signature." });
  }
  let event;
  try { event = JSON.parse(rawBody.toString("utf8")); }
  catch (_) { return res.status(400).json({ error: "Invalid JSON." }); }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
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
