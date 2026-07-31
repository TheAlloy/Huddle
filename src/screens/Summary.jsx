import React, { useState, useMemo } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, Card, Empty, Avatar, inputCls, Modal, Field } from "../ui.jsx";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { toISO, parseISO, addDays, startOfWeekMon, startOfMonth, endOfMonth, MONTHS, MONTHS_LONG, DOW, fmtH, money, pad } from "../lib/dates.js";
import { ChevronLeft, ChevronRight, Users, Plus } from "lucide-react";

export default function Summary({ org, me, data, reload }) {
  const [period, setPeriod] = useState("week");        // day | week | month
  const [anchor, setAnchor] = useState(toISO(new Date()));
  const [filter, setFilter] = useState("all");
  const [edit, setEdit] = useState(null);              // {mid, day, key} bubble being edited
  const [eH, setEH] = useState(0); const [eM, setEM] = useState(0);
  const [addFor, setAddFor] = useState(null);          // {mid, day}
  const [showBudget, setShowBudget] = useState(false);

  const canEditAny = can(me, "summary.edit");
  const canTrackOwn = can(me, "time.track");
  const projectById = useMemo(() => Object.fromEntries(data.projects.map(p => [p.id, p])), [data.projects]);
  const clientById = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])), [data.clients]);
  const teams = useMemo(() => [...new Set(data.members.flatMap(m => m.teams || []))].sort(), [data.members]);

  const members = useMemo(() => {
    const list = data.members.filter(m => m.status !== "suspended");
    if (filter === "all") return list;
    if (teams.includes(filter)) return list.filter(m => (m.teams || []).includes(filter));
    return list.filter(m => m.id === filter);
  }, [data.members, filter, teams]);

  const a = parseISO(anchor);
  const range = period === "day" ? { s: anchor, e: anchor }
    : period === "week" ? { s: toISO(startOfWeekMon(a)), e: toISO(addDays(startOfWeekMon(a), 6)) }
      : { s: toISO(startOfMonth(a)), e: toISO(endOfMonth(a)) };
  const days = []; for (let d = parseISO(range.s); toISO(d) <= range.e; d = addDays(d, 1)) days.push(new Date(d));
  const isMonth = period === "month";

  const canEditLog = (mid) => canEditAny || (mid === me.id && canTrackOwn);

  const bubblesFor = (mid, dayISO) => {
    const g = {};
    (data.timeLogs || []).forEach(l => {
      if (l.membership_id !== mid || l.log_date !== dayISO) return;
      const key = (l.project_id || "none") + "|" + (l.phase_id || "");
      if (!g[key]) g[key] = { key, ids: [], mins: 0, project_id: l.project_id, phase_id: l.phase_id };
      g[key].ids.push(l.id); g[key].mins += l.minutes;
    });
    return Object.values(g);
  };
  const bub = (g) => {
    const p = projectById[g.project_id]; const c = p && clientById[p.client_id];
    const ph = p && g.phase_id && (p.phases || []).find(x => x.id === g.phase_id);
    return { label: (p ? (p.code || p.name) : "—") + (ph ? " · " + ph.name : ""), color: c ? c.color : "#64748b" };
  };
  const setTotal = async (g, mid, dayISO, minutes) => {
    if (minutes <= 0) { await sb.from("time_logs").delete().in("id", g.ids); }
    else {
      await sb.from("time_logs").update({ minutes }).eq("id", g.ids[0]);
      if (g.ids.length > 1) await sb.from("time_logs").delete().in("id", g.ids.slice(1));
    }
    setEdit(null); reload();
  };

  const dayTotal = (mid, dayISO) => bubblesFor(mid, dayISO).reduce((s, g) => s + g.mins, 0);
  const memTotal = (mid) => days.reduce((s, d) => s + dayTotal(mid, toISO(d)), 0);

  if (!can(me, "summary.view")) return <NoAccess what="summaries" />;

  const shiftAnchor = (dir) => setAnchor(toISO(period === "month" ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, dir * (period === "week" ? 7 : 1))));

  const weeks = [];
  if (isMonth) { let cur = null; days.forEach(d => { const wk = startOfWeekMon(d).getTime(); if (!cur || cur.wk !== wk) { cur = { wk, days: [] }; weeks.push(cur); } cur.days.push(d); }); }

  const dayCell = (m, d) => {
    const dayISO = toISO(d); const gs = bubblesFor(m.id, dayISO); const tot = gs.reduce((x, g) => x + g.mins, 0);
    const wknd = d.getDay() === 0 || d.getDay() === 6;
    return (<div key={dayISO} className={`rounded-lg border ${wknd ? "bg-slate-50 border-slate-100" : "border-slate-200"}`}>
      <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-600">{DOW[d.getDay()]} {pad(d.getDate())}/{pad(d.getMonth() + 1)}</span>
        <span className="text-slate-400">{tot ? fmtH(tot / 60) + "h" : ""}</span>
      </div>
      <div className="p-1.5 space-y-1" style={{ minHeight: isMonth ? 30 : 50 }}>
        {gs.length === 0 && <div className="text-[10px] text-slate-300 text-center py-1">—</div>}
        {gs.map(g => { const { label, color } = bub(g); const editing = edit && edit.mid === m.id && edit.day === dayISO && edit.key === g.key;
          return (<div key={g.key} onClick={() => { if (!editing && canEditLog(m.id)) { setEdit({ mid: m.id, day: dayISO, key: g.key }); setEH(Math.floor(g.mins / 60)); setEM(g.mins % 60); } }}
            className="rounded-md px-1.5 py-1 text-[11px] text-white" style={{ background: color, cursor: canEditLog(m.id) ? "pointer" : "default" }} title={label}>
            {editing ? (<div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <input type="number" min="0" value={eH} onChange={e => setEH(e.target.value)} className="w-8 text-slate-800 rounded px-1 py-0.5 outline-none" /><span>h</span>
              <input type="number" min="0" max="59" value={eM} onChange={e => setEM(e.target.value)} className="w-8 text-slate-800 rounded px-1 py-0.5 outline-none" />
              <button className="ml-auto font-bold" onClick={() => setTotal(g, m.id, dayISO, Math.max(0, Number(eH || 0) * 60 + Number(eM || 0)))}>✓</button>
            </div>) : (<div className="flex items-center justify-between gap-1"><span className="truncate">{label}</span><span className="font-semibold shrink-0">{fmtH(g.mins / 60)}</span></div>)}
          </div>); })}
        {!isMonth && canEditLog(m.id) && <button onClick={() => setAddFor({ mid: m.id, day: dayISO })} className="w-full text-[10px] text-slate-400 hover:text-blue-600 flex items-center justify-center gap-0.5 py-0.5"><Plus size={10} /> add</button>}
      </div>
    </div>);
  };

  // phase budget vs logged
  const budgetRows = [];
  data.projects.forEach(p => (p.phases || []).forEach(ph => {
    if (!(Number(ph.hours) > 0)) return;
    const logs = (data.timeLogs || []).filter(l => l.project_id === p.id && (l.phase_id || "") === ph.id);
    const mins = logs.reduce((s, l) => s + l.minutes, 0);
    budgetRows.push({ p, ph, c: clientById[p.client_id], loggedH: mins / 60, logs });
  }));

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white shrink-0 flex-wrap">
        <h2 className="text-sm font-bold text-slate-800 mr-1">Summary</h2>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {["day", "week", "month"].map(p => <button key={p} onClick={() => setPeriod(p)} className={`text-xs px-2.5 py-1.5 capitalize ${period === p ? "bg-slate-800 text-white" : "text-slate-600"}`}>{p}</button>)}
        </div>
        <div className="flex items-center gap-1">
          <button className="w-7 h-7 grid place-items-center rounded border border-slate-200 hover:bg-slate-50" onClick={() => shiftAnchor(-1)}><ChevronLeft size={15} /></button>
          <button className="text-xs px-2 h-7 rounded border border-slate-200 hover:bg-slate-50" onClick={() => setAnchor(toISO(new Date()))}>Today</button>
          <button className="w-7 h-7 grid place-items-center rounded border border-slate-200 hover:bg-slate-50" onClick={() => shiftAnchor(1)}><ChevronRight size={15} /></button>
        </div>
        <span className="text-xs text-slate-500">{period === "month" ? `${MONTHS_LONG[a.getMonth()]} ${a.getFullYear()}` : `${range.s} → ${range.e}`}</span>
        <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2 h-8 ml-auto">
          <Users size={14} className="text-slate-400" />
          <select className="text-sm outline-none bg-transparent" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">Everyone</option>
            {teams.length > 0 && <optgroup label="Teams">{teams.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>}
            <optgroup label="People">{data.members.filter(m => m.status !== "suspended").map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}</optgroup>
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4 bg-slate-50/50">
        {members.length === 0 && <div className="text-center text-sm text-slate-400 py-10">No people match this filter.</div>}
        {members.map((m, mi) => (
          <div key={m.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
              <Avatar name={m.display_name || m.email} i={mi} size={24} />
              <span className="font-semibold text-sm text-slate-800">{m.display_name || m.email}</span>
              <span className="ml-auto text-xs text-slate-500">Total <b className="text-slate-700">{fmtH(memTotal(m.id) / 60)}h</b></span>
            </div>
            {isMonth
              ? <div className="overflow-x-auto p-2"><div style={{ display: "grid", gap: 8, gridTemplateColumns: `repeat(${Math.max(1, weeks.length)}, minmax(150px, 1fr))` }}>
                {weeks.map((wk, wi) => <div key={wi} className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500 flex justify-between px-1"><span>{pad(wk.days[0].getDate())}/{pad(wk.days[0].getMonth() + 1)}–{pad(wk.days[wk.days.length - 1].getDate())}/{pad(wk.days[wk.days.length - 1].getMonth() + 1)}</span><span className="text-slate-400">{fmtH(wk.days.reduce((s, d) => s + dayTotal(m.id, toISO(d)), 0) / 60)}h</span></div>
                  {wk.days.map(d => dayCell(m, d))}
                </div>)}
              </div></div>
              : <div className="overflow-x-auto p-2"><div style={{ display: "grid", gap: 8, gridTemplateColumns: `repeat(${Math.max(1, days.length)}, minmax(120px, 1fr))` }}>
                {days.map(d => dayCell(m, d))}
              </div></div>}
          </div>
        ))}

        {budgetRows.length > 0 && (
          <Card title="Phase hours — budget vs logged" action={<button className="text-xs text-blue-600 font-semibold" onClick={() => setShowBudget(v => !v)}>{showBudget ? "Hide breakdown" : "Show breakdown"}</button>}>
            <div className="space-y-2">
              {budgetRows.map(({ p, ph, c, loggedH, logs }) => {
                const frac = Math.min(1, loggedH / ph.hours); const over = loggedH - ph.hours;
                const contrib = showBudget ? Object.entries(logs.reduce((mm, l) => { mm[l.membership_id] = (mm[l.membership_id] || 0) + l.minutes; return mm; }, {})).map(([mid, mins]) => { const mem = data.members.find(x => x.id === mid); return { mem, mins, cost: mem && Number.isFinite(mem.hourly_rate) ? (mins / 60) * mem.hourly_rate : null }; }).sort((x, y) => y.mins - x.mins) : [];
                const totalCost = contrib.reduce((s, x) => s + (x.cost || 0), 0);
                const fee = Number(ph.fee) > 0 ? ph.fee : null;
                return (<div key={p.id + ph.id} className="border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700 truncate"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: c ? c.color : "#94a3b8" }} />{p.code || p.name} · {ph.name}</span>
                    <span className="text-xs font-medium shrink-0" style={{ color: over > 0.05 ? "#eb5757" : "#475569" }}>{fmtH(loggedH)}h / {ph.hours}h</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: over > 0.05 ? "#eb5757" : "#27ae60" }} /></div>
                  {showBudget && (fee != null || totalCost > 0) && <div className="mt-1 text-xs text-slate-500 flex flex-wrap gap-x-3">
                    {fee != null && <span>Billed <b className="text-slate-700">{money(fee)}</b></span>}
                    {totalCost > 0 && <span>Cost of hours <b className="text-slate-700">{money(totalCost)}</b>{fee != null && <b style={{ color: totalCost > fee ? "#eb5757" : "#27ae60" }}> · {totalCost > fee ? "over" : "under"} by {money(Math.abs(fee - totalCost))}</b>}</span>}
                  </div>}
                  {showBudget && <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                    {contrib.length === 0 && <div className="text-xs text-slate-400">No time logged yet.</div>}
                    {contrib.map(({ mem, mins, cost }) => (<div key={mem ? mem.id : "?"} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-600 truncate flex-1">{mem ? (mem.display_name || mem.email) : "Unknown"}</span>
                      <span className="font-medium text-slate-700 w-12 text-right">{fmtH(mins / 60)}h</span>
                      <span className="w-16 text-right" style={{ color: cost != null ? "#64748b" : "#cbd5e1" }}>{cost != null ? money(cost) : "—"}</span>
                    </div>))}
                  </div>}
                </div>);
              })}
            </div>
          </Card>
        )}
      </div>

      {addFor && <AddLog org={org} data={data} mid={addFor.mid} day={addFor.day} onClose={() => setAddFor(null)} onSaved={() => { setAddFor(null); reload(); }} />}
    </div>
  );
}

function AddLog({ org, data, mid, day, onClose, onSaved }) {
  const [projectId, setProjectId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [hours, setHours] = useState(1); const [mins, setMins] = useState(0);
  const [busy, setBusy] = useState(false);
  const phases = data.projects.find(p => p.id === projectId)?.phases || [];
  const save = async () => {
    setBusy(true);
    await sb.from("time_logs").insert({ org_id: org.id, membership_id: mid, project_id: projectId || null, phase_id: phaseId || null, log_date: day, minutes: Math.max(1, Number(hours) * 60 + Number(mins)), source: "manual" });
    setBusy(false); onSaved();
  };
  return (<Modal title={`Add hours — ${day}`} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>Save</Btn></>}>
    <Field label="Project"><select className={inputCls} value={projectId} onChange={e => { setProjectId(e.target.value); setPhaseId(""); }}>
      <option value="">— none —</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + " · " : ""}{p.name}</option>)}
    </select></Field>
    {phases.length > 0 && <Field label="Phase"><select className={inputCls} value={phaseId} onChange={e => setPhaseId(e.target.value)}><option value="">Any</option>{phases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}</select></Field>}
    <div className="grid grid-cols-2 gap-3">
      <Field label="Hours"><input type="number" min="0" className={inputCls} value={hours} onChange={e => setHours(e.target.value)} /></Field>
      <Field label="Minutes"><input type="number" min="0" max="59" className={inputCls} value={mins} onChange={e => setMins(e.target.value)} /></Field>
    </div>
  </Modal>);
}
