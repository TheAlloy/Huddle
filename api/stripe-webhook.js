// Keeps each studio's plan/status in step with Stripe.
// Point a Stripe webhook at /api/stripe-webhook for:
//   checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
// Requires: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: true } };

const PLAN_BY_PRICE = {
  [process.env.STRIPE_PRICE_STARTER || "_s"]: "starter",
  [process.env.STRIPE_PRICE_STUDIO || "_t"]: "studio",
  [process.env.STRIPE_PRICE_ENTERPRISE || "_e"]: "enterprise",
};
const PLAN_SEATS = { trial: 5, starter: 5, studio: 20, enterprise: 100 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
  const event = req.body;
  try {
    const obj = event?.data?.object || {};
    const orgId = obj.metadata?.org_id || obj.client_reference_id;
    if (!orgId) return res.status(200).json({ ignored: true });

    if (event.type === "checkout.session.completed") {
      const plan = obj.metadata?.plan || "starter";
      const seats = Number(obj.metadata?.seats) || PLAN_SEATS[plan] || 5;
      await admin.from("organizations").update({
        stripe_customer_id: obj.customer, stripe_subscription_id: obj.subscription,
        status: "active", plan, seats,
      }).eq("id", orgId);
    }
    if (event.type === "customer.subscription.updated") {
      const priceId = obj.items?.data?.[0]?.price?.id;
      const status = obj.status === "active" || obj.status === "trialing" ? "active"
        : obj.status === "past_due" ? "past_due" : "suspended";
      const patch = { status };
      const mappedPlan = PLAN_BY_PRICE[priceId];
      if (mappedPlan) patch.plan = mappedPlan;
      const qty = obj.items?.data?.[0]?.quantity;
      if (qty && qty > 1) patch.seats = qty;
      else if (mappedPlan) patch.seats = PLAN_SEATS[mappedPlan] || 5;
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
