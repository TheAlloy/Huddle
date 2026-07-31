import React, { useState } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, Card, Empty, Avatar, Pill, Field, inputCls, Modal } from "../ui.jsx";
import { can } from "../lib/permissions.js";
import { Plus, Lock } from "lucide-react";

/** Shown wherever someone's permissions don't allow a screen. */
export function NoAccess({ what }) {
  return (<div className="h-full grid place-items-center p-6">
    <div className="text-center max-w-sm">
      <Lock size={28} className="mx-auto text-slate-300 mb-3" />
      <div className="font-semibold text-slate-700 mb-1">You don't have access to {what}</div>
      <p className="text-sm text-slate-400">Ask an owner or administrator in your studio to give you access on the People page.</p>
    </div>
  </div>);
}

/* ── Clients & projects: real, working setup screens ───────────────────────── */
export function ProjectsScreen({ org, me, data, reload }) {
  const [modal, setModal] = useState(null);
  const mayProjects = can(me, "projects.manage");
  const mayClients = can(me, "clients.manage");
  if (!can(me, "schedule.view") && !mayProjects) return <NoAccess what="projects" />;

  const clientName = (id) => (data.clients.find(c => c.id === id) || {}).name || "—";

  return (<div className="p-4 space-y-4 overflow-y-auto h-full">
    <h2 className="text-base font-bold text-slate-800">Clients &amp; projects</h2>

    <Card title="Clients" action={mayClients && <Btn onClick={() => setModal({ type: "client" })}><Plus size={14} /> Add client</Btn>}>
      {data.clients.length === 0 && <Empty title="No clients yet">Add your first client to start booking work.</Empty>}
      <div className="divide-y divide-slate-100">
        {data.clients.map(c => (
          <div key={c.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-3 h-3 rounded-sm" style={{ background: c.color || "#94a3b8" }} />
            <span className="text-slate-800">{c.name}</span>
            <span className="ml-auto text-xs text-slate-400">{c.payment_terms || 30} day terms</span>
          </div>
        ))}
      </div>
    </Card>

    <Card title="Projects" action={mayProjects && <Btn onClick={() => setModal({ type: "project" })}><Plus size={14} /> Add project</Btn>}>
      {data.projects.length === 0 && <Empty title="No projects yet">Projects hold the phases you schedule and bill against.</Empty>}
      <div className="divide-y divide-slate-100">
        {data.projects.map(p => (
          <div key={p.id} className="flex items-center gap-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="text-slate-800 truncate">{p.code ? p.code + " · " : ""}{p.name}</div>
              <div className="text-xs text-slate-400">{clientName(p.client_id)} · {(p.phases || []).length} phase{(p.phases || []).length === 1 ? "" : "s"}</div>
            </div>
            <span className="ml-auto text-xs text-slate-500">£{Number(p.cost || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </Card>

    {modal?.type === "client" && <ClientModal org={org} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    {modal?.type === "project" && <ProjectModal org={org} clients={data.clients} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
  </div>);
}

function ClientModal({ org, onClose, onSaved }) {
  const [name, setName] = useState(""); const [terms, setTerms] = useState(30); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); await sb.from("clients").insert({ org_id: org.id, name: name.trim(), color: "#2f80ed", payment_terms: Number(terms) || 30 }); setBusy(false); onSaved(); };
  return (<Modal title="Add client" onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !name.trim()}>Add</Btn></>}>
    <Field label="Client name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
    <Field label="Payment terms (days)"><input type="number" className={inputCls} value={terms} onChange={e => setTerms(e.target.value)} /></Field>
  </Modal>);
}

function ProjectModal({ org, clients, onClose, onSaved }) {
  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [clientId, setClientId] = useState("");
  const [cost, setCost] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await sb.from("projects").insert({ org_id: org.id, name: name.trim(), code: code.trim() || name.trim().slice(0, 6).toUpperCase(), client_id: clientId || null, cost: Number(cost) || 0, phases: [] });
    setBusy(false); onSaved();
  };
  return (<Modal title="Add project" onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !name.trim()}>Add</Btn></>}>
    <Field label="Project name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Code"><input className={inputCls} value={code} onChange={e => setCode(e.target.value)} placeholder="HID0514" /></Field>
      <Field label="Value (£)"><input type="number" className={inputCls} value={cost} onChange={e => setCost(e.target.value)} /></Field>
    </div>
    <Field label="Client"><select className={inputCls} value={clientId} onChange={e => setClientId(e.target.value)}>
      <option value="">— none —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select></Field>
  </Modal>);
}

/* ── Placeholders for the big feature screens being ported across ─────────── */
export function ComingSoon({ title, blurb, bullets }) {
  return (<div className="p-4 h-full overflow-y-auto">
    <Card title={title}>
      <p className="text-sm text-slate-600 mb-3">{blurb}</p>
      <ul className="text-sm text-slate-500 list-disc pl-5 space-y-1">{(bullets || []).map((b, i) => <li key={i}>{b}</li>)}</ul>
      <p className="text-xs text-slate-400 mt-4">
        The platform layer around this screen — logins, permissions, your studio's data separation — is already live.
      </p>
    </Card>
  </div>);
}

/* ── A working tracker so 'time tracking only' users have a real job to do ── */
export function TrackerScreen({ org, me, data, reload }) {
  const [running, setRunning] = useState(null);
  const [now, setNow] = useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!can(me, "time.track")) return <NoAccess what="time tracking" />;

  const today = new Date().toISOString().slice(0, 10);
  const mine = (data.timeLogs || []).filter(l => l.membership_id === me.id && l.log_date === today);
  const total = mine.reduce((s, l) => s + (l.minutes || 0), 0);
  const elapsed = running ? Math.floor((now - running.startedAt) / 1000) : 0;
  const clock = (s) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, "0")).join(":");

  const stop = async () => {
    const minutes = Math.max(1, Math.round(elapsed / 60));
    await sb.from("time_logs").insert({ org_id: org.id, membership_id: me.id, project_id: running.projectId || null, log_date: today, minutes, source: "timer" });
    setRunning(null); reload();
  };

  return (<div className="p-4 space-y-4 overflow-y-auto h-full max-w-2xl">
    <h2 className="text-base font-bold text-slate-800">Time tracker</h2>
    <Card title={running ? "Tracking now" : "Start tracking"}>
      {running ? (<div className="flex items-center gap-3">
        <div className="text-2xl font-bold tabular-nums" style={{ color: "#1f2d4e" }}>{clock(elapsed)}</div>
        <div className="text-sm text-slate-500">{(data.projects.find(p => p.id === running.projectId) || {}).name || "No project"}</div>
        <Btn variant="danger" className="ml-auto" onClick={stop}>Stop &amp; log</Btn>
      </div>) : (<div className="flex items-center gap-2 flex-wrap">
        <select className={inputCls + " w-56"} onChange={e => e.target.value && setRunning({ projectId: e.target.value, startedAt: Date.now() })} defaultValue="">
          <option value="">Choose a project…</option>
          {data.projects.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + " · " : ""}{p.name}</option>)}
        </select>
        <span className="text-xs text-slate-400">Pick a project to start the timer.</span>
      </div>)}
    </Card>

    <Card title={`Logged today — ${Math.floor(total / 60)}h ${total % 60}m`}>
      {mine.length === 0 && <Empty title="Nothing logged yet today">Start the timer above, and your hours will appear here.</Empty>}
      <div className="divide-y divide-slate-100">
        {mine.map(l => (<div key={l.id} className="flex items-center gap-3 py-2 text-sm">
          <span className="text-slate-700">{(data.projects.find(p => p.id === l.project_id) || {}).name || "—"}</span>
          <Pill>{l.source}</Pill>
          <span className="ml-auto font-medium text-slate-700">{Math.floor(l.minutes / 60)}h {l.minutes % 60}m</span>
        </div>))}
      </div>
    </Card>
  </div>);
}

/* ── People directory (read-only view for those without team.manage) ──────── */
export function TeamLite({ members }) {
  return (<div className="p-4 overflow-y-auto h-full">
    <Card title="Your team">
      <div className="divide-y divide-slate-100">
        {members.map((m, i) => (<div key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
          <Avatar name={m.display_name || m.email} i={i} />
          <div><div className="text-slate-800">{m.display_name || m.email}</div><div className="text-xs text-slate-400">{m.job_title || m.role}</div></div>
        </div>))}
      </div>
    </Card>
  </div>);
}
