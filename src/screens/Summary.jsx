import React, { useState, useMemo, useRef, useCallback } from "react";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { MS, MONTHS, DOW, pad, toISO, parseISO, startOfDay, addDays, addMonths, startOfMonth, endOfMonth, startOfWeekMon, isWeekday, NAVY, AVATAR_BG, LEAVE_TYPES, initials, fmtH, money, pfList, projectsByClient, leaveDayFraction, holidayYearOf, fmtDayOrdinal, dRange, workdaysBetween, PeoplePicker, mapData, makeHandlers } from "../studio/core.jsx";
import { Table2, ChevronLeft, ChevronRight, Calendar, Users, Building2, Plane, Clock, Plus, X, Pencil, Trash2 } from "lucide-react";
import { useConfirm } from "../components/confirm.tsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

function SummaryView(ctx) {
  const confirm = useConfirm();
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
  const [rangeOpen,setRangeOpen]=useState(false);
  const [aDateOpen,setADateOpen]=useState(false);
  const [phOpen,setPhOpen]=useState(false);

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
    <div className="border border-border rounded-xl bg-card p-4 m-3">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Table2 size={16} className="text-muted-foreground"/>
        {mode==="logged" ? <>
          <ButtonGroup>
            <Button variant="outline" size="icon" onClick={()=>shift(-1)} aria-label="Previous"><ChevronLeft/></Button>
            <Button variant="outline" onClick={goToday}>Today</Button>
            <Button variant="outline" size="icon" onClick={()=>shift(1)} aria-label="Next"><ChevronRight/></Button>
          </ButtonGroup>
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger render={<Button variant="outline" className="tabular-nums" />}><Calendar/> {toISO(rs)} – {toISO(re)}</PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarPicker mode="range" selected={{from:rs,to:re}} defaultMonth={rs}
                onSelect={(r)=>{ if(r?.from&&r?.to){ enterCustom(toISO(r.from), toISO(r.to)); if(r.from.getTime()!==r.to.getTime()) setRangeOpen(false); } }} />
            </PopoverContent>
          </Popover>
          <ToggleGroup variant="outline" spacing={0} value={[period]} onValueChange={(v)=>{ if(v[0]) pickPreset(v[0]); }}>
            <ToggleGroupItem value="day">Day</ToggleGroupItem>
            <ToggleGroupItem value="week">Week</ToggleGroupItem>
            <ToggleGroupItem value="month">Month</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup variant="outline" spacing={0} value={[layout]} onValueChange={(v)=>{ if(v[0]) setLayout(v[0]); }}>
            <ToggleGroupItem value="calendar">Calendar</ToggleGroupItem>
            <ToggleGroupItem value="cards">List</ToggleGroupItem>
          </ToggleGroup>
          <PeoplePicker members={data.members} teams={teamList} value={peopleFilter} onChange={(v)=>{setPeople(v);setEdit(null);}} me={myMemberId}/>
          <Select value={cf} onValueChange={setCf} items={{all:"All clients",...Object.fromEntries(data.clients.map(c=>[c.id,c.name]))}}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="all">All clients</SelectItem>{data.clients.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
        </> : <span className="text-sm font-medium text-foreground">Holiday year · {pad(hs.getDate())} {MONTHS[hs.getMonth()]} {hs.getFullYear()} – {pad(he.getDate())} {MONTHS[he.getMonth()]} {he.getFullYear()}</span>}
        <Button variant={mode==="holiday"?"default":"outline"} className="ml-auto" onClick={()=>setMode(mode==="holiday"?"logged":"holiday")}><Plane data-icon="inline-start"/> {mode==="holiday"?"Back to hours":"Holiday"}</Button>
      </div>
      {mode==="logged" ? <>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm font-medium text-foreground">{rangeLabel}</p>
          <span className="text-xs text-muted-foreground">Logged: <span className="font-medium text-foreground">{fmtH(grandLogged/60)}h</span> <span className="text-muted-foreground">/ {fmtH(grandCap)}h</span></span>
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
            return (<div key={dayISO} data-day={dayISO} data-mid={m.id} className={`rounded-lg border ${wknd?"bg-muted/50 border-border/60":"border-border"}`}>
              <div className="px-2 py-1 border-b border-border/60 flex items-center justify-between text-xs"><span className="font-medium text-muted-foreground">{DOW[d.getDay()]} {pad(d.getDate())}/{pad(d.getMonth()+1)}</span><span className="text-muted-foreground">{dayTot?fmtH(dayTot/60)+"h":""}</span></div>
              <div className="p-1.5 space-y-1" style={{minHeight:isMonth?32:54}}>
                {gs.length===0 && <div className="text-[10px] text-muted-foreground text-center py-1">—</div>}
                {gs.map(g=>{ const {label,color}=bub(g); const editing=cEdit&&cEdit.mid===m.id&&cEdit.day===dayISO&&cEdit.key===g.key;
                  return (<div key={g.key} onPointerDown={editing?undefined:(e=>startCalDrag(e,g,m,dayISO))} className="rounded-md px-1.5 py-1 text-[11px] text-white cursor-grab active:cursor-grabbing" style={{background:color,touchAction:"none"}} title={label}>
                    {editing ? (<div className="flex flex-col gap-1" onClick={e=>e.stopPropagation()}>
                      {!g.taskId && (()=>{ const pr=projectById(g.projectId); return pr&&pr.phases&&pr.phases.length>0 ? (
                        <Select value={cPh} onValueChange={setCPh} items={{"":"No phase",...Object.fromEntries(pr.phases.map(p=>[p.id,p.name]))}}>
                          <SelectTrigger size="sm" className="w-full bg-background text-foreground"><SelectValue/></SelectTrigger>
                          <SelectContent><SelectGroup><SelectItem value="">No phase</SelectItem>{pr.phases.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectGroup></SelectContent>
                        </Select>
                      ) : null; })()}
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" value={eH} onChange={e=>setEH(e.target.value)} className="w-8 text-foreground rounded px-1 py-0.5 outline-none"/><span>h</span>
                        <input type="number" min="0" max="59" value={eM} onChange={e=>setEM(e.target.value)} className="w-8 text-foreground rounded px-1 py-0.5 outline-none"/>
                        <button onClick={()=>{ const mins=Math.max(0,Number(eH||0)*60+Number(eM||0)); setTimeLogTotal({ids:g.ids,minutes:mins,memberId:m.id,projectId:g.taskId?null:g.projectId,phaseId:g.taskId?null:(cPh||null),taskId:g.taskId||null,date:dayISO}); setCEdit(null); }} className="ml-auto font-medium">✓</button>
                      </div>
                    </div>) : (<div className="flex items-center justify-between gap-1"><span className="truncate">{label}</span><span className="font-medium shrink-0">{fmtH(g.mins/60)}</span></div>)}
                  </div>); })}
              </div>
            </div>); };
          let weeks=[]; if(isMonth){ let cur=null; days.forEach(d=>{ const wk=startOfWeekMon(d).getTime(); if(!cur||cur.wk!==wk){ cur={wk,days:[]}; weeks.push(cur);} cur.days.push(d); }); }
          const memTotalOf=(m)=>days.reduce((s,d)=>s+bubblesFor(m.id,toISO(d)).reduce((x,g)=>x+g.mins,0),0);
          const weekTotalOf=(m,wk)=>wk.days.reduce((s,d)=>s+bubblesFor(m.id,toISO(d)).reduce((x,g)=>x+g.mins,0),0);
          return (<div ref={calBoardRef} className="space-y-4">
            {visible.map(m=>(<div key={m.id} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border"><Avatar size="sm"><AvatarFallback className="text-white" style={{background:AVATAR_BG[data.members.findIndex(x=>x.id===m.id)%AVATAR_BG.length]}}>{initials(m.name)}</AvatarFallback></Avatar><span className="font-medium text-sm text-foreground">{m.name}</span><span className="ml-auto text-xs text-muted-foreground">Total <span className="font-medium text-foreground">{fmtH(memTotalOf(m)/60)}h</span></span></div>
              {isMonth
                ? <div className="overflow-x-auto p-2"><div style={{display:"grid",gap:8,gridTemplateColumns:`repeat(${Math.max(1,weeks.length)}, minmax(150px, 1fr))`}}>
                    {weeks.map((wk,wi)=>(<div key={wi} className="space-y-1.5">
                      <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between px-1"><span>{pad(wk.days[0].getDate())}/{pad(wk.days[0].getMonth()+1)}–{pad(wk.days[wk.days.length-1].getDate())}/{pad(wk.days[wk.days.length-1].getMonth()+1)}</span><span className="text-muted-foreground">{fmtH(weekTotalOf(m,wk)/60)}h</span></div>
                      {wk.days.map(d=>dayCell(m,d))}
                    </div>))}
                  </div></div>
                : <div className="overflow-x-auto p-2"><div style={{display:"grid",gap:8,gridTemplateColumns:`repeat(${Math.max(1,days.length)}, minmax(120px, 1fr))`}}>
                    {days.map(d=>dayCell(m,d))}
                  </div></div>}
            </div>))}
            {visible.length===0 && <div className="py-10 text-center text-muted-foreground text-sm">No people selected.</div>}
            {calGhost && <div className="fixed z-50 pointer-events-none rounded-md text-white text-[11px] px-1.5 py-1 shadow-lg" style={{left:calGhost.x,top:calGhost.y,transform:"translate(-30%,-50%) rotate(-3deg)",background:calGhost.color,maxWidth:160,whiteSpace:"nowrap",overflow:"hidden"}}>{calGhost.label}</div>}
          </div>); })() : <div className="grid gap-4" style={{gridTemplateColumns: individual?"1fr":"repeat(auto-fill,minmax(360px,1fr))"}}>
          {perPerson.map(({m,rows,loggedMins,capacity})=>(
            <div key={m.id} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
                <div className="font-medium text-sm text-foreground">{m.name}</div>
                <div className="text-xs text-foreground font-medium">{fmtH(loggedMins/60)}h <span className="text-muted-foreground font-normal">/ {fmtH(capacity)}h</span></div>
              </div>
              {rows.length===0
                ? <div className="px-3 py-4 text-xs text-muted-foreground">Nothing logged in this period.</div>
                : <table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground text-left"><th className="font-medium px-3 py-1.5">Client · Project</th><th className="font-medium px-2 py-1.5">Phase</th><th className="font-medium px-3 py-1.5 text-right">Logged</th>{ctx.canEdit&&<th className="w-16"></th>}</tr></thead>
                    <tbody>{rows.map(r=>{const editing=edit&&edit.mid===m.id&&edit.key===r.key;return (<tr key={r.key} className="border-t border-border/60">
                      <td className="px-3 py-1.5">{r.leave
                        ? <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{background:LEAVE_TYPES.vacation.color}}/><span className="text-foreground">Holiday / time off</span></span>
                        : r.task
                        ? <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{background:NAVY}}/><span className="text-foreground">Task · {r.title}</span></span>
                        : <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{background:r.cl?r.cl.color:"#94a3b8"}}/><span className="text-foreground">{r.cl?r.cl.name+" · ":""}{r.pr?r.pr.index:"Unassigned"} {r.pr?r.pr.name:""}</span></span>}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.leave||r.task?"—":(r.phase?r.phase.name:"—")}</td>
                      {editing
                        ? <td className="px-3 py-1.5" colSpan={2}><div className="flex items-center justify-end gap-1 flex-wrap">
                            {!r.leave && !r.task && r.pr?.phases?.length>0 && (
                              <Select value={ePhase} onValueChange={setEPhase} items={{"":"No phase",...Object.fromEntries(r.pr.phases.map(p=>[p.id,p.name]))}}>
                                <SelectTrigger className="w-36"><SelectValue/></SelectTrigger>
                                <SelectContent><SelectGroup><SelectItem value="">No phase</SelectItem>{r.pr.phases.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectGroup></SelectContent>
                              </Select>)}
                            <InputGroup className="w-20"><InputGroupInput type="number" min="0" value={eH} onChange={e=>setEH(e.target.value)}/><InputGroupAddon align="inline-end"><InputGroupText>h</InputGroupText></InputGroupAddon></InputGroup>
                            <InputGroup className="w-20"><InputGroupInput type="number" min="0" max="59" value={eM} onChange={e=>setEM(e.target.value)}/><InputGroupAddon align="inline-end"><InputGroupText>m</InputGroupText></InputGroupAddon></InputGroup>
                            <Button onClick={()=>saveEdit(m,r)}>Save</Button>
                            <Button variant="ghost" size="icon" title="Cancel" onClick={()=>setEdit(null)}><X/></Button>
                          </div></td>
                        : <><td className="px-3 py-1.5 text-right font-medium text-foreground">{fmtH(r.mins/60)}h</td>
                           {ctx.canEdit&&<td className="px-2 py-1.5">{!r.leave && <div className="flex items-center justify-end"><Button variant="ghost" size="icon-sm" title="Edit total" onClick={()=>beginEdit(m.id,r)}><Pencil/></Button><Button variant="ghost" size="icon-sm" title="Delete" onClick={async ()=>{ if(await confirm({title:"Remove this logged time for the period?", confirmLabel:"Remove", destructive:true})) delTimeLogs(r.ids); }}><Trash2/></Button></div>}</td>}</>}
                      </tr>);})}</tbody></table>}
              <div className="px-3 py-2 border-t border-border/60">
                {addFor===m.id ? (
                  <div className="flex flex-col gap-2">
                    <Select value={aProj} onValueChange={(v)=>{setAProj(v);setAPhase("");}} items={{"":"Choose project…",...Object.fromEntries(data.projects.map(p=>[p.id,`${p.index} — ${p.name}`]))}}>
                      <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectGroup><SelectItem value="">Choose project…</SelectItem></SelectGroup>
                        {projectsByClient(data.projects,data.clients).map(g=>(
                          <SelectGroup key={g.client?g.client.id:"none"}>
                            <SelectLabel>{g.client?g.client.name:"No client"}</SelectLabel>
                            {g.projects.map(p=><SelectItem key={p.id} value={p.id}>{p.index} — {p.name}</SelectItem>)}
                          </SelectGroup>))}
                      </SelectContent>
                    </Select>
                    {aProjObj?.phases?.length>0 && (
                      <Select value={aPhase} onValueChange={setAPhase} items={{"":"No phase",...Object.fromEntries(aProjObj.phases.map(p=>[p.id,p.name]))}}>
                        <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
                        <SelectContent><SelectGroup><SelectItem value="">No phase</SelectItem>{aProjObj.phases.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectGroup></SelectContent>
                      </Select>)}
                    <div className="flex items-center gap-2">
                      <Popover open={aDateOpen} onOpenChange={setADateOpen}>
                        <PopoverTrigger render={<Button variant="outline" className="flex-1 min-w-0 tabular-nums" />}><Calendar/> {aDate||"Pick a date"}</PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarPicker mode="single" selected={aDate?parseISO(aDate):undefined} defaultMonth={aDate?parseISO(aDate):rs} onSelect={(d)=>{ if(d){ setADate(toISO(d)); setADateOpen(false); } }} />
                        </PopoverContent>
                      </Popover>
                      <InputGroup className="w-20"><InputGroupInput type="number" min="0" value={aH} onChange={e=>setAH(e.target.value)}/><InputGroupAddon align="inline-end"><InputGroupText>h</InputGroupText></InputGroupAddon></InputGroup>
                      <InputGroup className="w-20"><InputGroupInput type="number" min="0" max="59" value={aM} onChange={e=>setAM(e.target.value)}/><InputGroupAddon align="inline-end"><InputGroupText>m</InputGroupText></InputGroupAddon></InputGroup>
                      <Button className="shrink-0" onClick={()=>submitAdd(m.id)}>Add</Button>
                      <Button variant="ghost" size="icon" className="shrink-0" title="Cancel" onClick={()=>setAddFor(null)}><X/></Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={()=>openAdd(m.id)}><Plus data-icon="inline-start"/> Add hours</Button>
                )}
              </div>
            </div>
          ))}
          {visible.length===0 && <div className="py-10 text-center text-muted-foreground text-sm">No people yet.</div>}
        </div>}
        {budgetPhases.length>0 && <div className="mt-6 border-t border-border/60 pt-4">
          <div className="flex items-center gap-2 mb-2 text-sm font-medium"><Clock size={15} className="text-muted-foreground"/> Phase hours — budget vs logged <span className="text-xs font-normal text-muted-foreground">(phases active in this period · totals are for the whole phase, all people)</span>{ctx.canSeeCost && <Button variant="ghost" size="sm" className="ml-auto" onClick={()=>setShowContrib(v=>!v)}>{showContrib?"Hide breakdown":"Show who's contributing"}</Button>}</div>
          <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))"}}>
            {budgetPhases.map(({pr,cl,ph,loggedH,over})=>{ const frac=Math.min(1,loggedH/ph.hours); const isOver=over>0.05; const key=pr.id+ph.id; const isOpen=showContrib&&ctx.canSeeCost;
              const contrib=isOpen?Object.entries((data.timeLogs||[]).filter(l=>l.projectId===pr.id&&(l.phaseId||"")===ph.id).reduce((m,l)=>{ m[l.memberId]=(m[l.memberId]||0)+l.minutes; return m; },{})).map(([mid,mins])=>{ const mm=data.members.find(x=>x.id===mid); return {m:mm,mins,cost:(mm&&Number.isFinite(mm.hourlyRate))?(mins/60)*mm.hourlyRate:null}; }).sort((a,b)=>b.mins-a.mins):[];
              const totalCost=contrib.reduce((s,c)=>s+(c.cost||0),0);
              const fee=Number(ph.fee)>0?ph.fee:null;
              return (<div key={key} className="border border-border rounded-lg px-3 py-2" onClick={()=>ctx.canSeeCost&&setShowContrib(v=>!v)} style={{cursor:ctx.canSeeCost?"pointer":"default"}}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-sm text-foreground truncate">{ctx.canSeeCost && <ChevronRight size={12} className="inline mr-1 text-muted-foreground" style={{transform:isOpen?"rotate(90deg)":"none"}}/>}<span className="inline-block w-2.5 h-2.5 rounded-xs mr-1.5 align-middle" style={{background:cl?cl.color:"#94a3b8"}}/>{pr.index} · {ph.name}</div>
                  <div className={`text-xs font-medium shrink-0 ${isOver?"text-destructive":"text-muted-foreground"}`}>{fmtH(loggedH)}h / {ph.hours}h</div>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${isOver?"bg-destructive":"bg-primary"}`} style={{width:`${frac*100}%`}}/></div>
                <div className={`mt-1 text-xs ${isOver?"text-destructive":"text-muted-foreground"}`}>{isOver?`${fmtH(over)}h over budget`:`${fmtH(ph.hours-loggedH)}h remaining`}</div>
                {isOpen && (fee!=null || totalCost>0) && <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3">
                  {fee!=null && <span>Billed <b className="text-foreground">{money(fee)}</b></span>}
                  {totalCost>0 && <span>Cost of hours <b className="text-foreground">{money(totalCost)}</b>{fee!=null && <b style={{color:totalCost>fee?"#eb5757":"#27ae60"}}> · {totalCost>fee?"over":"under"} by {money(Math.abs(fee-totalCost))}</b>}</span>}
                </div>}
                {isOpen && <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                  {contrib.length===0 && <div className="text-xs text-muted-foreground">No time logged to this phase yet.</div>}
                  {contrib.map(({m,mins,cost})=>(<div key={m?m.id:"?"} className="flex items-center gap-2 text-xs"><span className="w-2 h-2 rounded-full shrink-0" style={{background:AVATAR_BG[data.members.findIndex(x=>x.id===(m&&m.id))%AVATAR_BG.length]||"#94a3b8"}}/><span className="text-muted-foreground truncate flex-1">{m?m.name:"Unknown"}</span><span className="font-medium text-foreground w-12 text-right">{fmtH(mins/60)}h</span>{cost!=null?<span className="text-muted-foreground w-16 text-right">{money(cost)}</span>:<span className="text-muted-foreground w-16 text-right">—</span>}</div>))}
                </div>}
              </div>);})}
          </div>
        </div>}
      </> : <>
        <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))"}}>
          {holidayRows.map(({m,allowance,used,remaining,next})=>{ const ns=next&&parseISO(next.start), ne=next&&parseISO(next.end); const onNow=next&&ns<=todayD&&ne>=todayD;
            return (
            <div key={m.id} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
                <div className="font-medium text-sm text-foreground">{m.name}</div>
                <div className="text-xs">
                  {aEdit===m.id
                    ? <span className="inline-flex items-center gap-1"><Input type="number" min="0" value={aVal} onChange={e=>setAVal(e.target.value)} className="w-16"/><Button onClick={()=>{ patchMember(m.id,{holidayAllowance:Number(aVal)||0}); setAEdit(null); }}>Save</Button></span>
                    : <Button variant="ghost" size="sm" title="Edit allowance" onClick={()=>{ setAEdit(m.id); setAVal(allowance); }}>{allowance} days/yr <Pencil/></Button>}
                </div>
              </div>
              <div className="px-3 py-3">
                <div className="flex items-end gap-2">
                  <div className="text-2xl font-medium text-foreground" style={{fontVariantNumeric:"tabular-nums"}}>{remaining}</div>
                  <div className="text-xs text-muted-foreground mb-1">days left · {used} taken of {allowance}</div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{width:`${Math.min(100,allowance?used/allowance*100:0)}%`,background:remaining<0?"#eb5757":"#f2994a"}}/></div>
                <div className="mt-2 text-xs text-muted-foreground">{next ? <>Next: <span className="font-medium text-foreground">{onNow?"on holiday now · ":""}{dRange(ns,ne)}{(next.startTime||next.endTime)?" · part-day":""}</span></> : <span className="text-muted-foreground">No upcoming holiday booked</span>}</div>
              </div>
            </div>);})}
        </div>
        <div className="mt-5 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2 mb-2 text-sm font-medium"><Calendar size={14} className="text-muted-foreground"/> Public holidays <span className="text-xs font-normal text-muted-foreground">(these days don't count against anyone's allowance)</span></div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(publicHolidays||[]).length===0 && <span className="text-xs text-muted-foreground">None set yet.</span>}
            {(publicHolidays||[]).map(h=>{const d=parseISO(h.day);return (
              <Badge key={h.id} variant="secondary">{pad(d.getDate())} {MONTHS[d.getMonth()]} {d.getFullYear()}<Button variant="ghost" size="icon-xs" title="Remove" onClick={()=>delPublicHoliday(h.id)}><X/></Button></Badge>);})}
          </div>
          <div className="flex items-center gap-2">
            <Popover open={phOpen} onOpenChange={setPhOpen}>
              <PopoverTrigger render={<Button variant="outline" />}><Calendar/> {newPH||"Pick a date"}</PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker mode="single" selected={newPH?parseISO(newPH):undefined} onSelect={(d)=>{ if(d){ setNewPH(toISO(d)); setPhOpen(false); } }} />
              </PopoverContent>
            </Popover>
            <Button onClick={()=>{ if(newPH){ addPublicHoliday(newPH,""); setNewPH(""); } }}>Add public holiday</Button>
          </div>
        </div>
      </>}
    </div>
  );
}

export default function Summary({ org, me, data: cadData, reload, peopleFilter: pfProp, onPeopleFilter }){
  const [pfLocal,setPfLocal]=useState("all");
  const peopleFilter = pfProp!==undefined ? pfProp : pfLocal;
  const setPeopleFilter = onPeopleFilter || setPfLocal;
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
  return <ScrollArea className="h-full bg-muted/30"><SummaryView {...ctx} /></ScrollArea>;
}
