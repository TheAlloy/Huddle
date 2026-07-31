import React, { useState, useEffect, useMemo, useRef } from "react";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import {
  NAVY, DOW, pad, toISO, startOfDay, addDays, startOfWeekMon, hm, fmtClock, fmtH,
  projectsByClient, lsGet, lsSet, openFloatingTimer, mapData, makeHandlers,
} from "../studio/core.jsx";
import { Play, Square, PictureInPicture2, X, Plus, Pencil, Trash2, Clock } from "lucide-react";

export default function Tracker({ org, me, data: cadData, reload }){
  const meId=me.id;
  const data=useMemo(()=>mapData(cadData),[cadData]);
  const H=useMemo(()=>makeHandlers(org,reload,cadData),[org,cadData]); // eslint-disable-line
  const { addTimeLog, updateTimeLog, delTimeLogs } = H;

  const [run,setRun]=useState(()=>lsGet("tracker_run_"+meId));
  const [now,setNow]=useState(Date.now());
  const [selP,setSelP]=useState(""),[selPh,setSelPh]=useState("");
  const [mP,setMP]=useState(""),[mPh,setMPh]=useState(""),[mDate,setMDate]=useState(toISO(startOfDay(new Date()))),[mH,setMH]=useState(1),[mM,setMM]=useState(0);
  const [editId,setEditId]=useState(null),[eH,setEH]=useState(0),[eM,setEM]=useState(0);
  const pip=useRef(null), pipActions=useRef({});
  const closePip=()=>{ if(pip.current){ try{pip.current.close();}catch(_){} pip.current=null; } };
  useEffect(()=>{ if(!run) return; const t=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(t); },[run]);
  useEffect(()=>{ setRun(lsGet("tracker_run_"+meId)); },[meId]);
  useEffect(()=>{ if(!run) closePip(); },[run]); // eslint-disable-line
  useEffect(()=>()=>closePip(),[]); // eslint-disable-line

  if(!can(me,"time.track")) return <NoAccess what="the time tracker" />;
  const mayManual = can(me,"time.manual");

  const projById=(id)=>data.projects.find(p=>p.id===id);
  const clientOf=(pid)=>{ const pr=projById(pid); return pr && data.clients.find(c=>c.id===pr.clientId); };
  const labProj=(pid)=>{ const pr=projById(pid); const cl=clientOf(pid); return pr? `${cl?cl.name+" - ":""}${pr.name}` : "—"; };
  const labTop=(pid)=>{ const pr=projById(pid); const cl=clientOf(pid); return pr? `${cl?cl.name+" · ":""}${pr.index}` : "—"; };
  const phName=(pid,phid)=>{ const pr=projById(pid); const ph=pr&&phid&&(pr.phases||[]).find(x=>x.id===phid); return ph?ph.name:""; };
  const colorOf=(pid)=>{ const cl=clientOf(pid); return cl?cl.color:"#64748b"; };
  const taskById=(id)=>(data.internalTasks||[]).find(t=>t.id===id);
  const todayISO=toISO(startOfDay(new Date()));
  const minsFor=(pid,phid)=>(data.timeLogs||[]).filter(l=>l.memberId===meId&&l.date===todayISO&&!l.taskId&&l.projectId===pid&&(l.phaseId||"")===(phid||"")).reduce((s,l)=>s+l.minutes,0);
  const minsForTask=(tid)=>(data.timeLogs||[]).filter(l=>l.memberId===meId&&l.date===todayISO&&l.taskId===tid).reduce((s,l)=>s+l.minutes,0);
  const todayMins=(data.timeLogs||[]).filter(l=>l.memberId===meId&&l.date===todayISO).reduce((s,l)=>s+l.minutes,0);

  const seen=new Set(), bubbles=[];
  const addBub=(pid,phid)=>{ if(!pid) return; const k=pid+"|"+(phid||""); if(seen.has(k)) return; seen.add(k); bubbles.push({projectId:pid,phaseId:phid||null}); };
  data.assignments.filter(a=>a.memberId===meId&&a.kind==="work"&&a.start<=todayISO&&a.end>=todayISO).forEach(a=>addBub(a.projectId,a.phaseId));
  const internalAsgToday=data.assignments.filter(a=>a.memberId===meId&&a.kind==="internal"&&a.taskId&&a.start<=todayISO&&a.end>=todayISO);
  const asgTaskIds=new Set(internalAsgToday.map(a=>a.taskId));
  internalAsgToday.forEach(a=>{ const k="task:"+a.taskId; if(seen.has(k)) return; seen.add(k); bubbles.push({taskId:a.taskId,internal:true}); });
  const myTasks=(data.internalTasks||[]).filter(t=>t.assigneeId===meId&&t.status!=="done"&&!asgTaskIds.has(t.id));
  const todayEntries=(data.timeLogs||[]).filter(l=>l.memberId===meId&&l.date===todayISO);

  const setRunning=(r)=>{ setRun(r); lsSet("tracker_run_"+meId,r); };
  const start=(pid,phid)=>{ if(!pid) return; setRunning({projectId:pid,phaseId:phid||null,taskId:null,startedAt:Date.now()}); };
  const startTask=(tid)=>{ if(!tid) return; setRunning({projectId:null,phaseId:null,taskId:tid,startedAt:Date.now()}); };
  const stop=()=>{ if(!run) return; const mins=Math.max(1,Math.round((Date.now()-run.startedAt)/60000)); addTimeLog({memberId:meId,projectId:run.projectId,phaseId:run.phaseId,taskId:run.taskId,date:todayISO,minutes:mins,source:"timer"}); setRunning(null); };
  const cancel=()=>setRunning(null);
  const addManual=()=>{ const mins=Math.max(0,Number(mH||0)*60+Number(mM||0)); if(!mP||mins<=0) return; addTimeLog({memberId:meId,projectId:mP,phaseId:mPh||null,date:mDate||todayISO,minutes:mins,source:"manual"}); setMH(1); setMM(0); };
  const beginEdit=(l)=>{ setEditId(l.id); setEH(Math.floor(l.minutes/60)); setEM(l.minutes%60); };
  const saveEdit=()=>{ const mins=Math.max(0,Number(eH||0)*60+Number(eM||0)); updateTimeLog(editId,mins); setEditId(null); };
  const selproj=projById(selP), mproj=projById(mP);
  const elapsed=run?fmtClock((now-run.startedAt)/1000):null;
  const runTop=()=> run? (run.taskId? "Task · "+((taskById(run.taskId)||{}).title||"task") : labProj(run.projectId)) : "—";
  const runColor=()=> run? (run.taskId? NAVY : colorOf(run.projectId)) : "#64748b";
  const groups=projectsByClient(data.projects,data.clients);
  const grp=(g)=>(<optgroup key={g.client?g.client.id:"none"} label={g.client?g.client.name:"No client"}>{g.projects.map(p=><option key={p.id} value={p.id}>{p.index} — {p.name}</option>)}</optgroup>);

  pipActions.current={ run, stop, top:runTop };
  const openPip=async()=>{ if(!run) return; if(pip.current){ try{pip.current.win.focus();}catch(_){} return; }
    const ctl=await openFloatingTimer({ getTop:()=>{ const a=pipActions.current; return a.top?a.top():"—"; }, getElapsed:()=>{ const r=pipActions.current.run; return r?fmtClock((Date.now()-r.startedAt)/1000):"0:00:00"; }, onStop:()=>{ const s=pipActions.current.stop; if(s) s(); } });
    if(ctl) pip.current=ctl; };

  // this week
  const wkStart=startOfWeekMon(new Date());
  const weekDays=Array.from({length:7},(_,i)=>addDays(wkStart,i));
  const dayTot=(d)=>(data.timeLogs||[]).filter(l=>l.memberId===meId&&l.date===toISO(d)).reduce((s,l)=>s+l.minutes,0);
  const weekTot=weekDays.reduce((s,d)=>s+dayTot(d),0);

  const Bubble=({onClick,color,top,sub,mins,title})=>(
    <button onClick={onClick} title={title} className="shrink-0 text-left rounded-xl px-3 py-2.5 text-white transition hover:brightness-110" style={{background:color,minWidth:170,maxWidth:240}}>
      <div className="flex items-center gap-2"><span className="grid place-items-center w-7 h-7 rounded-full bg-white shrink-0" style={{color}}><Play size={13}/></span>
        <div className="min-w-0"><div className="text-sm font-semibold leading-tight truncate">{top}</div><div className="opacity-90 leading-tight truncate" style={{fontSize:11}}>{sub||"—"}</div></div></div>
      <div className="opacity-80 mt-1.5" style={{fontSize:11}}>Today {hm(mins)}</div>
    </button>);

  return (
    <div className="h-full overflow-y-auto bg-slate-50/50 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2"><Clock size={18} className="text-slate-500"/><h2 className="text-base font-bold text-slate-800">Time tracker</h2><span className="ml-auto text-xs text-slate-500">This week <b className="text-slate-700">{fmtH(weekTot/60)}h</b></span></div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {run ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="w-2 h-2 rounded-full" style={{background:runColor(),animation:"pulse 1.5s infinite"}}/>
              <div><div className="text-xs text-slate-500">{runTop()}{!run.taskId&&phName(run.projectId,run.phaseId)?" · "+phName(run.projectId,run.phaseId):""}</div><div className="text-3xl font-bold tabular-nums" style={{color:NAVY}}>{elapsed}</div></div>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={stop} className="flex items-center gap-1.5 bg-slate-800 text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-slate-900"><Square size={14}/> Stop &amp; log</button>
                <button onClick={openPip} title="Pop out floating timer" className="grid place-items-center w-10 h-10 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><PictureInPicture2 size={17}/></button>
                <button onClick={cancel} title="Discard" className="text-slate-400 hover:text-red-500"><X size={18}/></button>
              </div>
            </div>
          ) : <div className="text-sm text-slate-400">Not tracking — tap one of today's projects below, or start another.</div>}
        </div>

        {!run && <div>
          <div className="text-xs font-semibold text-slate-500 mb-2">Today's projects &amp; tasks</div>
          <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
            {bubbles.length===0 && myTasks.length===0 && <span className="text-xs text-slate-400 py-2">Nothing assigned to you today — use Start another or Manual below.</span>}
            {bubbles.map(b=> b.internal
              ? <Bubble key={"ib:"+b.taskId} onClick={()=>startTask(b.taskId)} color={NAVY} top="Task" sub={(taskById(b.taskId)||{}).title||"task"} mins={minsForTask(b.taskId)} title="Start task"/>
              : <Bubble key={b.projectId+"|"+b.phaseId} onClick={()=>start(b.projectId,b.phaseId)} color={colorOf(b.projectId)} top={labProj(b.projectId)} sub={phName(b.projectId,b.phaseId)} mins={minsFor(b.projectId,b.phaseId)} title={"Start "+labTop(b.projectId)}/>)}
            {myTasks.map(t=><Bubble key={"task:"+t.id} onClick={()=>startTask(t.id)} color={NAVY} top="Task" sub={t.title} mins={minsForTask(t.id)} title="Start task"/>)}
          </div>
        </div>}

        {!run && <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1 shrink-0"><Play size={12}/> Start another</span>
          <select value={selP} onChange={e=>{setSelP(e.target.value);setSelPh("");}} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"><option value="">Project…</option>{groups.map(grp)}</select>
          {selproj?.phases?.length>0 && <select value={selPh} onChange={e=>setSelPh(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"><option value="">No phase</option>{selproj.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <button onClick={()=>{ start(selP,selPh); setSelP(""); setSelPh(""); }} disabled={!selP} className="flex items-center gap-1.5 bg-green-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-40"><Play size={14}/> Start</button>
        </div>}

        {mayManual && <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1 shrink-0"><Plus size={12}/> Log manually</span>
          <select value={mP} onChange={e=>{setMP(e.target.value);setMPh("");}} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"><option value="">Project…</option>{groups.map(grp)}</select>
          {mproj?.phases?.length>0 && <select value={mPh} onChange={e=>setMPh(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"><option value="">No phase</option>{mproj.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <input type="date" value={mDate} onChange={e=>setMDate(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"/>
          <input type="number" min="0" value={mH} onChange={e=>setMH(e.target.value)} className="w-12 text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"/><span className="text-xs text-slate-400">h</span>
          <input type="number" min="0" max="59" value={mM} onChange={e=>setMM(e.target.value)} className="w-12 text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"/><span className="text-xs text-slate-400">m</span>
          <button onClick={addManual} disabled={!mP} className="bg-blue-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-40">Add</button>
        </div>}

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-500 mb-2">Logged today — {hm(todayMins)}</div>
          <div className="flex flex-col gap-1">
            {todayEntries.length===0 && <span className="text-xs text-slate-400">Nothing logged yet today.</span>}
            {todayEntries.map(l=>{ const editing=editId===l.id; return (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{background:l.taskId?NAVY:colorOf(l.projectId)}}/>
                <span className="text-slate-700 truncate">{l.taskId?("Task · "+((taskById(l.taskId)||{}).title||"task")):(labProj(l.projectId)+(phName(l.projectId,l.phaseId)?" · "+phName(l.projectId,l.phaseId):""))}</span>
                <span className="text-slate-300" style={{fontSize:11}}>{l.source}</span>
                {editing ? (<span className="ml-auto flex items-center gap-1">
                  <input type="number" min="0" value={eH} onChange={e=>setEH(e.target.value)} className="w-11 rounded border border-slate-200 px-1.5 py-1 outline-none"/><span className="text-xs text-slate-400">h</span>
                  <input type="number" min="0" max="59" value={eM} onChange={e=>setEM(e.target.value)} className="w-11 rounded border border-slate-200 px-1.5 py-1 outline-none"/><span className="text-xs text-slate-400">m</span>
                  <button onClick={saveEdit} className="text-xs font-semibold text-white bg-blue-600 px-2 py-1 rounded">Save</button>
                  <button onClick={()=>setEditId(null)} className="text-slate-400 hover:text-slate-700"><X size={15}/></button>
                </span>) : (<span className="ml-auto flex items-center gap-2">
                  <span className="font-medium text-slate-700 tabular-nums">{hm(l.minutes)}</span>
                  <button onClick={()=>beginEdit(l)} className="text-slate-300 hover:text-blue-600"><Pencil size={13}/></button>
                  <button onClick={()=>delTimeLogs([l.id])} className="text-slate-300 hover:text-red-500"><Trash2 size={13}/></button>
                </span>)}
              </div>);})}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-500 mb-2">This week</div>
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map(d=>{ const t=dayTot(d); const isToday=toISO(d)===todayISO; return (
              <div key={toISO(d)} className={`rounded-lg border px-1 py-2 text-center ${isToday?"border-blue-300 bg-blue-50":"border-slate-100"}`}>
                <div className="text-[10px] text-slate-400">{DOW[d.getDay()]} {pad(d.getDate())}</div>
                <div className="text-sm font-semibold text-slate-700 mt-0.5">{t?fmtH(t/60):"·"}</div>
              </div>);})}
          </div>
        </div>
      </div>
    </div>
  );
}
