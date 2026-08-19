import React, { useState, useEffect, useMemo } from "react";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { MONTHS, DOW, pad, toISO, parseISO, startOfDay, addDays, startOfWeekMon, isWeekday, hm, fmtClock, fmtH, NAVY, AVATAR_BG, initials, PeoplePicker, pfList, projectsByClient, mapData, makeHandlers } from "../studio/core.jsx";
import { useRunningTimer, makeLabels, ProjectCombobox, recentCombos, parseHours, usePipTimer } from "./tracker/shared.jsx";
import { BudgetSection, HolidaySection } from "./time/sections.jsx";
import { useConfirm } from "../components/confirm.tsx";
import { Play, Square, PictureInPicture2, X, Clock, ChevronLeft, ChevronRight, Plane, NotebookPen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/* One free-text duration field per row: shows the logged total, commits on
   Enter (empty input on a ghost row accepts the suggestion), Escape reverts.
   Raw compact input by Summary's calendar-cell precedent — the board is a
   data grid, not a form. */
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
      placeholder={ghostMins != null ? fmtH(ghostMins / 60) : "0"}
      className="w-12 shrink-0 rounded-md border border-input bg-background px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-ring placeholder:text-muted-foreground/60"
      aria-label="Hours" />
  );
}

function RowItem({ row, ghost, canEdit, showPlay, labels, onSetTotal, onStart, onSaveNote }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteVal, setNoteVal] = useState(row.note || "");
  const label = row.taskId ? ((labels.taskById(row.taskId) || {}).title || "task") : `${(labels.projById(row.projectId) || { index: "—" }).index}${labels.phName(row.projectId, row.phaseId) ? " · " + labels.phName(row.projectId, row.phaseId) : ""}`;
  const full = row.taskId ? "Task · " + label : labels.labProj(row.projectId) + (labels.phName(row.projectId, row.phaseId) ? " · " + labels.phName(row.projectId, row.phaseId) : "");
  const color = row.taskId ? NAVY : labels.colorOf(row.projectId);
  return (
    <div className={`rounded-md border px-1.5 py-1 ${ghost ? "border-dashed bg-muted/30" : "border-border bg-card"}`}>
      <div className="flex items-center gap-1 min-w-0">
        <span className="size-2 rounded-xs shrink-0" style={{ background: color }} />
        <span className="text-[11px] leading-tight truncate" title={full + (row.note ? " — " + row.note : "")}>{label}</span>
        {row.note ? <NotebookPen size={10} className="text-muted-foreground shrink-0" /> : null}
      </div>
      <div className="flex items-center gap-1 mt-1">
        {canEdit
          ? <HoursField mins={ghost ? null : row.mins} ghostMins={ghost ? row.ghostMins : null} onCommit={onSetTotal} />
          : <span className="text-xs font-medium tabular-nums">{ghost ? "" : fmtH(row.mins / 60) + "h"}</span>}
        {ghost && canEdit && row.ghostMins != null &&
          <Button variant="outline" size="sm" onClick={() => onSetTotal(row.ghostMins)}>Log {fmtH(row.ghostMins / 60)}h</Button>}
        <span className="ml-auto flex items-center">
          {!ghost && canEdit && onSaveNote && (
            <Popover open={noteOpen} onOpenChange={(v) => { setNoteOpen(v); if (v) setNoteVal(row.note || ""); }}>
              <PopoverTrigger render={<Button variant="ghost" size="icon-xs" title="Note" />}><NotebookPen /></PopoverTrigger>
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
        </span>
      </div>
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
  const [adding, setAdding] = useState(null); // "mid|dISO" of the open add-row
  const [pending, setPending] = useState({}); // "mid|dISO" -> [{projectId,phaseId}]

  const labels = makeLabels(data);
  const todayISO = toISO(startOfDay(new Date()));
  const stop = () => { stopTimer(todayISO, { note: stopNote.trim() || null }); setStopNote(""); };
  const openPip = usePipTimer({ run, stop, top: () => labels.runTop(run), capMinutes });

  if (!canTrack && !canTeam) return <NoAccess what="time tracking" />;

  const groups = projectsByClient(data.projects, data.clients);
  const recents = recentCombos(data, meId);
  const teams = [...new Set(data.members.flatMap((m) => m.teams || []))].sort();

  const rs = startOfWeekMon(anchor), re = addDays(rs, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(rs, i));
  const rangeLabel = `${pad(rs.getDate())} ${MONTHS[rs.getMonth()]} – ${pad(re.getDate())} ${MONTHS[re.getMonth()]} ${re.getFullYear()}`;

  const visible = canTeam ? pfList(data.members, pf) : data.members.filter((m) => m.id === meId);
  const selfOnly = visible.length === 1 && visible[0]?.id === meId;
  const editableFor = (m) => (m.id === meId ? canTrack : canEditOthers);

  const logsIn = (mid, a, b) => (data.timeLogs || []).filter((l) => l.memberId === mid && l.date >= a && l.date <= b);
  const weekTot = (mid) => logsIn(mid, toISO(rs), toISO(re)).reduce((s, l) => s + l.minutes, 0);
  const grandTot = visible.reduce((s, m) => s + weekTot(m.id), 0);

  // Rows for one member-day: logged entries grouped to day totals, then
  // schedule-derived ghost suggestions (weekdays only) for what isn't logged
  // yet. Ghost hours = the assignment's hours_per_day when set, else the
  // member's daily hours split across that day's scheduled items (D4).
  const cellRows = (member, dISO) => {
    const logged = new Map();
    (data.timeLogs || []).forEach((l) => {
      if (l.memberId !== member.id || l.date !== dISO) return;
      const key = l.taskId ? "T|" + l.taskId : (l.projectId || "none") + "|" + (l.phaseId || "");
      const g = logged.get(key) || { key, ids: [], mins: 0, projectId: l.projectId, phaseId: l.phaseId, taskId: l.taskId, note: "" };
      g.ids.push(l.id); g.mins += l.minutes; if (l.note && !g.note) g.note = l.note;
      logged.set(key, g);
    });
    const sched = []; const seen = new Set();
    if (isWeekday(parseISO(dISO))) {
      data.assignments.forEach((a) => {
        if (a.memberId !== member.id || a.start > dISO || a.end < dISO) return;
        if (a.kind === "work" && a.projectId) {
          const key = a.projectId + "|" + (a.phaseId || ""); if (seen.has(key)) return; seen.add(key);
          sched.push({ key, projectId: a.projectId, phaseId: a.phaseId || null, taskId: null, value: (a.mode === "hours_per_day" && a.value > 0) ? a.value : null });
        } else if (a.kind === "internal" && a.taskId) {
          const key = "T|" + a.taskId; if (seen.has(key)) return; seen.add(key);
          sched.push({ key, projectId: null, phaseId: null, taskId: a.taskId, value: null });
        }
      });
    }
    // Unscheduled open tasks assigned to the member surface on today only.
    if (dISO === todayISO) {
      (data.internalTasks || []).forEach((t) => {
        if (t.assigneeId !== member.id || t.status === "done") return;
        const key = "T|" + t.id; if (seen.has(key)) return; seen.add(key);
        sched.push({ key, projectId: null, phaseId: null, taskId: t.id, value: null, unplanned: true });
      });
    }
    const denom = sched.filter((s) => !s.taskId).length || 1;
    const suggestions = sched.filter((s) => !logged.has(s.key)).map((s) => ({
      ...s, ids: [], mins: 0, note: "",
      ghostMins: s.taskId ? null : Math.round((s.value != null ? s.value : (member.daily || 8) / denom) * 60),
    }));
    const pend = (pending[member.id + "|" + dISO] || []).filter((p) => !logged.has(p.key) && !seen.has(p.key))
      .map((p) => ({ ...p, ids: [], mins: 0, note: "", ghostMins: null }));
    return { logged: [...logged.values()].sort((a, b) => b.mins - a.mins), suggestions: [...suggestions, ...pend] };
  };

  const setTotal = (member, dISO, row, minutes) => {
    setTimeLogTotal({ ids: row.ids, minutes, memberId: member.id, projectId: row.taskId ? null : (row.projectId || null), phaseId: row.taskId ? null : (row.phaseId || null), taskId: row.taskId || null, date: dISO });
  };

  const addPending = (member, dISO, pick) => {
    if (!pick.projectId) return;
    const key = pick.projectId + "|" + (pick.phaseId || "");
    setPending((p) => { const k = member.id + "|" + dISO; const list = p[k] || []; if (list.some((x) => x.key === key)) return p; return { ...p, [k]: [...list, { key, projectId: pick.projectId, phaseId: pick.phaseId || null, taskId: null }] }; });
    setAdding(null);
  };

  const discard = async () => {
    const mins = run ? Math.round((Date.now() - run.startedAt) / 60000) : 0;
    if (mins > 5 && !(await confirm({ title: "Discard this timer?", description: hm(mins) + " of tracked time will be thrown away.", confirmLabel: "Discard", destructive: true }))) return;
    setStopNote(""); cancel();
  };
  const elapsed = run ? fmtClock(Math.min((now - run.startedAt) / 1000, capMinutes * 60)) : null;

  const shift = (dir) => setAnchor((a) => addDays(a, dir * 7));

  const DayCell = (member, d) => {
    const dISO = toISO(d);
    const { logged, suggestions } = cellRows(member, dISO);
    const dayTot = logged.reduce((s, r) => s + r.mins, 0);
    const isToday = dISO === todayISO;
    const wknd = !isWeekday(d);
    const editable = editableFor(member);
    const addKey = member.id + "|" + dISO;
    return (
      <div key={dISO} className={`rounded-lg border flex flex-col ${isToday ? "border-primary/40 bg-primary/5" : wknd ? "bg-muted/40 border-border/60" : "border-border"}`}>
        <div className="px-2 py-1 border-b border-border/60 flex items-center justify-between text-xs">
          <span className={`font-medium ${isToday ? "text-foreground" : "text-muted-foreground"}`}>{DOW[d.getDay()]} {pad(d.getDate())}</span>
          <span className="text-muted-foreground tabular-nums">{dayTot ? fmtH(dayTot / 60) + "h" : ""}</span>
        </div>
        <div className="p-1.5 flex flex-col gap-1 flex-1" style={{ minHeight: 64 }}>
          {logged.map((row) => (
            <RowItem key={row.key} row={row} ghost={false} canEdit={editable} labels={labels}
              showPlay={member.id === meId && canTrack && isToday && !run}
              onSetTotal={(m) => setTotal(member, dISO, row, m)}
              onStart={() => (row.taskId ? startTask(row.taskId) : start(row.projectId, row.phaseId))}
              onSaveNote={(note) => editTimeLog(row.ids[0], { note })} />
          ))}
          {editable && suggestions.map((row) => (
            <RowItem key={row.key} row={row} ghost canEdit={editable} labels={labels}
              showPlay={member.id === meId && canTrack && isToday && !run}
              onSetTotal={(m) => setTotal(member, dISO, row, m)}
              onStart={() => (row.taskId ? startTask(row.taskId) : start(row.projectId, row.phaseId))} />
          ))}
          {logged.length === 0 && suggestions.length === 0 && <div className="text-[10px] text-muted-foreground text-center py-1.5">—</div>}
          {editable && (adding === addKey
            ? <ProjectCombobox selP="" selPh="" onPick={(pick) => addPending(member, dISO, pick)} groups={groups} recents={member.id === meId ? recents : recentCombos(data, member.id)} placeholder="Add project…" className="w-full" />
            : <button onClick={() => setAdding(addKey)} className="flex items-center justify-center gap-1 rounded-md border border-dashed border-border/60 py-0.5 text-[11px] text-muted-foreground/70 hover:text-foreground hover:border-border transition"><Plus size={11} /> Add</button>)}
        </div>
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
          {visible.map((m, mi) => (
            <div key={m.id} className="rounded-xl border bg-card p-3">
              {!selfOnly && (
                <div className="flex items-center gap-2 mb-2">
                  <Avatar size="sm"><AvatarFallback className="text-white" style={{ background: AVATAR_BG[data.members.findIndex((x) => x.id === m.id) % AVATAR_BG.length] }}>{initials(m.name)}</AvatarFallback></Avatar>
                  <span className="font-medium text-sm">{m.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Week <span className="font-medium text-foreground">{fmtH(weekTot(m.id) / 60)}h</span></span>
                </div>
              )}
              <div className="hidden md:grid grid-cols-7 gap-1.5">{days.map((d) => DayCell(m, d))}</div>
              <div className="md:hidden">
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {days.map((d) => { const iso = toISO(d); const sel = toISO(focusDay) === iso; return (
                    <button key={iso} onClick={() => setFocusISO(iso)} className={`rounded-lg border px-0.5 py-1 text-center text-[11px] ${sel ? "border-primary/40 bg-primary/10 font-medium" : iso === todayISO ? "border-primary/30" : "border-border"}`}>
                      {DOW[d.getDay()]}<br />{pad(d.getDate())}
                    </button>); })}
                </div>
                {DayCell(m, focusDay)}
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
