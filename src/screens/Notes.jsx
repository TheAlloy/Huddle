// My notes: each person's private, dated notebook. Only the author can ever
// read a note (database rule — owners and admins included). Notes come from
// the tracker panel and pop-out timer (joined to the time they logged), from
// a project's view, or are written here, with or without a project. Any note
// on a project can be shared with the team as a comment — the note stays put.
// Team-visible discussion is Comments (Comments.jsx), not this.
import React, { useMemo, useState } from "react";
import { sb } from "../lib/supabase.js";
import { MONTHS, DOW, pad, toISO, startOfDay, addDays, hm, mapData, makeHandlers, projectsByClient } from "../studio/core.jsx";
import { makeLabels, ProjectCombobox, recentCombos } from "./tracker/shared.jsx";
import { useConfirm } from "../components/confirm.tsx";
import { Lock, Pencil, Trash2, Share2, Search, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/components/ui/toast";

const clock = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fullWhen = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${clock(iso)}`; };
const dayHeading = (iso, todayISO) => {
  const d = startOfDay(new Date(iso)), k = toISO(d);
  if (k === todayISO) return "Today";
  if (k === toISO(addDays(new Date(todayISO + "T00:00:00"), -1))) return "Yesterday";
  return `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

// Shares a note's text to its project's team comments, under the phase it's on.
export async function shareNote(org, me, note) {
  if (!note.projectId) return false;
  const { error } = await sb.from("assignment_comments").insert({ org_id: org.id, project_id: note.projectId, phase_id: note.phaseId || null, membership_id: me.id, body: note.body });
  if (error) { toast.add({ title: "Couldn't share it: " + error.message, type: "error" }); return false; }
  toast.add({ title: "Shared to the project's comments — your note stays private." });
  return true;
}

// One note: when, what it's on, the text; edit / share / delete.
export function NoteItem({ note, labels, logs = [], when = "time", showProject = true, showPhase = true, onEdit, onDelete, onShare }) {
  const [editing, setEditing] = useState(null);
  const log = note.timeLogId ? logs.find((l) => l.id === note.timeLogId) : null;
  const edited = note.updatedAt && Math.abs(new Date(note.updatedAt) - new Date(note.createdAt)) > 60000;
  const phase = note.projectId && note.phaseId ? labels.phName(note.projectId, note.phaseId) : "";
  const save = () => { const t = (editing || "").trim(); if (t && t !== note.body) onEdit(note.id, t); setEditing(null); };
  return (
    <div className="group flex flex-col gap-1.5 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{when === "full" ? fullWhen(note.createdAt) : clock(note.createdAt)}{edited ? " · edited" : ""}</span>
        {showProject && note.projectId && <span className="flex min-w-0 items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-xs" style={{ background: labels.colorOf(note.projectId) }} />
          <span className="truncate">{labels.labProj(note.projectId)}{phase ? " · " + phase : ""}</span>
        </span>}
        {!showProject && showPhase && phase && <span className="truncate">· {phase}</span>}
        {log && <span className="shrink-0">· with {hm(log.minutes)} tracked</span>}
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {onShare && note.projectId && <Button variant="ghost" size="icon-sm" title="Share with the team (posts it to the project's comments)" onClick={() => onShare(note)}><Share2 /></Button>}
          <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => setEditing(note.body)}><Pencil /></Button>
          <Button variant="ghost" size="icon-sm" title="Delete" onClick={() => onDelete(note)}><Trash2 /></Button>
        </span>
      </div>
      {editing == null
        ? <p className="text-sm whitespace-pre-wrap break-words">{note.body}</p>
        : <div className="flex flex-col gap-2">
            <Textarea rows={3} value={editing} autoFocus onChange={(e) => setEditing(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); else if (e.key === "Escape") setEditing(null); }} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={!editing.trim()}>Save</Button>
            </div>
          </div>}
    </div>
  );
}

// Write a note — on a fixed project (project view) or pick one (optional) —
// and, when the project has phases, which phase it's about (so sharing it
// lands in that phase's comments).
const WHOLE = "whole";
export function NoteComposer({ onSave, groups, recents, projectId = undefined, phasesOf = () => [], placeholder = "Write a private note… (Ctrl + Enter to save)" }) {
  const [text, setText] = useState("");
  const [pick, setPick] = useState({ projectId: "", phaseId: null });
  const fixed = projectId !== undefined;
  const pid = fixed ? projectId : (pick.projectId || null);
  const phases = pid ? phasesOf(pid) : [];
  const phaseVal = pick.phaseId && phases.some((p) => p.id === pick.phaseId) ? pick.phaseId : WHOLE;
  const phaseItems = { [WHOLE]: "Whole project", ...Object.fromEntries(phases.map((p) => [p.id, p.name])) };
  const save = async () => {
    const t = text.trim(); if (!t) return;
    const ok = await onSave({ body: t, projectId: pid, phaseId: phaseVal === WHOLE ? null : phaseVal });
    if (ok) setText("");
  };
  return (
    <div className="flex flex-col gap-2">
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }} />
      <div className="flex flex-wrap items-center gap-2">
        {!fixed && <ProjectCombobox selP={pick.projectId} selPh={pick.phaseId || ""} onPick={(p) => setPick(p)} groups={groups} recents={recents} placeholder="Project (optional)…" className="w-64" />}
        {phases.length > 0 && (
          <Select value={phaseVal} onValueChange={(v) => setPick((x) => ({ ...x, phaseId: v === WHOLE ? null : v }))} items={phaseItems}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{Object.entries(phaseItems).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        )}
        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" /> Only you can see this</span>
        <Button className="ml-auto" onClick={save} disabled={!text.trim()}>Save note</Button>
      </div>
    </div>
  );
}

export default function Notes({ org, me, data: cadData, reload }) {
  const confirm = useConfirm();
  const data = useMemo(() => mapData(cadData), [cadData]);
  const H = useMemo(() => makeHandlers(org, reload, cadData), [org, cadData]); // eslint-disable-line
  const labels = makeLabels(data);
  const groups = projectsByClient(data.projects, data.clients);
  const recents = recentCombos(data, me.id);
  const todayISO = toISO(startOfDay(new Date()));
  const [query, setQuery] = useState("");
  const [proj, setProj] = useState("all");
  const [view, setView] = useState("project"); // "project" | "date"
  const phasesOf = (pid) => { const pr = labels.projById(pid); return (pr && pr.phases) || []; };

  const mine = data.notes.filter((n) => n.memberId === me.id);
  const projIds = [...new Set(mine.map((n) => n.projectId).filter(Boolean))].filter((id) => labels.projById(id));
  const q = query.trim().toLowerCase();
  const shown = mine.filter((n) => (proj === "all" || (proj === "none" ? !n.projectId : n.projectId === proj))
    && (!q || n.body.toLowerCase().includes(q) || (n.projectId && labels.labProj(n.projectId).toLowerCase().includes(q))));
  const byDay = [];
  shown.forEach((n) => { const h = dayHeading(n.createdAt, todayISO); const last = byDay[byDay.length - 1]; if (last && last.h === h) last.notes.push(n); else byDay.push({ h, notes: [n] }); });
  // By project: a card per project (most recently noted first, "No project"
  // last), split by phase — whole-project notes first, then phases in order.
  const byProject = [];
  shown.forEach((n) => { const k = n.projectId && labels.projById(n.projectId) ? n.projectId : ""; let g = byProject.find((x) => x.k === k); if (!g) byProject.push(g = { k, notes: [] }); g.notes.push(n); });
  byProject.sort((a, b) => (a.k === "" ? 1 : b.k === "" ? -1 : 0));
  const phaseSections = (g) => {
    const phases = g.k ? phasesOf(g.k) : [];
    const known = new Set(phases.map((p) => p.id));
    return [
      { key: WHOLE, name: phases.length ? "Whole project" : null, notes: g.notes.filter((n) => !n.phaseId || !known.has(n.phaseId)) },
      ...phases.map((p) => ({ key: p.id, name: p.name, notes: g.notes.filter((n) => n.phaseId === p.id) })),
    ].filter((x) => x.notes.length);
  };

  const filterItems = { all: "All projects", none: "No project", ...Object.fromEntries(projIds.map((id) => [id, labels.labProj(id)])) };
  const del = async (n) => { if (await confirm({ title: "Delete this note?", description: "It's gone for good — notes aren't backed up anywhere else.", confirmLabel: "Delete", destructive: true })) H.delNote(n.id); };
  const share = async (n) => { if (await shareNote(org, me, n)) reload(); };

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 lg:p-6">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Lock className="size-3.5" /> Your private notes — nobody else can see them, not even owners. Share one with the team to post it to its project's comments.</p>
        <NoteComposer groups={groups} recents={recents} phasesOf={phasesOf} onSave={({ body, projectId, phaseId }) => H.addNote({ memberId: me.id, body, projectId, phaseId })} />
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-64">
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…" />
          </InputGroup>
          <Select value={proj} onValueChange={setProj} items={filterItems}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{Object.entries(filterItems).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground">{shown.length} {shown.length === 1 ? "note" : "notes"}</span>
          <ToggleGroup variant="outline" spacing={0} value={[view]} onValueChange={(v) => { if (v[0]) setView(v[0]); }}>
            <ToggleGroupItem value="project">By project</ToggleGroupItem>
            <ToggleGroupItem value="date">By date</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {view === "project" ? byProject.map((g) => (
          <Card key={g.k || "none"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="size-3 shrink-0 rounded-xs" style={{ background: g.k ? labels.colorOf(g.k) : "#94a3b8" }} />
                {g.k ? labels.labProj(g.k) : "No project"}
              </CardTitle>
              <CardDescription>{g.notes.length} {g.notes.length === 1 ? "note" : "notes"} · last one {fullWhen(g.notes[0].createdAt)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {phaseSections(g).map((sec) => (
                <div key={sec.key} className="flex flex-col gap-2">
                  {sec.name && <div className="text-xs font-medium text-muted-foreground">{sec.name}</div>}
                  {sec.notes.map((n) => <NoteItem key={n.id} note={n} labels={labels} logs={data.timeLogs} when="full" showProject={false} showPhase={false} onEdit={H.editNote} onDelete={del} onShare={share} />)}
                </div>
              ))}
            </CardContent>
          </Card>
        )) : byDay.map((g) => (
          <div key={g.h} className="flex flex-col gap-2">
            <div className="text-sm font-medium">{g.h}</div>
            {g.notes.map((n) => <NoteItem key={n.id} note={n} labels={labels} logs={data.timeLogs} onEdit={H.editNote} onDelete={del} onShare={share} />)}
          </div>
        ))}
        {shown.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><NotebookPen /></EmptyMedia>
              <EmptyTitle>{mine.length ? "No notes match" : "No notes yet"}</EmptyTitle>
              <EmptyDescription>{mine.length ? "Try a different search or project." : "Write one above, or jot one in the tracker while the timer runs — they all land here, dated."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </ScrollArea>
  );
}
