import React, { useState, useEffect, useMemo } from "react";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { MONTHS, DOW, pad, toISO, parseISO, startOfDay, addDays, startOfWeekMon, isWeekday, hm, fmtClock, fmtH, NAVY, AVATAR_BG, initials, PeoplePicker, pfList, projectsByClient, mapData, makeHandlers } from "../studio/core.jsx";
import { useRunningTimer, makeLabels, ProjectCombobox, recentCombos, parseHours, usePipTimer, taskProject } from "./tracker/shared.jsx";
import { BudgetSection, HolidaySection } from "./time/sections.jsx";
import { useConfirm } from "../components/confirm.tsx";
import { Play, Square, PictureInPicture2, X, Clock, ChevronLeft, ChevronRight, Plane, NotebookPen, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/* One free-text duration field per cell: shows the logged total, commits on
   Enter (empty input on a suggested cell accepts the suggestion), Escape
   reverts. Raw compact input by Summary's calendar-cell precedent — the board
   is a data grid, not a form. */
function HoursField({ mins, ghostMins, onCommit }) {
  const shown = mins != null ? fmtH(mins / 60) : "";
  const [val, setVal] = useState(shown);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setVal(shown); }, [shown, focus]); // eslint-disable-line
  const commit = () => {
    const t = String(val).trim();
    if (t === "" && mins == null && ghostMins != null) { onCommit(ghostMins); return; }
    if (t === "") return;
    const m = parseHours(t);
    if (m != null) onCommit(m);
  };
  return (
    <input value={val} onChange={(e) => setVal(e.target.value)}
      onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); setVal(shown); }}
      onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } if (e.key === "Escape") { setVal(shown); e.currentTarget.blur(); } }}
      placeholder={ghostMins != null ? fmtH(ghostMins / 60) : ""}
      className="w-full min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-ring placeholder:text-muted-foreground/50"
      aria-label="Hours" />
  );
}

/* One row×day cell: hours field, one-tap accept when the schedule suggests
   hours, note popover on logged cells, play verb on the member's own today. */
function GridCell({ cell, editable, showPlay, isToday, wknd, onCommit, onStart, onSaveNote }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteVal, setNoteVal] = useState(cell.note || "");
  return (
    <div className={`group flex items-center gap-0.5 rounded-md border px-1 py-1 ${isToday ? "border-primary/40 bg-primary/5" : cell.ghostMins != null ? "border-dashed border-border/70 bg-muted/30" : wknd ? "border-border/50 bg-muted/30" : "border-border/70 bg-card"}`}>
      {editable
        ? <HoursField mins={cell.mins} ghostMins={cell.ghostMins} onCommit={onCommit} />
        : <span className="flex-1 text-xs font-medium tabular-nums px-1">{cell.mins != null ? fmtH(cell.mins / 60) : ""}</span>}
      {editable && cell.ghostMins != null &&
        <Button variant="ghost" size="icon-xs" title={"Log " + fmtH(cell.ghostMins / 60) + "h (planned)"} onClick={() => onCommit(cell.ghostMins)}><Check /></Button>}
      {cell.mins != null && editable && onSaveNote && (
        <Popover open={noteOpen} onOpenChange={(v) => { setNoteOpen(v); if (v) setNoteVal(cell.note || ""); }}>
          <PopoverTrigger render={<Button variant="ghost" size="icon-xs" title={cell.note || "Add note"} className={cell.note ? "" : "opacity-0 group-hover:opacity-100"} />}><NotebookPen /></PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="end">
            <div className="flex items-center gap-2">
              <Input value={noteVal} onChange={(e) => setNoteVal(e.target.value)} placeholder="What was this time?"
                onKeyDown={(e) => { if (e.key === "Enter") { onSaveNote(noteVal.trim() || null); setNoteOpen(false); } }} />
              <Button onClick={() => { onSaveNote(noteVal.trim() || null); setNoteOpen(false); }}>Save</Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
      {showPlay && <Button variant="ghost" size="icon-xs" title="Start timer" onClick={onStart}><Play /></Button>}
    </div>
  );
}

export default function Time({ org, me, data: cadData, reload }) {
  const meId = me.id;
  const data = useMemo(() => mapData(cadData), [cadData]);
  const H = useMemo(() => makeHandlers(org, reload, cadData), [org, cadData]); // eslint-disable-line
  const { addTimeLog, setTimeLogTotal, editTimeLog, patchMember, addPublicHoliday, delPublicHoliday } = H;
  const confirm = useConfirm();

  const canTrack = can(me, "time.track");
  const canTeam = can(me, "summary.view");
  const canEditOthers = can(me, "summary.edit");
  const canManageTeam = can(me, "team.manage");

  const myMember = data.members.find((m) => m.id === meId);
  const { run, start, startTask, stop: stopTimer, cancel, capMinutes } = useRunningTimer(meId, { addTimeLog, orgId: org.id, dailyHours: myMember?.daily || 8 });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!run) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [run]);
  const [stopNote, setStopNote] = useState("");

  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [mode, setMode] = useState("week");
  const [pf, setPf] = useState(() => [meId]);
  const [focusISO, setFocusISO] = useState(() => toISO(startOfDay(new Date())));
  const [adding, setAdding] = useState(null); // member id with the add-row combobox open
  const [pending, setPending] = useState({}); // member id -> [{key, projectId, phaseId}]

  const labels = makeLabels(data);
  const todayISO = toISO(startOfDay(new Date()));
  const stop = () => { stopTimer(todayISO, { note: stopNote.trim() || null }); setStopNote(""); };
  const openPip = usePipTimer({ run, stop, top: () => labels.runTop(run), capMinutes });

  if (!canTrack && !canTeam) return <NoAccess what="time tracking" />;

  const groups = projectsByClient(data.projects, data.clients);
  const recents = recentCombos(data, meId);
  const teams = [...new Set(data.members.flatMap((m) => m.teams || []))].sort();

  const rs = startOfWeekMon(anchor), re = addDays(rs, 6);
  const rsISO = toISO(rs), reISO = toISO(re);
  const days = Array.from({ length: 7 }, (_, i) => addDays(rs, i));
  const rangeLabel = `${pad(rs.getDate())} ${MONTHS[rs.getMonth()]} – ${pad(re.getDate())} ${MONTHS[re.getMonth()]} ${re.getFullYear()}`;

  const visible = canTeam ? pfList(data.members, pf) : data.members.filter((m) => m.id === meId);
  const selfOnly = visible.length === 1 && visible[0]?.id === meId;
  const editableFor = (m) => (m.id === meId ? canTrack : canEditOthers);

  const logKey = (l) => (l.taskId ? "T|" + l.taskId : (l.projectId || "none") + "|" + (l.phaseId || ""));
  const weekLogs = (mid) => (data.timeLogs || []).filter((l) => l.memberId === mid && l.date >= rsISO && l.date <= reISO);
  const weekTot = (mid) => weekLogs(mid).reduce((s, l) => s + l.minutes, 0);
  const grandTot = visible.reduce((s, m) => s + weekTot(m.id), 0);

  // The person's row list for the week: every project(+phase) or task they
  // logged against, are scheduled on, or have open assigned tasks for —
  // one row, aligned across all seven day columns.
  const memberRows = (member) => {
    const rows = new Map();
    const put = (key, r) => { if (!rows.has(key)) rows.set(key, r); };
    weekLogs(member.id).forEach((l) => put(logKey(l), { key: logKey(l), projectId: l.taskId ? null : l.projectId, phaseId: l.taskId ? null : (l.phaseId || null), taskId: l.taskId || null }));
    data.assignments.forEach((a) => {
      if (a.memberId !== member.id || a.start > reISO || a.end < rsISO) return;
      if (a.kind === "work" && a.projectId) { const k = a.projectId + "|" + (a.phaseId || ""); put(k, { key: k, projectId: a.projectId, phaseId: a.phaseId || null, taskId: null }); }
      else if (a.kind === "internal" && a.taskId) { const k = "T|" + a.taskId; put(k, { key: k, projectId: null, phaseId: null, taskId: a.taskId }); }
    });
    if (todayISO >= rsISO && todayISO <= reISO) {
      (data.internalTasks || []).forEach((t) => { if (t.assigneeId !== member.id || t.status === "done") return; put("T|" + t.id, { key: "T|" + t.id, projectId: null, phaseId: null, taskId: t.id }); });
    }
    (pending[member.id] || []).forEach((p) => put(p.key, { ...p }));
    const arr = [...rows.values()];
    const sortLbl = (r) => (r.taskId ? "￿" + ((labels.taskById(r.taskId) || {}).title || "") : `${(labels.projById(r.projectId) || { index: "" }).index}|${labels.phName(r.projectId, r.phaseId)}`);
    arr.sort((a, b) => sortLbl(a).localeCompare(sortLbl(b)));
    return arr;
  };

  // What the schedule says this member should be on for one day (weekdays
  // only): row key -> planned hours (null = no explicit hours).
  const schedFor = (member, dISO) => {
    const values = new Map();
    if (!isWeekday(parseISO(dISO))) return { values, projCount: 0 };
    data.assignments.forEach((a) => {
      if (a.memberId !== member.id || a.start > dISO || a.end < dISO) return;
      if (a.kind === "work" && a.projectId) { const k = a.projectId + "|" + (a.phaseId || ""); if (!values.has(k)) values.set(k, (a.mode === "hours_per_day" && a.value > 0) ? a.value : null); }
      else if (a.kind === "internal" && a.taskId) { const k = "T|" + a.taskId; if (!values.has(k)) values.set(k, null); }
    });
    const projCount = [...values.keys()].filter((k) => !k.startsWith("T|")).length;
    return { values, projCount };
  };

  // One row×day cell. Ghost hours (D4): the assignment's hours_per_day when
  // set, else the member's daily hours split across that day's scheduled
  // projects. Tasks get a ghost cell without suggested hours.
  const cellFor = (member, row, dISO, sched) => {
    const logs = (data.timeLogs || []).filter((l) => l.memberId === member.id && l.date === dISO && logKey(l) === row.key);
    const mins = logs.length ? logs.reduce((s, l) => s + l.minutes, 0) : null;
    const note = logs.map((l) => l.note).find(Boolean) || "";
    let ghostMins = null;
    if (mins == null && sched.values.has(row.key) && !row.taskId) {
      const v = sched.values.get(row.key);
      ghostMins = Math.round((v != null ? v : (member.daily || 8) / (sched.projCount || 1)) * 60);
    }
    return { ids: logs.map((l) => l.id), mins, note, ghostMins };
  };

  const setTotal = (member, dISO, row, cell, minutes) => {
    // Task rows attribute to the task's project/phase (slice 6) — also
    // migrates any pre-attribution entries the cell aggregates.
    const attr = row.taskId ? taskProject(data, row.taskId) : { projectId: row.projectId || null, phaseId: row.phaseId || null };
    setTimeLogTotal({ ids: cell.ids, minutes, memberId: member.id, projectId: attr.projectId || null, phaseId: attr.phaseId || null, taskId: row.taskId || null, date: dISO });
  };

  const addPending = (member, pick) => {
    if (!pick.projectId) return;
    const key = pick.projectId + "|" + (pick.phaseId || "");
    setPending((p) => { const list = p[member.id] || []; if (list.some((x) => x.key === key)) return p; return { ...p, [member.id]: [...list, { key, projectId: pick.projectId, phaseId: pick.phaseId || null, taskId: null }] }; });
    setAdding(null);
  };

  const discard = async () => {
    const mins = run ? Math.round((Date.now() - run.startedAt) / 60000) : 0;
    if (mins > 5 && !(await confirm({ title: "Discard this timer?", description: hm(mins) + " of tracked time will be thrown away.", confirmLabel: "Discard", destructive: true }))) return;
    setStopNote(""); cancel();
  };
  const elapsed = run ? fmtClock(Math.min((now - run.startedAt) / 1000, capMinutes * 60)) : null;
  const shift = (dir) => setAnchor((a) => addDays(a, dir * 7));

  const rowLabel = (row) => {
    if (row.taskId) { const t = labels.taskById(row.taskId); return { text: (t || {}).title || "task", full: "Task · " + ((t || {}).title || "task") + (t?.projectId ? " — " + labels.labTop(t.projectId) : ""), color: t?.projectId ? labels.colorOf(t.projectId) : NAVY }; }
    const ph = labels.phName(row.projectId, row.phaseId);
    return { text: `${(labels.projById(row.projectId) || { index: "—" }).index}${ph ? " · " + ph : ""}`, full: labels.labProj(row.projectId) + (ph ? " · " + ph : ""), color: labels.colorOf(row.projectId) };
  };

  // The aligned grid for one member: left label column (person's projects),
  // one column per shown day, then the row's week total.
  const MemberGrid = (member, shownDays) => {
    const rows = memberRows(member);
    const editable = editableFor(member);
    const scheds = shownDays.map((d) => schedFor(member, toISO(d)));
    const dayTots = shownDays.map((d) => { const dISO = toISO(d); return weekLogs(member.id).filter((l) => l.date === dISO).reduce((s, l) => s + l.minutes, 0); });
    const rowTot = (row) => weekLogs(member.id).filter((l) => logKey(l) === row.key).reduce((s, l) => s + l.minutes, 0);
    const gridCols = { gridTemplateColumns: `minmax(150px,200px) repeat(${shownDays.length}, minmax(0,1fr)) 56px` };
    return (
      <div className="grid gap-1 items-center" style={gridCols}>
        {/* header row */}
        <div />
        {shownDays.map((d, i) => { const dISO = toISO(d); const isToday = dISO === todayISO; return (
          <div key={dISO} className={`px-1 py-0.5 text-xs flex items-baseline justify-between ${isToday ? "font-medium text-foreground" : "text-muted-foreground"}`}>
            <span>{DOW[d.getDay()]} {pad(d.getDate())}</span>
            <span className="tabular-nums">{dayTots[i] ? fmtH(dayTots[i] / 60) + "h" : ""}</span>
          </div>); })}
        <div className="px-1 py-0.5 text-xs text-muted-foreground text-right">Week</div>

        {/* one row per project/task, cells aligned under the day columns */}
        {rows.map((row) => { const lab = rowLabel(row); const tot = rowTot(row); return (
          <React.Fragment key={row.key}>
            <div className="flex items-center gap-1.5 min-w-0 pr-1">
              <span className="size-2.5 rounded-xs shrink-0" style={{ background: lab.color }} />
              <span className="text-xs truncate" title={lab.full}>{lab.text}</span>
              {row.taskId && <span className="text-[10px] text-muted-foreground shrink-0">task</span>}
            </div>
            {shownDays.map((d, i) => { const dISO = toISO(d); const cell = cellFor(member, row, dISO, scheds[i]); return (
              <GridCell key={dISO} cell={cell} editable={editable} isToday={dISO === todayISO} wknd={!isWeekday(d)}
                showPlay={member.id === meId && canTrack && dISO === todayISO && !run}
                onCommit={(m) => setTotal(member, dISO, row, cell, m)}
                onStart={() => (row.taskId ? startTask(row.taskId, taskProject(data, row.taskId)) : start(row.projectId, row.phaseId))}
                onSaveNote={cell.ids.length ? (note) => editTimeLog(cell.ids[0], { note }) : null} />); })}
            <div className="px-1 text-xs font-medium tabular-nums text-right">{tot ? fmtH(tot / 60) + "h" : ""}</div>
          </React.Fragment>); })}

        {/* add-row */}
        {editable && (
          <React.Fragment>
            {adding === member.id
              ? <ProjectCombobox selP="" selPh="" onPick={(pick) => addPending(member, pick)} groups={groups} recents={member.id === meId ? recents : recentCombos(data, member.id)} placeholder="Add project…" className="w-full" />
              : <button onClick={() => setAdding(member.id)} className="flex items-center gap-1 rounded-md border border-dashed border-border/60 px-1.5 py-1 text-[11px] text-muted-foreground/70 hover:text-foreground hover:border-border transition"><Plus size={11} /> Add project</button>}
            {shownDays.map((d) => <div key={toISO(d)} />)}
            <div />
          </React.Fragment>
        )}
        {rows.length === 0 && !editable && <>
          <div className="text-xs text-muted-foreground col-span-full py-1">Nothing scheduled or logged this week.</div>
        </>}
      </div>
    );
  };

  const focusDay = days.find((d) => toISO(d) === focusISO) || (days.find((d) => toISO(d) === todayISO) || days[0]);

  return (
    <ScrollArea className="h-full bg-muted/30">
      <div className="max-w-6xl mx-auto flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Clock size={16} className="text-muted-foreground" />
          {mode === "week" ? <>
            <ButtonGroup>
              <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous week"><ChevronLeft /></Button>
              <Button variant="outline" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
              <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next week"><ChevronRight /></Button>
            </ButtonGroup>
            <span className="text-sm font-medium">{rangeLabel}</span>
            {canTeam && <PeoplePicker members={data.members} teams={teams} value={pf} onChange={setPf} me={meId} />}
            <span className="ml-auto text-sm text-muted-foreground">This week <span className="font-medium text-foreground">{fmtH(grandTot / 60)}h</span></span>
          </> : <span className="text-sm font-medium">Holiday</span>}
          {canTeam && <Button variant={mode === "holiday" ? "default" : "outline"} className={mode === "week" ? "" : "ml-auto"} onClick={() => setMode(mode === "holiday" ? "week" : "holiday")}><Plane data-icon="inline-start" /> {mode === "holiday" ? "Back to hours" : "Holiday"}</Button>}
        </div>

        {mode === "week" ? <>
          {run && (
            <div className="rounded-xl p-3 text-white shadow-xs" style={{ background: labels.runColor(run) }}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="size-2.5 rounded-full bg-card shrink-0" style={{ animation: "pulse 1.5s infinite" }} />
                <div className="min-w-0"><div className="text-xs opacity-90 truncate">{labels.runTop(run)}{!run.taskId && labels.phName(run.projectId, run.phaseId) ? " · " + labels.phName(run.projectId, run.phaseId) : ""}</div><div className="text-2xl font-medium tabular-nums leading-tight">{elapsed}</div></div>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  <Input value={stopNote} onChange={(e) => setStopNote(e.target.value)} placeholder="Add a note… (optional)" className="w-52 bg-card text-foreground" />
                  <Button variant="secondary" onClick={stop}><Square data-icon="inline-start" /> Stop &amp; log</Button>
                  <Button variant="secondary" size="icon" title="Pop out floating timer" onClick={openPip}><PictureInPicture2 /></Button>
                  <Button variant="secondary" size="icon" title="Discard" onClick={discard}><X /></Button>
                </div>
              </div>
            </div>
          )}

          {visible.length === 0 && <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No people selected.</div>}
          {visible.map((m) => (
            <div key={m.id} className="rounded-xl border bg-card p-3">
              {!selfOnly && (
                <div className="flex items-center gap-2 mb-2">
                  <Avatar size="sm"><AvatarFallback className="text-white" style={{ background: AVATAR_BG[data.members.findIndex((x) => x.id === m.id) % AVATAR_BG.length] }}>{initials(m.name)}</AvatarFallback></Avatar>
                  <span className="font-medium text-sm">{m.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Week <span className="font-medium text-foreground">{fmtH(weekTot(m.id) / 60)}h</span></span>
                </div>
              )}
              <div className="hidden md:block">{MemberGrid(m, days)}</div>
              <div className="md:hidden">
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {days.map((d) => { const iso = toISO(d); const sel = toISO(focusDay) === iso; return (
                    <button key={iso} onClick={() => setFocusISO(iso)} className={`rounded-lg border px-0.5 py-1 text-center text-[11px] ${sel ? "border-primary/40 bg-primary/10 font-medium" : iso === todayISO ? "border-primary/30" : "border-border"}`}>
                      {DOW[d.getDay()]}<br />{pad(d.getDate())}
                    </button>); })}
                </div>
                {MemberGrid(m, [focusDay])}
              </div>
            </div>
          ))}

          {canTeam && <BudgetSection data={data} rs={rs} re={re} canSeeCost={can(me, "billing.view")} />}
        </> : (
          <HolidaySection data={data} publicHolidays={data.publicHolidays} canManage={canManageTeam}
            patchMember={canManageTeam ? patchMember : () => {}} addPublicHoliday={canManageTeam ? addPublicHoliday : () => {}} delPublicHoliday={canManageTeam ? delPublicHoliday : () => {}} />
        )}
      </div>
    </ScrollArea>
  );
}
