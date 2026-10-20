// Comments: the team's thread on a project — everyone in the studio can read
// and add; you delete your own (schedule editors can delete any). Comments
// made on a booking belong to that booking, its project and its phase, so:
//   • on a booking (assignmentId): just that booking's comments;
//   • on a project (projectId only): the whole thread, grouped by phase
//     ("Whole project" for general ones), each comment from a booking tagged
//     with it (tagFor). Posting here picks the phase.
// Private notes are something else entirely — see Notes.jsx.
import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { MONTHS, pad, AVATAR_BG, initials } from "../studio/core.jsx";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FieldSet, FieldLegend } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

export const whenOf = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const nameOf = (m) => (m ? m.name || m.display_name || m.email || "—" : "Former member");
const GENERAL = "general";

export default function CommentsThread({ orgId, meId, projectId = null, assignmentId = null, phaseId = null, phases = [], canModerate = false, members, tagFor = null, onChanged }) {
  const [comments, setComments] = useState([]);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [postTo, setPostTo] = useState(GENERAL);
  const load = async () => {
    const q = sb.from("assignment_comments").select("*");
    const { data, error } = await (assignmentId ? q.eq("assignment_id", assignmentId) : q.eq("project_id", projectId)).order("created_at");
    if (!error) setComments(data || []);
    setReady(true);
  };
  useEffect(() => { load(); }, [assignmentId, projectId]); // eslint-disable-line
  const post = async () => {
    const body = draft.trim(); if (!body) return;
    const phase = assignmentId ? phaseId : (postTo === GENERAL ? null : postTo);
    const { error } = await sb.from("assignment_comments").insert({ org_id: orgId, project_id: projectId || null, assignment_id: assignmentId || null, phase_id: phase || null, membership_id: meId, body });
    if (error) { toast.add({ title: "Couldn't post the comment: " + error.message, type: "error" }); return; }
    setDraft(""); load(); onChanged && onChanged();
  };
  const remove = async (id) => {
    const { error } = await sb.from("assignment_comments").delete().eq("id", id);
    if (error) { toast.add({ title: "Couldn't delete the comment: " + error.message, type: "error" }); return; }
    load(); onChanged && onChanged();
  };

  const one = (c) => {
    const i = members.findIndex((m) => m.id === c.membership_id); const who = members[i]; const mine = c.membership_id === meId;
    const tag = !assignmentId && tagFor ? tagFor(c) : null;
    return (
      <div key={c.id} className="flex gap-2.5">
        <Avatar size="sm"><AvatarFallback className="text-white" style={{ background: AVATAR_BG[(i < 0 ? 0 : i) % AVATAR_BG.length] }}>{initials(nameOf(who))}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-xs">
            <span className="font-medium text-foreground">{nameOf(who)}{mine ? " (you)" : ""}</span>
            <span className="text-muted-foreground">{whenOf(c.created_at)}{tag ? " · " + tag : ""}</span>
            {(mine || canModerate) && <Button variant="ghost" size="icon-xs" className="ml-auto" title="Delete comment" onClick={() => remove(c.id)}><X /></Button>}
          </div>
          <p className="text-sm whitespace-pre-wrap break-words">{c.body}</p>
        </div>
      </div>
    );
  };

  // Project view: one group per phase that has comments, general ones first.
  const known = new Set(phases.map((p) => p.id));
  const groups = assignmentId ? null : [
    { key: GENERAL, name: "Whole project", items: comments.filter((c) => !c.phase_id || !known.has(c.phase_id)) },
    ...phases.map((p) => ({ key: p.id, name: p.name, items: comments.filter((c) => c.phase_id === p.id) })),
  ].filter((g) => g.items.length);
  const postItems = { [GENERAL]: "Whole project", ...Object.fromEntries(phases.map((p) => [p.id, p.name])) };

  return (
    <FieldSet>
      <FieldLegend variant="label">Comments</FieldLegend>
      <div className="flex flex-col gap-3">
        {ready && comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet — the whole team sees what you post here.</p>}
        {assignmentId ? comments.map(one) : groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-2.5 rounded-lg border p-3">
            <div className="text-xs font-medium text-muted-foreground">{g.name} · {g.items.length} {g.items.length === 1 ? "comment" : "comments"}</div>
            {g.items.map(one)}
          </div>
        ))}
        <Textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a comment for the team… (Ctrl + Enter to post)" onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) post(); }} />
        <div className="flex items-center justify-end gap-2">
          {!assignmentId && phases.length > 0 && (
            <Select value={postTo} onValueChange={setPostTo} items={postItems}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{Object.entries(postItems).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={post} disabled={!draft.trim()}>Post comment</Button>
        </div>
      </div>
    </FieldSet>
  );
}
