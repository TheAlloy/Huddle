// The Timesheet's calendar lane (audit doc §5, calendar revision): the same
// week of time_logs, laid out by time-of-day. Entries with start_min render
// as positioned blocks (drag to move — across days too — drag either edge to
// resize, Alt/Ctrl-drag to copy, click to edit or delete); entries without
// one sit in an "unplaced" strip at the top of their day, draggable into the
// timeline to claim a position. Double-clicking or dragging on empty space creates
// an entry via an anchored project picker, and rows dragged in from a logger
// above (rowDragProps) drop straight onto a day as a new block. Duration
// stays the source of truth — placement is optional garnish on top of it.
import React, { useState, useRef, useEffect } from "react";
import { DOW, pad, toISO, isWeekday, fmtH } from "../../studio/core.jsx";
import { ProjectCombobox, parseHours } from "./shared.jsx";
import { ChevronRight, X, Plus, Check, Trash2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";

const PPH = 56;   // pixels per hour
const SNAP = 15;  // snap grid, minutes
const DROP_MIN = 60; // default length of a block dropped in from a logger row

const fmtT = (m) => `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, "0")}`;
const snap = (m) => Math.round(m / SNAP) * SNAP;


// Logger rows (or anything else) become draggable into the calendar with
// these props. HTML5 drag-and-drop carries the payload across components;
// the module-level copy lets dragover paint a ghost in the row's colour
// (dataTransfer contents aren't readable until drop).
const ROW_MIME = "application/x-huddle-row";
let rowDrag = null;
export function rowDragProps(payload) {
  return {
    draggable: true,
    onDragStart: (e) => { rowDrag = payload; e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData(ROW_MIME, JSON.stringify(payload)); },
    onDragEnd: () => { rowDrag = null; },
  };
}

// `frameless`: render just the calendar body (no outline card, no collapse
// header) so a parent section — e.g. a stock Card in the timesheet-lab
// variations — can provide the chrome. `template`/`trailing`/`showDayHeaders`
// let a parent align the calendar's columns with a table above it (the
// unified V2.1 experiment): pass the parent's gridTemplateColumns, emit a
// trailing spacer column, and skip the calendar's own day-label row.
// `onDelete` enables the Delete button in the block editor.
export default function WeekCalendar({ days, todayISO, logs, labelFor, groups, recents, run, runColor, onCreate, onPatch, onDelete = null, frameless = false, template = null, trailing = false, showDayHeaders = true, laneDividerClass = "border-l border-border/60", durFmt = null }) {
  // Duration formatter for chip labels and the create panel — overridable so
  // the clock-notation variant can keep every number in one dialect.
  const dur = durFmt || ((min) => `${fmtH(min / 60)}h`);
  // When a parent supplies its grid template (the unified table variants),
  // the calendar speaks the stock Table language: full-token row borders and
  // a labelled "No time" strip row instead of the compact axis caption.
  const tableMode = !!template;
  const [open, setOpen] = useState(true);
  const [preview, setPreview] = useState(null); // {id, dISO, startMin, minutes, color, label}
  const [draft, setDraft] = useState(null);     // committed create-drag awaiting project pick
  const [pick, setPick] = useState({ projectId: "", phaseId: null });
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(null); // clicked block: {id, dISO, top, projectId, phaseId, taskId, startIn, durIn}
  const colRefs = useRef({});
  const dragRef = useRef(null);

  const placed = logs.filter((l) => l.startMin != null);
  const bounds = placed.flatMap((l) => [l.startMin / 60, (l.startMin + l.minutes) / 60]);
  if (run) { const d = new Date(run.startedAt); bounds.push((d.getHours() * 60 + d.getMinutes()) / 60); }
  const rangeStart = Math.max(0, Math.min(8, Math.floor(Math.min(...bounds, 8))));
  const rangeEnd = Math.min(24, Math.max(18, Math.ceil(Math.max(...bounds, 18))));
  const rangeH = rangeEnd - rangeStart;
  const clampStart = (s, minutes) => Math.max(rangeStart * 60, Math.min(rangeEnd * 60 - minutes, s));

  const yToMin = (dISO, clientY) => {
    const el = colRefs.current[dISO]; if (!el) return rangeStart * 60;
    const r = el.getBoundingClientRect();
    const m = rangeStart * 60 + ((clientY - r.top) / PPH) * 60;
    return Math.max(rangeStart * 60, Math.min(rangeEnd * 60, m));
  };
  const colUnder = (clientX) => Object.entries(colRefs.current).find(([, el]) => { if (!el) return false; const r = el.getBoundingClientRect(); return clientX >= r.left && clientX <= r.right; })?.[0] || null;

  const openEditor = (l) => {
    if (!l) return;
    setDraft(null);
    setEditing({ id: l.id, dISO: l.date, top: l.startMin != null ? blockStyle(l.startMin, l.minutes).top + 4 : 4,
      projectId: l.projectId || "", phaseId: l.phaseId || null, taskId: l.taskId || null,
      startIn: l.startMin != null ? fmtT(l.startMin) : "", durIn: fmtT(l.minutes) });
  };

  // One generic pointer-drag: create (empty space), move / copy / resize-top /
  // resize-bottom (placed block), place (unplaced chip into the timeline). A
  // press that never moves is a click: on empty space it opens the create
  // panel for an hour, on an entry it opens the editor.
  const beginDrag = (e, spec) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const d = { ...spec, origDISO: spec.dISO, x0: e.clientX, y0: e.clientY, moved: false };
    dragRef.current = d;
    const move = (ev) => {
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 4) return;
      d.moved = true; document.body.style.userSelect = "none";
      const cur = yToMin(d.dISO, ev.clientY);
      if (d.mode === "create") {
        const a = Math.min(d.anchor, cur), b = Math.max(d.anchor, cur);
        d.startMin = snap(a); d.minutes = Math.max(SNAP, snap(b) - snap(a));
      } else if (d.mode === "move" || d.mode === "copy" || d.mode === "place") {
        d.dISO = colUnder(ev.clientX) || d.dISO; // blocks follow the pointer across days
        d.startMin = clampStart(snap(cur - (d.grab || 0)), d.minutes);
      } else if (d.mode === "b") {
        d.minutes = Math.max(SNAP, snap(cur) - d.startMin);
      } else if (d.mode === "t") {
        const end = d.startMin0 + d.minutes0;
        d.startMin = Math.min(end - SNAP, Math.max(rangeStart * 60, snap(cur)));
        d.minutes = end - d.startMin;
      }
      setPreview({ id: d.mode === "copy" ? "copy" : d.id, dISO: d.dISO, startMin: d.startMin, minutes: d.minutes, color: d.color, label: d.label });
    };
    const up = (ev) => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      const was = dragRef.current; dragRef.current = null; setPreview(null);
      if (!was) return;
      if (!was.moved) {
        // A plain click on empty space only dismisses an open panel —
        // creating takes a double-click (or a drag).
        if (was.mode === "create") { setDraft(null); setEditing(null); }
        else openEditor(logs.find((l) => l.id === was.id));
        return;
      }
      const dayPatch = was.dISO !== was.origDISO ? { date: was.dISO } : {};
      if (was.mode === "create") { setEditing(null); setPick({ projectId: "", phaseId: null }); setNote(""); setDraft({ dISO: was.dISO, startMin: was.startMin, minutes: was.minutes }); }
      else if (was.mode === "copy") { const l = was.log; onCreate({ projectId: l.projectId, phaseId: l.phaseId, taskId: l.taskId, date: was.dISO, startMin: was.startMin, minutes: was.minutes, note: l.note || null }); }
      else if (was.mode === "place") { if (colUnder(ev.clientX)) onPatch(was.id, { startMin: was.startMin, ...dayPatch }); }
      else onPatch(was.id, { startMin: was.startMin, minutes: was.minutes, ...dayPatch });
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  };

  // Double-click on empty space: plan an hour from the clicked quarter.
  const openDraftAt = (dISO, clientY) => {
    setEditing(null); setPick({ projectId: "", phaseId: null }); setNote("");
    setDraft({ dISO, startMin: clampStart(Math.floor(yToMin(dISO, clientY) / SNAP) * SNAP, 60), minutes: 60 });
  };

  // Any press outside an open panel closes it (the project list is its own
  // portaled popup, so presses inside that count as inside).
  const panelRef = useRef(null);
  useEffect(() => {
    if (!draft && !editing) return;
    const onDown = (e) => {
      const t = e.target;
      if (panelRef.current?.contains(t) || t.closest?.('[data-slot="combobox-content"]')) return;
      setDraft(null); setEditing(null);
    };
    const onKey = (e) => { if (e.key === "Escape") { setDraft(null); setEditing(null); } };
    document.addEventListener("pointerdown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [!!draft, !!editing]); // eslint-disable-line

  const commitDraft = () => {
    if (!draft || !pick.projectId) return;
    onCreate({ projectId: pick.projectId, phaseId: pick.phaseId || null, date: draft.dISO, startMin: draft.startMin, minutes: draft.minutes, note: note.trim() || null });
    setDraft(null);
  };

  // Editor save: an empty start unplaces the entry (back to "no time"); a
  // zero length deletes it (editTimeLog's rule).
  const saveEditor = () => {
    const ed = editing; if (!ed) return;
    const minutes = parseHours(ed.durIn); if (minutes == null) return;
    const st = String(ed.startIn).trim() === "" ? null : parseHours(ed.startIn);
    const patch = { minutes, startMin: st != null ? Math.max(0, Math.min(24 * 60 - SNAP, snap(st))) : null };
    if (!ed.taskId && ed.projectId) { patch.projectId = ed.projectId; patch.phaseId = ed.phaseId || null; }
    onPatch(ed.id, patch);
    setEditing(null);
  };
  const editorKeys = (e) => { if (e.key === "Enter") saveEditor(); if (e.key === "Escape") setEditing(null); };

  // Drop target for logger rows: ghost an hour centred on the pointer.
  const dropStart = (dISO, clientY) => clampStart(snap(yToMin(dISO, clientY) - DROP_MIN / 2), DROP_MIN);
  const colDragOver = (e, dISO) => {
    if (!rowDrag || !onCreate) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "copy";
    const s = dropStart(dISO, e.clientY);
    if (!preview || preview.id !== "drop" || preview.dISO !== dISO || preview.startMin !== s) setPreview({ id: "drop", dISO, startMin: s, minutes: DROP_MIN, color: rowDrag.color, label: rowDrag.label });
  };
  const colDragLeave = (e, dISO) => { if (!e.currentTarget.contains(e.relatedTarget)) setPreview((p) => (p && p.id === "drop" && p.dISO === dISO ? null : p)); };
  const colDrop = (e, dISO) => {
    if (!rowDrag || !onCreate) return;
    e.preventDefault();
    const p = rowDrag; rowDrag = null; setPreview(null);
    onCreate({ projectId: p.projectId || null, phaseId: p.phaseId || null, taskId: p.taskId || null, date: dISO, startMin: dropStart(dISO, e.clientY), minutes: DROP_MIN, note: null });
  };

  const hourMarks = Array.from({ length: rangeH + 1 }, (_, i) => rangeStart + i);
  const blockStyle = (startMin, minutes) => ({ top: ((startMin - rangeStart * 60) / 60) * PPH, height: Math.max(16, (minutes / 60) * PPH) });

  // `clashes`: the other blocks this one overlaps in time. Overlapping blocks
  // turn see-through (with a hairline edge) so the work underneath still
  // shows, and name each other in their tooltips.
  const Block = (l, clashes) => {
    const lab = labelFor(l);
    const pv = preview && preview.id === l.id ? preview : null;
    const away = pv && pv.dISO !== l.date; // being dragged to another day — the ghost shows there
    const s = pv && !away ? pv.startMin : l.startMin, m = pv && !away ? pv.minutes : l.minutes;
    const isEditing = editing && editing.id === l.id;
    const overlaps = clashes.length > 0;
    return (
      <div key={l.id} className={`absolute left-0.5 right-0.5 rounded-md text-white overflow-hidden select-none cursor-grab active:cursor-grabbing ${overlaps && !pv ? "opacity-70 ring-1 ring-background" : ""} ${pv && !away ? "opacity-80 ring-2 ring-ring z-10" : ""} ${away ? "opacity-40" : ""} ${isEditing ? "opacity-100 ring-2 ring-ring z-10" : ""}`}
        style={{ ...blockStyle(s, m), background: lab.color, touchAction: "none" }}
        title={`${lab.full} · ${fmtT(s)} – ${fmtT(s + m)}${l.note ? " — " + l.note : ""}${clashes.length ? "\nOverlaps with " + clashes.map((c) => `${labelFor(c).text} (${fmtT(c.startMin)} – ${fmtT(c.startMin + c.minutes)})`).join(", ") : ""}\nClick to edit · drag to move · Alt-drag to copy`}
        onPointerDown={(e) => beginDrag(e, { mode: e.altKey || e.ctrlKey || e.metaKey ? "copy" : "move", id: l.id, log: l, dISO: l.date, startMin: l.startMin, minutes: l.minutes, grab: yToMin(l.date, e.clientY) - l.startMin, color: lab.color, label: lab.text })}>
        <div className="flex items-center gap-1 px-1.5 pt-0.5 text-xs font-semibold leading-tight">
          {clashes.length > 0 && <Layers className="size-3 shrink-0" aria-label="Overlaps another block" />}
          <span className="truncate">{lab.text}</span>
        </div>
        {m >= 30 && <div className="px-1.5 text-[11px] opacity-90 leading-tight">{fmtT(s)} – {fmtT(s + m)}</div>}
        <div className="absolute top-0 inset-x-0 h-1.5 cursor-ns-resize" onPointerDown={(e) => beginDrag(e, { mode: "t", id: l.id, dISO: l.date, startMin: l.startMin, startMin0: l.startMin, minutes: l.minutes, minutes0: l.minutes, color: lab.color })} />
        <div className="absolute bottom-0 inset-x-0 h-1.5 cursor-ns-resize" onPointerDown={(e) => beginDrag(e, { mode: "b", id: l.id, dISO: l.date, startMin: l.startMin, minutes: l.minutes, color: lab.color })} />
      </div>
    );
  };

  const panelSide = (d) => (days.indexOf(d) >= days.length - 2 && days.length > 2 ? "right-0" : "left-0");
  const editLog = editing && logs.find((l) => l.id === editing.id);

  return (
    <div className={frameless ? undefined : "rounded-xl border border-border p-4"}>
      {!frameless && (
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-sm font-medium w-full">
          <ChevronRight size={14} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
          Calendar
          <span className="text-xs font-normal text-muted-foreground">double-click or drag on a day to log a block · drag blocks to move them · click a block to edit</span>
        </button>
      )}
      {(frameless || open) && (
        <div className={`grid ${frameless ? "" : "mt-2"}`} style={{ gridTemplateColumns: template || `56px repeat(${days.length}, minmax(0,1fr))` }}>
          {/* header + unplaced strips */}
          {showDayHeaders && <>
            <div />
            {days.map((d) => { const dISO = toISO(d); return (
              <div key={dISO} className={`px-1.5 py-1 text-sm text-center ${dISO === todayISO ? "font-medium text-foreground border-b-2 border-destructive" : "text-muted-foreground"}`}>{DOW[d.getDay()]} {pad(d.getDate())}</div>); })}
            {trailing && <div />}
          </>}
          {tableMode
            ? <div className="self-stretch border-b px-2 py-1.5 text-sm text-muted-foreground">No time</div>
            : <div className="pr-1.5 pt-1 text-[10px] text-muted-foreground text-right leading-tight">no<br />time</div>}
          {days.map((d) => { const dISO = toISO(d); const un = logs.filter((l) => l.date === dISO && l.startMin == null); return (
            <div key={dISO} className={`min-h-7 self-stretch ${tableMode ? "border-b" : "border-b border-border/60"} ${tableMode ? laneDividerClass : ""} px-1 py-1 flex flex-col gap-1 justify-center`}>
              {un.map((l) => { const lab = labelFor(l); return (
                <div key={l.id} className={`rounded-sm text-white text-xs px-1.5 py-1 truncate select-none cursor-grab active:cursor-grabbing ${editing && editing.id === l.id ? "ring-2 ring-ring" : ""}`} style={{ background: lab.color, touchAction: "none" }}
                  title={`${lab.full} · ${dur(l.minutes)} — click to edit, drag into the day to place it`}
                  onPointerDown={(e) => beginDrag(e, { mode: "place", id: l.id, dISO, startMin: 9 * 60, minutes: l.minutes, grab: 0, color: lab.color, label: lab.text })}>
                  {lab.text} · {dur(l.minutes)}
                </div>); })}
            </div>); })}
          {trailing && <div className={`self-stretch ${tableMode ? "border-b" : "border-b border-border/60"} ${tableMode ? laneDividerClass : ""}`} />}

          {/* hour axis */}
          <div className="relative" style={{ height: rangeH * PPH }}>
            {hourMarks.filter((h) => h > rangeStart).map((h) => <div key={h} className="absolute inset-x-0 -translate-y-1/2 text-center text-xs text-muted-foreground tabular-nums" style={{ top: (h - rangeStart) * PPH }}>{h}:00</div>)}
          </div>

          {/* day columns */}
          {days.map((d) => { const dISO = toISO(d); const dayPlaced = placed.filter((l) => l.date === dISO); const wknd = !isWeekday(d);
            const clashesOf = (l) => dayPlaced.filter((o) => o.id !== l.id && o.startMin < l.startMin + l.minutes && l.startMin < o.startMin + o.minutes);
            return (
            <div key={dISO} ref={(el) => { colRefs.current[dISO] = el; }}
              className={`relative ${tableMode ? laneDividerClass : "border-l border-border/60"} ${dISO === todayISO ? "bg-primary/5" : wknd ? "bg-muted/30" : ""}`}
              style={{ height: rangeH * PPH, touchAction: "none" }}
              onPointerDown={(e) => { if (e.target !== e.currentTarget) return; beginDrag(e, { mode: "create", id: "new", dISO, anchor: yToMin(dISO, e.clientY), startMin: snap(yToMin(dISO, e.clientY)), minutes: SNAP, color: "var(--primary)" }); }}
              onDoubleClick={(e) => { if (e.target === e.currentTarget) openDraftAt(dISO, e.clientY); }}
              onDragOver={(e) => colDragOver(e, dISO)} onDragLeave={(e) => colDragLeave(e, dISO)} onDrop={(e) => colDrop(e, dISO)}>
              {hourMarks.map((h) => <div key={h} className="absolute inset-x-0 border-t border-border/40 pointer-events-none" style={{ top: (h - rangeStart) * PPH }} />)}
              {dayPlaced.map((l) => Block(l, clashesOf(l)))}

              {/* ghost while creating, placing, moving across days, copying or dropping */}
              {preview && (preview.id === "new" || !dayPlaced.some((l) => l.id === preview.id)) && preview.dISO === dISO && (
                <div className="absolute left-0.5 right-0.5 rounded-md pointer-events-none opacity-70 text-white z-10 overflow-hidden" style={{ ...blockStyle(preview.startMin, preview.minutes), background: preview.color || "var(--primary)" }}>
                  {preview.label && <div className="px-1.5 pt-0.5 text-xs font-semibold leading-tight truncate">{preview.label}</div>}
                  <div className="px-1.5 pt-0.5 text-[11px] leading-tight">{fmtT(preview.startMin)} – {fmtT(preview.startMin + preview.minutes)}</div>
                </div>
              )}

              {/* live running timer */}
              {run && dISO === todayISO && (() => { const sd = new Date(run.startedAt); const s = sd.getHours() * 60 + sd.getMinutes(); const m = Math.max(1, (Date.now() - run.startedAt) / 60000); return (
                <div className="absolute left-0.5 right-0.5 rounded-md pointer-events-none text-white opacity-90" style={{ ...blockStyle(s, m), background: runColor, animation: "pulse 3s infinite" }}>
                  <div className="px-1.5 pt-0.5 text-[11px] font-semibold">recording…</div>
                </div>); })()}

              {/* create panel */}
              {draft && draft.dISO === dISO && (
                <div ref={panelRef} className={`absolute z-20 w-64 rounded-lg border border-border bg-popover p-2 shadow-md flex flex-col gap-2 ${panelSide(d)}`}
                  style={{ top: Math.min(blockStyle(draft.startMin, draft.minutes).top + 4, rangeH * PPH - 150) }}>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="tabular-nums">{fmtT(draft.startMin)} – {fmtT(draft.startMin + draft.minutes)} · {dur(draft.minutes)}</span>
                    <Button variant="ghost" size="icon-xs" title="Cancel" onClick={() => setDraft(null)}><X /></Button>
                  </div>
                  <ProjectCombobox selP={pick.projectId} selPh={pick.phaseId || ""} onPick={(p) => setPick({ projectId: p.projectId, phaseId: p.phaseId })} groups={groups} recents={recents} placeholder="Project…" className="w-full" autoFocus />
                  {!tableMode && <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" onKeyDown={(e) => { if (e.key === "Enter") commitDraft(); }} />}
                  <Button onClick={commitDraft} disabled={!pick.projectId}><Plus data-icon="inline-start" /> Log block</Button>
                </div>
              )}

              {/* block editor — times, project, delete */}
              {editing && editLog && editing.dISO === dISO && (
                <div ref={panelRef} className={`absolute z-20 w-64 rounded-lg border border-border bg-popover p-2 shadow-md flex flex-col gap-2 ${panelSide(d)}`}
                  style={{ top: Math.max(0, Math.min(editing.top, rangeH * PPH - 170)) }}>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{labelFor(editLog).full}</span>
                    <Button variant="ghost" size="icon-xs" title="Close" onClick={() => setEditing(null)}><X /></Button>
                  </div>
                  {!editing.taskId && <ProjectCombobox selP={editing.projectId} selPh={editing.phaseId || ""} onPick={(p) => setEditing((ed) => ({ ...ed, projectId: p.projectId, phaseId: p.phaseId }))} groups={groups} recents={recents} placeholder="Project…" className="w-full" />}
                  <div className="grid grid-cols-2 gap-2">
                    <InputGroup>
                      <InputGroupAddon><InputGroupText>Start</InputGroupText></InputGroupAddon>
                      <InputGroupInput value={editing.startIn} onChange={(e) => setEditing((ed) => ({ ...ed, startIn: e.target.value }))} onKeyDown={editorKeys} placeholder="—" className="tabular-nums" aria-label="Start time" />
                    </InputGroup>
                    <InputGroup>
                      <InputGroupAddon><InputGroupText>Hours</InputGroupText></InputGroupAddon>
                      <InputGroupInput value={editing.durIn} onChange={(e) => setEditing((ed) => ({ ...ed, durIn: e.target.value }))} onKeyDown={editorKeys} className="tabular-nums" aria-label="Duration" autoFocus />
                    </InputGroup>
                  </div>
                  <div className="flex items-center gap-2">
                    {onDelete && <Button variant="destructive" onClick={() => { onDelete(editing.id); setEditing(null); }}><Trash2 data-icon="inline-start" /> Delete</Button>}
                    <Button className="ml-auto" onClick={saveEditor}><Check data-icon="inline-start" /> Save</Button>
                  </div>
                </div>
              )}
            </div>); })}
          {trailing && <div className={tableMode ? laneDividerClass : "border-l border-border/60"} style={{ height: rangeH * PPH }} />}
        </div>
      )}
    </div>
  );
}
