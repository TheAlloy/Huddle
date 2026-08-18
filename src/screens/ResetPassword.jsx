import React, { useState } from "react";
import { sb } from "../lib/supabase.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";

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
    <div className="min-h-screen grid place-items-center p-4 bg-background">
      <div className="w-full max-w-sm">
        <Card><CardContent>
          <img src="/huddle-icon.png" alt="Huddle" className="w-12 h-12 rounded-xl mx-auto mb-3" />
          {done ? (
            <div className="text-center">
              <h1 className="text-lg font-medium mb-1">Password updated</h1>
              <p className="text-sm text-muted-foreground">Signing you out — please sign in again with your new password.</p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-medium text-center mb-1">Set a new password</h1>
              <p className="text-sm text-muted-foreground text-center mb-4">Choose a new password for your account. You'll sign in again afterwards.</p>
              <FieldGroup>
                <Field><FieldLabel>New password</FieldLabel><Input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} autoFocus /></Field>
                <Field><FieldLabel>Confirm new password</FieldLabel><Input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} /></Field>
                {err && <div className="text-sm text-destructive">{err}</div>}
                <Button className="w-full" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
              </FieldGroup>
            </>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}
