// The header timer control, on every screen (docs/time-tracker-plan.md
// slice 5). Idle: a popover mini-tracker — today's scheduled work, open
// tasks, and recents as one-tap starts. Running: live clock with
// stop-with-note, PiP, and discard. Successor to the old Schedule-embedded
// DashTracker; composed from the same shared pieces as the Time screen.
import React, { useState, useEffect, useMemo } from "react";
import { toISO, startOfDay, hm, fmtClock, mapData, makeHandlers, NAVY } from "../../studio/core.jsx";
import { useRunningTimer, makeLabels, todayTracking, recentCombos, usePipTimer, taskProject } from "./shared.jsx";
import { useConfirm } from "../../components/confirm.tsx";
import { Clock, Play, Square, PictureInPicture2, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function StartRow({ color, label, sub, mins, onStart }) {
  return (
    <button onClick={onStart} className="w-full flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-left hover:bg-muted/60 transition">
      <span className="grid place-items-center size-6 rounded-full text-white shrink-0" style={{ background: color }}><Play size={11} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-tight truncate">{label}</span>
        {sub ? <span className="block text-xs text-muted-foreground leading-tight truncate">{sub}</span> : null}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{mins ? hm(mins) : ""}</span>
    </button>
  );
}

export default function HeaderTracker({ org, me, data: cadData, reload, active, onOpen }) {
  const meId = me.id;
  const data = useMemo(() => mapData(cadData), [cadData]);
  const H = useMemo(() => makeHandlers(org, reload, cadData), [org, cadData]); // eslint-disable-line
  const { run, start, startTask, stop: stopTimer, cancel, capMinutes } = useRunningTimer(meId, { addTimeLog: H.addTimeLog, orgId: org.id, dailyHours: me.daily_hours });
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [stopNote, setStopNote] = useState("");
  const [, tick] = useState(0);
  useEffect(() => {
    if (!run) return;
    const iv = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [run]);

  const labels = makeLabels(data);
  const todayISO = toISO(startOfDay(new Date()));
  const { bubbles, myTasks, minsFor, minsForTask } = todayTracking(data, meId, todayISO);
  const scheduledKeys = new Set(bubbles.filter((b) => !b.internal).map((b) => b.projectId + "|" + (b.phaseId || "")));
  const recents = recentCombos(data, meId, { max: 4 }).filter((r) => !scheduledKeys.has(r.projectId + "|" + (r.phaseId || "")));

  const stop = () => { stopTimer(todayISO, { note: stopNote.trim() || null }); setStopNote(""); };
  const discard = async () => {
    const mins = run ? Math.round((Date.now() - run.startedAt) / 60000) : 0;
    if (mins > 5 && !(await confirm({ title: "Discard this timer?", description: hm(mins) + " of tracked time will be thrown away.", confirmLabel: "Discard", destructive: true }))) return;
    setStopNote(""); cancel();
  };
  const openPip = usePipTimer({ run, stop, top: () => labels.runTop(run), capMinutes });
  const elapsed = run ? fmtClock(Math.min((Date.now() - run.startedAt) / 1000, capMinutes * 60)) : null;
  const goTime = () => { setOpen(false); onOpen(); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant={active ? "secondary" : "ghost"} size="sm" title="Time tracker" />}>
        {run
          ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ animation: "pulse 1.5s infinite" }} /> <span className="tabular-nums">{elapsed}</span></>
          : <><Clock data-icon="inline-start" /> Track</>}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        {run ? (
          <div className="flex flex-col gap-2">
            <div className="rounded-lg p-2.5 text-white" style={{ background: labels.runColor(run) }}>
              <div className="text-xs opacity-90 truncate">{labels.runTop(run)}{!run.taskId && labels.phName(run.projectId, run.phaseId) ? " · " + labels.phName(run.projectId, run.phaseId) : ""}</div>
              <div className="text-2xl font-medium tabular-nums leading-tight">{elapsed}</div>
            </div>
            <Input value={stopNote} onChange={(e) => setStopNote(e.target.value)} placeholder="Add a note… (optional)" />
            <div className="flex items-center gap-2">
              <Button className="flex-1" onClick={stop}><Square data-icon="inline-start" /> Stop &amp; log</Button>
              <Button variant="outline" size="icon" title="Pop out floating timer" onClick={openPip}><PictureInPicture2 /></Button>
              <Button variant="outline" size="icon" title="Discard" onClick={discard}><Trash2 /></Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {bubbles.length > 0 && <div className="text-xs font-medium text-muted-foreground">Today</div>}
            {bubbles.map((b) => b.internal
              ? <StartRow key={"ib:" + b.taskId} color={taskProject(data, b.taskId).projectId ? labels.colorOf(taskProject(data, b.taskId).projectId) : NAVY} label={(labels.taskById(b.taskId) || {}).title || "task"} sub="Task" mins={minsForTask(b.taskId)} onStart={() => startTask(b.taskId, taskProject(data, b.taskId))} />
              : <StartRow key={b.projectId + "|" + b.phaseId} color={labels.colorOf(b.projectId)} label={labels.labProj(b.projectId)} sub={labels.phName(b.projectId, b.phaseId)} mins={minsFor(b.projectId, b.phaseId)} onStart={() => start(b.projectId, b.phaseId)} />)}
            {myTasks.slice(0, 3).map((t) => (
              <StartRow key={"task:" + t.id} color={t.projectId ? labels.colorOf(t.projectId) : NAVY} label={t.title} sub="Task" mins={minsForTask(t.id)} onStart={() => startTask(t.id, taskProject(data, t.id))} />
            ))}
            {recents.length > 0 && <div className="text-xs font-medium text-muted-foreground mt-1">Recent</div>}
            {recents.map((r) => (
              <StartRow key={r.key} color={labels.colorOf(r.projectId)} label={r.label} mins={0} onStart={() => start(r.projectId, r.phaseId)} />
            ))}
            {bubbles.length === 0 && myTasks.length === 0 && recents.length === 0 &&
              <div className="text-sm text-muted-foreground py-1">Nothing to suggest yet — open the Time screen to log or start work.</div>}
          </div>
        )}
        <Button variant="ghost" size="sm" className="w-full mt-2" onClick={goTime}>Open Time <ArrowRight data-icon="inline-end" /></Button>
      </PopoverContent>
    </Popover>
  );
}
