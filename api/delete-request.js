// Emails an account-deletion request to the vendor inbox so it can be processed by hand.
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Emails via Resend if RESEND_API_KEY is set.
// Configure the destination with DELETE_TO (falls back to FEEDBACK_TO, then hello@thealloy.com).
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { orgId, accessToken, reason } = req.body || {};
  if (!orgId || !accessToken) return res.status(400).json({ error: "Missing orgId or accessToken." });

  const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return res.status(500).json({ error: "Server not configured." });
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: userInfo, error: authErr } = await admin.auth.getUser(accessToken);
  if (authErr || !userInfo?.user) return res.status(401).json({ error: "Not signed in." });

  // Only the studio owner can request deletion.
  const { data: mem } = await admin.from("memberships").select("role").eq("org_id", orgId).eq("user_id", userInfo.user.id).maybeSingle();
  if (!mem || mem.role !== "owner") return res.status(403).json({ error: "Only the owner can request account deletion." });

  const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const orgName = org?.name || orgId;
  const email = userInfo.user.email || "unknown";

  const to = process.env.DELETE_TO || process.env.FEEDBACK_TO || "hello@thealloy.com";
  const from = process.env.INVITE_FROM || "Huddle <hello@thealloy.com>";
  const text =
    `Account deletion request\n\n` +
    `Studio: ${orgName}\n` +
    `Org ID: ${orgId}\n` +
    `Requested by: ${email} (user ${userInfo.user.id})\n` +
    `Reason: ${reason || "—"}\n` +
    `When: ${new Date().toISOString()}\n\n` +
    `Action needed: work through the checklist to remove this studio's data.`;

  let emailed = false;
  const key = process.env.RESEND_API_KEY;
  if (key) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: `Huddle — deletion request: ${orgName}`, text }),
      });
      emailed = r.ok;
    } catch (_) {}
  }

  // Also record a marker on the org so it's visible in the database even if email fails.
  try {
    const { data: cur } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
    await admin.from("organizations").update({ settings: { ...(cur?.settings || {}), deletion_requested_at: new Date().toISOString(), deletion_requested_by: email } }).eq("id", orgId);
  } catch (_) {}

  return res.status(200).json({ ok: true, emailed });
}
