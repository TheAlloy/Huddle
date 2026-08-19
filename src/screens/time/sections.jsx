// Parked sections on the Time screen (docs/time-tracker-plan.md slice 4):
// budget-vs-logged and the Holiday mode, carried over from Summary so nothing
// is lost when the legacy screen retires. Their real home is the future
// Project plan screen (budgets) and Team (holiday); until then they live
// here. Duplicated with Summary.jsx during the transition on purpose — the
// legacy screen stays untouched and this copy dies with it in slice 7.
import React, { useState, useMemo } from "react";
import { MONTHS, pad, toISO, parseISO, startOfDay, addDays, isWeekday, AVATAR_BG, fmtH, money, leaveDayFraction, holidayYearOf, dRange } from "../../studio/core.jsx";
import { Clock, ChevronRight, Calendar, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";

export function BudgetSection({ data, rs, re, canSeeCost }) {
  const [open, setOpen] = useState(false);
  const [showContrib, setShowContrib] = useState(false);
  const phaseLogged = useMemo(() => { const map = {}; (data.timeLogs || []).forEach(l => { if (l.projectId) { const k = l.projectId + "|" + (l.phaseId || ""); map[k] = (map[k] || 0) + l.minutes; } }); return map; }, [data.timeLogs]);
  const clientById = (id) => data.clients.find(c => c.id === id);
  const budgetPhases = useMemo(() => {
    const active = new Set();
    for (const a of data.assignments) { if (a.kind !== "work" || !a.projectId || !a.phaseId) continue; if (parseISO(a.end) < rs || parseISO(a.start) > re) continue; active.add(a.projectId + "|" + a.phaseId); }
    for (const l of (data.timeLogs || [])) { if (!l.projectId || !l.phaseId) continue; const d = parseISO(l.date); if (d < rs || d > re) continue; active.add(l.projectId + "|" + l.phaseId); }
    const out = [];
    for (const pr of data.projects) {
      const cl = clientById(pr.clientId);
      for (const ph of (pr.phases || [])) {
        if (!(ph.hours > 0) || !active.has(pr.id + "|" + ph.id)) continue;
        const loggedH = (phaseLogged[pr.id + "|" + ph.id] || 0) / 60;
        out.push({ pr, cl, ph, loggedH, over: loggedH - ph.hours });
      }
    }
    out.sort((a, b) => (b.over - a.over) || String(a.pr.index).localeCompare(String(b.pr.index)));
    return out;
  }, [data, rs, re, phaseLogged]); // eslint-disable-line
  if (budgetPhases.length === 0) return null;
  return (
    <div className="rounded-xl border bg-card p-3">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 text-sm font-medium w-full">
        <ChevronRight size={14} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
        <Clock size={15} className="text-muted-foreground" /> Phase budgets — budget vs logged
        <span className="text-xs font-normal text-muted-foreground">(phases active this week · totals are whole-phase, all people)</span>
      </button>
      {open && <div className="mt-3">
        {canSeeCost && <div className="flex justify-end mb-2"><Button variant="ghost" size="sm" onClick={() => setShowContrib(v => !v)}>{showContrib ? "Hide breakdown" : "Show who's contributing"}</Button></div>}
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
          {budgetPhases.map(({ pr, cl, ph, loggedH, over }) => {
            const frac = Math.min(1, loggedH / ph.hours); const isOver = over > 0.05; const isOpen = showContrib && canSeeCost;
            const contrib = isOpen ? Object.entries((data.timeLogs || []).filter(l => l.projectId === pr.id && (l.phaseId || "") === ph.id).reduce((m, l) => { m[l.memberId] = (m[l.memberId] || 0) + l.minutes; return m; }, {})).map(([mid, mins]) => { const mm = data.members.find(x => x.id === mid); return { m: mm, mins, cost: (mm && Number.isFinite(mm.hourlyRate)) ? (mins / 60) * mm.hourlyRate : null }; }).sort((a, b) => b.mins - a.mins) : [];
            const totalCost = contrib.reduce((s, c) => s + (c.cost || 0), 0);
            const fee = Number(ph.fee) > 0 ? ph.fee : null;
            return (
              <div key={pr.id + ph.id} className="border border-border rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-sm text-foreground truncate"><span className="inline-block w-2.5 h-2.5 rounded-xs mr-1.5 align-middle" style={{ background: cl ? cl.color : "#94a3b8" }} />{pr.index} · {ph.name}</div>
                  <div className={`text-xs font-medium shrink-0 ${isOver ? "text-destructive" : "text-muted-foreground"}`}>{fmtH(loggedH)}h / {ph.hours}h</div>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${isOver ? "bg-destructive" : "bg-primary"}`} style={{ width: `${frac * 100}%` }} /></div>
                <div className={`mt-1 text-xs ${isOver ? "text-destructive" : "text-muted-foreground"}`}>{isOver ? `${fmtH(over)}h over budget` : `${fmtH(ph.hours - loggedH)}h remaining`}</div>
                {isOpen && (fee != null || totalCost > 0) && <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3">
                  {fee != null && <span>Billed <b className="text-foreground">{money(fee)}</b></span>}
                  {totalCost > 0 && <span>Cost of hours <b className="text-foreground">{money(totalCost)}</b>{fee != null && <b style={{ color: totalCost > fee ? "#eb5757" : "#27ae60" }}> · {totalCost > fee ? "over" : "under"} by {money(Math.abs(fee - totalCost))}</b>}</span>}
                </div>}
                {isOpen && <div className="mt-2 pt-2 border-t border-border/60 flex flex-col gap-1">
                  {contrib.length === 0 && <div className="text-xs text-muted-foreground">No time logged to this phase yet.</div>}
                  {contrib.map(({ m, mins, cost }) => (<div key={m ? m.id : "?"} className="flex items-center gap-2 text-xs"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: AVATAR_BG[data.members.findIndex(x => x.id === (m && m.id)) % AVATAR_BG.length] || "#94a3b8" }} /><span className="text-muted-foreground truncate flex-1">{m ? m.name : "Unknown"}</span><span className="font-medium text-foreground w-12 text-right">{fmtH(mins / 60)}h</span>{cost != null ? <span className="text-muted-foreground w-16 text-right">{money(cost)}</span> : <span className="text-muted-foreground w-16 text-right">—</span>}</div>))}
                </div>}
              </div>);
          })}
        </div>
      </div>}
    </div>
  );
}

export function HolidaySection({ data, publicHolidays, canManage, patchMember, addPublicHoliday, delPublicHoliday }) {
  const [aEdit, setAEdit] = useState(null), [aVal, setAVal] = useState(0);
  const [newPH, setNewPH] = useState(""), [phOpen, setPhOpen] = useState(false);
  const todayD = startOfDay(new Date());
  const [hs, he] = holidayYearOf(todayD);
  const phSet = new Set((publicHolidays || []).map(h => h.day));
  const holidayRows = data.members.map(m => {
    const allowance = m.holidayAllowance ?? 30; let used = 0, next = null;
    for (const a of data.assignments) {
      if (a.memberId !== m.id || a.kind !== "leave" || a.leaveType !== "vacation") continue;
      const s = parseISO(a.start), e = parseISO(a.end);
      const cs = new Date(Math.max(s.getTime(), hs.getTime())), ce = new Date(Math.min(e.getTime(), he.getTime()));
      for (let d = new Date(cs); d <= ce; d = addDays(d, 1)) { if (isWeekday(d) && !phSet.has(toISO(d))) used += leaveDayFraction(toISO(d), a); }
      if (e >= todayD && (!next || s < parseISO(next.start))) next = a;
    }
    used = Math.round(used * 100) / 100;
    return { m, allowance, used, remaining: Math.round((allowance - used) * 100) / 100, next };
  });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-foreground">Holiday year · {pad(hs.getDate())} {MONTHS[hs.getMonth()]} {hs.getFullYear()} – {pad(he.getDate())} {MONTHS[he.getMonth()]} {he.getFullYear()}</p>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
        {holidayRows.map(({ m, allowance, used, remaining, next }) => {
          const ns = next && parseISO(next.start), ne = next && parseISO(next.end); const onNow = next && ns <= todayD && ne >= todayD;
          return (
            <div key={m.id} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
                <div className="font-medium text-sm text-foreground">{m.name}</div>
                <div className="text-xs">
                  {aEdit === m.id
                    ? <span className="inline-flex items-center gap-1"><Input type="number" min="0" value={aVal} onChange={e => setAVal(e.target.value)} className="w-16" /><Button onClick={() => { patchMember(m.id, { holidayAllowance: Number(aVal) || 0 }); setAEdit(null); }}>Save</Button></span>
                    : canManage
                      ? <Button variant="ghost" size="sm" title="Edit allowance" onClick={() => { setAEdit(m.id); setAVal(allowance); }}>{allowance} days/yr <Pencil /></Button>
                      : <span className="text-muted-foreground">{allowance} days/yr</span>}
                </div>
              </div>
              <div className="px-3 py-3">
                <div className="flex items-end gap-2">
                  <div className="text-2xl font-medium text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>{remaining}</div>
                  <div className="text-xs text-muted-foreground mb-1">days left · {used} taken of {allowance}</div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, allowance ? used / allowance * 100 : 0)}%`, background: remaining < 0 ? "#eb5757" : "#f2994a" }} /></div>
                <div className="mt-2 text-xs text-muted-foreground">{next ? <>Next: <span className="font-medium text-foreground">{onNow ? "on holiday now · " : ""}{dRange(ns, ne)}{(next.startTime || next.endTime) ? " · part-day" : ""}</span></> : <span className="text-muted-foreground">No upcoming holiday booked</span>}</div>
              </div>
            </div>);
        })}
      </div>
      <div className="border-t border-border/60 pt-3">
        <div className="flex items-center gap-2 mb-2 text-sm font-medium"><Calendar size={14} className="text-muted-foreground" /> Public holidays <span className="text-xs font-normal text-muted-foreground">(these days don't count against anyone's allowance)</span></div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(publicHolidays || []).length === 0 && <span className="text-xs text-muted-foreground">None set yet.</span>}
          {(publicHolidays || []).map(h => { const d = parseISO(h.day); return (
            <Badge key={h.id} variant="secondary">{pad(d.getDate())} {MONTHS[d.getMonth()]} {d.getFullYear()}{canManage && <Button variant="ghost" size="icon-xs" title="Remove" onClick={() => delPublicHoliday(h.id)}><X /></Button>}</Badge>); })}
        </div>
        {canManage && <div className="flex items-center gap-2">
          <Popover open={phOpen} onOpenChange={setPhOpen}>
            <PopoverTrigger render={<Button variant="outline" />}><Calendar /> {newPH || "Pick a date"}</PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarPicker mode="single" selected={newPH ? parseISO(newPH) : undefined} onSelect={(d) => { if (d) { setNewPH(toISO(d)); setPhOpen(false); } }} />
            </PopoverContent>
          </Popover>
          <Button onClick={() => { if (newPH) { addPublicHoliday(newPH, ""); setNewPH(""); } }}>Add public holiday</Button>
        </div>}
      </div>
    </div>
  );
}
