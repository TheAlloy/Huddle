import React, { useState, useRef, useMemo, useCallback } from "react";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { TASK_PRI, projectsByClient, mapData, makeHandlers, AVATAR_BG, initials, taskAssignees, toISO, parseISO, MONTHS, DOW } from "../studio/core.jsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Trash2, CalendarDays, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup, Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxValue, useComboboxAnchor } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

function InternalBoard(ctx){
  const { data, myMemberId, teamList, editTask, setModal } = ctx;
  const [teamF,setTeamF]=useState("all");
  const [mineOnly,setMineOnly]=useState(false);
  const [dragId,setDragId]=useState(null);
  const [overCol,setOverCol]=useState(null);
  const [ghost,setGhost]=useState(null);
  const priRank={high:0,med:1,low:2};
  const memberById=(id)=>data.members.find(m=>m.id===id);
  const inTeam=(t)=> teamF==="all" || t.team===teamF || taskAssignees(t).some(id=>(memberById(id)?.teams||[]).includes(teamF));
  const all=(data.internalTasks||[]).filter(inTeam);
  const active=all.filter(t=>t.status!=="done");
  const done=all.filter(t=>t.status==="done");
  // A task with several people shows in each of their columns.
  const forMember=(id)=>active.filter(t=>taskAssignees(t).includes(id)).sort((a,b)=>(priRank[a.priority]-priRank[b.priority])||(a.ord-b.ord));
  let people=data.members;
  if(teamF!=="all") people=people.filter(m=>(m.teams||[]).includes(teamF));
  if(mineOnly && myMemberId) people=people.filter(m=>m.id===myMemberId);
  // Dragging moves the card from the column it was picked up in: person →
  // person swaps just that person, → Unassigned takes them off, → Done
  // completes it; dropping on someone already on the task just removes the
  // one it came from.
  const drop=(colId,taskId,fromCol)=>{ const t=(data.internalTasks||[]).find(x=>x.id===taskId); if(t){ const ids=taskAssignees(t); const rest=ids.filter(x=>x!==fromCol); const reopen=t.status==="done"?"todo":t.status;
    if(colId==="__done__") editTask({...t,status:"done"});
    else if(colId==="__none__") editTask({...t,assigneeIds:rest,status:reopen});
    else editTask({...t,assigneeIds:rest.includes(colId)?rest:[...rest,colId],status:reopen}); } setDragId(null); setOverCol(null); };
  const dragRef=useRef(null);
  const boardRef=useRef(null);
  const colAt=(x,y)=>{ const root=boardRef.current; if(!root) return null; const cols=root.querySelectorAll("[data-col]"); for(const el of cols){ const r=el.getBoundingClientRect(); if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom) return el.getAttribute("data-col"); } return null; };
  const startDrag=(e,t,colId)=>{
    if(!ctx.canEdit) { setModal({type:"task",payload:t}); return; }
    if(e.button&&e.button!==0) return;
    const cur=colId;
    const d={id:t.id,cur,sx:e.clientX,sy:e.clientY,moved:false};
    dragRef.current=d;
    const clearBody=()=>{ document.body.style.userSelect=""; document.body.style.cursor=""; };
    const move=(ev)=>{ if(!dragRef.current) return; if(!d.moved){ if(Math.hypot(ev.clientX-d.sx,ev.clientY-d.sy)<6) return; d.moved=true; setDragId(t.id); document.body.style.userSelect="none"; document.body.style.cursor="grabbing"; } ev.preventDefault(); setGhost({t,x:ev.clientX,y:ev.clientY}); setOverCol(colAt(ev.clientX,ev.clientY)); };
    const finish=(ev,cancelled)=>{ document.removeEventListener("pointermove",move); document.removeEventListener("pointerup",up); document.removeEventListener("pointercancel",cancel); clearBody(); dragRef.current=null; setDragId(null); setOverCol(null); setGhost(null); if(cancelled) return; if(d.moved){ const c=colAt(ev.clientX,ev.clientY); if(c&&c!==d.cur) drop(c,t.id,d.cur); } else { setModal({type:"task",payload:t}); } };
    const up=(ev)=>finish(ev,false); const cancel=(ev)=>finish(ev,true);
    document.addEventListener("pointermove",move,{passive:false}); document.addEventListener("pointerup",up); document.addEventListener("pointercancel",cancel);
  };
  const todayISO=toISO(new Date());
  const Card=(t,colId)=>{ const pr=TASK_PRI[t.priority]||TASK_PRI.med; const ids=taskAssignees(t); return (
    <div key={t.id} onPointerDown={e=>startDrag(e,t,colId)}
      className="bg-card rounded-lg border shadow-xs px-2.5 py-2 cursor-grab active:cursor-grabbing hover:shadow" style={{borderLeft:`3px solid ${pr.color}`,opacity:dragId===t.id?0.45:1,touchAction:"none"}}>
      <div className="text-sm font-medium">{t.title}</div>
      {t.notes && <div className="text-xs text-muted-foreground mt-0.5" style={{display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{t.notes}</div>}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <Badge style={{ background: (pr.color) + "22", color: (pr.color) }}>{pr.label}</Badge>
        {t.startDate && (()=>{ const d=parseISO(t.startDate); return <Badge variant={t.startDate>todayISO?"outline":"secondary"}><CalendarDays data-icon="inline-start"/>{t.startDate>todayISO?"Starts ":""}{d.getDate()} {MONTHS[d.getMonth()]}</Badge>; })()}
        {t.projectId && (()=>{ const p=data.projects.find(x=>x.id===t.projectId); if(!p) return null; const ph=t.phaseId&&(p.phases||[]).find(x=>x.id===t.phaseId); return <Badge variant="secondary">{p.index}{ph?" · "+ph.name:""}</Badge>; })()}
        {t.team && <Badge variant="secondary">{t.team}</Badge>}
        {ids.some(id=>!memberById(id)) && <span className="text-xs text-muted-foreground">(unknown)</span>}
      </div>
      {/* Shared tasks show everyone on them. */}
      {ids.length>1 && <div className="mt-1.5 flex items-center -space-x-1.5" title={ids.map(id=>memberById(id)?.name||"Unknown").join(", ")}>
        {ids.map(id=>{ const i=data.members.findIndex(x=>x.id===id); const m=data.members[i]; return <Avatar key={id} size="sm" className="ring-2 ring-card"><AvatarFallback className="text-white" style={{background:AVATAR_BG[(i<0?0:i)%AVATAR_BG.length]}}>{initials(m?m.name:"?")}</AvatarFallback></Avatar>; })}
      </div>}
    </div>);};
  const Column=({id,title,avatarIndex,cards})=>(
    <div data-col={id}
      className={`shrink-0 w-64 flex flex-col rounded-xl border ${overCol===id?"border-primary bg-primary/10":"bg-muted/50"}`} style={{maxHeight:520}}>
      <div className="px-3 py-2 flex items-center gap-2 border-b shrink-0">
        {avatarIndex!=null && <Avatar size="sm"><AvatarFallback className="text-white" style={{background:AVATAR_BG[avatarIndex%AVATAR_BG.length]}}>{initials(title)}</AvatarFallback></Avatar>}
        <span className="text-sm font-medium truncate">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground">{cards.length}</span>
        {/* + adds a task straight into this column (already assigned to this person). */}
        {ctx.canEdit && id!=="__done__" && <Button variant="ghost" size="icon-xs" className="-mr-1" title={id==="__none__"?"Add an unassigned task":`Add a task for ${title}`}
          onClick={()=>setModal({type:"task",payload:{__new:true,assigneeIds:id==="__none__"?[]:[id]}})}><Plus/></Button>}
      </div>
      <div className="p-2 flex flex-col gap-2 overflow-y-auto">
        {cards.map(t=>Card(t,id))}
      </div>
    </div>
  );
  return (
    <div className="h-full flex flex-col bg-card">
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b flex-wrap">
        <h2 className="text-base font-medium">Tasks</h2>
        <span className="text-sm text-muted-foreground hidden md:inline">general jobs — drag a card onto a person to assign it</span>
        <div className="ml-auto flex items-center gap-2">
          {myMemberId && <label className="flex items-center gap-2 text-sm cursor-pointer"><Checkbox checked={mineOnly} onCheckedChange={(v)=>setMineOnly(!!v)}/> Mine only</label>}
          <Select value={teamF} onValueChange={setTeamF} items={{all:"All teams",...Object.fromEntries(teamList.map(t=>[t,t]))}}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="all">All teams</SelectItem>{teamList.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {ctx.canEdit && <Button onClick={()=>setModal({type:"task",payload:{__new:true}})}><Plus data-icon="inline-start" /> Add task</Button>}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 lg:px-6 py-4">
        <div ref={boardRef} className="flex flex-wrap gap-3 items-start">
          <Column id="__none__" title="Unassigned" avatarIndex={null} cards={active.filter(t=>!taskAssignees(t).length)}/>
          {people.map(m=><Column key={m.id} id={m.id} title={m.name} avatarIndex={data.members.findIndex(x=>x.id===m.id)} cards={forMember(m.id)}/>)}
          <Column id="__done__" title="Done" avatarIndex={null} cards={done}/>
        </div>
      </div>
      {ghost && (()=>{ const pr=TASK_PRI[ghost.t.priority]||TASK_PRI.med; return (
        <div className="fixed z-50 pointer-events-none bg-card rounded-lg border shadow-lg px-2.5 py-2 w-56" style={{left:ghost.x,top:ghost.y,transform:"translate(-40%, -50%) rotate(-3deg) scale(1.03)",borderLeft:`3px solid ${pr.color}`,opacity:0.96}}>
          <div className="text-sm font-medium truncate">{ghost.t.title}</div>
          <div className="flex items-center gap-1.5 mt-1"><Badge style={{ background: (pr.color) + "22", color: (pr.color) }}>{pr.label}</Badge>{ghost.t.team&&<Badge variant="secondary">{ghost.t.team}</Badge>}</div>
        </div>); })()}
    </div>
  );
}

function TaskForm({ task, preset, members, teams=[], projects=[], clients=[], onSave, onDelete, onClose }){
  const [title,setTitle]=useState(task?.title||"");
  const [titleErr,setTitleErr]=useState("");
  const [notes,setNotes]=useState(task?.notes||"");
  const [assigneeIds,setAssigneeIds]=useState(()=>task?taskAssignees(task):(preset?.assigneeIds||[]));
  const [startDate,setStartDate]=useState(task?.startDate||"");
  const [startOpen,setStartOpen]=useState(false);
  const nameOf=(id)=>(members.find(m=>m.id===id)||{}).name||"—";
  const peopleAnchor=useComboboxAnchor();
  const [team,setTeam]=useState(task?.team||"");
  const [priority,setPriority]=useState(task?.priority||"med");
  const [status,setStatus]=useState(task?.status||"todo");
  const [projectId,setProjectId]=useState(task?.projectId||"");
  const [phaseId,setPhaseId]=useState(task?.phaseId||"");
  const proj=projects.find(p=>p.id===projectId);
  const projectGroups=projectsByClient(projects,clients);
  const projectItems={"":"— none —",...Object.fromEntries(projects.map(p=>[p.id,`${p.index} — ${p.name}`]))};
  const save=()=>{ if(!title.trim()){ setTitleErr("Give the task a name."); return; } setTitleErr(""); onSave({...(task||{}),title:title.trim(),notes:notes.trim(),assigneeIds,startDate:startDate||null,team:team||"",priority,status,projectId:projectId||null,phaseId:projectId?(phaseId||null):null}); };
  return (<Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[92svh] overflow-y-auto"><DialogHeader><DialogTitle>{task?"Edit task":"New task"}</DialogTitle></DialogHeader>
    <FieldGroup>
      <Field data-invalid={(titleErr) ? true : undefined}><FieldLabel>Task</FieldLabel><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Improve onboarding flow" aria-invalid={titleErr?true:undefined} autoFocus/>{(titleErr) ? <FieldError>{titleErr}</FieldError> : null}</Field>
      <Field><FieldLabel>Notes (optional)</FieldLabel><Textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any detail…"/></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field><FieldLabel>Related project (optional)</FieldLabel>
          <Select value={projectId} onValueChange={(v)=>{setProjectId(v);setPhaseId("");}} items={projectItems}>
            <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectGroup><SelectItem value="">— none —</SelectItem></SelectGroup>
              {projectGroups.map(g=>(
                <SelectGroup key={g.client?g.client.id:"none"}>
                  <SelectLabel>{g.client?g.client.name:"No client"}</SelectLabel>
                  {g.projects.map(p=><SelectItem key={p.id} value={p.id}>{p.index} — {p.name}</SelectItem>)}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {proj?.phases?.length>0 ? <Field><FieldLabel>Phase</FieldLabel>
          <Select value={phaseId} onValueChange={setPhaseId} items={{"":"— none —",...Object.fromEntries(proj.phases.map(p=>[p.id,p.name]))}}>
            <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="">— none —</SelectItem>{proj.phases.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field> : <div/>}
      </div>
      <Field><FieldLabel>Assign to</FieldLabel>
        <Combobox multiple autoHighlight items={members.map(m=>m.id)} value={assigneeIds} onValueChange={setAssigneeIds} itemToStringLabel={nameOf}>
          <ComboboxChips ref={peopleAnchor} className="w-full">
            <ComboboxValue>
              {(values)=>(<>
                {values.map(id=><ComboboxChip key={id}>{nameOf(id)}</ComboboxChip>)}
                <ComboboxChipsInput placeholder={values.length?"":"Unassigned — add people…"} />
              </>)}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={peopleAnchor}>
            <ComboboxEmpty>No one by that name.</ComboboxEmpty>
            <ComboboxList>{(id)=><ComboboxItem key={id} value={id}>{nameOf(id)}</ComboboxItem>}</ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>Everyone here sees the task in their column and tracker.</FieldDescription>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field><FieldLabel>Start date (optional)</FieldLabel>
          <div className="flex gap-1.5">
            <Popover open={startOpen} onOpenChange={setStartOpen}>
              <PopoverTrigger render={<Button variant="outline" className="flex-1 justify-start font-normal tabular-nums" />}><CalendarDays data-icon="inline-start"/> {startDate?(()=>{ const d=parseISO(startDate); return `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; })():"Pick a date"}</PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker mode="single" weekStartsOn={1} selected={startDate?parseISO(startDate):undefined} defaultMonth={startDate?parseISO(startDate):new Date()} onSelect={(d)=>{ if(d){ setStartDate(toISO(d)); setStartOpen(false); } }} />
              </PopoverContent>
            </Popover>
            {startDate && <Button variant="ghost" size="icon" title="Clear start date" onClick={()=>setStartDate("")}><X/></Button>}
          </div>
        </Field>
        <Field><FieldLabel>Team</FieldLabel>
          <Combobox items={teams} inputValue={team} onInputValueChange={setTeam}>
            <ComboboxInput placeholder="optional" />
            <ComboboxContent>
              <ComboboxEmpty>No teams yet — type to create one.</ComboboxEmpty>
              <ComboboxList>{(item) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field><FieldLabel>Importance</FieldLabel>
          <Select value={priority} onValueChange={setPriority} items={{high:"High",med:"Medium",low:"Low"}}>
            <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="high">High</SelectItem><SelectItem value="med">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field><FieldLabel>Status</FieldLabel>
          <Select value={status} onValueChange={setStatus} items={{todo:"To do",doing:"In progress",done:"Done"}}>
            <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="todo">To do</SelectItem><SelectItem value="doing">In progress</SelectItem><SelectItem value="done">Done</SelectItem></SelectGroup></SelectContent>
          </Select>
        </Field>
      </div>
    </FieldGroup>
  <DialogFooter>{(onDelete?()=>onDelete(task.id):null) ? <Button variant="destructive" onClick={onDelete?()=>onDelete(task.id):null}><Trash2 data-icon="inline-start" /> Delete</Button> : null}<Button onClick={save}>{task?"Save":"Add task"}</Button></DialogFooter></DialogContent></Dialog>);
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
    {modal?.type==="task" && <TaskForm task={modal.payload&&!modal.payload.__new?modal.payload:null} preset={modal.payload&&modal.payload.__new?modal.payload:null} members={data.members} teams={teamList} projects={data.projects} clients={data.clients}
      onSave={t=>{ if(t.id) H.editTask(t); else H.addTask(t); setModal(null); }} onDelete={modal.payload&&!modal.payload.__new?id=>{ H.delTask(id); setModal(null); }:null} onClose={()=>setModal(null)} />}
  </div>);
}
