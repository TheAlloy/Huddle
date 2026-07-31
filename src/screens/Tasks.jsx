import React, { useState, useRef, useMemo } from "react";
import { sb } from "../lib/supabase.js";
import { logAudit } from "../lib/api.js";
import { Btn, Field, inputCls, Modal, Avatar, NAVY } from "../ui.jsx";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { Plus, Trash2 } from "lucide-react";

const COLUMNS = [
  { key: "todo", label: "To do", color: "#64748b" },
  { key: "doing", label: "In progress", color: "#2f80ed" },
  { key: "review", label: "Review", color: "#f2994a" },
  { key: "done", label: "Done", color: "#27ae60" },
];
const PRIORITY = { low: { label: "Low", color: "#94a3b8" }, med: { label: "Med", color: "#2f80ed" }, high: { label: "High", color: "#eb5757" } };

export default function Tasks({ org, me, data, reload }) {
  const [modal, setModal] = useState(null);
  const [drag, setDrag] = useState(null);
  const boardRef = useRef(null);
  const ghostRef = useRef(null);
  const canEdit = can(me, "tasks.edit");

  const memberById = useMemo(() => Object.fromEntries(data.members.map(m => [m.id, m])), [data.members]);
  const projectById = useMemo(() => Object.fromEntries(data.projects.map(p => [p.id, p])), [data.projects]);

  if (!can(me, "tasks.view")) return <NoAccess what="tasks" />;

  const tasksByCol = (key) => (data.tasks || []).filter(t => (t.status || "todo") === key).sort((x, y) => (x.ord || 0) - (y.ord || 0));

  const colAt = (x, y) => {
    const root = boardRef.current; if (!root) return null;
    for (const el of root.querySelectorAll("[data-col]")) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.getAttribute("data-col");
    }
    return null;
  };

  const startDrag = (e, task) => {
    if (!canEdit || (e.button && e.button !== 0)) return;
    const d = { task, moved: false, sx: e.clientX, sy: e.clientY };
    const move = (ev) => {
      if (!d.moved) { if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 5) return; d.moved = true; document.body.style.userSelect = "none"; setDrag({ id: task.id }); }
      if (ghostRef.current) { ghostRef.current.style.left = ev.clientX + 8 + "px"; ghostRef.current.style.top = ev.clientY + 8 + "px"; }
    };
    const up = async (ev) => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      document.body.style.userSelect = ""; setDrag(null);
      if (!d.moved) { setModal({ type: "task", task }); return; }
      const col = colAt(ev.clientX, ev.clientY);
      if (col && col !== (task.status || "todo")) {
        const maxOrd = Math.max(0, ...tasksByCol(col).map(t => t.ord || 0));
        await sb.from("tasks").update({ status: col, ord: maxOrd + 1 }).eq("id", task.id);
        reload();
      }
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  };

  const dragTask = drag && (data.tasks || []).find(t => t.id === drag.id);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white shrink-0">
        <h2 className="text-sm font-bold text-slate-800">Tasks</h2>
        {canEdit && <Btn className="ml-auto" onClick={() => setModal({ type: "task", task: null })}><Plus size={14} /> New task</Btn>}
      </div>

      <div ref={boardRef} className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3">
        <div className="flex gap-3 h-full" style={{ minWidth: "min-content" }}>
          {COLUMNS.map(col => {
            const items = tasksByCol(col.key);
            return (<div key={col.key} data-col={col.key} className="w-64 shrink-0 flex flex-col bg-slate-100/70 rounded-xl">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {items.map(t => {
                  const m = memberById[t.assignee_id]; const p = projectById[t.project_id];
                  const ph = p && t.phase_id && (p.phases || []).find(x => x.id === t.phase_id);
                  const pr = PRIORITY[t.priority] || PRIORITY.med;
                  return (<div key={t.id} onPointerDown={e => startDrag(e, t)}
                    className="bg-white rounded-lg border border-slate-200 p-2.5 shadow-sm text-sm select-none"
                    style={{ cursor: canEdit ? "grab" : "pointer", opacity: drag?.id === t.id ? 0.4 : 1 }}>
                    <div className="text-slate-800 font-medium mb-1">{t.title}</div>
                    {p && <div className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 mb-1">{p.code || p.name}{ph ? " · " + ph.name : ""}</div>}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: pr.color + "22", color: pr.color }}>{pr.label}</span>
                      {t.team && <span className="text-[10px] text-slate-400">{t.team}</span>}
                      {m && <span className="ml-auto"><Avatar name={m.display_name || m.email} i={data.members.findIndex(x => x.id === m.id)} size={20} /></span>}
                    </div>
                  </div>);
                })}
                {items.length === 0 && <div className="text-xs text-slate-300 text-center py-4">—</div>}
              </div>
            </div>);
          })}
        </div>
      </div>

      {dragTask && <div ref={ghostRef} className="fixed z-50 pointer-events-none bg-white rounded-lg border border-blue-300 shadow-lg p-2.5 text-sm w-56" style={{ left: -999, top: -999 }}>
        <div className="text-slate-800 font-medium">{dragTask.title}</div>
      </div>}

      {modal?.type === "task" && <TaskModal org={org} data={data} me={me} task={modal.task} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
}

function TaskModal({ org, data, me, task, onClose, onSaved }) {
  const [title, setTitle] = useState(task?.title || "");
  const [notes, setNotes] = useState(task?.notes || "");
  const [projectId, setProjectId] = useState(task?.project_id || "");
  const [phaseId, setPhaseId] = useState(task?.phase_id || "");
  const [assignee, setAssignee] = useState(task?.assignee_id || "");
  const [priority, setPriority] = useState(task?.priority || "med");
  const [status, setStatus] = useState(task?.status || "todo");
  const [busy, setBusy] = useState(false);
  const phases = data.projects.find(p => p.id === projectId)?.phases || [];

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const row = { org_id: org.id, title: title.trim(), notes: notes.trim() || null, project_id: projectId || null, phase_id: phaseId || null, assignee_id: assignee || null, priority, status };
    if (task) await sb.from("tasks").update(row).eq("id", task.id);
    else { const maxOrd = Math.max(0, ...(data.tasks || []).filter(t => (t.status || "todo") === status).map(t => t.ord || 0)); const { data: ins } = await sb.from("tasks").insert({ ...row, ord: maxOrd + 1 }).select().single(); logAudit(org.id, "task.created", "task", { id: ins?.id }); }
    setBusy(false); onSaved();
  };
  const del = async () => { if (!confirm("Delete this task?")) return; await sb.from("tasks").delete().eq("id", task.id); onSaved(); };

  return (<Modal title={task ? "Edit task" : "New task"} onClose={onClose}
    footer={<>{task && <Btn variant="danger" className="mr-auto" onClick={del}><Trash2 size={14} /> Delete</Btn>}<Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !title.trim()}>Save</Btn></>}>
    <Field label="Task"><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="What needs doing?" /></Field>
    <Field label="Notes"><textarea className={inputCls} rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Project"><select className={inputCls} value={projectId} onChange={e => { setProjectId(e.target.value); setPhaseId(""); }}>
        <option value="">— none —</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + " · " : ""}{p.name}</option>)}
      </select></Field>
      {phases.length > 0
        ? <Field label="Phase"><select className={inputCls} value={phaseId} onChange={e => setPhaseId(e.target.value)}><option value="">Any</option>{phases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}</select></Field>
        : <Field label="Assignee"><select className={inputCls} value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Unassigned</option>{data.members.map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}</select></Field>}
    </div>
    {phases.length > 0 && <Field label="Assignee"><select className={inputCls} value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Unassigned</option>{data.members.map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}</select></Field>}
    <div className="grid grid-cols-2 gap-3">
      <Field label="Priority"><select className={inputCls} value={priority} onChange={e => setPriority(e.target.value)}><option value="low">Low</option><option value="med">Medium</option><option value="high">High</option></select></Field>
      <Field label="Status"><select className={inputCls} value={status} onChange={e => setStatus(e.target.value)}>{COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
    </div>
  </Modal>);
}
