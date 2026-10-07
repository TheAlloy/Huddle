import React, { useState, useEffect } from "react";
import { sb, DEMO } from "../lib/supabase.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, EyeOff, Monitor, Download } from "lucide-react";

// Sign-in is just email + password. After signing in the app joins the
// person to any team that invited their email (accept_my_invites) or that
// owns their email domain (join_domain_org); otherwise they set up a studio.

// Where people get the desktop app (the newest GitHub release's installers).
const DESKTOP_DOWNLOAD_URL = "https://github.com/TheAlloy/Huddle/releases/latest";
const inDesktopApp = typeof navigator !== "undefined" && /Electron\//.test(navigator.userAgent || "");

// PLACEHOLDER legal copy — replace with Huddle's real Terms of Service and
// Privacy Policy before relying on them.
const LEGAL = {
  terms: { title: "Terms of Service", body: [
    "[Placeholder] Huddle's Terms of Service will appear here.",
    "This is placeholder text. Replace it with the real terms before launch — it is not a legal document.",
  ] },
  privacy: { title: "Privacy Policy", body: [
    "[Placeholder] Huddle's Privacy Policy will appear here.",
    "This is placeholder text. Replace it with the real policy before launch — it is not a legal document.",
  ] },
};

export default function Auth({ inviteToken, inviteError, productName }) {
  const [mode, setMode] = useState(inviteToken ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [legal, setLegal] = useState(null); // "terms" | "privacy"
  // Invite landing: who the invite is for and which studio (invite_info RPC).
  // null = not loaded / not an invite; {email, orgName}; "invalid".
  const [invite, setInvite] = useState(null);
  const [inviteExisting, setInviteExisting] = useState(false); // invited email already has an account

  useEffect(() => {
    if (!inviteToken || DEMO) return;
    let live = true;
    sb.rpc("invite_info", { invite_token: inviteToken }).then(({ data, error }) => {
      if (!live) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setInvite("invalid"); return; }
      setInvite({ email: row.email, orgName: row.org_name });
      setEmail(row.email);
    }, () => { if (live) setInvite("invalid"); });
    return () => { live = false; };
  }, [inviteToken]);
  const inviteReady = invite && invite !== "invalid";

  // Invited: the emailed link proves the address, so the server creates the
  // account already confirmed; then we sign straight in and App accepts the
  // invite. An address that already has an account just signs in.
  const joinWithInvite = async () => {
    setErr(""); setMsg("");
    if (!password) { setErr("Choose a password."); return; }
    setBusy(true);
    try {
      if (!inviteExisting) {
        if (password.length < 8) { setErr("Please use at least 8 characters for your password."); setBusy(false); return; }
        const res = await fetch("/api/invite-signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: inviteToken, password, name: name.trim() }) });
        const body = await res.json().catch(() => ({}));
        if (body.exists) { setInviteExisting(true); setMsg("You already have a Huddle account — enter its password to join the team."); setBusy(false); return; }
        if (!res.ok) throw new Error(body.error || "Couldn't create your account.");
      }
      const { error } = await sb.auth.signInWithPassword({ email: invite.email, password });
      if (error) throw error;
    } catch (e) { setErr(e?.message || "Something went wrong — please try again."); }
    setBusy(false);
  };

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
        setMsg("Check your email to confirm your address, then sign in. If a team invited this email, you'll go straight into it.");
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

  // The password box with a show/hide eye (stock InputGroup anatomy).
  const passwordField = (onEnter, newPassword) => (
    <InputGroup>
      <InputGroupInput type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === "Enter" && onEnter()} autoComplete={newPassword ? "new-password" : "current-password"} placeholder={newPassword ? "At least 8 characters" : ""} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}
          onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff /> : <Eye />}</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );

  // Desktop hand-off for the invite page: the huddle:// deep link opens this
  // same invite inside the installed app.
  const openInDesktop = () => { window.location.href = "huddle://open?url=" + encodeURIComponent(window.location.href); };

  return (
    <div className="h-full grid place-items-center p-4 bg-background overflow-y-auto">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/huddle-icon.png" alt="Huddle" className="w-12 h-12 rounded-xl mx-auto mb-3" />
          <h1 className="text-xl font-medium">{inviteReady ? `Join ${invite.orgName} on ${productName}` : productName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {inviteReady ? "Set a password and you're in." : inviteToken ? "Create your account to join your team." : "Scheduling and time tracking for studios."}
          </p>
        </div>

        {inviteReady && !inDesktopApp && (
          <Card className="mb-4"><CardContent className="flex flex-col gap-2">
            <p className="text-sm">Using the Huddle desktop app? Open this invite there.</p>
            <Button variant="outline" onClick={openInDesktop}><Monitor data-icon="inline-start" /> Open in the desktop app</Button>
            <p className="text-xs text-muted-foreground">Don't have it yet? <a className="font-medium text-foreground underline underline-offset-4" href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer"><Download className="inline size-3 align-[-1px]" /> Download Huddle</a>, install it, then click your invite link again — or just carry on below in the browser.</p>
          </CardContent></Card>
        )}

        <Card><CardContent>
          {inviteReady ? (
            <FieldGroup>
              <Field><FieldLabel>Email</FieldLabel><Input type="email" value={invite.email} readOnly disabled /></Field>
              {!inviteExisting && <Field><FieldLabel>Your name</FieldLabel><Input value={name} onChange={e => setName(e.target.value)} placeholder="Alex Dangerfield" autoFocus /></Field>}
              <Field><FieldLabel>{inviteExisting ? "Password" : "Create a password"}</FieldLabel>{passwordField(joinWithInvite, !inviteExisting)}</Field>
              {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
              {msg && <Alert><AlertDescription>{msg}</AlertDescription></Alert>}
              <Button className="w-full" onClick={joinWithInvite} disabled={busy}>{busy ? "Please wait…" : inviteExisting ? "Sign in & join" : "Create account & join"}</Button>
            </FieldGroup>
          ) : (<>
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
              <Alert variant={invite === "invalid" ? "destructive" : "default"}>
                <AlertDescription>{invite === "invalid"
                  ? "This invitation link has expired or was already used. Ask your team for a new one, or sign in if you already have an account."
                  : "You've been invited to a team. Sign up (or sign in) with the email the invitation was sent to — you'll go straight to the team."}</AlertDescription>
              </Alert>
            )}
            {inviteError && (
              <Alert variant="destructive"><AlertDescription>{inviteError}</AlertDescription></Alert>
            )}

            {mode === "signup" && (
              <Field><FieldLabel>Your name</FieldLabel><Input value={name} onChange={e => setName(e.target.value)} placeholder="Alex Dangerfield" /></Field>
            )}
            <Field><FieldLabel>Work email</FieldLabel><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@studio.com" autoComplete="email" /></Field>
            <Field><FieldLabel>Password</FieldLabel>{passwordField(submit, mode === "signup")}</Field>

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
          </>)}
        </CardContent></Card>

        <p className="text-center text-[11px] text-muted-foreground mt-4">
          By continuing you agree to the{" "}
          <button className="underline underline-offset-2 hover:text-foreground" onClick={() => setLegal("terms")}>Terms of Service</button>
          {" "}and{" "}
          <button className="underline underline-offset-2 hover:text-foreground" onClick={() => setLegal("privacy")}>Privacy Policy</button>.
        </p>
      </div>

      <Dialog open={!!legal} onOpenChange={(o) => { if (!o) setLegal(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{legal && LEGAL[legal].title}</DialogTitle>
            <DialogDescription>Placeholder — the final wording is still to come.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60svh]">
            <div className="flex flex-col gap-3 pr-3 text-sm">{legal && LEGAL[legal].body.map((p, i) => <p key={i}>{p}</p>)}</div>
          </ScrollArea>
          <DialogFooter><Button onClick={() => setLegal(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
