import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import { sb } from "../lib/supabase.js";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { inputCls } from "../ui.jsx";
import { phaseRanges } from "../studio/core.jsx";
import {
  Plus, X, ChevronLeft, ChevronRight, Search, Trash2, AlertTriangle, Users,
  Pencil, ZoomIn, ZoomOut, Plane, Building2, Calendar, Play, Square,
  PictureInPicture2, Sparkles, Upload, FileText, ArrowLeft, Clock,
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
const initials = (name) => (name||"?").split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase();
const NAVY = "#1f2d4e";
const CLIENT_COLORS = ["#2f80ed","#9b51e0","#16a0a0","#eb5757","#27ae60","#f2994a","#2d9cdb","#6b7a99","#e84393","#8e44ad"];
const AVATAR_BG = ["#5b8def","#9b6dd6","#3aa99f","#e0884b","#d65f6e","#4caf8f"];
const LEAVE_TYPES = { vacation:{label:"Holiday",color:"#f2994a"}, parental:{label:"Parental Leave",color:"#e67e22"}, sick:{label:"Sick Leave",color:"#c0563f"}, holiday:{label:"Public Holiday",color:"#7f8fa6"} };
const pfIncludes = (pf,id) => pf==="all" || (Array.isArray(pf)?pf.includes(id):pf===id);
const cfIncludes = (cf,id) => cf==="all" || (Array.isArray(cf)?(cf.length===0||cf.includes(id)):cf===id);
const pfList = (members,pf) => pf==="all"?members:members.filter(m=>pfIncludes(pf,m.id));
const hm = (min) => { min=Math.round(min); const h=Math.floor(min/60), m=min%60; return h?(m?`${h}h ${m}m`:`${h}h`):`${m}m`; };
const fmtClock = (sec) => { sec=Math.max(0,Math.floor(sec)); const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60; return `${pad(h)}:${pad(m)}:${pad(s)}`; };
const lsGet = (k) => { try{ const v=localStorage.getItem(k); return v==null?null:JSON.parse(v); }catch(_){ return null; } };
const lsSet = (k,v) => { try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v)); }catch(_){} };
function projectsByClient(projects, clients){
  const byId={}; clients.forEach(c=>{byId[c.id]={client:c,projects:[]};});
  const noClient={client:null,projects:[]};
  projects.forEach(p=>{ (byId[p.clientId]||noClient).projects.push(p); });
  const groups=clients.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>byId[c.id]).filter(g=>g.projects.length);
  if(noClient.projects.length) groups.push(noClient);
  return groups;
}
function openFloatingTimer({ getTop, getElapsed, onStop }){
  const html='<div style="padding:6px 10px;display:flex;align-items:center;gap:10px;height:100%;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;color:#fff">'
    +'<div style="min-width:0;flex:1;display:flex;flex-direction:column">'
    +'<div id="pl" style="font-size:10px;font-weight:600;color:#d7deec;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>'
    +'<div id="pt" style="font-size:17px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums"></div></div>'
    +'<button id="ps" style="flex:none;display:flex;align-items:center;gap:5px;background:#fff;color:'+NAVY+';border:none;border-radius:7px;padding:6px 10px;font-size:11.5px;font-weight:700;white-space:nowrap;cursor:pointer">&#9632; Stop &amp; log</button></div>';
  const wire=(win)=>{
    if(!win) return null;
    const d=win.document; try{ d.title="Time Tracker — "+getTop(); }catch(_){}
    d.body.style.cssText="margin:0;background:"+NAVY+";overflow:hidden";
    d.body.innerHTML=html;
    const tEl=d.getElementById("pt"), lEl=d.getElementById("pl");
    const paint=()=>{ try{ lEl.textContent=getTop(); tEl.textContent=getElapsed(); }catch(_){} };
    paint();
    d.getElementById("ps").addEventListener("click",()=>{ try{onStop();}catch(_){} try{win.close();}catch(_){} try{window.focus();}catch(_){} });
    const int=setInterval(paint,1000);
    const done=()=>{ try{clearInterval(int);}catch(_){} };
    win.addEventListener("pagehide",done); win.addEventListener("beforeunload",done);
    return { win, close:()=>{ done(); try{win.close();}catch(_){} } };
  };
  if(typeof window!=="undefined" && window.documentPictureInPicture){
    return window.documentPictureInPicture.requestWindow({width:340,height:64}).then(wire).catch(()=>null);
  }
  const w=(typeof window!=="undefined") ? window.open("","studioTimer","width=340,height=120") : null;
  if(!w){ alert("Pop-out was blocked — allow pop-ups for this site (or use Chrome/Edge for an always-on-top timer)."); return Promise.resolve(null); }
  return Promise.resolve(wire(w));
}

/* ---- local modal kit (matches the studio forms) ---- */
function ModalShell({ children, onClose }){
  return (<div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>{children}</div>
  </div>);
}
function ModalHead({ title, onClose }){ return <div className="flex items-center justify-between px-5 py-3.5 rounded-t-xl text-white" style={{background:NAVY}}><h3 className="font-semibold">{title}</h3><button onClick={onClose} className="opacity-80 hover:opacity-100"><X size={18}/></button></div>; }
function ModalFoot({ onSave, onDelete, saveLabel="Save", disabled }){ return <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100">{onDelete&&<button onClick={onDelete} className="flex items-center gap-1 text-sm text-red-600 hover:bg-red-50 px-2.5 py-2 rounded-lg"><Trash2 size={15}/> Delete</button>}<button onClick={onSave} disabled={disabled} className="ml-auto text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saveLabel}</button></div>; }
function Field({ label, children }){ return <label className="block mb-3"><span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>{children}</label>; }

/* ============================ board components (from studio tool) ================ */
function PersonCell({ m, idx, width, onEdit, onAssign, canEdit }) {
  return (
    <div className="shrink-0 border-r border-slate-200 px-3 py-3 flex items-start gap-2.5 group bg-white" style={{ width, position:"sticky", left:0, zIndex:15 }}>
      <span className="grid place-items-center w-8 h-8 rounded-full text-white text-xs font-semibold shrink-0" style={{ background: AVATAR_BG[idx%AVATAR_BG.length] }}>{initials(m.name)}</span>
      <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-800 truncate">{m.name}</div><div className="text-xs text-slate-400 truncate">{m.role}</div></div>
      {canEdit && <div className="flex flex-col gap-1 shrink-0">
        <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 transition grid place-items-center w-6 h-6 rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600" title={"Edit "+m.name}><Pencil size={13}/></button>
        <button onClick={onAssign} className="opacity-0 group-hover:opacity-100 transition grid place-items-center w-6 h-6 rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600" title={"Assign work to "+m.name}><Plus size={15}/></button>
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
      className="tl-scroll h-full border-x border-b border-slate-200 overflow-auto bg-white" style={{cursor:"grab"}}>
      <style>{`.tl-scroll::-webkit-scrollbar:horizontal{height:0}.tl-scroll::-webkit-scrollbar:vertical{width:10px}.tl-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:6px}`}</style>
      <div style={{width:SIDEBAR+totalW}}>
        <div className="flex border-b border-slate-100">
          <div className="shrink-0 bg-white border-r border-slate-200" style={{width:SIDEBAR,position:"sticky",left:0,zIndex:16}}></div>
          <div className="relative" style={{width:totalW,height:24}}>
            {monthBands.map((b,k)=><div key={k} className="absolute top-0 bottom-0 flex items-center px-2 text-xs font-semibold text-slate-500 border-r border-slate-100" style={{left:b.left,width:b.width}}>{b.label}</div>)}
          </div>
        </div>
        {dayW>=14 && <div className="flex border-b border-slate-200">
          <div className="shrink-0 bg-white border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide" style={{width:SIDEBAR,position:"sticky",left:0,zIndex:16}}>{single?visibleMembers[0].name:(peopleFilter==="all"?`Everyone · ${data.members.length}`:`Selected · ${visibleMembers.length}`)}</div>
          <div className="flex" style={{width:totalW}}>
            {days.map((d,k)=>{const wknd=!isWeekday(d);const mon=d.getDay()===1;return (
              <div key={k} className={`text-center border-r ${mon?"border-slate-300":"border-slate-100"} ${wknd?"bg-slate-50":""}`} style={{width:conf.dayW,paddingTop:4,paddingBottom:4}}>
                {dayW>=46
                  ? <><div className="text-xs font-semibold text-slate-600">{DOW[d.getDay()]}</div><div className="text-xs text-slate-400">{pad(d.getDate())}</div></>
                  : <div className="text-slate-400" style={{fontSize:9.5}}>{d.getDate()}</div>}
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
                {days.map((d,k)=>{ if(dayW<14){ return d.getDate()===1 ? <div key={k} className="absolute top-0 bottom-0 border-r border-slate-200" style={{left:k*conf.dayW}}/> : null; } const wknd=!isWeekday(d);const mon=d.getDay()===1;return <div key={k} className={`absolute top-0 bottom-0 border-r ${mon?"border-slate-200":"border-slate-100"} ${wknd?"bg-slate-50":""}`} style={{left:k*conf.dayW,width:conf.dayW}}/>;})}
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
                {placed.length===0 && <div className="absolute text-xs text-slate-300" style={{left:10,top:ROW_PAD+4}}>No assignments</div>}
              </div>
            </div>
          );
        })}
        {data.members.length===0 && <div className="py-16 text-center text-slate-400"><p className="mb-3">No people yet — invite your team on the People page.</p></div>}
      </div>
    </div>
  );
}
function PeoplePicker({ members, teams, value, onChange, me }){
  const [open,setOpen]=useState(false);
  const allIds=members.map(m=>m.id);
  const isAll=value==="all";
  const sel=new Set(isAll?allIds:(Array.isArray(value)?value:(value?[value]:[])));
  const commit=(s)=>{ if(s.size===0){ onChange(me?[me]:"all"); return; } if(s.size===allIds.length) onChange("all"); else onChange([...s]); };
  const togglePerson=(id)=>{ const s=new Set(sel); s.has(id)?s.delete(id):s.add(id); commit(s); };
  const tmIds=(t)=>members.filter(m=>(m.teams||[]).includes(t)).map(m=>m.id);
  const teamOn=(t)=>{ const ids=tmIds(t); return ids.length>0&&ids.every(id=>sel.has(id)); };
  const toggleTeam=(t)=>{ const ids=tmIds(t); const on=teamOn(t); const s=new Set(sel); ids.forEach(id=> on?s.delete(id):s.add(id)); commit(s); };
  const ungrouped=members.filter(m=>!(m.teams&&m.teams.length));
  const summary=isAll?"Everyone":(sel.size===0?"No one":(sel.size===1?((members.find(m=>m.id===[...sel][0])||{}).name||"1 person"):`${sel.size} people`));
  return (<div className="relative">
    <button onClick={()=>setOpen(o=>!o)} className="flex items-center gap-1.5 text-sm outline-none text-slate-700"><Users size={14} className="text-slate-400"/>{summary}<ChevronRight size={13} className="text-slate-400" style={{transform:open?"rotate(90deg)":"none",transition:"transform .15s"}}/></button>
    {open && <><div className="fixed inset-0 z-30" onClick={()=>setOpen(false)}/>
      <div className="absolute z-40 mt-1 left-0 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-2 max-h-96 overflow-y-auto text-sm">
        <div className="flex gap-1 mb-1.5">
          <button onClick={()=>onChange("all")} className={`flex-1 text-xs py-1 rounded ${isAll?"bg-slate-800 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Everyone</button>
          {me && <button onClick={()=>onChange([me])} className="flex-1 text-xs py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200">Just me</button>}
        </div>
        {teams.map(t=>(<div key={t} className="mb-1">
          <label className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer font-semibold text-slate-700"><input type="checkbox" checked={teamOn(t)} onChange={()=>toggleTeam(t)} className="w-3.5 h-3.5"/>{t}</label>
          <div className="pl-5">{members.filter(m=>(m.teams||[]).includes(t)).map(m=><label key={m.id} className="flex items-center gap-2 px-1.5 py-0.5 rounded hover:bg-slate-50 cursor-pointer text-slate-600"><input type="checkbox" checked={sel.has(m.id)} onChange={()=>togglePerson(m.id)} className="w-3.5 h-3.5"/>{m.name}</label>)}</div>
        </div>))}
        {ungrouped.length>0 && <div className="pl-1 pt-1 border-t border-slate-100">{ungrouped.map(m=><label key={m.id} className="flex items-center gap-2 px-1.5 py-0.5 rounded hover:bg-slate-50 cursor-pointer text-slate-600"><input type="checkbox" checked={sel.has(m.id)} onChange={()=>togglePerson(m.id)} className="w-3.5 h-3.5"/>{m.name}</label>)}</div>}
      </div></>}
  </div>);
}

function ClientPicker({ clients, value, onChange }){
  const [open,setOpen]=useState(false);
  const allIds=clients.map(c=>c.id);
  const isAll=value==="all";
  const sel=new Set(isAll?allIds:(Array.isArray(value)?value:(value?[value]:[])));
  const commit=(s)=>{ if(s.size===0||s.size===allIds.length) onChange("all"); else onChange([...s]); };
  const toggle=(id)=>{ const s=new Set(sel); s.has(id)?s.delete(id):s.add(id); commit(s); };
  const summary=isAll?"All clients":(sel.size===1?((clients.find(c=>c.id===[...sel][0])||{}).name||"1 client"):`${sel.size} clients`);
  return (<div className="relative">
    <button onClick={()=>setOpen(o=>!o)} className="flex items-center gap-1.5 text-sm outline-none text-slate-700"><Building2 size={14} className="text-slate-400"/>{summary}<ChevronRight size={13} className="text-slate-400" style={{transform:open?"rotate(90deg)":"none",transition:"transform .15s"}}/></button>
    {open && <><div className="fixed inset-0 z-30" onClick={()=>setOpen(false)}/>
      <div className="absolute z-40 mt-1 left-0 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-2 max-h-96 overflow-y-auto text-sm">
        <button onClick={()=>onChange("all")} className={`w-full text-xs py-1 rounded mb-1.5 ${isAll?"bg-slate-800 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>All clients</button>
        {clients.length===0 && <div className="text-xs text-slate-400 px-1.5 py-1">No clients yet.</div>}
        {clients.map(c=><label key={c.id} className="flex items-center gap-2 px-1.5 py-0.5 rounded hover:bg-slate-50 cursor-pointer text-slate-600"><input type="checkbox" checked={sel.has(c.id)} onChange={()=>toggle(c.id)} className="w-3.5 h-3.5"/><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{background:c.color}}/>{c.name}</label>)}
      </div></>}
  </div>);
}

function AssignForm({ assignment, preset, members, projects, clients, anchor, onSave, onDelete, onClose, onInternalAssign, tasks=[], teams=[] }){
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
  const save=()=>{
    if(kind==="internal"){
      if(!memberId){ alert("Choose who this is for."); return; }
      if(!start||!end||end<start){ alert("Check the dates."); return; }
      if(assignment){ onSave({...assignment,memberId,start,end,kind:"internal"}); return; }
      if(taskId==="__new__"){ if(!taskTitle.trim()){ alert("Give the task a name."); return; } onInternalAssign&&onInternalAssign({newTask:{title:taskTitle.trim(),priority:taskPri,team:taskTeam||""},memberId,start,end}); return; }
      if(!taskId){ alert("Pick a task, or create a new one."); return; }
      onInternalAssign&&onInternalAssign({taskId,memberId,start,end}); return;
    }
    if(!memberId||!start||!end) return;
    if(end<start){ alert("End date can't be before the start date."); return; }
    const base={...(assignment||{}),memberId,start,end,value:0,mode:"hours_per_day",note:null,startTime:null,endTime:null};
    if(kind==="leave") onSave({...base,kind:"leave",leaveType,projectId:null,phaseId:null,startTime:partDay?sTime:null,endTime:partDay?eTime:null});
    else onSave({...base,kind:"work",projectId,phaseId:phaseId||null,leaveType:null}, phaseId?{projectId,phaseId,hours:phaseHours===""?null:Number(phaseHours)}:null);
  };
  return (<ModalShell onClose={onClose}><ModalHead title={assignment?"Edit assignment":"Assign work"} onClose={onClose}/><div className="p-5">
    {!assignment
      ? <div className="flex gap-2 mb-4">{[["work","Project work"],["leave","Time off"],["internal","Tasks"]].map(([v,l])=><button key={v} onClick={()=>setKind(v)} className={`flex-1 text-sm py-2 rounded-lg border ${kind===v?"border-blue-500 bg-blue-50 text-blue-700":"border-slate-200 text-slate-600"}`}>{l}</button>)}</div>
      : <div className="mb-4 text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600">{kind==="leave"?"Time off":kind==="internal"?"Task":"Project work"}</div>}
    <Field label={kind==="internal"?"Assign to":"Person"}><select className={inputCls} value={memberId} onChange={e=>setMemberId(e.target.value)}>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
    {kind==="work" ? (<>
      <Field label="Project"><select className={inputCls} value={projectId} onChange={e=>{ setProjectId(e.target.value);setPhaseId(""); }}>{projectsByClient(projects,clients).map(g=>(<optgroup key={g.client?g.client.id:"none"} label={g.client?g.client.name:"No client"}>{g.projects.map(p=><option key={p.id} value={p.id}>{p.index} — {p.name}</option>)}</optgroup>))}</select></Field>
      {client && <div className="-mt-1 mb-3 flex items-center gap-2 text-xs text-slate-500"><span className="w-3 h-3 rounded-sm" style={{background:client.color}}/>Client: <span className="font-medium text-slate-700">{client.name} · {proj.index} {proj.name}</span></div>}
      {proj?.phases?.length>0 && <Field label="Phase"><select className={inputCls} value={phaseId} onChange={e=>setPhaseId(e.target.value)}><option value="">— none —</option>{proj.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
      {phaseId && <Field label="Monitor designer hours for this phase (optional)"><input type="number" min="0" className={inputCls} value={phaseHours} onChange={e=>setPhaseHours(e.target.value)} placeholder="e.g. 20"/><p className="text-xs text-slate-400 mt-1">Sets the hours budget for this phase across the whole project — the bar fills up as time is logged. Leave blank for no monitoring.</p></Field>}
    </>) : kind==="internal" ? (<>
      <Field label="Task"><select className={inputCls} value={taskId} onChange={e=>setTaskId(e.target.value)}><option value="">Choose a task…</option>{tasks.filter(t=>t.status!=="done").map(t=><option key={t.id} value={t.id}>{t.title}</option>)}<option value="__new__">➕ New task…</option></select></Field>
      {taskId==="__new__" ? (<>
        <Field label="New task"><input className={inputCls} value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="e.g. Improve our SEO"/></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Importance"><select className={inputCls} value={taskPri} onChange={e=>setTaskPri(e.target.value)}><option value="high">High</option><option value="med">Medium</option><option value="low">Low</option></select></Field>
          <Field label="Team (optional)"><input className={inputCls} value={taskTeam} list="assign-teams" onChange={e=>setTaskTeam(e.target.value)} placeholder="optional"/><datalist id="assign-teams">{teams.map(t=><option key={t} value={t}/>)}</datalist></Field>
        </div>
        <p className="text-xs text-slate-400 -mt-1 mb-1">Creates the task on the Tasks board and puts it on this person's timeline.</p>
      </>) : <p className="text-xs text-slate-400 -mt-1 mb-1">Puts this task on the person's timeline so it shows as one of today's projects and can be tracked.</p>}
    </>) : (
      <Field label="Type"><select className={inputCls} value={leaveType} onChange={e=>setLeaveType(e.target.value)}>{Object.entries(LEAVE_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Field>
    )}
    <div className="grid grid-cols-3 gap-3">
      <Field label="Start date"><input type="date" className={inputCls} value={start} onChange={e=>onStartCh(e.target.value)}/></Field>
      <Field label="Duration (weeks)"><input type="number" min="0.2" step="0.5" className={inputCls} value={dur} onChange={e=>onDurCh(e.target.value)}/></Field>
      <Field label="End date"><input type="date" className={inputCls} value={end} onChange={e=>onEndCh(e.target.value)}/></Field>
    </div>
    <p className="text-xs text-slate-400 -mt-1">Set a start + duration and the end fills in (1 week = 5 working days), or pick the end date directly.</p>
    {kind==="leave" && <div className="mt-2 mb-1">
      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={partDay} onChange={e=>setPartDay(e.target.checked)} className="w-4 h-4"/> Part-day (take only part of the first / last day)</label>
      {partDay && <div className="mt-2 grid grid-cols-2 gap-3">
        <Field label="First day starts"><input type="time" className={inputCls} value={sTime} onChange={e=>setSTime(e.target.value)}/></Field>
        <Field label="Last day ends"><input type="time" className={inputCls} value={eTime} onChange={e=>setETime(e.target.value)}/></Field>
        <p className="col-span-2 text-xs text-slate-400 -mt-2">Based on a {WORKDAY_H}-hour day ({pad(WORK_START)}:00–{pad(WORK_END)}:00). For a single-day half, set both times on that day (e.g. 09:00–13:00 = half a day).</p>
      </div>}
    </div>}
    <p className="text-xs text-slate-400 mt-3">Tip: on the board you can drag the bar to move it, or drag either end to change the dates.</p>
  </div>
  <ModalFoot onSave={save} onDelete={onDelete?()=>onDelete(assignment.id):null} saveLabel={assignment?"Save":"Assign"}/></ModalShell>);
}
function DashTracker(ctx){
  const { data, myMemberId, addTimeLog, updateTimeLog, editTimeLog, delTimeLogs } = ctx;
  const meId=myMemberId;
  const [open,setOpen]=useState(false);
  const [run,setRun]=useState(()=> meId? lsGet("tracker_run_"+meId): null);
  const [now,setNow]=useState(Date.now());
  const [selP,setSelP]=useState(""),[selPh,setSelPh]=useState("");
  const [mP,setMP]=useState(""),[mPh,setMPh]=useState(""),[mDate,setMDate]=useState(toISO(startOfDay(new Date()))),[mH,setMH]=useState(1),[mM,setMM]=useState(0);
  const [editId,setEditId]=useState(null),[eH,setEH]=useState(0),[eM,setEM]=useState(0),[eProj,setEProj]=useState(""),[ePh,setEPh]=useState("");
  const [logOpen,setLogOpen]=useState(false);
  const pip=useRef(null), pipActions=useRef({});
  const closePip=()=>{ if(pip.current){ try{pip.current.close();}catch(_){} pip.current=null; } };
  useEffect(()=>{ if(!run) return; const t=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(t); },[run]);
  useEffect(()=>{ setRun(meId? lsGet("tracker_run_"+meId): null); },[meId]);
  useEffect(()=>{ if(!run) closePip(); },[run]); // eslint-disable-line
  useEffect(()=>()=>closePip(),[]); // eslint-disable-line
  if(!meId) return (<div className="shrink-0 mt-2.5 px-3 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm text-xs text-slate-400 flex items-center gap-2"><Clock size={14}/> We couldn't match your login to a person on this team yet.</div>);
  const me=data.members.find(m=>m.id===meId);
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
  data.assignments.filter(a=>a.memberId===meId&&a.kind==="work"&&a.start<=todayISO&&a.end>=todayISO).sort((a,b)=>parseISO(a.start)-parseISO(b.start)).forEach(a=>addBub(a.projectId,a.phaseId));
  const internalAsgToday=data.assignments.filter(a=>a.memberId===meId&&a.kind==="internal"&&a.taskId&&a.start<=todayISO&&a.end>=todayISO);
  const asgTaskIds=new Set(internalAsgToday.map(a=>a.taskId));
  internalAsgToday.forEach(a=>{ const k="task:"+a.taskId; if(seen.has(k)) return; seen.add(k); bubbles.push({taskId:a.taskId,internal:true}); });
  const myTasks=(data.internalTasks||[]).filter(t=>t.assigneeId===meId&&t.status!=="done"&&!asgTaskIds.has(t.id));
  const todayEntries=(data.timeLogs||[]).filter(l=>l.memberId===meId&&l.date===todayISO);
  const start=(pid,phid)=>{ if(!pid) return; const r={projectId:pid,phaseId:phid||null,taskId:null,startedAt:Date.now()}; lsSet("tracker_run_"+meId,r); setRun(r); };
  const startTask=(tid)=>{ if(!tid) return; const r={projectId:null,phaseId:null,taskId:tid,startedAt:Date.now()}; lsSet("tracker_run_"+meId,r); setRun(r); };
  const stop=()=>{ if(!run) return; const mins=Math.max(1,Math.round((Date.now()-run.startedAt)/60000)); addTimeLog({memberId:meId,projectId:run.projectId,phaseId:run.phaseId,taskId:run.taskId,date:todayISO,minutes:mins,source:"timer"}); lsSet("tracker_run_"+meId,null); setRun(null); };
  const cancel=()=>{ lsSet("tracker_run_"+meId,null); setRun(null); };
  const addManual=()=>{ const mins=Math.max(0,Number(mH||0)*60+Number(mM||0)); if(!mP||mins<=0) return; addTimeLog({memberId:meId,projectId:mP,phaseId:mPh||null,date:mDate||todayISO,minutes:mins,source:"manual"}); setMH(1); setMM(0); };
  const beginEdit=(l)=>{ setEditId(l.id); setEH(Math.floor(l.minutes/60)); setEM(l.minutes%60); setEProj(l.projectId||""); setEPh(l.phaseId||""); };
  const saveEdit=(l)=>{ const mins=Math.max(0,Number(eH||0)*60+Number(eM||0)); if(l.taskId) editTimeLog(editId,{minutes:mins}); else editTimeLog(editId,{minutes:mins,projectId:eProj||null,phaseId:ePh||null}); setEditId(null); };
  const selproj=projById(selP);
  const elapsed=run?fmtClock((now-run.startedAt)/1000):null;
  const mproj=projById(mP);
  const runTop=()=> run? (run.taskId? "Task · "+((taskById(run.taskId)||{}).title||"task") : labProj(run.projectId)) : "—";
  const runColor=()=> run? (run.taskId? NAVY : colorOf(run.projectId)) : "#64748b";
  const grp=(g)=>(<optgroup key={g.client?g.client.id:"none"} label={g.client?g.client.name:"No client"}>{g.projects.map(p=><option key={p.id} value={p.id}>{p.index} — {p.name}</option>)}</optgroup>);
  const groups=projectsByClient(data.projects,data.clients);
  pipActions.current={ run, stop, top:runTop };
  const openPip=async()=>{
    if(!run) return; if(pip.current){ try{pip.current.win.focus();}catch(_){} return; }
    const ctl=await openFloatingTimer({
      getTop:()=>{ const a=pipActions.current; return a.top?a.top():"—"; },
      getElapsed:()=>{ const r=pipActions.current.run; return r?fmtClock((Date.now()-r.startedAt)/1000):"0:00:00"; },
      onStop:()=>{ const s=pipActions.current.stop; if(s) s(); },
    });
    if(ctl) pip.current=ctl;
  };
  return (
    <div className="shrink-0 mt-2.5 bg-white border border-slate-200 rounded-xl shadow-sm">
      <div onClick={()=>setOpen(o=>!o)} className="flex items-center gap-3 px-3 py-2 cursor-pointer select-none">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 shrink-0"><Clock size={15}/> Tracker <ChevronRight size={14} style={{transform:open?"rotate(90deg)":"none",transition:"transform .15s"}}/></span>
        {run ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-white text-sm min-w-0" style={{background:runColor()}}>
              <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" style={{animation:"pulse 1.5s infinite"}}/>
              <span className="truncate font-semibold">{runTop()}</span>
              {!run.taskId && phName(run.projectId,run.phaseId) && <span className="truncate opacity-90 hidden sm:inline">· {phName(run.projectId,run.phaseId)}</span>}
              <span className="font-bold tabular-nums shrink-0">{elapsed}</span>
            </span>
            <button onClick={e=>{e.stopPropagation();stop();}} className="flex items-center gap-1.5 bg-slate-800 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-900 shrink-0"><Square size={14}/> Stop &amp; log</button>
            <button onClick={e=>{e.stopPropagation();openPip();}} title="Pop out a floating timer" className="grid place-items-center w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 shrink-0"><PictureInPicture2 size={16}/></button>
            <button onClick={e=>{e.stopPropagation();cancel();}} title="Discard" className="text-slate-400 hover:text-red-500 shrink-0"><X size={16}/></button>
          </div>
        ) : (
          <span className="text-sm text-slate-400 truncate">{me?me.name+" — tap a project to start":"Not tracking"}</span>
        )}
        <button onClick={e=>{e.stopPropagation(); ctx.openTrackerPage&&ctx.openTrackerPage();}} className="ml-auto text-xs text-blue-600 hover:underline shrink-0">Open full tracker →</button>
      </div>
      {open && !run && <div className="px-3 pb-3 border-t border-slate-100 pt-2.5">
        <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
          {bubbles.length===0 && myTasks.length===0 && <span className="text-xs text-slate-400 py-2">Nothing assigned to you today — use Manual below, or book yourself on the board.</span>}
          {bubbles.map(b=>{ if(b.internal){ const tt=((taskById(b.taskId))||{}).title||"task"; return (
            <button key={"ib:"+b.taskId} onClick={()=>startTask(b.taskId)} title={"Start · Task · "+tt}
              className="shrink-0 text-left rounded-xl px-3 py-2 text-white transition hover:brightness-110" style={{background:NAVY,minWidth:150,maxWidth:230}}>
              <div className="flex items-center gap-2">
                <span className="grid place-items-center w-6 h-6 rounded-full bg-white shrink-0" style={{color:NAVY}}><Play size={12}/></span>
                <div className="min-w-0"><div className="text-xs font-semibold leading-tight truncate">Task</div><div className="opacity-90 leading-tight truncate" style={{fontSize:11}}>{tt}</div></div>
              </div>
              <div className="opacity-80 mt-1" style={{fontSize:10.5}}>Today {hm(minsForTask(b.taskId))}</div>
            </button>); } const c=colorOf(b.projectId); return (
            <button key={b.projectId+"|"+b.phaseId} onClick={()=>start(b.projectId,b.phaseId)} title={"Start · "+labTop(b.projectId)+(phName(b.projectId,b.phaseId)?" · "+phName(b.projectId,b.phaseId):"")}
              className="shrink-0 text-left rounded-xl px-3 py-2 text-white transition hover:brightness-110" style={{background:c,minWidth:150,maxWidth:230}}>
              <div className="flex items-center gap-2">
                <span className="grid place-items-center w-6 h-6 rounded-full bg-white shrink-0" style={{color:c}}><Play size={12}/></span>
                <div className="min-w-0"><div className="text-xs font-semibold leading-tight truncate">{labProj(b.projectId)}</div><div className="opacity-90 leading-tight truncate" style={{fontSize:11}}>{phName(b.projectId,b.phaseId)||"—"}</div></div>
              </div>
              <div className="opacity-80 mt-1" style={{fontSize:10.5}}>Today {hm(minsFor(b.projectId,b.phaseId))}</div>
            </button>);})}
          {myTasks.map(t=>(
            <button key={"task:"+t.id} onClick={()=>startTask(t.id)} title={"Start · Task · "+t.title}
              className="shrink-0 text-left rounded-xl px-3 py-2 text-white transition hover:brightness-110" style={{background:NAVY,minWidth:150,maxWidth:230}}>
              <div className="flex items-center gap-2">
                <span className="grid place-items-center w-6 h-6 rounded-full bg-white shrink-0" style={{color:NAVY}}><Play size={12}/></span>
                <div className="min-w-0"><div className="text-xs font-semibold leading-tight truncate">Task</div><div className="opacity-90 leading-tight truncate" style={{fontSize:11}}>{t.title}</div></div>
              </div>
              <div className="opacity-80 mt-1" style={{fontSize:10.5}}>Today {hm(minsForTask(t.id))}</div>
            </button>))}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1 w-36 shrink-0"><Play size={12}/> Start another</span>
          <select value={selP} onChange={e=>{setSelP(e.target.value);setSelPh("");}} className="w-48 shrink-0 text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"><option value="">Project…</option>{groups.map(grp)}</select>
          {selproj?.phases?.length>0 && <select value={selPh} onChange={e=>setSelPh(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"><option value="">No phase</option>{selproj.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <button onClick={()=>{ start(selP,selPh); setSelP(""); setSelPh(""); }} disabled={!selP} className="flex items-center gap-1.5 bg-green-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-40"><Play size={14}/> Start</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1 w-36 shrink-0"><Plus size={12}/> Log time manually</span>
          <select value={mP} onChange={e=>{setMP(e.target.value);setMPh("");}} className="w-48 shrink-0 text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"><option value="">Project…</option>{groups.map(grp)}</select>
          {mproj?.phases?.length>0 && <select value={mPh} onChange={e=>setMPh(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"><option value="">No phase</option>{mproj.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <input type="date" value={mDate} onChange={e=>setMDate(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"/>
          <input type="number" min="0" value={mH} onChange={e=>setMH(e.target.value)} className="w-12 text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"/><span className="text-xs text-slate-400">h</span>
          <input type="number" min="0" max="59" value={mM} onChange={e=>setMM(e.target.value)} className="w-12 text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"/><span className="text-xs text-slate-400">m</span>
          <button onClick={addManual} disabled={!mP} className="bg-blue-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-40">Add</button>
        </div>
        <div className="mt-3 pt-2.5 border-t border-slate-100">
          <button onClick={()=>setLogOpen(o=>!o)} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
            <ChevronRight size={13} style={{transform:logOpen?"rotate(90deg)":"none",transition:"transform .15s"}}/> Logged today <span className="font-semibold text-slate-700">{hm(todayMins)}</span>
          </button>
          {logOpen && <div className="flex flex-col gap-1 mt-2">
            {todayEntries.length===0 && <span className="text-xs text-slate-400">Nothing logged yet today.</span>}
            {todayEntries.map(l=>{ const editing=editId===l.id; return (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{background:l.taskId?NAVY:colorOf(l.projectId)}}/>
                <span className="text-slate-700 truncate">{l.taskId?("Task · "+((taskById(l.taskId)||{}).title||"task")):(labProj(l.projectId)+(phName(l.projectId,l.phaseId)?" · "+phName(l.projectId,l.phaseId):""))}</span>
                <span className="text-slate-300" style={{fontSize:11}}>{l.source}</span>
                {editing ? (<span className="ml-auto flex items-center gap-1 flex-wrap justify-end">
                  {!l.taskId && <select value={eProj} onChange={e=>{setEProj(e.target.value);setEPh("");}} className="text-xs rounded border border-slate-200 px-1 py-1 outline-none max-w-[120px]"><option value="">No project</option>{groups.map(grp)}</select>}
                  {!l.taskId && projById(eProj)?.phases?.length>0 && <select value={ePh} onChange={e=>setEPh(e.target.value)} className="text-xs rounded border border-slate-200 px-1 py-1 outline-none max-w-[110px]"><option value="">No phase</option>{projById(eProj).phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
                  <input type="number" min="0" value={eH} onChange={e=>setEH(e.target.value)} className="w-11 rounded border border-slate-200 px-1.5 py-1 outline-none"/><span className="text-xs text-slate-400">h</span>
                  <input type="number" min="0" max="59" value={eM} onChange={e=>setEM(e.target.value)} className="w-11 rounded border border-slate-200 px-1.5 py-1 outline-none"/><span className="text-xs text-slate-400">m</span>
                  <button onClick={()=>saveEdit(l)} className="text-xs font-semibold text-white bg-blue-600 px-2 py-1 rounded">Save</button>
                  <button onClick={()=>setEditId(null)} className="text-slate-400 hover:text-slate-700"><X size={15}/></button>
                </span>) : (<span className="ml-auto flex items-center gap-2">
                  <span className="font-medium text-slate-700 tabular-nums">{hm(l.minutes)}</span>
                  <button onClick={()=>beginEdit(l)} className="text-slate-300 hover:text-blue-600"><Pencil size={13}/></button>
                  <button onClick={()=>delTimeLogs([l.id])} className="text-slate-300 hover:text-red-500"><Trash2 size={13}/></button>
                </span>)}
              </div>);})}
          </div>}
        </div>
      </div>}
    </div>
  );
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

function ProposalForm({ clients, members, anchor, onCreate, onClose }) {
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
  const togglePerson=(id)=>setPeople(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
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
    return (<ModalShell onClose={onClose}><ModalHead title="New project from a proposal" onClose={onClose}/><div className="p-5">
      <p className="text-sm text-slate-500 mb-4 flex items-start gap-2"><Sparkles size={16} className="text-violet-500 mt-0.5 shrink-0"/> Drop in a proposal and AI will pull out the client, phases, durations and value for you to review.</p>
      <label className="block border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/40 mb-3">
        <input type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain" className="hidden" onChange={e=>onFile(e.target.files[0])}/>
        <Upload size={20} className="mx-auto text-slate-400 mb-1"/>
        <div className="text-sm text-slate-600">{fileName?<span className="inline-flex items-center gap-1.5 text-slate-800 font-medium"><FileText size={14}/>{fileName}</span>:"Click to choose a PDF or text file"}</div>
        <div className="text-slate-400 mt-0.5" style={{fontSize:11}}>PDF or text file.</div>
      </label>
      <div className="text-xs text-slate-400 mb-1">…or paste the proposal text</div>
      <textarea value={paste} onChange={e=>setPaste(e.target.value)} rows={5} className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-violet-400 mb-3" placeholder="Paste here…"/>
      <Field label="Project start date"><input type="date" className={inputCls} value={startDate} onChange={e=>setStartDate(e.target.value)}/></Field>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
    </div>
    <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100">
      <button onClick={extract} disabled={busy} className="ml-auto flex items-center gap-2 text-sm bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-60"><Sparkles size={15}/> {busy?"Reading proposal…":"Extract with AI"}</button>
    </div></ModalShell>);
  }
  return (<ModalShell onClose={onClose}><ModalHead title="Review & create" onClose={onClose}/><div className="p-5">
    {confidence && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0"/><span>{confidence} — check everything below before creating.</span></div>}
    <Field label="Client">
      <div className="flex gap-2 mb-2">{[["existing","Existing"],["new","New client"]].map(([v,l])=><button key={v} onClick={()=>setClientMode(v)} className={`flex-1 text-sm py-2 rounded-lg border ${clientMode===v?"border-violet-500 bg-violet-50 text-violet-700":"border-slate-200 text-slate-600"}`}>{l}</button>)}</div>
      {clientMode==="existing"
        ? <select className={inputCls} value={existingClientId} onChange={e=>setExistingClientId(e.target.value)}>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        : <div><input className={inputCls+" mb-2"} value={newClientName} onChange={e=>setNewClientName(e.target.value)} placeholder="Client name"/><div className="flex flex-wrap gap-2">{CLIENT_COLORS.map(c=><button key={c} onClick={()=>setNewClientColor(c)} className="w-7 h-7 rounded-lg" style={{background:c,outline:newClientColor===c?"2px solid #1e293b":"none",outlineOffset:2}}/>)}</div></div>}
    </Field>
    <div className="grid grid-cols-3 gap-3">
      <div className="col-span-1"><Field label="Code"><input className={inputCls} value={code} onChange={e=>setCode(e.target.value)} placeholder={autoCode()}/></Field></div>
      <div className="col-span-2"><Field label="Project name"><input className={inputCls} value={projectName} onChange={e=>setProjectName(e.target.value)}/></Field></div>
    </div>
    <Field label={`Project value ${currency?"("+currency+")":""}`}><input type="number" min="0" className={inputCls} value={cost} onChange={e=>setCost(e.target.value)} placeholder="0"/></Field>
    <Field label="Phases & durations (working days)">
      <div className="space-y-1.5 mb-2">{phases.map((p,i)=>(
        <div key={p.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-2.5 py-1.5">
          <span className="text-xs text-slate-400 w-4">{i+1}</span>
          <input className="flex-1 bg-transparent outline-none" value={p.name} onChange={e=>setPhases(phases.map(x=>x.id===p.id?{...x,name:e.target.value}:x))}/>
          <input type="number" min="1" className="w-14 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs" value={p.days} onChange={e=>setPhases(phases.map(x=>x.id===p.id?{...x,days:Number(e.target.value)}:x))}/>
          <span className="text-xs text-slate-400">d</span>
          <button onClick={()=>setPhases(phases.filter(x=>x.id!==p.id))} className="text-slate-400 hover:text-red-500"><X size={14}/></button>
        </div>))}
      </div>
      <button onClick={()=>setPhases([...phases,{id:uid(),name:"",days:5}])} className="text-xs flex items-center gap-1 text-slate-500 hover:text-slate-800"><Plus size={13}/> Add phase</button>
    </Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Start date"><input type="date" className={inputCls} value={startDate} onChange={e=>setStartDate(e.target.value)}/></Field>
      <Field label="Finishes (calculated)"><div className={inputCls+" bg-slate-50 text-slate-500"}>{lastEnd?`${pad(parseISO(lastEnd).getDate())} ${MONTHS[parseISO(lastEnd).getMonth()]} ${parseISO(lastEnd).getFullYear()}`:"—"}</div></Field>
    </div>
    <Field label="Assign people (one bar per phase each)">
      <div className="flex flex-wrap gap-1.5">{members.map(m=>(<button key={m.id} onClick={()=>togglePerson(m.id)} className={`text-xs px-2.5 py-1.5 rounded-lg border ${people.includes(m.id)?"border-violet-500 bg-violet-50 text-violet-700":"border-slate-200 text-slate-600"}`}>{m.name}</button>))}</div>
      {people.length===0 && <p className="text-xs text-slate-400 mt-1">Optional — leave empty to create the project with no one scheduled yet.</p>}
    </Field>
    {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
  </div>
  <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100">
    <button onClick={()=>{setStep("input");setError("");}} className="flex items-center gap-1 text-sm text-slate-500 hover:bg-slate-100 px-2.5 py-2 rounded-lg"><ArrowLeft size={15}/> Back</button>
    <button onClick={confirm} className="ml-auto text-sm bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700">Create project &amp; schedule</button>
  </div></ModalShell>);
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

export default function Schedule({ org, me, data: cadData, reload, onNavigate, peopleFilter: pfProp, onPeopleFilter }) {
  const canEdit = can(me, "schedule.edit");
  const [anchor,setAnchor]=useState(()=>startOfDay(new Date()));
  const [zoomT,setZoomT]=useState(0.55);
  const [pfLocal,setPfLocal]=useState("all");
  const peopleFilter = pfProp!==undefined ? pfProp : pfLocal;
  const setPeopleFilter = onPeopleFilter || setPfLocal;
  const [holidayFilter,setHolidayFilter]=useState("show");
  const [clientFilter,setClientFilter]=useState("all");
  const [q,setQ]=useState("");
  const [modal,setModal]=useState(null);
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
  const addTimeLog=async({memberId,projectId,phaseId,taskId,date,minutes,source})=>{ await sb.from("time_logs").insert({org_id:org.id,membership_id:memberId,project_id:projectId||null,phase_id:phaseId||null,task_id:taskId||null,log_date:date,minutes,source:source||"manual"}); reload(); };
  const updateTimeLog=async(id,minutes)=>{ if(minutes<=0){ await sb.from("time_logs").delete().eq("id",id); } else { await sb.from("time_logs").update({minutes}).eq("id",id); } reload(); };
  const editTimeLog=async(id,patch)=>{ const row={}; if(patch.minutes!=null) row.minutes=patch.minutes; if("projectId" in patch) row.project_id=patch.projectId||null; if("phaseId" in patch) row.phase_id=patch.phaseId||null; if("taskId" in patch) row.task_id=patch.taskId||null; if(patch.minutes!=null && patch.minutes<=0){ await sb.from("time_logs").delete().eq("id",id); } else { await sb.from("time_logs").update(row).eq("id",id); } reload(); };
  const delTimeLogs=async(ids)=>{ if(!ids||!ids.length) return; await sb.from("time_logs").delete().in("id",ids); reload(); };
  const createFromProposal=async({newClient,project,assignments})=>{ let clientId=project.clientId; if(newClient){ const {data:c}=await sb.from("clients").insert({org_id:org.id,name:newClient.name,color:newClient.color,payment_terms:30}).select().single(); clientId=c&&c.id; } const {data:p}=await sb.from("projects").insert({org_id:org.id,code:project.index,name:project.name,client_id:clientId,cost:project.cost,phases:project.phases}).select().single(); const projId=p&&p.id; if(projId&&assignments.length){ const rows=assignments.map(a=>({org_id:org.id,kind:"work",membership_id:a.memberId,project_id:projId,phase_id:a.phaseId||null,start_date:a.start,end_date:a.end})); await sb.from("assignments").insert(rows); } setModal(null); reload(); };

  const ctx={ data:dataView, anchor, matches, setModal, moveAssign, peopleFilter, zoomT, holidayFilter, boardScroll, phaseLogged, projectById, clientById, colorOf, canEdit, myMemberId:me.id, addTimeLog, updateTimeLog, editTimeLog, delTimeLogs, openTrackerPage:()=>onNavigate&&onNavigate("tracker") };

  if(!can(me,"schedule.view")) return <NoAccess what="the schedule" />;
  const step=(dir)=>setAnchor(a=>addMonths(a,dir));

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b border-slate-200">
        <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
          <button onClick={()=>step(-1)} className="px-2 py-1.5 hover:bg-slate-50"><ChevronLeft size={16}/></button>
          <button onClick={()=>setAnchor(startOfDay(new Date()))} className="px-3 py-1.5 text-sm hover:bg-slate-50 border-x border-slate-200">Today</button>
          <button onClick={()=>step(1)} className="px-2 py-1.5 hover:bg-slate-50"><ChevronRight size={16}/></button>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-500">
          <Calendar size={15}/><input type="date" value={toISO(anchor)} onChange={e=>e.target.value&&setAnchor(parseISO(e.target.value))} className="text-sm outline-none bg-transparent"/>
        </div>
        <div className="text-sm font-semibold text-slate-700 px-1 hidden md:block">{MONTHS_LONG[anchor.getMonth()]} {anchor.getFullYear()}</div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5"><Search size={14} className="text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search" className="text-sm outline-none w-24 sm:w-32 bg-transparent"/></div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5"><PeoplePicker members={data.members} teams={teams} value={peopleFilter} onChange={setPeopleFilter} me={me.id}/></div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5"><Plane size={14} className="text-slate-400"/><select value={holidayFilter} onChange={e=>setHolidayFilter(e.target.value)} className="text-sm outline-none bg-transparent"><option value="show">Holidays: show</option><option value="hide">Holidays: hide</option><option value="only">Holidays: only</option></select></div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5"><ClientPicker clients={data.clients} value={clientFilter} onChange={setClientFilter}/></div>
          {canEdit && <button onClick={()=>setModal({type:"proposal"})} className="flex items-center gap-1.5 text-sm px-2.5 h-8 rounded-lg text-white hover:brightness-110" style={{background:"#7c3aed"}}><Sparkles size={15}/> <span className="hidden sm:inline">Proposal</span></button>}
          {canEdit && <button onClick={()=>setModal({type:"assign"})} className="flex items-center gap-1.5 text-sm px-2.5 h-8 rounded-lg text-white" style={{background:"#2f6fed"}}><Plus size={15}/> <span className="hidden sm:inline">Assign Work</span></button>}
        </div>
      </div>

      <div className="flex-1 min-h-0"><TimelineBoard {...ctx} /></div>

      <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 bg-white border-x border-b border-slate-200 text-xs text-slate-500">
        <span className="font-medium text-slate-600">Clients:</span>
        {data.clients.map(c=>(<button key={c.id} onClick={()=>canEdit&&setModal({type:"client",payload:c})} className="flex items-center gap-1.5 hover:text-slate-800 group"><span className="w-3 h-3 rounded-sm" style={{background:c.color}}/>{c.name}{canEdit&&<Pencil size={11} className="opacity-0 group-hover:opacity-60"/>}</button>))}
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{background:LEAVE_TYPES.vacation.color}}/>Time off</span>
        <div className="mx-auto flex items-center gap-2">
          <button onClick={()=>boardScroll.current?.nudge(-1)} title="Move left" className="grid place-items-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronLeft size={18}/></button>
          <span className="text-slate-400 hidden md:inline">use mouse wheel or click empty area to move</span>
          <button onClick={()=>boardScroll.current?.nudge(1)} title="Move right" className="grid place-items-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronRight size={18}/></button>
        </div>
        <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
          <button onClick={()=>setZoomT(z=>Math.max(0,Math.round((z-0.2)*10)/10))} disabled={zoomT<=0} className="grid place-items-center w-10 h-9 hover:bg-slate-50 disabled:opacity-30"><ZoomOut size={20}/></button>
          <span className="px-1.5 text-slate-400 border-x border-slate-200 select-none" style={{fontSize:11}}>Zoom</span>
          <button onClick={()=>setZoomT(z=>Math.min(1,Math.round((z+0.2)*10)/10))} disabled={zoomT>=1} className="grid place-items-center w-10 h-9 hover:bg-slate-50 disabled:opacity-30"><ZoomIn size={20}/></button>
        </div>
      </div>

      <DashTracker {...ctx} />

      {modal?.type==="assign" && <AssignForm assignment={modal.payload&&modal.payload.id?modal.payload:null} preset={modal.payload} members={data.members} projects={data.projects} clients={data.clients} anchor={anchor} tasks={data.internalTasks||[]} teams={teams}
        onInternalAssign={(x)=>{ saveInternalAssign(x); setModal(null); }} onSave={(a,ph)=>{ saveAssignment(a,ph); setModal(null); }} onDelete={modal.payload&&modal.payload.id?id=>{ delAssign(id); setModal(null); }:null} onClose={()=>setModal(null)} />}
      {modal?.type==="member" && <MemberForm org={org} member={modal.payload} teams={teams} canEdit={canEdit} onClose={()=>setModal(null)} onSaved={()=>{ setModal(null); reload(); }} />}
      {modal?.type==="client" && <ClientForm org={org} client={modal.payload} canEdit={canEdit} onClose={()=>setModal(null)} onSaved={()=>{ setModal(null); reload(); }} />}
      {modal?.type==="proposal" && <ProposalForm clients={data.clients} members={data.members} anchor={anchor} onCreate={createFromProposal} onClose={()=>setModal(null)} />}
    </div>
  );
}

function ClientForm({ org, client, canEdit, onClose, onSaved }){
  const [name,setName]=useState(client?.name||"");
  const [color,setColor]=useState(client?.color||CLIENT_COLORS[0]);
  const [terms,setTerms]=useState(client?.paymentTerms??30);
  const [addr,setAddr]=useState(client?.billingAddress||"");
  const save=async()=>{ const row={org_id:org.id,name:name.trim(),color,payment_terms:Number(terms)||30,billing_address:addr.trim()||null}; if(client) await sb.from("clients").update(row).eq("id",client.id); else await sb.from("clients").insert(row); onSaved(); };
  const del=async()=>{ if(!confirm("Delete this client?")) return; await sb.from("clients").delete().eq("id",client.id); onSaved(); };
  return (<ModalShell onClose={onClose}><ModalHead title={client?"Edit client":"Add client"} onClose={onClose}/><div className="p-5">
    <Field label="Client name"><input className={inputCls} disabled={!canEdit} value={name} onChange={e=>setName(e.target.value)}/></Field>
    <Field label="Colour"><div className="flex flex-wrap gap-2">{CLIENT_COLORS.map(c=><button key={c} disabled={!canEdit} onClick={()=>setColor(c)} className="w-8 h-8 rounded-lg" style={{background:c,outline:color===c?"2px solid #1e293b":"none",outlineOffset:2}}/>)}</div></Field>
    <Field label="Payment terms (days)"><input type="number" className={inputCls} disabled={!canEdit} value={terms} onChange={e=>setTerms(e.target.value)}/></Field>
    <Field label="Billing address (for invoices)"><textarea className={inputCls} rows={3} disabled={!canEdit} value={addr} onChange={e=>setAddr(e.target.value)}/></Field>
  </div>{canEdit?<ModalFoot onSave={save} onDelete={client?del:null} saveLabel="Save"/>:<div className="px-5 py-4 border-t border-slate-100 text-right"><button onClick={onClose} className="text-sm text-slate-500">Close</button></div>}</ModalShell>);
}

function MemberForm({ org, member, teams, canEdit, onClose, onSaved }){
  const [name,setName]=useState(member?.name||"");
  const [role,setRole]=useState(member?.role||"");
  const [daily,setDaily]=useState(member?.daily??8);
  const [allow,setAllow]=useState(member?.holidayAllowance??30);
  const [rate,setRate]=useState(member?.hourlyRate??"");
  const [sel,setSel]=useState(member?.teams||[]);
  const [newTeam,setNewTeam]=useState("");
  const toggle=(t)=>setSel(s=>s.includes(t)?s.filter(x=>x!==t):[...s,t]);
  const save=async()=>{ await sb.from("memberships").update({ display_name:name.trim(), job_title:role.trim()||null, daily_hours:Number(daily)||8, holiday_allowance:Number(allow)||0, hourly_rate:rate===""?null:Number(rate), teams:sel.length?sel:null }).eq("id",member.id); onSaved(); };
  return (<ModalShell onClose={onClose}><ModalHead title={"Edit "+(member?.name||"person")} onClose={onClose}/><div className="p-5">
    <Field label="Name"><input className={inputCls} disabled={!canEdit} value={name} onChange={e=>setName(e.target.value)}/></Field>
    <Field label="Job title / role"><input className={inputCls} disabled={!canEdit} value={role} onChange={e=>setRole(e.target.value)} placeholder="Designer"/></Field>
    <div className="grid grid-cols-3 gap-3">
      <Field label="Hours / day"><input type="number" className={inputCls} disabled={!canEdit} value={daily} onChange={e=>setDaily(e.target.value)}/></Field>
      <Field label="Holiday (days/yr)"><input type="number" className={inputCls} disabled={!canEdit} value={allow} onChange={e=>setAllow(e.target.value)}/></Field>
      <Field label="Rate (£/hr)"><input type="number" className={inputCls} disabled={!canEdit} value={rate} onChange={e=>setRate(e.target.value)} placeholder="—"/></Field>
    </div>
    <Field label="Teams"><div className="flex flex-wrap gap-1.5 mb-2">{teams.map(t=><button key={t} disabled={!canEdit} onClick={()=>toggle(t)} className={`text-xs px-2 py-1 rounded-full border ${sel.includes(t)?"text-white border-transparent":"border-slate-200 text-slate-600"}`} style={sel.includes(t)?{background:NAVY}:undefined}>{t}</button>)}</div>
      {canEdit && <div className="flex gap-2"><input className={inputCls} value={newTeam} onChange={e=>setNewTeam(e.target.value)} placeholder="New team name"/><button onClick={()=>{ if(newTeam.trim()&&!sel.includes(newTeam.trim())){ setSel([...sel,newTeam.trim()]); setNewTeam(""); } }} className="text-sm border border-slate-200 rounded-lg px-3">Add</button></div>}
    </Field>
    <p className="text-[11px] text-slate-400">Roles, permissions and invites are managed on the People page.</p>
  </div>{canEdit?<ModalFoot onSave={save} saveLabel="Save"/>:<div className="px-5 py-4 border-t border-slate-100 text-right"><button onClick={onClose} className="text-sm text-slate-500">Close</button></div>}</ModalShell>);
}
