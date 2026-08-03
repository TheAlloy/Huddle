import React, { useState, useEffect, useMemo } from "react";
import { sb } from "../lib/supabase.js";
import { can } from "../lib/permissions.js";
import { toISO, fmtH } from "../lib/dates.js";
import { NAVY } from "../ui.jsx";
import { Play, Square, Clock } from "lucide-react";

/** The condensed running-timer strip that sits on the Schedule page (like the studio dashboard). */
export default function MiniTracker({ org, me, data, reload }) {
  const [run, setRun] = useState(() => { try { return JSON.parse(localStorage.getItem("cad_run_" + me.id) || "null"); } catch { return null; } });
  const [now, setNow] = useState(Date.now());
  const [sel, setSel] = useState("");
  const [selPhase, setSelPhase] = useState("");
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const projectById = useMemo(() => Object.fromEntries(data.projects.map(p => [p.id, p])), [data.projects]);

  if (!can(me, "time.track")) return null;

  const today = toISO(new Date());
  const totalToday = (data.timeLogs || []).filter(l => l.membership_id === me.id && l.log_date === today).reduce((s, l) => s + l.minutes, 0);
  const setRunning = (r) => { setRun(r); if (r) localStorage.setItem("cad_run_" + me.id, JSON.stringify(r)); else localStorage.removeItem("cad_run_" + me.id); };
  const elapsed = run ? Math.floor((now - run.startedAt) / 1000) : 0;
  const clock = (s) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, "0")).join(":");
  const start = () => { if (!sel) return; setRunning({ projectId: sel, phaseId: selPhase || null, startedAt: Date.now() }); };
  const stop = async () => { const minutes = Math.max(1, Math.round(elapsed / 60)); await sb.from("time_logs").insert({ org_id: org.id, membership_id: me.id, project_id: run.projectId, phase_id: run.phaseId, log_date: today, minutes, source: "timer" }); setRunning(null); reload(); };
  const runProj = run && projectById[run.projectId];
  const runPhase = run && runProj && (runProj.phases || []).find(x => x.id === run.phaseId);
  const phases = projectById[sel]?.phases || [];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-white shrink-0 text-sm flex-wrap">
      <Clock size={15} className="text-slate-400" />
      {run ? (<>
        <span className="font-bold tabular-nums text-base" style={{ color: NAVY }}>{clock(elapsed)}</span>
        <span className="text-slate-600 truncate">{runProj ? (runProj.code || runProj.name) : "Tracking"}{runPhase ? " · " + runPhase.name : ""}</span>
        <button onClick={stop} className="ml-1 flex items-center gap-1 text-xs font-semibold text-white rounded px-2 py-1" style={{ background: "#eb5757" }}><Square size={12} /> Stop &amp; log</button>
      </>) : (<>
        <select className="text-sm outline-none border border-slate-200 rounded px-2 py-1 max-w-[190px]" value={sel} onChange={e => { setSel(e.target.value); setSelPhase(""); }}>
          <option value="">Track time on…</option>
          {data.projects.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + " · " : ""}{p.name}</option>)}
        </select>
        {phases.length > 0 && <select className="text-sm outline-none border border-slate-200 rounded px-2 py-1 max-w-[130px]" value={selPhase} onChange={e => setSelPhase(e.target.value)}>
          <option value="">Any phase</option>{phases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
        </select>}
        <button onClick={start} disabled={!sel} className="flex items-center gap-1 text-xs font-semibold text-white rounded px-2 py-1 disabled:opacity-40" style={{ background: NAVY }}><Play size={12} /> Start</button>
      </>)}
      <span className="ml-auto text-xs text-slate-400">Logged today <b className="text-slate-600">{fmtH(totalToday / 60)}h</b></span>
    </div>
  );
}
