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
import { useRunningTimer, makeLabels, ProjectCombobox, recentCombos, taskProject, parseHours } from "../tracker/shared.jsx";
import WeekCalendar, { rowDragProps } from "../tracker/WeekCalendar.jsx";
import { weekRows, schedForDay, cellForDay, rowLabelFor, logKey, defaultPhase } from "./weekData.js";
import { HoursField, HoursFieldFancy, AddProjectPopup, fmtClockDur } from "./LabBits.jsx";
import { Play, Square, PictureInPicture2, X, ChevronLeft, ChevronRight, Plus, Check } from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// `fancyHours` swaps the plain hours input for the HoursFieldFancy
// composition (centered value, hover-✓ confirm inside the input, focus
// steppers) — V3.1 in the sidebar. `aligned` shares one fixed column
// template between the logger grid and the calendar card so the day lanes
// line up across the two cards (the V2.1 idea in the card language).
// `playInProject` moves the start verb into the project column — one fixed
// place per row, always logging to today — instead of inside today's cell.
// `bare` drops the logger's Card chrome for V1's open layout (nav row + bare
// grid on the page ground); only the calendar keeps its own Card — V3.2.
// `planning` makes the logger's project labels draggable onto calendar days
// (each drop logs an hour block that feeds straight back into the grid) —
// V3.3, which is V3.2 with V3.1's aligned columns.
export default function TimesheetV3({ org, me, data: cadData, reload, fancyHours = false, aligned = false, playInProject = false, bare = false, planning = false, variantLabel = "V3 · card" }) {
  const meId = me.id;
  const data = useMemo(() => mapData(cadData), [cadData]);
  const H = useMemo(() => makeHandlers(org, reload, cadData), [org, cadData]); // eslint-disable-line
  const { addTimeLog, setTimeLogTotal, editTimeLog, delTimeLogs } = H;

  const canTrack = can(me, "time.track");
  const member = data.members.find((m) => m.id === meId);
  const { run, start, startTask } = useRunningTimer(meId, { addTimeLog, orgId: org.id, dailyHours: member?.daily || 8 });
  // Tick while a timer runs so the calendar's live "recording" block grows.
  const [, setNow] = useState(Date.now());
  useEffect(() => { if (!run) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [run]);
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [dateOpen, setDateOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addPick, setAddPick] = useState({ projectId: "", phaseId: null });
  const [addDay, setAddDay] = useState("");
  const [addStart, setAddStart] = useState("9:00");
  const [addHours, setAddHours] = useState("1:00");

  const labels = makeLabels(data);
  const todayISO = toISO(startOfDay(new Date()));

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
  // Every duration on the screen speaks the active dialect: clock notation
  // with fancy hours, decimal hours otherwise.
  const dur = fancyHours ? fmtClockDur : (min) => fmtH(min / 60) + "h";
  const durNum = fancyHours ? fmtClockDur : (min) => fmtH(min / 60); // bare number before a /capacity suffix

  const setTotal = (dISO, row, cell, minutes) => {
    const attr = row.taskId ? taskProject(data, row.taskId) : { projectId: row.projectId || null, phaseId: row.phaseId || null };
    setTimeLogTotal({ ids: cell.ids, minutes, memberId: meId, projectId: attr.projectId || null, phaseId: attr.phaseId || null, taskId: row.taskId || null, date: dISO });
  };
  const addPending = (pick) => {
    if (!pick.projectId) return;
    const phaseId = pick.phaseId || defaultPhase(data, meId, pick.projectId, rsISO, reISO);
    const key = pick.projectId + "|" + (phaseId || "");
    setPending((list) => (list.some((x) => x.key === key) ? list : [...list, { key, projectId: pick.projectId, phaseId, taskId: null }]));
    setAdding(false);
  };
  const shift = (dir) => setAnchor((a) => addDays(a, dir * 7));

  // Calendar "Add project" popover (planning): a block on a day of this week,
  // at an optional start time (empty start = unplaced, "no time" strip).
  const openAdd = () => {
    setAddPick({ projectId: "", phaseId: null });
    setAddDay(todayISO >= rsISO && todayISO <= reISO ? todayISO : rsISO);
    setAddStart("9:00"); setAddHours("1:00"); setAddOpen(true);
  };
  const submitAdd = () => {
    const minutes = parseHours(addHours);
    if (!addPick.projectId || !minutes) return;
    const st = String(addStart).trim() === "" ? null : parseHours(addStart);
    addTimeLog({ memberId: meId, projectId: addPick.projectId, phaseId: addPick.phaseId || defaultPhase(data, meId, addPick.projectId, addDay), taskId: null, date: addDay, minutes, startMin: st, source: "manual", note: null });
    setAddOpen(false);
  };

  // Aligned mode fixes the flexible columns and drops the x-gap so the
  // logger's column edges land exactly on the calendar's gapless lanes; the
  // spacing between V3's chips is recreated inside each track with cell
  // margins (half the 6px gap per side), so the spaced look survives.
  const template = "12rem repeat(7, minmax(0,1fr)) 5rem";
  const gridCols = { gridTemplateColumns: aligned ? template : `minmax(180px,240px) repeat(7, minmax(0,1fr)) 72px` };
  const gridGap = aligned ? "gap-y-1.5" : "gap-1.5";
  const inset = aligned ? "mx-[3px]" : "";
  // The fancy field centers its numeral, so the day headers and daily totals
  // center too — one axis of alignment down the whole column.
  const dayAlign = fancyHours ? "text-center" : "";

  // One grid each for the week rows and the capacity footer — the card and
  // bare (V3.2) layouts pour the same grids into different chrome.
  const loggerGrid = (
                <div className={`grid ${gridGap} items-center`} style={gridCols}>
                  <div className={`rounded-md ${inset} bg-muted/50 px-2 py-1.5 text-sm font-medium`}>Project</div>
                  {days.map((d) => { const dISO = toISO(d); const isToday = dISO === todayISO; return (
                    <div key={dISO} className={`rounded-md ${inset} px-1.5 py-1.5 text-sm ${dayAlign} ${isToday ? "bg-primary/10 font-medium text-foreground" : "bg-muted/50 text-muted-foreground"}`}>
                      {DOW[d.getDay()]} {pad(d.getDate())}
                    </div>); })}
                  <div className={`rounded-md ${inset} bg-muted/50 px-1.5 py-1.5 text-sm text-muted-foreground text-right`}>Week</div>

                  {rows.map((row) => { const lab = rowLabel(row); const tot = rowTot(row); return (
                    <React.Fragment key={row.key}>
                      <div className={`flex items-center gap-2 min-w-0 pr-1 pl-1 ${inset} ${planning ? "cursor-grab active:cursor-grabbing" : ""}`}
                        {...(planning ? { ...rowDragProps({ projectId: row.projectId, phaseId: row.phaseId, taskId: row.taskId, color: lab.color, label: lab.text }), title: "Drag onto a calendar day to plan it" } : {})}>
                        <span className="size-3 rounded-xs shrink-0" style={{ background: lab.color }} />
                        <span className="text-sm truncate" title={lab.full}>{lab.text}</span>
                        {row.taskId && <span className="text-xs text-muted-foreground shrink-0">task</span>}
                        {playInProject && !run && <Button variant="ghost" size="icon" className="ml-auto" title="Start timer — logs to today"
                          onClick={() => (row.taskId ? startTask(row.taskId, taskProject(data, row.taskId)) : start(row.projectId, row.phaseId))}><Play /></Button>}
                      </div>
                      {days.map((d, i) => { const dISO = toISO(d); const cell = cellForDay({ weekLogs, row, dISO, sched: scheds[i], daily: member.daily }); const isToday = dISO === todayISO; const tint = isToday ? "bg-primary/5" : !isWeekday(d) ? "bg-muted/30" : "";
                        // With the start verb in the project column the field
                        // IS the cell — no box-inside-a-box; the day tint rides
                        // on the input group itself, and today's outline speaks
                        // the accent palette instead of the default grey.
                        if (fancyHours && playInProject) return <HoursFieldFancy key={dISO} className={`w-auto ${inset} ${tint} ${isToday ? "border-primary/50" : ""}`} mins={cell.mins} ghostMins={cell.ghostMins} onCommit={(m) => setTotal(dISO, row, cell, m)} />;
                        return (
                        <div key={dISO} className={`group flex items-center gap-1 rounded-md ${inset} px-1 py-1 ${tint}`}>
                          {fancyHours
                            ? <HoursFieldFancy mins={cell.mins} ghostMins={cell.ghostMins} onCommit={(m) => setTotal(dISO, row, cell, m)} />
                            : <>
                                <HoursField mins={cell.mins} ghostMins={cell.ghostMins} onCommit={(m) => setTotal(dISO, row, cell, m)} />
                                {cell.ghostMins != null && <Button variant="ghost" size="icon" title={"Log " + fmtH(cell.ghostMins / 60) + "h (planned)"} onClick={() => setTotal(dISO, row, cell, cell.ghostMins)}><Check /></Button>}
                              </>}
                          {!playInProject && isToday && !run && <Button variant="ghost" size="icon" title="Start timer" onClick={() => (row.taskId ? startTask(row.taskId, taskProject(data, row.taskId)) : start(row.projectId, row.phaseId))}><Play /></Button>}
                        </div>); })}
                      <div className={`px-1.5 ${inset} text-sm font-medium tabular-nums text-right`}>{tot ? dur(tot) : ""}</div>
                    </React.Fragment>); })}

                  {/* Add-project occupies the next row — a new project takes
                      its place and pushes it down. */}
                  {/* Docs "Popup" pattern: button trigger, search inside the
                      dropdown. */}
                  <div className={inset}><AddProjectPopup groups={groups} recents={recents} onPick={addPending} /></div>
                  {days.map((d) => <div key={toISO(d)} />)}
                  <div />
                </div>
  );
  const footerGrid = (
                <div className={`grid ${gridGap} w-full items-center`} style={gridCols}>
                  <div className={`text-sm text-muted-foreground ${inset}`}>Daily total</div>
                  {days.map((d) => { const dISO = toISO(d); const t = dayTot(dISO); const wknd = !isWeekday(d); return (
                    <div key={dISO} className={`px-1 ${inset} text-sm tabular-nums ${dayAlign}`}>
                      {wknd
                        ? (t ? <span className="font-medium">{dur(t)}</span> : <span className="text-muted-foreground">—</span>)
                        : <><span className="font-medium">{durNum(t)}</span><span className="text-muted-foreground">/{member.daily || 8}h</span></>}
                    </div>); })}
                  <div className={`px-1.5 ${inset} text-sm tabular-nums text-right`}><span className="font-medium">{durNum(weekTotal)}</span><span className="text-muted-foreground">/{(member.daily || 8) * 5}h</span></div>
                </div>
  );
  const weekNav = (
                  <ButtonGroup>
                    <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous week"><ChevronLeft /></Button>
                    <Button variant="outline" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
                    <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next week"><ChevronRight /></Button>
                  </ButtonGroup>
  );

  return (
    <ScrollArea className="h-full">
      <div className="@container/main flex flex-col">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">

          {/* V1-style header row — the logger lives on the page ground. The
              week range doubles as the date-picker trigger (the Schedule
              header's stock Popover + Calendar composition). */}
          {bare && (
            <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6">
              <ButtonGroup>
                <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous week"><ChevronLeft /></Button>
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger render={<Button variant="outline" className="tabular-nums font-normal" />}>{rangeLabel}</PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    {/* Range mode purely as presentation: the controlled
                        selection is always the visible Mon–Sun week, and any
                        day click jumps to that day's week. */}
                    {/* Hovering any row previews the week-click: the whole
                        row bands, since a click always selects the week. */}
                    <CalendarPicker mode="range" weekStartsOn={1} selected={{ from: rs, to: re }} defaultMonth={anchor}
                      classNames={{ week: "rdp-week mt-2 flex w-full rounded-(--cell-radius) hover:bg-muted" }}
                      onDayClick={(d) => { setAnchor(startOfDay(d)); setDateOpen(false); }} />
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next week"><ChevronRight /></Button>
              </ButtonGroup>
              {variantLabel && <Badge variant="secondary">{variantLabel}</Badge>}
            </div>
          )}

          {/* The running timer (clock, stop, pop-out) lives only in the sidebar tracker. */}
          {/* Logger — a stock Card, or bare on the page ground (V3.2). */}
          {/* Aligned + bare: pad the open logger by the calendar Card's own
              content inset so the day columns line up across the two. */}
          {bare
            ? <div className={`px-4 lg:px-6 ${aligned ? "*:mx-4" : ""}`}>
                {loggerGrid}
                <div className="mt-3 border-t pt-3">{footerGrid}</div>
              </div>
            : <div className="px-4 lg:px-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Week logger <Badge variant="secondary" className="ml-1 align-middle">{variantLabel}</Badge></CardTitle>
                    <CardDescription>{rangeLabel} · type hours or tap a suggestion — Enter logs it</CardDescription>
                    <CardAction>{weekNav}</CardAction>
                  </CardHeader>
                  <CardContent>{loggerGrid}</CardContent>
                  <CardFooter>{footerGrid}</CardFooter>
                </Card>
              </div>}

          {/* Calendar as a stock Card */}
          <div className="px-4 lg:px-6">
            <Card>
              <CardHeader>
                <CardTitle>Calendar</CardTitle>
                <CardDescription>{planning
                  ? "Double-click or drag on a day to plan time · drag projects in from above · drag blocks between days (Alt to copy) · click a block to edit"
                  : "Drag on a day to log a block · drag blocks to say when work happened"}</CardDescription>
                {planning && (
                  <CardAction>
                    <Popover open={addOpen} onOpenChange={(o, det) => {
                      // The project/day lists are their own portaled popups —
                      // picking from them must not read as an outside press.
                      if (!o && det?.reason === "outside-press" && det.event?.target?.closest?.('[data-slot="combobox-content"],[data-slot="select-content"]')) return;
                      if (o) openAdd(); else setAddOpen(false);
                    }}>
                      <PopoverTrigger render={<Button variant="outline" />}><Plus data-icon="inline-start" /> Add project</PopoverTrigger>
                      <PopoverContent className="w-80" align="end">
                        <PopoverHeader>
                          <PopoverTitle>Add to the calendar</PopoverTitle>
                          <PopoverDescription>Logs a block — the week above fills in too.</PopoverDescription>
                        </PopoverHeader>
                        <ProjectCombobox selP={addPick.projectId} selPh={addPick.phaseId || ""} onPick={(p) => setAddPick({ projectId: p.projectId, phaseId: p.phaseId })} groups={groups} recents={recents} placeholder="Project…" className="w-full" autoFocus />
                        <Select value={addDay} onValueChange={setAddDay} items={Object.fromEntries(days.map((d) => [toISO(d), `${DOW[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]}`]))}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectGroup>{days.map((d) => <SelectItem key={toISO(d)} value={toISO(d)}>{DOW[d.getDay()]} {pad(d.getDate())} {MONTHS[d.getMonth()]}</SelectItem>)}</SelectGroup></SelectContent>
                        </Select>
                        <div className="grid grid-cols-2 gap-2">
                          <InputGroup>
                            <InputGroupAddon><InputGroupText>Start</InputGroupText></InputGroupAddon>
                            <InputGroupInput value={addStart} onChange={(e) => setAddStart(e.target.value)} placeholder="—" className="tabular-nums" aria-label="Start time" onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); }} />
                          </InputGroup>
                          <InputGroup>
                            <InputGroupAddon><InputGroupText>Hours</InputGroupText></InputGroupAddon>
                            <InputGroupInput value={addHours} onChange={(e) => setAddHours(e.target.value)} className="tabular-nums" aria-label="Hours" onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); }} />
                          </InputGroup>
                        </div>
                        <Button onClick={submitAdd} disabled={!addPick.projectId || !parseHours(addHours)}><Plus data-icon="inline-start" /> Add block</Button>
                      </PopoverContent>
                    </Popover>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent>
                <WeekCalendar frameless durFmt={fancyHours ? fmtClockDur : null}
                  template={aligned ? template : null} trailing={aligned} laneDividerClass="border-l border-border/40"
                  days={days} todayISO={todayISO} logs={weekLogs} labelFor={(l) => rowLabelFor(labels, NAVY, l)} groups={groups} recents={recents}
                  run={run} runColor={labels.runColor(run)}
                  onCreate={({ projectId, phaseId, taskId, date, startMin, minutes, note }) => {
                    // Task blocks (dragged-in task rows, copies) carry the task's own project/phase.
                    const attr = taskId ? taskProject(data, taskId) : { projectId, phaseId: phaseId || defaultPhase(data, meId, projectId, date) };
                    addTimeLog({ memberId: meId, projectId: attr.projectId || null, phaseId: attr.phaseId || null, taskId: taskId || null, date, minutes, startMin, source: "manual", note });
                  }}
                  // A phase-less project pick in the block editor also takes the
                  // scheduled phase — re-saving an old phase-less block tidies it up.
                  onPatch={(id, patch) => {
                    if (patch.projectId && !patch.phaseId) { const l = weekLogs.find((x) => x.id === id); patch = { ...patch, phaseId: defaultPhase(data, meId, patch.projectId, l ? l.date : todayISO) }; }
                    editTimeLog(id, patch);
                  }}
                  onDelete={(id) => delTimeLogs([id])} />
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </ScrollArea>
  );
}
