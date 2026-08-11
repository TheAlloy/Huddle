// Demo mode — a complete in-memory stand-in for Supabase (auth + database +
// the /api/* serverless functions), seeded with a fictional studio.
//
// Run with `npm run dev:demo`. Nothing touches the network: sign-in, the
// database and the API endpoints are all faked here, so UX and front-end
// changes can be tested locally with zero backend. Data resets on refresh
// (by design — a clean slate for every iteration); the signed-in user is
// remembered across refreshes so you land back inside the app.
//
// Sign in as troy@demo.com (any password). A demo-only role switcher in the
// bottom-right corner changes which role you're viewing the app as — from
// owner all the way down to time-tracking only — without signing out.
// Signing up with a new email shows the onboarding wizard, and there is one
// pending invite link to test the join flow: /?invite=demo-invite
//
// NOT covered by demo mode (needs the real backend): actual emails,
// password rules, RLS/permission *enforcement* (the UI gates still apply),
// Stripe billing, and the AI proposal reader (returns canned data).

export const DEMO = import.meta.env.VITE_DEMO === "1";

// Set by createDemoClient(); used by the demo-only role switcher UI.
export let demoApi = null;

const uid = () => "demo-" + Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();
const pad = (n) => String(n).padStart(2, "0");
const dISO = (offsetDays) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
// Snap an offset to the nearest following Monday, so seeded bars look tidy.
const monday = (offsetDays) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); const back = (d.getDay() + 6) % 7; d.setDate(d.getDate() - back); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const shift = (iso, days) => { const [y, m, dd] = iso.split("-").map(Number); const d = new Date(y, m - 1, dd + days); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/* ------------------------------- seed data ------------------------------- */
function seed() {
  const ORG = "org-northshore";
  const people = [
    { key: "troy", email: "troy@demo.com",    name: "Troy",          role: "owner",   job: "Director", admin: true },
    { key: "ben",  email: "ben@demo.studio",  name: "Ben Achebe",    role: "admin",   job: "Studio Manager" },
    { key: "cora", email: "cora@demo.studio", name: "Cora Vane",     role: "manager", job: "Producer" },
    { key: "dev",  email: "dev@demo.studio",  name: "Devon Park",    role: "member",  job: "Designer", teams: ["Design"] },
    { key: "finn", email: "finn@demo.studio", name: "Finn Ortega",   role: "finance", job: "Finance" },
    { key: "tia",  email: "tia@demo.studio",  name: "Tia Moreau",    role: "tracker", job: "Freelance Motion", teams: ["Design"] },
  ];
  const mid = (k) => "mem-" + k;
  const uidOf = (k) => "user-" + k;

  const db = {
    organizations: [{
      id: ORG, name: "Northshore Studio", slug: "northshore-demo", plan: "Studio", seats: 10,
      status: "active", stripe_customer_id: "cus_demo", stripe_subscription_id: "sub_demo",
      trial_ends_at: null, settings: { usage: "consultancy" }, created_at: nowISO(),
    }],
    // Only Troy can sign in — the rest of the team exists as data.
    profiles: people.filter(p => p.key === "troy").map(p => ({ id: uidOf(p.key), email: p.email, full_name: p.name, platform_admin: !!p.admin, created_at: nowISO() })),
    memberships: people.map(p => ({
      id: mid(p.key), org_id: ORG, user_id: uidOf(p.key), email: p.email, display_name: p.name,
      role: p.role, permissions: [], status: "active", job_title: p.job, daily_hours: 8,
      holiday_allowance: 30, hourly_rate: null, teams: p.teams || null, created_at: nowISO(),
    })),
    invites: [{
      id: "inv-demo", org_id: ORG, email: "jules@demo.studio", role: "member", permissions: [],
      token: "demo-invite", invited_by: uidOf("troy"), accepted_at: null,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), created_at: nowISO(),
    }],
    clients: [
      { id: "cl-meridian", org_id: ORG, name: "Meridian Health", color: "#2f80ed", payment_terms: 30, billing_address: null, created_at: nowISO() },
      { id: "cl-kestrel",  org_id: ORG, name: "Kestrel Coffee",  color: "#27ae60", payment_terms: 14, billing_address: null, created_at: nowISO() },
      { id: "cl-voltaic",  org_id: ORG, name: "Voltaic EV",      color: "#9b51e0", payment_terms: 30, billing_address: null, created_at: nowISO() },
      { id: "cl-bloom",    org_id: ORG, name: "Bloom & Wilder",  color: "#f2994a", payment_terms: 30, billing_address: null, created_at: nowISO() },
    ],
    projects: [
      { id: "pr-mer", org_id: ORG, client_id: "cl-meridian", code: "MER014", name: "Brand refresh", billing: "perday", cost: 42000, archived: false, created_at: nowISO(),
        phases: [{ id: "ph-mer-1", name: "Discovery", days: 10 }, { id: "ph-mer-2", name: "Concept", days: 15, hours: 60 }, { id: "ph-mer-3", name: "Delivery", days: 10 }] },
      { id: "pr-kes", org_id: ORG, client_id: "cl-kestrel", code: "KES003", name: "Packaging range", billing: "perday", cost: 18500, archived: false, created_at: nowISO(),
        phases: [{ id: "ph-kes-1", name: "Design", days: 15, hours: 80 }, { id: "ph-kes-2", name: "Artwork", days: 10 }] },
      { id: "pr-vol", org_id: ORG, client_id: "cl-voltaic", code: "VOL007", name: "Launch site", billing: "perday", cost: 56000, archived: false, created_at: nowISO(),
        phases: [{ id: "ph-vol-1", name: "UX", days: 10 }, { id: "ph-vol-2", name: "Design", days: 15 }, { id: "ph-vol-3", name: "Build", days: 20 }] },
      { id: "pr-blm", org_id: ORG, client_id: "cl-bloom", code: "BLM001", name: "Spring campaign", billing: "perday", cost: 12000, archived: false, created_at: nowISO(), phases: [] },
    ],
    assignments: [],
    time_logs: [],
    tasks: [
      { id: "t-1", org_id: ORG, title: "Collect moodboard references", notes: null, assignee_id: mid("dev"), project_id: "pr-mer", phase_id: "ph-mer-2", team: "Design", priority: "high", status: "doing", ord: 1, created_at: nowISO() },
      { id: "t-2", org_id: ORG, title: "Print supplier quotes", notes: null, assignee_id: mid("cora"), project_id: "pr-kes", phase_id: null, team: null, priority: "med", status: "todo", ord: 2, created_at: nowISO() },
      { id: "t-3", org_id: ORG, title: "Improve studio SEO", notes: null, assignee_id: null, project_id: null, phase_id: null, team: "Web", priority: "low", status: "todo", ord: 3, created_at: nowISO() },
      { id: "t-4", org_id: ORG, title: "Book photographer for Bloom shoot", notes: null, assignee_id: mid("ben"), project_id: "pr-blm", phase_id: null, team: null, priority: "high", status: "todo", ord: 4, created_at: nowISO() },
      { id: "t-5", org_id: ORG, title: "Archive last year's project files", notes: null, assignee_id: mid("dev"), project_id: null, phase_id: null, team: "Design", priority: "low", status: "done", ord: 5, created_at: nowISO() },
    ],
    billing_entries: [
      { id: "b-1", org_id: ORG, kind: "invoice", title: "MER014 — Discovery", client: "Meridian Health", amount: 14000, status: "paid", entry_date: dISO(-24), project_id: "pr-mer", membership_id: null, meta: {}, created_at: nowISO() },
      { id: "b-2", org_id: ORG, kind: "invoice", title: "KES003 — Design 50%", client: "Kestrel Coffee", amount: 9250, status: "sent", entry_date: dISO(-6), project_id: "pr-kes", membership_id: null, meta: {}, created_at: nowISO() },
      { id: "b-3", org_id: ORG, kind: "pipeline", title: "Voltaic — retained motion", client: "Voltaic EV", amount: 24000, status: "likely", entry_date: dISO(40), project_id: null, membership_id: null, meta: {}, created_at: nowISO() },
      { id: "b-4", org_id: ORG, kind: "overhead", title: "Studio rent", client: "", amount: 2600, status: null, entry_date: null, project_id: null, membership_id: null, meta: { month: dISO(0).slice(0, 7) }, created_at: nowISO() },
      { id: "b-5", org_id: ORG, kind: "expense", title: "Client travel — train", client: "", amount: 84, status: null, entry_date: null, project_id: "pr-mer", membership_id: mid("cora"), meta: { month: dISO(0).slice(0, 7), miles: 0 }, created_at: nowISO() },
    ],
    public_holidays: [{ id: "h-1", org_id: ORG, day: monday(28), name: "Bank holiday" }],
    audit_log: [],
    feedback: [],
  };

  // Schedule bars: a believable few weeks either side of today.
  const wk = monday(0);
  const bar = (memberKey, projectId, phaseId, startISO, workDays, extra = {}) => db.assignments.push({
    id: uid(), org_id: ORG, kind: "work", membership_id: mid(memberKey), project_id: projectId,
    phase_id: phaseId, task_id: null, leave_type: null, start_date: startISO,
    end_date: shift(startISO, Math.round(workDays * 7 / 5) - 1), start_time: null, end_time: null,
    lane: null, mode: "hours_per_day", value: 0, note: null, created_at: nowISO(), ...extra,
  });
  bar("troy", "pr-vol", "ph-vol-1", shift(wk, 0), 10);
  bar("troy", "pr-mer", "ph-mer-3", shift(wk, 14), 10);
  bar("dev",  "pr-mer", "ph-mer-2", shift(wk, -14), 15);
  bar("dev",  "pr-kes", "ph-kes-1", shift(wk, 7), 10);
  bar("cora", "pr-mer", "ph-mer-1", shift(wk, -21), 10);
  bar("cora", "pr-vol", "ph-vol-1", shift(wk, 0), 10);
  bar("tia",  "pr-vol", "ph-vol-2", shift(wk, 7), 15);
  bar("ben",  "pr-blm", null, shift(wk, 0), 5);
  bar("finn", "pr-kes", "ph-kes-2", shift(wk, 14), 5);
  // Leave + a task on the timeline.
  db.assignments.push({ id: uid(), org_id: ORG, kind: "leave", membership_id: mid("dev"), project_id: null, phase_id: null, task_id: null, leave_type: "vacation", start_date: shift(wk, 21), end_date: shift(wk, 25), start_time: null, end_time: null, lane: null, mode: null, value: null, note: null, created_at: nowISO() });
  db.assignments.push({ id: uid(), org_id: ORG, kind: "task", membership_id: mid("ben"), project_id: null, phase_id: null, task_id: "t-4", leave_type: null, start_date: shift(wk, 7), end_date: shift(wk, 9), start_time: null, end_time: null, lane: null, mode: null, value: null, note: null, created_at: nowISO() });

  // Logged time (fills the phase-progress bars on the schedule).
  const log = (memberKey, projectId, phaseId, dateISO, minutes) => db.time_logs.push({
    id: uid(), org_id: ORG, membership_id: mid(memberKey), project_id: projectId, phase_id: phaseId,
    task_id: null, log_date: dateISO, minutes, source: "timer", note: null, created_at: nowISO(),
  });
  for (let i = 1; i <= 9; i++) log("dev", "pr-mer", "ph-mer-2", dISO(-i - 2), 150 + (i % 3) * 60);
  for (let i = 1; i <= 4; i++) log("cora", "pr-vol", "ph-vol-1", dISO(-i), 120);
  for (let i = 1; i <= 3; i++) log("troy", "pr-vol", "ph-vol-1", dISO(-i), 90);
  log("tia", "pr-vol", "ph-vol-2", dISO(-1), 90);
  return db;
}

/* --------------------------- tiny query builder --------------------------- */
function makeQuery(db, name) {
  const q = {
    _op: "select", _filters: [], _order: null, _count: false, _head: false, _single: null, _cols: "*", _rows: null, _patch: null,
    select(cols = "*", opts = {}) { if (q._op === "select") q._cols = cols; if (opts.count) q._count = true; if (opts.head) q._head = true; q._returning = true; return q; },
    insert(rows) { q._op = "insert"; q._rows = Array.isArray(rows) ? rows : [rows]; return q; },
    update(patch) { q._op = "update"; q._patch = patch; return q; },
    delete() { q._op = "delete"; return q; },
    eq(c, v) { q._filters.push(r => r[c] === v); return q; },
    neq(c, v) { q._filters.push(r => r[c] !== v); return q; },
    is(c, v) { q._filters.push(r => (v === null ? r[c] == null : r[c] === v)); return q; },
    in(c, vs) { q._filters.push(r => (vs || []).includes(r[c])); return q; },
    order(c, { ascending = true } = {}) { q._order = { c, ascending }; return q; },
    limit() { return q; },
    maybeSingle() { q._single = "maybe"; return q; },
    single() { q._single = "strict"; return q; },
    then(onOk, onErr) { return Promise.resolve(run()).then(onOk, onErr); },
  };
  const rowsOf = () => (db[name] = db[name] || []);
  const matched = () => rowsOf().filter(r => q._filters.every(f => f(r)));
  const embed = (r) => {
    // Supports the one embedded join the app uses: memberships → organizations(*)
    if (name === "memberships" && String(q._cols).includes("organizations")) {
      return { ...r, organizations: (db.organizations || []).find(o => o.id === r.org_id) || null };
    }
    return { ...r };
  };
  const finish = (rows) => {
    if (q._single) {
      if (rows.length === 0) return { data: null, error: q._single === "strict" ? { message: "Row not found" } : null };
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null, count: q._count ? rows.length : null };
  };
  function run() {
    if (q._op === "select") {
      let rows = matched().map(embed);
      if (q._order) rows.sort((a, b) => { const { c, ascending } = q._order; const x = a[c], y = b[c]; return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1); });
      if (q._head) return { data: null, error: null, count: rows.length };
      return finish(rows);
    }
    if (q._op === "insert") {
      const inserted = q._rows.map(r => ({ id: uid(), created_at: nowISO(), ...r }));
      rowsOf().push(...inserted);
      return q._single ? { data: inserted[0], error: null } : { data: q._returning ? inserted : null, error: null };
    }
    if (q._op === "update") {
      const rows = matched(); rows.forEach(r => Object.assign(r, q._patch));
      return q._single ? finish(rows) : { data: q._returning ? rows.map(embed) : null, error: null };
    }
    if (q._op === "delete") {
      const hit = new Set(matched().map(r => r.id));
      db[name] = rowsOf().filter(r => !hit.has(r.id));
      return { data: null, error: null };
    }
    return { data: null, error: { message: "Unsupported demo operation" } };
  }
  return q;
}

/* --------------------------------- client --------------------------------- */
export function createDemoClient() {
  const db = seed();
  const listeners = new Set();
  let session = null;

  const sessionFor = (profile) => ({
    access_token: "demo-token", user: { id: profile.id, email: profile.email, user_metadata: { full_name: profile.full_name } },
  });
  const fire = (event) => listeners.forEach(cb => { try { cb(event, session); } catch (_) {} });
  const persist = () => { try { session ? localStorage.setItem("huddle_demo_uid", session.user.id) : localStorage.removeItem("huddle_demo_uid"); } catch (_) {} };
  try {
    const saved = localStorage.getItem("huddle_demo_uid");
    const prof = saved && db.profiles.find(p => p.id === saved);
    if (prof) session = sessionFor(prof);
  } catch (_) {}

  const auth = {
    async getSession() { return { data: { session } }; },
    onAuthStateChange(cb) { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }; },
    async signInWithPassword({ email }) {
      const prof = db.profiles.find(p => p.email.toLowerCase() === String(email).toLowerCase());
      if (!prof) return { error: { message: "No demo account with that email. Try troy@demo.com (any password), or create an account." } };
      session = sessionFor(prof); persist(); fire("SIGNED_IN");
      return { data: { session }, error: null };
    },
    async signUp({ email, options }) {
      const em = String(email).toLowerCase();
      if (db.profiles.find(p => p.email.toLowerCase() === em)) return { error: { message: "That demo account already exists — sign in instead." } };
      const prof = { id: uid(), email: em, full_name: options?.data?.full_name || "", platform_admin: false, created_at: nowISO() };
      db.profiles.push(prof);
      // No email confirmation in demo mode — sign straight in (lands on onboarding).
      session = sessionFor(prof); persist(); fire("SIGNED_IN");
      return { data: { session }, error: null };
    },
    async signOut() { session = null; persist(); fire("SIGNED_OUT"); return { error: null }; },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
    async updateUser() { return { data: {}, error: null }; },
  };

  const rpc = async (name, args = {}) => {
    if (name === "create_organization") {
      if (!session) return { data: null, error: { message: "Not signed in." } };
      const orgId = uid();
      db.organizations.push({ id: orgId, name: args.org_name, slug: "demo-" + orgId, plan: "Studio", seats: 10, status: "active", stripe_customer_id: "cus_demo", stripe_subscription_id: "sub_demo", trial_ends_at: null, settings: {}, created_at: nowISO() });
      db.memberships.push({ id: uid(), org_id: orgId, user_id: session.user.id, email: session.user.email, display_name: args.person_name || session.user.user_metadata.full_name || session.user.email, role: "owner", permissions: [], status: "active", job_title: null, daily_hours: 8, holiday_allowance: 30, hourly_rate: null, teams: null, created_at: nowISO() });
      return { data: orgId, error: null };
    }
    if (name === "accept_invite") {
      if (!session) return { data: null, error: { message: "Not signed in." } };
      const inv = db.invites.find(i => i.token === args.invite_token && !i.accepted_at);
      if (!inv) return { data: null, error: { message: "This invitation is invalid or has expired." } };
      const existing = db.memberships.find(m => m.org_id === inv.org_id && m.user_id === session.user.id);
      if (existing) Object.assign(existing, { status: "active", role: inv.role, permissions: inv.permissions });
      else db.memberships.push({ id: uid(), org_id: inv.org_id, user_id: session.user.id, email: inv.email, display_name: session.user.user_metadata.full_name || inv.email, role: inv.role, permissions: inv.permissions || [], status: "active", job_title: null, daily_hours: 8, holiday_allowance: 30, hourly_rate: null, teams: null, created_at: nowISO() });
      inv.accepted_at = nowISO();
      return { data: inv.org_id, error: null };
    }
    return { data: null, error: { message: `"${name}" isn't available in demo mode.` } };
  };

  installFetchInterceptor(db);

  // Live role switcher: changes Troy's role in place and nudges the app to
  // re-read the session, so every screen re-renders as that role. Platform
  // admin (the vendor console) is only kept while viewing as owner.
  demoApi = {
    getRole: () => (db.memberships.find(m => m.user_id === "user-troy") || {}).role || "owner",
    setRole: (role) => {
      const m = db.memberships.find(x => x.user_id === "user-troy");
      if (m) m.role = role;
      const p = db.profiles.find(x => x.id === "user-troy");
      if (p) p.platform_admin = role === "owner";
      if (session) { session = { ...session }; fire("USER_UPDATED"); }
    },
  };

  return {
    auth, rpc,
    from: (name) => makeQuery(db, name),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  };
}

/* --------------------------- fake /api/* endpoints ------------------------ */
function installFetchInterceptor(db) {
  const real = window.fetch.bind(window);
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith("/api/")) return real(input, init);
    const body = (() => { try { return JSON.parse(init?.body || "{}"); } catch (_) { return {}; } })();
    switch (url) {
      case "/api/subscription": return json({ configured: true, hasSubscription: true, status: "active" });
      case "/api/plans": return json({ configured: true, plans: [
        { priceId: "price_demo_studio", name: "Studio", description: "For small studios", amount: 29, currency: "GBP", interval: "month", seats: 10, trialDays: 14, order: 1 },
        { priceId: "price_demo_agency", name: "Agency", description: "For bigger teams", amount: 79, currency: "GBP", interval: "month", seats: 25, trialDays: 14, order: 2 },
      ] });
      case "/api/invite": {
        const token = uid();
        db.invites.push({ id: uid(), org_id: body.orgId, email: body.email, role: body.role || "member", permissions: body.permissions || [], token, invited_by: null, accepted_at: null, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), created_at: nowISO() });
        return json({ ok: true, emailed: false, link: `${location.origin}/?invite=${token}`, note: "demo mode — no emails are sent" });
      }
      case "/api/extract": {
        await wait(900);
        return json({ client: "Kestrel Coffee", projectName: "Autumn rebrand", code: null, cost: 18500, currency: "GBP",
          phases: [{ name: "Discovery", days: 5 }, { name: "Design", days: 15 }, { name: "Delivery", days: 10 }],
          confidence: "Demo mode — this is canned sample data, not a real AI extraction" });
      }
      case "/api/feedback": return json({ notified: true });
      case "/api/delete-request": return json({ ok: true });
      case "/api/checkout": return json({ error: "Checkout isn't available in demo mode." }, 400);
      case "/api/billing-portal": return json({ error: "The billing portal isn't available in demo mode." }, 400);
      default: return json({ error: "Not available in demo mode." }, 404);
    }
  };
}
