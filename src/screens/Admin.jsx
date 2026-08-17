import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { Card, Pill, Modal, Field, Empty, Spinner } from "../ui.jsx";
import { Search, Building2, Users, CreditCard } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PLANS = ["trial", "starter", "studio", "enterprise"];
const STATUSES = ["active", "past_due", "suspended", "cancelled"];
const STATUS_COLOR = { active: "#27ae60", past_due: "#f59e0b", suspended: "#eb5757", cancelled: "#94a3b8" };
const money = (n) => "£" + (Number(n) || 0).toLocaleString();
const PLAN_PRICE = { trial: 0, starter: 29, studio: 79, enterprise: 249 };

/** The vendor's own console — only visible to profiles.platform_admin = true. */
export default function Admin() {
  const [orgs, setOrgs] = useState(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");

  const load = async () => {
    setErr("");
    const { data, error } = await sb.from("organizations").select("*").order("created_at", { ascending: false });
    if (error) { setErr(error.message); setOrgs([]); return; }
    const withCounts = await Promise.all((data || []).map(async o => {
      const { count } = await sb.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", o.id);
      return { ...o, member_count: count || 0 };
    }));
    setOrgs(withCounts);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  if (orgs === null) return <Spinner label="Loading subscribers…" />;

  const shown = orgs.filter(o => !q || (o.name || "").toLowerCase().includes(q.toLowerCase()));
  const mrr = orgs.filter(o => o.status === "active" && o.plan !== "trial").reduce((s, o) => s + (PLAN_PRICE[o.plan] || 0), 0);
  const trials = orgs.filter(o => o.plan === "trial").length;
  const activeCount = orgs.filter(o => o.status === "active").length;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div>
        <h2 className="text-base font-bold text-foreground">Subscribers</h2>
        <p className="text-xs text-muted-foreground">Every studio using the product. Only you can see this.</p>
      </div>
      {err && <div className="text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-3 py-2">{err}</div>}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))" }}>
        <Stat icon={<Building2 size={14} />} label="Studios" value={orgs.length} />
        <Stat icon={<Users size={14} />} label="Active" value={activeCount} />
        <Stat icon={<CreditCard size={14} />} label="On trial" value={trials} />
        <Stat icon={<CreditCard size={14} />} label="Monthly revenue" value={money(mrr)} tone="#27ae60" />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 border border-border rounded-lg px-2.5 h-9 bg-card flex-1 max-w-sm">
          <Search size={14} className="text-muted-foreground/70" />
          <input className="text-sm outline-none flex-1" placeholder="Search studios…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Button variant="outline" onClick={load}>Refresh</Button>
      </div>

      <Card title={`Studios (${shown.length})`}>
        {shown.length === 0 && <Empty title="No studios yet">Subscribers appear here as they sign up.</Empty>}
        <div className="divide-y divide-border/60">
          {shown.map(o => (
            <div key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground truncate">{o.name}</div>
                <div className="text-xs text-muted-foreground/70">{o.member_count} member{o.member_count === 1 ? "" : "s"} · {o.seats} seats · joined {String(o.created_at).slice(0, 10)}</div>
              </div>
              <Pill color="#2f80ed">{o.plan}</Pill>
              <Pill color={STATUS_COLOR[o.status] || "#94a3b8"}>{o.status}</Pill>
              <Button variant="outline" onClick={() => setEditing(o)}>Manage</Button>
            </div>
          ))}
        </div>
      </Card>

      {editing && <OrgModal o={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function Stat({ icon, label, value, tone }) {
  return (<div className="bg-card rounded-xl border border-border px-4 py-3">
    <div className="text-xs text-muted-foreground/70 flex items-center gap-1.5">{icon}{label}</div>
    <div className="text-lg font-bold" style={{ color: tone || "#1f2d4e" }}>{value}</div>
  </div>);
}

function OrgModal({ o, onClose, onSaved }) {
  const [plan, setPlan] = useState(o.plan);
  const [status, setStatus] = useState(o.status);
  const [seats, setSeats] = useState(o.seats);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await sb.from("organizations").update({ plan, status, seats: Number(seats) || 1 }).eq("id", o.id);
    setBusy(false); onSaved();
  };
  return (<Modal title={o.name} onClose={onClose}
    footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Plan"><NativeSelect className="w-full" value={plan} onChange={e => setPlan(e.target.value)}>{PLANS.map(p => <option key={p} value={p}>{p}</option>)}</NativeSelect></Field>
      <Field label="Seats"><Input type="number" min="1" value={seats} onChange={e => setSeats(e.target.value)} /></Field>
    </div>
    <Field label="Status" hint="Suspending blocks the studio's team from using the app.">
      <NativeSelect className="w-full" value={status} onChange={e => setStatus(e.target.value)}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</NativeSelect>
    </Field>
    <div className="text-xs text-muted-foreground/70 space-y-1 mt-2">
      <div>Organization ID: <code className="text-muted-foreground">{o.id}</code></div>
      {o.stripe_customer_id && <div>Stripe customer: <code className="text-muted-foreground">{o.stripe_customer_id}</code></div>}
      <div>Trial ends: {o.trial_ends_at ? String(o.trial_ends_at).slice(0, 10) : "—"}</div>
    </div>
  </Modal>);
}
