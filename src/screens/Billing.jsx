import React, { useState, useMemo, useCallback, useRef } from "react";
import { sb } from "../lib/supabase.js";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { ProjectModal } from "./Projects.jsx";
import { MS, MONTHS, MONTHS_LONG, NAVY, CLIENT_COLORS, uid, pad, toISO, parseISO, startOfDay, addDays, addMonths, startOfMonth, endOfMonth, nextWeekday, money, phaseRanges, pfIncludes, PeoplePicker, ModalShell, ModalHead, ModalFoot, mapData, makeHandlers } from "../studio/core.jsx";
import { Field } from "../ui.jsx";
import { toast } from "@/components/ui/toast";
import { Plus, Minus, Pencil, Trash2, Download, Mail } from "lucide-react";
import { useConfirm } from "../components/confirm.tsx";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FieldGroup } from "@/components/ui/field";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Calendar as CalendarIcon } from "lucide-react";

/* ---- fiscal-year (April → March) ---- */
const FY_MONTHS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
const fyStartDate = (ref) => { const n = ref || new Date(); const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1; return new Date(y, 3, 1); };
const fyIndexOf = (iso, ref) => { if (!iso) return -1; const d = parseISO(iso); const s = fyStartDate(ref); const e = new Date(s.getFullYear() + 1, 3, 1); if (d < s || d >= e) return -1; return (d.getMonth() - 3 + 12) % 12; };
const PIPE_STATUS = { bidding:{label:"Bidding",color:"#f59e0b"}, sent:{label:"Proposal sent",color:"#2f80ed"}, won:{label:"Won",color:"#27ae60"}, lost:{label:"Lost",color:"#94a3b8"} };
const INV_STATUS = { pending:{label:"Pending",color:"#94a3b8"}, sent:{label:"Sent out",color:"#f59e0b"}, paid:{label:"Payment received",color:"#27ae60"} };
const INVOICE_VAT_RATE = 0.2;

/* ---- invoice PDF (studio letterhead comes from org settings, not hardcoded) ---- */
function loadJsPdf(){
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => resolve((window.jspdf && window.jspdf.jsPDF) || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}
const gbp2 = (n) => "£  " + (Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const invLongDate = (iso) => { if (!iso) return ""; const d = parseISO(iso); return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`; };
const hexRgb = (h) => { const s = String(h || "").replace("#",""); const n = parseInt(s.length === 6 ? s : "1f2d4e", 16); return [(n>>16)&255,(n>>8)&255,n&255]; };
function buildInvoicePdf(JS, { inv, client, project, phase, profile }){
  const P = profile || {};
  const doc = new JS({ unit: "pt", format: "a4" }); const W = 595.28, M = 48;
  const num = (inv.meta && inv.meta.number) || inv.id || "";
  const net = Number(inv.amount) || 0; const vat = Math.round(net * INVOICE_VAT_RATE * 100) / 100; const total = Math.round((net + vat) * 100) / 100;
  const set = (size, style, color) => { doc.setFont("helvetica", style || "normal"); doc.setFontSize(size); const [r,g,b] = hexRgb(color || "#222222"); doc.setTextColor(r,g,b); };
  const [ar,ag,ab] = hexRgb(P.accent || NAVY);
  const logo = (P.logoText || (P.company || "").split(" ")[0] || "").slice(0, 10);
  let contentTop = 150;
  const lh = P.letterhead;
  if (lh) {
    try {
      const fmt = /^data:image\/png/i.test(lh) ? "PNG" : "JPEG";
      if (P.letterheadFull) {
        doc.addImage(lh, fmt, 0, 0, W, 841.89);
      } else {
        let bh = 150;
        try { const pr = doc.getImageProperties(lh); bh = Math.min(180, W * (pr.height / pr.width)); } catch (_) {}
        doc.addImage(lh, fmt, 0, 0, W, bh);
        contentTop = Math.max(150, bh + 34);
      }
    } catch (_) {}
  } else if (logo) {
    doc.setFillColor(ar,ag,ab); doc.rect(M,40,Math.max(46, logo.length*13),46,"F"); set(20,"bold","#ffffff"); doc.text(logo, M+9, 71);
  }
  let y = contentTop; set(10,"normal","#222");
  const addrLines = (client && client.billingAddress) ? client.billingAddress.split("\n") : [inv.client || (client && client.name) || ""];
  const block = ["Accounts Payable", ...addrLines].filter(Boolean); block.forEach((ln,i)=>doc.text(String(ln), M, y+i*14)); y += block.length*14 + 30;
  doc.text("Date/Tax Point", M, y); doc.text(invLongDate(inv.date), M+150, y); y += 34;
  set(12,"bold"); doc.text(`INVOICE NUMBER: ${num}`, W/2, y, { align:"center" }); y += 30;
  set(11,"bold"); doc.text("Project", M, y); doc.text(project ? project.name : (inv.title || ""), M+80, y); y += 26;
  set(10,"normal"); const desc = `To: ${phase ? ("Phase " + phase.name + " — ") : ""}${project ? project.name : (inv.title || "")}. Fixed design fees as per our proposal.`;
  const dl = doc.splitTextToSize(desc, W-2*M); doc.text(dl, M, y); y += dl.length*13 + 18;
  set(10,"bold"); doc.text(phase ? ("Phase — " + phase.name) : (inv.title || "Design fees"), M, y); set(10,"normal"); doc.text(gbp2(net), W-M, y, { align:"right" }); y += 26;
  const ry = y+6;
  doc.text("Sub-total", W-M-170, ry); doc.text(gbp2(net), W-M, ry, { align:"right" });
  doc.text("VAT (20%)", W-M-170, ry+16); doc.text(gbp2(vat), W-M, ry+16, { align:"right" });
  set(10,"bold"); doc.text("Total", W-M-170, ry+34); doc.text(gbp2(total), W-M, ry+34, { align:"right" }); y = ry+64;
  set(10,"normal"); const days = (client && Number.isFinite(client.paymentTerms)) ? client.paymentTerms : 30;
  doc.text(`Credit Terms: ${days} days`, M, y); y += 22;
  if (P.emails) { doc.text(`E-mail contact ${P.emails}`, M, y); y += 22; }
  y += 4; doc.text("Payment by bank transfer to:", M, y); y += 16;
  [P.bankName, P.bankBranch, ...(P.address ? String(P.address).split("\n") : [])].filter(Boolean).forEach(ln => { doc.text(String(ln), M, y); y += 14; }); y += 8;
  const pair = (a,b) => { if (!b) return; doc.text(a, M, y); doc.text(String(b), M+140, y); y += 14; };
  pair("SWIFT/BIC", P.swift); pair("IBAN", P.iban); pair("Account Number:", P.account); pair("Sort Code:", P.sort);
  if (P.vat) { y += 10; doc.text(`VAT Number: ${P.vat}`, M, y); }
  set(8,"normal","#666"); const fy = 812;
  const footer = [P.company, P.address ? String(P.address).replace(/\n/g, ", ") : "", P.emails].filter(Boolean).join(" · ");
  if (footer) doc.text(footer, W/2, fy, { align:"center" });
  return doc;
}
const invFilename = (inv, client) => `Invoice-${(inv.meta && inv.meta.number) || inv.id}-${String((client && client.name) || inv.client || "client").replace(/[^A-Za-z0-9]/g,"")}.pdf`;
async function downloadInvoice(args){ const JS = await loadJsPdf(); if (!JS) { toast.add({ title: "Couldn't load the PDF engine — check your connection and try again.", type: "error" }); return; } const doc = buildInvoicePdf(JS, args); doc.save(invFilename(args.inv, args.client)); }
async function emailInvoice(args){ const JS = await loadJsPdf(); if (!JS) { toast.add({ title: "Couldn't load the PDF engine.", type: "error" }); return; } const doc = buildInvoicePdf(JS, args); const fname = invFilename(args.inv, args.client);
  const num = (args.inv.meta && args.inv.meta.number) || args.inv.id; const subject = `Invoice ${num}`;
  const body = `Hi,\n\nPlease find attached invoice ${num}${args.inv.client ? (" for " + args.inv.client) : ""}.\n\nMany thanks`;
  try { const blob = doc.output("blob"); const file = new File([blob], fname, { type:"application/pdf" });
    if (navigator.canShare && navigator.canShare({ files:[file] })) { await navigator.share({ files:[file], title:subject, text:body }); return; }
  } catch(_) {}
  doc.save(fname);
  const to = (args.client && args.client.email) || "";
  window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + "\n\n(The invoice PDF has just downloaded — attach it before sending.)")}`;
}

function MiniGantt({ items, empty, minHeight=110, rangeStart, rangeEnd, onBarMove, onBarResize, onBarClick, dropRef, highlight }){
  const [dragState,setDragState]=useState(null);
  const trackRef=useRef(null);
  const withDates=(items||[]).filter(i=>i.s&&i.e&&i.e>=i.s);
  let minS=rangeStart, maxE=rangeEnd;
  if(!minS||!maxE){ if(withDates.length){ minS=minS||withDates[0].s; maxE=maxE||withDates[0].e; withDates.forEach(i=>{ if(i.s<minS)minS=i.s; if(i.e>maxE)maxE=i.e; }); } }
  if(!minS||!maxE) return <div ref={dropRef} className={`px-3 text-sm text-muted-foreground border rounded-xl flex items-center ${highlight?"border-primary bg-primary/10":"border-border"}`} style={{minHeight}}>{empty||"Nothing with dates yet."}</div>;
  const start=startOfMonth(parseISO(minS)); const end=endOfMonth(parseISO(maxE));
  const dayOf=(iso)=> (parseISO(iso)-start)/MS;
  const totalDays=Math.max(1,(end-start)/MS+1);
  const pct=(days)=>(days/totalDays)*100;
  const months=[]; for(let d=new Date(start); d<=end; d=addMonths(d,1)) months.push(new Date(d));
  const ppd=()=>{ const w=trackRef.current?trackRef.current.getBoundingClientRect().width:600; return Math.max(0.5,w/totalDays); };
  const startDrag=(item,mode,e)=>{
    const editable = mode==="move" ? (!!onBarMove||!!onBarClick) : !!onBarResize;
    if(!editable||(e.button&&e.button!==0)) return;
    e.preventDefault(); e.stopPropagation();
    const sx=e.clientX; const per=ppd(); const id=item.key||item.label; const d={moved:false,delta:0};
    const move=(ev)=>{ if(!onBarMove&&mode==="move") return; const px=ev.clientX-sx; if(!d.moved){ if(Math.abs(px)<4) return; d.moved=true; document.body.style.userSelect="none"; } d.delta=Math.round(px/per); setDragState({id,delta:d.delta,mode}); };
    const up=(ev)=>{ document.removeEventListener("pointermove",move); document.removeEventListener("pointerup",up); document.body.style.userSelect=""; setDragState(null);
      if(d.moved && d.delta!==0){ if(mode==="move") onBarMove && onBarMove(item,d.delta); else onBarResize && onBarResize(item,mode,d.delta); }
      else if(!d.moved && mode==="move" && onBarClick){ onBarClick(item); } };
    document.addEventListener("pointermove",move); document.addEventListener("pointerup",up);
  };
  const canResize=!!onBarResize;
  return (
    <div ref={dropRef} className={`border rounded-xl overflow-hidden ${highlight?"border-primary ring-2 ring-ring/50":"border-border"}`}>
      <div ref={trackRef} className="relative h-6 bg-muted/50 border-b border-border text-[10px] text-muted-foreground">
        {months.map((m,i)=>(<div key={i} className="absolute top-0 bottom-0 border-l border-border pl-1 flex items-center" style={{left:pct(dayOf(toISO(m)))+"%"}}>{MONTHS[m.getMonth()]} {String(m.getFullYear()).slice(2)}</div>))}
      </div>
      <div className="relative py-2" style={{minHeight:minHeight-24}}>
        {months.map((m,i)=> i>0 && <div key={"g"+i} className="absolute top-0 bottom-0 border-l border-border/60" style={{left:pct(dayOf(toISO(m)))+"%"}}/>)}
        {withDates.map((i,idx)=>{ const id=i.key||i.label; const ds=(dragState&&dragState.id===id)?dragState:null;
          let leftDays=dayOf(i.s), widthDays=(dayOf(i.e)-dayOf(i.s)+1);
          if(ds){ if(ds.mode==="move") leftDays+=ds.delta; else if(ds.mode==="l"){ leftDays+=ds.delta; widthDays-=ds.delta; } else widthDays+=ds.delta; }
          widthDays=Math.max(1,widthDays); leftDays=Math.max(0,leftDays);
          return (<div key={idx} className="relative group" style={{height:30}} title={i.label}>
            <div onPointerDown={(e)=>startDrag(i,"move",e)} className="absolute rounded-md text-white text-[11px] flex items-center px-2 overflow-hidden whitespace-nowrap shadow-xs select-none"
              style={{left:pct(leftDays)+"%", width:pct(widthDays)+"%", top:3, bottom:3, background:i.color, cursor:onBarMove?"grab":(onBarClick?"pointer":"default"), touchAction:"none", opacity:ds?0.9:1}}>
              {canResize && <span onPointerDown={(e)=>startDrag(i,"l",e)} className="absolute left-0 top-0 bottom-0" style={{width:9,cursor:"ew-resize",zIndex:5}}/>}
              {canResize && <span onPointerDown={(e)=>startDrag(i,"r",e)} className="absolute right-0 top-0 bottom-0" style={{width:9,cursor:"ew-resize",zIndex:5}}/>}
              <span className="truncate pointer-events-none">{i.label}</span>
              {canResize && <span className="absolute left-1 top-1/2 opacity-0 group-hover:opacity-90" style={{transform:"translateY(-50%)",width:3,height:"45%",background:"#fff",borderRadius:2,pointerEvents:"none",zIndex:6}}/>}
              {canResize && <span className="absolute right-1 top-1/2 opacity-0 group-hover:opacity-90" style={{transform:"translateY(-50%)",width:3,height:"45%",background:"#fff",borderRadius:2,pointerEvents:"none",zIndex:6}}/>}
            </div>
          </div>);
        })}
      </div>
    </div>
  );
}
function BillingPlan(ctx){
  const confirm = useConfirm();
  const { data, clientById, isLeadership, delBilling, editBilling, addBilling, setModal, convertPipeline, teamList, myMemberId, shiftProjectDates, shiftProjectEdge } = ctx;
  const [expMonth,setExpMonth]=useState("");
  const [expPeople,setExpPeople]=useState("all");
  const seedPipeline=()=>{ const base=fyStartDate(); [["Rebrand — Northwind","Northwind",24000,"high",1,3],["App UI — Bluewave","Bluewave",38000,"high",4,7],["Brand refresh — Kestrel","Kestrel",9000,"high",8,9],["Packaging — Perlini S2","Perlini",12000,"low",6,8],["Website — Sayvr","Sayvr",16000,"low",2,4],["Trade stand — HID","HID",7000,"low",9,10]].forEach(([t,c,a,l,sm,em])=>addBilling({kind:"pipeline",title:t,client:c,amount:a,status:l==="high"?"sent":"bidding",meta:{start:toISO(addMonths(base,sm)),end:toISO(addMonths(base,em)),likelihood:l}})); };
  const seedInvoices=()=>{ const base=fyStartDate(); [["Clear-Com Retainer — Apr","Clear-Com",5940,"paid",0],["Clear-Com Retainer — May","Clear-Com",5940,"sent",1],["UK Connect — Branding","UK Connect",1360,"sent",2],["OD PR — Workshop","OD",500,"pending",2]].forEach(([t,c,a,st,m],i)=>addBilling({kind:"invoice",title:t,client:c,amount:a,status:st,date:toISO(addMonths(base,m)),meta:{number:1001+i}})); };
  const seedExpenses=()=>{ const base=fyStartDate(); const m=(x)=>toISO(addMonths(base,x)).slice(0,7); const mem=(data.members[0]||{}).id; [["Client travel — train",84,0,120],["Prototype materials",240,1,0],["Team lunch",65,1,0]].forEach(([t,a,mm,mi])=>addBilling({kind:"expense",title:t,amount:a,memberId:mem||null,date:"",meta:{month:m(mm),miles:mi}})); };
  const [sub,setSub]=useState("timeline");
  const [ovZoom,setOvZoom]=useState(3);
  const _nowFY=fyStartDate();
  const [pMode,setPMode]=useState("fy");
  const [pYear,setPYear]=useState(_nowFY.getFullYear());
  const [pFrom,setPFrom]=useState(toISO(_nowFY).slice(0,7));
  const [pTo,setPTo]=useState(toISO(new Date(_nowFY.getFullYear()+1,2,1)).slice(0,7));
  const B=data.billing||[];
  const byKind=(k)=>B.filter(b=>b.kind===k);
  const canEditKind=(k)=> k==="invoice"?isLeadership:true;
  const overheadTotal=byKind("overhead").reduce((s,b)=>s+(b.amount||0),0);
  const pipelineTotal=byKind("pipeline").filter(b=>b.status==="bidding"||b.status==="sent").reduce((s,b)=>s+(b.amount||0),0);
  const invoicesOut=byKind("invoice").filter(b=>b.status!=="paid").reduce((s,b)=>s+(b.amount||0),0);
  const comingIn=byKind("invoice").filter(b=>b.status==="sent").reduce((s,b)=>s+(b.amount||0),0);
  const expensesTotal=byKind("expense").reduce((s,b)=>s+(b.amount||0),0);
  const projRange=(pid)=>{ const as=data.assignments.filter(a=>a.projectId===pid&&a.kind==="work"); if(!as.length) return null; let s=as[0].start,e=as[0].end; for(const a of as){ if(a.start<s)s=a.start; if(a.end>e)e=a.end; } return {s,e}; };
  const projects=data.projects.map(p=>({p,cl:clientById(p.clientId),range:projRange(p.id)})).sort((a,b)=>((a.range?a.range.s:"9999")<(b.range?b.range.s:"9999")?-1:1));
  const confirmedItems=projects.filter(x=>x.range).map(({p,cl,range})=>({label:(cl?cl.name+" · ":"")+p.name,color:cl?cl.color:"#64748b",s:range.s,e:range.e,pid:p.id,key:"c"+p.id}));
  const prospectiveItems=byKind("pipeline").filter(b=>b.status!=="won"&&b.meta&&b.meta.start&&b.meta.end).map(b=>({label:(b.client?b.client+" · ":"")+b.title,color:(b.meta&&b.meta.likelihood==="low")?"#f59e0b":"#27ae60",s:b.meta.start,e:b.meta.end,entry:b,key:"p"+b.id}));
  const allBars=[...confirmedItems,...prospectiveItems];
  let ovStart=null, ovEnd=null;
  if(allBars.length){ ovStart=allBars[0].s; ovEnd=allBars[0].e; allBars.forEach(i=>{ if(i.s<ovStart)ovStart=i.s; if(i.e>ovEnd)ovEnd=i.e; }); }
  const moveConfirmed=(item,delta)=>shiftProjectDates(item.pid,delta);
  const moveProspective=(item,delta)=>{ const b=item.entry; if(!b||!b.meta) return; const ns=b.meta.start?toISO(addDays(parseISO(b.meta.start),delta)):""; const ne=b.meta.end?toISO(addDays(parseISO(b.meta.end),delta)):""; editBilling({...b,meta:{...b.meta,start:ns,end:ne}}); };
  const resizeConfirmed=(item,edge,delta)=>{ if(shiftProjectEdge) shiftProjectEdge(item.pid,edge,delta); };
  const resizeProspective=(item,edge,delta)=>{ const b=item.entry; if(!b||!b.meta) return; const m={...b.meta}; if(edge==="l" && m.start) m.start=toISO(addDays(parseISO(m.start),delta)); if(edge==="r" && m.end) m.end=toISO(addDays(parseISO(m.end),delta)); editBilling({...b,meta:m}); };
  const fyS=fyStartDate(); const fyStartISO=toISO(fyS); const fyEndISO=toISO(new Date(fyS.getFullYear()+1,2,31));
  const memberName=(id)=>(data.members.find(m=>m.id===id)||{}).name||"—";
  const clientByName=(nm)=>data.clients.find(c=>c.name===nm);
  const openForm=(kind,entry,preset)=>setModal({type:"billing",payload:{kind,entry,preset}});
  const todayISO=toISO(startOfDay(new Date()));
  const phaseFee=(p,ph)=>{ if(Number(ph.fee)>0) return ph.fee; const total=p.phases.reduce((s,x)=>s+Math.max(1,Math.round(x.days||1)),0)||1; return Math.round((p.cost||0)*(Math.max(1,Math.round(ph.days||1))/total)); };
  const invByPhase={}; byKind("invoice").forEach(b=>{ if(b.projectId&&b.meta&&b.meta.phaseId) invByPhase[b.projectId+"|"+b.meta.phaseId]=b; });
  const nextInvNo=()=>{ let mx=0; byKind("invoice").forEach(b=>{ const n=b.meta&&Number(b.meta.number); if(n>mx) mx=n; }); return (mx||1000)+1; };
  const invoicedKeys=new Set(Object.keys(invByPhase));
  const readyPhases=[];
  for(const p of data.projects){ const r=projRange(p.id); if(!r||!(p.phases&&p.phases.length)) continue; phaseRanges(r.s,p.phases).forEach((pr,i)=>{ const ph=p.phases[i]; if(!ph||pr.end>=todayISO) return; if(invoicedKeys.has(p.id+"|"+ph.id)) return; readyPhases.push({p,cl:clientById(p.clientId),ph,end:pr.end,amount:phaseFee(p,ph)}); }); }
  const generateInvoice=(rp)=>addBilling({kind:"invoice",title:rp.p.name+" — "+rp.ph.name,client:rp.cl?rp.cl.name:"",amount:rp.amount,status:"pending",projectId:rp.p.id,date:todayISO,meta:{phaseId:rp.ph.id,number:nextInvNo()}});
  const dueDate=(b)=>{ if(!b.date) return null; const cl=clientByName(b.client); const days=(cl&&Number.isFinite(cl.paymentTerms))?cl.paymentTerms:30; return toISO(addDays(parseISO(b.date),days)); };
  // ---------- period (drives the timeline table AND the overview gantts) ----------
  let periodStart, monthsCount;
  if(pMode==="fy"){ periodStart=new Date(pYear,3,1); monthsCount=12; }
  else if(pMode==="cal"){ periodStart=new Date(pYear,0,1); monthsCount=12; }
  else { const [fy2,fm2]=pFrom.split("-").map(Number); const [ty2,tm2]=pTo.split("-").map(Number); periodStart=new Date(fy2||_nowFY.getFullYear(),(fm2||1)-1,1); const pe=new Date(ty2||_nowFY.getFullYear(),(tm2||12)-1,1); monthsCount=Math.max(1,Math.min(36,(pe.getFullYear()-periodStart.getFullYear())*12+(pe.getMonth()-periodStart.getMonth())+1)); }
  const periodMonthsD=Array.from({length:monthsCount},(_,i)=>new Date(periodStart.getFullYear(),periodStart.getMonth()+i,1));
  const periodLabels=periodMonthsD.map(d=>MONTHS[d.getMonth()]);
  const monthIndexOf=(iso)=>{ if(!iso) return -1; const d=parseISO(iso); const idx=(d.getFullYear()-periodStart.getFullYear())*12+(d.getMonth()-periodStart.getMonth()); return (idx>=0 && idx<monthsCount)?idx:-1; };
  const periodStartISO=toISO(periodStart); const periodEndISO=toISO(endOfMonth(periodMonthsD[monthsCount-1]));
  const periodLabel = pMode==="fy"?`FY ${pYear}/${String(pYear+1).slice(2)} · Apr → Mar` : pMode==="cal"?`${pYear} · Jan → Dec` : `${periodLabels[0]} ${periodStart.getFullYear()} → ${periodLabels[monthsCount-1]} ${periodMonthsD[monthsCount-1].getFullYear()}`;
  const z12=()=>Array(12).fill(0);
  const zN=()=>Array(monthsCount).fill(0);
  const monthConfirmed=zN(), monthHigh=zN(), monthLow=zN();
  const clientRows=data.clients.map(cl=>{
    const projs=data.projects.filter(p=>p.clientId===cl.id);
    let total=0; const rows=[];
    projs.forEach(p=>{ const r=projRange(p.id); const ranges=r?phaseRanges(r.s,p.phases||[]):[]; (p.phases||[]).forEach((ph,i)=>{ const fee=phaseFee(p,ph); if(fee<=0) return; const endISO=ranges[i]?ranges[i].end:null; const mi=monthIndexOf(endISO); if(mi<0) return; monthConfirmed[mi]+=fee; total+=fee; const inv=invByPhase[p.id+"|"+ph.id]; rows.push({p,ph,fee,mi,inv,endISO,ended:endISO&&endISO<todayISO}); }); });
    return {cl,rows,total};
  }).filter(c=>c.rows.length>0);
  const pipeMonth=(b)=> monthIndexOf((b.meta&&(b.meta.end||b.meta.start))||null);
  const highRows=byKind("pipeline").filter(b=>b.status!=="lost"&&(!b.meta||b.meta.likelihood!=="low")).map(b=>{ const mi=pipeMonth(b); if(mi>=0) monthHigh[mi]+=b.amount||0; return {b,mi}; }).filter(x=>x.mi>=0);
  const lowRows=byKind("pipeline").filter(b=>b.status!=="lost"&&b.meta&&b.meta.likelihood==="low").map(b=>{ const mi=pipeMonth(b); if(mi>=0) monthLow[mi]+=b.amount||0; return {b,mi}; }).filter(x=>x.mi>=0);
  const sum=(a)=>a.reduce((s,x)=>s+x,0);
  const proposals=monthConfirmed.map((v,i)=>v+monthHigh[i]);
  const bestCase=proposals.map((v,i)=>v+monthLow[i]);
  const ohMonthOf=(b,i)=> (b.meta&&b.meta.months&&b.meta.months[i]!=null&&b.meta.months[i]!=="")?Number(b.meta.months[i]):(b.amount||0);
  const ohRowFY=z12().map((_,i)=>byKind("overhead").reduce((s,b)=>s+ohMonthOf(b,i),0)); // FY view (overheads tab)
  const ohRow=periodMonthsD.map(d=>{ const slot=(d.getMonth()-3+12)%12; return byKind("overhead").reduce((s,b)=>s+ohMonthOf(b,slot),0); }); // period view (timeline)
  const periodPicker=()=>(<div className="flex items-center gap-2 flex-wrap">
    <Select value={pMode} onValueChange={setPMode} items={{fy:"Financial year (Apr–Mar)",cal:"Calendar year (Jan–Dec)",custom:"Custom range"}}>
      <SelectTrigger><SelectValue/></SelectTrigger>
      <SelectContent><SelectGroup>
        <SelectItem value="fy">Financial year (Apr–Mar)</SelectItem>
        <SelectItem value="cal">Calendar year (Jan–Dec)</SelectItem>
        <SelectItem value="custom">Custom range</SelectItem>
      </SelectGroup></SelectContent>
    </Select>
    {(pMode==="fy"||pMode==="cal") && (()=>{ const years=Array.from({length:11},(_,i)=>_nowFY.getFullYear()-5+i); const label=(y)=>pMode==="fy"?`${y}/${String(y+1).slice(2)}`:String(y); return (
      <Select value={String(pYear)} onValueChange={(v)=>setPYear(Number(v))} items={Object.fromEntries(years.map(y=>[String(y),label(y)]))}>
        <SelectTrigger><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup>{years.map(y=><SelectItem key={y} value={String(y)}>{label(y)}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>); })()}
    {pMode==="custom" && <><Input type="month" value={pFrom} onChange={e=>setPFrom(e.target.value)} className="w-auto"/><span className="text-sm text-muted-foreground">→</span><Input type="month" value={pTo} onChange={e=>setPTo(e.target.value)} className="w-auto"/></>}
  </div>);
  const Stat=({label,value})=>(<div className="rounded-xl border px-4 py-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-medium tabular-nums">{value}</div></div>);
  const Actions=(b)=> canEditKind(b.kind) ? <div className="ml-auto flex items-center shrink-0"><Button variant="ghost" size="icon-sm" title="Edit" onClick={()=>openForm(b.kind,b)}><Pencil/></Button><Button variant="ghost" size="icon-sm" title="Delete" onClick={async ()=>{ if(await confirm({title:"Delete this entry?", confirmLabel:"Delete", destructive:true})) delBilling(b.id); }}><Trash2/></Button></div> : null;
  const Head=({title,onAdd,can=true})=>(<div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-medium">{title}</h3>{can&&onAdd&&<Button variant="ghost" size="sm" className="ml-auto" onClick={onAdd}><Plus data-icon="inline-start"/> Add</Button>}</div>);
  const money0=(n)=> n?("£"+Math.round(n).toLocaleString()):"";
  return (
    <div className="h-full flex flex-col bg-card">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-border/60 flex-wrap">
        <Tabs value={sub} onValueChange={setSub}>
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="overheads">Overheads</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="expenses">Expenses & mileage</TabsTrigger>
          </TabsList>
        </Tabs>
        {sub==="invoices" && !isLeadership && <span className="ml-auto text-xs text-muted-foreground">Invoices are managed by team leadership</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-6">
        {sub==="timeline" && (()=>{ const cell="px-1.5 py-1 text-right border-l border-border/60 align-top"; const lab="px-2 py-1 text-left sticky left-0 bg-card z-10 align-top"; const mrow=(arr)=>arr.map((v,i)=><TableCell key={i} className={cell}>{money0(v)}</TableCell>); const confirmedNet=monthConfirmed.map((v,i)=>v-ohRow[i]); const predictedNet=bestCase.map((v,i)=>v-ohRow[i]);
          return (<div className="text-xs">
            <div className="flex items-center gap-2 mb-2 flex-wrap"><h3 className="text-sm font-medium text-foreground">Billing timeline</h3><span className="text-xs text-muted-foreground">{periodLabel}</span><div className="ml-auto">{periodPicker()}</div></div>
            <Table className="table-fixed text-xs">
              <colgroup><col style={{width:"22%"}}/>{periodLabels.map((m,i)=><col key={i}/>)}<col style={{width:"8%"}}/></colgroup>
              <TableHeader><TableRow className="text-[11px]">
                <TableHead className={lab+" h-auto text-muted-foreground"}>Client / phase</TableHead>
                {periodLabels.map((m,i)=><TableHead key={i} className={cell+" h-auto text-muted-foreground"}>{m}</TableHead>)}
                <TableHead className={cell+" h-auto text-muted-foreground"}>Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {clientRows.length===0 && <TableRow><TableCell className={lab+" text-muted-foreground"} colSpan={monthsCount+2}>No projects with phase fees yet — add a fee to each phase in the project editor.</TableCell></TableRow>}
                {clientRows.map(({cl,rows,total})=>(<React.Fragment key={cl.id}>
                  <TableRow className="bg-muted/50"><TableCell className={lab+" bg-muted/50 font-medium text-foreground"}>{cl.name}</TableCell>{periodLabels.map((m,i)=><TableCell key={i} className={cell}></TableCell>)}<TableCell className={cell+" font-medium text-foreground"}>{money0(total)}</TableCell></TableRow>
                  {rows.map((r,ri)=>(<TableRow key={ri} className="align-top">
                    <TableCell className={lab+" text-muted-foreground pl-4"}>{r.p.index} · {r.ph.name}</TableCell>
                    {periodLabels.map((m,i)=><TableCell key={i} className={cell}>{r.mi===i && <div className="leading-tight">
                      <div className="text-foreground font-medium">{money0(r.fee)}</div>
                      {r.inv?<Badge variant="secondary" className="mt-0.5">Inv #{(r.inv.meta&&r.inv.meta.number)||"—"}</Badge>
                        :(isLeadership&&r.ended?<Button variant="ghost" size="xs" className="mt-0.5" onClick={()=>generateInvoice({p:r.p,cl,ph:r.ph,amount:r.fee})}>+ invoice</Button>:null)}
                    </div>}</TableCell>)}
                    <TableCell className={cell+" text-muted-foreground"}>{money0(r.fee)}</TableCell>
                  </TableRow>))}
                </React.Fragment>))}

                {/* ---- CONFIRMED (money that's actually booked) ---- */}
                <TableRow className="border-t-2 border-input"><TableCell className={lab+" font-medium text-foreground"}>Confirmed income</TableCell>{monthConfirmed.map((v,i)=><TableCell key={i} className={cell+" font-medium text-foreground"}>{money0(v)}</TableCell>)}<TableCell className={cell+" font-medium text-foreground"}>{money0(sum(monthConfirmed))}</TableCell></TableRow>
                <TableRow className="text-destructive"><TableCell className={lab}>Overheads</TableCell>{mrow(ohRow)}<TableCell className={cell}>{money0(sum(ohRow))}</TableCell></TableRow>
                <TableRow className="font-medium bg-primary/10"><TableCell className={lab+" bg-primary/10 text-foreground"}>Confirmed net</TableCell>{confirmedNet.map((v,i)=><TableCell key={i} className={cell+" bg-primary/10 "+(v<0?"text-destructive":"text-primary-foreground")}>{money0(v)}</TableCell>)}<TableCell className={cell+" bg-primary/10 "+(sum(confirmedNet)<0?"text-destructive":"text-primary-foreground")}>{money0(sum(confirmedNet))}</TableCell></TableRow>

                <TableRow className="hover:bg-transparent border-b-2 border-input"><TableCell colSpan={monthsCount+2} className="py-2"></TableCell></TableRow>
                <TableRow className="hover:bg-transparent border-b-0"><TableCell colSpan={monthsCount+2} className="py-1"></TableCell></TableRow>

                {/* ---- PIPELINE ---- */}
                <TableRow className="bg-primary/10"><TableCell className={lab+" font-medium bg-primary/10 text-primary-foreground"}><span className="inline-block size-2 rounded-full mr-1.5 align-middle bg-primary"/>Highly likely to convert</TableCell>{periodLabels.map((m,i)=><TableCell key={i} className={cell+" bg-primary/10"}></TableCell>)}<TableCell className={cell+" font-medium bg-primary/10 text-primary-foreground"}>{money0(sum(highRows.map(h=>h.b.amount||0)))}</TableCell></TableRow>
                {highRows.length===0 && <TableRow><TableCell className={lab+" text-muted-foreground pl-4"} colSpan={monthsCount+2}>—</TableCell></TableRow>}
                {highRows.map(({b,mi},i)=>(<TableRow key={"h"+i} className="hover:bg-primary/5"><TableCell className={lab+" pl-4 text-muted-foreground"}>{b.client?b.client+" · ":""}{b.title}</TableCell>{periodLabels.map((m,j)=><TableCell key={j} className={cell+" text-primary-foreground"}>{mi===j?money0(b.amount):""}</TableCell>)}<TableCell className={cell+" text-muted-foreground"}>{money0(b.amount)}</TableCell></TableRow>))}
                <TableRow className="bg-amber-50"><TableCell className={lab+" font-medium bg-amber-50 text-amber-700"}><span className="inline-block size-2 rounded-full mr-1.5 align-middle" style={{background:"#f59e0b"}}/>Less likely to convert</TableCell>{periodLabels.map((m,i)=><TableCell key={i} className={cell+" bg-amber-50"}></TableCell>)}<TableCell className={cell+" font-medium bg-amber-50 text-amber-700"}>{money0(sum(lowRows.map(l=>l.b.amount||0)))}</TableCell></TableRow>
                {lowRows.length===0 && <TableRow><TableCell className={lab+" text-muted-foreground pl-4"} colSpan={monthsCount+2}>—</TableCell></TableRow>}
                {lowRows.map(({b,mi},i)=>(<TableRow key={"l"+i} className="hover:bg-amber-50/40"><TableCell className={lab+" pl-4 text-muted-foreground"}>{b.client?b.client+" · ":""}{b.title}</TableCell>{periodLabels.map((m,j)=><TableCell key={j} className={cell+" text-amber-700"}>{mi===j?money0(b.amount):""}</TableCell>)}<TableCell className={cell+" text-muted-foreground"}>{money0(b.amount)}</TableCell></TableRow>))}

                {/* ---- PREDICTION ---- */}
                <TableRow className="border-t-2 border-input font-medium text-primary-foreground bg-primary/5"><TableCell className={lab+" bg-primary/5"}>Proposals total</TableCell>{mrow(proposals)}<TableCell className={cell+" font-medium"}>{money0(sum(proposals))}</TableCell></TableRow>
                <TableRow className="font-medium text-foreground"><TableCell className={lab}>Best case total</TableCell>{mrow(bestCase)}<TableCell className={cell+" font-medium"}>{money0(sum(bestCase))}</TableCell></TableRow>
                <TableRow className="text-destructive"><TableCell className={lab}>Predicted overheads</TableCell>{mrow(ohRow)}<TableCell className={cell}>{money0(sum(ohRow))}</TableCell></TableRow>
                <TableRow className="font-medium bg-muted"><TableCell className={lab+" bg-muted text-foreground"}>Predicted net (best case)</TableCell>{predictedNet.map((v,i)=><TableCell key={i} className={cell+" bg-muted "+(v<0?"text-destructive":"text-primary-foreground")}>{money0(v)}</TableCell>)}<TableCell className={cell+" bg-muted "+(sum(predictedNet)<0?"text-destructive":"text-primary-foreground")}>{money0(sum(predictedNet))}</TableCell></TableRow>
              </TableBody>
            </Table>
            <p className="text-[11px] text-muted-foreground mt-2">Phase fees are set per phase in the project editor; each sits in the month its phase ends. Once a phase has finished, leadership can hit "invoice" to raise it (with an auto number) — that feeds the Invoices tab.</p>
          </div>); })()}

        {sub==="overview" && <>
          <div className="flex items-center gap-2 mb-1 flex-wrap"><h3 className="text-sm font-medium text-foreground">Overview</h3><span className="text-xs text-muted-foreground">{periodLabel}</span><div className="ml-auto">{periodPicker()}</div></div>
          <div className="grid gap-3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))"}}>
            <Stat label="Overheads / month" value={money(overheadTotal)}/>
            <Stat label="Pipeline (potential)" value={money(pipelineTotal)}/>
            <Stat label="Money coming in" value={money(comingIn)}/>
            <Stat label="Invoices outstanding" value={money(invoicesOut)}/>
            <Stat label="Expenses owed" value={money(expensesTotal)}/>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-medium text-foreground">Confirmed work — timeline</h3><span className="text-[11px] text-muted-foreground">drag to move · drag an edge to stretch the start/end</span></div>
            <MiniGantt rangeStart={periodStartISO} rangeEnd={periodEndISO} onBarMove={isLeadership?moveConfirmed:null} onBarResize={isLeadership?resizeConfirmed:null} onBarClick={(item)=>ctx.openProjectEditor&&ctx.openProjectEditor(item.pid)} minHeight={150} items={confirmedItems} empty="No scheduled projects yet — book work on the schedule, or confirm a prospective job below."/>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-medium text-foreground">Prospective work — timeline</h3><div className="ml-auto flex items-center gap-2">{byKind("pipeline").length===0 && <Button variant="outline" size="sm" onClick={seedPipeline}>Add examples</Button>}<Button variant="ghost" size="sm" onClick={()=>openForm("pipeline")}><Plus data-icon="inline-start"/> Add</Button></div></div>
            <MiniGantt rangeStart={periodStartISO} rangeEnd={periodEndISO} onBarMove={moveProspective} onBarResize={resizeProspective} onBarClick={(item)=>item.entry&&openForm("pipeline",item.entry)} minHeight={150} items={prospectiveItems} empty="Add prospective jobs with expected dates to see them here."/>
            <p className="text-[11px] text-muted-foreground mt-1">Both timelines cover the full financial year (April → March). Drag a bar to move it, or drag either end to change its start/end. Use "→ Confirm" below to turn a prospect into a scheduled project.</p>
            <div className="rounded-xl border border-border overflow-hidden mt-2">
              {byKind("pipeline").length===0 && <div className="px-3 py-3 text-sm text-muted-foreground">Nothing in the pipeline yet.</div>}
              {byKind("pipeline").map(b=>{ const low=b.meta&&b.meta.likelihood==="low"; return (<div key={b.id} className="flex items-center gap-3 px-3 py-2 border-t border-border/60 first:border-t-0 text-sm">
                <Badge variant="secondary" className="shrink-0">{low?"Less likely":"Highly likely"}</Badge>
                <span className="text-foreground truncate">{b.client?b.client+" · ":""}{b.title}</span>
                {b.status!=="won" && <Button variant="ghost" size="sm" className="shrink-0" onClick={async ()=>{ if(await confirm({title:"Convert to a confirmed project?", description:"It'll be added to the schedule.", confirmLabel:"Convert"})) convertPipeline(b); }}>→ Confirm</Button>}
                <span className="ml-auto font-medium text-foreground shrink-0">{money(b.amount)}</span>{Actions(b)}
              </div>);})}
            </div>
          </div>
          <div>
            <Head title="Money coming in — sent invoices"/>
            <div className="rounded-xl border border-border overflow-hidden">
              {byKind("invoice").filter(b=>b.status==="sent").length===0 && <div className="px-3 py-3 text-sm text-muted-foreground">Nothing awaiting payment. Mark an invoice "Sent out" and it appears here with its due date.</div>}
              {byKind("invoice").filter(b=>b.status==="sent").map(b=>{ const due=dueDate(b); return (<div key={b.id} className="flex items-center gap-3 px-3 py-2 border-t border-border/60 first:border-t-0 text-sm">
                <span className="text-foreground truncate">{b.client?b.client+" · ":""}{b.title}</span>
                {due&&<span className="text-muted-foreground shrink-0 hidden sm:inline">due {due}</span>}
                <span className="ml-auto font-medium text-foreground shrink-0">{money(b.amount)}</span>
              </div>);})}
              {comingIn>0 && <div className="flex items-center gap-3 px-3 py-2 border-t bg-muted/50 text-sm font-medium"><span>Total expected</span><span className="ml-auto text-primary-foreground">{money(comingIn)}</span></div>}
            </div>
          </div>
        </>}

        {sub==="overheads" && (()=>{ const cell="px-1.5 py-1 text-right whitespace-nowrap border-l border-border/60"; const lab="px-2 py-1 text-left sticky left-0 bg-card z-10 whitespace-nowrap";
          const setBase=(b,v)=>editBilling({...b,amount:v===""?0:Number(v)});
          const setMonth=(b,i,v)=>{ const months={...(b.meta&&b.meta.months||{})}; if(v==="") delete months[i]; else months[i]=Number(v); editBilling({...b,meta:{...(b.meta||{}),months}}); };
          const rowTotal=(b)=>z12().reduce((s,_,i)=>s+ohMonthOf(b,i),0);
          const addExamples=()=>{ const ex=[["Studio rent",6500],["Salaries & wages",18000],["Software & subscriptions",1200],["Utilities & internet",700],["Insurance",300],["Accounting & legal",450]]; ex.forEach(([t,a])=>addBilling({kind:"overhead",title:t,amount:a,meta:{}})); };
          return (<div>
            <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-medium text-foreground">Monthly overheads</h3><span className="text-xs text-muted-foreground">edit the "All" column to set every month, or override a single month</span><div className="ml-auto flex items-center gap-2">{byKind("overhead").length===0 && <Button variant="outline" size="sm" onClick={addExamples}>Add examples</Button>}<Button variant="ghost" size="sm" onClick={()=>openForm("overhead")}><Plus data-icon="inline-start"/> Add</Button></div></div>
            <Table className="text-xs" style={{minWidth:1100}}>
              <TableHeader><TableRow className="text-[11px]"><TableHead className={lab+" h-auto text-muted-foreground"}>Overhead</TableHead><TableHead className={cell+" h-auto text-muted-foreground"}>All</TableHead>{FY_MONTHS.map((m,i)=><TableHead key={i} className={cell+" h-auto text-muted-foreground"}>{m}</TableHead>)}<TableHead className={cell+" h-auto text-muted-foreground"}>Year</TableHead><TableHead className="w-6 h-auto"></TableHead></TableRow></TableHeader>
              <TableBody>
                {byKind("overhead").length===0 && <TableRow><TableCell className={lab+" text-muted-foreground"} colSpan={16}>No overheads yet — add your own or click "Add examples".</TableCell></TableRow>}
                {byKind("overhead").map(b=>(<TableRow key={b.id}>
                  <TableCell className={lab+" text-foreground"}>{b.title}</TableCell>
                  <TableCell className={cell}><input type="number" value={b.amount||""} onChange={e=>setBase(b,e.target.value)} className="w-16 text-right bg-muted/50 rounded px-1 py-0.5 outline-none"/></TableCell>
                  {FY_MONTHS.map((m,i)=>{ const ov=b.meta&&b.meta.months&&b.meta.months[i]; return <TableCell key={i} className={cell}><input type="number" value={ov??""} placeholder={String(b.amount||0)} onChange={e=>setMonth(b,i,e.target.value)} className="w-14 text-right bg-card rounded px-1 py-0.5 outline-none border border-transparent hover:border-border focus:border-ring"/></TableCell>; })}
                  <TableCell className={cell+" font-medium text-muted-foreground"}>{money0(rowTotal(b))}</TableCell>
                  <TableCell className="text-center"><Button variant="ghost" size="icon-sm" title="Delete" onClick={async ()=>{ if(await confirm({title:"Delete this overhead?", confirmLabel:"Delete", destructive:true})) delBilling(b.id); }}><Trash2/></Button></TableCell>
                </TableRow>))}
                {byKind("overhead").length>0 && <TableRow className="border-t-2 border-input font-medium bg-muted/50"><TableCell className={lab+" bg-muted/50"}>Total</TableCell><TableCell className={cell}></TableCell>{ohRowFY.map((v,i)=><TableCell key={i} className={cell}>{money0(v)}</TableCell>)}<TableCell className={cell}>{money0(sum(ohRowFY))}</TableCell><TableCell></TableCell></TableRow>}
              </TableBody>
            </Table>
            <p className="text-[11px] text-muted-foreground mt-2">Blank month = uses the "All" figure. These feed the "Predicted overheads" and net rows on the timeline.</p>
          </div>); })()}

        {sub==="invoices" && <div className="space-y-5">
          {isLeadership && <div>
            <h3 className="text-sm font-medium text-foreground mb-2">Ready to invoice <span className="text-xs font-normal text-muted-foreground">— phases that have finished</span></h3>
            <div className="rounded-xl border border-border overflow-hidden">
              {readyPhases.length===0 && <div className="px-3 py-3 text-sm text-muted-foreground">Nothing ready — a phase appears here once its end date passes.</div>}
              {readyPhases.map((rp,i)=>(<div key={i} className="flex items-center gap-3 px-3 py-2 border-t border-border/60 first:border-t-0 text-sm">
                <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{background:rp.cl?rp.cl.color:"#94a3b8"}}/>
                <span className="text-foreground truncate">{rp.cl?rp.cl.name+" · ":""}{rp.p.name} <span className="text-muted-foreground">· {rp.ph.name}</span></span>
                <span className="text-muted-foreground shrink-0 hidden sm:inline">ended {rp.end}</span>
                <span className="font-medium text-foreground shrink-0">{money(rp.amount)}</span>
                <Button size="sm" className="shrink-0" onClick={()=>generateInvoice(rp)}>Generate</Button>
              </div>))}
            </div>
          </div>}
          <div>
            <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-medium text-foreground">Invoices</h3>{isLeadership&&<div className="ml-auto flex items-center gap-2">
              <Select value="" onValueChange={(v)=>{ const p=data.projects.find(x=>x.id===v); if(p){ const cl=clientById(p.clientId); openForm("invoice",null,{title:p.name,client:cl?cl.name:"",amount:p.cost||0,projectId:p.id}); } }} items={{"":"Generate from project…",...Object.fromEntries(data.projects.map(p=>[p.id,`${p.index} — ${p.name}`]))}}>
                <SelectTrigger size="sm" className="w-56"><SelectValue/></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="">Generate from project…</SelectItem>{data.projects.map(p=><SelectItem key={p.id} value={p.id}>{p.index} — {p.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              {byKind("invoice").length===0 && <Button variant="outline" size="sm" onClick={seedInvoices}>Examples</Button>}
              <Button variant="ghost" size="sm" onClick={()=>openForm("invoice")}><Plus data-icon="inline-start"/> Add</Button></div>}</div>
            <div className="rounded-xl border border-border overflow-hidden">
              {byKind("invoice").length===0 && <div className="px-3 py-3 text-sm text-muted-foreground">No invoices yet.</div>}
              {byKind("invoice").map(b=>{ const st=INV_STATUS[b.status]||INV_STATUS.pending; return (<div key={b.id} className="flex items-center gap-3 px-3 py-2 border-t border-border/60 first:border-t-0 text-sm">
                {isLeadership
                  ? <Select value={b.status||"pending"} onValueChange={(v)=>editBilling({...b,status:v})} items={Object.fromEntries(Object.entries(INV_STATUS).map(([k,v])=>[k,v.label]))}>
                      <SelectTrigger size="sm" className="shrink-0"><SelectValue/></SelectTrigger>
                      <SelectContent><SelectGroup>{Object.entries(INV_STATUS).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  : <Badge variant="secondary" className="shrink-0">{st.label}</Badge>}
                <span className="text-foreground truncate flex-1">{b.meta&&b.meta.number?<span className="text-muted-foreground">#{b.meta.number} </span>:""}{b.client?b.client+" · ":""}{b.title}</span>
                <span className="font-medium text-foreground shrink-0">{money(b.amount)}</span>
                {(()=>{ const project=data.projects.find(p=>p.id===b.projectId); const cl=(data.clients.find(c=>c.name===b.client))||(project&&clientById(project.clientId)); const phase=project&&b.meta&&b.meta.phaseId&&(project.phases||[]).find(p=>p.id===b.meta.phaseId); const args={inv:b,client:cl,project,phase,profile:ctx.invoiceProfile}; return (<span className="flex items-center gap-1.5 shrink-0">
                  <Button variant="ghost" size="icon-sm" title="Download PDF invoice" onClick={()=>downloadInvoice(args)}><Download/></Button>
                  <Button variant="ghost" size="icon-sm" title="Email / share this invoice" onClick={()=>emailInvoice(args)}><Mail/></Button>
                </span>); })()}
                {Actions(b)}
              </div>);})}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Each invoice has a <b>Download</b> (PDF) and <b>Email/share</b> button. VAT is added at 20% on the PDF. Set your studio's details in Settings → Invoice details, and each client's billing address on the client.</p>
          </div>
        </div>}

        {sub==="expenses" && (()=>{
          const allExp=byKind("expense");
          const monthsPresent=[...new Set(allExp.map(b=>b.meta&&b.meta.month).filter(Boolean))].sort().reverse();
          const shown=allExp.filter(b=> (expMonth===""||(b.meta&&b.meta.month)===expMonth) && pfIncludes(expPeople,b.memberId));
          const fowed={}; shown.filter(b=>b.status!=="paid").forEach(b=>{ const k=b.memberId||"?"; fowed[k]=(fowed[k]||0)+(b.amount||0); });
          const shownTotal=shown.reduce((s,b)=>s+(b.amount||0),0);
          const paidTotal=shown.filter(b=>b.status==="paid").reduce((s,b)=>s+(b.amount||0),0);
          return (<div className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <PeoplePicker members={data.members} teams={teamList} value={expPeople} onChange={setExpPeople} me={myMemberId}/>
            <Select value={expMonth} onValueChange={setExpMonth} items={{"":"All months",...Object.fromEntries(monthsPresent.map(m=>[m,m]))}}>
              <SelectTrigger className="w-36"><SelectValue/></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="">All months</SelectItem>{monthsPresent.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <span className="ml-auto text-sm text-muted-foreground">Showing <span className="font-medium text-foreground">{money(shownTotal)}</span>{paidTotal>0&&<span className="text-muted-foreground"> · {money(paidTotal)} paid</span>}</span>
          </div>
          {Object.keys(fowed).length>0 && <div>
            <h3 className="text-sm font-medium text-foreground mb-2">Who's owed <span className="text-xs font-normal text-muted-foreground">(unpaid, for the current filter)</span></h3>
            <div className="rounded-xl border border-border overflow-hidden">
              {Object.entries(fowed).sort((a,b)=>b[1]-a[1]).map(([mid,amt])=>(<div key={mid} className="flex items-center gap-3 px-3 py-2 border-t border-border/60 first:border-t-0 text-sm"><span className="text-foreground">{mid==="?"?"Unassigned":memberName(mid)}</span><span className="ml-auto font-medium text-foreground">{money(amt)}</span></div>))}
            </div>
          </div>}
          <div>
            <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-medium text-foreground">Expenses & mileage</h3><div className="ml-auto flex items-center gap-2">{allExp.length===0 && <Button variant="outline" size="sm" onClick={seedExpenses}>Add examples</Button>}<Button variant="ghost" size="sm" onClick={()=>openForm("expense")}><Plus data-icon="inline-start"/> Add</Button></div></div>
            <div className="rounded-xl border border-border overflow-hidden">
              {shown.length===0 && <div className="px-3 py-3 text-sm text-muted-foreground">No expenses match this filter.</div>}
              {shown.map(b=>{ const miles=b.meta&&b.meta.miles; const mo=b.meta&&b.meta.month; const pr=b.projectId&&data.projects.find(p=>p.id===b.projectId); const paid=b.status==="paid"; return (<div key={b.id} className="flex items-center gap-3 px-3 py-2 border-t border-border/60 first:border-t-0 text-sm">
                <label className="flex items-center gap-1.5 shrink-0 cursor-pointer" title="Mark as paid"><Switch checked={paid} onCheckedChange={(v)=>editBilling({...b,status:v?"paid":"pending"})}/><span className={"text-xs w-11 "+(paid?"":"text-muted-foreground")}>{paid?"Paid":"Unpaid"}</span></label>
                <span className="flex-1 min-w-0 text-foreground truncate">{b.title}</span>
                <span className="text-muted-foreground shrink-0 hidden sm:inline">{b.memberId?memberName(b.memberId):""}{pr?" · "+pr.name:""}{mo?" · "+mo:""}{miles?" · "+miles+" mi":""}</span>
                <span className="w-24 text-right font-medium text-foreground shrink-0">{money(b.amount)}</span>
                <span className="w-12 flex justify-end shrink-0">{Actions(b)}</span>
              </div>);})}
              {shown.length>0 && <div className="flex items-center gap-3 px-3 py-2 border-t border-border bg-muted/50 text-sm font-medium"><span className="flex-1">Total shown</span><span className="w-24 text-right shrink-0">{money(shownTotal)}</span><span className="w-12 shrink-0"></span></div>}
            </div>
          </div>
        </div>); })()}
      </div>
    </div>
  );
}
function BillingForm({ kind, entry, preset, members, projects=[], me, onSave, onDelete, onClose }){
  const p=entry||preset||{};
  const [title,setTitle]=useState(p.title||"");
  const [client,setClient]=useState(p.client||"");
  const [amount,setAmount]=useState(p.amount??"");
  const [status,setStatus]=useState(p.status||(kind==="pipeline"?"bidding":kind==="invoice"?"pending":""));
  const [date,setDate]=useState(p.date||"");
  const [memberId,setMemberId]=useState(p.memberId||(kind==="expense"?(me||""):""));
  const [projectId,setProjectId]=useState(p.projectId||"");
  const [month,setMonth]=useState((p.meta&&p.meta.month)||"");
  const [miles,setMiles]=useState((p.meta&&p.meta.miles)||"");
  const [pStart,setPStart]=useState((p.meta&&p.meta.start)||"");
  const [pEnd,setPEnd]=useState((p.meta&&p.meta.end)||"");
  const [likely,setLikely]=useState((p.meta&&p.meta.likelihood)||"high");
  const titleLabel=kind==="overhead"?"What is it?":kind==="expense"?"Description":"Title";
  const [titleErr,setTitleErr]=useState("");
  const [dOpen,setDOpen]=useState(false),[sOpen,setSOpen]=useState(false),[eOpen,setEOpen]=useState(false);
  const save=()=>{ if(!title.trim()){ setTitleErr("Add a description."); return; } setTitleErr(""); let amt=Number(amount)||0; let meta;
    if(kind==="expense") meta={miles:Number(miles)||0,month:month||""};
    else if(kind==="pipeline") meta={start:pStart||"",end:pEnd||"",likelihood:likely};
    else if(kind==="overhead"){ if(month!==""){ const mi=Number(month); meta={...(entry?.meta||{}),months:{...((entry&&entry.meta&&entry.meta.months)||{}),[mi]:amt}}; amt=0; } else meta=(entry?.meta||{}); }
    else meta=(p.meta||entry?.meta||{});
    const b={...(entry||{}),id:entry?.id,kind,title:title.trim(),client:client||"",amount:amt,status:status||null,date:kind==="overhead"?"":(date||""),memberId:memberId||null,projectId:(kind==="expense"?projectId:(p.projectId||entry?.projectId))||null,meta}; onSave(b); };
  return (<><ModalHead title={(entry?"Edit ":"New ")+({pipeline:"pipeline job",overhead:"overhead",invoice:"invoice",expense:"expense"}[kind]||"entry")}/><FieldGroup>
    <Field label={titleLabel} error={titleErr}><Input value={title} onChange={e=>setTitle(e.target.value)} autoFocus/></Field>
    {(kind==="pipeline"||kind==="invoice") && <Field label="Client"><Input value={client} onChange={e=>setClient(e.target.value)} placeholder="Client name"/></Field>}
    <div className="grid grid-cols-2 gap-3">
      <Field label={kind==="overhead"?"£ amount":"Amount (£)"}><Input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/></Field>
      {kind==="overhead" && <Field label="Applies to"><Select value={month} onValueChange={setMonth} items={{"":"Every month",...Object.fromEntries(FY_MONTHS.map((m,i)=>[String(i),m+" only"]))}}>
        <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="">Every month</SelectItem>{FY_MONTHS.map((m,i)=><SelectItem key={i} value={String(i)}>{m} only</SelectItem>)}</SelectGroup></SelectContent>
      </Select></Field>}
      {kind==="pipeline" && <Field label="Status"><Select value={status} onValueChange={setStatus} items={Object.fromEntries(Object.entries(PIPE_STATUS).map(([k,v])=>[k,v.label]))}>
        <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup>{Object.entries(PIPE_STATUS).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select></Field>}
      {kind==="invoice" && <Field label="Status"><Select value={status} onValueChange={setStatus} items={Object.fromEntries(Object.entries(INV_STATUS).map(([k,v])=>[k,v.label]))}>
        <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup>{Object.entries(INV_STATUS).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select></Field>}
      {kind==="expense" && <Field label="Miles (if mileage)"><Input type="number" min="0" value={miles} onChange={e=>setMiles(e.target.value)} placeholder="0"/></Field>}
    </div>
    {kind==="expense" && <><div className="grid grid-cols-2 gap-3">
      <Field label="Project"><Select value={projectId} onValueChange={setProjectId} items={{"":"— none —",...Object.fromEntries(projects.map(pr=>[pr.id,`${pr.index} — ${pr.name}`]))}}>
        <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="">— none —</SelectItem>{projects.map(pr=><SelectItem key={pr.id} value={pr.id}>{pr.index} — {pr.name}</SelectItem>)}</SelectGroup></SelectContent>
      </Select></Field>
      <Field label="Month"><Input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></Field>
    </div>
    <Field label="Who's owed"><Select value={memberId} onValueChange={setMemberId} items={{"":"—",...Object.fromEntries(members.map(m=>[m.id,m.name]))}}>
        <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="">—</SelectItem>{members.map(m=><SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectGroup></SelectContent>
      </Select></Field></>}
    {kind==="pipeline" && <><div className="grid grid-cols-2 gap-3">
      <Field label="Expected start"><Popover open={sOpen} onOpenChange={setSOpen}>
        <PopoverTrigger render={<Button variant="outline" className="w-full tabular-nums" />}><CalendarIcon/> {pStart||"Pick a date"}</PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start"><CalendarPicker mode="single" selected={pStart?parseISO(pStart):undefined} onSelect={(d)=>{ if(d){ setPStart(toISO(d)); setSOpen(false); } }}/></PopoverContent>
      </Popover></Field>
      <Field label="Expected end"><Popover open={eOpen} onOpenChange={setEOpen}>
        <PopoverTrigger render={<Button variant="outline" className="w-full tabular-nums" />}><CalendarIcon/> {pEnd||"Pick a date"}</PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start"><CalendarPicker mode="single" selected={pEnd?parseISO(pEnd):undefined} onSelect={(d)=>{ if(d){ setPEnd(toISO(d)); setEOpen(false); } }}/></PopoverContent>
      </Popover></Field>
    </div>
    <Field label="Likelihood to convert"><Select value={likely} onValueChange={setLikely} items={{high:"Highly likely",low:"Less likely"}}>
        <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="high">Highly likely</SelectItem><SelectItem value="low">Less likely</SelectItem></SelectGroup></SelectContent>
      </Select></Field></>}
    {kind==="invoice" && <Field label="Invoice date"><Popover open={dOpen} onOpenChange={setDOpen}>
        <PopoverTrigger render={<Button variant="outline" className="w-full tabular-nums" />}><CalendarIcon/> {date||"Pick a date"}</PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start"><CalendarPicker mode="single" selected={date?parseISO(date):undefined} onSelect={(d)=>{ if(d){ setDate(toISO(d)); setDOpen(false); } }}/></PopoverContent>
      </Popover></Field>}
  </FieldGroup><ModalFoot onSave={save} onDelete={onDelete&&entry?()=>onDelete(entry.id):null} saveLabel={entry?"Save":"Add"}/></>);
}

export default function Billing({ org, me, data: cadData, reload }){
  const [modal,setModal]=useState(null);
  const data=useMemo(()=>mapData(cadData),[cadData]);
  const H=useMemo(()=>makeHandlers(org,reload,cadData),[org,cadData]); // eslint-disable-line
  const clientById=useCallback((id)=>data.clients.find(c=>c.id===id),[data.clients]);
  const projectById=useCallback((id)=>data.projects.find(p=>p.id===id),[data.projects]);
  const teamList=useMemo(()=>[...new Set(data.members.flatMap(m=>m.teams||[]))].sort(),[data.members]);
  if(!can(me,"billing.view")) return <NoAccess what="billing" />;
  const canEdit=can(me,"billing.edit");

  const shiftProjectDates=async(projectId,deltaDays)=>{ if(!deltaDays||!canEdit) return; const affected=(cadData.assignments||[]).filter(a=>a.project_id===projectId&&a.kind==="work"); for(const a of affected){ await sb.from("assignments").update({ start_date:toISO(addDays(parseISO(a.start_date),deltaDays)), end_date:toISO(addDays(parseISO(a.end_date),deltaDays)) }).eq("id",a.id); } reload(); };
  const shiftProjectEdge=async(projectId,edge,deltaDays)=>{ if(!deltaDays||!canEdit) return; const as=(cadData.assignments||[]).filter(a=>a.project_id===projectId&&a.kind==="work"); if(!as.length) return;
    if(edge==="r"){ const maxEnd=as.reduce((m,a)=>a.end_date>m?a.end_date:m,as[0].end_date); for(const a of as){ if(a.end_date===maxEnd){ const ne=toISO(addDays(parseISO(a.end_date),deltaDays)); if(ne>=a.start_date) await sb.from("assignments").update({end_date:ne}).eq("id",a.id); } } }
    else { const minStart=as.reduce((m,a)=>a.start_date<m?a.start_date:m,as[0].start_date); for(const a of as){ if(a.start_date===minStart){ const ns=toISO(addDays(parseISO(a.start_date),deltaDays)); if(ns<=a.end_date) await sb.from("assignments").update({start_date:ns}).eq("id",a.id); } } }
    reload(); };
  const convertPipeline=async(entry)=>{ if(!canEdit) return; let cid;
    const ex=data.clients.find(c=>(c.name||"").toLowerCase()===(entry.client||"").trim().toLowerCase());
    if(ex) cid=ex.id; else { const {data:nc}=await sb.from("clients").insert({org_id:org.id,name:(entry.client||entry.title||"New client").trim(),color:CLIENT_COLORS[data.clients.length%CLIENT_COLORS.length],payment_terms:30}).select().single(); cid=nc&&nc.id; }
    const idx=((entry.title||"JOB").replace(/[^A-Za-z0-9]/g,"").slice(0,6).toUpperCase())||"JOB";
    const phId=uid();
    await sb.from("projects").insert({org_id:org.id,code:idx,name:entry.title||"New project",client_id:cid,cost:entry.amount||0,phases:[{id:phId,name:"Phase 1",days:10,fee:entry.amount||0}]});
    await sb.from("billing_entries").update({status:"won"}).eq("id",entry.id);
    reload();
  };

  const invoiceProfile={ ...(org.settings?.invoice||{}), company:(org.settings?.invoice?.company)||org.name };
  const [projEdit,setProjEdit]=useState(null);
  const openProjectEditor=(pid)=>{ const p=(cadData.projects||[]).find(x=>x.id===pid); if(p) setProjEdit(p); };
  const ctx={ data, clientById, projectById, isLeadership:canEdit, teamList, myMemberId:me.id, setModal, invoiceProfile, openProjectEditor,
    addBilling:canEdit?H.addBilling:(()=>{}), editBilling:canEdit?H.editBilling:(()=>{}), delBilling:canEdit?H.delBilling:(()=>{}),
    convertPipeline, shiftProjectDates, shiftProjectEdge };

  return (<div className="h-full">
    {!canEdit && <div className="px-4 py-2 text-xs bg-muted text-muted-foreground border-b">You can view billing but not edit it.</div>}
    <BillingPlan {...ctx} />
    {projEdit && <ProjectModal org={org} project={projEdit} clients={cadData.clients} onClose={()=>setProjEdit(null)} onSaved={()=>{ setProjEdit(null); reload(); }} />}
    {modal?.type==="billing" && <ModalShell onClose={()=>setModal(null)}>
      <BillingForm kind={modal.payload.kind} entry={modal.payload.entry} preset={modal.payload.preset} members={data.members} projects={data.projects} me={me.id}
        onSave={b=>{ if(b.id) H.editBilling(b); else H.addBilling(b); setModal(null); }}
        onDelete={modal.payload.entry?id=>{ H.delBilling(id); setModal(null); }:null} onClose={()=>setModal(null)} />
    </ModalShell>}
  </div>);
}
