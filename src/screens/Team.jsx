import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { Btn, Field, inputCls, Modal, Avatar, Pill, Card, Empty } from "../ui.jsx";
import { PERMISSIONS, PERMISSION_GROUPS, ROLES, ROLE_KEYS, effectivePermissions, isFromRole, can } from "../lib/permissions.js";
import { Plus, Mail, Trash2, Shield, RefreshCw } from "lucide-react";

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
                {manage && m.role !== "owner" && (
                  <button className="text-slate-400 hover:text-blue-600" title="Change access" onClick={() => setEditing(m)}><Shield size={15} /></button>
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
  const [role, setRole] = useState(m.role);
  const [extra, setExtra] = useState(Array.isArray(m.permissions) ? m.permissions : []);
  const [status, setStatus] = useState(m.status);
  const [busy, setBusy] = useState(false);
  const draft = { ...m, role, permissions: extra };
  const eff = effectivePermissions(draft);

  const toggle = (key) => setExtra(x => x.includes(key) ? x.filter(k => k !== key) : [...x, key]);

  const save = async () => {
    setBusy(true);
    await sb.from("memberships").update({ role, permissions: extra, status }).eq("id", m.id);
    setBusy(false); onSaved();
  };

  return (<Modal wide title={`Access — ${m.display_name || m.email}`} onClose={onClose}
    footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save access"}</Btn></>}>
    <div className="grid sm:grid-cols-2 gap-3 mb-4">
      <Field label="Role" hint={ROLES[role]?.blurb}>
        <select className={inputCls} value={role} onChange={e => setRole(e.target.value)}>
          {ROLE_KEYS.map(k => <option key={k} value={k}>{ROLES[k].label}</option>)}
        </select>
      </Field>
      <Field label="Status">
        <select className={inputCls} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="active">Active</option><option value="suspended">Suspended (cannot sign in to this studio)</option>
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
    <p className="text-xs text-slate-400 mt-3">Ticks that are greyed out come with the role itself. Tick extras to grant more on top.</p>
  </Modal>);
}
