// Creates the account for someone following an invite link, already
// confirmed: the invite was emailed to that address, so holding its token
// proves they own it — no separate "confirm your email" step. The client
// then signs in with the password and App accepts the invite (accept_invite).
// An address that already has an account is left alone ({ exists: true });
// the person signs in with their existing password instead.
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { token, password, name } = req.body || {};
  if (!token || typeof token !== "string") return res.status(400).json({ error: "Missing invitation." });
  if (!password || typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "Please use at least 8 characters for your password." });

  const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return res.status(500).json({ error: "Server is not configured for invites yet." });
  const admin = createClient(url, service, { auth: { persistSession: false } });

  // The invite must exist, be unused and unexpired — the token is the only credential here.
  const { data: inv } = await admin.from("invites").select("email,accepted_at,expires_at").eq("token", token).maybeSingle();
  if (!inv || inv.accepted_at || new Date(inv.expires_at) <= new Date()) {
    return res.status(404).json({ error: "This invitation has expired or was already used. Ask your team for a new one." });
  }

  const { error } = await admin.auth.admin.createUser({
    email: inv.email, password, email_confirm: true,
    user_metadata: { full_name: String(name || "").trim().slice(0, 120) },
  });
  if (error) {
    if (/already (been )?registered|already exists/i.test(error.message)) return res.status(200).json({ exists: true });
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ ok: true });
}
