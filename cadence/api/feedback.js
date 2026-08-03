// Optional: emails feedback to the vendor. No-op if RESEND_API_KEY/FEEDBACK_TO aren't set.
// The feedback is already stored in the database; this is just a notification.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const key = process.env.RESEND_API_KEY, to = process.env.FEEDBACK_TO;
  if (!key || !to) return res.status(200).json({ notified: false });
  const { orgName, email, answers } = req.body || {};
  const rows = Object.entries(answers || {}).map(([k, v]) => `<tr><td style="padding:4px 8px;color:#64748b;vertical-align:top">${k}</td><td style="padding:4px 8px">${Array.isArray(v) ? v.join(", ") : String(v ?? "")}</td></tr>`).join("");
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.INVITE_FROM || `Huddle <feedback@cadence.app>`,
        to: [to],
        subject: `Feedback from ${orgName || "a studio"} (${email || "no email"})`,
        html: `<div style="font-family:system-ui,sans-serif"><h3>New feedback from ${orgName || "a studio"}</h3><table style="font-size:13px;border-collapse:collapse">${rows}</table></div>`,
      }),
    });
    return res.status(200).json({ notified: true });
  } catch (_) { return res.status(200).json({ notified: false }); }
}
