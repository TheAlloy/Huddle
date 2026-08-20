// Timesheet V3 — the Card language: both sections are full stock Card
// anatomy (CardHeader/CardTitle/CardDescription/CardAction/CardContent/
// CardFooter), with V1's aligned grid inside the logger card under a muted
// header band, and the week navigation living in the card's own CardAction.
// Design experiment — compare against V1/V2 in the sidebar; not wired for
// mobile.
import React, { useState, useEffect, useMemo } from "react";
import { can } from "../../lib/permissions.js";
import { NoAccess } from "../Workspace.jsx";
import { MONTHS, DOW, pad, toISO, startOfDay, addDays, startOfWeekMon, isWeekday, hm, fmtClock, fmtH, NAVY, projectsByClient, mapData, makeHandlers } from "../../studio/core.jsx";
import { useRunningTimer, makeLabels, ProjectCombobox, recentCombos, usePipTimer, taskProject } from "../tracker/shared.jsx";
import WeekCalendar from "../tracker/WeekCalendar.jsx";
import { weekRows, schedForDay, cellForDay, rowLabelFor, logKey } from "./weekData.js";
import { HoursField, NoteButton } from "./LabBits.jsx";
import { useConfirm } from "../../components/confirm.tsx";
import { Play, Square, PictureInPicture2, X, ChevronLeft, ChevronRight, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function TimesheetV3({ org, me, data: cadData, reload }) {
  const meId = me.id;
  const data = useMemo(() => mapData(cadData), [cadData]);
  const H = useMemo(() => makeHandlers(org, reload, cadData), [org, cadData]); // eslint-disable-line
  const { addTimeLog, setTimeLogTotal, editTimeLog } = H;
  const confirm = useConfirm();

  const canTrack = can(me, "time.track");
  const member = data.members.find((m) => m.id === meId);
  const { run, start, startTask, stop: stopTimer, cancel, capMinutes } = useRunningTimer(meId, { addTimeLog, orgId: org.id, dailyHours: member?.daily || 8 });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!run) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [run]);
  const [stopNote, setStopNote] = useState("");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState([]);

  const labels = makeLabels(data);
  const todayISO = toISO(startOfDay(new Date()));
  const stop = () => { stopTimer(todayISO, { note: stopNote.trim() || null }); setStopNote(""); };
  const openPip = usePipTimer({ run, stop, top: () => labels.runTop(run), capMinutes });

  if (!canTrack || !member) return <NoAccess what="the timesheet" />;

  const groups = projectsByClient(data.projects, data.clients);
  const recents = recentCombos(data, meId);
  const rs = startOfWeekMon(anchor), re = addDays(rs, 6);
  const rsISO = toISO(rs), reISO = toISO(re);
  const days = Array.from({ length: 7 }, (_, i) => addDays(rs, i));
  const rangeLabel = `${pad(rs.getDate())} ${MONTHS[rs.getMonth()]} – ${pad(re.getDate())} ${MONTHS[re.getMonth()]} ${re.getFullYear()}`;

  const weekLogs = (data.timeLogs || []).filter((l) => l.memberId === meId && l.date >= rsISO && l.date <= reISO);
  const weekTotal = weekLogs.reduce((s, l) => s + l.minutes, 0);
  const dayTot = (dISO) => weekLogs.filter((l) => l.date === dISO).reduce((s, l) => s + l.minutes, 0);
  const rows = weekRows({ data, meId, rsISO, reISO, todayISO, labels, pending, weekLogs });
  const scheds = days.map((d) => schedForDay(data, meId, toISO(d)));
  const rowTot = (row) => weekLogs.filter((l) => logKey(l) === row.key).reduce((s, l) => s + l.minutes, 0);
  const rowLabel = (row) => rowLabelFor(labels, NAVY, row);

  const setTotal = (dISO, row, cell, minutes) => {
    const attr = row.taskId ? taskProject(data, row.taskId) : { projectId: row.projectId || null, phaseId: row.phaseId || null };
    setTimeLogTotal({ ids: cell.ids, minutes, memberId: meId, projectId: attr.projectId || null, phaseId: attr.phaseId || null, taskId: row.taskId || null, date: dISO });
  };
  const addPending = (pick) => {
    if (!pick.projectId) return;
    const key = pick.projectId + "|" + (pick.phaseId || "");
    setPending((list) => (list.some((x) => x.key === key) ? list : [...list, { key, projectId: pick.projectId, phaseId: pick.phaseId || null, taskId: null }]));
    setAdding(false);
  };
  const discard = async () => {
    const mins = run ? Math.round((Date.now() - run.startedAt) / 60000) : 0;
    if (mins > 5 && !(await confirm({ title: "Discard this timer?", description: hm(mins) + " of tracked time will be thrown away.", confirmLabel: "Discard", destructive: true }))) return;
    setStopNote(""); cancel();
  };
  const elapsed = run ? fmtClock(Math.min((now - run.startedAt) / 1000, capMinutes * 60)) : null;
  const shift = (dir) => setAnchor((a) => addDays(a, dir * 7));

  const gridCols = { gridTemplateColumns: `minmax(180px,240px) repeat(7, minmax(0,1fr)) 72px` };

  return (
    <ScrollArea className="h-full">
      <div className="@container/main flex flex-col">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">

          {run && (
            <div className="px-4 lg:px-6">
              <div className="rounded-xl p-3 text-white shadow-xs" style={{ background: labels.runColor(run) }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="size-2.5 rounded-full bg-card shrink-0" style={{ animation: "pulse 1.5s infinite" }} />
                  <div className="min-w-0"><div className="text-xs opacity-90 truncate">{labels.runTop(run)}</div><div className="text-2xl font-medium tabular-nums leading-tight">{elapsed}</div></div>
                  <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <Input value={stopNote} onChange={(e) => setStopNote(e.target.value)} placeholder="Add a note… (optional)" className="w-52 bg-card text-foreground" />
                    <Button variant="secondary" onClick={stop}><Square data-icon="inline-start" /> Stop &amp; log</Button>
                    <Button variant="secondary" size="icon" title="Pop out floating timer" onClick={openPip}><PictureInPicture2 /></Button>
                    <Button variant="secondary" size="icon" title="Discard" onClick={discard}><X /></Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Logger as a stock Card */}
          <div className="px-4 lg:px-6">
            <Card>
              <CardHeader>
                <CardTitle>Week logger <Badge variant="secondary" className="ml-1 align-middle">V3 · card</Badge></CardTitle>
                <CardDescription>{rangeLabel} · type hours or tap a suggestion — Enter logs it</CardDescription>
                <CardAction>
                  <ButtonGroup>
                    <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous week"><ChevronLeft /></Button>
                    <Button variant="outline" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
                    <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next week"><ChevronRight /></Button>
                  </ButtonGroup>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid gap-1.5 items-center" style={gridCols}>
                  <div className="rounded-md bg-muted/50 px-2 py-1.5 text-sm font-medium">Project</div>
                  {days.map((d) => { const dISO = toISO(d); const isToday = dISO === todayISO; const t = dayTot(dISO); return (
                    <div key={dISO} className={`rounded-md px-1.5 py-1.5 text-sm flex items-baseline justify-between ${isToday ? "bg-primary/10 font-medium text-foreground" : "bg-muted/50 text-muted-foreground"}`}>
                      <span>{DOW[d.getDay()]} {pad(d.getDate())}</span>
                      <span className="text-xs tabular-nums">{t ? fmtH(t / 60) + "h" : ""}</span>
                    </div>); })}
                  <div className="rounded-md bg-muted/50 px-1.5 py-1.5 text-sm text-muted-foreground text-right">Week</div>

                  {rows.map((row) => { const lab = rowLabel(row); const tot = rowTot(row); return (
                    <React.Fragment key={row.key}>
                      <div className="flex items-center gap-2 min-w-0 pr-1 pl-1">
                        <span className="size-3 rounded-xs shrink-0" style={{ background: lab.color }} />
                        <span className="text-sm truncate" title={lab.full}>{lab.text}</span>
                        {row.taskId && <span className="text-xs text-muted-foreground shrink-0">task</span>}
                      </div>
                      {days.map((d, i) => { const dISO = toISO(d); const cell = cellForDay({ weekLogs, row, dISO, sched: scheds[i], daily: member.daily }); const isToday = dISO === todayISO; return (
                        <div key={dISO} className={`group flex items-center gap-1 rounded-md px-1 py-1 ${isToday ? "bg-primary/5" : !isWeekday(d) ? "bg-muted/30" : ""}`}>
                          <HoursField mins={cell.mins} ghostMins={cell.ghostMins} onCommit={(m) => setTotal(dISO, row, cell, m)} />
                          {cell.ghostMins != null && <Button variant="ghost" size="icon" title={"Log " + fmtH(cell.ghostMins / 60) + "h (planned)"} onClick={() => setTotal(dISO, row, cell, cell.ghostMins)}><Check /></Button>}
                          {cell.mins != null && cell.ids.length > 0 && <NoteButton note={cell.note} onSave={(note) => editTimeLog(cell.ids[0], { note })} />}
                          {isToday && !run && <Button variant="ghost" size="icon" title="Start timer" onClick={() => (row.taskId ? startTask(row.taskId, taskProject(data, row.taskId)) : start(row.projectId, row.phaseId))}><Play /></Button>}
                        </div>); })}
                      <div className="px-1.5 text-sm font-medium tabular-nums text-right">{tot ? fmtH(tot / 60) + "h" : ""}</div>
                    </React.Fragment>); })}
                </div>
              </CardContent>
              <CardFooter className="justify-between">
                {adding
                  ? <ProjectCombobox selP="" selPh="" onPick={addPending} groups={groups} recents={recents} placeholder="Add project…" className="w-72" />
                  : <Button variant="outline" onClick={() => setAdding(true)}><Plus data-icon="inline-start" /> Add project</Button>}
                <span className="text-sm text-muted-foreground">This week <span className="font-medium text-foreground">{fmtH(weekTotal / 60)}h</span></span>
              </CardFooter>
            </Card>
          </div>

          {/* Calendar as a stock Card */}
          <div className="px-4 lg:px-6">
            <Card>
              <CardHeader>
                <CardTitle>Calendar</CardTitle>
                <CardDescription>Drag on a day to log a block · drag blocks to say when work happened</CardDescription>
              </CardHeader>
              <CardContent>
                <WeekCalendar frameless days={days} todayISO={todayISO} logs={weekLogs} labelFor={(l) => rowLabelFor(labels, NAVY, l)} groups={groups} recents={recents}
                  run={run} runColor={labels.runColor(run)}
                  onCreate={({ projectId, phaseId, date, startMin, minutes, note }) => addTimeLog({ memberId: meId, projectId, phaseId, taskId: null, date, minutes, startMin, source: "manual", note })}
                  onPatch={(id, patch) => editTimeLog(id, patch)} />
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </ScrollArea>
  );
}
