// Owner-only account actions:
//   action: "transfer" — hand ownership to another member, then remove the current owner (they leave).
//   action: "delete"   — permanently delete the studio and ALL its data, cancel Stripe, and notify the vendor.
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: STRIPE_SECRET_KEY, RESEND_API_KEY, DELETE_TO/INVITE_FROM.
import { createClient } from "@supabase/supabase-js";

async function notify({ orgName, orgId, email, action }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const to = process.env.DELETE_TO || process.env.FEEDBACK_TO || "hello@thealloy.com";
  const from = process.env.INVITE_FROM || "Huddle <hello@thealloy.com>";
  const text = `Account ${action}\n\nStudio: ${orgName}\nOrg ID: ${orgId}\nBy: ${email}\nWhen: ${new Date().toISOString()}`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `Huddle — account ${action}: ${orgName}`, text }),
    });
  } catch (_) {}
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { orgId, accessToken, action = "delete", newOwnerId } = req.body || {};
  if (!orgId || !accessToken) return res.status(400).json({ error: "Missing orgId or accessToken." });

  const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return res.status(500).json({ error: "Server not configured." });
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: userInfo, error: authErr } = await admin.auth.getUser(accessToken);
  if (authErr || !userInfo?.user) return res.status(401).json({ error: "Not signed in." });

  const { data: mem } = await admin.from("memberships").select("id, role").eq("org_id", orgId).eq("user_id", userInfo.user.id).maybeSingle();
  if (!mem || mem.role !== "owner") return res.status(403).json({ error: "Only the owner can do this." });

  const { data: org } = await admin.from("organizations").select("name, stripe_subscription_id").eq("id", orgId).maybeSingle();
  const orgName = org?.name || orgId;
  const email = userInfo.user.email || "unknown";

  // ---- Transfer ownership: promote the chosen member, remove the current owner ----
  if (action === "transfer") {
    if (!newOwnerId) return res.status(400).json({ error: "Pick who should become the owner." });
    const { data: target } = await admin.from("memberships").select("id, user_id").eq("org_id", orgId).eq("id", newOwnerId).maybeSingle();
    if (!target || target.user_id === userInfo.user.id) return res.status(400).json({ error: "Choose a different team member." });
    const { error: e1 } = await admin.from("memberships").update({ role: "owner" }).eq("id", newOwnerId);
    if (e1) return res.status(500).json({ error: e1.message });
    await admin.from("memberships").delete().eq("id", mem.id); // the old owner leaves
    await notify({ orgName, orgId, email, action: "ownership transferred" });
    return res.status(200).json({ ok: true, transferred: true });
  }

  // ---- Delete the whole studio ----
  // Best-effort: cancel the Stripe subscription so they're not billed further.
  if (org?.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
    try {
      await fetch(`https://api.stripe.com/v1/subscriptions/${org.stripe_subscription_id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      });
    } catch (_) {}
  }

  // Delete children first, then the org. Wrapped individually so a missing table can't abort the rest.
  const tables = ["assignments", "time_logs", "tasks", "billing_entries", "public_holidays", "invites", "feedback", "projects", "clients", "memberships"];
  for (const t of tables) {
    try { await admin.from(t).delete().eq("org_id", orgId); } catch (_) {}
  }
  const { error: delErr } = await admin.from("organizations").delete().eq("id", orgId);
  if (delErr) return res.status(500).json({ error: delErr.message });

  await notify({ orgName, orgId, email, action: "deleted" });
  return res.status(200).json({ ok: true, deleted: true });
}
