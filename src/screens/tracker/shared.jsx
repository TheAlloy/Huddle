// Shared time-tracker logic — the single owner of running-timer state and the
// derived "what can I track today" data. Consumed by the Tracker screen and
// the header timer (and, later, the merged Time screen + header popover).
//
// Slice 1 (see docs/time-tracker-plan.md): storage is still localStorage
// (`tracker_run_<memberId>`); slice 3 swaps it for the running_timers table
// behind this same API. The `huddle_tracking` mirror is read by
// desktop/main.js for the minimize reminder — keep writing it.
import { useState, useEffect, useCallback } from "react";
import { NAVY, lsGet, lsSet } from "../../studio/core.jsx";

const keyFor = (meId) => "tracker_run_" + meId;

// In-tab change bus so every hook instance (screen, header, PiP wiring) sees a
// start/stop immediately instead of polling localStorage once a second.
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

const writeTrackingFlag = (run) => { try { localStorage.setItem("huddle_tracking", run ? "1" : "0"); } catch (_) {} };

export function useRunningTimer(meId, { addTimeLog } = {}) {
  const [run, setRun] = useState(() => (meId ? lsGet(keyFor(meId)) : null));

  useEffect(() => {
    if (!meId) { setRun(null); return; }
    const read = () => setRun(lsGet(keyFor(meId)));
    read();
    writeTrackingFlag(lsGet(keyFor(meId)));
    listeners.add(read);
    window.addEventListener("storage", read); // other tabs / devices sharing the profile
    return () => { listeners.delete(read); window.removeEventListener("storage", read); };
  }, [meId]);

  const setRunning = useCallback((r) => {
    lsSet(keyFor(meId), r);
    writeTrackingFlag(r);
    setRun(r);
    notify();
  }, [meId]);

  const start = useCallback((projectId, phaseId) => {
    if (!projectId) return;
    setRunning({ projectId, phaseId: phaseId || null, taskId: null, startedAt: Date.now() });
  }, [setRunning]);

  const startTask = useCallback((taskId) => {
    if (!taskId) return;
    setRunning({ projectId: null, phaseId: null, taskId, startedAt: Date.now() });
  }, [setRunning]);

  const stop = useCallback((todayISO) => {
    const r = meId ? lsGet(keyFor(meId)) : null;
    if (!r || !addTimeLog) return;
    const mins = Math.max(1, Math.round((Date.now() - r.startedAt) / 60000));
    addTimeLog({ memberId: meId, projectId: r.projectId, phaseId: r.phaseId, taskId: r.taskId, date: todayISO, minutes: mins, source: "timer" });
    setRunning(null);
  }, [meId, addTimeLog, setRunning]);

  const cancel = useCallback(() => setRunning(null), [setRunning]);

  return { run, start, startTask, stop, cancel };
}

// Label/color helpers over the mapped org data — previously cloned in
// Tracker.jsx and Schedule's DashTracker.
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
