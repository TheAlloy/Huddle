import React, { useState, useMemo, useRef } from "react";
import { sb } from "../lib/supabase.js";
import { logAudit } from "../lib/api.js";
import { Btn, Field, inputCls, Modal, NAVY, Avatar } from "../ui.jsx";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { ChevronLeft, ChevronRight, Plus, Minus, CalendarClock, Users, Trash2 } from "lucide-react";

/* ── date helpers ─────────────────────────────────────────────────────────── */
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const parseISO = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const startOfWeekMon = (d) => { const x = new Date(d); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); x.setHours(0, 0, 0, 0); return x; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LEAVE = { holiday: { label: "Holiday", color: "#f2994a" }, sick: { label: "Sick", color: "#eb5757" }, other: { label: "Other leave", color: "#9b51e0" } };

const SIDEBAR = 168, BAR_H = 26, LANE_GAP = 4, ROW_PAD = 8, HEADER_H = 46;

export default function Schedule({ org, me, data, reload }) {
  const canEdit = can(me, "schedule.edit");
  const [dayW, setDayW] = useState(30);
  const [anchor, setAnchor] = useState(() => toISO(new Date()));
  const [peopleFilter, setPeopleFilter] = useState("all");   // "all" | teamName | membershipId
  const [modal, setModal] = useState(null);
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null);                    // {id, kind:"move"|"resize", dStart, dEnd}

  const clientById = useMemo(() => Object.fromEntries((data.clients || []).map(c => [c.id, c])), [data.clients]);
  const projectById = useMemo(() => Object.fromEntries((data.projects || []).map(p => [p.id, p])), [data.projects]);

  const teams = useMemo(() => [...new Set((data.members || []).flatMap(m => m.teams || []))].sort(), [data.members]);
  const visibleMembers = useMemo(() => {
    const list = (data.members || []).filter(m => m.status !== "suspended");
    if (peopleFilter === "all") return list;
    if (teams.includes(peopleFilter)) return list.filter(m => (m.teams || []).includes(peopleFilter));
    return list.filter(m => m.id === peopleFilter);
  }, [data.members, peopleFilter, teams]);

  // window of days shown
  const rangeStart = useMemo(() => toISO(startOfWeekMon(addDays(parseISO(anchor), -35))), [anchor]);
  const rangeEnd = useMemo(() => toISO(addDays(parseISO(anchor), 168)), [anchor]);
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
  const totalW = totalDays * dayW;
  const xOf = (iso) => daysBetween(rangeStart, iso) * dayW;
  const dayFromX = (x) => toISO(addDays(parseISO(rangeStart), Math.max(0, Math.floor(x / dayW))));
  const todayISO = toISO(new Date());

  // month header segments
  const months = useMemo(() => {
    const out = []; let d = new Date(parseISO(rangeStart));
    while (toISO(d) <= rangeEnd) {
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const start = toISO(d) > toISO(first) ? toISO(d) : toISO(first);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const end = toISO(addDays(next, -1)) < rangeEnd ? toISO(addDays(next, -1)) : rangeEnd;
      out.push({ label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, x: xOf(start), w: (daysBetween(start, end) + 1) * dayW });
      d = next;
    }
    return out;
  }, [rangeStart, rangeEnd, dayW]);

  const byMember = useMemo(() => {
    const map = {};
    (data.assignments || []).forEach(a => { (map[a.membership_id] = map[a.membership_id] || []).push(a); });
    return map;
  }, [data.assignments]);

  const packMember = (mid) => {
    const list = (byMember[mid] || []).slice().sort((a, b) => a.start_date < b.start_date ? -1 : 1);
    const laneEnds = []; const out = [];
    list.forEach(a => {
      let lane = 0;
      while (lane < laneEnds.length && !(laneEnds[lane] < a.start_date)) lane++;
      laneEnds[lane] = a.end_date; out.push({ a, lane });
    });
    return { out, lanes: Math.max(1, laneEnds.length) };
  };

  const rowHeight = (lanes) => lanes * BAR_H + (lanes - 1) * LANE_GAP + ROW_PAD * 2;

  /* ── drag to move / resize a bar ───────────────────────────────────────── */
  const startDrag = (e, a, kind) => {
    if (!canEdit || (e.button && e.button !== 0)) return;
    e.stopPropagation();
    const start = { id: a.id, kind, sx: e.clientX, moved: false, s: a.start_date, en: a.end_date, dd: 0 };
    dragRef.current = start;
    const move = (ev) => {
      const dd = Math.round((ev.clientX - start.sx) / dayW);
      if (!start.moved) { if (Math.abs(ev.clientX - start.sx) < 4) return; start.moved = true; document.body.style.userSelect = "none"; }
      start.dd = dd;
      setDrag({ id: a.id, dStart: kind === "move" ? dd : 0, dEnd: dd });
    };
    const up = async (ev) => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      document.body.style.userSelect = ""; dragRef.current = null; setDrag(null);
      if (!start.moved || start.dd === 0) { if (!start.moved) setModal({ type: "assign", a }); return; }
      let ns = a.start_date, ne = a.end_date;
      if (kind === "move") { ns = toISO(addDays(parseISO(a.start_date), start.dd)); ne = toISO(addDays(parseISO(a.end_date), start.dd)); }
      else { ne = toISO(addDays(parseISO(a.end_date), start.dd)); if (ne < ns) ne = ns; }
      await sb.from("assignments").update({ start_date: ns, end_date: ne }).eq("id", a.id);
      reload();
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  };

  if (!can(me, "schedule.view")) return <NoAccess what="the schedule" />;

  const labelFor = (a) => {
    if (a.kind === "leave") return { top: (LEAVE[a.leave_type] || LEAVE.other).label, sub: "", color: (LEAVE[a.leave_type] || LEAVE.other).color };
    const p = projectById[a.project_id]; const c = p && clientById[p.client_id];
    const ph = p && a.phase_id && (p.phases || []).find(x => x.id === a.phase_id);
    return { top: p ? (p.code ? p.code + " · " + (c ? c.name : "") : (c ? c.name + " · " + p.name : p.name)) : "Work", sub: ph ? ph.name : "", color: c ? c.color : "#64748b" };
  };

  return (
    <div className="h-full flex flex-col">
      {/* toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white shrink-0 flex-wrap">
        <h2 className="text-sm font-bold text-slate-800 mr-1">Schedule</h2>
        <div className="flex items-center gap-1">
          <button className="w-7 h-7 grid place-items-center rounded border border-slate-200 hover:bg-slate-50" onClick={() => setAnchor(toISO(addDays(parseISO(anchor), -14)))}><ChevronLeft size={15} /></button>
          <button className="text-xs px-2 h-7 rounded border border-slate-200 hover:bg-slate-50" onClick={() => setAnchor(toISO(new Date()))}>Today</button>
          <button className="w-7 h-7 grid place-items-center rounded border border-slate-200 hover:bg-slate-50" onClick={() => setAnchor(toISO(addDays(parseISO(anchor), 14)))}><ChevronRight size={15} /></button>
        </div>
        <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2 h-8">
          <Users size={14} className="text-slate-400" />
          <select className="text-sm outline-none bg-transparent" value={peopleFilter} onChange={e => setPeopleFilter(e.target.value)}>
            <option value="all">Everyone</option>
            {teams.length > 0 && <optgroup label="Teams">{teams.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>}
            <optgroup label="People">{(data.members || []).filter(m => m.status !== "suspended").map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}</optgroup>
          </select>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button className="w-7 h-7 grid place-items-center rounded border border-slate-200 hover:bg-slate-50" onClick={() => setDayW(w => Math.max(14, w - 6))}><Minus size={14} /></button>
          <button className="w-7 h-7 grid place-items-center rounded border border-slate-200 hover:bg-slate-50" onClick={() => setDayW(w => Math.min(64, w + 6))}><Plus size={14} /></button>
          {canEdit && <Btn onClick={() => setModal({ type: "assign", a: null })}><Plus size={14} /> Book work</Btn>}
        </div>
      </div>

      {/* board */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto relative">
        <div style={{ width: SIDEBAR + totalW, minHeight: "100%" }}>
          {/* header */}
          <div className="sticky top-0 z-20 bg-white border-b border-slate-200" style={{ height: HEADER_H }}>
            <div className="sticky left-0 z-10 bg-white border-r border-slate-200 inline-flex items-center px-3 text-xs font-semibold text-slate-500" style={{ width: SIDEBAR, height: HEADER_H, position: "absolute" }}>{visibleMembers.length} {visibleMembers.length === 1 ? "person" : "people"}</div>
            <div className="absolute top-0" style={{ left: SIDEBAR, width: totalW, height: HEADER_H }}>
              {months.map((m, i) => <div key={i} className="absolute top-0 border-l border-slate-200 text-[11px] font-semibold text-slate-500 px-1 pt-1" style={{ left: m.x, width: m.w, height: HEADER_H }}>{m.label}</div>)}
              {dayW >= 26 && Array.from({ length: totalDays }).map((_, i) => { const d = addDays(parseISO(rangeStart), i); const wknd = d.getDay() === 0 || d.getDay() === 6; return <div key={i} className={`absolute bottom-1 text-[9px] ${wknd ? "text-slate-300" : "text-slate-400"}`} style={{ left: i * dayW, width: dayW, textAlign: "center" }}>{d.getDate()}</div>; })}
            </div>
          </div>

          {/* today line */}
          {todayISO >= rangeStart && todayISO <= rangeEnd &&
            <div className="absolute z-10 pointer-events-none" style={{ left: SIDEBAR + xOf(todayISO) + dayW / 2 - 1, top: HEADER_H, bottom: 0, width: 2, background: "#ef4444aa" }} />}

          {/* rows */}
          {visibleMembers.length === 0 && <div className="p-10 text-center text-sm text-slate-400">No people match this filter.</div>}
          {visibleMembers.map((m, mi) => {
            const { out, lanes } = packMember(m.id);
            const h = rowHeight(lanes);
            return (
              <div key={m.id} className="relative border-b border-slate-100" style={{ height: h, width: SIDEBAR + totalW, background: mi % 2 ? "#fbfcfe" : "#fff" }}>
                {/* name */}
                <div className="sticky left-0 z-10 flex items-center gap-2 px-3 border-r border-slate-200" style={{ width: SIDEBAR, height: h, position: "absolute", background: mi % 2 ? "#fbfcfe" : "#fff" }}>
                  <Avatar name={m.display_name || m.email} i={mi} size={26} />
                  <div className="min-w-0"><div className="text-sm font-medium text-slate-700 truncate">{m.display_name || m.email}</div>{m.job_title && <div className="text-[11px] text-slate-400 truncate">{m.job_title}</div>}</div>
                </div>
                {/* click-to-book background */}
                {canEdit && <div className="absolute top-0" style={{ left: SIDEBAR, width: totalW, height: h, cursor: "copy" }}
                  onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const day = dayFromX(e.clientX - rect.left); setModal({ type: "assign", a: { membership_id: m.id, start_date: day, end_date: toISO(addDays(parseISO(day), 4)), kind: "work" } }); }} />}
                {/* bars */}
                {out.map(({ a, lane }) => {
                  const d = (drag && drag.id === a.id) ? drag : { dStart: 0, dEnd: 0 };
                  const s = toISO(addDays(parseISO(a.start_date), d.dStart));
                  const en = toISO(addDays(parseISO(a.end_date), d.dEnd));
                  const { top, sub, color } = labelFor(a);
                  const left = SIDEBAR + xOf(s);
                  const width = Math.max(dayW - 2, (daysBetween(s, en) + 1) * dayW - 2);
                  const y = ROW_PAD + lane * (BAR_H + LANE_GAP);
                  return (
                    <div key={a.id} onPointerDown={(e) => startDrag(e, a, "move")} title={top + (sub ? " · " + sub : "")}
                      className="absolute rounded-md text-white overflow-hidden shadow-sm" style={{ left, top: y, width, height: BAR_H, background: color, cursor: canEdit ? "grab" : "pointer", opacity: a.kind === "leave" ? 0.92 : 1 }}>
                      <div className="px-1.5 leading-tight" style={{ paddingTop: sub ? 1 : 4 }}>
                        <div className="text-[10px] font-semibold truncate">{top}</div>
                        {sub && <div className="text-[9px] opacity-90 truncate">{sub}</div>}
                      </div>
                      {canEdit && <div onPointerDown={(e) => startDrag(e, a, "resize")} className="absolute top-0 right-0 h-full" style={{ width: 7, cursor: "ew-resize" }} />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {modal?.type === "assign" && (
        <AssignForm org={org} data={data} me={me} initial={modal.a} projectById={projectById}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
    </div>
  );
}

/* ── book / edit an assignment ────────────────────────────────────────────── */
function AssignForm({ org, data, me, initial, onClose, onSaved }) {
  const editing = initial && initial.id;
  const [kind, setKind] = useState(initial?.kind || "work");
  const [memberId, setMemberId] = useState(initial?.membership_id || (data.members[0]?.id || ""));
  const [projectId, setProjectId] = useState(initial?.project_id || "");
  const [phaseId, setPhaseId] = useState(initial?.phase_id || "");
  const [leaveType, setLeaveType] = useState(initial?.leave_type || "holiday");
  const [start, setStart] = useState(initial?.start_date || toISO(new Date()));
  const [end, setEnd] = useState(initial?.end_date || toISO(new Date()));
  const [busy, setBusy] = useState(false);
  const project = data.projects.find(p => p.id === projectId);

  const save = async () => {
    if (kind === "work" && !projectId) { alert("Choose a project."); return; }
    if (end < start) { alert("The end date is before the start date."); return; }
    setBusy(true);
    const row = {
      org_id: org.id, kind, membership_id: memberId,
      project_id: kind === "work" ? projectId : null,
      phase_id: kind === "work" ? (phaseId || null) : null,
      leave_type: kind === "leave" ? leaveType : null,
      start_date: start, end_date: end,
    };
    if (editing) await sb.from("assignments").update(row).eq("id", initial.id);
    else { const { data: ins } = await sb.from("assignments").insert(row).select().single(); logAudit(org.id, editing ? "assignment.updated" : "assignment.created", "assignment", { id: ins?.id }); }
    setBusy(false); onSaved();
  };
  const del = async () => { if (!confirm("Remove this from the schedule?")) return; setBusy(true); await sb.from("assignments").delete().eq("id", initial.id); setBusy(false); onSaved(); };

  return (
    <Modal title={editing ? "Edit booking" : "Book work"} onClose={onClose}
      footer={<>
        {editing && <Btn variant="danger" className="mr-auto" onClick={del} disabled={busy}><Trash2 size={14} /> Remove</Btn>}
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Save" : "Book it"}</Btn>
      </>}>
      <div className="flex gap-1 mb-4">
        {[["work", "Project work"], ["leave", "Leave / holiday"]].map(([k, l]) =>
          <button key={k} onClick={() => setKind(k)} className={`flex-1 text-sm py-1.5 rounded-lg border ${kind === k ? "text-white border-transparent" : "border-slate-200 text-slate-600"}`} style={kind === k ? { background: NAVY } : undefined}>{l}</button>)}
      </div>

      <Field label="Person">
        <select className={inputCls} value={memberId} onChange={e => setMemberId(e.target.value)}>
          {data.members.filter(m => m.status !== "suspended").map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}
        </select>
      </Field>

      {kind === "work" ? (<>
        <Field label="Project">
          <select className={inputCls} value={projectId} onChange={e => { setProjectId(e.target.value); setPhaseId(""); }}>
            <option value="">Choose a project…</option>
            {data.projects.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + " · " : ""}{p.name}</option>)}
          </select>
        </Field>
        {project?.phases?.length > 0 &&
          <Field label="Phase">
            <select className={inputCls} value={phaseId} onChange={e => setPhaseId(e.target.value)}>
              <option value="">No specific phase</option>
              {project.phases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
            </select>
          </Field>}
      </>) : (
        <Field label="Type">
          <select className={inputCls} value={leaveType} onChange={e => setLeaveType(e.target.value)}>
            {Object.entries(LEAVE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start"><input type="date" className={inputCls} value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="End"><input type="date" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
