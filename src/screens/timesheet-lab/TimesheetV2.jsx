// Timesheet V2 — the data-table language (docs/components/base/data-table):
// the week logger is a real stock Table inside the data-table frame
// (overflow-hidden rounded-md border), day totals live in a stock
// TableFooter, and the calendar sits in a stock Card with full
// CardHeader/CardAction anatomy. Design experiment — compare against V1/V3
// in the sidebar; not wired for mobile.
import React, { useState, useEffect, useMemo } from "react";
import { can } from "../../lib/permissions.js";
import { NoAccess } from "../Workspace.jsx";
import { MONTHS, DOW, pad, toISO, startOfDay, addDays, startOfWeekMon, isWeekday, hm, fmtClock, fmtH, NAVY, projectsByClient, mapData, makeHandlers } from "../../studio/core.jsx";
import { useRunningTimer, makeLabels, ProjectCombobox, recentCombos, usePipTimer, taskProject } from "../tracker/shared.jsx";
import WeekCalendar from "../tracker/WeekCalendar.jsx";
import { weekRows, schedForDay, cellForDay, rowLabelFor, logKey } from "./weekData.js";
import { HoursField } from "./LabBits.jsx";
import { useConfirm } from "../../components/confirm.tsx";
import { Play, Square, PictureInPicture2, X, Clock, ChevronLeft, ChevronRight, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// `dividers` toggles the vertical column separators; `unified` puts the
// calendar inside the same frame as the table with its day lanes aligned to
// the table's day columns (table-fixed + matching grid template);
// `addSlot` picks the add-project idiom: "button" (dashed slot that becomes
// an open combobox on click) or "input" (the combobox input is always
// there). V2.1 in the sidebar = dividers off + unified + input slot.
export default function TimesheetV2({ org, me, data: cadData, reload, dividers = true, unified = false, addSlot = "button", variantLabel = "V2 · data-table" }) {
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
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState([]);

  const labels = makeLabels(data);
  const todayISO = toISO(startOfDay(new Date()));
  const stop = () => stopTimer(todayISO, {});
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
    cancel();
  };
  const elapsed = run ? fmtClock(Math.min((now - run.startedAt) / 1000, capMinutes * 60)) : null;
  const shift = (dir) => setAnchor((a) => addDays(a, dir * 7));
  const div = dividers ? "border-l border-border/40" : "";

  return (
    <ScrollArea className="h-full">
      <div className="@container/main flex flex-col">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">

          <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6">
            <Clock size={16} className="text-muted-foreground" />
            <ButtonGroup>
              <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous week"><ChevronLeft /></Button>
              <Button variant="outline" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
              <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next week"><ChevronRight /></Button>
            </ButtonGroup>
            <span className="text-sm font-medium">{rangeLabel}</span>
            <Badge variant="secondary">{variantLabel}</Badge>
            <span className="ml-auto text-sm text-muted-foreground">This week <span className="font-medium text-foreground">{fmtH(weekTotal / 60)}h</span></span>
          </div>

          {run && (
            <div className="px-4 lg:px-6">
              <div className="rounded-xl p-3 text-white shadow-xs" style={{ background: labels.runColor(run) }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="size-2.5 rounded-full bg-card shrink-0" style={{ animation: "pulse 1.5s infinite" }} />
                  <div className="min-w-0"><div className="text-xs opacity-90 truncate">{labels.runTop(run)}</div><div className="text-2xl font-medium tabular-nums leading-tight">{elapsed}</div></div>
                  <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <Button variant="secondary" onClick={stop}><Square data-icon="inline-start" /> Stop &amp; log</Button>
                    <Button variant="secondary" size="icon" title="Pop out floating timer" onClick={openPip}><PictureInPicture2 /></Button>
                    <Button variant="secondary" size="icon" title="Discard" onClick={discard}><X /></Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Logger as a stock data table */}
          <div className="px-4 lg:px-6">
            <div className="overflow-hidden rounded-md border">
              <Table className={unified ? "table-fixed" : undefined}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={unified ? "w-48" : undefined}>Project</TableHead>
                    {days.map((d) => { const dISO = toISO(d); const isToday = dISO === todayISO; return (
                      <TableHead key={dISO} className={`${div} ${isToday ? "bg-primary/10" : ""}`}>{DOW[d.getDay()]} {pad(d.getDate())}</TableHead>); })}
                    <TableHead className={`${div} w-20 text-right`}>Week</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => { const lab = rowLabel(row); const tot = rowTot(row); return (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="size-3 rounded-xs shrink-0" style={{ background: lab.color }} />
                          <span className="truncate" title={lab.full}>{lab.text}</span>
                          {row.taskId && <Badge variant="secondary">task</Badge>}
                          {/* The start verb lives here, in one fixed place per
                              row — it always tracks against today. */}
                          {!run && <Button variant="ghost" size="icon" className="ml-auto" title="Start timer — logs to today"
                            onClick={() => (row.taskId ? startTask(row.taskId, taskProject(data, row.taskId)) : start(row.projectId, row.phaseId))}><Play /></Button>}
                        </span>
                      </TableCell>
                      {days.map((d, i) => { const dISO = toISO(d); const cell = cellForDay({ weekLogs, row, dISO, sched: scheds[i], daily: member.daily }); const isToday = dISO === todayISO; return (
                        <TableCell key={dISO} className={`group ${div} ${isToday ? "bg-primary/5" : !isWeekday(d) ? "bg-muted/30" : ""}`}>
                          <span className="flex items-center gap-1">
                            <HoursField mins={cell.mins} ghostMins={cell.ghostMins} onCommit={(m) => setTotal(dISO, row, cell, m)} />
                            {cell.ghostMins != null && <Button variant="ghost" size="icon" title={"Log " + fmtH(cell.ghostMins / 60) + "h (planned)"} onClick={() => setTotal(dISO, row, cell, cell.ghostMins)}><Check /></Button>}
                          </span>
                        </TableCell>); })}
                      <TableCell className={`${div} text-right tabular-nums`}>{tot ? fmtH(tot / 60) + "h" : ""}</TableCell>
                    </TableRow>); })}
                  {/* Add-project occupies the next row — a new project takes
                      its place and pushes it down. */}
                  <TableRow className="hover:bg-transparent">
                    <TableCell>
                      {addSlot === "input"
                        ? <ProjectCombobox selP="" selPh="" onPick={addPending} groups={groups} recents={recents} placeholder="＋ Add project…" className="w-full" />
                        : adding
                          ? <ProjectCombobox selP="" selPh="" onPick={addPending} groups={groups} recents={recents} placeholder="Add project…" className="w-full" defaultOpen autoFocus />
                          : <button onClick={() => setAdding(true)} className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border/60 px-2 py-1.5 text-sm text-muted-foreground/70 hover:text-foreground hover:border-border transition"><Plus size={14} /> Add project</button>}
                    </TableCell>
                    <TableCell colSpan={8} />
                  </TableRow>
                </TableBody>
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="text-muted-foreground font-normal">Daily total</TableCell>
                    {days.map((d) => { const dISO = toISO(d); const t = dayTot(dISO); const wknd = !isWeekday(d); return (
                      <TableCell key={dISO} className={`${div} tabular-nums`}>
                        {wknd
                          ? (t ? fmtH(t / 60) + "h" : <span className="text-muted-foreground font-normal">—</span>)
                          : <>{fmtH(t / 60)}<span className="text-muted-foreground font-normal">/{member.daily || 8}h</span></>}
                      </TableCell>); })}
                    <TableCell className={`${div} text-right tabular-nums`}>{fmtH(weekTotal / 60)}<span className="text-muted-foreground font-normal">/{(member.daily || 8) * 5}h</span></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
              {unified && (
                <div className="border-t">
                  <div className="flex h-10 items-center gap-2 border-b px-2 text-sm font-medium">Calendar
                    <span className="text-xs font-normal text-muted-foreground">drag on a day to log a block · drag blocks to say when work happened</span>
                  </div>
                  {/* Lanes keep their dividers even in the dividerless table
                      variant — the timeline needs the column edges. */}
                  <WeekCalendar frameless trailing showDayHeaders={false} template="12rem repeat(7, minmax(0,1fr)) 5rem"
                    laneDividerClass="border-l border-border/40"
                    days={days} todayISO={todayISO} logs={weekLogs} labelFor={(l) => rowLabelFor(labels, NAVY, l)} groups={groups} recents={recents}
                    run={run} runColor={labels.runColor(run)}
                    onCreate={({ projectId, phaseId, date, startMin, minutes, note }) => addTimeLog({ memberId: meId, projectId, phaseId, taskId: null, date, minutes, startMin, source: "manual", note })}
                    onPatch={(id, patch) => editTimeLog(id, patch)} />
                </div>
              )}
            </div>
          </div>

          {/* Calendar in a stock Card (separate section — non-unified variants) */}
          {!unified && <div className="px-4 lg:px-6">
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
          </div>}

        </div>
      </div>
    </ScrollArea>
  );
}
