import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import { sb } from "../lib/supabase.js";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import MiniTracker from "./MiniTracker.jsx";
import { Btn, Field as UIField, inputCls, Modal as UIModal, NAVY as UINAVY } from "../ui.jsx";
import {
  Plus, ChevronLeft, ChevronRight, Search, Trash2, AlertTriangle, Users,
  Pencil, ZoomIn, ZoomOut,
} from "lucide-react";

/* ============================ helpers (from studio tool) ========================= */
const MS = 86400000;
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeekMon = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
const isWeekday = (d) => { const g = d.getDay(); return g >= 1 && g <= 5; };
const initials = (name) => (name || "?").split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
const NAVY = "#1f2d4e";
const AVATAR_BG = ["#5b8def", "#9b6dd6", "#3aa99f", "#e0884b", "#d65f6e", "#4caf8f"];
const LEAVE_TYPES = { vacation: { label: "Holiday", color: "#f2994a" }, parental: { label: "Parental Leave", color: "#e67e22" }, sick: { label: "Sick Leave", color: "#c0563f" }, holiday: { label: "Public Holiday", color: "#7f8fa6" } };
const pfIncludes = (pf, id) => pf === "all" || (Array.isArray(pf) ? pf.includes(id) : pf === id);
const pfList = (members, pf) => pf === "all" ? members : members.filter(m => pfIncludes(pf, m.id));

/* ============================ board components (from studio tool) ================ */
function PersonCell({ m, idx, width, onEdit, onAssign, canEdit }) {
  return (
    <div className="shrink-0 border-r border-slate-200 px-3 py-3 flex items-start gap-2.5 group bg-white" style={{ width, position: "sticky", left: 0, zIndex: 15 }}>
      <span className="grid place-items-center w-8 h-8 rounded-full text-white text-xs font-semibold shrink-0" style={{ background: AVATAR_BG[idx % AVATAR_BG.length] }}>{initials(m.name)}</span>
      <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-800 truncate">{m.name}</div><div className="text-xs text-slate-400 truncate">{m.role}</div></div>
      {canEdit && <div className="flex flex-col gap-1 shrink-0">
        <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 transition grid place-items-center w-6 h-6 rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600" title={"Edit " + m.name}><Pencil size={13} /></button>
        <button onClick={onAssign} className="opacity-0 group-hover:opacity-100 transition grid place-items-center w-6 h-6 rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600" title={"Assign work to " + m.name}><Plus size={15} /></button>
      </div>}
    </div>
  );
}

function barLabel(a, ctx) {
  if (a.kind === "leave") return { top: (LEAVE_TYPES[a.leaveType] || {}).label || "Leave", sub: "" };
  const pr = ctx.projectById(a.projectId); const cl = pr && ctx.clientById(pr.clientId);
  const phase = pr && a.phaseId ? (pr.phases || []).find(p => p.id === a.phaseId) : null;
  return { top: `${cl ? cl.name + " - " : ""}${pr ? pr.name : ""}`, sub: phase ? phase.name : "" };
}

function Bar({ a, ctx, baseLeft, baseWidth, top, height, dayW, onCommit, onOpen, fill = null, ratio = null, note = "", laneIndex = null, laneStep = 47 }) {
  const ref = useRef(null);
  const canReorder = laneIndex !== null && laneIndex !== undefined;
  const [drag, setDrag] = useState(null);
  const begin = (mode) => (e) => { if (!ctx.canEdit) return; e.preventDefault(); e.stopPropagation(); try { ref.current.setPointerCapture(e.pointerId); } catch (_) { } setDrag({ mode, startX: e.clientX, startY: e.clientY, dxSnap: 0, dLane: 0, moved: false }); };
  const move = (e) => {
    if (!drag) return;
    const raw = e.clientX - drag.startX, rawY = e.clientY - drag.startY;
    const dxSnap = Math.round(raw / dayW) * dayW;
    const dLane = (drag.mode === "move" && canReorder && Math.abs(rawY) > laneStep * 0.55) ? Math.round(rawY / laneStep) : 0;
    const moved = drag.moved || Math.abs(raw) > 4 || Math.abs(rawY) > 4;
    if (dxSnap !== drag.dxSnap || dLane !== drag.dLane || moved !== drag.moved) setDrag({ ...drag, dxSnap, dLane, moved });
  };
  const up = () => {
    if (!drag) return; const { mode, dxSnap, dLane, moved } = drag; setDrag(null);
    if (!moved) { onOpen(); return; }
    const dd = Math.round(dxSnap / dayW);
    const s = parseISO(a.start), en = parseISO(a.end);
    if (mode === "move") {
      const nl = canReorder ? Math.max(0, laneIndex + dLane) : undefined;
      if (dd === 0 && (nl === undefined || nl === laneIndex)) return;
      onCommit(toISO(addDays(s, dd)), toISO(addDays(en, dd)), nl);
    }
    else if (mode === "l") { if (dd === 0) return; const ns = addDays(s, dd); onCommit(toISO(ns > en ? en : ns), a.end); }
    else if (mode === "r") { if (dd === 0) return; const ne = addDays(en, dd); onCommit(a.start, toISO(ne < s ? s : ne)); }
  };
  let left = baseLeft, width = baseWidth, topPos = top;
  if (drag && drag.moved) { if (drag.mode === "move") { left = baseLeft + drag.dxSnap; topPos = top + drag.dLane * laneStep; } else if (drag.mode === "l") { left = baseLeft + drag.dxSnap; width = baseWidth - drag.dxSnap; } else width = baseWidth + drag.dxSnap; }
  width = Math.max(dayW * 0.6, width); left = Math.max(0, left); topPos = Math.max(0, topPos);
  const lab = barLabel(a, ctx); const tip = [lab.top, lab.sub].filter(Boolean).join(" — ") + (note ? `  (${note})` : "");
  const active = drag && drag.moved;
  const stick = `translateX(clamp(0px, calc(var(--sl, 0px) - ${Math.round(left)}px), ${Math.max(0, Math.round(width - 76))}px))`;
  return (
    <div ref={ref} onPointerMove={move} onPointerUp={up} onPointerCancel={up} title={tip}
      className="absolute rounded-md text-white overflow-hidden select-none group"
      style={{ left, top: topPos, width, height, background: ctx.colorOf(a), touchAction: "none", zIndex: drag ? 30 : 1, boxShadow: active ? "0 8px 20px rgba(0,0,0,.28)" : "0 1px 2px rgba(0,0,0,.12)", cursor: ctx.canEdit ? (drag ? (drag.mode === "move" ? "grabbing" : "ew-resize") : "grab") : "pointer", transition: drag ? "none" : "box-shadow .15s" }}>
      {fill != null && <><div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: `${fill * 100}%`, background: "rgba(0,0,0,0.22)" }} />
        <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${fill * 100}%`, right: 0, background: "linear-gradient(to right, rgba(255,255,255,0.22), rgba(255,255,255,0.06))" }} />
        {ratio > 1 && <div className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: 3, background: "#eb5757" }} />}
        {ratio > 1 && <span className="absolute grid place-items-center pointer-events-none" style={{ top: 3, right: 3, width: 16, height: 16, borderRadius: 9999, background: "#eb5757", zIndex: 8 }}><AlertTriangle size={11} color="#fff" /></span>}</>}
      <div onPointerDown={begin("l")} className="absolute left-0 top-0 bottom-0" style={{ width: 9, zIndex: 5, cursor: ctx.canEdit ? "ew-resize" : "default" }} />
      <div onPointerDown={begin("r")} className="absolute right-0 top-0 bottom-0" style={{ width: 9, zIndex: 5, cursor: ctx.canEdit ? "ew-resize" : "default" }} />
      <div onPointerDown={begin("move")} onClick={() => { if (!ctx.canEdit) onOpen(); }} className="absolute inset-0" style={{ padding: "4px 11px", zIndex: 2 }}>
        <div style={{ transform: stick, willChange: "transform" }}>
          <div className="font-bold leading-tight truncate" style={{ fontSize: 11 }}>{lab.top}</div>
          {lab.sub && <div className="leading-tight truncate" style={{ fontSize: 10, opacity: .92 }}>{lab.sub}</div>}
        </div>
      </div>
    </div>
  );
}

function TimelineBoard(ctx) {
  const { data, anchor, matches, setModal, moveAssign, peopleFilter, zoomT, holidayFilter, boardScroll, phaseLogged, canEdit } = ctx;
  const passHoliday = (a) => holidayFilter === "only" ? a.kind === "leave" : holidayFilter === "hide" ? a.kind !== "leave" : true;
  const visibleMembers = pfList(data.members, peopleFilter);
  const single = visibleMembers.length === 1;
  const SIDEBAR = 232, LANE_H = single ? 64 : 42, LANE_GAP = single ? 9 : 5, ROW_PAD = single ? 16 : 8;
  const scroller = useRef(null);
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const adjustRef = useRef(0);
  const wantAnchor = useRef(true);
  const centerRef = useRef(todayStart);
  const didMount = useRef(false);
  const [vw, setVw] = useState(1280); const vwRef = useRef(0);
  const dayArea = Math.max(280, vw - SIDEBAR);
  const yearFit = Math.max(2, dayArea / 372);
  const monthFit = dayArea / 30;
  const z = Math.max(0, Math.min(1, zoomT == null ? 1 : zoomT));
  const dayW = Math.round(yearFit * Math.pow(monthFit / yearFit, z) * 10) / 10;

  const computeInit = useCallback(() => {
    let earliest = todayStart, latest = todayStart;
    for (const a of data.assignments) { const s = parseISO(a.start), e = parseISO(a.end); if (s < earliest) earliest = s; if (e > latest) latest = e; }
    const anchorStart = startOfWeekMon(addDays(anchor, -28));
    let start = startOfWeekMon(addDays(earliest, -14)); if (anchorStart < start) start = anchorStart;
    const futureHorizon = addDays(todayStart, 365 * 2);
    let end = latest > futureHorizon ? addDays(latest, 90) : futureHorizon;
    const anchorEnd = addDays(anchor, 168); if (anchorEnd > end) end = anchorEnd;
    const totalDays = Math.max(168, Math.round((startOfDay(end) - start) / MS) + 1);
    return { start, totalDays };
  }, [anchor, data.assignments, todayStart]);

  const [win, setWin] = useState(computeInit);
  const conf = { start: win.start, totalDays: win.totalDays, dayW };
  const days = useMemo(() => Array.from({ length: conf.totalDays }, (_, i) => addDays(conf.start, i)), [conf.start, conf.totalDays]);
  const totalW = conf.totalDays * dayW;
  const xOf = (d) => ((startOfDay(d) - conf.start) / MS) * dayW;
  const todayX = (todayStart >= conf.start && todayStart <= addDays(conf.start, conf.totalDays)) ? xOf(todayStart) : null;
  const dateAtCenter = () => { const el = scroller.current; if (!el) return centerRef.current; const idx = Math.round((el.scrollLeft + (el.clientWidth - SIDEBAR) / 2) / dayW); return addDays(conf.start, idx); };
  const latest = useRef({}); latest.current = { anchor, start: conf.start, dayW };

  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const set = () => { const w = el.clientWidth; if (vwRef.current && Math.abs(w - vwRef.current) > 1) centerRef.current = dateAtCenter(); vwRef.current = w; setVw(w); };
    set();
    if (typeof ResizeObserver !== "undefined") { const ro = new ResizeObserver(set); ro.observe(el); return () => ro.disconnect(); }
    window.addEventListener("resize", set); return () => window.removeEventListener("resize", set);
  }, []); // eslint-disable-line
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const go = () => { const { anchor, start, dayW } = latest.current; el.scrollLeft = Math.max(0, ((startOfDay(anchor) - start) / MS) * dayW - 48); centerRef.current = dateAtCenter(); didMount.current = true; };
    const r = requestAnimationFrame(() => requestAnimationFrame(go));
    return () => cancelAnimationFrame(r);
  }, []); // eslint-disable-line
  useLayoutEffect(() => { setWin(computeInit()); wantAnchor.current = true; }, [anchor]); // eslint-disable-line
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    if (adjustRef.current) { el.scrollLeft += adjustRef.current; adjustRef.current = 0; }
    if (wantAnchor.current) { el.scrollLeft = Math.max(0, xOf(startOfDay(anchor)) - 48); wantAnchor.current = false; centerRef.current = dateAtCenter(); }
  }, [win.start, win.totalDays]); // eslint-disable-line
  useLayoutEffect(() => {
    const el = scroller.current; if (!el || !didMount.current) return;
    el.scrollLeft = Math.max(0, xOf(centerRef.current) - (el.clientWidth - SIDEBAR) / 2);
  }, [dayW]); // eslint-disable-line
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const onWheel = (e) => { if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault(); } };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  useEffect(() => { if (!boardScroll) return; boardScroll.current = { nudge: (dir) => { const el = scroller.current; if (el) el.scrollLeft += dir * Math.max(240, (el.clientWidth - SIDEBAR) * 0.8); } }; return () => { if (boardScroll) boardScroll.current = null; }; }, []); // eslint-disable-line

  const pan = useRef(null);
  const onPointerDown = (e) => { if (e.button !== 0) return; if (e.target.closest && e.target.closest("button,a,input,select,textarea")) return; const el = scroller.current; if (!el) return; pan.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }; try { el.setPointerCapture(e.pointerId); } catch (_) { } };
  const onPointerMove = (e) => { if (!pan.current) return; const el = scroller.current; if (!el) return; el.scrollLeft = pan.current.sl - (e.clientX - pan.current.x); el.scrollTop = pan.current.st - (e.clientY - pan.current.y); };
  const endPan = (e) => { const el = scroller.current; if (pan.current && el) { try { el.releasePointerCapture(e.pointerId); } catch (_) { } } pan.current = null; };

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    el.style.setProperty("--sl", el.scrollLeft + "px");
    centerRef.current = dateAtCenter();
    const EDGE = 800, chunk = 120;
    if (el.scrollLeft < EDGE) { adjustRef.current += chunk * dayW; setWin(w => ({ start: addDays(w.start, -chunk), totalDays: w.totalDays + chunk })); }
    else if (el.scrollLeft + el.clientWidth > totalW - EDGE) { setWin(w => ({ ...w, totalDays: w.totalDays + chunk })); }
  };

  const monthBands = []; let i = 0;
  while (i < days.length) { const d = days[i]; const m = d.getMonth(); let j = i; while (j < days.length && days[j].getMonth() === m) j++; monthBands.push({ left: i * conf.dayW, width: (j - i) * conf.dayW, label: `${MONTHS_LONG[m]} ${d.getFullYear()}` }); i = j; }

  const rows = visibleMembers.map((m, idx) => {
    const items = data.assignments.filter(a => a.memberId === m.id && matches(a) && passHoliday(a)).sort((a, b) => parseISO(a.start) - parseISO(b.start));
    const leave = items.filter(a => a.kind === "leave"), work = items.filter(a => a.kind !== "leave");
    const base = leave.length ? 1 : 0;
    const used = [];
    const fits = (i, s, e) => !(used[i] || []).some(iv => s <= iv.e && e >= iv.s);
    const place = (a, desired) => { const s = parseISO(a.start), e = parseISO(a.end); let i = Math.max(0, desired || 0); while (!fits(i, s, e)) i++; (used[i] = used[i] || []).push({ s, e }); return { a, lane: base + i, laneIndex: i }; };
    const pinned = work.filter(a => Number.isFinite(a.lane)), auto = work.filter(a => !Number.isFinite(a.lane));
    const placedWork = [...pinned.map(a => place(a, a.lane)), ...auto.map(a => place(a, 0))];
    const placed = [...leave.map(a => ({ a, lane: 0, laneIndex: null })), ...placedWork];
    const lanes = Math.max(1, base + used.length);
    return { m, idx, placed, lanes };
  });

  return (
    <div ref={scroller} onScroll={onScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPan} onPointerCancel={endPan}
      className="tl-scroll h-full border-x border-b border-slate-200 overflow-auto bg-white" style={{ cursor: "grab" }}>
      <style>{`.tl-scroll::-webkit-scrollbar:horizontal{height:0}.tl-scroll::-webkit-scrollbar:vertical{width:10px}.tl-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:6px}`}</style>
      <div style={{ width: SIDEBAR + totalW }}>
        <div className="flex border-b border-slate-100">
          <div className="shrink-0 bg-white border-r border-slate-200" style={{ width: SIDEBAR, position: "sticky", left: 0, zIndex: 16 }}></div>
          <div className="relative" style={{ width: totalW, height: 24 }}>
            {monthBands.map((b, k) => <div key={k} className="absolute top-0 bottom-0 flex items-center px-2 text-xs font-semibold text-slate-500 border-r border-slate-100" style={{ left: b.left, width: b.width }}>{b.label}</div>)}
          </div>
        </div>
        {dayW >= 14 && <div className="flex border-b border-slate-200">
          <div className="shrink-0 bg-white border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide" style={{ width: SIDEBAR, position: "sticky", left: 0, zIndex: 16 }}>{single ? visibleMembers[0].name : (peopleFilter === "all" ? `Everyone · ${data.members.length}` : `Selected · ${visibleMembers.length}`)}</div>
          <div className="flex" style={{ width: totalW }}>
            {days.map((d, k) => { const wknd = !isWeekday(d); const mon = d.getDay() === 1; return (
              <div key={k} className={`text-center border-r ${mon ? "border-slate-300" : "border-slate-100"} ${wknd ? "bg-slate-50" : ""}`} style={{ width: conf.dayW, paddingTop: 4, paddingBottom: 4 }}>
                {dayW >= 46
                  ? <><div className="text-xs font-semibold text-slate-600">{DOW[d.getDay()]}</div><div className="text-xs text-slate-400">{pad(d.getDate())}</div></>
                  : <div className="text-slate-400" style={{ fontSize: 9.5 }}>{d.getDate()}</div>}
              </div>
            ); })}
          </div>
        </div>}

        {rows.map(({ m, idx, placed, lanes }) => {
          const rowH = ROW_PAD * 2 + lanes * LANE_H + (lanes - 1) * LANE_GAP;
          return (
            <div key={m.id} className="flex" style={{ borderBottom: single ? "1px solid #e2e8f0" : "2px solid #cbd5e1" }}>
              <PersonCell m={m} idx={idx} width={SIDEBAR} canEdit={canEdit} onEdit={() => setModal({ type: "member", payload: m })} onAssign={() => setModal({ type: "assign", payload: { memberId: m.id } })} />
              <div className="relative" style={{ width: totalW, height: rowH }}>
                {days.map((d, k) => { if (dayW < 14) { return d.getDate() === 1 ? <div key={k} className="absolute top-0 bottom-0 border-r border-slate-200" style={{ left: k * conf.dayW }} /> : null; } const wknd = !isWeekday(d); const mon = d.getDay() === 1; return <div key={k} className={`absolute top-0 bottom-0 border-r ${mon ? "border-slate-200" : "border-slate-100"} ${wknd ? "bg-slate-50" : ""}`} style={{ left: k * conf.dayW, width: conf.dayW }} />; })}
                {todayX !== null && <div className="absolute top-0 bottom-0 z-10" style={{ left: todayX + dayW / 2 - 1, width: 2, background: "#ef4444aa" }} />}
                {placed.map(({ a, lane, laneIndex }) => {
                  const s = parseISO(a.start), e = addDays(parseISO(a.end), 1);
                  let left = xOf(s), right = xOf(e); if (right <= 0 || left >= totalW) return null;
                  left = Math.max(0, left); right = Math.min(totalW, right);
                  const w = Math.max(conf.dayW * 0.6, right - left); const top = ROW_PAD + lane * (LANE_H + LANE_GAP);
                  let fill = null, ratio = null, note = "";
                  if (a.kind === "work" && a.phaseId) { const pr = ctx.projectById(a.projectId); const ph = pr && (pr.phases || []).find(p => p.id === a.phaseId); if (ph && ph.hours > 0) { const loggedH = ((phaseLogged || {})[a.projectId + "|" + a.phaseId] || 0) / 60; ratio = loggedH / ph.hours; fill = Math.max(0, Math.min(1, ratio)); note = `${Math.round(loggedH * 10) / 10}h / ${ph.hours}h`; } }
                  return (
                    <Bar key={a.id} a={a} ctx={ctx} baseLeft={left} baseWidth={w} top={top} height={LANE_H} dayW={conf.dayW} fill={fill} ratio={ratio} note={note}
                      laneIndex={laneIndex} laneStep={LANE_H + LANE_GAP}
                      onOpen={() => setModal({ type: "assign", payload: a })} onCommit={(ns, ne, nl) => moveAssign(a, ns, ne, nl)} />
                  );
                })}
                {placed.length === 0 && <div className="absolute text-xs text-slate-300" style={{ left: 10, top: ROW_PAD + 4 }}>No assignments</div>}
              </div>
            </div>
          );
        })}
        {data.members.length === 0 && <div className="py-16 text-center text-slate-400"><p className="mb-3">No people yet — invite your team on the People page.</p></div>}
      </div>
    </div>
  );
}

/* ============================ Cadence adapter + glue ============================= */
function mapData(cad) {
  return {
    members: (cad.members || []).filter(m => m.status !== "suspended").map(m => ({ id: m.id, name: m.display_name || m.email || "—", role: m.job_title || (m.role || ""), teams: m.teams || [], daily: m.daily_hours || 8, holidayAllowance: m.holiday_allowance ?? 30, hourlyRate: m.hourly_rate })),
    clients: (cad.clients || []).map(c => ({ id: c.id, name: c.name, color: c.color, paymentTerms: c.payment_terms })),
    projects: (cad.projects || []).map(p => ({ id: p.id, index: p.code, name: p.name, clientId: p.client_id, phases: p.phases || [], cost: p.cost })),
    assignments: (cad.assignments || []).map(a => ({ id: a.id, kind: a.kind === "task" ? "internal" : a.kind, memberId: a.membership_id, projectId: a.project_id, phaseId: a.phase_id, leaveType: a.leave_type, start: a.start_date, end: a.end_date, lane: Number.isFinite(a.lane) ? a.lane : null, taskId: a.task_id })),
    timeLogs: (cad.timeLogs || []).map(l => ({ id: l.id, memberId: l.membership_id, projectId: l.project_id, phaseId: l.phase_id, date: l.log_date, minutes: l.minutes })),
    internalTasks: (cad.tasks || []),
  };
}

export default function Schedule({ org, me, data: cadData, reload }) {
  const canEdit = can(me, "schedule.edit");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [zoomT, setZoomT] = useState(0.55);
  const [pf, setPf] = useState("all");
  const [holidayFilter, setHolidayFilter] = useState("all");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null);
  const boardScroll = useRef(null);

  const data = useMemo(() => mapData(cadData), [cadData]);
  const clientById = useCallback((id) => data.clients.find(c => c.id === id), [data.clients]);
  const projectById = useCallback((id) => data.projects.find(p => p.id === id), [data.projects]);
  const teams = useMemo(() => [...new Set(data.members.flatMap(m => m.teams || []))].sort(), [data.members]);

  const peopleFilter = useMemo(() => {
    if (pf === "all") return "all";
    if (teams.includes(pf)) return data.members.filter(m => (m.teams || []).includes(pf)).map(m => m.id);
    return [pf];
  }, [pf, teams, data.members]);

  const phaseLogged = useMemo(() => { const map = {}; data.timeLogs.forEach(l => { if (l.projectId && l.phaseId) { const k = l.projectId + "|" + l.phaseId; map[k] = (map[k] || 0) + l.minutes; } }); return map; }, [data.timeLogs]);
  const colorOf = useCallback((a) => { if (a.kind === "leave") return (LEAVE_TYPES[a.leaveType] || LEAVE_TYPES.vacation).color; const p = projectById(a.projectId); const c = p && clientById(p.clientId); return c ? c.color : NAVY; }, [projectById, clientById]);
  const matches = useCallback((a) => { if (!q) return true; const p = projectById(a.projectId); const c = p && clientById(p.clientId); const hay = ((p ? p.name : "") + " " + (c ? c.name : "") + " " + (a.leaveType || "")).toLowerCase(); return hay.includes(q.toLowerCase()); }, [q, projectById, clientById]);

  const moveAssign = async (a, start, end, lane) => {
    if (!canEdit) return;
    await sb.from("assignments").update({ start_date: start, end_date: end, ...(lane === undefined ? {} : { lane }) }).eq("id", a.id);
    reload();
  };

  const ctx = { data, anchor, matches, setModal, moveAssign, peopleFilter, zoomT, holidayFilter, boardScroll, phaseLogged, projectById, clientById, colorOf, canEdit };

  if (!can(me, "schedule.view")) return <NoAccess what="the schedule" />;

  return (
    <div className="h-full flex flex-col">
      <MiniTracker org={org} me={me} data={cadData} reload={reload} />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          <button className="w-7 h-7 grid place-items-center rounded border border-slate-200 hover:bg-slate-50" onClick={() => boardScroll.current?.nudge(-1)}><ChevronLeft size={15} /></button>
          <button className="text-xs px-2 h-7 rounded border border-slate-200 hover:bg-slate-50" onClick={() => setAnchor(startOfDay(new Date()))}>Today</button>
          <button className="w-7 h-7 grid place-items-center rounded border border-slate-200 hover:bg-slate-50" onClick={() => boardScroll.current?.nudge(1)}><ChevronRight size={15} /></button>
        </div>
        <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2 h-8">
          <Users size={14} className="text-slate-400" />
          <select className="text-sm outline-none bg-transparent" value={pf} onChange={e => setPf(e.target.value)}>
            <option value="all">Everyone</option>
            {teams.length > 0 && <optgroup label="Teams">{teams.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>}
            <optgroup label="People">{data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>
          </select>
        </div>
        <select className="text-sm outline-none border border-slate-200 rounded-lg px-2 h-8" value={holidayFilter} onChange={e => setHolidayFilter(e.target.value)}>
          <option value="all">Work + leave</option><option value="hide">Hide leave</option><option value="only">Leave only</option>
        </select>
        <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2 h-8 max-w-[180px]">
          <Search size={13} className="text-slate-400" /><input className="text-sm outline-none flex-1 min-w-0" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <ZoomOut size={15} className="text-slate-400" />
          <input type="range" min="0" max="1" step="0.01" value={zoomT} onChange={e => setZoomT(Number(e.target.value))} className="w-24" />
          <ZoomIn size={15} className="text-slate-400" />
          {canEdit && <Btn className="ml-1" onClick={() => setModal({ type: "assign", payload: null })}><Plus size={14} /> Book work</Btn>}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <TimelineBoard {...ctx} />
      </div>

      {modal?.type === "assign" && <AssignForm org={org} data={data} initial={modal.payload} canEdit={canEdit} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.type === "member" && <MemberForm org={org} member={modal.payload} teams={teams} canEdit={canEdit} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
}

function AssignForm({ org, data, initial, canEdit, onClose, onSaved }) {
  const editing = initial && initial.id;
  const [kind, setKind] = useState(initial?.kind === "leave" ? "leave" : "work");
  const [memberId, setMemberId] = useState(initial?.memberId || (data.members[0]?.id || ""));
  const [projectId, setProjectId] = useState(initial?.projectId || "");
  const [phaseId, setPhaseId] = useState(initial?.phaseId || "");
  const [leaveType, setLeaveType] = useState(initial?.leaveType || "vacation");
  const [start, setStart] = useState(initial?.start || toISO(new Date()));
  const [end, setEnd] = useState(initial?.end || toISO(new Date()));
  const [busy, setBusy] = useState(false);
  const project = data.projects.find(p => p.id === projectId);

  const save = async () => {
    if (kind === "work" && !projectId) { alert("Choose a project."); return; }
    if (end < start) { alert("End date is before the start date."); return; }
    setBusy(true);
    const row = { org_id: org.id, kind, membership_id: memberId, project_id: kind === "work" ? projectId : null, phase_id: kind === "work" ? (phaseId || null) : null, leave_type: kind === "leave" ? leaveType : null, start_date: start, end_date: end };
    if (editing) await sb.from("assignments").update(row).eq("id", initial.id);
    else await sb.from("assignments").insert(row);
    setBusy(false); onSaved();
  };
  const del = async () => { if (!confirm("Remove this from the schedule?")) return; await sb.from("assignments").delete().eq("id", initial.id); onSaved(); };

  return (<UIModal title={editing ? "Edit booking" : "Book work"} onClose={onClose}
    footer={canEdit ? <>{editing && <Btn variant="danger" className="mr-auto" onClick={del}><Trash2 size={14} /> Remove</Btn>}<Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Save" : "Book it"}</Btn></> : <Btn variant="ghost" onClick={onClose}>Close</Btn>}>
    <div className="flex gap-1 mb-4">
      {[["work", "Project work"], ["leave", "Leave / holiday"]].map(([k, l]) =>
        <button key={k} disabled={!canEdit} onClick={() => setKind(k)} className={`flex-1 text-sm py-1.5 rounded-lg border ${kind === k ? "text-white border-transparent" : "border-slate-200 text-slate-600"}`} style={kind === k ? { background: UINAVY } : undefined}>{l}</button>)}
    </div>
    <UIField label="Person"><select className={inputCls} disabled={!canEdit} value={memberId} onChange={e => setMemberId(e.target.value)}>{data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></UIField>
    {kind === "work" ? (<>
      <UIField label="Project"><select className={inputCls} disabled={!canEdit} value={projectId} onChange={e => { setProjectId(e.target.value); setPhaseId(""); }}>
        <option value="">Choose a project…</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.index ? p.index + " · " : ""}{p.name}</option>)}
      </select></UIField>
      {project?.phases?.length > 0 && <UIField label="Phase"><select className={inputCls} disabled={!canEdit} value={phaseId} onChange={e => setPhaseId(e.target.value)}>
        <option value="">No specific phase</option>{project.phases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
      </select></UIField>}
    </>) : (
      <UIField label="Type"><select className={inputCls} disabled={!canEdit} value={leaveType} onChange={e => setLeaveType(e.target.value)}>{Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></UIField>
    )}
    <div className="grid grid-cols-2 gap-3">
      <UIField label="Start"><input type="date" className={inputCls} disabled={!canEdit} value={start} onChange={e => setStart(e.target.value)} /></UIField>
      <UIField label="End"><input type="date" className={inputCls} disabled={!canEdit} value={end} onChange={e => setEnd(e.target.value)} /></UIField>
    </div>
  </UIModal>);
}

function MemberForm({ org, member, teams, canEdit, onClose, onSaved }) {
  const [name, setName] = useState(member?.name || "");
  const [role, setRole] = useState(member?.role || "");
  const [daily, setDaily] = useState(member?.daily ?? 8);
  const [allow, setAllow] = useState(member?.holidayAllowance ?? 30);
  const [rate, setRate] = useState(member?.hourlyRate ?? "");
  const [sel, setSel] = useState(member?.teams || []);
  const [newTeam, setNewTeam] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (t) => setSel(s => s.includes(t) ? s.filter(x => x !== t) : [...s, t]);
  const save = async () => {
    setBusy(true);
    await sb.from("memberships").update({ display_name: name.trim(), job_title: role.trim() || null, daily_hours: Number(daily) || 8, holiday_allowance: Number(allow) || 0, hourly_rate: rate === "" ? null : Number(rate), teams: sel.length ? sel : null }).eq("id", member.id);
    setBusy(false); onSaved();
  };
  return (<UIModal title={"Edit " + (member?.name || "person")} onClose={onClose}
    footer={canEdit ? <><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !name.trim()}>Save</Btn></> : <Btn variant="ghost" onClick={onClose}>Close</Btn>}>
    <UIField label="Name"><input className={inputCls} disabled={!canEdit} value={name} onChange={e => setName(e.target.value)} /></UIField>
    <UIField label="Job title / role"><input className={inputCls} disabled={!canEdit} value={role} onChange={e => setRole(e.target.value)} placeholder="Designer" /></UIField>
    <div className="grid grid-cols-3 gap-3">
      <UIField label="Hours / day"><input type="number" className={inputCls} disabled={!canEdit} value={daily} onChange={e => setDaily(e.target.value)} /></UIField>
      <UIField label="Holiday (days/yr)"><input type="number" className={inputCls} disabled={!canEdit} value={allow} onChange={e => setAllow(e.target.value)} /></UIField>
      <UIField label="Rate (£/hr)"><input type="number" className={inputCls} disabled={!canEdit} value={rate} onChange={e => setRate(e.target.value)} placeholder="—" /></UIField>
    </div>
    <UIField label="Teams">
      <div className="flex flex-wrap gap-1.5 mb-2">{teams.map(t => <button key={t} disabled={!canEdit} onClick={() => toggle(t)} className={`text-xs px-2 py-1 rounded-full border ${sel.includes(t) ? "text-white border-transparent" : "border-slate-200 text-slate-600"}`} style={sel.includes(t) ? { background: UINAVY } : undefined}>{t}</button>)}</div>
      {canEdit && <div className="flex gap-2"><input className={inputCls} value={newTeam} onChange={e => setNewTeam(e.target.value)} placeholder="New team name" /><Btn variant="outline" onClick={() => { if (newTeam.trim() && !sel.includes(newTeam.trim())) { setSel([...sel, newTeam.trim()]); setNewTeam(""); } }}>Add</Btn></div>}
    </UIField>
    <p className="text-[11px] text-slate-400">Roles, permissions and invites are managed on the People page.</p>
  </UIModal>);
}
