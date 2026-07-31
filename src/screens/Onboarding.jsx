import React, { useState } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, Field, inputCls, NAVY, Pill } from "../ui.jsx";
import { ROLES, ROLE_KEYS } from "../lib/permissions.js";
import { Check, Plus, Trash2 } from "lucide-react";

/** First-run wizard. Creates the organization, invites the team, adds a first client/project. */
export default function Onboarding({ user, onDone }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [studio, setStudio] = useState("");
  const [yourName, setYourName] = useState(user?.user_metadata?.full_name || "");
  const [orgId, setOrgId] = useState(null);

  const [rows, setRows] = useState([{ email: "", role: "member" }]);
  const [invited, setInvited] = useState(0);

  const [clientName, setClientName] = useState("");
  const [projectName, setProjectName] = useState("");

  const createOrg = async () => {
    if (!studio.trim()) { setErr("What's your studio called?"); return; }
    setBusy(true); setErr("");
    try {
      const { data, error } = await sb.rpc("create_organization", { org_name: studio.trim(), person_name: yourName.trim() || null });
      if (error) throw error;
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

  const finish = async () => {
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
    onDone(orgId);
  };

  const Steps = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map(n => (
        <div key={n} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full grid place-items-center text-xs font-bold"
            style={{ background: step >= n ? NAVY : "#e2e8f0", color: step >= n ? "#fff" : "#94a3b8" }}>
            {step > n ? <Check size={14} /> : n}
          </div>
          {n < 3 && <div className="w-10 h-0.5" style={{ background: step > n ? NAVY : "#e2e8f0" }} />}
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
            <Btn variant="dark" className="w-full" onClick={finish} disabled={busy}>{busy ? "Finishing…" : "Finish setup"}</Btn>
          </>)}

        </div>
      </div>
    </div>
  );
}
