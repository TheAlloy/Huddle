import React, { useState } from "react";
import { sb } from "../lib/supabase.js";
import { Users, ChevronRight, X, Trash2 } from "lucide-react";

/* constants */
export const MS = 86400000;
export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const WORK_START = 9, WORK_END = 17, WORKDAY_H = WORK_END - WORK_START;
export const NAVY = "#1f2d4e";
export const CLIENT_COLORS = ["#2f80ed","#9b51e0","#16a0a0","#eb5757","#27ae60","#f2994a","#2d9cdb","#6b7a99","#e84393","#8e44ad"];
export const AVATAR_BG = ["#5b8def","#9b6dd6","#3aa99f","#e0884b","#d65f6e","#4caf8f"];
export const LEAVE_TYPES = { vacation:{label:"Holiday",color:"#f2994a"}, parental:{label:"Parental Leave",color:"#e67e22"}, sick:{label:"Sick Leave",color:"#c0563f"}, holiday:{label:"Public Holiday",color:"#7f8fa6"} };
export const TASK_PRI = { high:{label:"High",color:"#eb5757"}, med:{label:"Medium",color:"#f59e0b"}, low:{label:"Low",color:"#94a3b8"} };
export const inputCls = "w-full text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-400";

/* pure helpers */
export const pad = (n) => String(n).padStart(2,"0");
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export const parseISO = (s) => { const [y,m,d]=String(s).split("-").map(Number); return new Date(y,m-1,d); };
export const startOfDay = (d) => { const x=new Date(d); x.setHours(0,0,0,0); return x; };
export const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
export const addMonths = (d,n) => new Date(d.getFullYear(), d.getMonth()+n, 1);
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth()+1, 0);
export const startOfWeekMon = (d) => { const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; };
export const isWeekday = (d) => { const g=d.getDay(); return g>=1 && g<=5; };
export const nextWeekday = (d) => { let x=new Date(d); while(!isWeekday(x)) x=addDays(x,1); return x; };
export const addWorkingDays = (start,n) => { let d=new Date(start),c=0; while(true){ if(isWeekday(d)) c++; if(c>=n) return new Date(d); d=addDays(d,1); } };
export const workdaysBetween = (s,e) => { let c=0; for(let d=new Date(s); d<=e; d=addDays(d,1)) if(isWeekday(d)) c++; return c; };
export const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);
export const initials = (name) => (name||"?").split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase();
export const minsOf = (t) => { const [h,m]=String(t).split(":").map(Number); return h*60+(m||0); };
export const fmtH = (n) => { const r=Math.round(n*10)/10; return Number.isInteger(r)?String(r):r.toFixed(1); };
export const money = (n) => "£"+(Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:0});
export const hm = (min) => { min=Math.round(min); const h=Math.floor(min/60),m=min%60; return h?(m?`${h}h ${m}m`:`${h}h`):`${m}m`; };
export const fmtClock = (sec) => { sec=Math.max(0,Math.floor(sec)); const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60; return `${pad(h)}:${pad(m)}:${pad(s)}`; };
export const clamp01 = (n) => Math.max(0,Math.min(1,n));
const hrs = (t) => { if(!t) return null; const [h,m]=String(t).split(":"); return Number(h)+Number(m||0)/60; };
export function leaveDayFraction(dISO, a){
  const st=hrs(a.startTime), et=hrs(a.endTime);
  if(a.start===a.end){ if(st==null&&et==null) return 1; const s=st??WORK_START, e=et??WORK_END; return clamp01((e-s)/WORKDAY_H); }
  if(dISO===a.start && st!=null) return clamp01((WORK_END-st)/WORKDAY_H);
  if(dISO===a.end && et!=null) return clamp01((et-WORK_START)/WORKDAY_H);
  return 1;
}
export function projectsByClient(projects, clients){
  const byId={}; clients.forEach(c=>{byId[c.id]={client:c,projects:[]};});
  const noClient={client:null,projects:[]};
  projects.forEach(p=>{ (byId[p.clientId]||noClient).projects.push(p); });
  const groups=clients.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>byId[c.id]).filter(g=>g.projects.length);
  if(noClient.projects.length) groups.push(noClient);
  return groups;
}
export function phaseRanges(startISO, phases){
  let cur=nextWeekday(parseISO(startISO)); const out=[];
  for(const ph of phases){ const days=Math.max(1,Math.round(ph.days||1)); const end=addWorkingDays(cur,days); out.push({ id:ph.id, start:toISO(cur), end:toISO(end) }); cur=nextWeekday(addDays(end,1)); }
  return out;
}
export function ordinal(n){ const s=["th","st","nd","rd"], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }
export function fmtDayOrdinal(d){ return `${ordinal(d.getDate())} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`; }
export function holidayYearOf(d){ const y=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1; return [startOfDay(new Date(y,3,1)), startOfDay(new Date(y+1,2,31))]; }
export const dRange = (s,e) => `${pad(s.getDate())} ${MONTHS[s.getMonth()]} – ${pad(e.getDate())} ${MONTHS[e.getMonth()]}`;
export const pfIncludes = (pf,id) => pf==="all" || (Array.isArray(pf)?pf.includes(id):pf===id);
export const pfList = (members,pf) => pf==="all"?members:members.filter(m=>pfIncludes(pf,m.id));
export const lsGet = (k) => { try{ const v=localStorage.getItem(k); return v==null?null:JSON.parse(v); }catch(_){ return null; } };
export const lsSet = (k,v) => { try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v)); }catch(_){} };
export function openFloatingTimer({ getTop, getElapsed, onStop }){
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

/* modal kit */
export function ModalShell({ children, onClose }){
  return (<div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>{children}</div>
  </div>);
}
export function ModalHead({ title, onClose }){ return <div className="flex items-center justify-between px-5 py-3.5 rounded-t-xl text-white" style={{background:NAVY}}><h3 className="font-semibold">{title}</h3><button onClick={onClose} className="opacity-80 hover:opacity-100"><X size={18}/></button></div>; }
export function ModalFoot({ onSave, onDelete, saveLabel="Save" }){ return <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100">{onDelete&&<button onClick={onDelete} className="flex items-center gap-1 text-sm text-red-600 hover:bg-red-50 px-2.5 py-2 rounded-lg"><Trash2 size={15}/> Delete</button>}<button onClick={onSave} className="ml-auto text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">{saveLabel}</button></div>; }
export function Field({ label, children }){ return <label className="block mb-3"><span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>{children}</label>; }
export function ToolBtn({ icon:Icon, label, onClick, primary }){ return <button onClick={onClick} className={`flex items-center gap-1.5 text-sm px-2.5 h-8 rounded-lg border transition ${primary?"bg-blue-600 text-white border-blue-600 hover:bg-blue-700":"border-slate-200 text-slate-600 hover:bg-slate-50"}`}><Icon size={15}/> <span className="hidden sm:inline">{label}</span></button>; }

export function PeoplePicker({ members, teams, value, onChange, me }){
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

/* Huddle <-> studio-shape adapter */
export function mapData(cad){
  return {
    members: (cad.members||[]).filter(m=>m.status!=="suspended").map(m=>({ id:m.id, name:m.display_name||m.email||"—", role:m.job_title||(m.role||""), email:m.email||"", teams:m.teams||[], daily:m.daily_hours||8, holidayAllowance:m.holiday_allowance??30, hourlyRate:m.hourly_rate })),
    clients: (cad.clients||[]).map(c=>({ id:c.id, name:c.name, color:c.color, paymentTerms:c.payment_terms, billingAddress:c.billing_address||"" })),
    projects: (cad.projects||[]).map(p=>({ id:p.id, index:p.code, name:p.name, clientId:p.client_id, phases:p.phases||[], cost:p.cost })),
    assignments: (cad.assignments||[]).map(a=>({ id:a.id, kind:a.kind==="task"?"internal":a.kind, memberId:a.membership_id, projectId:a.project_id, phaseId:a.phase_id, leaveType:a.leave_type, start:a.start_date, end:a.end_date, lane:Number.isFinite(a.lane)?a.lane:null, taskId:a.task_id, startTime:a.start_time, endTime:a.end_time, mode:a.mode, value:a.value })),
    timeLogs: (cad.timeLogs||[]).map(l=>({ id:l.id, memberId:l.membership_id, projectId:l.project_id, phaseId:l.phase_id, taskId:l.task_id, date:l.log_date, minutes:l.minutes, source:l.source||"manual" })),
    internalTasks: (cad.tasks||[]).map(t=>({ id:t.id, title:t.title, notes:t.notes||"", assigneeId:t.assignee_id, status:t.status, priority:t.priority, team:t.team, projectId:t.project_id, phaseId:t.phase_id, ord:t.ord })),
    publicHolidays: (cad.holidays||[]).map(h=>({ id:h.id, day:h.day, name:h.name||"" })),
    billing: (cad.billing||[]).map(b=>({ id:b.id, kind:b.kind, title:b.title||"", client:b.client||"", amount:Number(b.amount)||0, status:b.status||"", date:b.entry_date||"", projectId:b.project_id||null, memberId:b.membership_id||null, meta:b.meta||{}, createdAt:b.created_at||null })),
  };
}

/* Huddle-wired handlers (write to DB with org_id, then reload) */
export function makeHandlers(org, reload, cadData){
  const R = () => reload();
  return {
    addTimeLog: async ({memberId,projectId,phaseId,taskId,date,minutes,source}) => { await sb.from("time_logs").insert({org_id:org.id,membership_id:memberId,project_id:projectId||null,phase_id:phaseId||null,task_id:taskId||null,log_date:date,minutes,source:source||"manual"}); R(); },
    updateTimeLog: async (id,minutes) => { if(minutes<=0){ await sb.from("time_logs").delete().eq("id",id); } else { await sb.from("time_logs").update({minutes}).eq("id",id); } R(); },
    editTimeLog: async (id,patch) => { const row={}; if(patch.minutes!=null) row.minutes=patch.minutes; if("projectId" in patch) row.project_id=patch.projectId||null; if("phaseId" in patch) row.phase_id=patch.phaseId||null; if("taskId" in patch) row.task_id=patch.taskId||null; if(patch.minutes!=null && patch.minutes<=0){ await sb.from("time_logs").delete().eq("id",id); } else { await sb.from("time_logs").update(row).eq("id",id); } R(); },
    delTimeLogs: async (ids) => { if(!ids||!ids.length) return; await sb.from("time_logs").delete().in("id",ids); R(); },
    moveTimeLogs: async (ids,newDate) => { if(!ids||!ids.length||!newDate) return; await sb.from("time_logs").update({log_date:newDate}).in("id",ids); R(); },
    setTimeLogTotal: async ({ids,minutes,memberId,projectId,phaseId,taskId,date}) => {
      if(minutes<=0){ if(ids&&ids.length) await sb.from("time_logs").delete().in("id",ids); R(); return; }
      if(ids&&ids.length){ await sb.from("time_logs").update({minutes,project_id:projectId||null,phase_id:phaseId||null,task_id:taskId||null,log_date:date}).eq("id",ids[0]); if(ids.length>1) await sb.from("time_logs").delete().in("id",ids.slice(1)); }
      else { await sb.from("time_logs").insert({org_id:org.id,membership_id:memberId,project_id:projectId||null,phase_id:phaseId||null,task_id:taskId||null,log_date:date,minutes,source:"manual"}); }
      R();
    },
    patchMember: async (id,patch) => { const map={holidayAllowance:"holiday_allowance",hourlyRate:"hourly_rate",daily:"daily_hours",name:"display_name",role:"job_title",teams:"teams"}; const row={}; Object.entries(patch).forEach(([k,v])=>{ row[map[k]||k]=v; }); await sb.from("memberships").update(row).eq("id",id); R(); },
    addPublicHoliday: async (day,name) => { if(!day) return; await sb.from("public_holidays").insert({org_id:org.id,day,name:name||null}); R(); },
    delPublicHoliday: async (id) => { await sb.from("public_holidays").delete().eq("id",id); R(); },
    addTask: async (t) => { await sb.from("tasks").insert({org_id:org.id,title:t.title,notes:t.notes||null,assignee_id:t.assigneeId||null,team:t.team||null,priority:t.priority||"med",status:t.status||"todo",ord:Number.isFinite(t.ord)?t.ord:Date.now(),project_id:t.projectId||null,phase_id:t.phaseId||null}); R(); },
    editTask: async (t) => { await sb.from("tasks").update({title:t.title,notes:t.notes||null,assignee_id:t.assigneeId||null,team:t.team||null,priority:t.priority||"med",status:t.status||"todo",ord:Number.isFinite(t.ord)?t.ord:0,project_id:t.projectId||null,phase_id:t.phaseId||null}).eq("id",t.id); R(); },
    delTask: async (id) => { await sb.from("tasks").delete().eq("id",id); R(); },
    addBilling: async (b) => { await sb.from("billing_entries").insert({ org_id:org.id, kind:b.kind, title:b.title||null, client:b.client||null, amount:Number(b.amount)||0, status:b.status||null, entry_date:b.date||null, project_id:b.projectId||null, membership_id:b.memberId||null, meta:b.meta||{} }); R(); },
    editBilling: async (b) => { await sb.from("billing_entries").update({ kind:b.kind, title:b.title||null, client:b.client||null, amount:Number(b.amount)||0, status:b.status||null, entry_date:b.date||null, project_id:b.projectId||null, membership_id:b.memberId||null, meta:b.meta||{} }).eq("id",b.id); R(); },
    delBilling: async (id) => { await sb.from("billing_entries").delete().eq("id",id); R(); },
  };
}
