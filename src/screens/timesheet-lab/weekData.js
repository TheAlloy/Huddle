// Timesheet-lab shared data helpers — deliberate copies of the logic inside
// Timesheet.jsx (V1), extracted so the V2/V3 design experiments can recompose
// the rendering without touching V1. When one variation wins, fold that
// variation's rendering back over V1 and delete this folder.
import { toISO, parseISO, isWeekday } from "../../studio/core.jsx";

export const logKey = (l) => (l.taskId ? "T|" + l.taskId : (l.projectId || "none") + "|" + (l.phaseId || ""));

// The week's row list: every project(+phase) or task the member logged
// against, is scheduled on, or has open assigned tasks for.
export function weekRows({ data, meId, rsISO, reISO, todayISO, labels, pending, weekLogs }) {
  const map = new Map();
  const put = (key, r) => { if (!map.has(key)) map.set(key, r); };
  weekLogs.forEach((l) => put(logKey(l), { key: logKey(l), projectId: l.taskId ? null : l.projectId, phaseId: l.taskId ? null : (l.phaseId || null), taskId: l.taskId || null }));
  data.assignments.forEach((a) => {
    if (a.memberId !== meId || a.start > reISO || a.end < rsISO) return;
    if (a.kind === "work" && a.projectId) { const k = a.projectId + "|" + (a.phaseId || ""); put(k, { key: k, projectId: a.projectId, phaseId: a.phaseId || null, taskId: null }); }
    else if (a.kind === "internal" && a.taskId) { const k = "T|" + a.taskId; put(k, { key: k, projectId: null, phaseId: null, taskId: a.taskId }); }
  });
  if (todayISO >= rsISO && todayISO <= reISO) {
    (data.internalTasks || []).forEach((t) => { if (t.assigneeId !== meId || t.status === "done") return; put("T|" + t.id, { key: "T|" + t.id, projectId: null, phaseId: null, taskId: t.id }); });
  }
  pending.forEach((p) => put(p.key, { ...p }));
  const arr = [...map.values()];
  const sortLbl = (r) => (r.taskId ? "￿" + ((labels.taskById(r.taskId) || {}).title || "") : `${(labels.projById(r.projectId) || { index: "" }).index}|${labels.phName(r.projectId, r.phaseId)}`);
  arr.sort((a, b) => sortLbl(a).localeCompare(sortLbl(b)));
  return arr;
}

// What the schedule says the member should be on for one day (weekdays only):
// row key -> planned hours (null = no explicit hours).
export function schedForDay(data, meId, dISO) {
  const values = new Map();
  if (!isWeekday(parseISO(dISO))) return { values, projCount: 0 };
  data.assignments.forEach((a) => {
    if (a.memberId !== meId || a.start > dISO || a.end < dISO) return;
    if (a.kind === "work" && a.projectId) { const k = a.projectId + "|" + (a.phaseId || ""); if (!values.has(k)) values.set(k, (a.mode === "hours_per_day" && a.value > 0) ? a.value : null); }
    else if (a.kind === "internal" && a.taskId) { const k = "T|" + a.taskId; if (!values.has(k)) values.set(k, null); }
  });
  const projCount = [...values.keys()].filter((k) => !k.startsWith("T|")).length;
  return { values, projCount };
}

// One row×day cell: logged total (null when nothing logged), first note, and
// the D4 ghost suggestion (planned hours, else daily hours split across the
// day's scheduled projects; tasks get no suggested hours).
export function cellForDay({ weekLogs, row, dISO, sched, daily }) {
  const logs = weekLogs.filter((l) => l.date === dISO && logKey(l) === row.key);
  const mins = logs.length ? logs.reduce((s, l) => s + l.minutes, 0) : null;
  const note = logs.map((l) => l.note).find(Boolean) || "";
  let ghostMins = null;
  if (mins == null && sched.values.has(row.key) && !row.taskId) {
    const v = sched.values.get(row.key);
    ghostMins = Math.round((v != null ? v : (daily || 8) / (sched.projCount || 1)) * 60);
  }
  return { ids: logs.map((l) => l.id), mins, note, ghostMins };
}

export function rowLabelFor(labels, NAVY, row) {
  if (row.taskId) { const t = labels.taskById(row.taskId); return { text: (t || {}).title || "task", full: "Task · " + ((t || {}).title || "task") + (t?.projectId ? " — " + labels.labTop(t.projectId) : ""), color: t?.projectId ? labels.colorOf(t.projectId) : NAVY }; }
  const ph = labels.phName(row.projectId, row.phaseId);
  return { text: `${(labels.projById(row.projectId) || { index: "—" }).index}${ph ? " · " + ph : ""}`, full: labels.labProj(row.projectId) + (ph ? " · " + ph : ""), color: labels.colorOf(row.projectId) };
}
