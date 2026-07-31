import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, Field, inputCls, Modal, Avatar, Pill, Card, Empty } from "../ui.jsx";
import { PERMISSIONS, PERMISSION_GROUPS, ROLES, ROLE_KEYS, effectivePermissions, isFromRole, can } from "../lib/permissions.js";
import { Plus, Mail, Trash2, Shield, RefreshCw, Link as LinkIcon } from "lucide-react";

export default function Team({ org, me, members, reload }) {
  const [invites, setInvites] = useState([]);
  const [editing, setEditing] = useState(null);   // membership being edited
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const manage = can(me, "team.manage");

  const loadInvites = async () => {
    if (!manage) return;
    const { data } = await sb.from("invites").select("*").eq("org_id", org.id).is("accepted_at", null).order("created_at", { ascending: false });
    setInvites(data || []);
  };
  useEffect(() => { loadInvites(); }, [org.id, manage]); // eslint-disable-line

  const seatsUsed = members.filter(m => m.status !== "suspended").length + invites.length;
  const overSeats = seatsUsed >= (org.seats || 0);

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-800">People</h2>
          <p className="text-xs text-slate-500">{seatsUsed} of {org.seats} seats used on the {org.plan} plan.</p>
        </div>
        {manage && <Btn className="ml-auto" onClick={() => setInviteOpen(true)} disabled={overSeats}><Plus size={14} /> Invite someone</Btn>}
      </div>
      {overSeats && manage && <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
        You've used all your seats. Add more in Settings → Subscription to invite additional people.
      </div>}
      {note && <div className="text-xs bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2">{note}</div>}

      <Card title="Team members">
        {members.length === 0 && <Empty title="No one here yet">Invite your team to get started.</Empty>}
        <div className="divide-y divide-slate-100">
          {members.map((m, i) => {
            const role = ROLES[m.role] || ROLES.member;
            return (<div key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
              <Avatar name={m.display_name || m.email} i={i} />
              <div className="min-w-0">
                <div className="font-medium text-slate-800 truncate">{m.display_name || m.email || "Invited"} {m.user_id === me.user_id && <span className="text-slate-400 font-normal">(you)</span>}</div>
                <div className="text-xs text-slate-400 truncate">{m.email}{m.job_title ? " · " + m.job_title : ""}</div>
              </div>
              <div className="ml-auto flex items-center gap-2 shrink-0">
                {m.status === "suspended" && <Pill color="#eb5757">Suspended</Pill>}
                <Pill color={m.role === "owner" ? "#9b51e0" : "#2f80ed"}>{role.label}</Pill>
                {manage && (
                  <button className="text-slate-400 hover:text-blue-600" title="Manage member" onClick={() => setEditing(m)}><Shield size={15} /></button>
                )}
              </div>
            </div>);
          })}
        </div>
      </Card>

      {manage && invites.length > 0 && (
        <Card title="Pending invitations">
          <div className="divide-y divide-slate-100">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Mail size={15} className="text-slate-300" />
                <div className="min-w-0"><div className="text-slate-700 truncate">{inv.email}</div>
                  <div className="text-xs text-slate-400">{(ROLES[inv.role] || {}).label} · expires {String(inv.expires_at).slice(0, 10)}</div></div>
                <div className="ml-auto flex items-center gap-2">
                  <button title="Copy invite link to share" className="text-slate-400 hover:text-blue-600"
                    onClick={() => { const link = `${window.location.origin}/?invite=${inv.token}`; navigator.clipboard?.writeText(link); setNote("Invite link copied — paste it to " + inv.email); }}><LinkIcon size={14} /></button>
                  <button title="Resend" className="text-slate-400 hover:text-blue-600" disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const token = (await sb.auth.getSession()).data.session?.access_token;
                      await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, email: inv.email, role: inv.role, accessToken: token }) });
                      setBusy(false); setNote("Invitation resent to " + inv.email); loadInvites();
                    }}><RefreshCw size={14} /></button>
                  <button title="Revoke" className="text-slate-400 hover:text-red-500"
                    onClick={async () => { if (confirm("Revoke this invitation?")) { await sb.from("invites").delete().eq("id", inv.id); loadInvites(); } }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {inviteOpen && <InviteModal org={org} onClose={() => setInviteOpen(false)} onSent={(email) => { setInviteOpen(false); setNote("Invitation sent to " + email); loadInvites(); }} />}
      {editing && <AccessModal m={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function InviteModal({ org, onClose, onSent }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const send = async () => {
    if (!email.trim()) { setErr("Enter an email address."); return; }
    setBusy(true); setErr("");
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, email: email.trim(), role, accessToken: token }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not send the invitation.");
      onSent(email.trim());
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (<Modal title="Invite someone" onClose={onClose}
    footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={send} disabled={busy}>{busy ? "Sending…" : "Send invitation"}</Btn></>}>
    <Field label="Email address"><input className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@studio.com" autoFocus /></Field>
    <Field label="Access level" hint={ROLES[role]?.blurb}>
      <select className={inputCls} value={role} onChange={e => setRole(e.target.value)}>
        {ROLE_KEYS.filter(k => k !== "owner").map(k => <option key={k} value={k}>{ROLES[k].label}</option>)}
      </select>
    </Field>
    {err && <div className="text-xs text-red-600">{err}</div>}
    <p className="text-xs text-slate-400 mt-2">They'll receive an email with a link to set up their account and join {org.name}.</p>
  </Modal>);
}

function AccessModal({ m, onClose, onSaved }) {
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
    if (!confirm(`Remove ${m.display_name || m.email} from this studio? Their bookings and logged time stay, but they lose access.`)) return;
    setBusy(true);
    await sb.from("memberships").delete().eq("id", m.id);
    setBusy(false); onSaved();
  };

  return (<Modal wide title={`Manage — ${m.display_name || m.email}`} onClose={onClose}
    footer={<>{!isOwner && <Btn variant="danger" className="mr-auto" onClick={remove} disabled={busy}><Trash2 size={14} /> Remove from studio</Btn>}<Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn></>}>
    <div className="text-xs font-semibold text-slate-500 mb-2">Profile &amp; scheduling</div>
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="Display name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder={m.email} /></Field>
      <Field label="Job title"><input className={inputCls} value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Designer" /></Field>
    </div>
    <div className="grid grid-cols-3 gap-3">
      <Field label="Hours / day"><input type="number" className={inputCls} value={daily} onChange={e => setDaily(e.target.value)} /></Field>
      <Field label="Holiday (days/yr)"><input type="number" className={inputCls} value={allow} onChange={e => setAllow(e.target.value)} /></Field>
      <Field label="Rate (£/hr)" hint="Guides billing cost."><input type="number" className={inputCls} value={rate} onChange={e => setRate(e.target.value)} placeholder="—" /></Field>
    </div>
    <Field label="Teams">
      <div className="flex flex-wrap gap-1.5 mb-2">{teams.map(t => <button key={t} onClick={() => toggleTeam(t)} className="text-xs px-2 py-1 rounded-full text-white" style={{ background: "#1f2d4e" }}>{t} ✕</button>)}{teams.length === 0 && <span className="text-xs text-slate-400">No teams yet.</span>}</div>
      <div className="flex gap-2"><input className={inputCls} value={newTeam} onChange={e => setNewTeam(e.target.value)} placeholder="Add to a team…" onKeyDown={e => { if (e.key === "Enter" && newTeam.trim()) { if (!teams.includes(newTeam.trim())) setTeams([...teams, newTeam.trim()]); setNewTeam(""); } }} /><Btn variant="outline" onClick={() => { if (newTeam.trim() && !teams.includes(newTeam.trim())) { setTeams([...teams, newTeam.trim()]); setNewTeam(""); } }}>Add</Btn></div>
    </Field>

    {isOwner
      ? <p className="text-xs text-slate-400 mt-2">This is the studio owner — role and permissions can't be changed here.</p>
      : <>
        <div className="grid sm:grid-cols-2 gap-3 mt-4 mb-2 pt-4 border-t border-slate-100">
          <Field label="Role" hint={ROLES[role]?.blurb}>
            <select className={inputCls} value={role} onChange={e => setRole(e.target.value)}>{ROLE_KEYS.map(k => <option key={k} value={k}>{ROLES[k].label}</option>)}</select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="active">Active</option><option value="suspended">Suspended (cannot sign in)</option>
            </select>
          </Field>
        </div>
        <div className="text-xs font-semibold text-slate-500 mb-2">What they can do</div>
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
          {PERMISSION_GROUPS.map(g => (
            <div key={g} className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">{g}</div>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {PERMISSIONS.filter(p => p.group === g).map(p => {
                  const locked = isFromRole(draft, p.key);
                  const on = eff.includes(p.key);
                  return (<label key={p.key} className={`flex items-center gap-2 text-sm ${locked ? "text-slate-400" : "text-slate-700 cursor-pointer"}`}>
                    <input type="checkbox" className="w-3.5 h-3.5" checked={on} disabled={locked} onChange={() => toggle(p.key)} />
                    {p.label}{locked && <span className="text-[10px] text-slate-300">(from role)</span>}
                  </label>);
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">Greyed ticks come with the role. Tick extras to grant more on top. Use the copy-link on a pending invite to share sign-in details.</p>
      </>}
  </Modal>);
}
