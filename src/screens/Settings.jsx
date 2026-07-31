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
  const admin = can(me, "org.admin");
  const plan = PLAN_INFO[org.plan] || PLAN_INFO.trial;

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
            : <>Seats: {org.seats}. Change your plan through Manage billing.</>}
        </div>
      </Card>

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
