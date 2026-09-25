// The always-on timer control, living at the foot of the sidebar (above
// Settings) so play/stop is one click from every screen — successor to the
// header's Track popover, and the only place the running timer is shown.
// Idle: this week's assigned and planned work, open tasks (and a couple of
// recents when that's short) as one-tap starts.
// Running: the panel becomes the timer — live clock with stop-with-note,
// PiP, and discard.
import React, { useState, useEffect, useMemo } from "react";
import { toISO, startOfDay, startOfWeekMon, addDays, hm, fmtClock, mapData, makeHandlers, NAVY } from "../../studio/core.jsx";
import { useRunningTimer, makeLabels, recentCombos, usePipTimer, taskProject } from "./shared.jsx";
import { weekRows, schedForDay, logKey } from "../timesheet-lab/weekData.js";
import { Play, Square, PictureInPicture2, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarGroup, SidebarInput, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

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

  // The start list is the Timesheet's own row list for this week — everything
  // the Schedule assigns you this week, everything in your calendar planner
  // this week, and your open tasks — so the two always agree. Today's
  // scheduled work leads, then what's planned in today's calendar, then the
  // rest of the week; a couple of recents top up a short list.
  const rs = startOfWeekMon(new Date()), rsISO = toISO(rs), reISO = toISO(addDays(rs, 6));
  const weekLogs = (data.timeLogs || []).filter((l) => l.memberId === meId && l.date >= rsISO && l.date <= reISO);
  const todayLogs = weekLogs.filter((l) => l.date === todayISO);
  const todayMins = todayLogs.reduce((s, l) => s + l.minutes, 0);
  const todaySched = schedForDay(data, meId, todayISO).values;
  const rows = weekRows({ data, meId, rsISO, reISO, todayISO, labels, pending: [], weekLogs })
    .filter((r) => (r.taskId ? labels.taskById(r.taskId) : labels.projById(r.projectId)));
  const rank = (r) => (todaySched.has(r.key) ? 0 : todayLogs.some((l) => logKey(l) === r.key) ? 1 : 2);
  const WHEN = ["Scheduled today", "In today's calendar", "This week"];
  const minsToday = (key) => todayLogs.filter((l) => logKey(l) === key).reduce((s, l) => s + l.minutes, 0);
  const items = rows.map((r) => ({ r, k: rank(r) })).sort((a, b) => a.k - b.k).map(({ r, k }) => {
    if (r.taskId) {
      const tp = taskProject(data, r.taskId);
      return { key: r.key, color: tp.projectId ? labels.colorOf(tp.projectId) : NAVY, label: labels.taskById(r.taskId).title || "task", sub: k < 2 ? "Task · " + WHEN[k] : "Task", mins: minsToday(r.key), onStart: () => startTask(r.taskId, tp) };
    }
    return { key: r.key, color: labels.colorOf(r.projectId), label: labels.labProj(r.projectId), sub: [labels.phName(r.projectId, r.phaseId), WHEN[k]].filter(Boolean).join(" · "), mins: minsToday(r.key), onStart: () => start(r.projectId, r.phaseId) };
  });
  if (items.length < 4) {
    const have = new Set(rows.map((r) => r.key));
    recentCombos(data, meId, { max: 4 }).filter((c) => !have.has(c.projectId + "|" + (c.phaseId || ""))).slice(0, 2)
      .forEach((c) => items.push({ key: c.key, color: labels.colorOf(c.projectId), label: c.label, sub: "Recent", mins: 0, onStart: () => start(c.projectId, c.phaseId) }));
  }

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
