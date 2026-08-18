import React, { useState } from "react";
import { sb, DEMO } from "../lib/supabase.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";

export default function Auth({ inviteToken, inviteError, productName }) {
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
    <div className="h-full grid place-items-center p-4 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/huddle-icon.png" alt="Huddle" className="w-12 h-12 rounded-xl mx-auto mb-3" />
          <h1 className="text-xl font-medium">{productName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {inviteToken ? "Create your account to join your team." : "Scheduling and time tracking for studios."}
          </p>
        </div>

        <Card><CardContent>
          <FieldGroup>
            {DEMO && (
              <Alert>
                <AlertDescription>
                  <b>Demo mode</b> — no real emails or passwords. Sign in as <b>troy@demo.com</b> with any
                  password, then use the role switcher in the bottom-right corner to view the app as any
                  role. Or create a new account to see onboarding.
                </AlertDescription>
              </Alert>
            )}
            {inviteToken && (
              <Alert>
                <AlertDescription>You've been invited to a team. Sign up (or sign in) with the email the invitation was sent to — you'll go straight to the team.</AlertDescription>
              </Alert>
            )}
            {inviteError && (
              <Alert variant="destructive"><AlertDescription>{inviteError}</AlertDescription></Alert>
            )}

            {mode === "signup" && (
              <Field><FieldLabel>Your name</FieldLabel><Input value={name} onChange={e => setName(e.target.value)} placeholder="Alex Dangerfield" /></Field>
            )}
            <Field><FieldLabel>Work email</FieldLabel><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@studio.com" autoComplete="email" /></Field>
            <Field><FieldLabel>Password</FieldLabel>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 8 characters" : ""} />
            </Field>

            {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
            {msg && <Alert><AlertDescription>{msg}</AlertDescription></Alert>}

            <Button className="w-full" onClick={submit} disabled={busy}>
              {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </FieldGroup>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            {mode === "signin" ? (
              <>New here? <button className="font-medium text-foreground underline underline-offset-4" onClick={() => { setMode("signup"); setErr(""); }}>Create an account</button>
                <div className="mt-1"><button className="text-muted-foreground hover:text-foreground" onClick={reset}>Forgot password?</button></div></>
            ) : (
              <>Already have an account? <button className="font-medium text-foreground underline underline-offset-4" onClick={() => { setMode("signin"); setErr(""); }}>Sign in</button></>
            )}
          </div>
        </CardContent></Card>

        <p className="text-center text-[11px] text-muted-foreground mt-4">
          By continuing you agree to the Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
