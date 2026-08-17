import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { Card } from "../ui.jsx";
import { can } from "../lib/permissions.js";
import { PlanCard } from "./PlanCard.jsx";
import { ChevronDown } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Shown when the active studio has no active subscription. Owners/admins can subscribe here; others are told to ask an owner. */
export default function Paywall({ org, me, memberships, onPickOrg, onSignOut }) {
  const canPay = ["owner", "admin"].includes(me.role) || can(me, "org.admin");
  const [plans, setPlans] = useState(null);
  const [plansMsg, setPlansMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/plans").then(r => r.json()).then(b => {
      if (b.configured === false) { setPlans([]); setPlansMsg("Billing isn't fully set up yet."); }
      else if (b.error) { setPlans([]); setPlansMsg(b.error); }
      else setPlans(b.plans || []);
    }).catch(() => { setPlans([]); setPlansMsg("Couldn't load plans."); });
  }, []);

  const subscribe = async (priceId) => {
    setBusy(true);
    try {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, priceId, accessToken: token }) });
      const body = await res.json();
      if (body.url) { window.location.href = body.url; return; }
      toast.add({ title: body.error || "Couldn't start checkout.", type: "error" });
    } catch (_) { toast.add({ title: "Couldn't reach checkout.", type: "error" }); }
    setBusy(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="flex items-center gap-3 px-4 h-14 bg-card border-b">
        <img src="/huddle-icon.png" alt="Huddle" className="w-7 h-7 rounded-md" />
        <div className="font-medium">Huddle</div>
        {memberships && memberships.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>{org.name} <ChevronDown data-icon="inline-end" /></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48 max-w-64">
              {memberships.map(m => (
                <DropdownMenuItem key={m.org_id} onClick={() => onPickOrg(m.org_id)}>
                  <span className={`min-w-0 flex-1 truncate ${m.org_id === org.id ? "font-medium" : ""}`}>{m.organizations?.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : <span className="text-sm text-muted-foreground">{org.name}</span>}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onSignOut}>Sign out</Button>
      </div>

      <div className="max-w-2xl mx-auto py-10 px-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-medium">{org.status === "cancelled" || org.status === "suspended" ? "Your subscription has ended" : "Subscribe to start using Huddle"}</h1>
          <p className="text-sm text-muted-foreground mt-2">{canPay ? "Choose a plan to unlock scheduling, time tracking and billing for your studio." : "This studio doesn't have an active subscription yet."}</p>
        </div>

        {!canPay ? (
          <Card>
            <p className="text-center text-sm text-muted-foreground">Ask an owner or admin of <b>{org.name}</b> to subscribe, then you'll be able to sign in and use Huddle.</p>
          </Card>
        ) : (
          <Card>
            {plans === null && <div className="text-sm text-muted-foreground py-4 text-center">Loading plans…</div>}
            {plans !== null && plans.length === 0 && <Alert><AlertDescription>{plansMsg || "No plans found. Add products with recurring prices in Stripe."}</AlertDescription></Alert>}
            {plans !== null && plans.length > 0 && (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))" }}>
                {plans.map(p => <PlanCard key={p.priceId} plan={p} onChoose={subscribe} busy={busy} ctaLabel="Subscribe" />)}
              </div>
            )}
            <div className="mt-4 text-center">
              <a href="mailto:hello@thealloy.com?subject=Huddle%20sign-up%20help" className="text-xs text-muted-foreground hover:text-foreground underline">Trouble signing up or signing in? Get in touch</a>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
