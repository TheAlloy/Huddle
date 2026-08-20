import React, { useState, useEffect, useRef } from "react";
import { sb } from "../lib/supabase.js";
import { can } from "../lib/permissions.js";
import { USAGE_OPTIONS } from "../lib/terms.js";
import { PlanCard } from "./PlanCard.jsx";
import { toast } from "@/components/ui/toast";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function Settings({ org, me, members, reload }) {
  const [name, setName] = useState(org.name);
  const [busy, setBusy] = useState(false);

  const [inv, setInv] = useState(org.settings?.invoice || {});

  const setF = (k, v) => setInv(p => ({ ...p, [k]: v }));
  const admin = can(me, "org.admin");
  const [plans, setPlans] = useState(null);
  const [plansMsg, setPlansMsg] = useState("");
  const [liveSub, setLiveSub] = useState(null);
  const [accountModal, setAccountModal] = useState(null);
  const letterheadRef = useRef(null);
  const currentPriceId = (liveSub && liveSub.priceId) || org.settings?.stripe_price_id || null;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const token = (await sb.auth.getSession()).data.session?.access_token;
        const r = await fetch("/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, accessToken: token }) });
        const b = await r.json();
        if (live && b.hasSubscription) setLiveSub(b);
      } catch (_) {}
    })();
    return () => { live = false; };
  }, [org.id]);

  useEffect(() => {
    let live = true;
    fetch("/api/plans").then(r => r.json()).then(b => {
      if (!live) return;
      if (b.configured === false) { setPlans([]); setPlansMsg("Stripe isn't connected yet — add your keys in Vercel."); }
      else if (b.error) { setPlans([]); setPlansMsg(b.error); }
      else setPlans(b.plans || []);
    }).catch(() => { if (live) { setPlans([]); setPlansMsg("Couldn't load plans (this only works on the live site)."); } });
    return () => { live = false; };
  }, []);

  const fmtPrice = (p) => {
    if (p.amount == null) return "";
    if (p.amount === 0) return "Free";
    const sym = p.currency === "GBP" ? "£" : p.currency === "USD" ? "$" : p.currency === "EUR" ? "€" : p.currency + " ";
    const n = Number.isInteger(p.amount) ? p.amount : p.amount.toFixed(2);
    return `${sym}${n}`;
  };
  const perInterval = (p) => p.interval === "year" ? "/yr" : p.interval === "week" ? "/wk" : "/mo";
  const currentPlan = (plans || []).find(p => p.priceId === currentPriceId);

  const openBillingPortal = async () => {
    setBusy(true);
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/billing-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, accessToken: token }) });
      const body = await res.json();
      if (body.url) window.location.href = body.url;
      else toast.add({ title: body.error || "Billing portal isn't available yet.", type: "error" });
    } catch (_) { toast.add({ title: "Couldn't reach the billing portal (only works on the live site).", type: "error" }); }
    setBusy(false);
  };

  const subscribe = async (priceId) => {
    setBusy(true);
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, priceId, accessToken: token }) });
      const body = await res.json();
      if (body.url) window.location.href = body.url; else toast.add({ title: body.error || "Couldn't start checkout.", type: "error" });
    } catch (_) { toast.add({ title: "Couldn't reach the checkout — it only runs on the live site with Stripe connected.", type: "error" }); }
    setBusy(false);
  };

  const saveInvoice = async () => {
    setBusy(true);
    await sb.from("organizations").update({ settings: { ...(org.settings || {}), invoice: inv } }).eq("id", org.id);
    setBusy(false); reload(); toast.add({ title: "Invoice details saved", type: "success" });
  };

  const [usage, setUsage] = useState(org.settings?.usage || "consultancy");
  const [usageOther, setUsageOther] = useState(org.settings?.usageOther || "");

  const saveUsage = async () => {
    setBusy(true);
    await sb.from("organizations").update({ settings: { ...(org.settings || {}), usage, ...(usage === "other" ? { usageOther } : {}) } }).eq("id", org.id);
    setBusy(false); reload(); toast.add({ title: "Saved", type: "success" });
  };

  const dw = org.settings?.desktopWarnings || {};
  const [closeWarn, setCloseWarn] = useState(dw.closeWarn !== false);
  const [minWarn, setMinWarn] = useState(dw.minimizeWarn !== false);

  const saveDesktop = async () => {
    setBusy(true);
    await sb.from("organizations").update({ settings: { ...(org.settings || {}), desktopWarnings: { closeWarn, minimizeWarn: minWarn } } }).eq("id", org.id);
    setBusy(false); reload(); toast.add({ title: "Saved", type: "success" });
  };

  const save = async () => {
    setBusy(true);
    await sb.from("organizations").update({ name: name.trim() }).eq("id", org.id);
    setBusy(false); reload(); toast.add({ title: "Saved", type: "success" });
  };

  return (
    <div className="@container/main px-4 lg:px-6 py-4 md:py-6 flex flex-col gap-4 md:gap-6 overflow-y-auto h-full w-full">
      <h2 className="text-base font-medium">Settings</h2>
      <div className="flex flex-col gap-4">

      <Card><CardHeader><CardTitle>Studio</CardTitle></CardHeader><CardContent>
        <Field><FieldLabel>Studio name</FieldLabel>
          <Input value={name} disabled={!admin} onChange={e => setName(e.target.value)} />
        </Field>
        {admin && <div className="mt-3">
          <Button onClick={save} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save changes"}</Button>
        </div>}
        {!admin && <p className="text-xs text-muted-foreground mt-3">Only owners and administrators can change these.</p>}
      </CardContent></Card>

      {can(me, "billing.view") && <Card><CardHeader><CardTitle>Subscription</CardTitle></CardHeader><CardContent>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <div className="text-lg font-medium text-foreground">{currentPlan ? currentPlan.name : (org.plan && org.plan !== "trial" ? org.plan : "No plan")} {currentPlan && <span className="text-sm font-normal text-muted-foreground">{fmtPrice(currentPlan)}{perInterval(currentPlan)}</span>}</div>
            <div className="text-xs text-muted-foreground">{currentPlan?.description || ""}</div>
          </div>
          {liveSub?.status === "trialing"
            ? <Badge variant="secondary">Free trial{liveSub.trialEnd ? " — " + Math.max(0, Math.ceil((liveSub.trialEnd * 1000 - Date.now()) / 86400000)) + " days left" : ""}</Badge>
            : <Badge variant={["active","trialing"].includes(org.status) ? "secondary" : "destructive"}>{org.status}</Badge>}
          {admin && <Button variant="outline" className="ml-auto" onClick={openBillingPortal} disabled={busy}>Manage billing</Button>}
        </div>
        <div className="text-xs text-muted-foreground mt-3">
          {liveSub?.status === "trialing" && liveSub.trialEnd
            ? <>Your free trial ends on {new Date(liveSub.trialEnd * 1000).toISOString().slice(0, 10)}, then billing starts automatically. Cancel any time before then through Manage billing.</>
            : <>Seats: {org.seats >= 9999 ? "Unlimited" : org.seats}. Update your card or cancel through Manage billing.</>}
        </div>

        {admin && <div className="mt-4 pt-4 border-t border-border/60">
          <div className="text-xs font-medium text-muted-foreground mb-2">{currentPlan ? "Switch plan" : "Choose a plan"}</div>
          {plans === null && <div className="text-xs text-muted-foreground">Loading plans from Stripe…</div>}
          {plans !== null && plans.length === 0 && <Alert><AlertDescription>{plansMsg || "No active plans found in Stripe. Create products with recurring prices in your Stripe dashboard and they'll appear here automatically."}</AlertDescription></Alert>}
          {plans !== null && plans.length > 0 && <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
            {plans.map(p => {
              const current = p.priceId === currentPriceId && ["active", "trialing", "past_due"].includes(org.status);
              return <PlanCard key={p.priceId} plan={p} current={current} onChoose={subscribe} busy={busy} ctaLabel={currentPlan ? "Switch to this" : "Subscribe"} />;
            })}
          </div>}
          <p className="text-[11px] text-muted-foreground mt-2">These come straight from your Stripe products. Subscribing opens Stripe Checkout. To change or cancel an existing subscription, use <button onClick={openBillingPortal} className="underline">Manage billing</button> so Stripe prorates it correctly.</p>
        </div>}
      </CardContent></Card>}

      {admin && <Card><CardHeader><CardTitle>Invoice details</CardTitle></CardHeader><CardContent>
        <p className="text-xs text-muted-foreground mb-3">These print on the PDF invoices you download from Billing. Leave anything blank to omit it.</p>
        <FieldGroup>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field><FieldLabel>Company name</FieldLabel><Input value={inv.company || ""} onChange={e => setF("company", e.target.value)} placeholder={org.name} /></Field>
          <Field><FieldLabel>VAT number</FieldLabel><Input value={inv.vat || ""} onChange={e => setF("vat", e.target.value)} placeholder="GB 000 0000 00" /></Field>
        </div>
        <Field><FieldLabel>Company address (one line each)</FieldLabel><Textarea rows={3} value={inv.address || ""} onChange={e => setF("address", e.target.value)} placeholder={"Building 2\nYour Street\nTown, Postcode"} /></Field>
        <Field><FieldLabel>Contact email(s) for invoice queries</FieldLabel><Input value={inv.emails || ""} onChange={e => setF("emails", e.target.value)} placeholder="accounts@yourstudio.com" /></Field>
        <div className="text-xs font-medium text-muted-foreground mt-2 mb-1">Bank details (printed under “pay by transfer”)</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field><FieldLabel>Account name</FieldLabel><Input value={inv.bankName || ""} onChange={e => setF("bankName", e.target.value)} /></Field>
          <Field><FieldLabel>Bank / branch</FieldLabel><Input value={inv.bankBranch || ""} onChange={e => setF("bankBranch", e.target.value)} /></Field>
          <Field><FieldLabel>Sort code</FieldLabel><Input value={inv.sort || ""} onChange={e => setF("sort", e.target.value)} /></Field>
          <Field><FieldLabel>Account number</FieldLabel><Input value={inv.account || ""} onChange={e => setF("account", e.target.value)} /></Field>
          <Field><FieldLabel>IBAN</FieldLabel><Input value={inv.iban || ""} onChange={e => setF("iban", e.target.value)} /></Field>
          <Field><FieldLabel>SWIFT / BIC</FieldLabel><Input value={inv.swift || ""} onChange={e => setF("swift", e.target.value)} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field><FieldLabel>Accent colour (hex)</FieldLabel><Input value={inv.accent || ""} onChange={e => setF("accent", e.target.value)} placeholder="#1f2d4e" /></Field>
          <Field><FieldLabel>Short logo text (top of invoice)</FieldLabel><Input value={inv.logoText || ""} onChange={e => setF("logoText", e.target.value)} placeholder={org.name?.split(" ")[0] || "Studio"} /></Field>
        </div>

        <div className="rounded-xl border border-border p-3">
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Letterhead / template image</div>
          <p className="text-[11px] text-muted-foreground mb-2">Upload a PNG or JPG of your header (or a full A4 letterhead). It's placed on every invoice PDF, so downloads look like your own template. Keep it under ~600&nbsp;KB.</p>
          {inv.letterhead && <div className="mb-2"><img src={inv.letterhead} alt="letterhead" className="max-h-20 max-w-full border rounded-md" /></div>}
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={letterheadRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={e => {
              const f = e.target.files && e.target.files[0]; if (!f) return;
              if (f.size > 900000) { toast.add({ title: "That image is a bit large — please use one under ~600–900 KB so invoices stay quick to generate.", type: "error" }); return; }
              const r = new FileReader(); r.onload = () => setF("letterhead", r.result); r.readAsDataURL(f);
            }} />
            <Button variant="outline" size="sm" onClick={() => letterheadRef.current?.click()}>{inv.letterhead ? "Replace image" : "Upload image"}</Button>
            {inv.letterhead && <Button variant="destructive" size="sm" onClick={() => setInv(p => { const n = { ...p }; delete n.letterhead; return n; })}>Remove</Button>}
            {inv.letterhead && <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-1"><Checkbox checked={!!inv.letterheadFull} onCheckedChange={(v) => setF("letterheadFull", !!v)} /> It's a full-page background</label>}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Banner mode (default) sits your header across the top and prints the invoice below it. Tick "full-page background" only if your image is a complete A4 template with space left in the middle for the invoice text.</p>
        </div>

        </FieldGroup>
        <div className="mt-3"><Button onClick={saveInvoice} disabled={busy}>Save invoice details</Button></div>
      </CardContent></Card>}

      {admin && <Card><CardHeader><CardTitle>How you use Huddle</CardTitle></CardHeader><CardContent>
        <p className="text-xs text-muted-foreground mb-3">This tailors the wording across the app (for example “clients” vs “teams”).</p>
        <RadioGroup value={usage} onValueChange={setUsage} className="flex flex-col gap-1.5">{USAGE_OPTIONS.map(o => (
          <label key={o.key} className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${usage === o.key ? "border-primary bg-primary/10" : ""}`}>
            <RadioGroupItem value={o.key} className="mt-0.5" />
            <span><span className="text-sm font-medium">{o.label}</span><span className="block text-xs text-muted-foreground">{o.blurb}</span></span>
          </label>))}</RadioGroup>
        {usage === "other" && <Input className="mt-2" value={usageOther} onChange={e => setUsageOther(e.target.value)} placeholder="How would you describe it?" />}
        <div className="mt-3"><Button onClick={saveUsage} disabled={busy}>Save</Button></div>
      </CardContent></Card>}

      {admin && <Card><CardHeader><CardTitle>Desktop app warnings</CardTitle></CardHeader><CardContent>
        <p className="text-xs text-muted-foreground mb-3">Controls the reminders shown in the installed desktop app for everyone on your team.</p>
        <label className="flex items-start gap-2 py-1.5 cursor-pointer">
          <Checkbox checked={closeWarn} onCheckedChange={(v) => setCloseWarn(!!v)} className="mt-0.5" />
          <span><span className="text-sm font-medium">Ask before closing</span><span className="block text-xs text-muted-foreground">Shows “Have you recorded all your time?” when someone quits the app.</span></span>
        </label>
        <label className="flex items-start gap-2 py-1.5 cursor-pointer">
          <Checkbox checked={minWarn} onCheckedChange={(v) => setMinWarn(!!v)} className="mt-0.5" />
          <span><span className="text-sm font-medium">Remind on minimise</span><span className="block text-xs text-muted-foreground">If the tracker isn't running when they minimise, remind them to start recording.</span></span>
        </label>
        <div className="mt-3"><Button onClick={saveDesktop} disabled={busy}>Save</Button></div>
      </CardContent></Card>}

      <Card><CardHeader><CardTitle>Your account</CardTitle></CardHeader><CardContent>
        <div className="text-sm text-muted-foreground">{me.email}</div>
        <div className="text-xs text-muted-foreground mt-1">Signed in · role: {me.role}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAccountModal("email")}>Change email</Button>
          <Button variant="outline" onClick={() => setAccountModal("password")}>Change password</Button>
          <Button variant="outline" onClick={async () => { await sb.auth.signOut(); window.location.reload(); }}>Sign out</Button>
          {can(me, "account.close") && <Button variant="destructive" onClick={() => setAccountModal("delete")}>Delete account</Button>}
        </div>
      </CardContent></Card>

      {accountModal === "email" && <ChangeEmailModal currentEmail={me.email} onClose={() => setAccountModal(null)} />}
      {accountModal === "password" && <ChangePasswordModal currentEmail={me.email} onClose={() => setAccountModal(null)} />}
      {accountModal === "delete" && <DeleteAccountModal org={org} me={me} members={members} onClose={() => setAccountModal(null)} />}
    </div>
    </div>
  );
}

/** Change email: requires the password entered twice, then Supabase sends a confirm link to the new address. */
function ChangeEmailModal({ currentEmail, onClose }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!email.trim() || !/.+@.+\..+/.test(email.trim())) { setErr("Enter a valid new email address."); return; }
    if (!pw || pw !== pw2) { setErr("Enter your current password in both boxes to confirm."); return; }
    setBusy(true); setErr("");
    // Verify identity by re-checking the current password.
    const { error: authErr } = await sb.auth.signInWithPassword({ email: currentEmail, password: pw });
    if (authErr) { setErr("That password isn't correct."); setBusy(false); return; }
    const { error } = await sb.auth.updateUser({ email: email.trim() });
    if (error) { setErr(error.message || "Couldn't change your email."); setBusy(false); return; }
    setBusy(false); setDone(true);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>Change email</DialogTitle></DialogHeader>
      {done ? (
        <p className="text-sm text-muted-foreground">Almost there — we've emailed a confirmation link to <b>{email}</b>. Click it to finish changing your address. Until then, keep signing in with your current email.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">Enter the new address and your current password (twice) to confirm it's you.</p>
          <FieldGroup>
          <Field><FieldLabel>New email address</FieldLabel><Input autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@studio.com" autoFocus /></Field>
          <Field><FieldLabel>Current password</FieldLabel><Input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
          <Field><FieldLabel>Confirm current password</FieldLabel><Input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></Field>
          </FieldGroup>
          {err && <div className="text-sm text-destructive mt-1">{err}</div>}
        </>
      )}
    <DialogFooter>{done ? <Button variant="secondary" onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Change email"}</Button></>}</DialogFooter></DialogContent></Dialog>
  );
}

/** Change password: verify current password, then email a reset link (handled by the recovery screen). */
function ChangePasswordModal({ currentEmail, onClose }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!pw) { setErr("Enter your current password."); return; }
    setBusy(true); setErr("");
    const { error: authErr } = await sb.auth.signInWithPassword({ email: currentEmail, password: pw });
    if (authErr) { setErr("That password isn't correct."); setBusy(false); return; }
    const { error } = await sb.auth.resetPasswordForEmail(currentEmail, { redirectTo: window.location.origin });
    if (error) { setErr(error.message || "Couldn't send the reset link."); setBusy(false); return; }
    setBusy(false); setDone(true);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>Change password</DialogTitle></DialogHeader>
      {done ? (
        <p className="text-sm text-muted-foreground">We've emailed a reset link to <b>{currentEmail}</b>. Open it, set a new password, and you'll be signed out to sign back in with it.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">Confirm your current password. We'll email you a secure link to set a new one.</p>
          <Field><FieldLabel>Current password</FieldLabel><Input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} autoFocus /></Field>
          {err && <div className="text-xs text-destructive mt-1">{err}</div>}
        </>
      )}
    <DialogFooter>{done ? <Button variant="secondary" onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button></>}</DialogFooter></DialogContent></Dialog>
  );
}

/** Delete account: owner chooses to delete the whole team, or transfer ownership and leave. */
function DeleteAccountModal({ org, me, members, onClose }) {
  const others = (members || []).filter(m => m.user_id !== me.user_id && m.status !== "suspended");
  const [step, setStep] = useState("choose"); // choose | confirmDelete | transfer
  const [newOwner, setNewOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const call = async (body) => {
    setBusy(true); setErr("");
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/delete-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, accessToken: token, ...body }) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error || "Something went wrong.");
      await sb.auth.signOut();
      window.location.href = window.location.origin;
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  if (step === "choose") return (
    <Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>Delete account</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground mb-3">What would you like to do with <b>{org.name}</b>?</p>
      <div className="space-y-2">
        <button onClick={() => setStep("transfer")} disabled={others.length === 0} className={`w-full text-left border rounded-xl p-3 ${others.length === 0 ? "opacity-50 cursor-not-allowed border-border" : "border-border hover:border-primary hover:bg-primary/10"}`}>
          <div className="text-sm font-medium text-foreground">Transfer ownership &amp; leave</div>
          <div className="text-xs text-muted-foreground">Hand the studio to someone else. It keeps running; you're removed.{others.length === 0 ? " (No other members to transfer to.)" : ""}</div>
        </button>
        <button onClick={() => setStep("confirmDelete")} className="w-full text-left border border-destructive/30 rounded-xl p-3 hover:bg-destructive/10">
          <div className="text-sm font-medium text-destructive">Delete the whole team</div>
          <div className="text-xs text-muted-foreground">Permanently removes the studio and everyone's data. This can't be undone.</div>
        </button>
      </div>
    <DialogFooter>{<Button variant="ghost" onClick={onClose}>Cancel</Button>}</DialogFooter></DialogContent></Dialog>
  );

  if (step === "transfer") return (
    <Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>Transfer ownership</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground mb-3">Choose who becomes the new owner of <b>{org.name}</b>. You'll be removed from the team and signed out.</p>
      <Select value={newOwner} onValueChange={setNewOwner} items={{"":"Select a team member…",...Object.fromEntries(others.map(m=>[m.id,m.display_name||m.email]))}}>
        <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="">Select a team member…</SelectItem>{others.map(m => <SelectItem key={m.id} value={m.id}>{m.display_name || m.email}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      {err && <div className="text-xs text-destructive mt-2">{err}</div>}
    <DialogFooter>{<><Button variant="ghost" onClick={() => setStep("choose")} disabled={busy}>Back</Button><Button onClick={() => newOwner ? call({ action: "transfer", newOwnerId: newOwner }) : setErr("Choose a new owner.")} disabled={busy}>{busy ? "Transferring…" : "Transfer & leave"}</Button></>}</DialogFooter></DialogContent></Dialog>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>Delete the whole team</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">This permanently deletes <b>{org.name}</b> and all of its schedules, time logs, projects and members, and cancels the subscription. <b>This cannot be undone.</b> You'll be signed out.</p>
      {err && <div className="text-xs text-destructive mt-2">{err}</div>}
    <DialogFooter>{<><Button variant="ghost" onClick={() => setStep("choose")} disabled={busy}>Back</Button><Button variant="destructive" onClick={() => call({ action: "delete" })} disabled={busy}>{busy ? "Deleting…" : "Yes, delete everything"}</Button></>}</DialogFooter></DialogContent></Dialog>
  );
}
