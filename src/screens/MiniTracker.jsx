import React, { useState, useEffect, useMemo } from "react";
import { sb } from "../lib/supabase.js";
import { can } from "../lib/permissions.js";
import { toISO, fmtH } from "../lib/dates.js";

import { Play, Square, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const projLabel = (p) => (p.code ? p.code + " · " : "") + p.name;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-card shrink-0 text-sm flex-wrap">
      <Clock size={15} className="text-muted-foreground" />
      {run ? (<>
        <span className="font-medium tabular-nums text-base">{clock(elapsed)}</span>
        <span className="text-muted-foreground truncate">{runProj ? (runProj.code || runProj.name) : "Tracking"}{runPhase ? " · " + runPhase.name : ""}</span>
        <Button variant="destructive" size="sm" className="ml-1" onClick={stop}><Square data-icon="inline-start" /> Stop &amp; log</Button>
      </>) : (<>
        <Select value={sel} onValueChange={(v) => { setSel(v); setSelPhase(""); }}
          items={{ "": "Track time on…", ...Object.fromEntries(data.projects.map(p => [p.id, projLabel(p)])) }}>
          <SelectTrigger size="sm" className="w-48"><SelectValue/></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="">Track time on…</SelectItem>{data.projects.map(p => <SelectItem key={p.id} value={p.id}>{projLabel(p)}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        {phases.length > 0 && (
          <Select value={selPhase} onValueChange={setSelPhase}
            items={{ "": "Any phase", ...Object.fromEntries(phases.map(ph => [ph.id, ph.name])) }}>
            <SelectTrigger size="sm" className="w-36"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="">Any phase</SelectItem>{phases.map(ph => <SelectItem key={ph.id} value={ph.id}>{ph.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        )}
        <Button size="sm" onClick={start} disabled={!sel}><Play data-icon="inline-start" /> Start</Button>
      </>)}
      <span className="ml-auto text-xs text-muted-foreground">Logged today <span className="font-medium text-foreground">{fmtH(totalToday / 60)}h</span></span>
    </div>
  );
}
