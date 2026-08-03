import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, NAVY } from "../ui.jsx";
import { can } from "../lib/permissions.js";
import { PlanCard } from "./PlanCard.jsx";
import { ChevronDown } from "lucide-react";

/** Shown when the active studio has no active subscription. Owners/admins can subscribe here; others are told to ask an owner. */
export default function Paywall({ org, me, memberships, onPickOrg, onSignOut }) {
  const canPay = ["owner", "admin"].includes(me.role) || can(me, "org.admin");
  const [plans, setPlans] = useState(null);
  const [plansMsg, setPlansMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [orgMenu, setOrgMenu] = useState(false);

  useEffect(() => {
    fetch("/api/plans").then(r => r.json()).then(b => {
      if (b.configured === false) { setPlans([]); setPlansMsg("Billing isn't fully set up yet."); }
      else if (b.error) { setPlans([]); setPlansMsg(b.error); }
      else setPlans(b.plans || []);
    }).catch(() => { setPlans([]); setPlansMsg("Couldn't load plans."); });
  }, []);

  const fmtPrice = (p) => {
    if (p.amount == null) return "";
    if (p.amount === 0) return "Free";
    const sym = p.currency === "GBP" ? "£" : p.currency === "USD" ? "$" : p.currency === "EUR" ? "€" : p.currency + " ";
    const n = Number.isInteger(p.amount) ? p.amount : p.amount.toFixed(2);
    return `${sym}${n}`;
  };
  const perInterval = (p) => p.interval === "year" ? "/yr" : p.interval === "week" ? "/wk" : "/mo";

  const subscribe = async (priceId) => {
    setBusy(true);
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, priceId, accessToken: token }) });
      const body = await res.json();
      if (body.url) { window.location.href = body.url; return; }
      alert(body.error || "Couldn't start checkout.");
    } catch (_) { alert("Couldn't reach checkout."); }
    setBusy(false);
  };

  const manageBilling = async () => {
    setBusy(true);
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/billing-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, accessToken: token }) });
      const body = await res.json();
      if (body.url) { window.location.href = body.url; return; }
      alert(body.error || "Billing portal isn't available yet.");
    } catch (_) { alert("Couldn't reach the billing portal."); }
    setBusy(false);
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: "#f1f5f9" }}>
      <div className="flex items-center gap-3 px-4 h-14 text-white" style={{ background: NAVY }}>
        <img src="/huddle-icon.png" alt="Huddle" className="w-7 h-7 rounded-md" />
        <div className="font-bold">Huddle</div>
        {memberships && memberships.length > 1 ? (
          <div className="relative">
            <button onClick={() => setOrgMenu(o => !o)} className="flex items-center gap-1 text-sm opacity-90 hover:opacity-100">{org.name}<ChevronDown size={14} /></button>
            {orgMenu && <><div className="fixed inset-0 z-30" onClick={() => setOrgMenu(false)} />
              <div className="absolute z-40 mt-1 w-56 bg-white text-slate-700 rounded-xl shadow-lg border border-slate-200 p-1">
                {memberships.map(m => <button key={m.org_id} onClick={() => { onPickOrg(m.org_id); setOrgMenu(false); }} className={`w-full text-left text-sm px-2.5 py-1.5 rounded-lg hover:bg-slate-50 ${m.org_id === org.id ? "font-semibold" : ""}`}>{m.organizations?.name}</button>)}
              </div></>}
          </div>
        ) : <span className="text-sm opacity-80">{org.name}</span>}
        <button onClick={onSignOut} className="ml-auto text-xs px-2.5 h-7 rounded-md text-white" style={{ background: "#ffffff1f" }}>Sign out</button>
      </div>

      <div className="max-w-2xl mx-auto py-10 px-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">{org.status === "cancelled" || org.status === "suspended" ? "Your subscription has ended" : "Subscribe to start using Huddle"}</h1>
          <p className="text-sm text-slate-500 mt-2">{canPay ? "Choose a plan to unlock scheduling, time tracking and billing for your studio." : "This studio doesn't have an active subscription yet."}</p>
        </div>

        {!canPay ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-600">
            Ask an owner or admin of <b>{org.name}</b> to subscribe, then you'll be able to sign in and use Huddle.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            {plans === null && <div className="text-sm text-slate-400 py-4 text-center">Loading plans…</div>}
            {plans !== null && plans.length === 0 && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{plansMsg || "No plans found. Add products with recurring prices in Stripe."}</div>}
            {plans !== null && plans.length > 0 && (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))" }}>
                {plans.map(p => <PlanCard key={p.priceId} plan={p} onChoose={subscribe} busy={busy} dark ctaLabel="Subscribe" />)}
              </div>
            )}
            <div className="mt-4 text-center">
              <a href="mailto:hello@thealloy.com?subject=Huddle%20sign-up%20help" className="text-xs text-slate-500 hover:text-slate-700 underline">Trouble signing up or signing in? Get in touch</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
