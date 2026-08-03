import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, Field, inputCls, NAVY, Pill } from "../ui.jsx";
import { ROLES, ROLE_KEYS } from "../lib/permissions.js";
import { USAGE_OPTIONS } from "../lib/terms.js";
import { Check, Plus, Trash2 } from "lucide-react";

/** First-run wizard. Creates the organization, invites the team, adds a first client/project, and picks a plan. */
export default function Onboarding({ user, onDone }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [studio, setStudio] = useState("");
  const [yourName, setYourName] = useState(user?.user_metadata?.full_name || "");
  const [usage, setUsage] = useState("consultancy");
  const [usageOther, setUsageOther] = useState("");
  const [orgId, setOrgId] = useState(null);

  const [rows, setRows] = useState([{ email: "", role: "member" }]);
  const [invited, setInvited] = useState(0);

  const [clientName, setClientName] = useState("");
  const [projectName, setProjectName] = useState("");

  const [plans, setPlans] = useState(null);
  const [plansMsg, setPlansMsg] = useState("");

  const createOrg = async () => {
    if (!studio.trim()) { setErr("What's your studio called?"); return; }
    setBusy(true); setErr("");
    try {
      const { data, error } = await sb.rpc("create_organization", { org_name: studio.trim(), person_name: yourName.trim() || null });
      if (error) throw error;
      try { await sb.from("organizations").update({ settings: { usage, ...(usage === "other" && usageOther.trim() ? { usageOther: usageOther.trim() } : {}) } }).eq("id", data); } catch (_) {}
      setOrgId(data); setStep(2);
    } catch (e) { setErr(e.message || "Could not create your studio."); }
    setBusy(false);
  };

  const sendInvites = async () => {
    const list = rows.filter(r => r.email.trim());
    if (!list.length) { setStep(3); return; }
    setBusy(true); setErr("");
    try {
      let ok = 0;
      for (const r of list) {
        const res = await fetch("/api/invite", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId, email: r.email.trim(), role: r.role,
            accessToken: (await sb.auth.getSession()).data.session?.access_token }),
        });
        if (res.ok) ok++;
      }
      setInvited(ok); setStep(3);
    } catch (e) { setErr("Invites could not be sent right now — you can invite people later from the People page."); setStep(3); }
    setBusy(false);
  };

  // Save the optional first client/project, then move to plan selection.
  const saveFirstProject = async () => {
    setBusy(true);
    try {
      if (clientName.trim()) {
        const { data: c } = await sb.from("clients").insert({ org_id: orgId, name: clientName.trim(), color: "#2f80ed" }).select().single();
        if (projectName.trim()) {
          await sb.from("projects").insert({ org_id: orgId, client_id: c?.id || null, name: projectName.trim(), code: projectName.trim().slice(0, 6).toUpperCase(), phases: [] });
        }
      }
    } catch (_) {}
    setBusy(false);
    setStep(4);
  };

  // Load plans from Stripe when we reach the plan step.
  useEffect(() => {
    if (step !== 4 || plans !== null) return;
    fetch("/api/plans").then(r => r.json()).then(b => {
      if (b.configured === false) { setPlans([]); setPlansMsg("Billing isn't set up yet — you can start now and add a plan later in Settings."); }
      else if (b.error) { setPlans([]); setPlansMsg(b.error); }
      else setPlans(b.plans || []);
    }).catch(() => { setPlans([]); setPlansMsg("Couldn't load plans — you can choose one later in Settings."); });
  }, [step, plans]);

  const fmtPrice = (p) => {
    if (p.amount == null) return "";
    if (p.amount === 0) return "Free";
    const sym = p.currency === "GBP" ? "£" : p.currency === "USD" ? "$" : p.currency === "EUR" ? "€" : p.currency + " ";
    const n = Number.isInteger(p.amount) ? p.amount : p.amount.toFixed(2);
    return `${sym}${n}`;
  };
  const perInterval = (p) => p.interval === "year" ? "/yr" : p.interval === "week" ? "/wk" : "/mo";

  const choosePlan = async (priceId) => {
    setBusy(true); setErr("");
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, priceId, accessToken: token }) });
      const body = await res.json();
      if (body.url) { window.location.href = body.url; return; }
      setErr(body.error || "Couldn't start checkout — you can pick a plan later in Settings.");
    } catch (_) { setErr("Couldn't reach checkout — you can pick a plan later in Settings."); }
    setBusy(false);
  };

  const finishFree = () => onDone(orgId);

  const Steps = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3, 4].map(n => (
        <div key={n} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full grid place-items-center text-xs font-bold"
            style={{ background: step >= n ? NAVY : "#e2e8f0", color: step >= n ? "#fff" : "#94a3b8" }}>
            {step > n ? <Check size={14} /> : n}
          </div>
          {n < 4 && <div className="w-8 h-0.5" style={{ background: step > n ? NAVY : "#e2e8f0" }} />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto" style={{ background: "#f1f5f9" }}>
      <div className="max-w-xl mx-auto py-10 px-4">
        <Steps />
        <div className="bg-white border border-slate-200 rounded-2xl p-6">

          {step === 1 && (<>
            <h1 className="text-lg font-bold text-slate-800 mb-1">Set up your studio</h1>
            <p className="text-sm text-slate-500 mb-5">This is the workspace your whole team will share.</p>
            <Field label="Studio name"><input className={inputCls} value={studio} onChange={e => setStudio(e.target.value)} placeholder="e.g. Alloy" autoFocus /></Field>
            <Field label="Your name"><input className={inputCls} value={yourName} onChange={e => setYourName(e.target.value)} placeholder="Alex Dangerfield" /></Field>
            <Field label="What will you use it for?">
              <div className="space-y-1.5">{USAGE_OPTIONS.map(o => (
                <label key={o.key} className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${usage === o.key ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                  <input type="radio" name="usage" checked={usage === o.key} onChange={() => setUsage(o.key)} className="mt-0.5" />
                  <span><span className="text-sm font-medium text-slate-800">{o.label}</span><span className="block text-xs text-slate-500">{o.blurb}</span></span>
                </label>))}</div>
              {usage === "other" && <input className={inputCls + " mt-2"} value={usageOther} onChange={e => setUsageOther(e.target.value)} placeholder="How would you describe it?" />}
              <p className="text-[11px] text-slate-400 mt-1.5">This tailors the wording (e.g. “clients” vs “teams”). You can change it any time in Settings.</p>
            </Field>
            {err && <div className="text-xs text-red-600 mb-3">{err}</div>}
            <Btn variant="dark" className="w-full" onClick={createOrg} disabled={busy}>{busy ? "Creating…" : "Continue"}</Btn>
          </>)}

          {step === 2 && (<>
            <h1 className="text-lg font-bold text-slate-800 mb-1">Invite your team</h1>
            <p className="text-sm text-slate-500 mb-5">They'll get an email invitation. You can change anyone's access later.</p>
            <div className="space-y-2 mb-3">
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <input className={inputCls + " flex-1"} value={r.email} placeholder="name@studio.com"
                    onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                  <select className={inputCls + " w-44"} value={r.role}
                    onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}>
                    {ROLE_KEYS.filter(k => k !== "owner").map(k => <option key={k} value={k}>{ROLES[k].label}</option>)}
                  </select>
                  {rows.length > 1 && <button className="text-slate-300 hover:text-red-500 px-1" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
            <button className="text-xs font-semibold text-blue-600 flex items-center gap-1 mb-4" onClick={() => setRows([...rows, { email: "", role: "member" }])}><Plus size={13} /> Add another</button>
            <p className="text-xs text-slate-400 mb-4">{ROLES[rows[0]?.role]?.blurb}</p>
            {err && <div className="text-xs text-amber-700 mb-3">{err}</div>}
            <div className="flex gap-2">
              <Btn variant="outline" onClick={() => setStep(3)}>Skip for now</Btn>
              <Btn variant="dark" className="flex-1" onClick={sendInvites} disabled={busy}>{busy ? "Sending…" : "Send invitations"}</Btn>
            </div>
          </>)}

          {step === 3 && (<>
            <h1 className="text-lg font-bold text-slate-800 mb-1">Add your first project</h1>
            <p className="text-sm text-slate-500 mb-5">Optional — you can do this later. {invited > 0 && <Pill color="#27ae60">{invited} invitation{invited > 1 ? "s" : ""} sent</Pill>}</p>
            <Field label="Client name"><input className={inputCls} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Clear-Com" /></Field>
            <Field label="Project name"><input className={inputCls} value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. MARS Rack" /></Field>
            <div className="flex gap-2">
              <Btn variant="outline" onClick={() => setStep(4)}>Skip</Btn>
              <Btn variant="dark" className="flex-1" onClick={saveFirstProject} disabled={busy}>{busy ? "Saving…" : "Continue"}</Btn>
            </div>
          </>)}

          {step === 4 && (<>
            <h1 className="text-lg font-bold text-slate-800 mb-1">Choose your plan</h1>
            <p className="text-sm text-slate-500 mb-5">Pick a plan to start your subscription, or start now and decide later.</p>
            {plans === null && <div className="text-sm text-slate-400 py-4">Loading plans…</div>}
            {plans !== null && plans.length === 0 && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">{plansMsg}</div>}
            {plans !== null && plans.length > 0 && (
              <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
                {plans.map(p => (
                  <div key={p.priceId} className="rounded-xl border border-slate-200 p-3 flex flex-col">
                    <div className="font-semibold text-slate-800 text-sm">{p.name}</div>
                    <div className="text-lg font-bold text-slate-800">{fmtPrice(p)}<span className="text-xs font-normal text-slate-400">{p.amount ? perInterval(p) : ""}</span></div>
                    {p.description && <div className="text-[11px] text-slate-500 mb-1 leading-snug">{p.description}</div>}
                    {p.seats != null && <div className="text-[10px] text-slate-400 mb-1.5">Up to {p.seats} seats</div>}
                    <div className="mt-3"><Btn className="w-full justify-center" onClick={() => choosePlan(p.priceId)} disabled={busy}>Choose</Btn></div>
                  </div>
                ))}
              </div>
            )}
            {err && <div className="text-xs text-red-600 mb-3">{err}</div>}
            <button onClick={finishFree} disabled={busy} className="w-full text-sm text-slate-500 hover:text-slate-700 py-2">Start now, decide later →</button>
            <p className="text-[11px] text-slate-400 mt-1 text-center">You can subscribe or change plans any time in Settings.</p>
          </>)}

        </div>
      </div>
    </div>
  );
}
