// Read-only project view: who it's for, where it stands against its hours
// budget, phase by phase, who has worked on it and who's on it now. Opened
// from the Schedule, the Timesheet's Project hours and Clients & Projects.
// "Edit project" (projects.manage) opens the edit form; when the project has
// overrun, "Add overflow phase" opens it with a new phase sized to the
// overrun — e.g. once the client agrees extra budget for scope creep.
// Works on the raw org data (loadOrgData), like Clients & Projects.
import React, { useState } from "react";
import { can } from "../lib/permissions.js";
import { MONTHS, AVATAR_BG, initials, fmtH, money, toISO, startOfDay, parseISO } from "../studio/core.jsx";
import { ProjectModal } from "./Projects.jsx";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmtDay = (iso) => { const d = parseISO(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

// Where a project stands on the schedule, from its work bars.
export function projectStatus(assignments, todayISO) {
  if (!assignments.length) return { label: "Not scheduled", variant: "outline" };
  const first = assignments.reduce((m, a) => (a.start_date < m ? a.start_date : m), assignments[0].start_date);
  const last = assignments.reduce((m, a) => (a.end_date > m ? a.end_date : m), assignments[0].end_date);
  if (last < todayISO) return { label: "Finished", variant: "secondary", first, last };
  if (first > todayISO) return { label: "Upcoming", variant: "outline", first, last };
  return { label: "In progress", variant: "default", first, last };
}

export default function ProjectView({ org, me, data, projectId, reload, onClose }) {
  const [editing, setEditing] = useState(null); // null | { addPhase? }
  const project = (data.projects || []).find((p) => p.id === projectId);
  if (!project) return null;
  const client = (data.clients || []).find((c) => c.id === project.client_id);
  const todayISO = toISO(startOfDay(new Date()));
  const memberOf = (id) => (data.members || []).find((m) => m.id === id);
  const memberIdx = (id) => (data.members || []).findIndex((m) => m.id === id);

  const logs = (data.timeLogs || []).filter((l) => l.project_id === project.id);
  const bars = (data.assignments || []).filter((a) => a.project_id === project.id && a.kind === "work");
  const status = projectStatus(bars, todayISO);
  const phases = project.phases || [];
  const minsOnPhase = (id) => logs.filter((l) => (l.phase_id || "") === (id || "")).reduce((s, l) => s + l.minutes, 0);
  const noPhaseMins = logs.filter((l) => !l.phase_id || !phases.some((p) => p.id === l.phase_id)).reduce((s, l) => s + l.minutes, 0);
  const loggedH = logs.reduce((s, l) => s + l.minutes, 0) / 60;
  const budgetH = phases.reduce((s, p) => s + (Number(p.hours) > 0 ? Number(p.hours) : 0), 0);
  const over = budgetH > 0 ? loggedH - budgetH : 0;

  const byPerson = Object.entries(logs.reduce((m, l) => { m[l.membership_id] = (m[l.membership_id] || 0) + l.minutes; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const onItNow = [...new Set(bars.filter((a) => a.start_date <= todayISO && a.end_date >= todayISO).map((a) => a.membership_id))];
  const mayEdit = can(me, "projects.manage");

  const Person = ({ id, children }) => { const m = memberOf(id); const i = memberIdx(id); return (
    <div className="flex items-center gap-2 text-sm">
      <Avatar size="sm"><AvatarFallback className="text-white" style={{ background: AVATAR_BG[(i < 0 ? 0 : i) % AVATAR_BG.length] }}>{initials(m ? m.display_name : "?")}</AvatarFallback></Avatar>
      <span className="min-w-0 flex-1 truncate">{m ? m.display_name : "Former member"}</span>{children}
    </div>); };

  if (editing) {
    return <ProjectModal org={org} project={project} clients={data.clients || []} extraPhase={editing.extraPhase}
      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload && reload(); }} />;
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="size-3 rounded-xs shrink-0" style={{ background: client ? client.color : "#94a3b8" }} />
            {project.code ? project.code + " · " : ""}{project.name}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>{client ? client.name : "No client"}{client?.sector ? " · " + client.sector : ""}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
            {status.first && <span>{fmtDay(status.first)} – {fmtDay(status.last)}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Value", Number(project.cost) ? money(project.cost) : "—"],
            ["Hours budget", budgetH ? fmtH(budgetH) + "h" : "—"],
            ["Logged", fmtH(loggedH) + "h"],
            [over > 0.05 ? "Over budget" : "Remaining", budgetH ? (over > 0.05 ? "+" + fmtH(over) + "h" : fmtH(budgetH - loggedH) + "h") : "N/A"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border px-3 py-2">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className={`text-lg font-medium tabular-nums ${k === "Over budget" ? "text-destructive" : ""}`}>{v}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">Phases</div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Phase</TableHead><TableHead className="text-right">Days</TableHead><TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Logged</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead className="text-right">Fee</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {phases.map((p) => { const h = minsOnPhase(p.id) / 60; const b = Number(p.hours) > 0 ? Number(p.hours) : null; const o = b != null ? h - b : null; return (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.days || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{b != null ? fmtH(b) + "h" : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtH(h)}h</TableCell>
                  <TableCell className={`text-right tabular-nums ${o != null && o > 0.05 ? "text-destructive" : ""}`}>{o == null ? "N/A" : o > 0.05 ? `+${fmtH(o)}h over` : `${fmtH(-o)}h`}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(p.fee) > 0 ? money(p.fee) : "—"}</TableCell>
                </TableRow>); })}
              {noPhaseMins > 0 && <TableRow>
                <TableCell className="text-muted-foreground">No phase</TableCell><TableCell /><TableCell />
                <TableCell className="text-right tabular-nums">{fmtH(noPhaseMins / 60)}h</TableCell><TableCell /><TableCell />
              </TableRow>}
              {phases.length === 0 && noPhaseMins === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No phases yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-medium">Worked on it</div>
            <div className="flex flex-col gap-1.5">
              {byPerson.map(([id, mins]) => <Person key={id} id={id}><span className="text-sm font-medium tabular-nums">{fmtH(mins / 60)}h</span></Person>)}
              {byPerson.length === 0 && <p className="text-sm text-muted-foreground">No time logged yet.</p>}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">On the schedule now</div>
            <div className="flex flex-col gap-1.5">
              {onItNow.map((id) => <Person key={id} id={id} />)}
              {onItNow.length === 0 && <p className="text-sm text-muted-foreground">No one is booked on it today.</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          {mayEdit && over > 0.05 && <Button variant="outline" className="sm:mr-auto" title="Add a phase holding the extra hours, e.g. once the client agrees more budget"
            onClick={() => setEditing({ extraPhase: { name: "Overflow", hours: Math.ceil(over) } })}><Plus data-icon="inline-start" /> Add overflow phase</Button>}
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {mayEdit && <Button onClick={() => setEditing({})}><Pencil data-icon="inline-start" /> Edit project</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
