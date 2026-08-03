import React, { useState } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, Field, inputCls, NAVY } from "../ui.jsx";

export default function Auth({ inviteToken, productName }) {
  const [mode, setMode] = useState(inviteToken ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr(""); setMsg("");
    if (!email.trim() || !password) { setErr("Enter your email and a password."); return; }
    if (mode === "signup" && password.length < 8) { setErr("Please use at least 8 characters for your password."); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin + window.location.search },
        });
        if (error) throw error;
        setMsg("Check your email to confirm your address, then sign in.");
        setMode("signin");
      } else if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e) {
      console.error("Auth error:", e);
      let m = e?.message || e?.error_description || e?.msg || "";
      if (!m || m === "{}") m = `${mode === "signup" ? "Sign-up" : "Sign-in"} failed${e?.status ? ` (status ${e.status})` : ""}${e?.name ? ` — ${e.name}` : ""}. Please try again or contact support.`;
      setErr(m);
    }
    setBusy(false);
  };

  const reset = async () => {
    if (!email.trim()) { setErr("Enter your email address first."); return; }
    setBusy(true); setErr(""); setMsg("");
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) throw error;
      setMsg("Password reset email sent.");
    } catch (e) { setErr(e.message || "Could not send the reset email."); }
    setBusy(false);
  };

  return (
    <div className="h-full grid place-items-center p-4" style={{ background: "#f1f5f9" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/huddle-icon.png" alt="Huddle" className="w-12 h-12 rounded-xl mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-800">{productName}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {inviteToken ? "Create your account to join your team." : "Scheduling and time tracking for studios."}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          {inviteToken && (
            <div className="mb-4 text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2">
              You've been invited to a team. Sign up (or sign in) with the email the invitation was sent to.
            </div>
          )}

          {mode === "signup" && (
            <Field label="Your name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Alex Dangerfield" /></Field>
          )}
          <Field label="Work email"><input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@studio.com" autoComplete="email" /></Field>
          <Field label="Password">
            <input className={inputCls} type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 8 characters" : ""} />
          </Field>

          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}
          {msg && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{msg}</div>}

          <Btn variant="dark" className="w-full" onClick={submit} disabled={busy}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </Btn>

          <div className="mt-3 text-center text-xs text-slate-500">
            {mode === "signin" ? (
              <>New here? <button className="text-blue-600 font-semibold" onClick={() => { setMode("signup"); setErr(""); }}>Create an account</button>
                <div className="mt-1"><button className="text-slate-400 hover:text-slate-600" onClick={reset}>Forgot password?</button></div></>
            ) : (
              <>Already have an account? <button className="text-blue-600 font-semibold" onClick={() => { setMode("signin"); setErr(""); }}>Sign in</button></>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-4">
          By continuing you agree to the Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
