import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, Card, Field, inputCls, Pill } from "../ui.jsx";
import { can } from "../lib/permissions.js";

export default function Settings({ org, me, reload }) {
  const [name, setName] = useState(org.name);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inv, setInv] = useState(org.settings?.invoice || {});
  const [invSaved, setInvSaved] = useState(false);
  const setF = (k, v) => setInv(p => ({ ...p, [k]: v }));
  const admin = can(me, "org.admin");
  const [plans, setPlans] = useState(null);
  const [plansMsg, setPlansMsg] = useState("");
  const [liveSub, setLiveSub] = useState(null);
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
      else alert(body.error || "Billing portal isn't available yet.");
    } catch (_) { alert("Couldn't reach the billing portal (only works on the live site)."); }
    setBusy(false);
  };

  const subscribe = async (priceId) => {
    setBusy(true);
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, priceId, accessToken: token }) });
      const body = await res.json();
      if (body.url) window.location.href = body.url; else alert(body.error || "Couldn't start checkout.");
    } catch (_) { alert("Couldn't reach the checkout — it only runs on the live site with Stripe connected."); }
    setBusy(false);
  };

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

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full w-full">
      <h2 className="text-base font-bold text-slate-800">Settings</h2>
      <div className="space-y-4">

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
            <div className="text-lg font-bold text-slate-800">{currentPlan ? currentPlan.name : (org.plan || "No plan")} {currentPlan && <span className="text-sm font-normal text-slate-400">{fmtPrice(currentPlan)}{perInterval(currentPlan)}</span>}</div>
            <div className="text-xs text-slate-500">{currentPlan?.description || (org.plan === "trial" ? "Free trial" : "")}</div>
          </div>
          <Pill color={org.status === "active" ? "#27ae60" : org.status === "past_due" ? "#f59e0b" : "#eb5757"}>{org.status}</Pill>
          {admin && <Btn variant="outline" className="ml-auto" onClick={openBillingPortal} disabled={busy}>Manage billing</Btn>}
        </div>
        <div className="text-xs text-slate-400 mt-3">
          {org.plan === "trial" && org.trial_ends_at && !currentPlan
            ? <>Your trial ends on {String(org.trial_ends_at).slice(0, 10)}.</>
            : <>Seats: {org.seats}. Update your card or cancel through Manage billing.</>}
        </div>

        {admin && <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 mb-2">{currentPlan ? "Switch plan" : "Choose a plan"}</div>
          {plans === null && <div className="text-xs text-slate-400">Loading plans from Stripe…</div>}
          {plans !== null && plans.length === 0 && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{plansMsg || "No active plans found in Stripe. Create products with recurring prices in your Stripe dashboard and they'll appear here automatically."}</div>}
          {plans !== null && plans.length > 0 && <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
            {plans.map(p => {
              const current = p.priceId === currentPriceId && org.status === "active";
              return (<div key={p.priceId} className={`rounded-xl border p-3 ${current ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
                <div className="font-semibold text-slate-800 text-sm">{p.name}</div>
                <div className="text-lg font-bold text-slate-800">{fmtPrice(p)}<span className="text-xs font-normal text-slate-400">{p.amount ? perInterval(p) : ""}</span></div>
                {p.description && <div className="text-[11px] text-slate-500 mb-1 leading-snug">{p.description}</div>}
                {p.seats != null && <div className="text-[10px] text-slate-400 mb-1.5">Up to {p.seats} seats</div>}
                <div className="mt-4">
                {current
                  ? <span className="inline-flex items-center justify-center w-full gap-1.5 text-xs font-semibold text-blue-700 bg-blue-100 rounded-lg py-2">✓ Current plan</span>
                  : <Btn className="w-full justify-center" onClick={() => subscribe(p.priceId)} disabled={busy}>{currentPlan ? "Switch to this" : "Subscribe"}</Btn>}
                </div>
              </div>);
            })}
          </div>}
          <p className="text-[11px] text-slate-400 mt-2">These come straight from your Stripe products. Subscribing opens Stripe Checkout. To change or cancel an existing subscription, use <button onClick={openBillingPortal} className="underline">Manage billing</button> so Stripe prorates it correctly.</p>
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

        <div className="mt-2 mb-3 rounded-xl border border-slate-200 p-3">
          <div className="text-xs font-semibold text-slate-500 mb-1.5">Letterhead / template image</div>
          <p className="text-[11px] text-slate-400 mb-2">Upload a PNG or JPG of your header (or a full A4 letterhead). It's placed on every invoice PDF, so downloads look like your own template. Keep it under ~600&nbsp;KB.</p>
          {inv.letterhead && <div className="mb-2"><img src={inv.letterhead} alt="letterhead" style={{ maxHeight: 80, maxWidth: "100%", border: "1px solid #e2e8f0", borderRadius: 6 }} /></div>}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer border border-blue-200 rounded-lg px-2.5 py-1.5">
              {inv.letterhead ? "Replace image" : "Upload image"}
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={e => {
                const f = e.target.files && e.target.files[0]; if (!f) return;
                if (f.size > 900000) { alert("That image is a bit large — please use one under ~600–900 KB so invoices stay quick to generate."); return; }
                const r = new FileReader(); r.onload = () => setF("letterhead", r.result); r.readAsDataURL(f);
              }} />
            </label>
            {inv.letterhead && <button onClick={() => setInv(p => { const n = { ...p }; delete n.letterhead; return n; })} className="text-xs text-red-600 hover:bg-red-50 rounded-lg px-2 py-1.5">Remove</button>}
            {inv.letterhead && <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer ml-1"><input type="checkbox" checked={!!inv.letterheadFull} onChange={e => setF("letterheadFull", e.target.checked)} /> It's a full-page background</label>}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Banner mode (default) sits your header across the top and prints the invoice below it. Tick "full-page background" only if your image is a complete A4 template with space left in the middle for the invoice text.</p>
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
    </div>
  );
}
