import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import { sb } from "../lib/supabase.js";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { phaseRanges, PeoplePicker, AVATAR_BG, initials } from "../studio/core.jsx";
import { InviteModal } from "./Team.jsx";
import { ProjectModal } from "./Projects.jsx";
import { useConfirm } from "../components/confirm.tsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { FieldGroup, Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, X, ChevronLeft, ChevronRight, Search, Trash2, AlertTriangle,
  Pencil, ZoomIn, ZoomOut, Plane, Building2, Calendar,
  Sparkles, Upload, FileText, ArrowLeft,
} from "lucide-react";

/* ============================ helpers (from studio tool) ========================= */
const MS = 86400000;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WORK_START = 9, WORK_END = 17, WORKDAY_H = WORK_END - WORK_START;
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y,m,d] = String(s).split("-").map(Number); return new Date(y, m-1, d); };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const addMonths = (d,n) => new Date(d.getFullYear(), d.getMonth()+n, 1);
const startOfWeekMon = (d) => { const x = new Date(d); const day = (x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; };
const isWeekday = (d) => { const g = d.getDay(); return g>=1 && g<=5; };
const nextWeekday = (d) => { let x = new Date(d); while(!isWeekday(x)) x = addDays(x,1); return x; };
const addWorkingDays = (start,n) => { let d = new Date(start), c = 0; while(true){ if(isWeekday(d)) c++; if(c>=n) return new Date(d); d = addDays(d,1); } };
const workdaysBetween = (s,e) => { let c = 0; for(let d = new Date(s); d<=e; d = addDays(d,1)) if(isWeekday(d)) c++; return c; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const NAVY = "#1f2d4e";
const CLIENT_COLORS = ["#2f80ed","#9b51e0","#16a0a0","#eb5757","#27ae60","#f2994a","#2d9cdb","#6b7a99","#e84393","#8e44ad"];
const LEAVE_TYPES = { vacation:{label:"Holiday",color:"#f2994a"}, parental:{label:"Parental Leave",color:"#e67e22"}, sick:{label:"Sick Leave",color:"#c0563f"}, holiday:{label:"Public Holiday",color:"#7f8fa6"} };
const pfIncludes = (pf,id) => pf==="all" || (Array.isArray(pf)?pf.includes(id):pf===id);
const cfIncludes = (cf,id) => cf==="all" || (Array.isArray(cf)?(cf.length===0||cf.includes(id)):cf===id);
const pfList = (members,pf) => pf==="all"?members:members.filter(m=>pfIncludes(pf,m.id));
function projectsByClient(projects, clients){
  const byId={}; clients.forEach(c=>{byId[c.id]={client:c,projects:[]};});
  const noClient={client:null,projects:[]};
  projects.forEach(p=>{ (byId[p.clientId]||noClient).projects.push(p); });
  const groups=clients.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>byId[c.id]).filter(g=>g.projects.length);
  if(noClient.projects.length) groups.push(noClient);
  return groups;
}


/* ============================ board components (from studio tool) ================ */
function PersonCell({ m, idx, width, onEdit, onAssign, canEdit }) {
  return (
    <div className="shrink-0 border-r border-border px-3 py-3 flex items-center gap-2.5 group bg-card" style={{ width, position:"sticky", left:0, zIndex:15 }}>
      <Avatar><AvatarFallback className="text-white" style={{background:AVATAR_BG[idx%AVATAR_BG.length]}}>{initials(m.name)}</AvatarFallback></Avatar>
      <div className="min-w-0 flex-1"><div className="text-sm font-medium text-foreground truncate">{m.name}</div><div className="text-xs text-muted-foreground truncate">{m.role}</div></div>
      {canEdit && <div className="flex flex-col gap-1 shrink-0">
        <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 transition grid place-items-center w-6 h-6 rounded-md text-muted-foreground/70 hover:bg-muted hover:text-primary-foreground" title={"Edit "+m.name}><Pencil size={13}/></button>
        <button onClick={onAssign} className="opacity-0 group-hover:opacity-100 transition grid place-items-center w-6 h-6 rounded-md text-muted-foreground/70 hover:bg-muted hover:text-primary-foreground" title={"Assign work to "+m.name}><Plus size={15}/></button>
      </div>}
    </div>
  );
}
function barLabel(a, ctx) {
  if (a.kind==="leave") return { top:(LEAVE_TYPES[a.leaveType]||{}).label||"Leave", sub:"" };
  if (a.kind==="internal"){ const t=(ctx.data.internalTasks||[]).find(x=>x.id===a.taskId); return { top:"Task", sub:t?t.title:"task" }; }
  const pr=ctx.projectById(a.projectId); const cl=pr&&ctx.clientById(pr.clientId);
  const phase=pr&&a.phaseId?(pr.phases||[]).find(p=>p.id===a.phaseId):null;
  return { top:`${cl?cl.name+" - ":""}${pr?pr.name:""}`, sub:phase?phase.name:"" };
}
function Bar({ a, ctx, baseLeft, baseWidth, top, height, dayW, onCommit, onOpen, fill=null, ratio=null, note="", laneIndex=null, laneStep=47 }) {
  const ref=useRef(null);
  const canReorder = laneIndex!==null && laneIndex!==undefined;
  const [drag,setDrag]=useState(null);
  const begin=(mode)=>(e)=>{ if(!ctx.canEdit) return; e.preventDefault(); e.stopPropagation(); try{ref.current.setPointerCapture(e.pointerId);}catch(_){} setDrag({mode,startX:e.clientX,startY:e.clientY,dxSnap:0,dLane:0,moved:false}); };
  const move=(e)=>{ if(!drag) return;
    const raw=e.clientX-drag.startX, rawY=e.clientY-drag.startY;
    const dxSnap=Math.round(raw/dayW)*dayW;
    const dLane=(drag.mode==="move"&&canReorder&&Math.abs(rawY)>laneStep*0.55) ? Math.round(rawY/laneStep) : 0;
    const moved=drag.moved||Math.abs(raw)>4||Math.abs(rawY)>4;
    if(dxSnap!==drag.dxSnap||dLane!==drag.dLane||moved!==drag.moved) setDrag({...drag,dxSnap,dLane,moved});
  };
  const up=()=>{ if(!drag) return; const {mode,dxSnap,dLane,moved}=drag; setDrag(null);
    if(!moved){ onOpen(); return; }
    const dd=Math.round(dxSnap/dayW);
    const s=parseISO(a.start), en=parseISO(a.end);
    if(mode==="move"){
      const nl=canReorder?Math.max(0,laneIndex+dLane):undefined;
      if(dd===0 && (nl===undefined||nl===laneIndex)) return;
      onCommit(toISO(addDays(s,dd)),toISO(addDays(en,dd)),nl);
    }
    else if(mode==="l"){ if(dd===0) return; const ns=addDays(s,dd); onCommit(toISO(ns>en?en:ns),a.end); }
    else if(mode==="r"){ if(dd===0) return; const ne=addDays(en,dd); onCommit(a.start,toISO(ne<s?s:ne)); }
  };
  let left=baseLeft, width=baseWidth, topPos=top;
  if(drag&&drag.moved){ if(drag.mode==="move"){ left=baseLeft+drag.dxSnap; topPos=top+drag.dLane*laneStep; } else if(drag.mode==="l"){ left=baseLeft+drag.dxSnap; width=baseWidth-drag.dxSnap; } else width=baseWidth+drag.dxSnap; }
  width=Math.max(dayW*0.6,width); left=Math.max(0,left); topPos=Math.max(0,topPos);
  const lab=barLabel(a,ctx); const tip=[lab.top,lab.sub].filter(Boolean).join(" — ")+(note?`  (${note})`:"");
  const active=drag&&drag.moved;
  const stick=`translateX(clamp(0px, calc(var(--sl, 0px) - ${Math.round(left)}px), ${Math.max(0,Math.round(width-76))}px))`;
  return (
    <div ref={ref} onPointerMove={move} onPointerUp={up} onPointerCancel={up} title={tip}
      className="absolute rounded-md text-white overflow-hidden select-none group"
      style={{left,top:topPos,width,height,background:ctx.colorOf(a),touchAction:"none",zIndex:drag?30:1,boxShadow:active?"0 8px 20px rgba(0,0,0,.28)":"0 1px 2px rgba(0,0,0,.12)",cursor:ctx.canEdit?(drag?(drag.mode==="move"?"grabbing":"ew-resize"):"grab"):"pointer",transition:drag?"none":"box-shadow .15s"}}>
      {fill!=null && <><div className="absolute inset-y-0 left-0 pointer-events-none" style={{width:`${fill*100}%`,background:"rgba(0,0,0,0.22)"}}/>
        <div className="absolute inset-y-0 pointer-events-none" style={{left:`${fill*100}%`,right:0,background:"linear-gradient(to right, rgba(255,255,255,0.22), rgba(255,255,255,0.06))"}}/>
        {fill>0 && fill<1 && <div className="absolute pointer-events-none" style={{left:`${Math.min(100,fill*100)}%`,bottom:0,height:"50%",width:2,transform:"translateX(-1px)",zIndex:6,background:"repeating-linear-gradient(to bottom, #fff 0 3px, transparent 3px 7px)",WebkitMaskImage:"linear-gradient(to top, #000 30%, transparent 100%)",maskImage:"linear-gradient(to top, #000 30%, transparent 100%)"}}/>}
        {fill>0 && fill<1 && <div className="absolute pointer-events-none" style={{left:`${Math.min(100,fill*100)}%`,bottom:"10%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"3.5px solid transparent",borderRight:"3.5px solid transparent",borderBottom:"5px solid #ffffff",zIndex:7}}/>}
        {ratio>1 && <div className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{height:3,background:"#eb5757"}}/>}
        {ratio>1 && <span className="absolute grid place-items-center pointer-events-none" style={{top:3,right:3,width:16,height:16,borderRadius:9999,background:"#eb5757",zIndex:8}}><AlertTriangle size={11} color="#fff"/></span>}</>}
      <div onPointerDown={begin("l")} className="absolute left-0 top-0 bottom-0" style={{width:9,zIndex:5,cursor:ctx.canEdit?"ew-resize":"default"}}/>
      <div onPointerDown={begin("r")} className="absolute right-0 top-0 bottom-0" style={{width:9,zIndex:5,cursor:ctx.canEdit?"ew-resize":"default"}}/>
      <div onPointerDown={begin("move")} onClick={()=>{ if(!ctx.canEdit) onOpen(); }} className="absolute inset-0" style={{padding:"4px 11px",zIndex:2}}>
        <div style={{transform:stick,willChange:"transform"}}>
          <div className="font-bold leading-tight truncate" style={{fontSize:11}}>{lab.top}</div>
          {lab.sub && <div className="leading-tight truncate" style={{fontSize:10,opacity:.92}}>{lab.sub}</div>}
        </div>
      </div>
      {ctx.canEdit && <span className="absolute left-1 top-1/2 opacity-0 group-hover:opacity-80" style={{transform:"translateY(-50%)",width:3,height:"40%",background:"#fff",borderRadius:2,pointerEvents:"none",zIndex:6}}/>}
      {ctx.canEdit && <span className="absolute right-1 top-1/2 opacity-0 group-hover:opacity-80" style={{transform:"translateY(-50%)",width:3,height:"40%",background:"#fff",borderRadius:2,pointerEvents:"none",zIndex:6}}/>}
    </div>
  );
}
function TimelineBoard(ctx) {
  const { data, anchor, matches, setModal, moveAssign, peopleFilter, zoomT, holidayFilter, boardScroll, phaseLogged, canEdit } = ctx;
  const passHoliday=(a)=> holidayFilter==="only" ? a.kind==="leave" : holidayFilter==="hide" ? a.kind!=="leave" : true;
  const visibleMembers = pfList(data.members, peopleFilter);
  const single = visibleMembers.length===1;
  const SIDEBAR=232, LANE_H=single?64:42, LANE_GAP=single?9:5, ROW_PAD=single?16:8;
  const scroller=useRef(null);
  const todayStart=useMemo(()=>startOfDay(new Date()),[]);
  const adjustRef=useRef(0);
  const wantAnchor=useRef(true);
  const centerRef=useRef(todayStart);
  const didMount=useRef(false);
  const [vw,setVw]=useState(1280); const vwRef=useRef(0);
  const dayArea=Math.max(280, vw-SIDEBAR);
  const yearFit=Math.max(2, dayArea/372);
  const monthFit=dayArea/30;
  const z=Math.max(0,Math.min(1,zoomT==null?1:zoomT));
  const dayW=Math.round(yearFit*Math.pow(monthFit/yearFit, z)*10)/10;
  const computeInit=useCallback(()=>{
    let earliest=todayStart, latest=todayStart;
    for(const a of data.assignments){ const s=parseISO(a.start),e=parseISO(a.end); if(s<earliest)earliest=s; if(e>latest)latest=e; }
    const anchorStart=startOfWeekMon(addDays(anchor,-28));
    let start=startOfWeekMon(addDays(earliest,-14)); if(anchorStart<start) start=anchorStart;
    const futureHorizon=addDays(todayStart,365*2);
    let end = latest>futureHorizon? addDays(latest,90): futureHorizon;
    const anchorEnd=addDays(anchor,168); if(anchorEnd>end) end=anchorEnd;
    const totalDays=Math.max(168, Math.round((startOfDay(end)-start)/MS)+1);
    return {start,totalDays};
  },[anchor,data.assignments,todayStart]);
  const [win,setWin]=useState(computeInit);
  const conf={start:win.start, totalDays:win.totalDays, dayW};
  const days=useMemo(()=>Array.from({length:conf.totalDays},(_,i)=>addDays(conf.start,i)),[conf.start,conf.totalDays]);
  const totalW=conf.totalDays*dayW;
  const xOf=(d)=>((startOfDay(d)-conf.start)/MS)*dayW;
  const todayX=(todayStart>=conf.start && todayStart<=addDays(conf.start,conf.totalDays))?xOf(todayStart):null;
  const dateAtCenter=()=>{ const el=scroller.current; if(!el) return centerRef.current; const idx=Math.round((el.scrollLeft+(el.clientWidth-SIDEBAR)/2)/dayW); return addDays(conf.start,idx); };
  const latest=useRef({}); latest.current={anchor, start:conf.start, dayW};
  useEffect(()=>{
    const el=scroller.current; if(!el) return;
    const set=()=>{ const w=el.clientWidth; if(vwRef.current && Math.abs(w-vwRef.current)>1) centerRef.current=dateAtCenter(); vwRef.current=w; setVw(w); };
    set();
    if(typeof ResizeObserver!=="undefined"){ const ro=new ResizeObserver(set); ro.observe(el); return ()=>ro.disconnect(); }
    window.addEventListener("resize",set); return ()=>window.removeEventListener("resize",set);
  },[]); // eslint-disable-line
  useEffect(()=>{
    const el=scroller.current; if(!el) return;
    const go=()=>{ const {anchor,start,dayW}=latest.current; el.scrollLeft=Math.max(0, ((startOfDay(anchor)-start)/MS)*dayW-48); centerRef.current=dateAtCenter(); didMount.current=true; };
    const r=requestAnimationFrame(()=>requestAnimationFrame(go));
    return ()=>cancelAnimationFrame(r);
  },[]); // eslint-disable-line
  useLayoutEffect(()=>{ setWin(computeInit()); wantAnchor.current=true; },[anchor]); // eslint-disable-line
  useLayoutEffect(()=>{
    const el=scroller.current; if(!el) return;
    if(adjustRef.current){ el.scrollLeft+=adjustRef.current; adjustRef.current=0; }
    if(wantAnchor.current){ el.scrollLeft=Math.max(0, xOf(startOfDay(anchor))-48); wantAnchor.current=false; centerRef.current=dateAtCenter(); }
  },[win.start, win.totalDays]); // eslint-disable-line
  useLayoutEffect(()=>{
    const el=scroller.current; if(!el || !didMount.current) return;
    el.scrollLeft=Math.max(0, xOf(centerRef.current)-(el.clientWidth-SIDEBAR)/2);
  },[dayW]); // eslint-disable-line
  useEffect(()=>{
    const el=scroller.current; if(!el) return;
    const onWheel=(e)=>{ if(Math.abs(e.deltaY)>=Math.abs(e.deltaX)){ el.scrollLeft+=e.deltaY; e.preventDefault(); } };
    el.addEventListener("wheel",onWheel,{passive:false});
    return ()=>el.removeEventListener("wheel",onWheel);
  },[]);
  useEffect(()=>{ if(!boardScroll) return; boardScroll.current={ nudge:(dir)=>{ const el=scroller.current; if(el) el.scrollLeft += dir*Math.max(240,(el.clientWidth-SIDEBAR)*0.8); } }; return ()=>{ if(boardScroll) boardScroll.current=null; }; },[]); // eslint-disable-line
  const pan=useRef(null);
  const onPointerDown=(e)=>{ if(e.button!==0) return; if(e.target.closest&&e.target.closest("button,a,input,select,textarea")) return; const el=scroller.current; if(!el) return; pan.current={x:e.clientX,y:e.clientY,sl:el.scrollLeft,st:el.scrollTop}; try{el.setPointerCapture(e.pointerId);}catch(_){} };
  const onPointerMove=(e)=>{ if(!pan.current) return; const el=scroller.current; if(!el) return; el.scrollLeft=pan.current.sl-(e.clientX-pan.current.x); el.scrollTop=pan.current.st-(e.clientY-pan.current.y); };
  const endPan=(e)=>{ const el=scroller.current; if(pan.current&&el){ try{el.releasePointerCapture(e.pointerId);}catch(_){} } pan.current=null; };
  const onScroll=()=>{
    const el=scroller.current; if(!el) return;
    el.style.setProperty("--sl", el.scrollLeft+"px");
    centerRef.current=dateAtCenter();
    const EDGE=800, chunk=120;
    if(el.scrollLeft<EDGE){ adjustRef.current+=chunk*dayW; setWin(w=>({start:addDays(w.start,-chunk), totalDays:w.totalDays+chunk})); }
    else if(el.scrollLeft+el.clientWidth > totalW-EDGE){ setWin(w=>({...w, totalDays:w.totalDays+chunk})); }
  };
  const monthBands=[]; let i=0;
  while(i<days.length){ const d=days[i]; const m=d.getMonth(); let j=i; while(j<days.length && days[j].getMonth()===m) j++; monthBands.push({left:i*conf.dayW,width:(j-i)*conf.dayW,label:`${MONTHS_LONG[m]} ${d.getFullYear()}`}); i=j; }
  const rows=visibleMembers.map((m,idx)=>{
    const items=data.assignments.filter(a=>a.memberId===m.id && matches(a) && passHoliday(a)).sort((a,b)=>parseISO(a.start)-parseISO(b.start));
    const leave=items.filter(a=>a.kind==="leave"), work=items.filter(a=>a.kind!=="leave");
    const base=leave.length?1:0;
    const used=[];
    const fits=(i,s,e)=> !(used[i]||[]).some(iv=> s<=iv.e && e>=iv.s);
    const place=(a,desired)=>{ const s=parseISO(a.start),e=parseISO(a.end); let i=Math.max(0,desired||0); while(!fits(i,s,e)) i++; (used[i]=used[i]||[]).push({s,e}); return {a,lane:base+i,laneIndex:i}; };
    const keyOf=(a)=>{ if(a.projectId) return "p:"+a.projectId; const pr=ctx.projectById(a.projectId); return (pr&&pr.clientId)?"c:"+pr.clientId:null; };
    const clientOf=(a)=>{ const pr=ctx.projectById(a.projectId); return pr?pr.clientId:""; };
    const groupLane={}; // remember the lane a project/client first landed on, so siblings line up
    const pinned=work.filter(a=>Number.isFinite(a.lane)), auto=work.filter(a=>!Number.isFinite(a.lane));
    // group auto bars by client then project so related work clusters onto shared lanes
    auto.sort((a,b)=> String(clientOf(a)).localeCompare(String(clientOf(b))) || String(a.projectId||"").localeCompare(String(b.projectId||"")) || (parseISO(a.start)-parseISO(b.start)));
    const placedPinned=pinned.map(a=>{ const r=place(a,a.lane); const k=keyOf(a); if(k!=null && groupLane[k]==null) groupLane[k]=r.laneIndex; return r; });
    const placedAuto=auto.map(a=>{ const k=keyOf(a); const desired=(k!=null && groupLane[k]!=null)?groupLane[k]:0; const r=place(a,desired); if(k!=null && groupLane[k]==null) groupLane[k]=r.laneIndex; return r; });
    const placedWork=[...placedPinned,...placedAuto];
    const placed=[...leave.map(a=>({a,lane:0,laneIndex:null})), ...placedWork];
    const lanes=Math.max(1,base+used.length);
    return {m,idx,placed,lanes};
  });
  return (
    <div ref={scroller} onScroll={onScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPan} onPointerCancel={endPan}
      className="tl-scroll h-full border-x border-b border-border overflow-auto bg-card" style={{cursor:"grab"}}>
      <style>{`.tl-scroll::-webkit-scrollbar:horizontal{height:0}.tl-scroll::-webkit-scrollbar:vertical{width:10px}.tl-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:6px}`}</style>
      <div style={{width:SIDEBAR+totalW}}>
        <div className="flex border-b border-border/60">
          <div className="shrink-0 bg-card border-r border-border" style={{width:SIDEBAR,position:"sticky",left:0,zIndex:16}}></div>
          <div className="relative" style={{width:totalW,height:24}}>
            {monthBands.map((b,k)=><div key={k} className="absolute top-0 bottom-0 flex items-center px-2 text-xs font-semibold text-muted-foreground border-r border-border/60" style={{left:b.left,width:b.width}}>{b.label}</div>)}
          </div>
        </div>
        {dayW>=14 && <div className="flex border-b border-border">
          <div className="shrink-0 bg-card border-r border-border px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={{width:SIDEBAR,position:"sticky",left:0,zIndex:16}}>{single?visibleMembers[0].name:(peopleFilter==="all"?`Everyone · ${data.members.length}`:`Selected · ${visibleMembers.length}`)}</div>
          <div className="flex" style={{width:totalW}}>
            {days.map((d,k)=>{const wknd=!isWeekday(d);const mon=d.getDay()===1;return (
              <div key={k} className={`text-center border-r ${mon?"border-input":"border-border/60"} ${wknd?"bg-muted/50":""}`} style={{width:conf.dayW,paddingTop:4,paddingBottom:4}}>
                {dayW>=46
                  ? <><div className="text-xs font-semibold text-muted-foreground">{DOW[d.getDay()]}</div><div className="text-xs text-muted-foreground/70">{pad(d.getDate())}</div></>
                  : <div className="text-muted-foreground/70" style={{fontSize:9.5}}>{d.getDate()}</div>}
              </div>
            );})}
          </div>
        </div>}
        {rows.map(({m,idx,placed,lanes})=>{
          const rowH=ROW_PAD*2+lanes*LANE_H+(lanes-1)*LANE_GAP;
          return (
            <div key={m.id} className="flex" style={{borderBottom: single?"1px solid #e2e8f0":"2px solid #cbd5e1"}}>
              <PersonCell m={m} idx={idx} width={SIDEBAR} canEdit={canEdit} onEdit={()=>setModal({type:"member",payload:m})} onAssign={()=>setModal({type:"assign",payload:{memberId:m.id}})} />
              <div className="relative" style={{width:totalW,height:rowH}}>
                {days.map((d,k)=>{ if(dayW<14){ return d.getDate()===1 ? <div key={k} className="absolute top-0 bottom-0 border-r border-border" style={{left:k*conf.dayW}}/> : null; } const wknd=!isWeekday(d);const mon=d.getDay()===1;return <div key={k} className={`absolute top-0 bottom-0 border-r ${mon?"border-border":"border-border/60"} ${wknd?"bg-muted/50":""}`} style={{left:k*conf.dayW,width:conf.dayW}}/>;})}
                {todayX!==null && <div className="absolute top-0 bottom-0 z-10" style={{left:todayX+dayW/2-1,width:2,background:"#ef4444aa"}}/>}
                {placed.map(({a,lane,laneIndex})=>{
                  const s=parseISO(a.start), e=addDays(parseISO(a.end),1);
                  let left=xOf(s), right=xOf(e); if(right<=0||left>=totalW) return null;
                  left=Math.max(0,left); right=Math.min(totalW,right);
                  const w=Math.max(conf.dayW*0.6,right-left); const top=ROW_PAD+lane*(LANE_H+LANE_GAP);
                  let fill=null, ratio=null, note="";
                  if(a.kind==="work" && a.phaseId){ const pr=ctx.projectById(a.projectId); const ph=pr&&(pr.phases||[]).find(p=>p.id===a.phaseId); if(ph && ph.hours>0){ const loggedH=((phaseLogged||{})[a.projectId+"|"+a.phaseId]||0)/60; ratio=loggedH/ph.hours; fill=Math.max(0,Math.min(1,ratio)); note=`${Math.round(loggedH*10)/10}h / ${ph.hours}h`; } }
                  return (
                    <Bar key={a.id} a={a} ctx={ctx} baseLeft={left} baseWidth={w} top={top} height={LANE_H} dayW={conf.dayW} fill={fill} ratio={ratio} note={note}
                      laneIndex={laneIndex} laneStep={LANE_H+LANE_GAP}
                      onOpen={()=>setModal({type:"assign",payload:a})} onCommit={(ns,ne,nl)=>moveAssign(a,ns,ne,nl)} />
                  );
                })}
                {placed.length===0 && <div className="absolute text-xs text-muted-foreground/40" style={{left:10,top:ROW_PAD+4}}>No assignments</div>}
              </div>
            </div>
          );
        })}
        {data.members.length===0 && <div className="py-16 text-center text-muted-foreground/70"><p className="mb-3">No people yet — invite your team on the People page.</p></div>}
      </div>
    </div>
  );
}
/* Multi-select client filter — content-poured into the stock DropdownMenu,
   mirroring core.jsx's PeoplePicker. Value shape unchanged: "all" | id[]. */
function ClientPicker({ clients, value, onChange }){
  const allIds=clients.map(c=>c.id);
  const isAll=value==="all";
  const sel=new Set(isAll?allIds:(Array.isArray(value)?value:(value?[value]:[])));
  const commit=(s)=>{ if(s.size===0||s.size===allIds.length) onChange("all"); else onChange([...s]); };
  const toggle=(id)=>{ const s=new Set(sel); s.has(id)?s.delete(id):s.add(id); commit(s); };
  const summary=isAll?"All clients":(sel.size===1?((clients.find(c=>c.id===[...sel][0])||{}).name||"1 client"):`${sel.size} clients`);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}><Building2 data-icon="inline-start"/> {summary}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48 max-w-64">
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem checked={isAll} closeOnClick={false} onCheckedChange={()=>onChange("all")}>All clients</DropdownMenuCheckboxItem>
          {clients.length===0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No clients yet.</div>}
          {clients.map(c=>(
            <DropdownMenuCheckboxItem key={c.id} checked={sel.has(c.id)} closeOnClick={false} onCheckedChange={()=>toggle(c.id)}>
              <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{background:c.color}}/>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Screen-local composition: stock Popover + Calendar date picker (same pattern
// as Tracker's manual-log date). Value is an ISO date string.
function DatePicker({ value, onChange, className="w-full" }){
  const [open,setOpen]=useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className={`tabular-nums justify-start font-normal ${className}`} />}><Calendar/> {value||"Pick a date"}</PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarPicker mode="single" selected={value?parseISO(value):undefined} onSelect={(d)=>{ if(d){ onChange(toISO(d)); setOpen(false); } }} defaultMonth={value?parseISO(value):undefined} />
      </PopoverContent>
    </Popover>
  );
}

function AssignForm({ assignment, preset, members, projects, clients, anchor, onSave, onDelete, onClose, onInternalAssign, onInvite, onNewProject, tasks=[], teams=[] }){
  const [kind,setKind]=useState(assignment?.kind||"work");
  const [taskId,setTaskId]=useState(assignment?.taskId||"");
  const [taskTitle,setTaskTitle]=useState(""),[taskPri,setTaskPri]=useState("med"),[taskTeam,setTaskTeam]=useState("");
  const [memberId,setMemberId]=useState(assignment?.memberId||preset?.memberId||members[0]?.id||"");
  const [projectId,setProjectId]=useState(assignment?.projectId||projects[0]?.id||"");
  const proj=projects.find(p=>p.id===projectId); const client=proj&&clients.find(c=>c.id===proj.clientId);
  const [phaseId,setPhaseId]=useState(assignment?.phaseId||"");
  const [phaseHours,setPhaseHours]=useState("");
  useEffect(()=>{ const ph=proj?.phases?.find(p=>p.id===phaseId); setPhaseHours(ph&&ph.hours>0?ph.hours:""); },[projectId,phaseId]); // eslint-disable-line
  const [leaveType,setLeaveType]=useState(assignment?.leaveType||"vacation");
  const [start,setStart]=useState(assignment?.start||preset?.start||toISO(anchor));
  const [end,setEnd]=useState(assignment?.end||preset?.end||toISO(addDays(anchor,4)));
  const endFrom=(s,w)=>toISO(addWorkingDays(parseISO(s), Math.max(1,Math.round((Number(w)||0)*5))));
  const weeksFrom=(s,e)=> Math.max(0.2, Math.round(workdaysBetween(parseISO(s),parseISO(e))/5*100)/100);
  const [dur,setDur]=useState(()=>weeksFrom(assignment?.start||preset?.start||toISO(anchor), assignment?.end||preset?.end||toISO(addDays(anchor,4))));
  const onStartCh=(v)=>{ setStart(v); if(v) setEnd(endFrom(v,dur)); };
  const onDurCh=(v)=>{ setDur(v); if(start) setEnd(endFrom(start,v)); };
  const onEndCh=(v)=>{ setEnd(v); if(start&&v>=start) setDur(weeksFrom(start,v)); };
  const [partDay,setPartDay]=useState(!!(assignment?.startTime||assignment?.endTime));
  const [sTime,setSTime]=useState(assignment?.startTime||"09:00");
  const [eTime,setETime]=useState(assignment?.endTime||"13:00");
  // Validation messages keyed to the Field they render under. This replaced a run
  // of alert() calls, which fired one at a time and lost the message on dismiss —
  // see docs/foundations-plan.md, step 4.
  const [errs,setErrs]=useState({});
  const save=()=>{
    const e={};
    if(kind==="internal"){
      if(!memberId) e.memberId="Choose who this is for.";
      if(!start||!end||end<start) e.dates="Check the dates.";
      if(!assignment){
        if(taskId==="__new__"){ if(!taskTitle.trim()) e.taskTitle="Give the task a name."; }
        else if(!taskId) e.taskId="Pick a task, or create a new one.";
      }
      setErrs(e);
      if(Object.keys(e).length) return;
      if(assignment){ onSave({...assignment,memberId,start,end,kind:"internal"}); return; }
      if(taskId==="__new__"){ onInternalAssign&&onInternalAssign({newTask:{title:taskTitle.trim(),priority:taskPri,team:taskTeam||""},memberId,start,end}); return; }
      onInternalAssign&&onInternalAssign({taskId,memberId,start,end}); return;
    }
    if(!memberId||!start||!end) return;
    if(end<start){ setErrs({dates:"End date can't be before the start date."}); return; }
    setErrs({});
    const base={...(assignment||{}),memberId,start,end,value:0,mode:"hours_per_day",note:null,startTime:null,endTime:null};
    if(kind==="leave") onSave({...base,kind:"leave",leaveType,projectId:null,phaseId:null,startTime:partDay?sTime:null,endTime:partDay?eTime:null});
    else onSave({...base,kind:"work",projectId,phaseId:phaseId||null,leaveType:null}, phaseId?{projectId,phaseId,hours:phaseHours===""?null:Number(phaseHours)}:null);
  };
  {/* min-height pinned to the tallest tab so switching kinds doesn't resize the dialog */}
  return (<Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[92svh] overflow-y-auto"><DialogHeader><DialogTitle>{assignment?"Edit assignment":"Assign work"}</DialogTitle></DialogHeader><FieldGroup className={assignment?undefined:"min-h-[30rem]"}>
    {!assignment
      ? <Tabs value={kind} onValueChange={setKind}>
          <TabsList className="w-full">
            {[["work","Project work"],["leave","Time off"],["internal","Tasks"]].map(([v,l])=><TabsTrigger key={v} value={v} className="flex-1">{l}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      : <div><Badge variant="secondary">{kind==="leave"?"Time off":kind==="internal"?"Task":"Project work"}</Badge></div>}
    <Field data-invalid={(errs.memberId) ? true : undefined}><FieldLabel>{kind==="internal"?"Assign to":"Person"}</FieldLabel>
      <Select value={memberId} onValueChange={(v)=>{ if(v==="__invite__"){ onInvite&&onInvite(); return; } setMemberId(v); }}
        items={{...Object.fromEntries(members.map(m=>[m.id,m.name])),...(onInvite?{__invite__:"Invite someone…"}:{})}}>
        <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup>
          {members.map(m=><SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          {onInvite && <SelectItem value="__invite__"><Plus/> Invite someone…</SelectItem>}
        </SelectGroup></SelectContent>
      </Select>
    {(errs.memberId) ? <FieldError>{errs.memberId}</FieldError> : null}</Field>
    {kind==="work" ? (<>
      <Field><FieldLabel>Project</FieldLabel>
        <Select value={projectId} onValueChange={(v)=>{ if(v==="__new__"){ onNewProject&&onNewProject(); return; } setProjectId(v);setPhaseId(""); }}
          items={{...Object.fromEntries(projects.map(p=>[p.id,`${p.index} — ${p.name}`])),...(onNewProject?{__new__:"New project / client…"}:{})}}>
          <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
          <SelectContent>
            {projectsByClient(projects,clients).map(g=>(
              <SelectGroup key={g.client?g.client.id:"none"}>
                <SelectLabel>{g.client?g.client.name:"No client"}</SelectLabel>
                {g.projects.map(p=><SelectItem key={p.id} value={p.id}>{p.index} — {p.name}</SelectItem>)}
              </SelectGroup>
            ))}
            {onNewProject && <SelectGroup><SelectItem value="__new__"><Plus/> New project / client…</SelectItem></SelectGroup>}
          </SelectContent>
        </Select>
      </Field>
      {client && <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-xs" style={{background:client.color}}/>Client: <span className="font-medium text-foreground">{client.name} · {proj.index} {proj.name}</span></div>}
      {proj?.phases?.length>0 && <Field><FieldLabel>Phase</FieldLabel>
        <Select value={phaseId} onValueChange={setPhaseId} items={{"":"— none —",...Object.fromEntries(proj.phases.map(p=>[p.id,p.name]))}}>
          <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="">— none —</SelectItem>{proj.phases.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>}
      {phaseId && <Field><FieldLabel>Monitor designer hours for this phase (optional)</FieldLabel><Input type="number" min="0" value={phaseHours} onChange={e=>setPhaseHours(e.target.value)} placeholder="e.g. 20"/><FieldDescription>Sets the hours budget for this phase across the whole project — the bar fills up as time is logged. Leave blank for no monitoring.</FieldDescription></Field>}
    </>) : kind==="internal" ? (<>
      <Field data-invalid={(errs.taskId) ? true : undefined}><FieldLabel>Task</FieldLabel>
        <Select value={taskId} onValueChange={setTaskId}
          items={{"":"Choose a task…",...Object.fromEntries(tasks.filter(t=>t.status!=="done").map(t=>[t.id,t.title])),__new__:"New task…"}}>
          <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="">Choose a task…</SelectItem>
            {tasks.filter(t=>t.status!=="done").map(t=><SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
            <SelectItem value="__new__"><Plus/> New task…</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
      {(errs.taskId) ? <FieldError>{errs.taskId}</FieldError> : null}</Field>
      {taskId==="__new__" ? (<>
        <Field data-invalid={(errs.taskTitle) ? true : undefined}><FieldLabel>New task</FieldLabel><Input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="e.g. Improve our SEO"/>{(errs.taskTitle) ? <FieldError>{errs.taskTitle}</FieldError> : null}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field><FieldLabel>Importance</FieldLabel>
            <Select value={taskPri} onValueChange={setTaskPri} items={{high:"High",med:"Medium",low:"Low"}}>
              <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="high">High</SelectItem><SelectItem value="med">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field><FieldLabel>Team (optional)</FieldLabel>
            <Combobox items={teams} inputValue={taskTeam} onInputValueChange={setTaskTeam}>
              <ComboboxInput placeholder="optional" />
              <ComboboxContent>
                <ComboboxEmpty>No teams yet — type to create one.</ComboboxEmpty>
                <ComboboxList>{(item) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList>
              </ComboboxContent>
            </Combobox>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Creates the task on the Tasks board and puts it on this person's timeline.</p>
      </>) : <p className="text-xs text-muted-foreground">Puts this task on the person's timeline so it shows as one of today's projects and can be tracked.</p>}
    </>) : (
      <Field><FieldLabel>Type</FieldLabel>
        <Select value={leaveType} onValueChange={setLeaveType} items={Object.fromEntries(Object.entries(LEAVE_TYPES).map(([k,v])=>[k,v.label]))}>
          <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
          <SelectContent><SelectGroup>{Object.entries(LEAVE_TYPES).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
    )}
    <div>
      <div className="grid grid-cols-3 gap-3">
        <Field><FieldLabel>Start date</FieldLabel><DatePicker value={start} onChange={onStartCh}/></Field>
        <Field><FieldLabel>Duration (weeks)</FieldLabel><Input type="number" min="0.2" step="0.5" value={dur} onChange={e=>onDurCh(e.target.value)}/></Field>
        <Field data-invalid={(errs.dates) ? true : undefined}><FieldLabel>End date</FieldLabel><DatePicker value={end} onChange={onEndCh}/>{(errs.dates) ? <FieldError>{errs.dates}</FieldError> : null}</Field>
      </div>
      <p className="text-xs text-muted-foreground mt-2">Set a start + duration and the end fills in (1 week = 5 working days), or pick the end date directly.</p>
    </div>
    {kind==="leave" && <div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer"><Checkbox checked={partDay} onCheckedChange={(v)=>setPartDay(!!v)}/> Part-day (take only part of the first / last day)</label>
      {partDay && <div className="mt-3 grid grid-cols-2 gap-3">
        <Field><FieldLabel>First day starts</FieldLabel><Input type="time" value={sTime} onChange={e=>setSTime(e.target.value)}/></Field>
        <Field><FieldLabel>Last day ends</FieldLabel><Input type="time" value={eTime} onChange={e=>setETime(e.target.value)}/></Field>
        <p className="col-span-2 text-xs text-muted-foreground">Based on a {WORKDAY_H}-hour day ({pad(WORK_START)}:00–{pad(WORK_END)}:00). For a single-day half, set both times on that day (e.g. 09:00–13:00 = half a day).</p>
      </div>}
    </div>}
    <p className="text-xs text-muted-foreground">Tip: on the board you can drag the bar to move it, or drag either end to change the dates.</p>
  </FieldGroup>
  <DialogFooter>{(onDelete?()=>onDelete(assignment.id):null) ? <Button variant="destructive" onClick={onDelete?()=>onDelete(assignment.id):null}><Trash2 data-icon="inline-start" /> Delete</Button> : null}<Button onClick={save}>{assignment?"Save":"Assign"}</Button></DialogFooter></DialogContent></Dialog>);
}
function abToBase64(buf){ let bin=""; const bytes=new Uint8Array(buf); const chunk=0x8000; for(let i=0;i<bytes.length;i+=chunk){ bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk)); } return btoa(bin); }
function loadPdfJs(){
  if (typeof window==="undefined") return Promise.resolve(null);
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((resolve)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload=()=>{ try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; }catch(_){} resolve(window.pdfjsLib||null); };
    s.onerror=()=>resolve(null);
    document.head.appendChild(s);
  });
}
async function extractPdfText(buf){
  const lib=await loadPdfJs(); if(!lib) return "";
  try{
    const pdf=await lib.getDocument({ data:new Uint8Array(buf) }).promise;
    let out=""; const max=Math.min(pdf.numPages, 60);
    for(let p=1;p<=max;p++){ const page=await pdf.getPage(p); const tc=await page.getTextContent(); out+=tc.items.map(it=>it.str).join(" ")+"\n"; }
    return out.trim();
  }catch(_){ return ""; }
}

function ProposalForm({ org, clients, members, anchor, onCreate, onClose }) {
  const [step,setStep]=useState("input");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [fileName,setFileName]=useState("");
  const [file,setFile]=useState(null);
  const [fileIsPdf,setFileIsPdf]=useState(false);
  const [paste,setPaste]=useState("");
  const [startDate,setStartDate]=useState(toISO(nextWeekday(anchor||new Date())));
  const [clientMode,setClientMode]=useState(clients.length?"existing":"new");
  const [existingClientId,setExistingClientId]=useState(clients[0]?.id||"");
  const [newClientName,setNewClientName]=useState("");
  const [newClientColor,setNewClientColor]=useState(CLIENT_COLORS[Math.floor(Math.random()*CLIENT_COLORS.length)]);
  const [projectName,setProjectName]=useState("");
  const [code,setCode]=useState("");
  const [cost,setCost]=useState("");
  const [currency,setCurrency]=useState("");
  const [phases,setPhases]=useState([]);
  const [confidence,setConfidence]=useState("");
  const [people,setPeople]=useState([]);
  const onFile=(f)=>{ if(!f) return; setError(""); setFile(f); setFileName(f.name); setFileIsPdf(f.type==="application/pdf"||/\.pdf$/i.test(f.name)); };
  const extract=async()=>{
    setError(""); const payload={};
    setBusy(true);
    try{
      if(file){
        const buf=await file.arrayBuffer();
        if(fileIsPdf){
          let text=""; try{ text=await extractPdfText(buf); }catch(_){ text=""; }
          if(text.length>200){ payload.text=text; }
          else if(buf.byteLength<5*1024*1024){ payload.pdfBase64=abToBase64(buf); }
          else { setBusy(false); setError("This looks like a scanned/image PDF over 5 MB — too large to send. Please use a smaller or text-based PDF, or paste the text."); return; }
        } else { payload.text=new TextDecoder().decode(buf); }
      } else if(paste.trim()){ payload.text=paste.trim(); }
      if(!payload.text && !payload.pdfBase64){ setBusy(false); setError("Add a PDF, a text file, or paste the proposal text first."); return; }
      payload.orgId=org.id;
      payload.accessToken=(await sb.auth.getSession()).data.session?.access_token;
      const res=await fetch("/api/extract",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const bodyText=await res.text();
      let j=null; try{ j=JSON.parse(bodyText); }catch(_){}
      if(!j){
        setBusy(false);
        if(res.status===404 || (bodyText||"").trim().startsWith("<"))
          setError("The AI function isn't deployed yet. Check that api/extract.js exists in your GitHub repo, and that the latest Vercel deploy finished.");
        else setError(`Extractor returned an unexpected response (HTTP ${res.status}).`);
        return;
      }
      if(!res.ok){ setBusy(false); setError(j.error||`Extractor error (${res.status}).`); return; }
      setProjectName(j.projectName||""); setCode(j.code||""); setCost(j.cost!=null?String(j.cost):""); setCurrency(j.currency||"");
      setPhases((j.phases||[]).map(p=>({id:uid(),name:p.name,days:Math.max(1,Math.round(p.days||1))})));
      setConfidence(j.confidence||"");
      const match=j.client?clients.find(c=>c.name.toLowerCase()===String(j.client).toLowerCase()):null;
      if(match){ setClientMode("existing"); setExistingClientId(match.id); }
      else if(j.client){ setClientMode("new"); setNewClientName(j.client); }
      setStep("review"); setBusy(false);
    }catch(e){
      setBusy(false);
      setError("Couldn't reach the AI extractor. It only runs on the live Vercel site (not local dev), and needs api/extract.js deployed plus ANTHROPIC_API_KEY set in Vercel. ("+(e.message||e)+")");
    }
  };
  const autoCode=()=>projectName.split(/\s+/).filter(Boolean).map(w=>w[0]).join("").slice(0,4).toUpperCase()||"PROJ";
  const confirm=()=>{
    if(!projectName.trim()){ setError("Give the project a name."); return; }
    if(phases.length===0){ setError("Add at least one phase."); return; }
    let clientId, newClient=null;
    if(clientMode==="existing"){ if(!existingClientId){ setError("Choose a client."); return; } clientId=existingClientId; }
    else { newClient={id:uid(),name:(newClientName.trim()||"New client"),color:newClientColor}; clientId=newClient.id; }
    const cleanPhases=phases.map(p=>({id:p.id||uid(),name:p.name.trim()||"Phase",days:Math.max(1,Math.round(p.days||1))}));
    const project={id:uid(),index:(code.trim()||autoCode()),name:projectName.trim(),clientId,billing:"perday",cost:cost===""?null:Number(cost),phases:cleanPhases};
    const ranges=phaseRanges(startDate,cleanPhases);
    const assignments=[];
    for(const mid of people){ for(const r of ranges){ assignments.push({id:uid(),kind:"work",memberId:mid,projectId:project.id,phaseId:r.id,leaveType:null,start:r.start,end:r.end,mode:"hours_per_day",value:0,note:null,startTime:null,endTime:null}); } }
    onCreate({newClient,project,assignments});
  };
  const lastEnd=phases.length?phaseRanges(startDate,phases.map(p=>({id:p.id,name:p.name,days:Math.max(1,Math.round(p.days||1))}))).slice(-1)[0].end:null;
  if(step==="input"){
    return (<Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[92svh] overflow-y-auto"><DialogHeader><DialogTitle>New project from a proposal</DialogTitle></DialogHeader><FieldGroup>
      <p className="text-sm text-muted-foreground flex items-start gap-2"><Sparkles size={16} className="mt-0.5 shrink-0"/> Drop in a proposal and AI will pull out the client, phases, durations and value for you to review.</p>
      <label className="block border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary hover:bg-primary/5">
        <input type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain" className="hidden" onChange={e=>onFile(e.target.files[0])}/>
        <Upload size={20} className="mx-auto text-muted-foreground mb-1"/>
        <div className="text-sm text-muted-foreground">{fileName?<span className="inline-flex items-center gap-1.5 text-foreground font-medium"><FileText size={14}/>{fileName}</span>:"Click to choose a PDF or text file"}</div>
        <div className="text-muted-foreground mt-0.5" style={{fontSize:11}}>PDF or text file.</div>
      </label>
      <Field><FieldLabel>…or paste the proposal text</FieldLabel><Textarea value={paste} onChange={e=>setPaste(e.target.value)} rows={5} placeholder="Paste here…"/></Field>
      <Field><FieldLabel>Project start date</FieldLabel><DatePicker value={startDate} onChange={setStartDate}/></Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </FieldGroup>
    <div className="flex items-center gap-2 px-5 py-4 border-t border-border/60">
      <Button className="ml-auto" onClick={extract} disabled={busy}><Sparkles data-icon="inline-start"/> {busy?"Reading proposal…":"Extract with AI"}</Button>
    </div></DialogContent></Dialog>);
  }
  return (<Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[92svh] overflow-y-auto"><DialogHeader><DialogTitle>Review & create</DialogTitle></DialogHeader><FieldGroup>
    {confidence && <Alert><AlertTriangle/><AlertDescription>{confidence} — check everything below before creating.</AlertDescription></Alert>}
    <Field><FieldLabel>Client</FieldLabel>
      <Tabs value={clientMode} onValueChange={setClientMode} className="mb-2">
        <TabsList className="w-full">
          {[["existing","Existing"],["new","New client"]].map(([v,l])=><TabsTrigger key={v} value={v} className="flex-1">{l}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {clientMode==="existing"
        ? <Select value={existingClientId} onValueChange={setExistingClientId} items={Object.fromEntries(clients.map(c=>[c.id,c.name]))}>
            <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup>{clients.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        : <div><Input className="mb-2" value={newClientName} onChange={e=>setNewClientName(e.target.value)} placeholder="Client name"/><div className="flex flex-wrap gap-2">{CLIENT_COLORS.map(c=><button key={c} onClick={()=>setNewClientColor(c)} className="w-7 h-7 rounded-lg" style={{background:c,outline:newClientColor===c?"2px solid var(--ring)":"none",outlineOffset:2}}/>)}</div></div>}
    </Field>
    <div className="grid grid-cols-3 gap-3">
      <div className="col-span-1"><Field><FieldLabel>Code</FieldLabel><Input value={code} onChange={e=>setCode(e.target.value)} placeholder={autoCode()}/></Field></div>
      <div className="col-span-2"><Field><FieldLabel>Project name</FieldLabel><Input value={projectName} onChange={e=>setProjectName(e.target.value)}/></Field></div>
    </div>
    <Field><FieldLabel>{`Project value ${currency?"("+currency+")":""}`}</FieldLabel><Input type="number" min="0" value={cost} onChange={e=>setCost(e.target.value)} placeholder="0"/></Field>
    <Field><FieldLabel>Phases & durations (working days)</FieldLabel>
      <div className="flex flex-col gap-1.5 mb-2">{phases.map((p,i)=>(
        <div key={p.id} className="flex items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground w-4 shrink-0">{i+1}</span>
          <Input className="flex-1" value={p.name} onChange={e=>setPhases(phases.map(x=>x.id===p.id?{...x,name:e.target.value}:x))}/>
          <InputGroup className="w-20"><InputGroupInput type="number" min="1" value={p.days} onChange={e=>setPhases(phases.map(x=>x.id===p.id?{...x,days:Number(e.target.value)}:x))}/><InputGroupAddon align="inline-end"><InputGroupText>d</InputGroupText></InputGroupAddon></InputGroup>
          <Button variant="ghost" size="icon-sm" onClick={()=>setPhases(phases.filter(x=>x.id!==p.id))}><X/></Button>
        </div>))}
      </div>
      <Button variant="ghost" size="sm" onClick={()=>setPhases([...phases,{id:uid(),name:"",days:5}])}><Plus data-icon="inline-start"/> Add phase</Button>
    </Field>
    <div className="grid grid-cols-2 gap-3">
      <Field><FieldLabel>Start date</FieldLabel><DatePicker value={startDate} onChange={setStartDate}/></Field>
      <Field><FieldLabel>Finishes (calculated)</FieldLabel><Input readOnly disabled value={lastEnd?`${pad(parseISO(lastEnd).getDate())} ${MONTHS[parseISO(lastEnd).getMonth()]} ${parseISO(lastEnd).getFullYear()}`:"—"}/></Field>
    </div>
    <Field><FieldLabel>Assign people (one bar per phase each)</FieldLabel>
      <ToggleGroup multiple variant="outline" size="sm" className="flex-wrap" value={people} onValueChange={setPeople}>
        {members.map(m=><ToggleGroupItem key={m.id} value={m.id}>{m.name}</ToggleGroupItem>)}
      </ToggleGroup>
      {people.length===0 && <p className="text-xs text-muted-foreground mt-1">Optional — leave empty to create the project with no one scheduled yet.</p>}
    </Field>
    {error && <p className="text-sm text-destructive">{error}</p>}
  </FieldGroup>
  <div className="flex items-center gap-2 px-5 py-4 border-t border-border/60">
    <Button variant="ghost" onClick={()=>{setStep("input");setError("");}}><ArrowLeft data-icon="inline-start"/> Back</Button>
    <Button className="ml-auto" onClick={confirm}>Create project &amp; schedule</Button>
  </div></DialogContent></Dialog>);
}
/* ============================ Huddle adapter + wired glue ======================= */
function mapData(cad) {
  return {
    members: (cad.members || []).filter(m => m.status !== "suspended").map(m => ({ id:m.id, name:m.display_name||m.email||"—", role:m.job_title||(m.role||""), email:m.email||"", teams:m.teams||[], daily:m.daily_hours||8, holidayAllowance:m.holiday_allowance??30, hourlyRate:m.hourly_rate })),
    clients: (cad.clients || []).map(c => ({ id:c.id, name:c.name, color:c.color, paymentTerms:c.payment_terms, billingAddress:c.billing_address||"" })),
    projects: (cad.projects || []).map(p => ({ id:p.id, index:p.code, name:p.name, clientId:p.client_id, phases:p.phases||[], cost:p.cost })),
    assignments: (cad.assignments || []).map(a => ({ id:a.id, kind:a.kind==="task"?"internal":a.kind, memberId:a.membership_id, projectId:a.project_id, phaseId:a.phase_id, leaveType:a.leave_type, start:a.start_date, end:a.end_date, lane:Number.isFinite(a.lane)?a.lane:null, taskId:a.task_id, startTime:a.start_time, endTime:a.end_time, mode:a.mode, value:a.value })),
    timeLogs: (cad.timeLogs || []).map(l => ({ id:l.id, memberId:l.membership_id, projectId:l.project_id, phaseId:l.phase_id, taskId:l.task_id, date:l.log_date, minutes:l.minutes, source:l.source||"manual" })),
    internalTasks: (cad.tasks || []).map(t => ({ id:t.id, title:t.title, assigneeId:t.assignee_id, status:t.status, priority:t.priority, team:t.team, projectId:t.project_id, phaseId:t.phase_id, ord:t.ord, notes:t.notes })),
  };
}

export default function Schedule({ org, me, data: cadData, reload, peopleFilter: pfProp, onPeopleFilter }) {
  const canEdit = can(me, "schedule.edit");
  const [anchor,setAnchor]=useState(()=>startOfDay(new Date()));
  const [zoomT,setZoomT]=useState(0.55);
  const [pfLocal,setPfLocal]=useState("all");
  const peopleFilter = pfProp!==undefined ? pfProp : pfLocal;
  const setPeopleFilter = onPeopleFilter || setPfLocal;
  const [holidayFilter,setHolidayFilter]=useState("show");
  const [clientFilter,setClientFilter]=useState("all");
  const [q,setQ]=useState("");
  const [dateOpen,setDateOpen]=useState(false);
  const [modal,setModal]=useState(null);
  const [quickModal,setQuickModal]=useState(null); // "invite" | "newproject" — layered over the assign form
  const boardScroll=useRef(null);

  const data=useMemo(()=>mapData(cadData),[cadData]);
  const [optim,setOptim]=useState({});
  const dataView=useMemo(()=>{ if(!Object.keys(optim).length) return data; return {...data, assignments:data.assignments.map(a=> optim[a.id]?{...a,...optim[a.id]}:a)}; },[data,optim]);
  useEffect(()=>{ setOptim(o=>{ if(!Object.keys(o).length) return o; let changed=false; const n={...o}; for(const id of Object.keys(o)){ const row=(cadData.assignments||[]).find(a=>a.id===id); if(row && row.start_date===o[id].start && row.end_date===o[id].end && (o[id].lane===undefined || (row.lane??null)===(o[id].lane??null))){ delete n[id]; changed=true; } } return changed?n:o; }); },[cadData]); // eslint-disable-line
  const clientById=useCallback((id)=>data.clients.find(c=>c.id===id),[data.clients]);
  const projectById=useCallback((id)=>data.projects.find(p=>p.id===id),[data.projects]);
  const teams=useMemo(()=>[...new Set(data.members.flatMap(m=>m.teams||[]))].sort(),[data.members]);
  const phaseLogged=useMemo(()=>{ const map={}; data.timeLogs.forEach(l=>{ if(l.projectId){ const k=l.projectId+"|"+(l.phaseId||""); map[k]=(map[k]||0)+l.minutes; } }); return map; },[data.timeLogs]);
  const colorOf=useCallback((a)=>{ if(a.kind==="leave") return (LEAVE_TYPES[a.leaveType]||LEAVE_TYPES.vacation).color; if(a.kind==="internal") return NAVY; const p=projectById(a.projectId); const c=p&&clientById(p.clientId); return c?c.color:"#94a3b8"; },[projectById,clientById]);
  const matches=useCallback((a)=>{ if(clientFilter!=="all"){ if(a.kind==="leave") return false; const pr=projectById(a.projectId); if(!pr||!cfIncludes(clientFilter,pr.clientId)) return false; } if(q.trim()){ const s=q.toLowerCase(); const m=data.members.find(x=>x.id===a.memberId); const pr=a.kind==="work"?projectById(a.projectId):null; const cl=pr&&clientById(pr.clientId); const tk=a.kind==="internal"?((data.internalTasks||[]).find(t=>t.id===a.taskId)||{}).title:""; const hay=[m&&m.name,pr&&pr.name,pr&&pr.index,cl&&cl.name,tk,a.kind==="leave"?(LEAVE_TYPES[a.leaveType]||{}).label:""].join(" ").toLowerCase(); if(!hay.includes(s)) return false; } return true; },[clientFilter,q,data,projectById,clientById]);

  const moveAssign=async(a,start,end,lane)=>{ if(!canEdit) return; setOptim(o=>({...o,[a.id]:{start,end,...(lane===undefined?{}:{lane})}})); await sb.from("assignments").update({start_date:start,end_date:end,...(lane===undefined?{}:{lane})}).eq("id",a.id); reload(); };
  const asgRow=(a)=>({ org_id:org.id, kind:a.kind==="internal"?"task":a.kind, membership_id:a.memberId, project_id:a.projectId||null, phase_id:a.phaseId||null, leave_type:a.leaveType||null, start_date:a.start, end_date:a.end, mode:a.mode||null, value:(a.value??null), note:a.note||null, start_time:a.startTime||null, end_time:a.endTime||null, lane:Number.isFinite(a.lane)?a.lane:null, task_id:a.taskId||null });
  const saveAssignment=async(a,ph)=>{ const row=asgRow(a); if(a.id) await sb.from("assignments").update(row).eq("id",a.id); else await sb.from("assignments").insert(row); if(ph&&ph.hours!=null){ const proj=(cadData.projects||[]).find(p=>p.id===ph.projectId); if(proj){ const phases=(proj.phases||[]).map(x=>x.id===ph.phaseId?{...x,hours:ph.hours}:x); await sb.from("projects").update({phases}).eq("id",proj.id); } } reload(); };
  const delAssign=async(id)=>{ await sb.from("assignments").delete().eq("id",id); reload(); };
  const saveInternalAssign=async({taskId,newTask,memberId,start,end})=>{ let tid=taskId; if(newTask){ const {data:t}=await sb.from("tasks").insert({org_id:org.id,title:newTask.title,priority:newTask.priority||"med",team:newTask.team||null,status:"todo",assignee_id:memberId||null,ord:Date.now()}).select().single(); tid=t&&t.id; } await sb.from("assignments").insert({org_id:org.id,kind:"task",membership_id:memberId,task_id:tid,start_date:start,end_date:end}); reload(); };
  const createFromProposal=async({newClient,project,assignments})=>{ let clientId=project.clientId; if(newClient){ const {data:c}=await sb.from("clients").insert({org_id:org.id,name:newClient.name,color:newClient.color,payment_terms:30}).select().single(); clientId=c&&c.id; } const {data:p}=await sb.from("projects").insert({org_id:org.id,code:project.index,name:project.name,client_id:clientId,cost:project.cost,phases:project.phases}).select().single(); const projId=p&&p.id; if(projId&&assignments.length){ const rows=assignments.map(a=>({org_id:org.id,kind:"work",membership_id:a.memberId,project_id:projId,phase_id:a.phaseId||null,start_date:a.start,end_date:a.end})); await sb.from("assignments").insert(rows); } setModal(null); reload(); };

  const ctx={ data:dataView, anchor, matches, setModal, moveAssign, peopleFilter, zoomT, holidayFilter, boardScroll, phaseLogged, projectById, clientById, colorOf, canEdit, myMemberId:me.id };

  if(!can(me,"schedule.view")) return <NoAccess what="the schedule" />;
  const step=(dir)=>setAnchor(a=>addMonths(a,dir));

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 bg-card border-b border-border">
        <ButtonGroup>
          <Button variant="outline" size="icon" onClick={()=>step(-1)} aria-label="Previous month"><ChevronLeft/></Button>
          <Button variant="outline" onClick={()=>setAnchor(startOfDay(new Date()))}>Today</Button>
          <Button variant="outline" size="icon" onClick={()=>step(1)} aria-label="Next month"><ChevronRight/></Button>
        </ButtonGroup>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger render={<Button variant="outline" className="tabular-nums" />}>
            <Calendar/> {toISO(anchor)}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker mode="single" selected={anchor} onSelect={(d)=>{ if(d){ setAnchor(startOfDay(d)); setDateOpen(false); } }} defaultMonth={anchor} />
          </PopoverContent>
        </Popover>
        <div className="text-sm font-semibold text-foreground/80 px-1 hidden md:block">{MONTHS_LONG[anchor.getMonth()]} {anchor.getFullYear()}</div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <InputGroup className="w-32 sm:w-44">
            <InputGroupAddon><Search/></InputGroupAddon>
            <InputGroupInput value={q} onChange={e=>setQ(e.target.value)} placeholder="Search"/>
          </InputGroup>
          <PeoplePicker members={data.members} teams={teams} value={peopleFilter} onChange={setPeopleFilter} me={me.id}/>
          <Select value={holidayFilter} onValueChange={setHolidayFilter} items={{show:"Holidays: show",hide:"Holidays: hide",only:"Holidays: only"}}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="show">Holidays: show</SelectItem>
              <SelectItem value="hide">Holidays: hide</SelectItem>
              <SelectItem value="only">Holidays: only</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
          <ClientPicker clients={data.clients} value={clientFilter} onChange={setClientFilter}/>
          {canEdit && <Button variant="secondary" onClick={()=>setModal({type:"proposal"})}><Sparkles data-icon="inline-start" /> <span className="hidden sm:inline">Proposal</span></Button>}
          {canEdit && <Button onClick={()=>setModal({type:"assign"})}><Plus data-icon="inline-start" /> <span className="hidden sm:inline">Assign Work</span></Button>}
        </div>
      </div>

      <div className="flex-1 min-h-0"><TimelineBoard {...ctx} /></div>

      <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 bg-card border-x border-b border-border text-xs text-muted-foreground">
        <span className="font-medium text-muted-foreground">Clients:</span>
        {data.clients.map(c=>(<button key={c.id} onClick={()=>canEdit&&setModal({type:"client",payload:c})} className="flex items-center gap-1.5 hover:text-foreground group"><span className="w-3 h-3 rounded-xs" style={{background:c.color}}/>{c.name}{canEdit&&<Pencil size={11} className="opacity-0 group-hover:opacity-60"/>}</button>))}
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-xs" style={{background:LEAVE_TYPES.vacation.color}}/>Time off</span>
        <div className="mx-auto flex items-center gap-2">
          <span className="text-muted-foreground/70 hidden md:inline">use mouse wheel or click empty area to move</span>
          <ButtonGroup>
            <Button variant="outline" size="icon-sm" onClick={()=>boardScroll.current?.nudge(-1)} aria-label="Move left"><ChevronLeft/></Button>
            <Button variant="outline" size="icon-sm" onClick={()=>boardScroll.current?.nudge(1)} aria-label="Move right"><ChevronRight/></Button>
          </ButtonGroup>
        </div>
        <ButtonGroup>
          <Button variant="outline" size="icon-sm" onClick={()=>setZoomT(z=>Math.max(0,Math.round((z-0.2)*10)/10))} disabled={zoomT<=0} aria-label="Zoom out"><ZoomOut/></Button>
          <ButtonGroupText>Zoom</ButtonGroupText>
          <Button variant="outline" size="icon-sm" onClick={()=>setZoomT(z=>Math.min(1,Math.round((z+0.2)*10)/10))} disabled={zoomT>=1} aria-label="Zoom in"><ZoomIn/></Button>
        </ButtonGroup>
      </div>


      {modal?.type==="assign" && <AssignForm assignment={modal.payload&&modal.payload.id?modal.payload:null} preset={modal.payload} members={data.members} projects={data.projects} clients={data.clients} anchor={anchor} tasks={data.internalTasks||[]} teams={teams}
        onInvite={canEdit?()=>setQuickModal("invite"):null} onNewProject={canEdit?()=>setQuickModal("newproject"):null}
        onInternalAssign={(x)=>{ saveInternalAssign(x); setModal(null); }} onSave={(a,ph)=>{ saveAssignment(a,ph); setModal(null); }} onDelete={modal.payload&&modal.payload.id?id=>{ delAssign(id); setModal(null); }:null} onClose={()=>setModal(null)} />}
      {modal?.type==="member" && <MemberForm org={org} member={modal.payload} teams={teams} canEdit={canEdit} onClose={()=>setModal(null)} onSaved={()=>{ setModal(null); reload(); }} />}
      {modal?.type==="client" && <ClientForm org={org} client={modal.payload} canEdit={canEdit} onClose={()=>setModal(null)} onSaved={()=>{ setModal(null); reload(); }} />}
      {modal?.type==="proposal" && <ProposalForm org={org} clients={data.clients} members={data.members} anchor={anchor} onCreate={createFromProposal} onClose={()=>setModal(null)} />}
      {quickModal==="invite" && <InviteModal org={org} onClose={()=>setQuickModal(null)} onSent={()=>{ setQuickModal(null); reload(); }} />}
      {quickModal==="newproject" && <ProjectModal org={org} project={null} clients={cadData.clients} onClose={()=>setQuickModal(null)} onSaved={()=>{ setQuickModal(null); reload(); }} />}
    </div>
  );
}

function ClientForm({ org, client, canEdit, onClose, onSaved }){
  const confirm = useConfirm();
  const [name,setName]=useState(client?.name||"");
  const [color,setColor]=useState(client?.color||CLIENT_COLORS[0]);
  const [terms,setTerms]=useState(client?.paymentTerms??30);
  const [addr,setAddr]=useState(client?.billingAddress||"");
  const save=async()=>{ const row={org_id:org.id,name:name.trim(),color,payment_terms:Number(terms)||30,billing_address:addr.trim()||null}; if(client) await sb.from("clients").update(row).eq("id",client.id); else await sb.from("clients").insert(row); onSaved(); };
  const del=async()=>{ if(!(await confirm({title:"Delete this client?", confirmLabel:"Delete", destructive:true}))) return; await sb.from("clients").delete().eq("id",client.id); onSaved(); };
  return (<Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[92svh] overflow-y-auto"><DialogHeader><DialogTitle>{client?"Edit client":"Add client"}</DialogTitle></DialogHeader><FieldGroup>
    <Field><FieldLabel>Client name</FieldLabel><Input disabled={!canEdit} value={name} onChange={e=>setName(e.target.value)}/></Field>
    <Field><FieldLabel>Colour</FieldLabel><div className="flex flex-wrap gap-2">{CLIENT_COLORS.map(c=><button key={c} disabled={!canEdit} onClick={()=>setColor(c)} className="w-8 h-8 rounded-lg" style={{background:c,outline:color===c?"2px solid var(--ring)":"none",outlineOffset:2}}/>)}</div></Field>
    <Field><FieldLabel>Payment terms (days)</FieldLabel><Input type="number" disabled={!canEdit} value={terms} onChange={e=>setTerms(e.target.value)}/></Field>
    <Field><FieldLabel>Billing address (for invoices)</FieldLabel><Textarea rows={3} disabled={!canEdit} value={addr} onChange={e=>setAddr(e.target.value)}/></Field>
  </FieldGroup>{canEdit?<DialogFooter>{(client?del:null) ? <Button variant="destructive" onClick={client?del:null}><Trash2 data-icon="inline-start" /> Delete</Button> : null}<Button onClick={save}>Save</Button></DialogFooter>:<div className="px-5 py-4 border-t border-border/60 text-right"><Button variant="ghost" onClick={onClose}>Close</Button></div>}</DialogContent></Dialog>);
}

function MemberForm({ org, member, teams, canEdit, onClose, onSaved }){
  const [name,setName]=useState(member?.name||"");
  const [role,setRole]=useState(member?.role||"");
  const [daily,setDaily]=useState(member?.daily??8);
  const [allow,setAllow]=useState(member?.holidayAllowance??30);
  const [rate,setRate]=useState(member?.hourlyRate??"");
  const [sel,setSel]=useState(member?.teams||[]);
  const [newTeam,setNewTeam]=useState("");
  const save=async()=>{ await sb.from("memberships").update({ display_name:name.trim(), job_title:role.trim()||null, daily_hours:Number(daily)||8, holiday_allowance:Number(allow)||0, hourly_rate:rate===""?null:Number(rate), teams:sel.length?sel:null }).eq("id",member.id); onSaved(); };
  return (<Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[92svh] overflow-y-auto"><DialogHeader><DialogTitle>{"Edit "+(member?.name||"person")}</DialogTitle></DialogHeader><FieldGroup>
    <Field><FieldLabel>Name</FieldLabel><Input disabled={!canEdit} value={name} onChange={e=>setName(e.target.value)}/></Field>
    <Field><FieldLabel>Job title / role</FieldLabel><Input disabled={!canEdit} value={role} onChange={e=>setRole(e.target.value)} placeholder="Designer"/></Field>
    <div className="grid grid-cols-3 gap-3">
      <Field><FieldLabel>Hours / day</FieldLabel><Input type="number" disabled={!canEdit} value={daily} onChange={e=>setDaily(e.target.value)}/></Field>
      <Field><FieldLabel>Holiday (days/yr)</FieldLabel><Input type="number" disabled={!canEdit} value={allow} onChange={e=>setAllow(e.target.value)}/></Field>
      <Field><FieldLabel>Rate (£/hr)</FieldLabel><Input type="number" disabled={!canEdit} value={rate} onChange={e=>setRate(e.target.value)} placeholder="—"/></Field>
    </div>
    <Field><FieldLabel>Teams</FieldLabel>
      <ToggleGroup multiple variant="outline" size="sm" className="flex-wrap" value={sel} onValueChange={setSel} disabled={!canEdit}>
        {[...new Set([...teams,...sel])].map(t=><ToggleGroupItem key={t} value={t}>{t}</ToggleGroupItem>)}
      </ToggleGroup>
      {canEdit && <div className="flex gap-2 mt-2"><Input value={newTeam} onChange={e=>setNewTeam(e.target.value)} placeholder="New team name"/><Button variant="outline" onClick={()=>{ if(newTeam.trim()&&!sel.includes(newTeam.trim())){ setSel([...sel,newTeam.trim()]); setNewTeam(""); } }}>Add</Button></div>}
    <FieldDescription>Roles, permissions and invites are managed on the People page.</FieldDescription></Field>
  </FieldGroup>{canEdit?<DialogFooter><Button onClick={save}>Save</Button></DialogFooter>:<div className="px-5 py-4 border-t border-border/60 text-right"><Button variant="ghost" onClick={onClose}>Close</Button></div>}</DialogContent></Dialog>);
}
