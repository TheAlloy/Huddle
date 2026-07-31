import React, { useState, useMemo, useRef, useCallback } from "react";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import {
  MS, MONTHS, DOW, pad, toISO, parseISO, startOfDay, addDays, addMonths, startOfMonth, endOfMonth, startOfWeekMon, isWeekday,
  NAVY, AVATAR_BG, LEAVE_TYPES, initials, fmtH, money, pfList, projectsByClient, leaveDayFraction, holidayYearOf, fmtDayOrdinal, dRange, workdaysBetween,
  PeoplePicker, mapData, makeHandlers,
} from "../studio/core.jsx";
import { Table2, ChevronLeft, ChevronRight, Calendar, Users, Building2, Plane, Clock, Plus, X, Pencil, Trash2 } from "lucide-react";

function SummaryView(ctx) {
  const { data, clientById, projectById, delTimeLogs, moveTimeLogs, setTimeLogTotal, addTimeLog, myMemberId, publicHolidays, addPublicHoliday, delPublicHoliday, patchMember, phaseLogged, peopleFilter, setPeople, teamList } = ctx;
  const [addFor,setAddFor]=useState(null);
  const [aProj,setAProj]=useState(""),[aPhase,setAPhase]=useState("");
  const [aH,setAH]=useState(1),[aM,setAM]=useState(0),[aDate,setADate]=useState("");
  const [mode,setMode]=useState("logged");
  const [period,setPeriod]=useState("week");
  const [anchor,setAnchor]=useState(()=>startOfDay(new Date()));
  const [cFrom,setCFrom]=useState(toISO(startOfDay(new Date())));
  const [cTo,setCTo]=useState(toISO(startOfDay(new Date())));
  const [cf,setCf]=useState("all");
  const [layout,setLayout]=useState("calendar");
  const [cEdit,setCEdit]=useState(null);
  const [cPh,setCPh]=useState("");
  const [calGhost,setCalGhost]=useState(null);
  const calBoardRef=useRef(null);
  const [edit,setEdit]=useState(null);
  const [eH,setEH]=useState(0),[eM,setEM]=useState(0),[ePhase,setEPhase]=useState("");
  const [showContrib,setShowContrib]=useState(false);
  const [aEdit,setAEdit]=useState(null),[aVal,setAVal]=useState(0);
  const [newPH,setNewPH]=useState("");

  let rs,re;
  if(period==="day"){ rs=startOfDay(anchor); re=startOfDay(anchor); }
  else if(period==="week"){ rs=startOfWeekMon(anchor); re=addDays(rs,6); }
  else if(period==="month"){ rs=startOfMonth(anchor); re=endOfMonth(anchor); }
  else { let a=parseISO(cFrom), b=parseISO(cTo); if(b<a){const t=a;a=b;b=t;} rs=a; re=b; }
  const workdays=workdaysBetween(rs,re);
  const budgetPhases=[];
  {
    const active=new Set();
    for(const a of data.assignments){ if(a.kind!=="work"||!a.projectId||!a.phaseId) continue; if(parseISO(a.end)<rs||parseISO(a.start)>re) continue; active.add(a.projectId+"|"+a.phaseId); }
    for(const l of (data.timeLogs||[])){ if(!l.projectId||!l.phaseId) continue; const d=parseISO(l.date); if(d<rs||d>re) continue; active.add(l.projectId+"|"+l.phaseId); }
    for(const pr of data.projects){
      if(cf!=="all" && pr.clientId!==cf) continue;
      const cl=clientById(pr.clientId);
      for(const ph of (pr.phases||[])){
        if(!(ph.hours>0) || !active.has(pr.id+"|"+ph.id)) continue;
        const loggedH=((phaseLogged||{})[pr.id+"|"+ph.id]||0)/60;
        budgetPhases.push({pr,cl,ph,loggedH,over:loggedH-ph.hours});
      }
    }
    budgetPhases.sort((a,b)=>(b.over-a.over)||String(a.pr.index).localeCompare(String(b.pr.index)));
  }
  const visible = pfList(data.members, peopleFilter);
  const individual = visible.length===1;
  const shift=(dir)=>{
    setEdit(null);
    if(period==="day") setAnchor(a=>addDays(a,dir));
    else if(period==="week") setAnchor(a=>addDays(a,dir*7));
    else if(period==="month") setAnchor(a=>addMonths(a,dir));
    else { const a=parseISO(cFrom),b=parseISO(cTo); const len=Math.round((startOfDay(b)-startOfDay(a))/MS)+1; setCFrom(toISO(addDays(a,dir*len))); setCTo(toISO(addDays(b,dir*len))); }
  };
  const goToday=()=>{ setEdit(null); if(period==="custom") setPeriod("day"); setAnchor(startOfDay(new Date())); };
  const pickPreset=(val)=>{ if(period==="custom") setAnchor(rs); setPeriod(val); setEdit(null); };
  const enterCustom=(from,to)=>{ setCFrom(from); setCTo(to); setPeriod("custom"); setEdit(null); };
  const phDays=new Set((publicHolidays||[]).map(h=>h.day));
  const perPerson = visible.map(m=>{
    const logged={}, ids={}, dates={}; let loggedMins=0;
    for(const l of (data.timeLogs||[])){
      if(l.memberId!==m.id) continue; const d=parseISO(l.date); if(d<rs||d>re) continue;
      if(cf!=="all"){ if(l.taskId) continue; const pr=projectById(l.projectId); if(!pr||pr.clientId!==cf) continue; }
      const key=l.taskId?("T|"+l.taskId):((l.projectId||"")+"|"+(l.phaseId||""));
      logged[key]=(logged[key]||0)+l.minutes; loggedMins+=l.minutes;
      (ids[key]=ids[key]||[]).push(l.id);
      if(!dates[key]||l.date<dates[key]) dates[key]=l.date;
    }
    const rows=Object.keys(logged).map(key=>{ if(key.startsWith("T|")){ const tid=key.slice(2); const t=(data.internalTasks||[]).find(x=>x.id===tid); return {key,task:true,tid,title:t?t.title:"(deleted task)",mins:logged[key],ids:ids[key],date:dates[key]}; } const [pid,phid]=key.split("|");const pr=projectById(pid);const cl=pr&&clientById(pr.clientId);const phase=pr&&phid?(pr.phases||[]).find(p=>p.id===phid):null;return {key,pid,phid,pr,cl,phase,mins:logged[key],ids:ids[key],date:dates[key]};}).sort((a,b)=>b.mins-a.mins);
    let holMins=0;
    if(cf==="all"){ const dailyH=m.daily||8;
      for(const a of data.assignments){ if(a.memberId!==m.id||a.kind!=="leave"||a.leaveType!=="vacation") continue; const s=parseISO(a.start),e=parseISO(a.end); const cs=new Date(Math.max(s.getTime(),rs.getTime())),ce=new Date(Math.min(e.getTime(),re.getTime())); for(let d=new Date(cs);d<=ce;d=addDays(d,1)){ if(isWeekday(d)&&!phDays.has(toISO(d))) holMins+=leaveDayFraction(toISO(d),a)*dailyH*60; } }
      holMins=Math.round(holMins);
      if(holMins>0) rows.unshift({key:"__leave__",leave:true,mins:holMins});
    }
    loggedMins+=holMins;
    return {m,rows,loggedMins,capacity:(m.daily||8)*workdays};
  });
  const grandLogged=perPerson.reduce((s,p)=>s+p.loggedMins,0);
  const grandCap=perPerson.reduce((s,p)=>s+p.capacity,0);
  const beginEdit=(mid,r)=>{ setEdit({mid,key:r.key}); setEH(Math.floor(r.mins/60)); setEM(r.mins%60); setEPhase(r.phid||""); };
  const saveEdit=(m,r)=>{ const mins=Math.max(0,Number(eH||0)*60+Number(eM||0)); setTimeLogTotal({ids:r.ids,minutes:mins,memberId:m.id,projectId:r.task?null:(r.pid||null),phaseId:r.task?null:(ePhase||null),taskId:r.task?r.tid:null,date:r.date||toISO(rs)}); setEdit(null); };
  const todayInRange=()=>{ const t=startOfDay(new Date()); return (t>=rs&&t<=re)?toISO(t):toISO(rs); };
  const openAdd=(mid)=>{ setEdit(null); setAddFor(mid); setAProj(""); setAPhase(""); setAH(1); setAM(0); setADate(todayInRange()); };
  const submitAdd=(mid)=>{ const mins=Math.max(0,Number(aH||0)*60+Number(aM||0)); if(!aProj||mins<=0){ setAddFor(null); return; } addTimeLog({memberId:mid,projectId:aProj,phaseId:aPhase||null,date:aDate||todayInRange(),minutes:mins}); setAddFor(null); };
  const aProjObj=data.projects.find(p=>p.id===aProj);
  const periodBtn=(val,label)=>(<button key={val} onClick={()=>pickPreset(val)} className={`text-xs px-2.5 h-7 rounded-md border ${period===val?"bg-slate-800 text-white border-slate-800":"border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>);
  const rangeLabel = period==="day" ? fmtDayOrdinal(rs) : `${pad(rs.getDate())} ${MONTHS[rs.getMonth()]} – ${pad(re.getDate())} ${MONTHS[re.getMonth()]} ${re.getFullYear()} · ${workdays} working day${workdays===1?"":"s"}`;
  const todayD=startOfDay(new Date());
  const [hs,he]=holidayYearOf(todayD);
  const phSet=new Set((publicHolidays||[]).map(h=>h.day));
  const holidayRows = data.members.map(m=>{
    const allowance=m.holidayAllowance??30; let used=0, next=null;
    for(const a of data.assignments){
      if(a.memberId!==m.id || a.kind!=="leave" || a.leaveType!=="vacation") continue;
      const s=parseISO(a.start), e=parseISO(a.end);
      const cs=new Date(Math.max(s.getTime(),hs.getTime())), ce=new Date(Math.min(e.getTime(),he.getTime()));
      for(let d=new Date(cs); d<=ce; d=addDays(d,1)){ if(isWeekday(d) && !phSet.has(toISO(d))) used+=leaveDayFraction(toISO(d),a); }
      if(e>=todayD && (!next || s<parseISO(next.start))) next=a;
    }
    used=Math.round(used*100)/100;
    return {m,allowance,used,remaining:Math.round((allowance-used)*100)/100,next};
  });

  return (
    <div className="border border-slate-200 rounded-xl bg-white p-4 m-3">
      <div className="flex flex-wrap items-center gap-2 mb-3 text-slate-600">
        <Table2 size={16}/>
        {mode==="logged" ? <>
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
            <button onClick={()=>shift(-1)} className="px-2 py-1 hover:bg-slate-50"><ChevronLeft size={15}/></button>
            <button onClick={goToday} className="px-2.5 py-1 text-sm hover:bg-slate-50 border-x border-slate-200">Today</button>
            <button onClick={()=>shift(1)} className="px-2 py-1 hover:bg-slate-50"><ChevronRight size={15}/></button>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-500">
            <Calendar size={14}/>
            <input type="date" value={toISO(rs)} onChange={e=>e.target.value&&enterCustom(e.target.value, period==="custom"?cTo:toISO(re))} className="text-sm outline-none bg-transparent"/>
            <span className="text-slate-300">–</span>
            <input type="date" value={toISO(re)} onChange={e=>e.target.value&&enterCustom(period==="custom"?cFrom:toISO(rs), e.target.value)} className="text-sm outline-none bg-transparent"/>
          </div>
          <div className="flex gap-1">{periodBtn("day","Day")}{periodBtn("week","Week")}{periodBtn("month","Month")}</div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            <button onClick={()=>setLayout("calendar")} className={`px-2.5 h-8 ${layout==="calendar"?"bg-slate-800 text-white":"text-slate-600 hover:bg-slate-50"}`}>Calendar</button>
            <button onClick={()=>setLayout("cards")} className={`px-2.5 h-8 border-l border-slate-200 ${layout==="cards"?"bg-slate-800 text-white":"text-slate-600 hover:bg-slate-50"}`}>List</button>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border-2 border-blue-300 bg-blue-50 pl-2 pr-1 h-8">
            <Users size={15} className="text-blue-600"/><span className="text-xs font-semibold text-blue-700">Person</span>
            <PeoplePicker members={data.members} teams={teamList} value={peopleFilter} onChange={(v)=>{setPeople(v);setEdit(null);}} me={myMemberId}/>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 h-8"><Building2 size={14} className="text-slate-400"/>
            <select value={cf} onChange={e=>setCf(e.target.value)} className="text-sm outline-none bg-transparent"><option value="all">All clients</option>{data.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </div>
        </> : <span className="text-sm font-medium text-slate-700">Holiday year · {pad(hs.getDate())} {MONTHS[hs.getMonth()]} {hs.getFullYear()} – {pad(he.getDate())} {MONTHS[he.getMonth()]} {he.getFullYear()}</span>}
        <button onClick={()=>setMode(mode==="holiday"?"logged":"holiday")} className={`ml-auto flex items-center gap-1.5 text-sm px-3 h-8 rounded-lg border ${mode==="holiday"?"bg-orange-500 text-white border-orange-500":"border-slate-200 text-slate-600 hover:bg-slate-50"}`}><Plane size={15}/> {mode==="holiday"?"Back to hours":"Holiday"}</button>
      </div>
      {mode==="logged" ? <>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm font-medium text-slate-700">{rangeLabel}</p>
          <span className="text-xs text-slate-500">Logged: <span className="font-semibold text-slate-700">{fmtH(grandLogged/60)}h</span> <span className="text-slate-400">/ {fmtH(grandCap)}h</span></span>
        </div>
        {layout==="calendar" ? (()=>{
          const days=[]; for(let d=new Date(rs); d<=re && days.length<62; d=addDays(d,1)) days.push(new Date(d));
          const isMonth=period==="month";
          const bubblesFor=(mid,dayISO)=>{ const groups={}; (data.timeLogs||[]).forEach(l=>{ if(l.memberId!==mid||l.date!==dayISO) return; if(cf!=="all"){ const pr=projectById(l.projectId); if(l.taskId || !pr || pr.clientId!==cf) return; } const key=l.taskId?("T|"+l.taskId):((l.projectId||"none")+"|"+(l.phaseId||"")); if(!groups[key]) groups[key]={key,ids:[],mins:0,projectId:l.projectId,phaseId:l.phaseId,taskId:l.taskId}; groups[key].ids.push(l.id); groups[key].mins+=l.minutes; }); return Object.values(groups); };
          const bub=(g)=>{ if(g.taskId){ const t=(data.internalTasks||[]).find(x=>x.id===g.taskId); return {label:"Task · "+(t?t.title:"task"),color:NAVY}; } const pr=projectById(g.projectId); const cl=pr&&clientById(pr.clientId); const ph=pr&&g.phaseId&&(pr.phases||[]).find(p=>p.id===g.phaseId); return {label:(pr?pr.index:"—")+(ph?" · "+ph.name:""),color:cl?cl.color:"#64748b"}; };
          const dayAt=(x,y)=>{ const root=calBoardRef.current; if(!root) return null; const cells=root.querySelectorAll("[data-day]"); for(const el of cells){ const r=el.getBoundingClientRect(); if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom) return {day:el.getAttribute("data-day"),mid:el.getAttribute("data-mid")}; } return null; };
          const startCalDrag=(e,g,m,dayISO)=>{ if(e.button&&e.button!==0) return; const {label,color}=bub(g); const d={moved:false,sx:e.clientX,sy:e.clientY};
            const move=(ev)=>{ if(!d.moved){ if(Math.hypot(ev.clientX-d.sx,ev.clientY-d.sy)<5) return; d.moved=true; document.body.style.userSelect="none"; } ev.preventDefault(); setCalGhost({label,color,x:ev.clientX,y:ev.clientY}); };
            const up=(ev)=>{ document.removeEventListener("pointermove",move); document.removeEventListener("pointerup",up); document.body.style.userSelect=""; setCalGhost(null);
              if(d.moved){ const t=dayAt(ev.clientX,ev.clientY); if(t && t.mid===m.id && t.day!==dayISO) moveTimeLogs(g.ids,t.day); }
              else { setCEdit({mid:m.id,day:dayISO,key:g.key}); setEH(Math.floor(g.mins/60)); setEM(g.mins%60); setCPh(g.phaseId||""); } };
            document.addEventListener("pointermove",move); document.addEventListener("pointerup",up);
          };
          const dayCell=(m,d)=>{ const dayISO=toISO(d); const gs=bubblesFor(m.id,dayISO); const dayTot=gs.reduce((x,g)=>x+g.mins,0); const wknd=d.getDay()===0||d.getDay()===6;
            return (<div key={dayISO} data-day={dayISO} data-mid={m.id} className={`rounded-lg border ${wknd?"bg-slate-50 border-slate-100":"border-slate-200"}`}>
              <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">{DOW[d.getDay()]} {pad(d.getDate())}/{pad(d.getMonth()+1)}</span><span className="text-slate-400">{dayTot?fmtH(dayTot/60)+"h":""}</span></div>
              <div className="p-1.5 space-y-1" style={{minHeight:isMonth?32:54}}>
                {gs.length===0 && <div className="text-[10px] text-slate-300 text-center py-1">—</div>}
                {gs.map(g=>{ const {label,color}=bub(g); const editing=cEdit&&cEdit.mid===m.id&&cEdit.day===dayISO&&cEdit.key===g.key;
                  return (<div key={g.key} onPointerDown={editing?undefined:(e=>startCalDrag(e,g,m,dayISO))} className="rounded-md px-1.5 py-1 text-[11px] text-white cursor-grab active:cursor-grabbing" style={{background:color,touchAction:"none"}} title={label}>
                    {editing ? (<div className="flex flex-col gap-1" onClick={e=>e.stopPropagation()}>
                      {!g.taskId && (()=>{ const pr=projectById(g.projectId); return pr&&pr.phases&&pr.phases.length>0 ? <select value={cPh} onChange={e=>setCPh(e.target.value)} className="text-slate-800 rounded px-1 py-0.5 outline-none text-[10px]"><option value="">No phase</option>{pr.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select> : null; })()}
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" value={eH} onChange={e=>setEH(e.target.value)} className="w-8 text-slate-800 rounded px-1 py-0.5 outline-none"/><span>h</span>
                        <input type="number" min="0" max="59" value={eM} onChange={e=>setEM(e.target.value)} className="w-8 text-slate-800 rounded px-1 py-0.5 outline-none"/>
                        <button onClick={()=>{ const mins=Math.max(0,Number(eH||0)*60+Number(eM||0)); setTimeLogTotal({ids:g.ids,minutes:mins,memberId:m.id,projectId:g.taskId?null:g.projectId,phaseId:g.taskId?null:(cPh||null),taskId:g.taskId||null,date:dayISO}); setCEdit(null); }} className="ml-auto font-bold">✓</button>
                      </div>
                    </div>) : (<div className="flex items-center justify-between gap-1"><span className="truncate">{label}</span><span className="font-semibold shrink-0">{fmtH(g.mins/60)}</span></div>)}
                  </div>); })}
              </div>
            </div>); };
          let weeks=[]; if(isMonth){ let cur=null; days.forEach(d=>{ const wk=startOfWeekMon(d).getTime(); if(!cur||cur.wk!==wk){ cur={wk,days:[]}; weeks.push(cur);} cur.days.push(d); }); }
          const memTotalOf=(m)=>days.reduce((s,d)=>s+bubblesFor(m.id,toISO(d)).reduce((x,g)=>x+g.mins,0),0);
          const weekTotalOf=(m,wk)=>wk.days.reduce((s,d)=>s+bubblesFor(m.id,toISO(d)).reduce((x,g)=>x+g.mins,0),0);
          return (<div ref={calBoardRef} className="space-y-4">
            {visible.map(m=>(<div key={m.id} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200"><span className="w-6 h-6 rounded-full grid place-items-center text-white text-xs font-bold shrink-0" style={{background:AVATAR_BG[data.members.findIndex(x=>x.id===m.id)%AVATAR_BG.length]}}>{initials(m.name)}</span><span className="font-semibold text-sm text-slate-800">{m.name}</span><span className="ml-auto text-xs text-slate-500">Total <span className="font-semibold text-slate-700">{fmtH(memTotalOf(m)/60)}h</span></span></div>
              {isMonth
                ? <div className="overflow-x-auto p-2"><div style={{display:"grid",gap:8,gridTemplateColumns:`repeat(${Math.max(1,weeks.length)}, minmax(150px, 1fr))`}}>
                    {weeks.map((wk,wi)=>(<div key={wi} className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-500 flex items-center justify-between px-1"><span>{pad(wk.days[0].getDate())}/{pad(wk.days[0].getMonth()+1)}–{pad(wk.days[wk.days.length-1].getDate())}/{pad(wk.days[wk.days.length-1].getMonth()+1)}</span><span className="text-slate-400">{fmtH(weekTotalOf(m,wk)/60)}h</span></div>
                      {wk.days.map(d=>dayCell(m,d))}
                    </div>))}
                  </div></div>
                : <div className="overflow-x-auto p-2"><div style={{display:"grid",gap:8,gridTemplateColumns:`repeat(${Math.max(1,days.length)}, minmax(120px, 1fr))`}}>
                    {days.map(d=>dayCell(m,d))}
                  </div></div>}
            </div>))}
            {visible.length===0 && <div className="py-10 text-center text-slate-400 text-sm">No people selected.</div>}
            {calGhost && <div className="fixed z-50 pointer-events-none rounded-md text-white text-[11px] px-1.5 py-1 shadow-lg" style={{left:calGhost.x,top:calGhost.y,transform:"translate(-30%,-50%) rotate(-3deg)",background:calGhost.color,maxWidth:160,whiteSpace:"nowrap",overflow:"hidden"}}>{calGhost.label}</div>}
          </div>); })() : <div className="grid gap-4" style={{gridTemplateColumns: individual?"1fr":"repeat(auto-fill,minmax(360px,1fr))"}}>
          {perPerson.map(({m,rows,loggedMins,capacity})=>(
            <div key={m.id} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                <div className="font-semibold text-sm text-slate-800">{m.name}</div>
                <div className="text-xs text-slate-700 font-medium">{fmtH(loggedMins/60)}h <span className="text-slate-400 font-normal">/ {fmtH(capacity)}h</span></div>
              </div>
              {rows.length===0
                ? <div className="px-3 py-4 text-xs text-slate-400">Nothing logged in this period.</div>
                : <table className="w-full text-sm"><thead><tr className="text-xs text-slate-400 text-left"><th className="font-medium px-3 py-1.5">Client · Project</th><th className="font-medium px-2 py-1.5">Phase</th><th className="font-medium px-3 py-1.5 text-right">Logged</th>{ctx.canEdit&&<th className="w-16"></th>}</tr></thead>
                    <tbody>{rows.map(r=>{const editing=edit&&edit.mid===m.id&&edit.key===r.key;return (<tr key={r.key} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{r.leave
                        ? <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{background:LEAVE_TYPES.vacation.color}}/><span className="text-slate-700">Holiday / time off</span></span>
                        : r.task
                        ? <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{background:NAVY}}/><span className="text-slate-700">Task · {r.title}</span></span>
                        : <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{background:r.cl?r.cl.color:"#94a3b8"}}/><span className="text-slate-700">{r.cl?r.cl.name+" · ":""}{r.pr?r.pr.index:"Unassigned"} {r.pr?r.pr.name:""}</span></span>}</td>
                      <td className="px-2 py-1.5 text-slate-500">{r.leave||r.task?"—":(r.phase?r.phase.name:"—")}</td>
                      {editing
                        ? <td className="px-3 py-1.5" colSpan={2}><div className="flex items-center justify-end gap-1 flex-wrap">
                            {!r.leave && !r.task && r.pr?.phases?.length>0 && <select value={ePhase} onChange={e=>setEPhase(e.target.value)} className="text-sm rounded border border-slate-200 px-1.5 py-1 outline-none"><option value="">No phase</option>{r.pr.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
                            <input type="number" min="0" value={eH} onChange={e=>setEH(e.target.value)} className="w-11 text-sm rounded border border-slate-200 px-1.5 py-1 outline-none"/><span className="text-xs text-slate-400">h</span>
                            <input type="number" min="0" max="59" value={eM} onChange={e=>setEM(e.target.value)} className="w-11 text-sm rounded border border-slate-200 px-1.5 py-1 outline-none"/><span className="text-xs text-slate-400">m</span>
                            <button onClick={()=>saveEdit(m,r)} className="text-xs font-semibold text-white bg-blue-600 px-2 py-1 rounded">Save</button>
                            <button onClick={()=>setEdit(null)} className="text-slate-400 hover:text-slate-700"><X size={15}/></button>
                          </div></td>
                        : <><td className="px-3 py-1.5 text-right font-medium text-slate-700">{fmtH(r.mins/60)}h</td>
                           {ctx.canEdit&&<td className="px-2 py-1.5">{!r.leave && <div className="flex items-center gap-1.5 justify-end"><button onClick={()=>beginEdit(m.id,r)} className="text-slate-300 hover:text-blue-600" title="Edit total"><Pencil size={14}/></button><button onClick={()=>{ if(confirm("Remove this logged time for the period?")) delTimeLogs(r.ids); }} className="text-slate-300 hover:text-red-500" title="Delete"><Trash2 size={14}/></button></div>}</td>}</>}
                      </tr>);})}</tbody></table>}
              <div className="px-3 py-2 border-t border-slate-100">
                {addFor===m.id ? (
                  <div className="space-y-2">
                    <select value={aProj} onChange={e=>{setAProj(e.target.value);setAPhase("");}} className="w-full text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none">
                      <option value="">Choose project…</option>
                      {projectsByClient(data.projects,data.clients).map(g=>(<optgroup key={g.client?g.client.id:"none"} label={g.client?g.client.name:"No client"}>{g.projects.map(p=><option key={p.id} value={p.id}>{p.index} — {p.name}</option>)}</optgroup>))}
                    </select>
                    {aProjObj?.phases?.length>0 && <select value={aPhase} onChange={e=>setAPhase(e.target.value)} className="w-full text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"><option value="">No phase</option>{aProjObj.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
                    <div className="flex items-center gap-2">
                      <input type="date" value={aDate} onChange={e=>setADate(e.target.value)} className="flex-1 min-w-0 text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"/>
                      <input type="number" min="0" value={aH} onChange={e=>setAH(e.target.value)} className="w-12 text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"/><span className="text-xs text-slate-400">h</span>
                      <input type="number" min="0" max="59" value={aM} onChange={e=>setAM(e.target.value)} className="w-12 text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"/><span className="text-xs text-slate-400">m</span>
                      <button onClick={()=>submitAdd(m.id)} className="shrink-0 text-sm font-semibold text-white bg-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-700">Add</button>
                      <button onClick={()=>setAddFor(null)} className="shrink-0 text-slate-400 hover:text-slate-700"><X size={16}/></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={()=>openAdd(m.id)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600"><Plus size={14}/> Add hours</button>
                )}
              </div>
            </div>
          ))}
          {visible.length===0 && <div className="py-10 text-center text-slate-400 text-sm">No people yet.</div>}
        </div>}
        {budgetPhases.length>0 && <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 mb-2 text-sm font-medium text-slate-600"><Clock size={15}/> Phase hours — budget vs logged <span className="text-xs font-normal text-slate-400">(phases active in this period · totals are for the whole phase, all people)</span>{ctx.canSeeCost && <button onClick={()=>setShowContrib(v=>!v)} className="ml-auto text-xs font-semibold text-blue-600 hover:text-blue-700">{showContrib?"Hide breakdown":"Show who's contributing"}</button>}</div>
          <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))"}}>
            {budgetPhases.map(({pr,cl,ph,loggedH,over})=>{ const frac=Math.min(1,loggedH/ph.hours); const isOver=over>0.05; const key=pr.id+ph.id; const isOpen=showContrib&&ctx.canSeeCost;
              const contrib=isOpen?Object.entries((data.timeLogs||[]).filter(l=>l.projectId===pr.id&&(l.phaseId||"")===ph.id).reduce((m,l)=>{ m[l.memberId]=(m[l.memberId]||0)+l.minutes; return m; },{})).map(([mid,mins])=>{ const mm=data.members.find(x=>x.id===mid); return {m:mm,mins,cost:(mm&&Number.isFinite(mm.hourlyRate))?(mins/60)*mm.hourlyRate:null}; }).sort((a,b)=>b.mins-a.mins):[];
              const totalCost=contrib.reduce((s,c)=>s+(c.cost||0),0);
              const fee=Number(ph.fee)>0?ph.fee:null;
              return (<div key={key} className="border border-slate-200 rounded-lg px-3 py-2" onClick={()=>ctx.canSeeCost&&setShowContrib(v=>!v)} style={{cursor:ctx.canSeeCost?"pointer":"default"}}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-sm text-slate-700 truncate">{ctx.canSeeCost && <ChevronRight size={12} className="inline mr-1 text-slate-400" style={{transform:isOpen?"rotate(90deg)":"none"}}/>}<span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{background:cl?cl.color:"#94a3b8"}}/>{pr.index} · {ph.name}</div>
                  <div className="text-xs font-medium shrink-0" style={{color:isOver?"#eb5757":"#475569"}}>{fmtH(loggedH)}h / {ph.hours}h</div>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{width:`${frac*100}%`,background:isOver?"#eb5757":"#27ae60"}}/></div>
                <div className="mt-1 text-xs" style={{color:isOver?"#eb5757":"#94a3b8"}}>{isOver?`${fmtH(over)}h over budget`:`${fmtH(ph.hours-loggedH)}h remaining`}</div>
                {isOpen && (fee!=null || totalCost>0) && <div className="mt-1 text-xs text-slate-500 flex flex-wrap gap-x-3">
                  {fee!=null && <span>Billed <b className="text-slate-700">{money(fee)}</b></span>}
                  {totalCost>0 && <span>Cost of hours <b className="text-slate-700">{money(totalCost)}</b>{fee!=null && <b style={{color:totalCost>fee?"#eb5757":"#27ae60"}}> · {totalCost>fee?"over":"under"} by {money(Math.abs(fee-totalCost))}</b>}</span>}
                </div>}
                {isOpen && <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                  {contrib.length===0 && <div className="text-xs text-slate-400">No time logged to this phase yet.</div>}
                  {contrib.map(({m,mins,cost})=>(<div key={m?m.id:"?"} className="flex items-center gap-2 text-xs"><span className="w-2 h-2 rounded-full shrink-0" style={{background:AVATAR_BG[data.members.findIndex(x=>x.id===(m&&m.id))%AVATAR_BG.length]||"#94a3b8"}}/><span className="text-slate-600 truncate flex-1">{m?m.name:"Unknown"}</span><span className="font-medium text-slate-700 w-12 text-right">{fmtH(mins/60)}h</span>{cost!=null?<span className="text-slate-500 w-16 text-right">{money(cost)}</span>:<span className="text-slate-300 w-16 text-right">—</span>}</div>))}
                </div>}
              </div>);})}
          </div>
        </div>}
      </> : <>
        <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))"}}>
          {holidayRows.map(({m,allowance,used,remaining,next})=>{ const ns=next&&parseISO(next.start), ne=next&&parseISO(next.end); const onNow=next&&ns<=todayD&&ne>=todayD;
            return (
            <div key={m.id} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                <div className="font-semibold text-sm text-slate-800">{m.name}</div>
                <div className="text-xs">
                  {aEdit===m.id
                    ? <span className="inline-flex items-center gap-1"><input type="number" min="0" value={aVal} onChange={e=>setAVal(e.target.value)} className="w-14 rounded border border-slate-200 px-1.5 py-0.5"/><button onClick={()=>{ patchMember(m.id,{holidayAllowance:Number(aVal)||0}); setAEdit(null); }} className="text-white bg-blue-600 px-1.5 py-0.5 rounded">Save</button></span>
                    : <button onClick={()=>{ setAEdit(m.id); setAVal(allowance); }} className="text-slate-400 hover:text-blue-600" title="Edit allowance">{allowance} days/yr <Pencil size={11} className="inline -mt-0.5"/></button>}
                </div>
              </div>
              <div className="px-3 py-3">
                <div className="flex items-end gap-2">
                  <div className="text-2xl font-bold text-slate-800" style={{fontVariantNumeric:"tabular-nums"}}>{remaining}</div>
                  <div className="text-xs text-slate-400 mb-1">days left · {used} taken of {allowance}</div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{width:`${Math.min(100,allowance?used/allowance*100:0)}%`,background:remaining<0?"#eb5757":"#f2994a"}}/></div>
                <div className="mt-2 text-xs text-slate-500">{next ? <>Next: <span className="font-medium text-slate-700">{onNow?"on holiday now · ":""}{dRange(ns,ne)}{(next.startTime||next.endTime)?" · part-day":""}</span></> : <span className="text-slate-400">No upcoming holiday booked</span>}</div>
              </div>
            </div>);})}
        </div>
        <div className="mt-5 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2 mb-2 text-sm font-medium text-slate-600"><Calendar size={14}/> Public holidays <span className="text-xs font-normal text-slate-400">(these days don't count against anyone's allowance)</span></div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(publicHolidays||[]).length===0 && <span className="text-xs text-slate-400">None set yet.</span>}
            {(publicHolidays||[]).map(h=>{const d=parseISO(h.day);return (
              <span key={h.id} className="inline-flex items-center gap-1.5 text-xs bg-slate-100 text-slate-600 rounded-md pl-2 pr-1 py-1">{pad(d.getDate())} {MONTHS[d.getMonth()]} {d.getFullYear()}<button onClick={()=>delPublicHoliday(h.id)} className="text-slate-400 hover:text-red-500"><X size={13}/></button></span>);})}
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={newPH} onChange={e=>setNewPH(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"/>
            <button onClick={()=>{ if(newPH){ addPublicHoliday(newPH,""); setNewPH(""); } }} className="text-sm bg-slate-700 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800">Add public holiday</button>
          </div>
        </div>
      </>}
    </div>
  );
}

export default function Summary({ org, me, data: cadData, reload }){
  const [peopleFilter,setPeopleFilter]=useState("all");
  const data=useMemo(()=>mapData(cadData),[cadData]);
  const H=useMemo(()=>makeHandlers(org,reload,cadData),[org,cadData]); // eslint-disable-line
  const clientById=useCallback((id)=>data.clients.find(c=>c.id===id),[data.clients]);
  const projectById=useCallback((id)=>data.projects.find(p=>p.id===id),[data.projects]);
  const teamList=useMemo(()=>[...new Set(data.members.flatMap(m=>m.teams||[]))].sort(),[data.members]);
  const phaseLogged=useMemo(()=>{ const map={}; data.timeLogs.forEach(l=>{ if(l.projectId){ const k=l.projectId+"|"+(l.phaseId||""); map[k]=(map[k]||0)+l.minutes; } }); return map; },[data.timeLogs]);
  if(!can(me,"summary.view")) return <NoAccess what="summaries" />;
  const canEditAny = can(me,"summary.edit");
  const setPeople=(v)=>setPeopleFilter(v);
  const ctx={ data, clientById, projectById, phaseLogged, myMemberId:me.id, teamList, peopleFilter, setPeople, publicHolidays:data.publicHolidays,
    canSeeCost: can(me,"billing.view"), canEdit: canEditAny,
    delTimeLogs:canEditAny?H.delTimeLogs:(()=>{}), moveTimeLogs:canEditAny?H.moveTimeLogs:(()=>{}), setTimeLogTotal:canEditAny?H.setTimeLogTotal:(()=>{}), addTimeLog:canEditAny?H.addTimeLog:(()=>{}),
    patchMember: can(me,"team.manage")?H.patchMember:(()=>{}), addPublicHoliday:can(me,"team.manage")?H.addPublicHoliday:(()=>{}), delPublicHoliday:can(me,"team.manage")?H.delPublicHoliday:(()=>{}) };
  return <div className="h-full overflow-y-auto bg-slate-50/40"><SummaryView {...ctx} /></div>;
}
