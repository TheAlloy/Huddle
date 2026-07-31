import React, { useState, useEffect, useCallback } from "react";
import { sb, CONFIGURED } from "./lib/supabase.js";
import { loadOrgData } from "./lib/api.js";
import { can } from "./lib/permissions.js";
import { NAVY, Avatar, Spinner, Btn } from "./ui.jsx";
import Auth from "./screens/Auth.jsx";
import Onboarding from "./screens/Onboarding.jsx";
import Team from "./screens/Team.jsx";
import Settings from "./screens/Settings.jsx";
import Admin from "./screens/Admin.jsx";
import { TeamLite, NoAccess } from "./screens/Workspace.jsx";
import Schedule from "./screens/Schedule.jsx";
import Summary from "./screens/Summary.jsx";
import Tasks from "./screens/Tasks.jsx";
import Projects from "./screens/Projects.jsx";
import Tracker from "./screens/Tracker.jsx";
import { CalendarDays, Table2, LayoutGrid, Landmark, Users, Settings as Cog, Clock, FolderKanban, Shield, ChevronDown } from "lucide-react";

const PRODUCT = "Cadence";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState(null);
  const [orgId, setOrgId] = useState(() => localStorage.getItem("cadence_org") || null);
  const [org, setOrg] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("schedule");
  const [err, setErr] = useState("");
  const inviteToken = new URLSearchParams(window.location.search).get("invite");

  /* session */
  useEffect(() => {
    if (!CONFIGURED) { setSession(null); return; }
    sb.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
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

  /* accept an invitation if one is in the URL */
  useEffect(() => {
    if (!session || !inviteToken) return;
    (async () => {
      const { data, error } = await sb.rpc("accept_invite", { invite_token: inviteToken });
      if (!error && data) { setOrgId(data); localStorage.setItem("cadence_org", data); }
      else if (error) setErr(error.message);
      window.history.replaceState({}, "", window.location.pathname);
      loadMe();
    })();
  }, [session, inviteToken, loadMe]);

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

  if (!CONFIGURED) return <Fatal title="Not configured" msg="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy." />;
  if (session === undefined) return <Spinner label="Starting…" />;
  if (!session) return <Auth inviteToken={inviteToken} productName={PRODUCT} />;
  if (memberships === null) return <Spinner label="Loading your account…" />;
  if (memberships.length === 0) return <Onboarding user={session.user} onDone={(id) => { setOrgId(id); localStorage.setItem("cadence_org", id); loadMe(); }} />;
  if (!org || !data) return <Spinner label="Loading your studio…" />;

  const me = active;
  const suspended = org.status === "suspended" || org.status === "cancelled";

  const NAV = [
    { key: "schedule", label: "Schedule", icon: CalendarDays, perm: "schedule.view" },
    { key: "summary", label: "Summary", icon: Table2, perm: "summary.view" },
    { key: "tasks", label: "Tasks", icon: LayoutGrid, perm: "tasks.view" },
    { key: "tracker", label: "Tracker", icon: Clock, perm: "time.track" },
    { key: "projects", label: "Projects", icon: FolderKanban, perm: "schedule.view" },
    { key: "billing", label: "Billing", icon: Landmark, perm: "billing.view" },
    { key: "people", label: "People", icon: Users, perm: "team.view" },
    { key: "settings", label: "Settings", icon: Cog, perm: null },
  ];
  const visible = NAV.filter(n => !n.perm || can(me, n.perm));
  const current = visible.find(n => n.key === tab) ? tab : (visible[0]?.key || "settings");

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-3 px-4 h-14 text-white shrink-0" style={{ background: NAVY }}>
        <div className="font-bold">{PRODUCT}</div>
        <OrgSwitcher memberships={memberships} activeId={active.org_id} onPick={(id) => { setOrgId(id); localStorage.setItem("cadence_org", id); }} />
        <div className="ml-auto flex items-center gap-2">
          {profile?.platform_admin && (
            <button onClick={() => setTab("admin")} title="Subscriber console"
              className={`flex items-center gap-1.5 text-xs px-2.5 h-7 rounded-md ${tab === "admin" ? "bg-white text-slate-800" : "text-white"}`}
              style={tab === "admin" ? undefined : { background: "#ffffff1f" }}><Shield size={13} /> Admin</button>
          )}
          <Avatar name={me.display_name || me.email} i={0} size={26} />
        </div>
      </div>

      {suspended && <div className="text-xs bg-red-50 border-b border-red-200 text-red-700 px-4 py-2">
        This studio's subscription is {org.status}. Ask an owner to update billing in Settings.
      </div>}
      {err && <div className="text-xs bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2">{err}</div>}

      <div className="flex-1 min-h-0 flex">
        {/* sidebar */}
        <nav className="w-44 shrink-0 border-r border-slate-200 p-2 space-y-0.5 overflow-y-auto">
          {visible.map(n => {
            const Icon = n.icon; const on = current === n.key && tab !== "admin";
            return (<button key={n.key} onClick={() => setTab(n.key)}
              className={`w-full flex items-center gap-2 text-sm px-2.5 py-2 rounded-lg text-left ${on ? "bg-slate-100 text-slate-900 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}>
              <Icon size={15} className={on ? "" : "text-slate-400"} />{n.label}
            </button>);
          })}
        </nav>

        {/* content */}
        <main className="flex-1 min-w-0 bg-slate-50/50">
          {tab === "admin" && profile?.platform_admin ? <Admin />
            : current === "people" ? (can(me, "team.manage") ? <Team org={org} me={me} members={data.members} reload={reload} /> : <TeamLite members={data.members} />)
            : current === "settings" ? <Settings org={org} me={me} reload={() => { loadMe(); reload(); }} />
            : current === "projects" ? <Projects org={org} me={me} data={data} reload={reload} />
            : current === "tracker" ? <Tracker org={org} me={me} data={data} reload={reload} />
            : current === "schedule" ? (can(me, "schedule.view") ? <Schedule org={org} me={me} data={data} reload={reload} /> : <NoAccess what="the schedule" />)
            : current === "summary" ? (can(me, "summary.view") ? <Summary org={org} me={me} data={data} reload={reload} /> : <NoAccess what="summaries" />)
            : current === "tasks" ? (can(me, "tasks.view") ? <Tasks org={org} me={me} data={data} reload={reload} /> : <NoAccess what="tasks" />)
            : current === "billing" ? (can(me, "billing.view")
                ? <ComingSoonBilling />
                : <NoAccess what="billing" />)
            : null}
        </main>
      </div>
    </div>
  );
}

function OrgSwitcher({ memberships, activeId, onPick }) {
  const [open, setOpen] = useState(false);
  const active = memberships.find(m => m.org_id === activeId);
  if (!active) return null;
  if (memberships.length === 1) return <span className="text-sm opacity-80">{active.organizations?.name}</span>;
  return (<div className="relative">
    <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-sm opacity-90 hover:opacity-100">
      {active.organizations?.name}<ChevronDown size={14} />
    </button>
    {open && <><div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
      <div className="absolute z-40 mt-1 w-56 bg-white text-slate-700 rounded-xl shadow-lg border border-slate-200 p-1">
        {memberships.map(m => (
          <button key={m.org_id} onClick={() => { onPick(m.org_id); setOpen(false); }}
            className={`w-full text-left text-sm px-2.5 py-1.5 rounded-lg hover:bg-slate-50 ${m.org_id === activeId ? "font-semibold" : ""}`}>
            {m.organizations?.name}
          </button>
        ))}
      </div></>}
  </div>);
}

function ComingSoonBilling() {
  return (<div className="p-4 h-full overflow-y-auto">
    <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-xl">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Billing</h3>
      <p className="text-sm text-slate-600 mb-3">The April–March billing plan, invoices and expenses are the next screen to come across from the studio tool.</p>
      <ul className="text-sm text-slate-500 list-disc pl-5 space-y-1">
        <li>Phase-by-phase income timeline</li><li>Prospective work — likely vs less likely</li>
        <li>Overheads and predicted net</li><li>Invoice PDFs with your branding</li>
      </ul>
      <p className="text-xs text-slate-400 mt-4">Billing is permission-gated already — only people with "see billing" reach this page, and only "edit billing" can change it.</p>
    </div>
  </div>);
}

function Fatal({ title, msg }) {
  return (<div className="h-full grid place-items-center p-6 text-center">
    <div><div className="font-bold text-slate-800 mb-1">{title}</div><p className="text-sm text-slate-500 max-w-sm">{msg}</p></div>
  </div>);
}
