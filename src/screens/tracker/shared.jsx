// Shared time-tracker logic — the single owner of running-timer state and the
// derived "what can I track today" data. Consumed by the Tracker screen, the
// header timer, and the TimerOverrunGuard (and later the merged Time screen).
//
// Slice 3 (docs/time-tracker-plan.md): the timer's source of truth is the
// running_timers table (one row per member, self-visible via RLS). A
// localStorage mirror (`tracker_run_<memberId>`) remains for instant boot and
// for the `huddle_tracking` flag desktop/main.js reads for its minimize
// reminder. Realtime keeps a second device in sync; the demo client's channel
// stub makes that a silent no-op in demo mode.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { sb } from "../../lib/supabase.js";
import { NAVY, toISO, startOfDay, hm, lsGet, lsSet, mapData, makeHandlers } from "../../studio/core.jsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Trash2, Square } from "lucide-react";

const keyFor = (meId) => "tracker_run_" + meId;

// A timer that outlives the workday is a forgotten timer: cap what it can log.
export const capMinutesFor = (dailyHours) => Math.max(Number(dailyHours) || 8, 12) * 60;

/* ------------------------- module-level timer store ------------------------ */
// One store shared by every hook instance in the tab, so a start/stop in one
// component is visible everywhere immediately; the DB row is the truth that
// arrives on mount (and via realtime from other devices).
const store = { meId: null, run: null, chanMeId: null, chan: null };
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

const toRun = (row) => row ? { projectId: row.project_id || null, phaseId: row.phase_id || null, taskId: row.task_id || null, startedAt: new Date(row.started_at).getTime() } : null;
const writeTrackingFlag = (run) => { try { localStorage.setItem("huddle_tracking", run ? "1" : "0"); } catch (_) {} };

function applyRun(meId, run) {
  if (store.meId !== meId) return;
  store.run = run;
  lsSet(keyFor(meId), run);
  writeTrackingFlag(run);
  notify();
}

function ensure(meId) {
  if (!meId || store.meId === meId) return;
  store.meId = meId;
  store.run = lsGet(keyFor(meId)); // instant boot; DB row replaces it below
  writeTrackingFlag(store.run);
  Promise.resolve(sb.from("running_timers").select("*").eq("membership_id", meId).maybeSingle())
    .then(({ data: row }) => applyRun(meId, toRun(row)))
    .then(null, () => {});
  if (store.chanMeId !== meId && typeof sb.channel === "function") {
    if (store.chan && sb.removeChannel) { try { sb.removeChannel(store.chan); } catch (_) {} }
    store.chanMeId = meId;
    store.chan = sb.channel("running_timer_" + meId)
      .on("postgres_changes", { event: "*", schema: "public", table: "running_timers", filter: "membership_id=eq." + meId },
        (payload) => { const row = payload?.new?.membership_id ? payload.new : null; applyRun(meId, toRun(row)); })
      .subscribe();
  }
}

const persistStart = async (orgId, meId, run) => {
  await sb.from("running_timers").delete().eq("membership_id", meId);
  await sb.from("running_timers").insert({ org_id: orgId, membership_id: meId, project_id: run.projectId, phase_id: run.phaseId, task_id: run.taskId, started_at: new Date(run.startedAt).toISOString() });
};
const persistClear = async (meId) => { await sb.from("running_timers").delete().eq("membership_id", meId); };

export function useRunningTimer(meId, { addTimeLog, orgId, dailyHours } = {}) {
  const [run, setRunState] = useState(() => (meId ? lsGet(keyFor(meId)) : null));
  const capMinutes = capMinutesFor(dailyHours);

  useEffect(() => {
    if (!meId) { setRunState(null); return; }
    ensure(meId);
    const read = () => setRunState(store.meId === meId ? store.run : null);
    read();
    listeners.add(read);
    window.addEventListener("storage", read); // same-profile tabs without realtime
    return () => { listeners.delete(read); window.removeEventListener("storage", read); };
  }, [meId]);

  const start = useCallback((projectId, phaseId) => {
    if (!projectId) return;
    const r = { projectId, phaseId: phaseId || null, taskId: null, startedAt: Date.now() };
    applyRun(meId, r);
    persistStart(orgId, meId, r).catch(() => {});
  }, [meId, orgId]);

  const startTask = useCallback((taskId) => {
    if (!taskId) return;
    const r = { projectId: null, phaseId: null, taskId, startedAt: Date.now() };
    applyRun(meId, r);
    persistStart(orgId, meId, r).catch(() => {});
  }, [meId, orgId]);

  // Over the cap, time is attributed to the day the timer STARTED — a timer
  // forgotten overnight must not write a phantom day onto today.
  const stop = useCallback((todayISO, { note, minutes } = {}) => {
    const r = store.meId === meId ? store.run : null;
    if (!r || !addTimeLog) return;
    const cap = capMinutesFor(dailyHours);
    const elapsedMin = Math.round((Date.now() - r.startedAt) / 60000);
    const over = elapsedMin > cap;
    const mins = Math.max(1, Math.min(minutes != null ? minutes : elapsedMin, cap));
    const date = over ? toISO(startOfDay(new Date(r.startedAt))) : todayISO;
    addTimeLog({ memberId: meId, projectId: r.projectId, phaseId: r.phaseId, taskId: r.taskId, date, minutes: mins, source: "timer", note: note || null });
    applyRun(meId, null);
    persistClear(meId).catch(() => {});
  }, [meId, addTimeLog, dailyHours]);

  const cancel = useCallback(() => {
    applyRun(meId, null);
    persistClear(meId).catch(() => {});
  }, [meId]);

  return { run, start, startTask, stop, cancel, capMinutes };
}

/* ------------------------------ labels & today ----------------------------- */
// Label/color helpers over the mapped org data.
export function makeLabels(data) {
  const projById = (id) => data.projects.find((p) => p.id === id);
  const clientOf = (pid) => { const pr = projById(pid); return pr && data.clients.find((c) => c.id === pr.clientId); };
  const labProj = (pid) => { const pr = projById(pid); const cl = clientOf(pid); return pr ? `${cl ? cl.name + " - " : ""}${pr.name}` : "—"; };
  const labTop = (pid) => { const pr = projById(pid); const cl = clientOf(pid); return pr ? `${cl ? cl.name + " · " : ""}${pr.index}` : "—"; };
  const phName = (pid, phid) => { const pr = projById(pid); const ph = pr && phid && (pr.phases || []).find((x) => x.id === phid); return ph ? ph.name : ""; };
  const colorOf = (pid) => { const cl = clientOf(pid); return cl ? cl.color : "#64748b"; };
  const taskById = (id) => (data.internalTasks || []).find((t) => t.id === id);
  const runTop = (run) => run ? (run.taskId ? "Task · " + ((taskById(run.taskId) || {}).title || "task") : labProj(run.projectId)) : "—";
  const runColor = (run) => run ? (run.taskId ? NAVY : colorOf(run.projectId)) : "#64748b";
  return { projById, clientOf, labProj, labTop, phName, colorOf, taskById, runTop, runColor };
}

// Everything the member can track against today, plus what's already logged.
export function todayTracking(data, meId, todayISO) {
  const seen = new Set(), bubbles = [];
  const addBub = (pid, phid) => { if (!pid) return; const k = pid + "|" + (phid || ""); if (seen.has(k)) return; seen.add(k); bubbles.push({ projectId: pid, phaseId: phid || null }); };
  data.assignments.filter((a) => a.memberId === meId && a.kind === "work" && a.start <= todayISO && a.end >= todayISO).forEach((a) => addBub(a.projectId, a.phaseId));
  const internalAsgToday = data.assignments.filter((a) => a.memberId === meId && a.kind === "internal" && a.taskId && a.start <= todayISO && a.end >= todayISO);
  const asgTaskIds = new Set(internalAsgToday.map((a) => a.taskId));
  internalAsgToday.forEach((a) => { const k = "task:" + a.taskId; if (seen.has(k)) return; seen.add(k); bubbles.push({ taskId: a.taskId, internal: true }); });
  const myTasks = (data.internalTasks || []).filter((t) => t.assigneeId === meId && t.status !== "done" && !asgTaskIds.has(t.id));
  const todayEntries = (data.timeLogs || []).filter((l) => l.memberId === meId && l.date === todayISO);
  const minsFor = (pid, phid) => todayEntries.filter((l) => !l.taskId && l.projectId === pid && (l.phaseId || "") === (phid || "")).reduce((s, l) => s + l.minutes, 0);
  const minsForTask = (tid) => todayEntries.filter((l) => l.taskId === tid).reduce((s, l) => s + l.minutes, 0);
  const todayMins = todayEntries.reduce((s, l) => s + l.minutes, 0);
  return { bubbles, myTasks, todayEntries, minsFor, minsForTask, todayMins };
}

/* ----------------------------- overrun guard ------------------------------ */
// Rendered once at app level (any screen): when the running timer has passed
// its cap, prompt instead of silently logging a phantom span. The member can
// log the capped time (or adjust it) to the day the timer started, or discard.
export function TimerOverrunGuard({ org, me, data: cadData, reload }) {
  const data = useMemo(() => mapData(cadData), [cadData]);
  const H = useMemo(() => makeHandlers(org, reload, cadData), [org, cadData]); // eslint-disable-line
  const dailyHours = me.daily_hours || 8;
  const { run, stop, cancel, capMinutes } = useRunningTimer(me.id, { addTimeLog: H.addTimeLog, orgId: org.id, dailyHours });
  const [, tick] = useState(0);
  useEffect(() => { if (!run) return; const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, [run]);
  if (!run || (Date.now() - run.startedAt) / 60000 <= capMinutes) return null;
  return <OverrunDialog key={run.startedAt} run={run} data={data} capMinutes={capMinutes} stop={stop} cancel={cancel} />;
}

function OverrunDialog({ run, data, capMinutes, stop, cancel }) {
  const [open, setOpen] = useState(true);
  const [h, setH] = useState(Math.floor(capMinutes / 60));
  const [m, setM] = useState(capMinutes % 60);
  const { runTop } = makeLabels(data);
  const started = new Date(run.startedAt);
  const startDay = toISO(startOfDay(started));
  const elapsedMin = Math.round((Date.now() - run.startedAt) / 60000);
  const log = () => { stop(toISO(startOfDay(new Date())), { minutes: Math.max(1, Number(h || 0) * 60 + Number(m || 0)) }); setOpen(false); };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Timer left running</DialogTitle>
          <DialogDescription>
            The timer on {runTop(run)} started on {startDay} and has now run for {hm(elapsedMin)}.
            Log the time below to {startDay} (capped at {hm(capMinutes)}), or discard it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <InputGroup className="w-20"><InputGroupInput type="number" min="0" value={h} onChange={(e) => setH(e.target.value)} /><InputGroupAddon align="inline-end"><InputGroupText>h</InputGroupText></InputGroupAddon></InputGroup>
          <InputGroup className="w-20"><InputGroupInput type="number" min="0" max="59" value={m} onChange={(e) => setM(e.target.value)} /><InputGroupAddon align="inline-end"><InputGroupText>m</InputGroupText></InputGroupAddon></InputGroup>
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={() => { cancel(); setOpen(false); }}><Trash2 data-icon="inline-start" /> Discard</Button>
          <Button onClick={log}><Square data-icon="inline-start" /> Stop &amp; log</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
