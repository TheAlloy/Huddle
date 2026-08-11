// Optional: emails feedback to the vendor. No-op if RESEND_API_KEY/FEEDBACK_TO aren't set.
// The feedback is already stored in the database; this is just a notification.
// Requires the caller to be a signed-in, active member of the org so the
// endpoint can't be used as an open email relay.
import { createClient } from "@supabase/supabase-js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const key = process.env.RESEND_API_KEY, to = process.env.FEEDBACK_TO;
  if (!key || !to) return res.status(200).json({ notified: false });
  const { orgId, accessToken, orgName, email, answers } = req.body || {};

  if (!orgId || !accessToken) return res.status(401).json({ error: "Not signed in." });
  const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return res.status(500).json({ error: "Server is not configured." });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: userInfo, error: authErr } = await admin.auth.getUser(accessToken);
  if (authErr || !userInfo?.user) return res.status(401).json({ error: "Not signed in." });
  const { data: mem } = await admin.from("memberships").select("status")
    .eq("org_id", orgId).eq("user_id", userInfo.user.id).maybeSingle();
  if (!mem || mem.status !== "active") return res.status(403).json({ error: "Not a member of this studio." });

  const rows = Object.entries(answers || {}).map(([k, v]) => `<tr><td style="padding:4px 8px;color:#64748b;vertical-align:top">${esc(k)}</td><td style="padding:4px 8px">${esc(Array.isArray(v) ? v.join(", ") : v)}</td></tr>`).join("");
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.INVITE_FROM || `Huddle <feedback@huddle.app>`,
        to: [to],
        subject: `Feedback from ${orgName || "a studio"} (${email || "no email"})`,
        html: `<div style="font-family:system-ui,sans-serif"><h3>New feedback from ${esc(orgName || "a studio")}</h3><table style="font-size:13px;border-collapse:collapse">${rows}</table></div>`,
      }),
    });
    return res.status(200).json({ notified: true });
  } catch (_) { return res.status(200).json({ notified: false }); }
}
