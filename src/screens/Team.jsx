import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AVATAR_BG, initials } from "../studio/core.jsx";
import { PERMISSIONS, PERMISSION_GROUPS, ROLES, ROLE_KEYS, effectivePermissions, isFromRole, can } from "../lib/permissions.js";
import { Plus, Mail, Trash2, Pencil, RefreshCw, Link as LinkIcon, TriangleAlert } from "lucide-react";
import { useConfirm } from "../components/confirm.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup, FieldSet, FieldLegend, Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

const NO_TEAM = "__none__";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

export default function Team({ org, me, members, reload, onNavigate }) {
  const confirm = useConfirm();
  const [invites, setInvites] = useState([]);
  const [editing, setEditing] = useState(null);   // membership being edited
  const [inviteOpen, setInviteOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const manage = can(me, "team.manage");

  const loadInvites = async () => {
    if (!manage) return;
    const { data } = await sb.from("invites").select("*").eq("org_id", org.id).is("accepted_at", null).order("created_at", { ascending: false });
    setInvites(data || []);
  };
  useEffect(() => { loadInvites(); }, [org.id, manage]); // eslint-disable-line

  // Keep the team list fresh when a member accepts an invite elsewhere: on focus, on a poll, and via realtime if enabled.
  useEffect(() => {
    const refresh = () => { loadInvites(); reload(); };
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const iv = setInterval(refresh, 25000);
    let ch;
    try {
      ch = sb.channel("team-" + org.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "memberships", filter: "org_id=eq." + org.id }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "invites", filter: "org_id=eq." + org.id }, () => loadInvites())
        .subscribe();
    } catch (_) {}
    return () => { window.removeEventListener("focus", onFocus); clearInterval(iv); if (ch) { try { sb.removeChannel(ch); } catch (_) {} } };
  }, [org.id]); // eslint-disable-line

  // Team boards: people grouped by memberships.teams, drag to move between
  // teams (Ctrl/⌘-drop adds a second team instead). A new team lives only in
  // local state until someone is dropped into it.
  const [dragging, setDragging] = useState(null);   // {id, from}
  const [overTeam, setOverTeam] = useState(null);
  const [newTeams, setNewTeams] = useState([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [optimTeams, setOptimTeams] = useState({}); // membership id -> teams, until the reload lands
  useEffect(() => { setOptimTeams({}); }, [members]);
  const teamsOf = (m) => optimTeams[m.id] ?? (Array.isArray(m.teams) ? m.teams : []);
  const teamNames = [...new Set([...members.flatMap(teamsOf), ...newTeams])].sort((a, b) => a.localeCompare(b));
  const addTeam = () => { const n = newTeamName.trim(); if (!n) return; setNewTeams(t => (t.includes(n) ? t : [...t, n])); setNewTeamName(""); };
  const moveToTeam = async (m, from, to) => {
    const cur = teamsOf(m);
    let next = from ? cur.filter(t => t !== from) : [...cur];
    if (to !== NO_TEAM && !next.includes(to)) next = [...next, to];
    if (next.length === cur.length && next.every(t => cur.includes(t))) return;
    setOptimTeams(o => ({ ...o, [m.id]: next }));
    const { error } = await sb.from("memberships").update({ teams: next.length ? next : null }).eq("id", m.id);
    if (error) { setOptimTeams(o => { const n = { ...o }; delete n[m.id]; return n; }); toast.add({ title: "Couldn't move " + (m.display_name || m.email) + ": " + error.message, type: "error" }); return; }
    reload();
  };

  const unlimitedSeats = (org.seats || 0) >= 9999;
  const seatsUsed = members.filter(m => m.status !== "suspended").length + invites.length;
  const overSeats = !unlimitedSeats && seatsUsed >= (org.seats || 0);

  return (
    <ScrollArea className="h-full"><div className="@container/main px-4 lg:px-6 py-4 md:py-6 flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-medium">People</h2>
          <p className="text-sm text-muted-foreground">{unlimitedSeats ? `${seatsUsed} team member${seatsUsed === 1 ? "" : "s"} · unlimited invites` : `${seatsUsed} of ${org.seats} seats used`} on the {org.plan && org.plan !== "trial" ? org.plan : "current"} plan.{manage ? " Drag people between teams — hold Ctrl to add them to another team as well." : ""}</p>
        </div>
        {manage && <Button variant="outline" size="icon" title="Refresh" className="ml-auto" onClick={() => { loadInvites(); reload(); }}><RefreshCw /></Button>}
        {manage && <Button onClick={() => overSeats ? setUpgradeOpen(true) : setInviteOpen(true)}><Plus data-icon="inline-start" /> Invite someone</Button>}
      </div>

      {overSeats && manage && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>All seats are in use</AlertTitle>
          <AlertDescription>Add more in Settings → Subscription to invite additional people.</AlertDescription>
        </Alert>
      )}

      {members.length === 0 && <Card><CardContent><Empty><EmptyHeader><EmptyTitle>No one here yet</EmptyTitle><EmptyDescription>Invite your team to get started.</EmptyDescription></EmptyHeader></Empty></CardContent></Card>}
      {members.length > 0 && <div className="grid gap-4 @3xl/main:grid-cols-2">
        {[...teamNames, NO_TEAM].map(t => {
          const list = members.filter(m => t === NO_TEAM ? teamsOf(m).length === 0 : teamsOf(m).includes(t));
          if (t === NO_TEAM && list.length === 0 && !dragging) return null;
          return (
          <Card key={t} className={overTeam === t ? "ring-2 ring-primary" : undefined}
            onDragOver={(e) => { if (!dragging || !manage) return; e.preventDefault(); e.dataTransfer.dropEffect = (e.ctrlKey || e.metaKey) && t !== NO_TEAM ? "copy" : "move"; if (overTeam !== t) setOverTeam(t); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverTeam(o => (o === t ? null : o)); }}
            onDrop={(e) => { e.preventDefault(); const d = dragging; setDragging(null); setOverTeam(null); if (!d || d.from === t) return; const m = members.find(x => x.id === d.id); if (m) moveToTeam(m, (e.ctrlKey || e.metaKey) && t !== NO_TEAM ? null : d.from, t); }}>
            <CardHeader>
              <CardTitle>{t === NO_TEAM ? "No team" : t}</CardTitle>
              <CardDescription>{list.length} {list.length === 1 ? "person" : "people"}</CardDescription>
            </CardHeader>
            <CardContent>
        {list.length === 0 && <p className="py-2 text-sm text-muted-foreground">Drag people here to add them to this team.</p>}
        <div className="flex flex-col">
          {list.map((m) => {
            const role = ROLES[m.role] || ROLES.member;
            const i = members.indexOf(m);
            return (<div key={m.id} className={`flex items-center gap-3 border-b py-2.5 text-sm last:border-b-0 ${manage ? "cursor-grab active:cursor-grabbing" : ""} ${dragging && dragging.id === m.id && dragging.from === t ? "opacity-50" : ""}`}
              draggable={manage} onDragStart={(e) => { e.dataTransfer.effectAllowed = "copyMove"; e.dataTransfer.setData("text/plain", m.id); setDragging({ id: m.id, from: t }); }} onDragEnd={() => { setDragging(null); setOverTeam(null); }}>
              <Avatar><AvatarFallback className="text-white" style={{background:AVATAR_BG[i%AVATAR_BG.length]}}>{initials(m.display_name || m.email)}</AvatarFallback></Avatar>
              <div className="min-w-0">
                <div className="font-medium truncate">{m.display_name || m.email || "Invited"} {m.user_id === me.user_id && <span className="text-muted-foreground font-normal">(you)</span>}</div>
                <div className="text-xs text-muted-foreground truncate">{m.email}{m.job_title ? " · " + m.job_title : ""}</div>
              </div>
              <div className="ml-auto flex items-center gap-2 shrink-0">
                {m.status === "suspended" && <Badge variant="destructive">Suspended</Badge>}
                <Badge variant="secondary">{role.label}</Badge>
                {manage && (
                  <Button variant="ghost" size="icon-sm" title="Manage member" onClick={() => setEditing(m)}><Pencil /></Button>
                )}
              </div>
            </div>);
          })}
        </div>
            </CardContent>
          </Card>);
        })}
        {manage && (
          <Card>
            <CardHeader>
              <CardTitle>New team</CardTitle>
              <CardDescription>Name it, then drag people in.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="e.g. Design" onKeyDown={e => { if (e.key === "Enter") addTeam(); }} />
                <Button variant="outline" onClick={addTeam} disabled={!newTeamName.trim()}><Plus data-icon="inline-start" /> Add team</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>}

      {manage && invites.length > 0 && (
        <Card><CardHeader><CardTitle>Pending invitations</CardTitle></CardHeader><CardContent>
          <div className="flex flex-col">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 border-b py-2.5 text-sm last:border-b-0">
                <Mail className="size-4 text-muted-foreground" />
                <div className="min-w-0"><div className="truncate">{inv.email}</div>
                  <div className="text-xs text-muted-foreground">{(ROLES[inv.role] || {}).label} · expires {String(inv.expires_at).slice(0, 10)}</div></div>
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" title="Copy invite link to share"
                    onClick={() => { const link = `${window.location.origin}/?invite=${inv.token}`; navigator.clipboard?.writeText(link); toast.add({ title: "Invite link copied — paste it to " + inv.email, type: "success" }); }}><LinkIcon /></Button>
                  <Button variant="ghost" size="icon-sm" title="Resend" disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const token = (await sb.auth.getSession()).data.session?.access_token;
                      await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, email: inv.email, role: inv.role, accessToken: token }) });
                      setBusy(false); toast.add({ title: "Invitation resent to " + inv.email, type: "success" }); loadInvites();
                    }}><RefreshCw /></Button>
                  <Button variant="ghost" size="icon-sm" title="Revoke"
                    onClick={async () => { if (await confirm({ title: "Revoke this invitation?", confirmLabel: "Revoke", destructive: true })) { await sb.from("invites").delete().eq("id", inv.id); loadInvites(); } }}><Trash2 /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {inviteOpen && <InviteModal org={org} onClose={() => setInviteOpen(false)} onSent={(email, altNote) => { setInviteOpen(false); toast.add({ title: altNote || ("Invitation sent to " + email), type: "success" }); loadInvites(); }} onSeatsFull={() => { setInviteOpen(false); setUpgradeOpen(true); }} />}
      {upgradeOpen && <Dialog open onOpenChange={(o) => { if (!o) (() => setUpgradeOpen(false))?.(); }}><DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>Upgrade to add more people</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">You've reached the team limit on your current plan{unlimitedSeats ? "" : ` (${org.seats} member${org.seats === 1 ? "" : "s"})`}. Upgrade to a larger plan to invite more people.</p>
      <DialogFooter>{<><Button variant="ghost" onClick={() => setUpgradeOpen(false)}>Not now</Button><Button variant="secondary" onClick={() => { setUpgradeOpen(false); onNavigate && onNavigate("settings"); }}>See plans</Button></>}</DialogFooter></DialogContent></Dialog>}
      {editing && <AccessModal m={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div></ScrollArea>
  );
}

export function InviteModal({ org, onClose, onSent, onSeatsFull }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const send = async () => {
    if (!email.trim()) { setErr("Enter an email address."); return; }
    setBusy(true); setErr("");
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, email: email.trim(), role, accessToken: token }) });
      const body = await res.json().catch(() => ({}));
      if (res.status === 402 && onSeatsFull) { onSeatsFull(); return; }
      if (!res.ok) throw new Error(body.error || "Could not send the invitation.");
      if (body.emailed === false && body.link) {
        try { await navigator.clipboard?.writeText(body.link); } catch (_) {}
        onSent(email.trim(), "We couldn't email it (" + (body.note || "email not configured") + ") — the invite link has been copied to your clipboard; paste it to them.");
      } else {
        onSent(email.trim());
      }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (<Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>Invite someone</DialogTitle></DialogHeader>
    <FieldGroup>
      <Field data-invalid={(err) ? true : undefined}><FieldLabel>Email address</FieldLabel><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@studio.com" aria-invalid={err ? true : undefined} autoFocus />{(err) ? <FieldError>{err}</FieldError> : null}</Field>
      <Field><FieldLabel>Access level</FieldLabel>
        <Select value={role} onValueChange={setRole} items={Object.fromEntries(ROLE_KEYS.filter(k => k !== "owner").map(k => [k, ROLES[k].label]))}>
          <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
          <SelectContent><SelectGroup>{ROLE_KEYS.filter(k => k !== "owner").map(k => <SelectItem key={k} value={k}>{ROLES[k].label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      <FieldDescription>{ROLES[role]?.blurb}</FieldDescription></Field>
      <p className="text-sm text-muted-foreground">They'll receive an email with a link to set up their account and join {org.name}.</p>
    </FieldGroup>
  <DialogFooter>{<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={send} disabled={busy}>{busy ? "Sending…" : "Send invitation"}</Button></>}</DialogFooter></DialogContent></Dialog>);
}

function AccessModal({ m, onClose, onSaved }) {
  const confirm = useConfirm();
  const isOwner = m.role === "owner";
  const [role, setRole] = useState(m.role);
  const [extra, setExtra] = useState(Array.isArray(m.permissions) ? m.permissions : []);
  const [status, setStatus] = useState(m.status);
  const [name, setName] = useState(m.display_name || "");
  const [jobTitle, setJobTitle] = useState(m.job_title || "");
  const [daily, setDaily] = useState(m.daily_hours ?? 8);
  const [allow, setAllow] = useState(m.holiday_allowance ?? 30);
  const [rate, setRate] = useState(m.hourly_rate ?? "");
  const [teams, setTeams] = useState(Array.isArray(m.teams) ? m.teams : []);
  const [newTeam, setNewTeam] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = { ...m, role, permissions: extra };
  const eff = effectivePermissions(draft);
  const toggle = (key) => setExtra(x => x.includes(key) ? x.filter(k => k !== key) : [...x, key]);
  const toggleTeam = (t) => setTeams(s => s.includes(t) ? s.filter(x => x !== t) : [...s, t]);

  const save = async () => {
    setBusy(true);
    const patch = {
      display_name: name.trim() || null, job_title: jobTitle.trim() || null,
      daily_hours: Number(daily) || 8, holiday_allowance: Number(allow) || 0,
      hourly_rate: rate === "" ? null : Number(rate), teams: teams.length ? teams : null,
    };
    if (!isOwner) { patch.role = role; patch.permissions = extra; patch.status = status; }
    await sb.from("memberships").update(patch).eq("id", m.id);
    setBusy(false); onSaved();
  };
  const remove = async () => {
    if (!(await confirm({ title: `Remove ${m.display_name || m.email} from this studio?`, description: "Their bookings and logged time stay, but they lose access.", confirmLabel: "Remove", destructive: true }))) return;
    setBusy(true);
    await sb.from("memberships").delete().eq("id", m.id);
    setBusy(false); onSaved();
  };

  return (<Dialog open onOpenChange={(o) => { if (!o) (onClose)?.(); }}><DialogContent className="sm:max-w-3xl max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>{`Manage — ${m.display_name || m.email}`}</DialogTitle></DialogHeader>
    <FieldGroup>
      <FieldSet>
        <FieldLegend>Profile &amp; scheduling</FieldLegend>
        <FieldGroup>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field><FieldLabel>Display name</FieldLabel><Input value={name} onChange={e => setName(e.target.value)} placeholder={m.email} /></Field>
            <Field><FieldLabel>Job title</FieldLabel><Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Designer" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field><FieldLabel>Hours / day</FieldLabel><Input type="number" value={daily} onChange={e => setDaily(e.target.value)} /></Field>
            <Field><FieldLabel>Holiday (days/yr)</FieldLabel><Input type="number" value={allow} onChange={e => setAllow(e.target.value)} /></Field>
            <Field><FieldLabel>Rate (£/hr)</FieldLabel><Input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="—" /><FieldDescription>Guides billing cost.</FieldDescription></Field>
          </div>
          <Field><FieldLabel>Teams</FieldLabel>
            <div className="flex flex-wrap items-center gap-1.5">{teams.map(t => <Button key={t} variant="secondary" size="xs" onClick={() => toggleTeam(t)}>{t} ✕</Button>)}{teams.length === 0 && <span className="text-sm text-muted-foreground">No teams yet.</span>}</div>
            <div className="flex gap-2"><Input value={newTeam} onChange={e => setNewTeam(e.target.value)} placeholder="Add to a team…" onKeyDown={e => { if (e.key === "Enter" && newTeam.trim()) { if (!teams.includes(newTeam.trim())) setTeams([...teams, newTeam.trim()]); setNewTeam(""); } }} /><Button variant="outline" onClick={() => { if (newTeam.trim() && !teams.includes(newTeam.trim())) { setTeams([...teams, newTeam.trim()]); setNewTeam(""); } }}>Add</Button></div>
          </Field>
        </FieldGroup>
      </FieldSet>

      {isOwner
        ? <p className="text-sm text-muted-foreground">This is the studio owner — role and permissions can't be changed here.</p>
        : <>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field><FieldLabel>Role</FieldLabel>
              <Select value={role} onValueChange={setRole} items={Object.fromEntries(ROLE_KEYS.map(k => [k, ROLES[k].label]))}>
                <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
                <SelectContent><SelectGroup>{ROLE_KEYS.map(k => <SelectItem key={k} value={k}>{ROLES[k].label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            <FieldDescription>{ROLES[role]?.blurb}</FieldDescription></Field>
            <Field><FieldLabel>Status</FieldLabel>
              <Select value={status} onValueChange={setStatus} items={{active:"Active",suspended:"Suspended (cannot sign in)"}}>
                <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended (cannot sign in)</SelectItem></SelectGroup></SelectContent>
              </Select>
            </Field>
          </div>
          <FieldSet>
            <FieldLegend>What they can do</FieldLegend>
            <FieldGroup>
              {PERMISSION_GROUPS.map(g => (
                <FieldSet key={g}>
                  <FieldLegend variant="label">{g}</FieldLegend>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {PERMISSIONS.filter(p => p.group === g).map(p => {
                      const locked = isFromRole(draft, p.key);
                      const on = eff.includes(p.key);
                      return (<label key={p.key} className={`flex items-center gap-2 text-sm ${locked ? "text-muted-foreground" : ""}`}>
                        <Checkbox checked={on} disabled={locked} onCheckedChange={() => toggle(p.key)} />
                        {p.label}{locked && <span className="text-xs text-muted-foreground">(from role)</span>}
                      </label>);
                    })}
                  </div>
                </FieldSet>
              ))}
            </FieldGroup>
          </FieldSet>
          <p className="text-sm text-muted-foreground">Greyed ticks come with the role. Tick extras to grant more on top. Use the copy-link on a pending invite to share sign-in details.</p>
        </>}
    </FieldGroup>
  <DialogFooter>{<>{!isOwner && <Button variant="destructive" className="mr-auto" onClick={remove} disabled={busy}><Trash2 data-icon="inline-start" /> Remove from studio</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}</DialogFooter></DialogContent></Dialog>);
}
