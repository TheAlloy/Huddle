import React, { useState } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, Field, inputCls } from "../ui.jsx";

/** Shown when the user arrives via a password-reset link (Supabase PASSWORD_RECOVERY). */
export default function ResetPassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (pw.length < 8) { setErr("Use at least 8 characters."); return; }
    if (pw !== pw2) { setErr("Those passwords don't match."); return; }
    setBusy(true); setErr("");
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { setErr(error.message || "Couldn't update your password."); setBusy(false); return; }
    setDone(true);
    try { await sb.auth.signOut(); } catch (_) {}
    setTimeout(() => { window.location.href = window.location.origin; }, 1800);
  };

  return (
    <div className="min-h-screen grid place-items-center p-4" style={{ background: "#f1f5f9" }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6">
        <img src="/huddle-icon.png" alt="Huddle" className="w-12 h-12 rounded-xl mx-auto mb-3" />
        {done ? (
          <div className="text-center">
            <h1 className="text-lg font-bold text-slate-800 mb-1">Password updated</h1>
            <p className="text-sm text-slate-500">Signing you out — please sign in again with your new password.</p>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-bold text-slate-800 text-center mb-1">Set a new password</h1>
            <p className="text-sm text-slate-500 text-center mb-4">Choose a new password for your account. You'll sign in again afterwards.</p>
            <Field label="New password"><input type="password" className={inputCls} value={pw} onChange={e => setPw(e.target.value)} autoFocus /></Field>
            <Field label="Confirm new password"><input type="password" className={inputCls} value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} /></Field>
            {err && <div className="text-xs text-red-600 my-2">{err}</div>}
            <Btn variant="dark" className="w-full justify-center mt-3" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Update password"}</Btn>
          </>
        )}
      </div>
    </div>
  );
}
