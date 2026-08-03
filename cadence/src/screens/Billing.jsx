import React, { useState, useMemo, useCallback } from "react";
import { sb } from "../lib/supabase.js";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import {
  MS, MONTHS, MONTHS_LONG, NAVY, CLIENT_COLORS, uid, pad, toISO, parseISO, startOfDay, addDays, addMonths, startOfMonth, endOfMonth, nextWeekday,
  money, phaseRanges, pfIncludes, PeoplePicker, ModalShell, ModalHead, ModalFoot, Field, inputCls, mapData, makeHandlers,
} from "../studio/core.jsx";
import { Plus, Minus, Pencil, Trash2, Download, Mail } from "lucide-react";

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
async function downloadInvoice(args){ const JS = await loadJsPdf(); if (!JS) { alert("Couldn't load the PDF engine — check your connection and try again."); return; } const doc = buildInvoicePdf(JS, args); doc.save(invFilename(args.inv, args.client)); }
async function emailInvoice(args){ const JS = await loadJsPdf(); if (!JS) { alert("Couldn't load the PDF engine."); return; } const doc = buildInvoicePdf(JS, args); const fname = invFilename(args.inv, args.client);
  const num = (args.inv.meta && args.inv.meta.number) || args.inv.id; const subject = `Invoice ${num}`;
  const body = `Hi,\n\nPlease find attached invoice ${num}${args.inv.client ? (" for " + args.inv.client) : ""}.\n\nMany thanks`;
  try { const blob = doc.output("blob"); const file = new File([blob], fname, { type:"application/pdf" });
    if (navigator.canShare && navigator.canShare({ files:[file] })) { await navigator.share({ files:[file], title:subject, text:body }); return; }
  } catch(_) {}
  doc.save(fname);
  const to = (args.client && args.client.email) || "";
  window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + "\n\n(The invoice PDF has just downloaded — attach it before sending.)")}`;
}

function MiniGantt({ items, empty, minHeight=110, rangeStart, rangeEnd, pxPerDay=3, onBarMove, dropRef, highlight }){
  const [dragState,setDragState]=useState(null);
  const withDates=(items||[]).filter(i=>i.s&&i.e&&i.e>=i.s);
  let minS=rangeStart, maxE=rangeEnd;
  if(!minS||!maxE){ if(withDates.length){ minS=minS||withDates[0].s; maxE=maxE||withDates[0].e; withDates.forEach(i=>{ if(i.s<minS)minS=i.s; if(i.e>maxE)maxE=i.e; }); } }
  if(!minS||!maxE) return <div ref={dropRef} className={`px-3 text-sm text-slate-400 border rounded-xl flex items-center ${highlight?"border-blue-400 bg-blue-50":"border-slate-200"}`} style={{minHeight}}>{empty||"Nothing with dates yet."}</div>;
  const start=startOfMonth(parseISO(minS)); const end=endOfMonth(parseISO(maxE));
  const dayOf=(iso)=> (parseISO(iso)-start)/MS;
  const totalDays=Math.max(1,(end-start)/MS+1);
  const width=Math.max(Math.round(totalDays*pxPerDay), 240);
  const months=[]; for(let d=new Date(start); d<=end; d=addMonths(d,1)) months.push(new Date(d));
  const startDrag=(item,e)=>{ if(!onBarMove||(e.button&&e.button!==0)) return; e.preventDefault(); e.stopPropagation(); const sx=e.clientX; const id=item.key||item.label; const d={moved:false,delta:0};
    const move=(ev)=>{ const px=ev.clientX-sx; if(!d.moved){ if(Math.abs(px)<4) return; d.moved=true; document.body.style.userSelect="none"; } d.delta=Math.round(px/pxPerDay); setDragState({id,delta:d.delta}); };
    const up=()=>{ document.removeEventListener("pointermove",move); document.removeEventListener("pointerup",up); document.body.style.userSelect=""; setDragState(null); if(d.moved && d.delta!==0) onBarMove(item,d.delta); };
    document.addEventListener("pointermove",move); document.addEventListener("pointerup",up);
  };
  return (
    <div ref={dropRef} className={`border rounded-xl overflow-hidden ${highlight?"border-blue-400 ring-2 ring-blue-200":"border-slate-200"}`}>
      <div className="overflow-x-auto">
        <div style={{width, minHeight}}>
          <div className="relative h-6 bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400">
            {months.map((m,i)=>(<div key={i} className="absolute top-0 bottom-0 border-l border-slate-200 pl-1 flex items-center" style={{left:dayOf(toISO(m))*pxPerDay}}>{MONTHS[m.getMonth()]} {String(m.getFullYear()).slice(2)}</div>))}
          </div>
          <div className="relative p-2" style={{minHeight:minHeight-24}}>
            {withDates.map((i,idx)=>{ const id=i.key||i.label; const live=(dragState&&dragState.id===id)?dragState.delta*pxPerDay:0;
              return (<div key={idx} className="relative" style={{height:30}} title={i.label}>
                <div onPointerDown={onBarMove?(e=>startDrag(i,e)):undefined} className="absolute rounded-md text-white text-[11px] flex items-center px-2 overflow-hidden whitespace-nowrap shadow-sm" style={{left:dayOf(i.s)*pxPerDay+live, width:Math.max(8,(dayOf(i.e)-dayOf(i.s)+1)*pxPerDay), top:3, bottom:3, background:i.color, cursor:onBarMove?"grab":"default", touchAction:onBarMove?"none":"auto", opacity:live?0.85:1}}>{i.label}</div>
              </div>);
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
function BillingPlan(ctx){
  const { data, clientById, isLeadership, delBilling, editBilling, addBilling, setModal, convertPipeline, teamList, myMemberId, shiftProjectDates } = ctx;
  const [expMonth,setExpMonth]=useState("");
  const [expPeople,setExpPeople]=useState("all");
  const seedPipeline=()=>{ const base=fyStartDate(); [["Rebrand — Northwind","Northwind",24000,"high",1,3],["App UI — Bluewave","Bluewave",38000,"high",4,7],["Brand refresh — Kestrel","Kestrel",9000,"high",8,9],["Packaging — Perlini S2","Perlini",12000,"low",6,8],["Website — Sayvr","Sayvr",16000,"low",2,4],["Trade stand — HID","HID",7000,"low",9,10]].forEach(([t,c,a,l,sm,em])=>addBilling({kind:"pipeline",title:t,client:c,amount:a,status:l==="high"?"sent":"bidding",meta:{start:toISO(addMonths(base,sm)),end:toISO(addMonths(base,em)),likelihood:l}})); };
  const seedInvoices=()=>{ const base=fyStartDate(); [["Clear-Com Retainer — Apr","Clear-Com",5940,"paid",0],["Clear-Com Retainer — May","Clear-Com",5940,"sent",1],["UK Connect — Branding","UK Connect",1360,"sent",2],["OD PR — Workshop","OD",500,"pending",2]].forEach(([t,c,a,st,m],i)=>addBilling({kind:"invoice",title:t,client:c,amount:a,status:st,date:toISO(addMonths(base,m)),meta:{number:1001+i}})); };
  const seedExpenses=()=>{ const base=fyStartDate(); const m=(x)=>toISO(addMonths(base,x)).slice(0,7); const mem=(data.members[0]||{}).id; [["Client travel — train",84,0,120],["Prototype materials",240,1,0],["Team lunch",65,1,0]].forEach(([t,a,mm,mi])=>addBilling({kind:"expense",title:t,amount:a,memberId:mem||null,date:"",meta:{month:m(mm),miles:mi}})); };
  const [sub,setSub]=useState("timeline");
  const [ovZoom,setOvZoom]=useState(3);
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
  const z12=()=>Array(12).fill(0);
  const monthConfirmed=z12(), monthHigh=z12(), monthLow=z12();
  const clientRows=data.clients.map(cl=>{
    const projs=data.projects.filter(p=>p.clientId===cl.id);
    let total=0; const rows=[];
    projs.forEach(p=>{ const r=projRange(p.id); const ranges=r?phaseRanges(r.s,p.phases||[]):[]; (p.phases||[]).forEach((ph,i)=>{ const fee=phaseFee(p,ph); if(fee<=0) return; total+=fee; const endISO=ranges[i]?ranges[i].end:null; const mi=fyIndexOf(endISO); if(mi>=0) monthConfirmed[mi]+=fee; const inv=invByPhase[p.id+"|"+ph.id]; rows.push({p,ph,fee,mi,inv,endISO,ended:endISO&&endISO<todayISO}); }); });
    return {cl,rows,total};
  }).filter(c=>c.rows.length>0);
  const pipeMonth=(b)=> fyIndexOf((b.meta&&(b.meta.end||b.meta.start))||null);
  const highRows=byKind("pipeline").filter(b=>b.status!=="lost"&&(!b.meta||b.meta.likelihood!=="low")).map(b=>{ const mi=pipeMonth(b); if(mi>=0) monthHigh[mi]+=b.amount||0; return {b,mi}; });
  const lowRows=byKind("pipeline").filter(b=>b.status!=="lost"&&b.meta&&b.meta.likelihood==="low").map(b=>{ const mi=pipeMonth(b); if(mi>=0) monthLow[mi]+=b.amount||0; return {b,mi}; });
  const sum=(a)=>a.reduce((s,x)=>s+x,0);
  const proposals=monthConfirmed.map((v,i)=>v+monthHigh[i]);
  const bestCase=proposals.map((v,i)=>v+monthLow[i]);
  const ohMonthOf=(b,i)=> (b.meta&&b.meta.months&&b.meta.months[i]!=null&&b.meta.months[i]!=="")?Number(b.meta.months[i]):(b.amount||0);
  const ohRow=z12().map((_,i)=>byKind("overhead").reduce((s,b)=>s+ohMonthOf(b,i),0));
  const netRow=monthConfirmed.map((v,i)=>v-ohRow[i]);
  const fyLabel=(()=>{ const s=fyStartDate(); return `${s.getFullYear()}/${String(s.getFullYear()+1).slice(2)}`; })();
  const SubTab=({v,l})=>(<button onClick={()=>setSub(v)} className={`text-sm px-3 py-1.5 rounded-lg ${sub===v?"bg-slate-800 text-white":"text-slate-600 hover:bg-slate-100"}`}>{l}</button>);
  const Stat=({label,value,tone})=>(<div className="rounded-xl border border-slate-200 px-4 py-3"><div className="text-xs text-slate-400">{label}</div><div className="text-lg font-bold" style={{color:tone||NAVY}}>{value}</div></div>);
  const Actions=(b)=> canEditKind(b.kind) ? <div className="ml-auto flex items-center gap-2 shrink-0"><button onClick={()=>openForm(b.kind,b)} className="text-slate-300 hover:text-blue-600"><Pencil size={14}/></button><button onClick={()=>{ if(confirm("Delete this entry?")) delBilling(b.id); }} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button></div> : null;
  const Head=({title,onAdd,can=true})=>(<div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-semibold text-slate-700">{title}</h3>{can&&onAdd&&<button onClick={onAdd} className="ml-auto flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><Plus size={13}/> Add</button>}</div>);
  const money0=(n)=> n?("£"+Math.round(n).toLocaleString()):"";
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 flex-wrap">
        <SubTab v="timeline" l="Timeline"/><SubTab v="overview" l="Overview"/><SubTab v="overheads" l="Overheads"/><SubTab v="invoices" l="Invoices"/><SubTab v="expenses" l="Expenses & mileage"/>
        {sub==="invoices" && !isLeadership && <span className="ml-auto text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">Invoices are managed by team leadership</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-6">
        {sub==="timeline" && (()=>{ const cell="px-2 py-1 text-right whitespace-nowrap border-l border-slate-100"; const lab="px-2 py-1 text-left sticky left-0 bg-white z-10 whitespace-nowrap"; const mrow=(arr)=>arr.map((v,i)=><td key={i} className={cell}>{money0(v)}</td>);
          return (<div className="text-xs">
            <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-semibold text-slate-700">Billing timeline</h3><span className="text-xs text-slate-400">FY {fyLabel} · April → March</span></div>
            <table className="border-collapse w-full" style={{minWidth:1040}}>
              <thead><tr className="text-[11px] text-slate-400 border-b border-slate-200">
                <th className={lab+" font-semibold text-slate-500"}>Client / phase</th>
                {FY_MONTHS.map((m,i)=><th key={i} className={cell+" font-semibold"}>{m}</th>)}
                <th className={cell+" font-semibold text-slate-500"}>Total</th>
              </tr></thead>
              <tbody>
                {clientRows.length===0 && <tr><td className={lab+" text-slate-400"} colSpan={14}>No projects with phase fees yet — add a fee to each phase in the project editor.</td></tr>}
                {clientRows.map(({cl,rows,total})=>(<React.Fragment key={cl.id}>
                  <tr className="bg-slate-50 border-t border-slate-200"><td className={lab+" bg-slate-50 font-semibold text-slate-700"}>{cl.name}</td>{FY_MONTHS.map((m,i)=><td key={i} className={cell}></td>)}<td className={cell+" font-bold text-slate-700"}>{money0(total)}</td></tr>
                  {rows.map((r,ri)=>(<tr key={ri} className="border-t border-slate-50 hover:bg-slate-50/50 align-top">
                    <td className={lab+" text-slate-600 pl-4"}>{r.p.index} · {r.ph.name}</td>
                    {FY_MONTHS.map((m,i)=><td key={i} className={cell}>{r.mi===i && <div className="leading-tight">
                      <div className="text-slate-700 font-medium">{money0(r.fee)}</div>
                      {r.inv?<div className="mt-0.5 inline-block text-[9px] text-green-700 bg-green-50 border border-green-200 rounded px-1">Inv #{(r.inv.meta&&r.inv.meta.number)||"—"}</div>
                        :(isLeadership&&r.ended?<button onClick={()=>generateInvoice({p:r.p,cl,ph:r.ph,amount:r.fee})} className="mt-0.5 text-[9px] text-blue-600 hover:underline">+ invoice</button>:<div className="text-[9px] text-transparent">–</div>)}
                    </div>}</td>)}
                    <td className={cell+" text-slate-500"}>{money0(r.fee)}</td>
                  </tr>))}
                </React.Fragment>))}
                <tr style={{background:"#eafaf0"}}><td className={lab+" font-bold pt-2"} style={{background:"#eafaf0",color:"#1e874b"}}><span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{background:"#27ae60"}}/>Highly likely to convert</td>{FY_MONTHS.map((m,i)=><td key={i} className={cell} style={{background:"#eafaf0"}}></td>)}<td className={cell+" font-semibold"} style={{background:"#eafaf0",color:"#1e874b"}}>{money0(sum(highRows.map(h=>h.b.amount||0)))}</td></tr>
                {highRows.length===0 && <tr><td className={lab+" text-slate-300 pl-4"} colSpan={14}>—</td></tr>}
                {highRows.map(({b,mi},i)=>(<tr key={"h"+i} className="hover:bg-green-50/40"><td className={lab+" pl-4 text-slate-600"}>{b.client?b.client+" · ":""}{b.title}</td>{FY_MONTHS.map((m,j)=><td key={j} className={cell} style={{color:"#1e874b"}}>{mi===j?money0(b.amount):""}</td>)}<td className={cell+" text-slate-500"}>{money0(b.amount)}</td></tr>))}
                <tr style={{background:"#fff5e6"}}><td className={lab+" font-bold"} style={{background:"#fff5e6",color:"#b26b00"}}><span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{background:"#f59e0b"}}/>Less likely to convert</td>{FY_MONTHS.map((m,i)=><td key={i} className={cell} style={{background:"#fff5e6"}}></td>)}<td className={cell+" font-semibold"} style={{background:"#fff5e6",color:"#b26b00"}}>{money0(sum(lowRows.map(l=>l.b.amount||0)))}</td></tr>
                {lowRows.length===0 && <tr><td className={lab+" text-slate-300 pl-4"} colSpan={14}>—</td></tr>}
                {lowRows.map(({b,mi},i)=>(<tr key={"l"+i} className="hover:bg-amber-50/40"><td className={lab+" pl-4 text-slate-500"}>{b.client?b.client+" · ":""}{b.title}</td>{FY_MONTHS.map((m,j)=><td key={j} className={cell} style={{color:"#b26b00"}}>{mi===j?money0(b.amount):""}</td>)}<td className={cell+" text-slate-400"}>{money0(b.amount)}</td></tr>))}
                <tr className="border-t-2 border-slate-300 font-medium text-slate-700"><td className={lab+" font-semibold"}>Confirmed income</td>{mrow(monthConfirmed)}<td className={cell+" font-bold"}>{money0(sum(monthConfirmed))}</td></tr>
                <tr className="text-slate-500"><td className={lab}>+ Highly likely</td>{mrow(monthHigh)}<td className={cell}>{money0(sum(monthHigh))}</td></tr>
                <tr className="font-semibold text-blue-700 bg-blue-50/40"><td className={lab+" bg-blue-50/40"}>Proposals total</td>{mrow(proposals)}<td className={cell+" font-bold"}>{money0(sum(proposals))}</td></tr>
                <tr className="text-slate-400"><td className={lab}>+ Less likely</td>{mrow(monthLow)}<td className={cell}>{money0(sum(monthLow))}</td></tr>
                <tr className="font-semibold text-slate-700"><td className={lab}>Best case total</td>{mrow(bestCase)}<td className={cell+" font-bold"}>{money0(sum(bestCase))}</td></tr>
                <tr className="text-red-500 border-t border-slate-200"><td className={lab}>Predicted overheads</td>{mrow(ohRow)}<td className={cell}>{money0(sum(ohRow))}</td></tr>
                <tr className="font-bold"><td className={lab} style={{color:NAVY}}>Predicted net</td>{netRow.map((v,i)=><td key={i} className={cell} style={{color:v<0?"#eb5757":"#27ae60"}}>{money0(v)}</td>)}<td className={cell} style={{color:sum(netRow)<0?"#eb5757":"#27ae60"}}>{money0(sum(netRow))}</td></tr>
              </tbody>
            </table>
            <p className="text-[11px] text-slate-400 mt-2">Phase fees are set per phase in the project editor; each sits in the month its phase ends. Once a phase has finished, leadership can hit "invoice" to raise it (with an auto number) — that feeds the Invoices tab.</p>
          </div>); })()}

        {sub==="overview" && <>
          <div className="grid gap-3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))"}}>
            <Stat label="Overheads / month" value={money(overheadTotal)}/>
            <Stat label="Pipeline (potential)" value={money(pipelineTotal)} tone="#2f80ed"/>
            <Stat label="Money coming in" value={money(comingIn)} tone="#27ae60"/>
            <Stat label="Invoices outstanding" value={money(invoicesOut)} tone="#f59e0b"/>
            <Stat label="Expenses owed" value={money(expensesTotal)}/>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-semibold text-slate-700">Confirmed work — timeline</h3><span className="text-[11px] text-slate-400">drag a bar sideways to reschedule</span>
              <div className="ml-auto flex items-center gap-1"><span className="text-xs text-slate-400 mr-1">Zoom</span>
                <button onClick={()=>setOvZoom(z=>Math.max(1.2,Math.round((z/1.4)*10)/10))} className="w-6 h-6 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 grid place-items-center"><Minus size={13}/></button>
                <button onClick={()=>setOvZoom(z=>Math.min(14,Math.round((z*1.4)*10)/10))} className="w-6 h-6 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 grid place-items-center"><Plus size={13}/></button>
              </div>
            </div>
            <MiniGantt rangeStart={ovStart} rangeEnd={ovEnd} pxPerDay={ovZoom} onBarMove={isLeadership?moveConfirmed:null} minHeight={140} items={confirmedItems} empty="No scheduled projects yet — book work on the schedule, or confirm a prospective job below."/>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-semibold text-slate-700">Prospective work — timeline</h3><div className="ml-auto flex items-center gap-2">{byKind("pipeline").length===0 && <button onClick={seedPipeline} className="text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2 py-1">Add examples</button>}<button onClick={()=>openForm("pipeline")} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><Plus size={13}/> Add</button></div></div>
            <MiniGantt rangeStart={ovStart} rangeEnd={ovEnd} pxPerDay={ovZoom} onBarMove={moveProspective} minHeight={140} items={prospectiveItems} empty="Add prospective jobs with expected dates to see them here."/>
            <p className="text-[11px] text-slate-400 mt-1">Both timelines share the same scale. Drag a prospective bar sideways to change its expected dates; use "→ Confirm" below to turn it into a scheduled project.</p>
            <div className="rounded-xl border border-slate-200 overflow-hidden mt-2">
              {byKind("pipeline").length===0 && <div className="px-3 py-3 text-sm text-slate-400">Nothing in the pipeline yet.</div>}
              {byKind("pipeline").map(b=>{ const low=b.meta&&b.meta.likelihood==="low"; return (<div key={b.id} className="flex items-center gap-3 px-3 py-2 border-t border-slate-100 first:border-t-0 text-sm">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{background:(low?"#f59e0b":"#27ae60")+"22",color:low?"#b26b00":"#1e874b"}}>{low?"Less likely":"Highly likely"}</span>
                <span className="text-slate-700 truncate">{b.client?b.client+" · ":""}{b.title}</span>
                {b.status!=="won" && <button onClick={()=>{ if(confirm("Convert to a confirmed project? It'll be added to the schedule.")) convertPipeline(b); }} className="shrink-0 text-[11px] font-semibold text-blue-600 hover:underline">→ Confirm</button>}
                <span className="ml-auto font-medium text-slate-700 shrink-0">{money(b.amount)}</span>{Actions(b)}
              </div>);})}
            </div>
          </div>
          <div>
            <Head title="Money coming in — sent invoices"/>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              {byKind("invoice").filter(b=>b.status==="sent").length===0 && <div className="px-3 py-3 text-sm text-slate-400">Nothing awaiting payment. Mark an invoice "Sent out" and it appears here with its due date.</div>}
              {byKind("invoice").filter(b=>b.status==="sent").map(b=>{ const due=dueDate(b); return (<div key={b.id} className="flex items-center gap-3 px-3 py-2 border-t border-slate-100 first:border-t-0 text-sm">
                <span className="text-slate-700 truncate">{b.client?b.client+" · ":""}{b.title}</span>
                {due&&<span className="text-slate-400 shrink-0 hidden sm:inline">due {due}</span>}
                <span className="ml-auto font-medium text-slate-700 shrink-0">{money(b.amount)}</span>
              </div>);})}
              {comingIn>0 && <div className="flex items-center gap-3 px-3 py-2 border-t border-slate-200 bg-slate-50 text-sm font-semibold"><span>Total expected</span><span className="ml-auto text-green-700">{money(comingIn)}</span></div>}
            </div>
          </div>
        </>}

        {sub==="overheads" && (()=>{ const cell="px-1.5 py-1 text-right whitespace-nowrap border-l border-slate-100"; const lab="px-2 py-1 text-left sticky left-0 bg-white z-10 whitespace-nowrap";
          const setBase=(b,v)=>editBilling({...b,amount:v===""?0:Number(v)});
          const setMonth=(b,i,v)=>{ const months={...(b.meta&&b.meta.months||{})}; if(v==="") delete months[i]; else months[i]=Number(v); editBilling({...b,meta:{...(b.meta||{}),months}}); };
          const rowTotal=(b)=>z12().reduce((s,_,i)=>s+ohMonthOf(b,i),0);
          const addExamples=()=>{ const ex=[["Studio rent",6500],["Salaries & wages",18000],["Software & subscriptions",1200],["Utilities & internet",700],["Insurance",300],["Accounting & legal",450]]; ex.forEach(([t,a])=>addBilling({kind:"overhead",title:t,amount:a,meta:{}})); };
          return (<div>
            <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-semibold text-slate-700">Monthly overheads</h3><span className="text-xs text-slate-400">edit the "All" column to set every month, or override a single month</span><div className="ml-auto flex items-center gap-2">{byKind("overhead").length===0 && <button onClick={addExamples} className="text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2 py-1">Add examples</button>}<button onClick={()=>openForm("overhead")} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><Plus size={13}/> Add</button></div></div>
            <div className="overflow-auto"><table className="border-collapse text-xs w-full" style={{minWidth:1100}}>
              <thead><tr className="text-[11px] text-slate-400 border-b border-slate-200"><th className={lab+" font-semibold"}>Overhead</th><th className={cell+" font-semibold text-slate-500"}>All</th>{FY_MONTHS.map((m,i)=><th key={i} className={cell+" font-semibold"}>{m}</th>)}<th className={cell+" font-semibold text-slate-500"}>Year</th><th className="w-6"></th></tr></thead>
              <tbody>
                {byKind("overhead").length===0 && <tr><td className={lab+" text-slate-400"} colSpan={16}>No overheads yet — add your own or click "Add examples".</td></tr>}
                {byKind("overhead").map(b=>(<tr key={b.id} className="border-t border-slate-50">
                  <td className={lab+" text-slate-700"}>{b.title}</td>
                  <td className={cell}><input type="number" value={b.amount||""} onChange={e=>setBase(b,e.target.value)} className="w-16 text-right bg-slate-50 rounded px-1 py-0.5 outline-none"/></td>
                  {FY_MONTHS.map((m,i)=>{ const ov=b.meta&&b.meta.months&&b.meta.months[i]; return <td key={i} className={cell}><input type="number" value={ov??""} placeholder={String(b.amount||0)} onChange={e=>setMonth(b,i,e.target.value)} className="w-14 text-right bg-white rounded px-1 py-0.5 outline-none border border-transparent hover:border-slate-200 focus:border-blue-300"/></td>; })}
                  <td className={cell+" font-medium text-slate-600"}>{money0(rowTotal(b))}</td>
                  <td className="text-center"><button onClick={()=>{ if(confirm("Delete this overhead?")) delBilling(b.id); }} className="text-slate-300 hover:text-red-500"><Trash2 size={13}/></button></td>
                </tr>))}
                {byKind("overhead").length>0 && <tr className="border-t-2 border-slate-300 font-bold bg-slate-50"><td className={lab+" bg-slate-50"}>Total</td><td className={cell}></td>{ohRow.map((v,i)=><td key={i} className={cell}>{money0(v)}</td>)}<td className={cell}>{money0(sum(ohRow))}</td><td></td></tr>}
              </tbody>
            </table></div>
            <p className="text-[11px] text-slate-400 mt-2">Blank month = uses the "All" figure. These feed the "Predicted overheads" and net rows on the timeline.</p>
          </div>); })()}

        {sub==="invoices" && <div className="space-y-5">
          {isLeadership && <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Ready to invoice <span className="text-xs font-normal text-slate-400">— phases that have finished</span></h3>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              {readyPhases.length===0 && <div className="px-3 py-3 text-sm text-slate-400">Nothing ready — a phase appears here once its end date passes.</div>}
              {readyPhases.map((rp,i)=>(<div key={i} className="flex items-center gap-3 px-3 py-2 border-t border-slate-100 first:border-t-0 text-sm">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{background:rp.cl?rp.cl.color:"#94a3b8"}}/>
                <span className="text-slate-700 truncate">{rp.cl?rp.cl.name+" · ":""}{rp.p.name} <span className="text-slate-400">· {rp.ph.name}</span></span>
                <span className="text-slate-400 shrink-0 hidden sm:inline">ended {rp.end}</span>
                <span className="font-medium text-slate-700 shrink-0">{money(rp.amount)}</span>
                <button onClick={()=>generateInvoice(rp)} className="shrink-0 text-xs font-semibold text-white bg-blue-600 px-2.5 py-1 rounded-lg hover:bg-blue-700">Generate</button>
              </div>))}
            </div>
          </div>}
          <div>
            <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-semibold text-slate-700">Invoices</h3>{isLeadership&&<div className="ml-auto flex items-center gap-2">
              <select onChange={e=>{ const p=data.projects.find(x=>x.id===e.target.value); if(p){ const cl=clientById(p.clientId); openForm("invoice",null,{title:p.name,client:cl?cl.name:"",amount:p.cost||0,projectId:p.id}); } e.target.value=""; }} className="text-xs rounded-lg border border-slate-200 px-2 py-1.5 outline-none" defaultValue=""><option value="">Generate from project…</option>{data.projects.map(p=><option key={p.id} value={p.id}>{p.index} — {p.name}</option>)}</select>
              {byKind("invoice").length===0 && <button onClick={seedInvoices} className="text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2 py-1">Examples</button>}
              <button onClick={()=>openForm("invoice")} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><Plus size={13}/> Add</button></div>}</div>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              {byKind("invoice").length===0 && <div className="px-3 py-3 text-sm text-slate-400">No invoices yet.</div>}
              {byKind("invoice").map(b=>{ const st=INV_STATUS[b.status]||INV_STATUS.pending; return (<div key={b.id} className="flex items-center gap-3 px-3 py-2 border-t border-slate-100 first:border-t-0 text-sm">
                {isLeadership
                  ? <select value={b.status||"pending"} onChange={e=>editBilling({...b,status:e.target.value})} className="text-[11px] rounded border border-slate-200 px-1 py-0.5 outline-none shrink-0" style={{color:st.color}}>{Object.entries(INV_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
                  : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{background:st.color+"22",color:st.color}}>{st.label}</span>}
                <span className="text-slate-700 truncate flex-1">{b.meta&&b.meta.number?<span className="text-slate-400">#{b.meta.number} </span>:""}{b.client?b.client+" · ":""}{b.title}</span>
                <span className="font-medium text-slate-700 shrink-0">{money(b.amount)}</span>
                {(()=>{ const project=data.projects.find(p=>p.id===b.projectId); const cl=(data.clients.find(c=>c.name===b.client))||(project&&clientById(project.clientId)); const phase=project&&b.meta&&b.meta.phaseId&&(project.phases||[]).find(p=>p.id===b.meta.phaseId); const args={inv:b,client:cl,project,phase,profile:ctx.invoiceProfile}; return (<span className="flex items-center gap-1.5 shrink-0">
                  <button title="Download PDF invoice" onClick={()=>downloadInvoice(args)} className="text-slate-400 hover:text-blue-600"><Download size={15}/></button>
                  <button title="Email / share this invoice" onClick={()=>emailInvoice(args)} className="text-slate-400 hover:text-blue-600"><Mail size={15}/></button>
                </span>); })()}
                {Actions(b)}
              </div>);})}
            </div>
            <p className="text-xs text-slate-400 mt-2">Each invoice has a <b>Download</b> (PDF) and <b>Email/share</b> button. VAT is added at 20% on the PDF. Set your studio's details in Settings → Invoice details, and each client's billing address on the client.</p>
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
            <select value={expMonth} onChange={e=>setExpMonth(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 outline-none"><option value="">All months</option>{monthsPresent.map(m=><option key={m} value={m}>{m}</option>)}</select>
            <span className="ml-auto text-sm text-slate-500">Showing <span className="font-semibold text-slate-700">{money(shownTotal)}</span>{paidTotal>0&&<span className="text-slate-400"> · {money(paidTotal)} paid</span>}</span>
          </div>
          {Object.keys(fowed).length>0 && <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Who's owed <span className="text-xs font-normal text-slate-400">(unpaid, for the current filter)</span></h3>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              {Object.entries(fowed).sort((a,b)=>b[1]-a[1]).map(([mid,amt])=>(<div key={mid} className="flex items-center gap-3 px-3 py-2 border-t border-slate-100 first:border-t-0 text-sm"><span className="text-slate-700">{mid==="?"?"Unassigned":memberName(mid)}</span><span className="ml-auto font-medium text-slate-700">{money(amt)}</span></div>))}
            </div>
          </div>}
          <div>
            <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-semibold text-slate-700">Expenses & mileage</h3><div className="ml-auto flex items-center gap-2">{allExp.length===0 && <button onClick={seedExpenses} className="text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2 py-1">Add examples</button>}<button onClick={()=>openForm("expense")} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><Plus size={13}/> Add</button></div></div>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              {shown.length===0 && <div className="px-3 py-3 text-sm text-slate-400">No expenses match this filter.</div>}
              {shown.map(b=>{ const miles=b.meta&&b.meta.miles; const mo=b.meta&&b.meta.month; const pr=b.projectId&&data.projects.find(p=>p.id===b.projectId); const paid=b.status==="paid"; return (<div key={b.id} className="flex items-center gap-3 px-3 py-2 border-t border-slate-100 first:border-t-0 text-sm">
                <button onClick={()=>editBilling({...b,status:paid?"pending":"paid"})} title="Toggle paid" className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{background:(paid?"#27ae60":"#94a3b8")+"22",color:paid?"#1e874b":"#64748b"}}>{paid?"Paid":"Unpaid"}</button>
                <span className="flex-1 min-w-0 text-slate-700 truncate">{b.title}</span>
                <span className="text-slate-400 shrink-0 hidden sm:inline">{b.memberId?memberName(b.memberId):""}{pr?" · "+pr.name:""}{mo?" · "+mo:""}{miles?" · "+miles+" mi":""}</span>
                <span className="w-24 text-right font-medium text-slate-700 shrink-0">{money(b.amount)}</span>
                <span className="w-12 flex justify-end shrink-0">{Actions(b)}</span>
              </div>);})}
              {shown.length>0 && <div className="flex items-center gap-3 px-3 py-2 border-t border-slate-200 bg-slate-50 text-sm font-semibold"><span className="flex-1">Total shown</span><span className="w-24 text-right shrink-0">{money(shownTotal)}</span><span className="w-12 shrink-0"></span></div>}
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
  const save=()=>{ if(!title.trim()){ alert("Add a description."); return; } let amt=Number(amount)||0; let meta;
    if(kind==="expense") meta={miles:Number(miles)||0,month:month||""};
    else if(kind==="pipeline") meta={start:pStart||"",end:pEnd||"",likelihood:likely};
    else if(kind==="overhead"){ if(month!==""){ const mi=Number(month); meta={...(entry?.meta||{}),months:{...((entry&&entry.meta&&entry.meta.months)||{}),[mi]:amt}}; amt=0; } else meta=(entry?.meta||{}); }
    else meta=(p.meta||entry?.meta||{});
    const b={...(entry||{}),id:entry?.id,kind,title:title.trim(),client:client||"",amount:amt,status:status||null,date:kind==="overhead"?"":(date||""),memberId:memberId||null,projectId:(kind==="expense"?projectId:(p.projectId||entry?.projectId))||null,meta}; onSave(b); };
  return (<><ModalHead title={(entry?"Edit ":"New ")+({pipeline:"pipeline job",overhead:"overhead",invoice:"invoice",expense:"expense"}[kind]||"entry")} onClose={onClose}/><div className="p-5">
    <Field label={titleLabel}><input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} autoFocus/></Field>
    {(kind==="pipeline"||kind==="invoice") && <Field label="Client"><input className={inputCls} value={client} onChange={e=>setClient(e.target.value)} placeholder="Client name"/></Field>}
    <div className="grid grid-cols-2 gap-3">
      <Field label={kind==="overhead"?"£ amount":"Amount (£)"}><input type="number" min="0" className={inputCls} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/></Field>
      {kind==="overhead" && <Field label="Applies to"><select className={inputCls} value={month} onChange={e=>setMonth(e.target.value)}><option value="">Every month</option>{FY_MONTHS.map((m,i)=><option key={i} value={String(i)}>{m} only</option>)}</select></Field>}
      {kind==="pipeline" && <Field label="Status"><select className={inputCls} value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(PIPE_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Field>}
      {kind==="invoice" && <Field label="Status"><select className={inputCls} value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(INV_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Field>}
      {kind==="expense" && <Field label="Miles (if mileage)"><input type="number" min="0" className={inputCls} value={miles} onChange={e=>setMiles(e.target.value)} placeholder="0"/></Field>}
    </div>
    {kind==="expense" && <><div className="grid grid-cols-2 gap-3">
      <Field label="Project"><select className={inputCls} value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">— none —</option>{projects.map(pr=><option key={pr.id} value={pr.id}>{pr.index} — {pr.name}</option>)}</select></Field>
      <Field label="Month"><input type="month" className={inputCls} value={month} onChange={e=>setMonth(e.target.value)}/></Field>
    </div>
    <Field label="Who's owed"><select className={inputCls} value={memberId} onChange={e=>setMemberId(e.target.value)}><option value="">—</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field></>}
    {kind==="pipeline" && <><div className="grid grid-cols-2 gap-3">
      <Field label="Expected start"><input type="date" className={inputCls} value={pStart} onChange={e=>setPStart(e.target.value)}/></Field>
      <Field label="Expected end"><input type="date" className={inputCls} value={pEnd} onChange={e=>setPEnd(e.target.value)}/></Field>
    </div>
    <Field label="Likelihood to convert"><select className={inputCls} value={likely} onChange={e=>setLikely(e.target.value)}><option value="high">Highly likely</option><option value="low">Less likely</option></select></Field></>}
    {kind==="invoice" && <Field label="Invoice date"><input type="date" className={inputCls} value={date} onChange={e=>setDate(e.target.value)}/></Field>}
  </div><ModalFoot onSave={save} onDelete={onDelete&&entry?()=>onDelete(entry.id):null} saveLabel={entry?"Save":"Add"}/></>);
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
  const ctx={ data, clientById, projectById, isLeadership:canEdit, teamList, myMemberId:me.id, setModal, invoiceProfile,
    addBilling:canEdit?H.addBilling:(()=>{}), editBilling:canEdit?H.editBilling:(()=>{}), delBilling:canEdit?H.delBilling:(()=>{}),
    convertPipeline, shiftProjectDates };

  return (<div className="h-full">
    {!canEdit && <div className="px-4 py-2 text-xs bg-amber-50 border-b border-amber-200 text-amber-800">You can view billing but not edit it.</div>}
    <BillingPlan {...ctx} />
    {modal?.type==="billing" && <ModalShell onClose={()=>setModal(null)}>
      <BillingForm kind={modal.payload.kind} entry={modal.payload.entry} preset={modal.payload.preset} members={data.members} projects={data.projects} me={me.id}
        onSave={b=>{ if(b.id) H.editBilling(b); else H.addBilling(b); setModal(null); }}
        onDelete={modal.payload.entry?id=>{ H.delBilling(id); setModal(null); }:null} onClose={()=>setModal(null)} />
    </ModalShell>}
  </div>);
}
