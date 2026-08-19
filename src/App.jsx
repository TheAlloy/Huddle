import React, { useState, useEffect, useCallback, useRef } from "react";
import { sb, CONFIGURED, DEMO } from "./lib/supabase.js";
import DemoSwitcher from "./lib/DemoSwitcher.jsx";
import { loadOrgData, memberName } from "./lib/api.js";
import { can } from "./lib/permissions.js";
import Auth from "./screens/Auth.jsx";
import Onboarding from "./screens/Onboarding.jsx";
import FeedbackModal from "./screens/Feedback.jsx";
import Paywall from "./screens/Paywall.jsx";
import ResetPassword from "./screens/ResetPassword.jsx";
import Team from "./screens/Team.jsx";
import Settings from "./screens/Settings.jsx";
import Admin from "./screens/Admin.jsx";
import { TeamLite, NoAccess } from "./screens/Workspace.jsx";
import Schedule from "./screens/Schedule.jsx";
import Summary from "./screens/Summary.jsx";
import Tasks from "./screens/Tasks.jsx";
import Projects from "./screens/Projects.jsx";
import Tracker from "./screens/Tracker.jsx";
import Billing from "./screens/Billing.jsx";
import { fmtClock, initials } from "./studio/core.jsx";
import { useRunningTimer, TimerOverrunGuard } from "./screens/tracker/shared.jsx";
import { makeTerms } from "./lib/terms.js";
import { CalendarDays, Table2, LayoutGrid, Landmark, Users, Settings as Cog, Clock, FolderKanban, Shield, Gift } from "lucide-react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const PRODUCT = "Huddle";
const planLabel = (p) => !p || p === "trial" ? "Trial" : p.charAt(0).toUpperCase() + p.slice(1);

export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState(null);
  const [orgId, setOrgId] = useState(() => localStorage.getItem("cadence_org") || null);
  const [org, setOrg] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("schedule");
  const [peopleFilter, setPeopleFilter] = useState("all");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [err, setErr] = useState("");
  const [pendingInvite, setPendingInvite] = useState(() => new URLSearchParams(window.location.search).get("invite"));
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteErr, setInviteErr] = useState("");
  const [recovery, setRecovery] = useState(() => /type=recovery/.test(window.location.hash));

  /* session */
  useEffect(() => {
    if (!CONFIGURED) { setSession(null); return; }
    let done = false;
    sb.auth.getSession().then(({ data }) => { done = true; setSession(data.session || null); }).catch(() => { done = true; setSession(null); });
    // Safety net: if a corrupted token makes getSession hang, fall back to the sign-in screen.
    const t = setTimeout(() => { if (!done) setSession(s => (s === undefined ? null : s)); }, 8000);
    const { data: sub } = sb.auth.onAuthStateChange((e, s) => { if (e === "PASSWORD_RECOVERY") setRecovery(true); setSession(s || null); });
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  /* profile + memberships */
  const loadMe = useCallback(async () => {
    if (!session) return;
    const [{ data: p }, { data: ms }] = await Promise.all([
      sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
      sb.from("memberships").select("*, organizations(*)").eq("user_id", session.user.id).eq("status", "active"),
    ]);
    setProfile(p || { id: session.user.id, email: session.user.email });
    setMemberships(ms || []);
  }, [session]);
  useEffect(() => { loadMe(); }, [loadMe]);

  /* accept an invitation once signed in — joins the existing team, skips onboarding */
  useEffect(() => {
    if (!session || !pendingInvite) return;
    let alive = true;
    (async () => {
      setInviteBusy(true); setInviteErr("");
      const { data, error } = await sb.rpc("accept_invite", { invite_token: pendingInvite });
      if (!alive) return;
      window.history.replaceState({}, "", window.location.pathname);
      if (!error && data) {
        setOrgId(data); localStorage.setItem("cadence_org", data);
        setPendingInvite(null);
        // Give the new member their real name (from sign-up) instead of showing an email.
        const fullName = session.user.user_metadata?.full_name;
        if (fullName && fullName.trim()) {
          try { await sb.from("memberships").update({ display_name: fullName.trim() }).eq("org_id", data).eq("user_id", session.user.id); } catch (_) {}
        }
        await loadMe();
      } else {
        setInviteErr(error?.message || "This invitation link is invalid or has already been used. You can sign in normally instead.");
        setPendingInvite(null);
      }
      setInviteBusy(false);
    })();
    return () => { alive = false; };
  }, [session, pendingInvite, loadMe]);

  /* pick an org */
  const active = (memberships || []).find(m => m.org_id === orgId) || (memberships || [])[0] || null;
  useEffect(() => { if (active && active.org_id !== orgId) { setOrgId(active.org_id); localStorage.setItem("cadence_org", active.org_id); } }, [active, orgId]);

  /* org data */
  const reload = useCallback(async () => {
    if (!active) return;
    setErr("");
    try {
      setOrg(active.organizations);
      setData(await loadOrgData(active.org_id));
    } catch (e) { setErr(e.message || "Could not load your studio's data."); }
  }, [active]);
  useEffect(() => { reload(); }, [reload]);

  // Mirror admin-controlled desktop warning prefs to localStorage so the desktop app can read them.
  useEffect(() => {
    const dw = org?.settings?.desktopWarnings || {};
    try {
      localStorage.setItem("huddle_warn_close", dw.closeWarn === false ? "0" : "1");
      localStorage.setItem("huddle_warn_minimize", dw.minimizeWarn === false ? "0" : "1");
    } catch (_) {}
  }, [org]);

  // On first load, open on the page that suits the person's role.
  const didInitTab = useRef(false);
  useEffect(() => {
    if (didInitTab.current || !active) return;
    didInitTab.current = true;
    const senior = ["owner", "admin", "manager", "finance"].includes(active.role) || can(active, "billing.view") || can(active, "team.manage") || can(active, "schedule.edit");
    setTab(senior ? "schedule" : (can(active, "time.track") ? "tracker" : "schedule"));
  }, [active]);

  // Subscription gate: verify the active studio has a live subscription (checks Stripe if our record is stale).
  const [billingChecked, setBillingChecked] = useState(false);
  const [billingOk, setBillingOk] = useState(false);
  useEffect(() => {
    if (!active || !org) return;
    const localOk = !!org.stripe_subscription_id && ["active", "trialing", "past_due"].includes(org.status);
    if (localOk) { setBillingOk(true); setBillingChecked(true); return; }
    let live = true;
    (async () => {
      try {
        const token = (await sb.auth.getSession()).data.session?.access_token;
        const r = await fetch("/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: active.org_id, accessToken: token }) });
        const b = await r.json();
        if (!live) return;
        if (b.free) setBillingOk(true); // free internal domain
        else if (b.configured === false) setBillingOk(true); // billing not set up yet → don't lock anyone out
        else setBillingOk(!!(b.hasSubscription && ["active", "trialing", "past_due"].includes(b.status)));
      } catch (_) { if (live) setBillingOk(false); }
      if (live) setBillingChecked(true);
    })();
    return () => { live = false; };
  }, [active?.org_id, org?.id, org?.status, org?.stripe_subscription_id]); // eslint-disable-line

  if (!CONFIGURED) return <Fatal title="Not configured" msg="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy." />;
  if (recovery) return <ResetPassword />;
  if (session === undefined) return <div className="h-full grid place-items-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Starting…</div></div>;
  if (!session) return <Auth inviteToken={pendingInvite} inviteError={inviteErr} productName={PRODUCT} />;
  if (memberships === null) return <div className="h-full grid place-items-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading your account…</div></div>;
  if (memberships.length === 0) {
    if (pendingInvite || inviteBusy) return <div className="h-full grid place-items-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Joining your team…</div></div>;
    if (inviteErr) return <Fatal title="Couldn't join the team" msg={inviteErr} />;
    return <Onboarding user={session.user} onDone={(id) => { setOrgId(id); localStorage.setItem("cadence_org", id); loadMe(); }} />;
  }
  if (!org || !data) return <div className="h-full grid place-items-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading your studio…</div></div>;

  const me = active ? { ...active, display_name: memberName(active) } : active;
  const suspended = org.status === "suspended" || org.status === "cancelled";
  const terms = makeTerms(org.settings?.usage);

  // Hard subscription gate — no active subscription means no app access (owners can subscribe on the paywall).
  if (!profile?.platform_admin && !billingOk) {
    if (!billingChecked) return <div className="h-full grid place-items-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Checking subscription…</div></div>;
    return <Paywall org={org} me={me} memberships={memberships}
      onPickOrg={(id) => { setOrgId(id); localStorage.setItem("cadence_org", id); }}
      onSignOut={async () => { await sb.auth.signOut(); window.location.reload(); }} />;
  }


  const NAV = [
    { key: "schedule", label: "Schedule", icon: CalendarDays, perm: "schedule.view" },
    { key: "summary", label: "Summary", icon: Table2, perm: "summary.view" },
    { key: "tasks", label: "Tasks", icon: LayoutGrid, perm: "tasks.view" },
    { key: "tracker", label: "Tracker", icon: Clock, perm: "time.track" },
    { key: "projects", label: terms.navProjects, icon: FolderKanban, perm: "projects.manage" },
    { key: "billing", label: "Billing", icon: Landmark, perm: "billing.view" },
    { key: "people", label: "People", icon: Users, perm: "team.view" },
    { key: "settings", label: "Settings", icon: Cog, perm: null },
  ];
  const visible = NAV.filter(n => !n.perm || can(me, n.perm));
  const current = visible.find(n => n.key === tab) ? tab : (visible[0]?.key || "settings");
  const userName = me.display_name || me.email;
  const navItem = (n) => { const Icon = n.icon; return { key: n.key, title: n.label, icon: <Icon />, isActive: current === n.key && tab !== "admin", onSelect: () => setTab(n.key) }; };

  return (
    <TooltipProvider>
    <SidebarProvider className="h-svh"
      style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" }}>
      <AppSidebar variant="inset"
        teams={memberships.map(m => ({ id: m.org_id, name: m.organizations?.name || "Studio", plan: planLabel(m.organizations?.plan) }))}
        activeTeamId={active.org_id}
        onPickTeam={(id) => { setOrgId(id); localStorage.setItem("cadence_org", id); }}
        nav={visible.filter(n => ["schedule", "summary", "tasks", "tracker"].includes(n.key)).map(navItem)}
        groups={[{ label: "Manage", items: visible.filter(n => ["projects", "billing", "people"].includes(n.key)).map(navItem) }]}
        action={{ title: "Leave feedback", icon: <Gift />, onSelect: () => setFeedbackOpen(true) }}
        secondary={[
          ...visible.filter(n => n.key === "settings").map(navItem),
          ...(profile?.platform_admin ? [{ key: "admin", title: "Admin console", icon: <Shield />, isActive: tab === "admin", onSelect: () => setTab("admin") }] : []),
        ]}
        user={{ name: userName, email: me.email, initials: initials(userName) }}
        onAccount={() => setTab("settings")}
        onSignOut={async () => { await sb.auth.signOut(); window.location.reload(); }} />
      <SidebarInset className="overflow-hidden">
      <SiteHeader title={tab === "admin" && profile?.platform_admin ? "Subscribers" : (visible.find(n => n.key === current)?.label || "")}>
        {can(me, "time.track") && <HeaderTracker me={me} active={current === "tracker"} onOpen={() => setTab("tracker")} />}
      </SiteHeader>
      {can(me, "time.track") && <TimerOverrunGuard org={org} me={me} data={data} reload={reload} />}

      {suspended && <div className="text-xs bg-destructive/10 border-b border-destructive/30 text-destructive px-4 py-2">
        This studio's subscription is {org.status}. Ask an owner to update billing in Settings.
      </div>}
      {err && <div className="text-xs bg-destructive/10 border-b border-destructive/30 text-destructive px-4 py-2">{err}</div>}

      {/* content */}
      <main className="flex-1 min-h-0">
          {tab === "admin" && profile?.platform_admin ? <Admin />
            : current === "people" ? (can(me, "team.manage") ? <Team org={org} me={me} members={data.members} reload={reload} onNavigate={setTab} /> : <TeamLite members={data.members} />)
            : current === "settings" ? <Settings org={org} me={me} members={data.members} reload={() => { loadMe(); reload(); }} />
            : current === "projects" ? <Projects org={org} me={me} data={data} reload={reload} terms={terms} />
            : current === "tracker" ? <Tracker org={org} me={me} data={data} reload={reload} />
            : current === "schedule" ? (can(me, "schedule.view") ? <Schedule org={org} me={me} data={data} reload={reload} onNavigate={setTab} peopleFilter={peopleFilter} onPeopleFilter={setPeopleFilter} /> : <NoAccess what="the schedule" />)
            : current === "summary" ? (can(me, "summary.view") ? <Summary org={org} me={me} data={data} reload={reload} peopleFilter={peopleFilter} onPeopleFilter={setPeopleFilter} /> : <NoAccess what="summaries" />)
            : current === "tasks" ? (can(me, "tasks.view") ? <Tasks org={org} me={me} data={data} reload={reload} /> : <NoAccess what="tasks" />)
            : current === "billing" ? (can(me, "billing.view")
                ? <Billing org={org} me={me} data={data} reload={reload} />
                : <NoAccess what="billing" />)
            : null}
      </main>
      {feedbackOpen && <FeedbackModal org={org} me={me} onClose={() => setFeedbackOpen(false)} />}
      {DEMO && <DemoSwitcher />}
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}

function HeaderTracker({ me, active, onOpen }) {
  const { run, capMinutes } = useRunningTimer(me.id, { dailyHours: me.daily_hours });
  const [, tick] = useState(0);
  useEffect(() => {
    if (!run) return;
    const iv = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, [run]);
  const elapsed = run ? fmtClock(Math.min((Date.now() - run.startedAt) / 1000, capMinutes * 60)) : null;
  return (
    <Button variant={active ? "secondary" : "ghost"} size="sm" title="Time tracker" onClick={onOpen}>
      {run
        ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ animation: "pulse 1.5s infinite" }} /> <span className="tabular-nums">{elapsed}</span></>
        : <><Clock data-icon="inline-start" /> Track</>}
    </Button>
  );
}

function Fatal({ title, msg }) {
  return (<div className="h-full grid place-items-center p-6 text-center">
    <div><div className="font-bold text-foreground mb-1">{title}</div><p className="text-sm text-muted-foreground max-w-sm">{msg}</p></div>
  </div>);
}
