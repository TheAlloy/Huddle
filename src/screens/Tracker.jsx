import React, { useState, useEffect, useMemo } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, Card, Empty, Field, inputCls, Modal, Pill, NAVY } from "../ui.jsx";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { toISO, parseISO, fmtH } from "../lib/dates.js";
import { Play, Square, Plus, Pencil, Trash2, Clock } from "lucide-react";

export default function Tracker({ org, me, data, reload }) {
  const [run, setRun] = useState(() => { try { return JSON.parse(localStorage.getItem("cad_run_" + me.id) || "null"); } catch { return null; } });
  const [now, setNow] = useState(Date.now());
  const [selProj, setSelProj] = useState("");
  const [selPhase, setSelPhase] = useState("");
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const mayManual = can(me, "time.manual");

  const projectById = useMemo(() => Object.fromEntries(data.projects.map(p => [p.id, p])), [data.projects]);
  const clientById = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])), [data.clients]);
  const today = toISO(new Date());
  const mineToday = useMemo(() => (data.timeLogs || []).filter(l => l.membership_id === me.id && l.log_date === today).sort((a, b) => (a.created_at || "") < (b.created_at || "") ? 1 : -1), [data.timeLogs, me.id, today]);
  const totalToday = mineToday.reduce((s, l) => s + (l.minutes || 0), 0);

  if (!can(me, "time.track")) return <NoAccess what="time tracking" />;

  const setRunning = (r) => { setRun(r); if (r) localStorage.setItem("cad_run_" + me.id, JSON.stringify(r)); else localStorage.removeItem("cad_run_" + me.id); };
  const elapsed = run ? Math.floor((now - run.startedAt) / 1000) : 0;
  const clock = (s) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, "0")).join(":");

  const start = () => { if (!selProj) return; setRunning({ projectId: selProj, phaseId: selPhase || null, startedAt: Date.now() }); };
  const stop = async () => {
    const minutes = Math.max(1, Math.round(elapsed / 60));
    await sb.from("time_logs").insert({ org_id: org.id, membership_id: me.id, project_id: run.projectId, phase_id: run.phaseId, log_date: today, minutes, source: "timer" });
    setRunning(null); reload();
  };

  const label = (l) => {
    const p = projectById[l.project_id]; const c = p && clientById[p.client_id];
    const ph = p && l.phase_id && (p.phases || []).find(x => x.id === l.phase_id);
    return { name: p ? (p.code || p.name) : "—", sub: ph ? ph.name : "", color: c ? c.color : "#64748b" };
  };
  const runProj = run && projectById[run.projectId];
  const runPhaseName = run && runProj && (runProj.phases || []).find(x => x.id === run.phaseId)?.name;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full max-w-2xl">
      <h2 className="text-base font-bold text-slate-800">Time tracker</h2>

      <Card title={run ? "Tracking now" : "Start the timer"}>
        {run ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-3xl font-bold tabular-nums" style={{ color: NAVY }}>{clock(elapsed)}</div>
            <div className="text-sm text-slate-600">{runProj ? (runProj.code || runProj.name) : "No project"}{runPhaseName ? " · " + runPhaseName : ""}</div>
            <Btn variant="danger" className="ml-auto" onClick={stop}><Square size={14} /> Stop &amp; log</Btn>
          </div>
        ) : (
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-medium text-slate-500 mb-1">Project</label>
              <select className={inputCls} value={selProj} onChange={e => { setSelProj(e.target.value); setSelPhase(""); }}>
                <option value="">Choose…</option>
                {data.projects.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + " · " : ""}{p.name}</option>)}
              </select>
            </div>
            {(projectById[selProj]?.phases || []).length > 0 &&
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-medium text-slate-500 mb-1">Phase</label>
                <select className={inputCls} value={selPhase} onChange={e => setSelPhase(e.target.value)}>
                  <option value="">Any</option>
                  {(projectById[selProj]?.phases || []).map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
                </select>
              </div>}
            <Btn variant="dark" onClick={start} disabled={!selProj}><Play size={14} /> Start</Btn>
          </div>
        )}
      </Card>

      <Card title={`Logged today — ${fmtH(totalToday / 60)}h`}
        action={mayManual && <Btn variant="outline" onClick={() => setManual(true)}><Plus size={14} /> Add manually</Btn>}>
        {mineToday.length === 0 && <Empty title="Nothing logged yet today">Start the timer above — your hours appear here.</Empty>}
        <div className="divide-y divide-slate-100">
          {mineToday.map(l => { const { name, sub, color } = label(l); return (
            <div key={l.id} className="flex items-center gap-2.5 py-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-slate-700">{name}{sub ? " · " + sub : ""}</span>
              <Pill>{l.source}</Pill>
              <span className="ml-auto font-medium text-slate-700">{fmtH(l.minutes / 60)}h</span>
              {mayManual && <><button className="text-slate-300 hover:text-blue-600" onClick={() => setEditing(l)}><Pencil size={13} /></button>
                <button className="text-slate-300 hover:text-red-500" onClick={async () => { await sb.from("time_logs").delete().eq("id", l.id); reload(); }}><Trash2 size={13} /></button></>}
            </div>); })}
        </div>
      </Card>

      {(manual || editing) && <LogModal org={org} me={me} data={data} entry={editing} projectById={projectById}
        onClose={() => { setManual(false); setEditing(null); }} onSaved={() => { setManual(false); setEditing(null); reload(); }} />}
    </div>
  );
}

function LogModal({ org, me, data, entry, projectById, onClose, onSaved }) {
  const [projectId, setProjectId] = useState(entry?.project_id || "");
  const [phaseId, setPhaseId] = useState(entry?.phase_id || "");
  const [date, setDate] = useState(entry?.log_date || toISO(new Date()));
  const [hours, setHours] = useState(entry ? Math.floor(entry.minutes / 60) : 1);
  const [mins, setMins] = useState(entry ? entry.minutes % 60 : 0);
  const [busy, setBusy] = useState(false);
  const phases = projectById[projectId]?.phases || [];
  const save = async () => {
    const minutes = Math.max(1, Number(hours) * 60 + Number(mins));
    setBusy(true);
    const row = { org_id: org.id, membership_id: me.id, project_id: projectId || null, phase_id: phaseId || null, log_date: date, minutes, source: "manual" };
    if (entry) await sb.from("time_logs").update(row).eq("id", entry.id);
    else await sb.from("time_logs").insert(row);
    setBusy(false); onSaved();
  };
  return (<Modal title={entry ? "Edit entry" : "Add hours"} onClose={onClose}
    footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn></>}>
    <Field label="Project"><select className={inputCls} value={projectId} onChange={e => { setProjectId(e.target.value); setPhaseId(""); }}>
      <option value="">— none —</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + " · " : ""}{p.name}</option>)}
    </select></Field>
    {phases.length > 0 && <Field label="Phase"><select className={inputCls} value={phaseId} onChange={e => setPhaseId(e.target.value)}>
      <option value="">Any</option>{phases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
    </select></Field>}
    <div className="grid grid-cols-3 gap-3">
      <Field label="Date"><input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} /></Field>
      <Field label="Hours"><input type="number" min="0" className={inputCls} value={hours} onChange={e => setHours(e.target.value)} /></Field>
      <Field label="Minutes"><input type="number" min="0" max="59" className={inputCls} value={mins} onChange={e => setMins(e.target.value)} /></Field>
    </div>
  </Modal>);
}
