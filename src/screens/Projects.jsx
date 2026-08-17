import React, { useState } from "react";
import { sb } from "../lib/supabase.js";
import { logAudit } from "../lib/api.js";
import { Card, Empty, Field, Modal, Pill } from "../ui.jsx";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { money } from "../lib/dates.js";
import { Plus, Trash2, Pencil, Layers } from "lucide-react";
import { useConfirm } from "../components/confirm.tsx";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CLIENT_COLORS = ["#2f80ed", "#9b51e0", "#16a0a0", "#eb5757", "#27ae60", "#f2994a", "#2d9cdb", "#eb5757", "#6b7a99", "#b5179e"];
const uid = () => Math.random().toString(36).slice(2, 9);

export default function Projects({ org, me, data, reload, terms }) {
  const T = terms || { client: "Client", clients: "Clients", clientLower: "client", project: "Project", projects: "Projects" };
  const [modal, setModal] = useState(null);
  const mayProjects = can(me, "projects.manage");
  const mayClients = can(me, "clients.manage");
  if (!can(me, "schedule.view") && !mayProjects) return <NoAccess what="projects" />;

  const clientById = (id) => data.clients.find(c => c.id === id);

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <h2 className="text-base font-bold text-foreground">{T.clients} &amp; {T.projectsLower||"projects"}</h2>

      <Card title={T.clients} action={mayClients && <Button onClick={() => setModal({ type: "client" })}><Plus data-icon="inline-start" /> Add {T.clientLower}</Button>}>
        {data.clients.length === 0 && <Empty title={"No "+T.clientsLower+" yet"}>Add your first {T.clientLower} to start booking work.</Empty>}
        <div className="divide-y divide-border/60">
          {data.clients.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2 text-sm group">
              <span className="w-3.5 h-3.5 rounded-xs" style={{ background: c.color || "#94a3b8" }} />
              <span className="text-foreground">{c.name}</span>
              <span className="ml-auto text-xs text-muted-foreground/70">{c.payment_terms || 30} day terms</span>
              {mayClients && <button className="text-muted-foreground/40 hover:text-primary-foreground" onClick={() => setModal({ type: "client", c })}><Pencil size={14} /></button>}
            </div>
          ))}
        </div>
      </Card>

      <Card title={T.projects} action={mayProjects && <Button onClick={() => setModal({ type: "project" })}><Plus data-icon="inline-start" /> Add {T.projectLower||"project"}</Button>}>
        {data.projects.length === 0 && <Empty title={"No "+(T.projectsLower||"projects")+" yet"}>{T.projects} hold the phases you schedule and bill against.</Empty>}
        {(() => {
          const byClient = {};
          const groups = [];
          data.clients.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(c => { byClient[c.id] = { client: c, projects: [] }; groups.push(byClient[c.id]); });
          const noClient = { client: null, projects: [] };
          data.projects.forEach(p => { (byClient[p.client_id] || noClient).projects.push(p); });
          if (noClient.projects.length) groups.push(noClient);
          return groups.filter(g => g.projects.length).map(g => (
            <div key={g.client ? g.client.id : "none"} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3.5 h-3.5 rounded-xs shrink-0" style={{ background: g.client ? g.client.color : "#94a3b8" }} />
                <span className="text-sm font-semibold text-foreground/80">{g.client ? g.client.name : ("No "+T.clientLower)}</span>
                <span className="text-xs text-muted-foreground/70">· {g.projects.length} project{g.projects.length === 1 ? "" : "s"}</span>
              </div>
              <div className="divide-y divide-border/60 pl-5 border-l-2" style={{ borderColor: (g.client ? g.client.color : "#e2e8f0") + "55" }}>
                {g.projects.map(p => {
                  const phaseDays = (p.phases || []).reduce((s, ph) => s + (Number(ph.days) || 0), 0);
                  return (<div key={p.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="text-foreground truncate">{p.code ? p.code + " · " : ""}{p.name}</div>
                      <div className="text-xs text-muted-foreground/70">{(p.phases || []).length} phase{(p.phases || []).length === 1 ? "" : "s"}{phaseDays ? ` · ${phaseDays} days` : ""}</div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{money(p.cost)}</span>
                    {mayProjects && <button className="text-muted-foreground/40 hover:text-primary-foreground shrink-0" onClick={() => setModal({ type: "project", p })}><Pencil size={14} /></button>}
                  </div>);
                })}
              </div>
            </div>
          ));
        })()}
      </Card>

      {modal?.type === "client" && <ClientModal org={org} client={modal.c} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.type === "project" && <ProjectModal org={org} project={modal.p} clients={data.clients} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
}

function ClientModal({ org, client, onClose, onSaved }) {
  const confirm = useConfirm();
  const [name, setName] = useState(client?.name || "");
  const [color, setColor] = useState(client?.color || CLIENT_COLORS[0]);
  const [terms, setTerms] = useState(client?.payment_terms ?? 30);
  const [addr, setAddr] = useState(client?.billing_address || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const row = { org_id: org.id, name: name.trim(), color, payment_terms: Number(terms) || 30, billing_address: addr.trim() || null };
    if (client) await sb.from("clients").update(row).eq("id", client.id);
    else await sb.from("clients").insert(row);
    setBusy(false); onSaved();
  };
  const del = async () => { if (!(await confirm({ title: "Delete this client?", description: "Projects keep working but lose the link.", confirmLabel: "Delete", destructive: true }))) return; await sb.from("clients").delete().eq("id", client.id); onSaved(); };
  return (<Modal title={client ? "Edit client" : "Add client"} onClose={onClose}
    footer={<>{client && <Button variant="destructive" className="mr-auto" onClick={del}><Trash2 size={14} /> Delete</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !name.trim()}>Save</Button></>}>
    <Field label="Client name"><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
    <Field label="Colour"><div className="flex flex-wrap gap-2">{CLIENT_COLORS.map(c => <button key={c} onClick={() => setColor(c)} className="w-8 h-8 rounded-lg" style={{ background: c, outline: color === c ? "2px solid var(--ring)" : "none", outlineOffset: 2 }} />)}</div></Field>
    <Field label="Payment terms (days)" hint="Used to estimate when invoices get paid."><Input type="number" value={terms} onChange={e => setTerms(e.target.value)} /></Field>
    <Field label="Billing address (for invoices)"><Textarea rows={3} value={addr} onChange={e => setAddr(e.target.value)} placeholder={"Accounts Payable\nClient Ltd\nLondon"} /></Field>
  </Modal>);
}

export function ProjectModal({ org, project, clients, onClose, onSaved }) {
  const confirm = useConfirm();
  const [name, setName] = useState(project?.name || "");
  const [code, setCode] = useState(project?.code || "");
  const [clientId, setClientId] = useState(project?.client_id || "");
  const [cost, setCost] = useState(project?.cost ?? "");
  const [phases, setPhases] = useState(project?.phases?.length ? project.phases.map(p => ({ ...p })) : [{ id: uid(), name: "Phase 1", days: 5, hours: "", fee: "" }]);
  const [busy, setBusy] = useState(false);

  const setPhase = (i, k, v) => setPhases(phases.map((p, j) => j === i ? { ...p, [k]: v } : p));
  const addPhase = () => setPhases([...phases, { id: uid(), name: `Phase ${phases.length + 1}`, days: 5, hours: "", fee: "" }]);
  const rmPhase = (i) => setPhases(phases.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true);
    const cleanPhases = phases.filter(p => p.name.trim()).map(p => ({
      id: p.id || uid(), name: p.name.trim(),
      days: Number(p.days) || 0,
      hours: p.hours === "" || p.hours == null ? null : Number(p.hours),
      fee: p.fee === "" || p.fee == null ? null : Number(p.fee),
    }));
    const row = { org_id: org.id, name: name.trim(), code: code.trim() || name.trim().slice(0, 6).toUpperCase(), client_id: clientId || null, cost: Number(cost) || 0, phases: cleanPhases };
    if (project) await sb.from("projects").update(row).eq("id", project.id);
    else { const { data: ins } = await sb.from("projects").insert(row).select().single(); logAudit(org.id, "project.created", "project", { id: ins?.id }); }
    setBusy(false); onSaved();
  };
  const del = async () => { if (!(await confirm({ title: "Delete this project and its bookings?", confirmLabel: "Delete", destructive: true }))) return; await sb.from("projects").delete().eq("id", project.id); onSaved(); };

  return (<Modal wide title={project ? "Edit project" : "Add project"} onClose={onClose}
    footer={<>{project && <Button variant="destructive" className="mr-auto" onClick={del}><Trash2 size={14} /> Delete</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !name.trim()}>Save project</Button></>}>
    <Field label="Project name"><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
    <div className="grid grid-cols-3 gap-3">
      <Field label="Code"><Input value={code} onChange={e => setCode(e.target.value)} placeholder="HID0514" /></Field>
      <Field label="Client"><NativeSelect className="w-full" value={clientId} onChange={e => setClientId(e.target.value)}><option value="">— none —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
      <Field label="Value (£)"><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></Field>
    </div>

    <div className="flex items-center gap-2 mt-2 mb-2">
      <Layers size={14} className="text-muted-foreground/70" /><span className="text-xs font-semibold text-muted-foreground">Phases</span>
      <button className="ml-auto text-xs font-semibold text-primary-foreground flex items-center gap-1" onClick={addPhase}><Plus size={13} /> Add phase</button>
    </div>
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="grid gap-1 px-2 py-1.5 bg-muted/50 text-[11px] font-semibold text-muted-foreground/70" style={{ gridTemplateColumns: "1fr 70px 70px 90px 28px" }}>
        <span>Name</span><span className="text-right">Days</span><span className="text-right">Hrs budget</span><span className="text-right">Fee £</span><span />
      </div>
      {phases.map((p, i) => (
        <div key={p.id} className="grid gap-1 px-2 py-1.5 border-t border-border/60 items-center" style={{ gridTemplateColumns: "1fr 70px 70px 90px 28px" }}>
          <input className="text-sm outline-none border border-border rounded px-2 py-1" value={p.name} onChange={e => setPhase(i, "name", e.target.value)} />
          <input type="number" className="text-sm text-right outline-none border border-border rounded px-1 py-1" value={p.days} onChange={e => setPhase(i, "days", e.target.value)} />
          <input type="number" className="text-sm text-right outline-none border border-border rounded px-1 py-1" value={p.hours ?? ""} placeholder="—" onChange={e => setPhase(i, "hours", e.target.value)} />
          <input type="number" className="text-sm text-right outline-none border border-border rounded px-1 py-1" value={p.fee ?? ""} placeholder="—" onChange={e => setPhase(i, "fee", e.target.value)} />
          <button className="text-muted-foreground/40 hover:text-destructive justify-self-center" onClick={() => rmPhase(i)}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
    <p className="text-[11px] text-muted-foreground/70 mt-2">Days = working days scheduled. Hrs budget & Fee are optional — they power the Summary "hours vs budget" and the billing plan.</p>
  </Modal>);
}
