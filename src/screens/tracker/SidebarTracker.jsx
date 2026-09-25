// The always-on timer control, living at the foot of the sidebar (above
// Settings) so play/stop is one click from every screen — successor to the
// header's Track popover, and the only place the running timer is shown.
// Idle: today's scheduled work, today's calendar-planned work and your open
// tasks as one-tap starts.
// Running: the panel becomes the timer — live clock with stop-with-note,
// PiP, and discard.
import React, { useState, useEffect, useMemo } from "react";
import { toISO, startOfDay, isWeekday, hm, fmtClock, mapData, makeHandlers, NAVY } from "../../studio/core.jsx";
import { useRunningTimer, makeLabels, usePipTimer, taskProject } from "./shared.jsx";
import { Play, Square, PictureInPicture2, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarGroup, SidebarInput, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

const MAX_ITEMS = 10; // today's list tops out here; it scrolls inside the panel

export default function SidebarTracker({ org, me, data: cadData, reload }) {
  const meId = me.id;
  const data = useMemo(() => mapData(cadData), [cadData]);
  const H = useMemo(() => makeHandlers(org, reload, cadData), [org, cadData]); // eslint-disable-line
  const { run, start, startTask, stop: stopTimer, capMinutes } = useRunningTimer(meId, { addTimeLog: H.addTimeLog, orgId: org.id, dailyHours: me.daily_hours });
  const [stopNote, setStopNote] = useState("");
  const [, tick] = useState(0);
  useEffect(() => {
    if (!run) return;
    const iv = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [run]);

  const labels = makeLabels(data);
  const todayISO = toISO(startOfDay(new Date()));

  const stop = async () => { if (await stopTimer(todayISO, { note: stopNote.trim() || null })) setStopNote(""); };
  const openPip = usePipTimer({ run, stop, top: () => labels.runTop(run), capMinutes });
  const elapsed = run ? fmtClock(Math.min((Date.now() - run.startedAt) / 1000, capMinutes * 60)) : null;

  // Today's start list, from exactly three sources (in this order):
  //   1. the Schedule — your work/task bars covering today (weekdays);
  //   2. your calendar planner — projects/tasks with blocks on today;
  //   3. tasks assigned to you that aren't done.
  // One row per project+phase (or task). A phase-less entry for a project
  // that also appears with a phase folds into the phased row, so "VOL007"
  // and "VOL007 · UX" never show twice.
  const todayLogs = (data.timeLogs || []).filter((l) => l.memberId === meId && l.date === todayISO);
  const todayMins = todayLogs.reduce((s, l) => s + l.minutes, 0);
  const found = new Map(); // key -> {projectId, phaseId, taskId, why}
  const put = (key, row) => { if (!found.has(key)) found.set(key, row); };
  if (isWeekday(startOfDay(new Date()))) {
    data.assignments.forEach((a) => {
      if (a.memberId !== meId || a.start > todayISO || a.end < todayISO) return;
      if (a.kind === "work" && a.projectId) put(a.projectId + "|" + (a.phaseId || ""), { projectId: a.projectId, phaseId: a.phaseId || null, why: "Scheduled today" });
      else if (a.kind === "internal" && a.taskId) put("T|" + a.taskId, { taskId: a.taskId, why: "Scheduled today" });
    });
  }
  todayLogs.forEach((l) => {
    if (l.taskId) put("T|" + l.taskId, { taskId: l.taskId, why: "In today's calendar" });
    else if (l.projectId) put(l.projectId + "|" + (l.phaseId || ""), { projectId: l.projectId, phaseId: l.phaseId || null, why: "In today's calendar" });
  });
  (data.internalTasks || []).forEach((t) => { if (t.assigneeId === meId && t.status !== "done") put("T|" + t.id, { taskId: t.id, why: "Assigned to you" }); });
  const phased = new Set([...found.values()].filter((r) => r.projectId && r.phaseId).map((r) => r.projectId));
  const minsFor = (r) => todayLogs.filter((l) => (r.taskId ? l.taskId === r.taskId
    : !l.taskId && l.projectId === r.projectId && (r.phaseId ? (l.phaseId === r.phaseId || !l.phaseId) : true))).reduce((s, l) => s + l.minutes, 0);
  const items = [...found.entries()]
    .filter(([, r]) => (r.taskId ? labels.taskById(r.taskId) : labels.projById(r.projectId)) && !(r.projectId && !r.phaseId && phased.has(r.projectId)))
    .map(([key, r]) => {
      // Just what the work is: "Client - Project" over its phase (tasks: the
      // task over its project, when it has one).
      if (r.taskId) {
        const tp = taskProject(data, r.taskId);
        return { key, color: tp.projectId ? labels.colorOf(tp.projectId) : NAVY, label: labels.taskById(r.taskId).title || "task", sub: tp.projectId ? [labels.labProj(tp.projectId), labels.phName(tp.projectId, tp.phaseId)].filter(Boolean).join(" · ") : "Task", mins: minsFor(r), onStart: () => startTask(r.taskId, tp) };
      }
      return { key, color: labels.colorOf(r.projectId), label: labels.labProj(r.projectId), sub: labels.phName(r.projectId, r.phaseId), mins: minsFor(r), onStart: () => start(r.projectId, r.phaseId) };
    })
    .slice(0, MAX_ITEMS);

  const runColor = run ? labels.runColor(run) : null;
  const runPhase = run && !run.taskId ? labels.phName(run.projectId, run.phaseId) : "";
  // Tracked today: everything logged today plus the running clock.
  const trackedToday = todayMins + (run ? Math.min((Date.now() - run.startedAt) / 60000, capMinutes) : 0);

  // The tracker is its own filled panel inside the sidebar — the one place a
  // running timer (clock, stop, pop-out) is shown anywhere in the app. Idle
  // it sits on the off-white page fill; while recording it takes the
  // project's colour.
  return (
    <SidebarGroup>
      <div className={`flex flex-col gap-2 rounded-lg p-2 shadow-xs ${run ? "text-white" : "border bg-background"}`} style={run ? { background: runColor } : undefined}>
        <div className="flex items-center gap-1.5 px-1 whitespace-nowrap">
          <Timer className={`size-4 shrink-0 ${run ? "opacity-90" : "text-muted-foreground"}`} />
          <span className="min-w-0 truncate text-xs font-medium">{run ? "Recording" : "Tracker"}</span>
          {run && <span className="size-1.5 shrink-0 rounded-full bg-white" style={{ animation: "pulse 1.5s infinite" }} />}
          <span className={`ml-auto shrink-0 text-xs tabular-nums ${run ? "opacity-90" : "text-muted-foreground"}`}>Tracked today <span className="font-medium">{hm(trackedToday)}</span></span>
        </div>
        {run ? (
          <>
            <div className="min-w-0 px-1 leading-tight">
              <div className="text-sm font-medium truncate">{labels.runTop(run)}</div>
              {runPhase && <div className="text-xs opacity-90 truncate">{runPhase}</div>}
            </div>
            <div className="px-1 text-2xl font-medium tabular-nums leading-none">{elapsed}</div>
            <SidebarInput value={stopNote} onChange={(e) => setStopNote(e.target.value)} placeholder="Add a note… (optional)" className="text-foreground"
              onKeyDown={(e) => { if (e.key === "Enter") stop(); }} />
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="sm" className="flex-1" onClick={stop}><Square data-icon="inline-start" /> Stop &amp; log</Button>
              <Button variant="secondary" size="icon-sm" title="Pop out floating timer" onClick={openPip}><PictureInPicture2 /></Button>
            </div>
          </>
        ) : (
          // A long week scrolls inside the panel rather than pushing the nav away.
          <SidebarMenu className="gap-1 max-h-72 overflow-y-auto">
            {items.map((it) => (
              <SidebarMenuItem key={it.key}>
                <SidebarMenuButton size="lg" onClick={it.onStart} tooltip={"Start · " + it.label} className={it.mins ? "pr-14" : undefined}>
                  <span className="grid place-items-center size-6 rounded-full text-white shrink-0" style={{ background: it.color }}><Play className="size-3!" /></span>
                  <span className="grid flex-1 min-w-0 text-left leading-tight">
                    <span className="truncate">{it.label}</span>
                    {it.sub && <span className="truncate text-xs text-muted-foreground">{it.sub}</span>}
                  </span>
                </SidebarMenuButton>
                {it.mins ? <SidebarMenuBadge>{hm(it.mins)}</SidebarMenuBadge> : null}
              </SidebarMenuItem>
            ))}
            {items.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Nothing scheduled or planned for you today, and no open tasks.</div>}
          </SidebarMenu>
        )}
      </div>
    </SidebarGroup>
  );
}
