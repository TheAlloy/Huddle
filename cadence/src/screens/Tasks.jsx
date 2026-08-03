import React, { useState, useRef, useMemo, useCallback } from "react";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { AVATAR_BG, TASK_PRI, initials, inputCls, projectsByClient, ModalShell, ModalHead, ModalFoot, Field, mapData, makeHandlers } from "../studio/core.jsx";
import { Plus } from "lucide-react";

function InternalBoard(ctx){
  const { data, myMemberId, teamList, editTask, setModal } = ctx;
  const [teamF,setTeamF]=useState("all");
  const [mineOnly,setMineOnly]=useState(false);
  const [dragId,setDragId]=useState(null);
  const [overCol,setOverCol]=useState(null);
  const [ghost,setGhost]=useState(null);
  const priRank={high:0,med:1,low:2};
  const memberById=(id)=>data.members.find(m=>m.id===id);
  const inTeam=(t)=> teamF==="all" || t.team===teamF || (t.assigneeId&&(memberById(t.assigneeId)?.teams||[]).includes(teamF));
  const all=(data.internalTasks||[]).filter(inTeam);
  const active=all.filter(t=>t.status!=="done");
  const done=all.filter(t=>t.status==="done");
  const forMember=(id)=>active.filter(t=>(t.assigneeId||null)===id).sort((a,b)=>(priRank[a.priority]-priRank[b.priority])||(a.ord-b.ord));
  let people=data.members;
  if(teamF!=="all") people=people.filter(m=>(m.teams||[]).includes(teamF));
  if(mineOnly && myMemberId) people=people.filter(m=>m.id===myMemberId);
  const drop=(colId,taskId)=>{ const t=(data.internalTasks||[]).find(x=>x.id===taskId); if(t){ if(colId==="__done__") editTask({...t,status:"done"}); else if(colId==="__none__") editTask({...t,assigneeId:null,status:t.status==="done"?"todo":t.status}); else editTask({...t,assigneeId:colId,status:t.status==="done"?"todo":t.status}); } setDragId(null); setOverCol(null); };
  const dragRef=useRef(null);
  const boardRef=useRef(null);
  const colAt=(x,y)=>{ const root=boardRef.current; if(!root) return null; const cols=root.querySelectorAll("[data-col]"); for(const el of cols){ const r=el.getBoundingClientRect(); if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom) return el.getAttribute("data-col"); } return null; };
  const startDrag=(e,t)=>{
    if(!ctx.canEdit) { setModal({type:"task",payload:t}); return; }
    if(e.button&&e.button!==0) return;
    const cur=t.status==="done"?"__done__":(t.assigneeId||"__none__");
    const d={id:t.id,cur,sx:e.clientX,sy:e.clientY,moved:false};
    dragRef.current=d;
    const clearBody=()=>{ document.body.style.userSelect=""; document.body.style.cursor=""; };
    const move=(ev)=>{ if(!dragRef.current) return; if(!d.moved){ if(Math.hypot(ev.clientX-d.sx,ev.clientY-d.sy)<6) return; d.moved=true; setDragId(t.id); document.body.style.userSelect="none"; document.body.style.cursor="grabbing"; } ev.preventDefault(); setGhost({t,x:ev.clientX,y:ev.clientY}); setOverCol(colAt(ev.clientX,ev.clientY)); };
    const finish=(ev,cancelled)=>{ document.removeEventListener("pointermove",move); document.removeEventListener("pointerup",up); document.removeEventListener("pointercancel",cancel); clearBody(); dragRef.current=null; setDragId(null); setOverCol(null); setGhost(null); if(cancelled) return; if(d.moved){ const c=colAt(ev.clientX,ev.clientY); if(c&&c!==d.cur) drop(c,t.id); } else { setModal({type:"task",payload:t}); } };
    const up=(ev)=>finish(ev,false); const cancel=(ev)=>finish(ev,true);
    document.addEventListener("pointermove",move,{passive:false}); document.addEventListener("pointerup",up); document.addEventListener("pointercancel",cancel);
  };
  const Card=(t)=>{ const pr=TASK_PRI[t.priority]||TASK_PRI.med; return (
    <div key={t.id} onPointerDown={e=>startDrag(e,t)}
      className="bg-white rounded-lg border border-slate-200 shadow-sm px-2.5 py-2 cursor-grab active:cursor-grabbing hover:shadow" style={{borderLeft:`3px solid ${pr.color}`,opacity:dragId===t.id?0.45:1,touchAction:"none"}}>
      <div className="text-sm font-medium text-slate-800">{t.title}</div>
      {t.notes && <div className="text-xs text-slate-400 mt-0.5" style={{display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{t.notes}</div>}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{background:pr.color+"22",color:pr.color}}>{pr.label}</span>
        {t.projectId && (()=>{ const p=data.projects.find(x=>x.id===t.projectId); if(!p) return null; const ph=t.phaseId&&(p.phases||[]).find(x=>x.id===t.phaseId); return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{p.index}{ph?" · "+ph.name:""}</span>; })()}
        {t.team && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t.team}</span>}
        {t.assigneeId && !memberById(t.assigneeId) && <span className="text-[10px] text-slate-400">(unknown)</span>}
      </div>
    </div>);};
  const Column=({id,title,color,cards})=>(
    <div data-col={id}
      className={`shrink-0 w-64 flex flex-col rounded-xl border ${overCol===id?"border-blue-400 bg-blue-50":"border-slate-200 bg-slate-50"}`} style={{maxHeight:520}}>
      <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-200 shrink-0">
        {color && <span className="grid place-items-center w-6 h-6 rounded-full text-white text-[11px] font-semibold shrink-0" style={{background:color}}>{initials(title)}</span>}
        <span className="text-sm font-semibold text-slate-700 truncate">{title}</span>
        <span className="ml-auto text-xs text-slate-400">{cards.length}</span>
      </div>
      <div className="p-2 flex flex-col gap-2 overflow-y-auto">
        {cards.map(Card)}
      </div>
    </div>
  );
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-700">Tasks</h2>
        <span className="text-xs text-slate-400 hidden md:inline">general jobs — drag a card onto a person to assign it</span>
        <div className="ml-auto flex items-center gap-2">
          {myMemberId && <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer"><input type="checkbox" checked={mineOnly} onChange={e=>setMineOnly(e.target.checked)}/> Mine only</label>}
          <select value={teamF} onChange={e=>setTeamF(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"><option value="all">All teams</option>{teamList.map(t=><option key={t} value={t}>{t}</option>)}</select>
          {ctx.canEdit && <button onClick={()=>setModal({type:"task",payload:{__new:true}})} className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700"><Plus size={15}/> Add task</button>}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <div ref={boardRef} className="flex flex-wrap gap-3 items-start">
          <Column id="__none__" title="Unassigned" color={null} cards={active.filter(t=>!t.assigneeId)}/>
          {people.map(m=><Column key={m.id} id={m.id} title={m.name} color={AVATAR_BG[data.members.findIndex(x=>x.id===m.id)%AVATAR_BG.length]} cards={forMember(m.id)}/>)}
          <Column id="__done__" title="Done" color={null} cards={done}/>
        </div>
      </div>
      {ghost && (()=>{ const pr=TASK_PRI[ghost.t.priority]||TASK_PRI.med; return (
        <div className="fixed z-50 pointer-events-none bg-white rounded-lg border border-slate-200 px-2.5 py-2 w-56" style={{left:ghost.x,top:ghost.y,transform:"translate(-40%, -50%) rotate(-3deg) scale(1.03)",boxShadow:"0 12px 28px rgba(0,0,0,.25)",borderLeft:`3px solid ${pr.color}`,opacity:0.96}}>
          <div className="text-sm font-medium text-slate-800 truncate">{ghost.t.title}</div>
          <div className="flex items-center gap-1.5 mt-1"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{background:pr.color+"22",color:pr.color}}>{pr.label}</span>{ghost.t.team&&<span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{ghost.t.team}</span>}</div>
        </div>); })()}
    </div>
  );
}

function TaskForm({ task, members, teams=[], projects=[], clients=[], onSave, onDelete, onClose }){
  const [title,setTitle]=useState(task?.title||"");
  const [notes,setNotes]=useState(task?.notes||"");
  const [assigneeId,setAssigneeId]=useState(task?.assigneeId||"");
  const [team,setTeam]=useState(task?.team||"");
  const [priority,setPriority]=useState(task?.priority||"med");
  const [status,setStatus]=useState(task?.status||"todo");
  const [projectId,setProjectId]=useState(task?.projectId||"");
  const [phaseId,setPhaseId]=useState(task?.phaseId||"");
  const proj=projects.find(p=>p.id===projectId);
  const save=()=>{ if(!title.trim()) return; onSave({...(task||{}),title:title.trim(),notes:notes.trim(),assigneeId:assigneeId||null,team:team||"",priority,status,projectId:projectId||null,phaseId:projectId?(phaseId||null):null}); };
  return (<ModalShell onClose={onClose}><ModalHead title={task?"Edit task":"New task"} onClose={onClose}/><div className="p-5">
    <Field label="Task"><input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Improve onboarding flow" autoFocus/></Field>
    <Field label="Notes (optional)"><textarea className={inputCls} rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any detail…"/></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Related project (optional)"><select className={inputCls} value={projectId} onChange={e=>{setProjectId(e.target.value);setPhaseId("");}}><option value="">— none —</option>{projectsByClient(projects,clients).map(g=>(<optgroup key={g.client?g.client.id:"none"} label={g.client?g.client.name:"No client"}>{g.projects.map(p=><option key={p.id} value={p.id}>{p.index} — {p.name}</option>)}</optgroup>))}</select></Field>
      {proj?.phases?.length>0 ? <Field label="Phase"><select className={inputCls} value={phaseId} onChange={e=>setPhaseId(e.target.value)}><option value="">— none —</option>{proj.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field> : <div/>}
    </div>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Assign to"><select className={inputCls} value={assigneeId} onChange={e=>setAssigneeId(e.target.value)}><option value="">Unassigned</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
      <Field label="Team"><input className={inputCls} value={team} list="task-teams" onChange={e=>setTeam(e.target.value)} placeholder="optional"/><datalist id="task-teams">{teams.map(t=><option key={t} value={t}/>)}</datalist></Field>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Importance"><select className={inputCls} value={priority} onChange={e=>setPriority(e.target.value)}><option value="high">High</option><option value="med">Medium</option><option value="low">Low</option></select></Field>
      <Field label="Status"><select className={inputCls} value={status} onChange={e=>setStatus(e.target.value)}><option value="todo">To do</option><option value="doing">In progress</option><option value="done">Done</option></select></Field>
    </div>
  </div><ModalFoot onSave={save} onDelete={onDelete?()=>onDelete(task.id):null} saveLabel={task?"Save":"Add task"}/></ModalShell>);
}

export default function Tasks({ org, me, data: cadData, reload }){
  const [modal,setModal]=useState(null);
  const data=useMemo(()=>mapData(cadData),[cadData]);
  const H=useMemo(()=>makeHandlers(org,reload,cadData),[org,cadData]); // eslint-disable-line
  const teamList=useMemo(()=>[...new Set(data.members.flatMap(m=>m.teams||[]))].sort(),[data.members]);
  if(!can(me,"tasks.view")) return <NoAccess what="tasks" />;
  const canEdit=can(me,"tasks.edit");
  const ctx={ data, myMemberId:me.id, teamList, canEdit, editTask:canEdit?H.editTask:(()=>{}), setModal };
  return (<div className="h-full">
    <InternalBoard {...ctx} />
    {modal?.type==="task" && <TaskForm task={modal.payload&&!modal.payload.__new?modal.payload:null} members={data.members} teams={teamList} projects={data.projects} clients={data.clients}
      onSave={t=>{ if(t.id) H.editTask(t); else H.addTask(t); setModal(null); }} onDelete={modal.payload&&!modal.payload.__new?id=>{ H.delTask(id); setModal(null); }:null} onClose={()=>setModal(null)} />}
  </div>);
}
