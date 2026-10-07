import React, { useState } from "react";
import { sb } from "../lib/supabase.js";
import { logAudit } from "../lib/api.js";
import { can } from "../lib/permissions.js";
import { NoAccess } from "./Workspace.jsx";
import { money } from "../lib/dates.js";
import { Plus, Trash2, Pencil, Layers } from "lucide-react";
import { useConfirm } from "../components/confirm.tsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";

const CLIENT_COLORS = ["#2f80ed", "#9b51e0", "#16a0a0", "#eb5757", "#27ae60", "#f2994a", "#2d9cdb", "#eb5757", "#6b7a99", "#b5179e"];
const uid = () => Math.random().toString(36).slice(2, 9);

export default function Projects({ org, me, data, reload, terms }) {
  const T = terms || { client: "Client", clients: "Clients", clientLower: "client", project: "Project", projects: "Projects" };
  const [modal, setModal] = useState(null);
  const mayProjects = can(me, "projects.manage");
  const mayClients = can(me, "clients.manage");
  if (!can(me, "schedule.view") && !mayProjects) return <NoAccess what="projects" />;

  const clientById = (id) => data.clients.find(c => c.id === id);

  // Sectors group clients (a client's free-text `sector`); projects follow
  // their client's sector. Only shown once at least one client has one.
  const sectorOf = (c) => (c && typeof c.sector === "string" && c.sector.trim()) || "";
  const sectors = [...new Set(data.clients.map(sectorOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const hasSectors = sectors.length > 0;
  const sectorList = hasSectors ? [...sectors, ""] : [""];
  const sectorName = (s) => s || "No sector";
  const sectorColor = (s) => s ? `var(--chart-${(sectors.indexOf(s) % 4) + 2})` : "var(--chart-1)";
  const projectsIn = (s) => data.projects.filter(p => sectorOf(clientById(p.client_id)) === s);

  // Client → projects groups for one slice of projects.
  const clientGroups = (projects) => {
    const byClient = {};
    const groups = [];
    data.clients.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(c => { byClient[c.id] = { client: c, projects: [] }; groups.push(byClient[c.id]); });
    const noClient = { client: null, projects: [] };
    projects.forEach(p => { (byClient[p.client_id] || noClient).projects.push(p); });
    if (noClient.projects.length) groups.push(noClient);
    return groups.filter(g => g.projects.length);
  };

  return (
    <ScrollArea className="h-full"><div className="@container/main px-4 lg:px-6 py-4 md:py-6 flex flex-col gap-4 md:gap-6">
      <h2 className="text-base font-medium text-foreground">{T.clients} &amp; {T.projectsLower||"projects"}</h2>

      <Card><CardHeader><CardTitle>{T.clients}</CardTitle><CardAction>{mayClients && <Button onClick={() => setModal({ type: "client" })}><Plus data-icon="inline-start" /> Add {T.clientLower}</Button>}</CardAction></CardHeader><CardContent>
        {data.clients.length === 0 && <Empty><EmptyHeader><EmptyTitle>{"No "+T.clientsLower+" yet"}</EmptyTitle><EmptyDescription>Add your first {T.clientLower} to start booking work.</EmptyDescription></EmptyHeader></Empty>}
        {sectorList.map(s => {
          const list = data.clients.filter(c => sectorOf(c) === s);
          if (!list.length) return null;
          return (<div key={s || "none"} className="mb-3 last:mb-0">
            {hasSectors && <div className="flex items-center gap-2 py-1 text-xs font-medium text-muted-foreground"><span className="size-2.5 rounded-full" style={{ background: sectorColor(s) }} />{sectorName(s)} · {list.length} {list.length === 1 ? T.clientLower : (T.clientsLower || "clients")}</div>}
            <div className="divide-y divide-border/60">
              {list.map(c => (
                <div key={c.id} className="flex items-center gap-3 py-2 text-sm group">
                  <span className="w-3.5 h-3.5 rounded-xs" style={{ background: c.color || "#94a3b8" }} />
                  <span className="text-foreground">{c.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{c.payment_terms || 30} day terms</span>
                  {mayClients && <Button variant="ghost" size="icon-sm" title="Edit client" onClick={() => setModal({ type: "client", c })}><Pencil /></Button>}
                </div>
              ))}
            </div>
          </div>);
        })}
        {mayClients && data.clients.length > 0 && !hasSectors && <p className="mt-2 text-xs text-muted-foreground">Tip: give clients a sector (e.g. the kind of work they bring) to see your projects grouped by sector below.</p>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>{T.projects}</CardTitle><CardAction>{mayProjects && <Button onClick={() => setModal({ type: "project" })}><Plus data-icon="inline-start" /> Add {T.projectLower||"project"}</Button>}</CardAction></CardHeader><CardContent>
        {data.projects.length === 0 && <Empty><EmptyHeader><EmptyTitle>{"No "+(T.projectsLower||"projects")+" yet"}</EmptyTitle><EmptyDescription>{T.projects} hold the phases you schedule and bill against.</EmptyDescription></EmptyHeader></Empty>}
        {/* The spread: how projects divide across sectors. */}
        {hasSectors && data.projects.length > 0 && (
          <div className="mb-5">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              {sectorList.map(s => { const n = projectsIn(s).length; return n ? <div key={s || "none"} title={`${sectorName(s)} · ${n}`} style={{ width: `${(n / data.projects.length) * 100}%`, background: sectorColor(s) }} /> : null; })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {sectorList.map(s => { const n = projectsIn(s).length; return n ? <span key={s || "none"} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: sectorColor(s) }} />{sectorName(s)} <span className="font-medium text-foreground tabular-nums">{n}</span> · {Math.round((n / data.projects.length) * 100)}%</span> : null; })}
            </div>
          </div>
        )}
        {sectorList.map(s => {
          const projects = projectsIn(s);
          if (!projects.length) return null;
          const value = projects.reduce((t, p) => t + (Number(p.cost) || 0), 0);
          return (<div key={s || "none"} className={hasSectors ? "mb-6 last:mb-0" : undefined}>
            {hasSectors && <div className="mb-3 flex items-center gap-2 border-b pb-2">
              <span className="size-3 rounded-full" style={{ background: sectorColor(s) }} />
              <span className="text-sm font-medium">{sectorName(s)}</span>
              <span className="text-xs text-muted-foreground">{projects.length} {projects.length === 1 ? (T.projectLower || "project") : (T.projectsLower || "projects")}{value ? ` · ${money(value)}` : ""}</span>
            </div>}
        {(() => {
          return clientGroups(projects).map(g => (
            <div key={g.client ? g.client.id : "none"} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3.5 h-3.5 rounded-xs shrink-0" style={{ background: g.client ? g.client.color : "#94a3b8" }} />
                <span className="text-sm font-medium text-foreground">{g.client ? g.client.name : ("No "+T.clientLower)}</span>
                <span className="text-xs text-muted-foreground">· {g.projects.length} project{g.projects.length === 1 ? "" : "s"}</span>
              </div>
              <div className="divide-y divide-border/60 pl-5 border-l-2" style={{ borderColor: (g.client ? g.client.color : "#e2e8f0") + "55" }}>
                {g.projects.map(p => {
                  const phaseDays = (p.phases || []).reduce((s, ph) => s + (Number(ph.days) || 0), 0);
                  return (<div key={p.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="text-foreground truncate">{p.code ? p.code + " · " : ""}{p.name}</div>
                      <div className="text-xs text-muted-foreground">{(p.phases || []).length} phase{(p.phases || []).length === 1 ? "" : "s"}{phaseDays ? ` · ${phaseDays} days` : ""}</div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{money(p.cost)}</span>
                    {mayProjects && <Button variant="ghost" size="icon-sm" className="shrink-0" title="Edit project" onClick={() => setModal({ type: "project", p })}><Pencil /></Button>}
                  </div>);
                })}
              </div>
            </div>
          ));
        })()}
          </div>);
        })}
      </CardContent></Card>

      {modal?.type === "client" && <ClientModal org={org} client={modal.c} sectors={sectors} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.type === "project" && <ProjectModal org={org} project={modal.p} clients={data.clients} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div></ScrollArea>
  );
}

function ClientModal({ org, client, sectors = [], onClose, onSaved }) {
  const confirm = useConfirm();
  const [name, setName] = useState(client?.name || "");
  const [color, setColor] = useState(client?.color || CLIENT_COLORS[0]);
  const [terms, setTerms] = useState(client?.payment_terms ?? 30);
  const [addr, setAddr] = useState(client?.billing_address || "");
  const [sector, setSector] = useState(client?.sector || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const row = { org_id: org.id, name: name.trim(), color, payment_terms: Number(terms) || 30, billing_address: addr.trim() || null, sector: sector.trim() || null };
    const { error } = client ? await sb.from("clients").update(row).eq("id", client.id) : await sb.from("clients").insert(row);
    setBusy(false);
    if (error) { toast.add({ title: "Couldn't save the client: " + error.message, type: "error" }); return; }
    onSaved();
  };
  const del = async () => { if (!(await confirm({ title: "Delete this client?", description: "Projects keep working but lose the link.", confirmLabel: "Delete", destructive: true }))) return; await sb.from("clients").delete().eq("id", client.id); onSaved(); };
  return (<Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>{client ? "Edit client" : "Add client"}</DialogTitle></DialogHeader>
    <FieldGroup>
    <Field><FieldLabel>Client name</FieldLabel><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
    {/* A plain field (a type-ahead would throw away a brand-new sector name
        on blur/Enter), with the sectors already in use one click away. */}
    <Field><FieldLabel>Sector (optional)</FieldLabel>
      <Input value={sector} onChange={e => setSector(e.target.value)} placeholder="Type a new sector, or pick one below"
        onKeyDown={e => { if (e.key === "Enter" && name.trim()) save(); }} />
      {sectors.length > 0 && <div className="flex flex-wrap gap-1.5">
        {sectors.map(s => <Button key={s} type="button" size="xs" variant={sector.trim() === s ? "secondary" : "outline"} onClick={() => setSector(sector.trim() === s ? "" : s)}>{s}</Button>)}
      </div>}
      <FieldDescription>Groups your clients — Projects below are shown by sector.</FieldDescription>
    </Field>
    <Field><FieldLabel>Colour</FieldLabel><div className="flex flex-wrap gap-2">{CLIENT_COLORS.map(c => <button key={c} onClick={() => setColor(c)} className="w-8 h-8 rounded-lg" style={{ background: c, outline: color === c ? "2px solid var(--ring)" : "none", outlineOffset: 2 }} />)}</div></Field>
    <Field><FieldLabel>Payment terms (days)</FieldLabel><Input type="number" value={terms} onChange={e => setTerms(e.target.value)} /><FieldDescription>Used to estimate when invoices get paid.</FieldDescription></Field>
    <Field><FieldLabel>Billing address (for invoices)</FieldLabel><Textarea rows={3} value={addr} onChange={e => setAddr(e.target.value)} placeholder={"Accounts Payable\nClient Ltd\nLondon"} /></Field>
    </FieldGroup>
  <DialogFooter>{<>{client && <Button variant="destructive" className="mr-auto" onClick={del}><Trash2 size={14} /> Delete</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !name.trim()}>Save</Button></>}</DialogFooter></DialogContent></Dialog>);
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

  return (<Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-3xl max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>{project ? "Edit project" : "Add project"}</DialogTitle></DialogHeader>
    <FieldGroup>
    <Field><FieldLabel>Project name</FieldLabel><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
    <div className="grid grid-cols-3 gap-3">
      <Field><FieldLabel>Code</FieldLabel><Input value={code} onChange={e => setCode(e.target.value)} placeholder="HID0514" /></Field>
      <Field><FieldLabel>Client</FieldLabel><Select value={clientId} onValueChange={setClientId} items={{"":"— none —",...Object.fromEntries(clients.map(c=>[c.id,c.name]))}}>
        <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="">— none —</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectGroup></SelectContent>
      </Select></Field>
      <Field><FieldLabel>Value (£)</FieldLabel><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></Field>
    </div>

    <div className="flex items-center gap-2">
      <Layers size={14} className="text-muted-foreground" /><span className="text-sm font-medium">Phases</span>
      <Button variant="ghost" size="sm" className="ml-auto" onClick={addPhase}><Plus data-icon="inline-start" /> Add phase</Button>
    </div>
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="grid gap-1 px-2 py-1.5 bg-muted/50 text-[11px] font-medium text-muted-foreground" style={{ gridTemplateColumns: "1fr 80px 80px 100px 32px" }}>
        <span>Name</span><span className="text-right">Days</span><span className="text-right">Hrs budget</span><span className="text-right">Fee £</span><span />
      </div>
      {phases.map((p, i) => (
        <div key={p.id} className="grid gap-1 px-2 py-1.5 border-t border-border/60 items-center" style={{ gridTemplateColumns: "1fr 80px 80px 100px 32px" }}>
          <Input value={p.name} onChange={e => setPhase(i, "name", e.target.value)} />
          <Input type="number" className="text-right px-1" value={p.days} onChange={e => setPhase(i, "days", e.target.value)} />
          <Input type="number" className="text-right px-1" value={p.hours ?? ""} placeholder="—" onChange={e => setPhase(i, "hours", e.target.value)} />
          <Input type="number" className="text-right px-1" value={p.fee ?? ""} placeholder="—" onChange={e => setPhase(i, "fee", e.target.value)} />
          <Button variant="ghost" size="icon-sm" className="justify-self-center" title="Remove phase" onClick={() => rmPhase(i)}><Trash2 /></Button>
        </div>
      ))}
    </div>
    <p className="text-xs text-muted-foreground">Days = working days scheduled. Hrs budget & Fee are optional — they power the Summary "hours vs budget" and the billing plan.</p>
    </FieldGroup>
  <DialogFooter>{<>{project && <Button variant="destructive" className="mr-auto" onClick={del}><Trash2 size={14} /> Delete</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !name.trim()}>Save project</Button></>}</DialogFooter></DialogContent></Dialog>);
}
