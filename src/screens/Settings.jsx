import React, { useState } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, Card, Field, inputCls, Pill } from "../ui.jsx";
import { can } from "../lib/permissions.js";

const PLAN_INFO = {
  trial:      { label: "Free trial",  price: "£0",    blurb: "14 days, up to 5 people." },
  starter:    { label: "Starter",     price: "£29",   blurb: "Up to 5 people." },
  studio:     { label: "Studio",      price: "£79",   blurb: "Up to 20 people, billing plan included." },
  enterprise: { label: "Enterprise",  price: "£249",  blurb: "Unlimited people, priority support." },
};

export default function Settings({ org, me, reload }) {
  const [name, setName] = useState(org.name);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inv, setInv] = useState(org.settings?.invoice || {});
  const [invSaved, setInvSaved] = useState(false);
  const setF = (k, v) => setInv(p => ({ ...p, [k]: v }));
  const admin = can(me, "org.admin");
  const plan = PLAN_INFO[org.plan] || PLAN_INFO.trial;

  const saveInvoice = async () => {
    setBusy(true);
    await sb.from("organizations").update({ settings: { ...(org.settings || {}), invoice: inv } }).eq("id", org.id);
    setBusy(false); setInvSaved(true); reload();
    setTimeout(() => setInvSaved(false), 2500);
  };

  const save = async () => {
    setBusy(true);
    await sb.from("organizations").update({ name: name.trim() }).eq("id", org.id);
    setBusy(false); setSaved(true); reload();
    setTimeout(() => setSaved(false), 2500);
  };

  const openBillingPortal = async () => {
    setBusy(true);
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/billing-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, accessToken: token }) });
      const body = await res.json();
      if (body.url) window.location.href = body.url; else alert(body.error || "Billing is not connected yet.");
    } catch (_) { alert("Billing is not connected yet."); }
    setBusy(false);
  };

  const subscribe = async (planKey) => {
    setBusy(true);
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, plan: planKey, accessToken: token }) });
      const body = await res.json();
      if (body.url) window.location.href = body.url; else alert(body.error || "Couldn't start checkout.");
    } catch (_) { alert("Couldn't reach the checkout — it only runs on the live site with Stripe connected."); }
    setBusy(false);
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full max-w-2xl">
      <h2 className="text-base font-bold text-slate-800">Settings</h2>

      <Card title="Studio">
        <Field label="Studio name">
          <input className={inputCls} value={name} disabled={!admin} onChange={e => setName(e.target.value)} />
        </Field>
        {admin && <div className="flex items-center gap-2">
          <Btn onClick={save} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save changes"}</Btn>
          {saved && <span className="text-xs text-green-600">Saved.</span>}
        </div>}
        {!admin && <p className="text-xs text-slate-400">Only owners and administrators can change these.</p>}
      </Card>

      <Card title="Subscription">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <div className="text-lg font-bold text-slate-800">{plan.label} <span className="text-sm font-normal text-slate-400">{plan.price}/month</span></div>
            <div className="text-xs text-slate-500">{plan.blurb}</div>
          </div>
          <Pill color={org.status === "active" ? "#27ae60" : "#f59e0b"}>{org.status}</Pill>
          {admin && <Btn variant="outline" className="ml-auto" onClick={openBillingPortal} disabled={busy}>Manage billing</Btn>}
        </div>
        <div className="text-xs text-slate-400 mt-3">
          {org.plan === "trial" && org.trial_ends_at
            ? <>Your trial ends on {String(org.trial_ends_at).slice(0, 10)}.</>
            : <>Seats: {org.seats}. Manage payment details or cancel through Manage billing.</>}
        </div>

        {admin && <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 mb-2">{org.status === "active" && org.plan !== "trial" ? "Switch plan" : "Choose a plan"}</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
            {["starter", "studio", "enterprise"].map(k => {
              const p = PLAN_INFO[k]; const current = org.plan === k && org.status === "active";
              return (<div key={k} className={`rounded-xl border p-3 ${current ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
                <div className="font-semibold text-slate-800 text-sm">{p.label}</div>
                <div className="text-lg font-bold text-slate-800">{p.price}<span className="text-xs font-normal text-slate-400">/mo</span></div>
                <div className="text-[11px] text-slate-500 mb-2 leading-snug">{p.blurb}</div>
                {current
                  ? <span className="text-[11px] font-semibold text-blue-600">Current plan</span>
                  : <Btn className="w-full justify-center" onClick={() => subscribe(k)} disabled={busy}>{org.status === "active" && org.plan !== "trial" ? "Switch" : "Subscribe"}</Btn>}
              </div>);
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Subscribing opens Stripe Checkout in this window. Switching an existing subscription is best done via <button onClick={openBillingPortal} className="underline">Manage billing</button> so it prorates correctly.</p>
        </div>}
      </Card>

      {admin && <Card title="Invoice details">
        <p className="text-xs text-slate-500 mb-3">These print on the PDF invoices you download from Billing. Leave anything blank to omit it.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Company name"><input className={inputCls} value={inv.company || ""} onChange={e => setF("company", e.target.value)} placeholder={org.name} /></Field>
          <Field label="VAT number"><input className={inputCls} value={inv.vat || ""} onChange={e => setF("vat", e.target.value)} placeholder="GB 000 0000 00" /></Field>
        </div>
        <Field label="Company address (one line each)"><textarea className={inputCls} rows={3} value={inv.address || ""} onChange={e => setF("address", e.target.value)} placeholder={"Building 2\nYour Street\nTown, Postcode"} /></Field>
        <Field label="Contact email(s) for invoice queries"><input className={inputCls} value={inv.emails || ""} onChange={e => setF("emails", e.target.value)} placeholder="accounts@yourstudio.com" /></Field>
        <div className="text-xs font-semibold text-slate-500 mt-2 mb-1">Bank details (printed under “pay by transfer”)</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Account name"><input className={inputCls} value={inv.bankName || ""} onChange={e => setF("bankName", e.target.value)} /></Field>
          <Field label="Bank / branch"><input className={inputCls} value={inv.bankBranch || ""} onChange={e => setF("bankBranch", e.target.value)} /></Field>
          <Field label="Sort code"><input className={inputCls} value={inv.sort || ""} onChange={e => setF("sort", e.target.value)} /></Field>
          <Field label="Account number"><input className={inputCls} value={inv.account || ""} onChange={e => setF("account", e.target.value)} /></Field>
          <Field label="IBAN"><input className={inputCls} value={inv.iban || ""} onChange={e => setF("iban", e.target.value)} /></Field>
          <Field label="SWIFT / BIC"><input className={inputCls} value={inv.swift || ""} onChange={e => setF("swift", e.target.value)} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Accent colour (hex)"><input className={inputCls} value={inv.accent || ""} onChange={e => setF("accent", e.target.value)} placeholder="#1f2d4e" /></Field>
          <Field label="Short logo text (top of invoice)"><input className={inputCls} value={inv.logoText || ""} onChange={e => setF("logoText", e.target.value)} placeholder={org.name?.split(" ")[0] || "Studio"} /></Field>
        </div>
        <div className="flex items-center gap-2"><Btn onClick={saveInvoice} disabled={busy}>Save invoice details</Btn>{invSaved && <span className="text-xs text-green-600">Saved.</span>}</div>
      </Card>}

      <Card title="Your account">
        <div className="text-sm text-slate-600">{me.email}</div>
        <div className="text-xs text-slate-400 mt-1">Signed in · role: {me.role}</div>
        <div className="mt-3 flex gap-2">
          <Btn variant="outline" onClick={async () => { await sb.auth.signOut(); window.location.reload(); }}>Sign out</Btn>
        </div>
      </Card>
    </div>
  );
}
