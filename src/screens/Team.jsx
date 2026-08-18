import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { Field, Modal, Card, Empty } from "../ui.jsx";
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
import { FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { ScrollArea } from "@/components/ui/scroll-area";

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

  const unlimitedSeats = (org.seats || 0) >= 9999;
  const seatsUsed = members.filter(m => m.status !== "suspended").length + invites.length;
  const overSeats = !unlimitedSeats && seatsUsed >= (org.seats || 0);

  return (
    <ScrollArea className="h-full"><div className="p-4 flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-medium">People</h2>
          <p className="text-sm text-muted-foreground">{unlimitedSeats ? `${seatsUsed} team member${seatsUsed === 1 ? "" : "s"} · unlimited invites` : `${seatsUsed} of ${org.seats} seats used`} on the {org.plan && org.plan !== "trial" ? org.plan : "current"} plan.</p>
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

      <Card title="Team members">
        {members.length === 0 && <Empty title="No one here yet">Invite your team to get started.</Empty>}
        <div className="flex flex-col">
          {members.map((m, i) => {
            const role = ROLES[m.role] || ROLES.member;
            return (<div key={m.id} className="flex items-center gap-3 border-b py-2.5 text-sm last:border-b-0">
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
      </Card>

      {manage && invites.length > 0 && (
        <Card title="Pending invitations">
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
        </Card>
      )}

      {inviteOpen && <InviteModal org={org} onClose={() => setInviteOpen(false)} onSent={(email, altNote) => { setInviteOpen(false); toast.add({ title: altNote || ("Invitation sent to " + email), type: "success" }); loadInvites(); }} onSeatsFull={() => { setInviteOpen(false); setUpgradeOpen(true); }} />}
      {upgradeOpen && <Modal title="Upgrade to add more people" onClose={() => setUpgradeOpen(false)} footer={<><Button variant="ghost" onClick={() => setUpgradeOpen(false)}>Not now</Button><Button variant="secondary" onClick={() => { setUpgradeOpen(false); onNavigate && onNavigate("settings"); }}>See plans</Button></>}>
        <p className="text-sm text-muted-foreground">You've reached the team limit on your current plan{unlimitedSeats ? "" : ` (${org.seats} member${org.seats === 1 ? "" : "s"})`}. Upgrade to a larger plan to invite more people.</p>
      </Modal>}
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
  return (<Modal title="Invite someone" onClose={onClose}
    footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={send} disabled={busy}>{busy ? "Sending…" : "Send invitation"}</Button></>}>
    <FieldGroup>
      <Field label="Email address" error={err}><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@studio.com" aria-invalid={err ? true : undefined} autoFocus /></Field>
      <Field label="Access level" hint={ROLES[role]?.blurb}>
        <Select value={role} onValueChange={setRole} items={Object.fromEntries(ROLE_KEYS.filter(k => k !== "owner").map(k => [k, ROLES[k].label]))}>
          <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
          <SelectContent><SelectGroup>{ROLE_KEYS.filter(k => k !== "owner").map(k => <SelectItem key={k} value={k}>{ROLES[k].label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <p className="text-sm text-muted-foreground">They'll receive an email with a link to set up their account and join {org.name}.</p>
    </FieldGroup>
  </Modal>);
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

  return (<Modal wide title={`Manage — ${m.display_name || m.email}`} onClose={onClose}
    footer={<>{!isOwner && <Button variant="destructive" className="mr-auto" onClick={remove} disabled={busy}><Trash2 data-icon="inline-start" /> Remove from studio</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
    <FieldGroup>
      <FieldSet>
        <FieldLegend>Profile &amp; scheduling</FieldLegend>
        <FieldGroup>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Display name"><Input value={name} onChange={e => setName(e.target.value)} placeholder={m.email} /></Field>
            <Field label="Job title"><Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Designer" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Hours / day"><Input type="number" value={daily} onChange={e => setDaily(e.target.value)} /></Field>
            <Field label="Holiday (days/yr)"><Input type="number" value={allow} onChange={e => setAllow(e.target.value)} /></Field>
            <Field label="Rate (£/hr)" hint="Guides billing cost."><Input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="—" /></Field>
          </div>
          <Field label="Teams">
            <div className="flex flex-wrap items-center gap-1.5">{teams.map(t => <Button key={t} variant="secondary" size="xs" onClick={() => toggleTeam(t)}>{t} ✕</Button>)}{teams.length === 0 && <span className="text-sm text-muted-foreground">No teams yet.</span>}</div>
            <div className="flex gap-2"><Input value={newTeam} onChange={e => setNewTeam(e.target.value)} placeholder="Add to a team…" onKeyDown={e => { if (e.key === "Enter" && newTeam.trim()) { if (!teams.includes(newTeam.trim())) setTeams([...teams, newTeam.trim()]); setNewTeam(""); } }} /><Button variant="outline" onClick={() => { if (newTeam.trim() && !teams.includes(newTeam.trim())) { setTeams([...teams, newTeam.trim()]); setNewTeam(""); } }}>Add</Button></div>
          </Field>
        </FieldGroup>
      </FieldSet>

      {isOwner
        ? <p className="text-sm text-muted-foreground">This is the studio owner — role and permissions can't be changed here.</p>
        : <>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Role" hint={ROLES[role]?.blurb}>
              <Select value={role} onValueChange={setRole} items={Object.fromEntries(ROLE_KEYS.map(k => [k, ROLES[k].label]))}>
                <SelectTrigger className="w-full"><SelectValue/></SelectTrigger>
                <SelectContent><SelectGroup>{ROLE_KEYS.map(k => <SelectItem key={k} value={k}>{ROLES[k].label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field label="Status">
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
  </Modal>);
}
