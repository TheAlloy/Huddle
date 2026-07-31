// Lists the studio's real subscription plans straight from Stripe, so the app
// always shows exactly the products/prices you've set up (no hardcoded plans).
// Requires: STRIPE_SECRET_KEY

export default async function handler(req, res) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return res.status(200).json({ configured: false, plans: [] });

  try {
    const r = await fetch("https://api.stripe.com/v1/prices?active=true&limit=100&expand[]=data.product", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await r.json();
    if (!r.ok) return res.status(500).json({ configured: true, error: body.error?.message || "Stripe error", plans: [] });

    const plans = (body.data || [])
      .filter((p) => p.recurring && p.active && p.product && p.product.active !== false)
      .map((p) => ({
        priceId: p.id,
        name: p.product?.name || "Plan",
        description: p.product?.description || "",
        amount: p.unit_amount != null ? p.unit_amount / 100 : null, // in major units (e.g. pounds)
        currency: (p.currency || "gbp").toUpperCase(),
        interval: p.recurring?.interval || "month",
        seats: p.metadata?.seats ? Number(p.metadata.seats) : (p.product?.metadata?.seats ? Number(p.product.metadata.seats) : null),
        order: p.product?.metadata?.order ? Number(p.product.metadata.order) : (p.unit_amount || 0),
      }))
      .sort((a, b) => a.order - b.order);

    return res.status(200).json({ configured: true, plans });
  } catch (e) {
    return res.status(500).json({ configured: true, error: e.message, plans: [] });
  }
}
