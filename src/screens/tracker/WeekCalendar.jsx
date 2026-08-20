// The Timesheet's calendar lane (audit doc §5, calendar revision): the same
// week of time_logs, laid out by time-of-day. Entries with start_min render
// as positioned blocks (drag to move, drag either edge to resize); entries
// without one sit in an "unplaced" strip at the top of their day, draggable
// into the timeline to claim a position. Dragging on empty space creates an
// entry via an anchored project picker. Duration stays the source of truth —
// placement is optional garnish on top of it.
import React, { useState, useRef } from "react";
import { DOW, pad, toISO, isWeekday, fmtH } from "../../studio/core.jsx";
import { ProjectCombobox } from "./shared.jsx";
import { ChevronRight, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PPH = 56;   // pixels per hour
const SNAP = 15;  // snap grid, minutes

const fmtT = (m) => `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, "0")}`;
const snap = (m) => Math.round(m / SNAP) * SNAP;

export default function WeekCalendar({ days, todayISO, logs, labelFor, groups, recents, run, runColor, onCreate, onPatch }) {
  const [open, setOpen] = useState(true);
  const [preview, setPreview] = useState(null); // {id|"new", dISO, startMin, minutes, color}
  const [draft, setDraft] = useState(null);     // committed create-drag awaiting project pick
  const [pick, setPick] = useState({ projectId: "", phaseId: null });
  const [note, setNote] = useState("");
  const colRefs = useRef({});
  const dragRef = useRef(null);

  const placed = logs.filter((l) => l.startMin != null);
  const bounds = placed.flatMap((l) => [l.startMin / 60, (l.startMin + l.minutes) / 60]);
  if (run) { const d = new Date(run.startedAt); bounds.push((d.getHours() * 60 + d.getMinutes()) / 60); }
  const rangeStart = Math.max(0, Math.min(8, Math.floor(Math.min(...bounds, 8))));
  const rangeEnd = Math.min(24, Math.max(18, Math.ceil(Math.max(...bounds, 18))));
  const rangeH = rangeEnd - rangeStart;

  const yToMin = (dISO, clientY) => {
    const el = colRefs.current[dISO]; if (!el) return rangeStart * 60;
    const r = el.getBoundingClientRect();
    const m = rangeStart * 60 + ((clientY - r.top) / PPH) * 60;
    return Math.max(rangeStart * 60, Math.min(rangeEnd * 60, m));
  };
  const colUnder = (clientX) => Object.entries(colRefs.current).find(([, el]) => { if (!el) return false; const r = el.getBoundingClientRect(); return clientX >= r.left && clientX <= r.right; })?.[0] || null;

  // One generic pointer-drag: create (empty space), move / resize-top /
  // resize-bottom (placed block), place (unplaced chip into the timeline).
  const beginDrag = (e, spec) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const d = { ...spec, x0: e.clientX, y0: e.clientY, moved: false };
    dragRef.current = d;
    const move = (ev) => {
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 4) return;
      d.moved = true; document.body.style.userSelect = "none";
      const cur = yToMin(d.dISO, ev.clientY);
      if (d.mode === "create") {
        const a = Math.min(d.anchor, cur), b = Math.max(d.anchor, cur);
        d.startMin = snap(a); d.minutes = Math.max(SNAP, snap(b) - snap(a));
      } else if (d.mode === "move" || d.mode === "place") {
        const dISO2 = d.mode === "place" ? (colUnder(ev.clientX) === d.dISO ? d.dISO : d.dISO) : d.dISO;
        d.startMin = Math.max(rangeStart * 60, Math.min(rangeEnd * 60 - d.minutes, snap(cur - (d.grab || 0))));
        d.dISO = dISO2;
      } else if (d.mode === "b") {
        d.minutes = Math.max(SNAP, snap(cur) - d.startMin);
      } else if (d.mode === "t") {
        const end = d.startMin0 + d.minutes0;
        d.startMin = Math.min(end - SNAP, Math.max(rangeStart * 60, snap(cur)));
        d.minutes = end - d.startMin;
      }
      setPreview({ id: d.id, dISO: d.dISO, startMin: d.startMin, minutes: d.minutes, color: d.color });
    };
    const up = (ev) => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      const was = dragRef.current; dragRef.current = null; setPreview(null);
      if (!was || !was.moved) return;
      if (was.mode === "create") { setPick({ projectId: "", phaseId: null }); setNote(""); setDraft({ dISO: was.dISO, startMin: was.startMin, minutes: was.minutes }); }
      else if (was.mode === "place") { if (colUnder(ev.clientX) === was.dISO) onPatch(was.id, { startMin: was.startMin }); }
      else onPatch(was.id, { startMin: was.startMin, minutes: was.minutes });
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  };

  const commitDraft = () => {
    if (!draft || !pick.projectId) return;
    onCreate({ projectId: pick.projectId, phaseId: pick.phaseId || null, date: draft.dISO, startMin: draft.startMin, minutes: draft.minutes, note: note.trim() || null });
    setDraft(null);
  };

  const hourMarks = Array.from({ length: rangeH + 1 }, (_, i) => rangeStart + i);
  const blockStyle = (startMin, minutes) => ({ top: ((startMin - rangeStart * 60) / 60) * PPH, height: Math.max(16, (minutes / 60) * PPH) });

  const Block = (l) => {
    const lab = labelFor(l);
    const pv = preview && preview.id === l.id ? preview : null;
    const s = pv ? pv.startMin : l.startMin, m = pv ? pv.minutes : l.minutes;
    return (
      <div key={l.id} className={`absolute left-0.5 right-0.5 rounded-md text-white overflow-hidden select-none cursor-grab active:cursor-grabbing ${pv ? "opacity-80 ring-2 ring-ring z-10" : ""}`}
        style={{ ...blockStyle(s, m), background: lab.color, touchAction: "none" }}
        title={`${lab.full} · ${fmtT(s)} – ${fmtT(s + m)}${l.note ? " — " + l.note : ""}`}
        onPointerDown={(e) => beginDrag(e, { mode: "move", id: l.id, dISO: l.date, startMin: l.startMin, minutes: l.minutes, grab: yToMin(l.date, e.clientY) - l.startMin, color: lab.color })}>
        <div className="px-1.5 pt-0.5 text-xs font-semibold leading-tight truncate">{lab.text}</div>
        {m >= 30 && <div className="px-1.5 text-[11px] opacity-90 leading-tight">{fmtT(s)} – {fmtT(s + m)}</div>}
        <div className="absolute top-0 inset-x-0 h-1.5 cursor-ns-resize" onPointerDown={(e) => beginDrag(e, { mode: "t", id: l.id, dISO: l.date, startMin: l.startMin, startMin0: l.startMin, minutes: l.minutes, minutes0: l.minutes, color: lab.color })} />
        <div className="absolute bottom-0 inset-x-0 h-1.5 cursor-ns-resize" onPointerDown={(e) => beginDrag(e, { mode: "b", id: l.id, dISO: l.date, startMin: l.startMin, minutes: l.minutes, color: lab.color })} />
      </div>
    );
  };

  return (
    <div className="border-t border-border/60 pt-3 mt-1">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-sm font-medium w-full">
        <ChevronRight size={14} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
        Calendar
        <span className="text-xs font-normal text-muted-foreground">drag on a day to log a block · drag blocks to say when work happened</span>
      </button>
      {open && (
        <div className="mt-2 grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
          {/* header + unplaced strips */}
          <div />
          {days.map((d) => { const dISO = toISO(d); return (
            <div key={dISO} className={`px-1.5 py-1 text-sm text-center ${dISO === todayISO ? "font-medium text-foreground" : "text-muted-foreground"}`}>{DOW[d.getDay()]} {pad(d.getDate())}</div>); })}
          <div className="pr-1.5 pt-1 text-[10px] text-muted-foreground text-right leading-tight">no<br />time</div>
          {days.map((d) => { const dISO = toISO(d); const un = logs.filter((l) => l.date === dISO && l.startMin == null); return (
            <div key={dISO} className="min-h-7 border-b border-border/60 px-0.5 pb-1 flex flex-col gap-1">
              {un.map((l) => { const lab = labelFor(l); return (
                <div key={l.id} className="rounded-sm text-white text-xs px-1.5 py-1 truncate select-none cursor-grab active:cursor-grabbing" style={{ background: lab.color, touchAction: "none" }}
                  title={`${lab.full} · ${fmtH(l.minutes / 60)}h — drag into the day to place it`}
                  onPointerDown={(e) => beginDrag(e, { mode: "place", id: l.id, dISO, startMin: 9 * 60, minutes: l.minutes, grab: 0, color: lab.color })}>
                  {lab.text} · {fmtH(l.minutes / 60)}h
                </div>); })}
            </div>); })}

          {/* hour axis */}
          <div className="relative" style={{ height: rangeH * PPH }}>
            {hourMarks.filter((h) => h > rangeStart).map((h) => <div key={h} className="absolute right-1.5 -translate-y-1/2 text-xs text-muted-foreground tabular-nums" style={{ top: (h - rangeStart) * PPH }}>{h}:00</div>)}
          </div>

          {/* day columns */}
          {days.map((d) => { const dISO = toISO(d); const dayPlaced = placed.filter((l) => l.date === dISO); const wknd = !isWeekday(d); return (
            <div key={dISO} ref={(el) => { colRefs.current[dISO] = el; }}
              className={`relative border-l border-border/60 ${dISO === todayISO ? "bg-primary/5" : wknd ? "bg-muted/30" : ""}`}
              style={{ height: rangeH * PPH, touchAction: "none" }}
              onPointerDown={(e) => { if (e.target !== e.currentTarget) return; beginDrag(e, { mode: "create", id: "new", dISO, anchor: yToMin(dISO, e.clientY), startMin: snap(yToMin(dISO, e.clientY)), minutes: SNAP, color: "var(--primary)" }); }}>
              {hourMarks.map((h) => <div key={h} className="absolute inset-x-0 border-t border-border/40 pointer-events-none" style={{ top: (h - rangeStart) * PPH }} />)}
              {dayPlaced.map((l) => Block(l))}

              {/* ghost while creating or placing */}
              {preview && (preview.id === "new" || !dayPlaced.some((l) => l.id === preview.id)) && preview.dISO === dISO && (
                <div className="absolute left-0.5 right-0.5 rounded-md pointer-events-none opacity-70 text-white z-10" style={{ ...blockStyle(preview.startMin, preview.minutes), background: preview.color || "var(--primary)" }}>
                  <div className="px-1.5 pt-0.5 text-[11px]">{fmtT(preview.startMin)} – {fmtT(preview.startMin + preview.minutes)}</div>
                </div>
              )}

              {/* live running timer */}
              {run && dISO === todayISO && (() => { const sd = new Date(run.startedAt); const s = sd.getHours() * 60 + sd.getMinutes(); const m = Math.max(1, (Date.now() - run.startedAt) / 60000); return (
                <div className="absolute left-0.5 right-0.5 rounded-md pointer-events-none text-white opacity-90" style={{ ...blockStyle(s, m), background: runColor, animation: "pulse 3s infinite" }}>
                  <div className="px-1.5 pt-0.5 text-[11px] font-semibold">recording…</div>
                </div>); })()}

              {/* create panel */}
              {draft && draft.dISO === dISO && (
                <div className={`absolute z-20 w-64 rounded-lg border border-border bg-popover p-2 shadow-md flex flex-col gap-2 ${days.indexOf(d) >= days.length - 2 && days.length > 2 ? "right-0" : "left-0"}`}
                  style={{ top: Math.min(blockStyle(draft.startMin, draft.minutes).top + 4, rangeH * PPH - 150) }}>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="tabular-nums">{fmtT(draft.startMin)} – {fmtT(draft.startMin + draft.minutes)} · {fmtH(draft.minutes / 60)}h</span>
                    <Button variant="ghost" size="icon-xs" title="Cancel" onClick={() => setDraft(null)}><X /></Button>
                  </div>
                  <ProjectCombobox selP={pick.projectId} selPh={pick.phaseId || ""} onPick={(p) => setPick({ projectId: p.projectId, phaseId: p.phaseId })} groups={groups} recents={recents} placeholder="Project…" className="w-full" />
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" onKeyDown={(e) => { if (e.key === "Enter") commitDraft(); }} />
                  <Button onClick={commitDraft} disabled={!pick.projectId}><Plus data-icon="inline-start" /> Log block</Button>
                </div>
              )}
            </div>); })}
        </div>
      )}
    </div>
  );
}
