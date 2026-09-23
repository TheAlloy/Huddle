// The always-on timer control, living at the foot of the sidebar (above
// Settings) so play/stop is one click from every screen — successor to the
// header's Track popover, and the only place the running timer is shown.
// Idle: today's scheduled work, open tasks and recents as one-tap starts.
// Running: the panel becomes the timer — live clock with stop-with-note,
// PiP, and discard.
import React, { useState, useEffect, useMemo } from "react";
import { toISO, startOfDay, hm, fmtClock, mapData, makeHandlers, NAVY } from "../../studio/core.jsx";
import { useRunningTimer, makeLabels, todayTracking, recentCombos, usePipTimer, taskProject } from "./shared.jsx";
import { Play, Square, PictureInPicture2, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarGroup, SidebarInput, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

const MAX_ITEMS = 5; // the sidebar is shared with the nav — keep the list short

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
  const { bubbles, myTasks, minsFor, minsForTask, todayMins } = todayTracking(data, meId, todayISO);
  const scheduledKeys = new Set(bubbles.filter((b) => !b.internal).map((b) => b.projectId + "|" + (b.phaseId || "")));
  const recents = recentCombos(data, meId, { max: 4 }).filter((r) => !scheduledKeys.has(r.projectId + "|" + (r.phaseId || "")));

  const stop = () => { stopTimer(todayISO, { note: stopNote.trim() || null }); setStopNote(""); };
  const openPip = usePipTimer({ run, stop, top: () => labels.runTop(run), capMinutes });
  const elapsed = run ? fmtClock(Math.min((Date.now() - run.startedAt) / 1000, capMinutes * 60)) : null;

  // One flat start list: today's schedule first, then open tasks, then recents.
  const items = [
    ...bubbles.map((b) => b.internal
      ? { key: "ib:" + b.taskId, color: taskProject(data, b.taskId).projectId ? labels.colorOf(taskProject(data, b.taskId).projectId) : NAVY, label: (labels.taskById(b.taskId) || {}).title || "task", sub: "Task", mins: minsForTask(b.taskId), onStart: () => startTask(b.taskId, taskProject(data, b.taskId)) }
      : { key: b.projectId + "|" + b.phaseId, color: labels.colorOf(b.projectId), label: labels.labProj(b.projectId), sub: labels.phName(b.projectId, b.phaseId) || "Scheduled today", mins: minsFor(b.projectId, b.phaseId), onStart: () => start(b.projectId, b.phaseId) }),
    ...myTasks.slice(0, 3).map((t) => ({ key: "task:" + t.id, color: t.projectId ? labels.colorOf(t.projectId) : NAVY, label: t.title, sub: "Task", mins: minsForTask(t.id), onStart: () => startTask(t.id, taskProject(data, t.id)) })),
    ...recents.map((r) => ({ key: r.key, color: labels.colorOf(r.projectId), label: r.label, sub: "Recent", mins: 0, onStart: () => start(r.projectId, r.phaseId) })),
  ].slice(0, MAX_ITEMS);

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
          <SidebarMenu className="gap-1">
            {items.map((it) => (
              <SidebarMenuItem key={it.key}>
                <SidebarMenuButton size="lg" onClick={it.onStart} tooltip={"Start · " + it.label} className={it.mins ? "pr-14" : undefined}>
                  <span className="grid place-items-center size-6 rounded-full text-white shrink-0" style={{ background: it.color }}><Play className="size-3!" /></span>
                  <span className="grid flex-1 min-w-0 text-left leading-tight">
                    <span className="truncate">{it.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{it.sub}</span>
                  </span>
                </SidebarMenuButton>
                {it.mins ? <SidebarMenuBadge>{hm(it.mins)}</SidebarMenuBadge> : null}
              </SidebarMenuItem>
            ))}
            {items.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Nothing to suggest yet — open the timesheet to log or start work.</div>}
          </SidebarMenu>
        )}
      </div>
    </SidebarGroup>
  );
}
