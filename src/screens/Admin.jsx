import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { Card, Modal, Field, Empty, Spinner } from "../ui.jsx";
import { Search, Building2, Users, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PLANS = ["trial", "starter", "studio", "enterprise"];
const STATUSES = ["active", "past_due", "suspended", "cancelled"];
const STATUS_VARIANT = { active: "secondary", past_due: "destructive", suspended: "destructive", cancelled: "outline" };
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
    <div className="p-4 flex flex-col gap-4 overflow-y-auto h-full">
      <div>
        <h2 className="text-base font-medium">Subscribers</h2>
        <p className="text-xs text-muted-foreground">Every studio using the product. Only you can see this.</p>
      </div>
      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))" }}>
        <Stat icon={<Building2 size={14} />} label="Studios" value={orgs.length} />
        <Stat icon={<Users size={14} />} label="Active" value={activeCount} />
        <Stat icon={<CreditCard size={14} />} label="On trial" value={trials} />
        <Stat icon={<CreditCard size={14} />} label="Monthly revenue" value={money(mrr)} />
      </div>

      <div className="flex items-center gap-2">
        <InputGroup className="flex-1 max-w-sm">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput placeholder="Search studios…" value={q} onChange={e => setQ(e.target.value)} />
        </InputGroup>
        <Button variant="outline" onClick={load}>Refresh</Button>
      </div>

      <Card title={`Studios (${shown.length})`}>
        {shown.length === 0 && <Empty title="No studios yet">Subscribers appear here as they sign up.</Empty>}
        <div className="flex flex-col">
          {shown.map(o => (
            <div key={o.id} className="flex items-center gap-3 border-b py-2.5 text-sm last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{o.name}</div>
                <div className="text-xs text-muted-foreground">{o.member_count} member{o.member_count === 1 ? "" : "s"} · {o.seats} seats · joined {String(o.created_at).slice(0, 10)}</div>
              </div>
              <Badge variant="secondary">{o.plan}</Badge>
              <Badge variant={STATUS_VARIANT[o.status] || "outline"}>{o.status}</Badge>
              <Button variant="outline" size="sm" onClick={() => setEditing(o)}>Manage</Button>
            </div>
          ))}
        </div>
      </Card>

      {editing && <OrgModal o={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (<Card>
    <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
    <div className="text-lg font-semibold text-foreground">{value}</div>
  </Card>);
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
    <FieldGroup>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plan">
          <Select value={plan} onValueChange={setPlan} items={Object.fromEntries(PLANS.map(p => [p, p]))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{PLANS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field label="Seats"><Input type="number" min="1" value={seats} onChange={e => setSeats(e.target.value)} /></Field>
      </div>
      <Field label="Status" hint="Suspending blocks the studio's team from using the app.">
        <Select value={status} onValueChange={setStatus} items={Object.fromEntries(STATUSES.map(s => [s, s]))}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <div className="text-xs text-muted-foreground flex flex-col gap-1">
        <div>Organization ID: <code className="text-foreground">{o.id}</code></div>
        {o.stripe_customer_id && <div>Stripe customer: <code className="text-foreground">{o.stripe_customer_id}</code></div>}
        <div>Trial ends: {o.trial_ends_at ? String(o.trial_ends_at).slice(0, 10) : "—"}</div>
      </div>
    </FieldGroup>
  </Modal>);
}
