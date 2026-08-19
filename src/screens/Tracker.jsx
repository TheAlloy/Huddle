import React, { useState, useEffect, useMemo, useRef } from "react";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { NAVY, DOW, pad, toISO, parseISO, startOfDay, addDays, startOfWeekMon, hm, fmtClock, fmtH, projectsByClient, openFloatingTimer, mapData, makeHandlers } from "../studio/core.jsx";
import { useRunningTimer, makeLabels, todayTracking } from "./tracker/shared.jsx";
import { useConfirm } from "../components/confirm.tsx";
import { Play, Square, PictureInPicture2, X, Plus, Pencil, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList } from "@/components/ui/combobox";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Calendar as CalendarIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

// Screen-local composition: searchable grouped project picker used by "start
// another", "log manually" and inline edit rows. Content-pour only — stock
// parts. Items are {key, projectId, phaseId, label}; the Recent group's items
// carry the phase they were last logged with, so picking one fills both.
function ProjectCombobox({ selP, selPh, onPick, groups, recents, placeholder = "Project…", className = "w-56" }) {
  const items = [
    ...(recents.length ? [{ value: "Recent", items: recents }] : []),
    ...groups.map(g => ({
      value: g.client ? g.client.name : "No client",
      items: g.projects.map(p => ({ key: p.id, projectId: p.id, phaseId: null, label: `${p.index} — ${p.name}` })),
    })),
  ];
  const flat = items.flatMap(g => g.items);
  const value = flat.find(i => i.projectId === selP && (i.phaseId || "") === (selPh || "")) || flat.find(i => i.projectId === selP) || null;
  return (
    <Combobox items={items} value={value} itemToStringValue={(i) => i.label}
      onValueChange={(it) => onPick(it ? { projectId: it.projectId, phaseId: it.phaseId } : { projectId: "", phaseId: null })}>
      <ComboboxInput placeholder={placeholder} className={className} showClear />
      <ComboboxContent>
        <ComboboxEmpty>No matching projects.</ComboboxEmpty>
        <ComboboxList>
          {(group) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item) => <ComboboxItem key={item.key} value={item}>{item.label}</ComboboxItem>}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function PhaseSelect({ value, onValueChange, phases, placeholder = "No phase", className = "w-36" }) {
  return (
    <Select value={value} onValueChange={onValueChange} items={{ "": placeholder, ...Object.fromEntries(phases.map(p => [p.id, p.name])) }}>
      <SelectTrigger className={className}><SelectValue/></SelectTrigger>
      <SelectContent><SelectGroup><SelectItem value="">{placeholder}</SelectItem>{phases.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  );
}

export default function Tracker({ org, me, data: cadData, reload }){
  const meId=me.id;
  const data=useMemo(()=>mapData(cadData),[cadData]);
  const H=useMemo(()=>makeHandlers(org,reload,cadData),[org,cadData]); // eslint-disable-line
  const { addTimeLog, updateTimeLog, editTimeLog, delTimeLogs } = H;

  const myDaily=(data.members.find(m=>m.id===meId)||{}).daily||8;
  const { run, start, startTask, stop: stopTimer, cancel, capMinutes } = useRunningTimer(meId, { addTimeLog, orgId: org.id, dailyHours: myDaily });
  const confirm=useConfirm();
  const [now,setNow]=useState(Date.now());
  const [stopNote,setStopNote]=useState("");
  const [selP,setSelP]=useState(""),[selPh,setSelPh]=useState("");
  const [mP,setMP]=useState(""),[mPh,setMPh]=useState(""),[mDate,setMDate]=useState(toISO(startOfDay(new Date()))),[mH,setMH]=useState(1),[mM,setMM]=useState(0),[mDateOpen,setMDateOpen]=useState(false);
  const [editId,setEditId]=useState(null),[eH,setEH]=useState(0),[eM,setEM]=useState(0),[eProj,setEProj]=useState(""),[ePh,setEPh]=useState(""),[eNote,setENote]=useState("");
  const pip=useRef(null), pipActions=useRef({});
  const closePip=()=>{ if(pip.current){ try{pip.current.close();}catch(_){} pip.current=null; } };
  useEffect(()=>{ if(!run) return; const t=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(t); },[run]);
  useEffect(()=>{ if(!run) closePip(); },[run]); // eslint-disable-line
  useEffect(()=>()=>closePip(),[]); // eslint-disable-line

  if(!can(me,"time.track")) return <NoAccess what="the time tracker" />;
  const mayManual = can(me,"time.manual");

  const { projById, labProj, labTop, phName, colorOf, taskById, runTop, runColor } = makeLabels(data);
  const todayISO=toISO(startOfDay(new Date()));
  const { bubbles, myTasks, todayEntries, minsFor, minsForTask, todayMins } = todayTracking(data, meId, todayISO);

  // Distinct project+phase combos I've logged in the last 14 days, newest
  // first — surfaced as the Recent group at the top of the project pickers.
  const cutoffISO=toISO(addDays(startOfDay(new Date()),-14));
  const recents=[];
  { const seen=new Set();
    (data.timeLogs||[]).filter(l=>l.memberId===meId&&!l.taskId&&l.projectId&&l.date>=cutoffISO)
      .sort((a,b)=>b.date.localeCompare(a.date))
      .forEach(l=>{ const k=l.projectId+"|"+(l.phaseId||""); if(seen.has(k)||recents.length>=6) return; seen.add(k);
        const pr=projById(l.projectId); if(!pr) return;
        const ph=phName(l.projectId,l.phaseId);
        recents.push({ key:"r:"+k, projectId:l.projectId, phaseId:l.phaseId||null, label:`${pr.index} — ${pr.name}${ph?" · "+ph:""}` }); });
  }

  const stop=()=>{ stopTimer(todayISO,{note:stopNote.trim()||null}); setStopNote(""); };
  const discard=async()=>{ const mins=run?Math.round((Date.now()-run.startedAt)/60000):0;
    if(mins>5 && !(await confirm({title:"Discard this timer?",description:hm(mins)+" of tracked time will be thrown away.",confirmLabel:"Discard",destructive:true}))) return;
    setStopNote(""); cancel(); };
  const addManual=()=>{ const mins=Math.max(0,Number(mH||0)*60+Number(mM||0)); if(!mP||mins<=0) return; addTimeLog({memberId:meId,projectId:mP,phaseId:mPh||null,date:mDate||todayISO,minutes:mins,source:"manual"}); setMH(1); setMM(0); };
  const beginEdit=(l)=>{ setEditId(l.id); setEH(Math.floor(l.minutes/60)); setEM(l.minutes%60); setEProj(l.projectId||""); setEPh(l.phaseId||""); setENote(l.note||""); };
  const saveEdit=(l)=>{ const mins=Math.max(0,Number(eH||0)*60+Number(eM||0)); const note=eNote.trim()||null; if(l&&l.taskId) editTimeLog(editId,{minutes:mins,note}); else editTimeLog(editId,{minutes:mins,projectId:eProj||null,phaseId:ePh||null,note}); setEditId(null); };
  const selproj=projById(selP), mproj=projById(mP);
  const elapsed=run?fmtClock(Math.min((now-run.startedAt)/1000,capMinutes*60)):null;
  const groups=projectsByClient(data.projects,data.clients);

  pipActions.current={ run, stop, top:()=>runTop(run) };
  const openPip=async()=>{ if(!run) return; if(pip.current){ try{pip.current.win.focus();}catch(_){} return; }
    const ctl=await openFloatingTimer({ getTop:()=>{ const a=pipActions.current; return a.top?a.top():"—"; }, getElapsed:()=>{ const r=pipActions.current.run; return r?fmtClock((Date.now()-r.startedAt)/1000):"0:00:00"; }, onStop:()=>{ const s=pipActions.current.stop; if(s) s(); } });
    if(ctl) pip.current=ctl; };

  // this week
  const wkStart=startOfWeekMon(new Date());
  const weekDays=Array.from({length:7},(_,i)=>addDays(wkStart,i));
  const dayTot=(d)=>(data.timeLogs||[]).filter(l=>l.memberId===meId&&l.date===toISO(d)).reduce((s,l)=>s+l.minutes,0);
  const weekTot=weekDays.reduce((s,d)=>s+dayTot(d),0);

  // Data-colored start card — the client color IS the content here.
  const BigBubble=({onClick,color,top,sub,mins,title})=>(
    <button onClick={onClick} title={title} className="w-full text-left rounded-2xl px-5 py-4 text-white transition hover:brightness-110 shadow-xs" style={{background:color}}>
      <div className="flex items-center gap-3">
        <span className="grid place-items-center size-11 rounded-full bg-card shrink-0" style={{color}}><Play size={20}/></span>
        <div className="min-w-0 flex-1"><div className="text-base font-medium leading-tight truncate">{top}</div><div className="opacity-90 leading-tight truncate text-sm">{sub||"—"}</div></div>
        <div className="text-right shrink-0"><div className="text-xs opacity-80">Today</div><div className="font-medium text-lg leading-tight">{hm(mins)}</div></div>
      </div>
    </button>);
  const projectBubbles=bubbles.filter(b=>!b.internal);
  const taskItems=[
    ...bubbles.filter(b=>b.internal).map(b=>({key:"ib:"+b.taskId,id:b.taskId,title:(taskById(b.taskId)||{}).title||"task"})),
    ...myTasks.map(t=>({key:"task:"+t.id,id:t.id,title:t.title})),
  ];

  return (
    <ScrollArea className="h-full bg-muted/30">
      <div className="max-w-3xl mx-auto flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2"><Clock size={18} className="text-muted-foreground"/><h2 className="text-base font-medium">Time tracker</h2><span className="ml-auto text-sm text-muted-foreground">This week <span className="font-medium text-foreground">{fmtH(weekTot/60)}h</span></span></div>

        <div className={`rounded-xl p-4 ${run ? "text-white shadow-xs" : "border bg-card"}`} style={run ? { background: runColor(run) } : undefined}>
          {run ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="size-2.5 rounded-full bg-card" style={{animation:"pulse 1.5s infinite"}}/>
              <div><div className="text-xs opacity-90">{runTop(run)}{!run.taskId&&phName(run.projectId,run.phaseId)?" · "+phName(run.projectId,run.phaseId):""}</div><div className="text-3xl font-medium tabular-nums">{elapsed}</div></div>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <Input value={stopNote} onChange={e=>setStopNote(e.target.value)} placeholder="Add a note… (optional)" className="w-52 bg-card text-foreground"/>
                <Button variant="secondary" onClick={stop}><Square data-icon="inline-start"/> Stop &amp; log</Button>
                <Button variant="secondary" size="icon" title="Pop out floating timer" onClick={openPip}><PictureInPicture2/></Button>
                <Button variant="secondary" size="icon" title="Discard" onClick={discard}><X/></Button>
              </div>
            </div>
          ) : <div className="text-sm text-muted-foreground">Not tracking — tap one of today's projects below, or start another.</div>}
        </div>

        {!run && <div className="flex flex-col gap-4">
          <div>
            <div className="text-sm font-medium mb-2">Today's Projects</div>
            <div className="flex flex-col gap-2">
              {projectBubbles.length===0 && <div className="text-sm text-muted-foreground">No projects assigned to you today — use Start another or Manual below.</div>}
              {projectBubbles.map(b=><BigBubble key={b.projectId+"|"+b.phaseId} onClick={()=>start(b.projectId,b.phaseId)} color={colorOf(b.projectId)} top={labProj(b.projectId)} sub={phName(b.projectId,b.phaseId)} mins={minsFor(b.projectId,b.phaseId)} title={"Start "+labTop(b.projectId)}/>)}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Tasks</div>
            <div className="flex flex-col gap-2">
              {taskItems.length===0 && <div className="text-sm text-muted-foreground">No tasks assigned to you today.</div>}
              {taskItems.map(t=><BigBubble key={t.key} onClick={()=>startTask(t.id)} color={NAVY} top="Task" sub={t.title} mins={minsForTask(t.id)} title="Start task"/>)}
            </div>
          </div>
        </div>}

        {!run && <div className="rounded-xl border bg-card p-3 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium flex items-center gap-1 shrink-0"><Play size={12}/> Start another</span>
          <ProjectCombobox selP={selP} selPh={selPh} onPick={({projectId,phaseId})=>{setSelP(projectId);setSelPh(phaseId||"");}} groups={groups} recents={recents}/>
          {selproj?.phases?.length>0 && <PhaseSelect value={selPh} onValueChange={setSelPh} phases={selproj.phases}/>}
          <Button onClick={()=>{ start(selP,selPh); setSelP(""); setSelPh(""); }} disabled={!selP}><Play data-icon="inline-start"/> Start</Button>
        </div>}

        {mayManual && <div className="rounded-xl border bg-card p-3 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium flex items-center gap-1 shrink-0"><Plus size={12}/> Log manually</span>
          <ProjectCombobox selP={mP} selPh={mPh} onPick={({projectId,phaseId})=>{setMP(projectId);setMPh(phaseId||"");}} groups={groups} recents={recents}/>
          {mproj?.phases?.length>0 && <PhaseSelect value={mPh} onValueChange={setMPh} phases={mproj.phases}/>}
          <Popover open={mDateOpen} onOpenChange={setMDateOpen}>
            <PopoverTrigger render={<Button variant="outline" className="tabular-nums" />}><CalendarIcon/> {mDate}</PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarPicker mode="single" selected={parseISO(mDate)} onSelect={(d)=>{ if(d){ setMDate(toISO(d)); setMDateOpen(false); } }} defaultMonth={parseISO(mDate)} />
            </PopoverContent>
          </Popover>
          <InputGroup className="w-20"><InputGroupInput type="number" min="0" value={mH} onChange={e=>setMH(e.target.value)}/><InputGroupAddon align="inline-end"><InputGroupText>h</InputGroupText></InputGroupAddon></InputGroup>
          <InputGroup className="w-20"><InputGroupInput type="number" min="0" max="59" value={mM} onChange={e=>setMM(e.target.value)}/><InputGroupAddon align="inline-end"><InputGroupText>m</InputGroupText></InputGroupAddon></InputGroup>
          <Button onClick={addManual} disabled={!mP}>Add</Button>
        </div>}

        <div className="rounded-xl border bg-card p-3">
          <div className="text-sm font-medium mb-2">Logged today — {hm(todayMins)}</div>
          <div className="flex flex-col gap-1">
            {todayEntries.length===0 && <span className="text-sm text-muted-foreground">Nothing logged yet today.</span>}
            {todayEntries.map(l=>{ const editing=editId===l.id; return (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 rounded-xs shrink-0" style={{background:l.taskId?NAVY:colorOf(l.projectId)}}/>
                <span className="truncate">{l.taskId?("Task · "+((taskById(l.taskId)||{}).title||"task")):(labProj(l.projectId)+(phName(l.projectId,l.phaseId)?" · "+phName(l.projectId,l.phaseId):""))}</span>
                {l.note && !editing && <span className="text-xs text-muted-foreground truncate max-w-40" title={l.note}>— {l.note}</span>}
                <span className="text-xs text-muted-foreground">{l.source}</span>
                {editing ? (<span className="ml-auto flex items-center gap-1 flex-wrap justify-end">
                  {!l.taskId && <ProjectCombobox selP={eProj} selPh={ePh} onPick={({projectId,phaseId})=>{setEProj(projectId);setEPh(phaseId||"");}} groups={groups} recents={recents} placeholder="No project" className="max-w-36"/>}
                  {!l.taskId && projById(eProj)?.phases?.length>0 && <PhaseSelect value={ePh} onValueChange={setEPh} phases={projById(eProj).phases} className="max-w-32"/>}
                  <Input value={eNote} onChange={e=>setENote(e.target.value)} placeholder="Note (optional)" className="w-36"/>
                  <InputGroup className="w-20"><InputGroupInput type="number" min="0" value={eH} onChange={e=>setEH(e.target.value)}/><InputGroupAddon align="inline-end"><InputGroupText>h</InputGroupText></InputGroupAddon></InputGroup>
                  <InputGroup className="w-20"><InputGroupInput type="number" min="0" max="59" value={eM} onChange={e=>setEM(e.target.value)}/><InputGroupAddon align="inline-end"><InputGroupText>m</InputGroupText></InputGroupAddon></InputGroup>
                  <Button onClick={()=>saveEdit(l)}>Save</Button>
                  <Button variant="ghost" size="icon" title="Cancel" onClick={()=>setEditId(null)}><X/></Button>
                </span>) : (<span className="ml-auto flex items-center gap-1">
                  <span className="font-medium tabular-nums">{hm(l.minutes)}</span>
                  {!run && <Button variant="ghost" size="icon-sm" title="Continue — start a new timer on this" onClick={()=>l.taskId?startTask(l.taskId):start(l.projectId,l.phaseId)}><Play/></Button>}
                  <Button variant="ghost" size="icon-sm" title="Edit" onClick={()=>beginEdit(l)}><Pencil/></Button>
                  <Button variant="ghost" size="icon-sm" title="Delete" onClick={()=>delTimeLogs([l.id])}><Trash2/></Button>
                </span>)}
              </div>);})}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-3">
          <div className="text-sm font-medium mb-2">This week</div>
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map(d=>{ const t=dayTot(d); const isToday=toISO(d)===todayISO; return (
              <div key={toISO(d)} className={`rounded-lg border px-1 py-2 text-center ${isToday?"border-primary/40 bg-primary/10":""}`}>
                <div className="text-xs text-muted-foreground">{DOW[d.getDay()]} {pad(d.getDate())}</div>
                <div className="text-sm font-medium mt-0.5">{t?fmtH(t/60):"·"}</div>
              </div>);})}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
