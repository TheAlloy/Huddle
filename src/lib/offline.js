// Offline layer — wraps the Supabase client so Huddle keeps working with no
// connection, then uploads what was done once it's back.
//
//   • Mirror: every org-scoped table the app reads is kept on this computer
//     (IndexedDB, per signed-in user). Online reads refresh it; offline reads
//     are answered from it by a small local query engine.
//   • Outbox: a write that can't reach the server (offline, or the network
//     drops mid-request) is applied to the mirror at once — screens update as
//     if it saved — and queued. The queue uploads in order on reconnect.
//   • Safe retries: inserts get their id on this computer, so re-sending one
//     after a dropout can't create a duplicate.
//   • Clashes: a queued change remembers what the fields looked like when it
//     was made. If someone else changed the same field meanwhile, it isn't
//     sent blindly — it waits in "Needs attention" for Keep mine / Keep theirs.
//     Changes to different fields of the same thing simply merge.
//   • Nothing is dropped silently: anything the server refuses (permission,
//     deleted parent…) also lands in "Needs attention" with Retry / Discard.
//
// Screens are untouched: they keep calling sb.from(...) exactly as before.
// RPCs and /api calls need the server and say so when offline.
//
// Sign-out clears the cached team data; queued changes stay (keyed by user)
// and upload the next time that person signs in on this computer.

const OFFLINE_MSG = "You're offline. This needs an internet connection.";
const NOT_CACHED_MSG = "You're offline and this hasn't been loaded on this computer yet.";

// Primary keys that aren't "id"; tables whose ids the server assigns.
const KEY = { running_timers: "membership_id", org_domains: "domain" };
const SERVER_IDS = new Set(["running_timers", "org_domains", "profiles"]);
const keyOf = (t) => KEY[t] || "id";

// Embedded selects the app uses: name → the foreign key on the parent row.
const EMBED_FK = { organizations: "org_id", projects: "project_id", clients: "client_id", memberships: "membership_id" };

// What the database does to child rows when a parent is deleted (schema.sql),
// so a delete made offline looks the same locally as it will on the server.
const CASCADE = {
  clients: [["projects", "client_id", "null"]],
  projects: [["assignments", "project_id", "cascade"], ["time_logs", "project_id", "null"], ["tasks", "project_id", "null"], ["running_timers", "project_id", "null"], ["billing_entries", "project_id", "null"]],
  memberships: [["assignments", "membership_id", "cascade"], ["time_logs", "membership_id", "cascade"], ["tasks", "assignee_id", "null"], ["running_timers", "membership_id", "cascade"], ["billing_entries", "membership_id", "null"], ["assignment_comments", "membership_id", "null"]],
  assignments: [["assignment_comments", "assignment_id", "cascade"]],
  tasks: [["running_timers", "task_id", "cascade"]],
};

// Plain-English names for "Needs attention".
const NOUN = {
  time_logs: "time entry", assignments: "booking", projects: "project", clients: "client", tasks: "task",
  assignment_comments: "comment", memberships: "team member", public_holidays: "public holiday",
  organizations: "studio settings", running_timers: "timer", billing_entries: "billing entry",
  invites: "invite", feedback: "feedback", audit_log: "activity record", profiles: "profile",
};

const uuid = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
// Postgres stores JSON with its own key order, so compare with keys sorted.
const stable = (v) => (Array.isArray(v) ? "[" + v.map(stable).join(",") + "]"
  : v && typeof v === "object" ? "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}"
  : JSON.stringify(v ?? null));
const same = (a, b) => stable(a) === stable(b);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// Three-way merge of a value I changed offline (mine) with what's on the
// server now (theirs), from what it was when I changed it (base). Lists of
// things with ids (a project's phases) merge item by item and settings merge
// key by key — so two people editing different phases don't clash. Only a
// real collision (the same phase field changed both ways) fails — unless
// mineWins ("Keep mine"), where mine takes just the collided spots.
function merge3(b, m, t, mineWins = false) {
  if (same(m, t)) return { ok: true, value: m };
  if (same(m, b)) return { ok: true, value: t };
  if (same(t, b)) return { ok: true, value: m };
  const withIds = (a) => Array.isArray(a) && a.every((x) => isObj(x) && x.id != null);
  if (withIds(m) && withIds(t) && (b == null || withIds(b))) {
    const map = (a) => new Map((a || []).map((x) => [str(x.id), x]));
    const B = map(b), M = map(m), T = map(t);
    const out = [];
    for (const id of new Set([...m.map((x) => str(x.id)), ...t.map((x) => str(x.id)).filter((id) => !B.has(id))])) {
      const r = merge3(B.get(id) ?? null, M.get(id) ?? null, T.get(id) ?? null, mineWins);
      if (!r.ok) { const it = M.get(id) || T.get(id) || B.get(id); return { ...r, path: [it.name || it.title || id, ...(r.path || [])] }; }
      if (r.value != null) out.push(r.value);
    }
    return { ok: true, value: out };
  }
  if (isObj(m) && isObj(t) && (b == null || isObj(b))) {
    const out = {};
    for (const key of new Set([...Object.keys(m), ...Object.keys(t), ...Object.keys(b || {})])) {
      const r = merge3(b ? b[key] : undefined, m[key], t[key], mineWins);
      if (!r.ok) return { ...r, path: [key, ...(r.path || [])] };
      if (r.value !== undefined) out[key] = r.value;
    }
    return { ok: true, value: out };
  }
  if (mineWins) return { ok: true, value: m };
  return { ok: false, theirs: t, mine: m }; // the exact spot that collided
}

/* --------------------------------- storage -------------------------------- */
// IndexedDB key/value; memory (+ localStorage for the outbox) if unavailable.
let dbp = null;
const mem = new Map();
function idb() {
  if (!dbp) dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open("huddle_offline", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  return dbp;
}
async function kvGet(k) {
  try { const db = await idb(); return await new Promise((res, rej) => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
  catch (_) { if (mem.has(k)) return mem.get(k); try { const v = localStorage.getItem("huddle_off_" + k); return v ? JSON.parse(v) : undefined; } catch (_) { return undefined; } }
}
async function kvSet(k, v) {
  try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
  catch (_) { mem.set(k, v); if (!k.startsWith("mirror:")) { try { localStorage.setItem("huddle_off_" + k, JSON.stringify(v)); } catch (_) {} } }
}
async function kvDel(k) {
  try { const db = await idb(); await new Promise((res) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").delete(k); tx.oncomplete = res; tx.onerror = res; }); } catch (_) {}
  mem.delete(k); try { localStorage.removeItem("huddle_off_" + k); } catch (_) {}
}

// Read-modify-write in one transaction, so two tabs editing the same record
// can't overwrite each other.
async function kvUpdate(k, fn) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction("kv", "readwrite"); const st = tx.objectStore("kv");
      const g = st.get(k);
      g.onsuccess = () => st.put(fn(g.result), k);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (_) { await kvSet(k, fn(await kvGet(k))); }
}

/* ---------------------------------- state --------------------------------- */
const S = {
  real: null, url: null, anon: null,
  uid: null, loaded: Promise.resolve(),
  tables: {},        // table → rows
  seen: new Set(),   // tables that have been loaded at least once (empty ≠ never loaded)
  outbox: [],        // queued writes, oldest first
  issues: [],        // "Needs attention"
  online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  syncing: false, sendingId: null, justSynced: 0,
  simulate: false,   // dev/demo: pretend the network is down (survives a reload)
};
if (import.meta.env.DEV || import.meta.env.VITE_DEMO === "1") {
  try { if (sessionStorage.getItem("huddle_sim_offline") === "1") { S.simulate = true; S.online = false; } } catch (_) {}
}
const listeners = new Set();
let snap = null;
function emit() { snap = null; listeners.forEach((fn) => { try { fn(); } catch (_) {} }); }
export const offline = {
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  getState() {
    if (!snap) snap = { online: S.online, syncing: S.syncing, pending: S.outbox.length, issues: S.issues, justSynced: S.justSynced };
    return snap;
  },
  pendingCount: () => S.outbox.length,
  syncNow: () => { probe(); },
  describe: (issue) => describeOp(issue.op),
  keepMine, retryIssue, discardIssue,
  simulateOffline(on) {
    S.simulate = !!on;
    try { on ? sessionStorage.setItem("huddle_sim_offline", "1") : sessionStorage.removeItem("huddle_sim_offline"); } catch (_) {}
    if (on) goOffline(); else probe();
  },
};

let persistT = null;
function persistSoon() {
  if (!S.uid) return;
  clearTimeout(persistT);
  const uid = S.uid;
  persistT = setTimeout(() => { if (S.uid === uid) kvSet("mirror:" + uid, { tables: S.tables, seen: [...S.seen], at: Date.now() }); }, 400);
}
// The queue on disk is the truth: every change to it is one transaction
// against what's stored (not this tab's copy), so two open tabs can't
// overwrite each other's unsent changes; other tabs are told to re-read.
const chan = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("huddle-offline") : null;
async function edit(kind, fn) {
  if (!S.uid) return;
  const uid = S.uid;
  await kvUpdate(kind + ":" + uid, (cur) => fn(cur || []));
  try { chan?.postMessage({ uid }); } catch (_) {}
}
const putOp = (op) => edit("outbox", (l) => { const i = l.findIndex((x) => x.id === op.id); if (i < 0) return [...l, op]; const n = l.slice(); n[i] = op; return n; });
const dropOp = (id) => edit("outbox", (l) => l.filter((x) => x.id !== id));
const addIssue = (it) => edit("issues", (l) => [...l.filter((x) => x.id !== it.id), it]);
const dropIssue = (id) => edit("issues", (l) => l.filter((x) => x.id !== id));
async function reread() {
  if (!S.uid) return;
  const uid = S.uid;
  const [o, i] = await Promise.all([kvGet("outbox:" + uid), kvGet("issues:" + uid)]);
  if (S.uid !== uid) return;
  S.outbox = o || []; S.issues = i || [];
  rebase(); emit();
}
if (chan) chan.onmessage = (e) => { if (e.data && e.data.uid === S.uid) reread(); };

function setUser(uid) {
  if (S.uid === uid) return S.loaded;
  S.uid = uid; S.tables = {}; S.seen = new Set(); S.outbox = []; S.issues = [];
  if (!uid) { S.loaded = Promise.resolve(); emit(); return S.loaded; }
  S.loaded = (async () => {
    const [m, o, i] = await Promise.all([kvGet("mirror:" + uid), kvGet("outbox:" + uid), kvGet("issues:" + uid)]);
    if (S.uid !== uid) return;
    // Anything already read from the server in this session wins over the
    // older copy on disk.
    const fresh = S.tables;
    S.tables = { ...(m?.tables || {}), ...fresh };
    (m?.seen || []).forEach((t) => S.seen.add(t));
    S.outbox = [...(o || []), ...S.outbox];
    S.issues = [...(i || []), ...S.issues];
    rebase();
    emit();
    if (S.outbox.length) flushSoon(0);
  })().catch(() => {});
  return S.loaded;
}

/* ------------------------------ connectivity ------------------------------ */
let probeT = null;
function goOffline() {
  if (S.online) { S.online = false; emit(); }
  clearTimeout(probeT); probeT = setTimeout(probe, 8000);
}
function goOnline() {
  if (S.simulate) return;
  clearTimeout(probeT);
  if (S.online) return;
  S.online = true; emit();
  flushSoon(0);
  try { window.dispatchEvent(new CustomEvent("huddle:online")); } catch (_) {}
}
async function probe() {
  clearTimeout(probeT);
  if (S.simulate) { goOffline(); return; }
  if (!S.url) { goOnline(); return; } // demo client: no network to lose
  try {
    await rawFetch(S.url + "/auth/v1/health", { headers: { apikey: S.anon } }, 6000);
    goOnline();                       // any answer at all means we're connected
  } catch (_) { goOffline(); }
}
if (typeof window !== "undefined") {
  window.addEventListener("offline", () => goOffline());
  window.addEventListener("online", () => probe());
  window.addEventListener("focus", () => { if (!S.online || S.outbox.length) probe(); });
}

// fetch with a timeout (a request that hangs on a dead connection is a
// failure, not a wait), reporting connectivity both ways.
async function rawFetch(input, init = {}, ms = 15000) {
  const ctl = new AbortController();
  const outer = init.signal;
  if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener("abort", () => ctl.abort(), { once: true }); }
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(input, { ...init, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}
export async function netFetch(input, init) {
  if (S.simulate) throw new TypeError("Failed to fetch (simulated offline)");
  try { const r = await rawFetch(input, init); goOnline(); return r; }
  catch (e) { if (!(init?.signal?.aborted)) goOffline(); throw e; }
}
const isNet = (res) => !res || res.status === 0;

/* ------------------------------ query chains ------------------------------ */
// A query is recorded as a chain of [method, args] so it can be run against
// the server, run locally, or stored in the outbox and replayed later.
const WRITE = ["insert", "update", "upsert", "delete"];
const kindOf = (chain) => (chain.find((c) => WRITE.includes(c[0])) || ["select"])[0];
const argOf = (chain, m) => (chain.find((c) => c[0] === m) || [])[1];
const stripReturn = (chain) => chain.filter((c) => !["select", "single", "maybeSingle"].includes(c[0]));
const FILTERS = ["eq", "neq", "gt", "gte", "lt", "lte", "is", "in", "match", "not"];
const filterSig = (chain) => JSON.stringify(chain.filter((c) => FILTERS.includes(c[0])));

function replay(qb, chain) { let q = qb; for (const [m, a] of chain) q = q[m](...a); return q; }

const str = (v) => (v == null ? v : typeof v === "object" ? JSON.stringify(v) : String(v));
const cmp = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)));
function filtersOf(chain) {
  const fs = [];
  for (const [m, a] of chain) {
    const [c, v, w] = a || [];
    if (m === "eq") fs.push((r) => r[c] != null && str(r[c]) === str(v));
    else if (m === "neq") fs.push((r) => r[c] == null || str(r[c]) !== str(v));
    else if (m === "is") fs.push((r) => (v === null ? r[c] == null : r[c] === v));
    else if (m === "in") { const set = new Set((v || []).map(str)); fs.push((r) => set.has(str(r[c]))); }
    else if (m === "gt") fs.push((r) => r[c] != null && cmp(r[c], v) > 0);
    else if (m === "gte") fs.push((r) => r[c] != null && cmp(r[c], v) >= 0);
    else if (m === "lt") fs.push((r) => r[c] != null && cmp(r[c], v) < 0);
    else if (m === "lte") fs.push((r) => r[c] != null && cmp(r[c], v) <= 0);
    else if (m === "match") Object.entries(c || {}).forEach(([k, x]) => fs.push((r) => str(r[k]) === str(x)));
    else if (m === "not" && v === "is") fs.push((r) => (w === null ? r[c] != null : r[c] !== w));
  }
  return fs;
}
const embedsOf = (cols) => [...String(cols || "").matchAll(/(\w+)\s*\(/g)].map((m) => m[1]);

/* ------------------------------- local engine ----------------------------- */
const tbl = (t) => (S.tables[t] = S.tables[t] || []);
function upsertRow(t, row, merge = false) {
  const k = keyOf(t), rows = tbl(t);
  const i = row[k] == null ? -1 : rows.findIndex((r) => str(r[k]) === str(row[k]));
  if (i < 0) rows.push(row); else rows[i] = merge ? { ...rows[i], ...row } : row;
}
function cascade(t, gone) {
  for (const [child, fk, how] of CASCADE[t] || []) {
    const ids = new Set(gone.map((r) => str(r.id)));
    if (!S.tables[child]) continue;
    const hit = S.tables[child].filter((r) => r[fk] != null && ids.has(str(r[fk])));
    if (!hit.length) continue;
    if (how === "cascade") { S.tables[child] = S.tables[child].filter((r) => !hit.includes(r)); cascade(child, hit); }
    else hit.forEach((r) => { r[fk] = null; });
  }
}
function shape(t, row, cols) {
  const c = String(cols ?? "*");
  let out;
  if (/(^|,)\s*\*\s*(,|$)/.test(c)) out = { ...row };
  else { out = {}; c.split(",").map((s) => s.trim()).filter((s) => s && !s.includes("(")).forEach((f) => { const n = f.split(":").pop().trim(); out[n] = row[n] ?? null; }); }
  for (const e of embedsOf(c)) {
    const fk = EMBED_FK[e];
    out[e] = fk && row[fk] != null ? clone((S.tables[e] || []).find((x) => str(x.id) === str(row[fk])) || null) : null;
  }
  return out;
}

// Runs a recorded chain against the mirror. Writes change the mirror; the
// result has the same shape the server would give.
function execLocal(t, chain) {
  const kind = kindOf(chain);
  const fs = filtersOf(chain);
  const match = (r) => fs.every((f) => f(r));
  const sel = chain.find((c) => c[0] === "select");
  const cols = sel ? (sel[1][0] ?? "*") : "*";
  const opts = (sel && sel[1][1]) || {};
  const single = chain.some((c) => c[0] === "single") ? "strict" : chain.some((c) => c[0] === "maybeSingle") ? "maybe" : null;
  let rows;
  if (kind === "select") {
    if (!S.seen.has(t) && !S.tables[t]) return { data: null, error: { message: NOT_CACHED_MSG, code: "OFFLINE" }, count: null, status: 0, statusText: "" };
    rows = tbl(t).filter(match);
    const orders = chain.filter((c) => c[0] === "order");
    if (orders.length) rows = rows.slice().sort((a, b) => {
      for (const [, [col, o = {}]] of orders) {
        const asc = o.ascending !== false, x = a[col], y = b[col];
        if (x == null && y == null) continue;
        if (x == null) return asc ? 1 : -1;
        if (y == null) return asc ? -1 : 1;
        const d = cmp(x, y); if (d) return asc ? d : -d;
      }
      return 0;
    });
    const range = argOf(chain, "range"), limit = argOf(chain, "limit");
    if (range) rows = rows.slice(range[0], range[1] + 1);
    if (limit) rows = rows.slice(0, limit[0]);
  } else if (kind === "insert" || kind === "upsert") {
    const now = new Date().toISOString();
    rows = (argOf(chain, kind)[0] || []).map((r) => ({ created_at: now, ...clone(r) }));
    rows.forEach((r) => upsertRow(t, r, kind === "upsert"));
    S.seen.add(t);
  } else if (kind === "update") {
    const patch = clone(argOf(chain, "update")[0] || {});
    rows = tbl(t).filter(match);
    rows.forEach((r) => Object.assign(r, patch));
  } else { // delete
    rows = tbl(t).filter(match);
    if (rows.length) { S.tables[t] = tbl(t).filter((r) => !rows.includes(r)); cascade(t, rows); }
  }
  const out = rows.map((r) => shape(t, r, cols));
  if (opts.head) return { data: null, error: null, count: out.length, status: 200, statusText: "OK" };
  if (single) {
    if (!out.length) return single === "strict"
      ? { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, count: null, status: 406, statusText: "" }
      : { data: null, error: null, count: null, status: 200, statusText: "OK" };
    return { data: clone(out[0]), error: null, count: null, status: 200, statusText: "OK" };
  }
  const returning = kind === "select" || !!sel;
  return { data: returning ? clone(out) : null, error: null, count: opts.count ? out.length : null, status: kind === "insert" ? 201 : 200, statusText: "OK" };
}

// Server rows → mirror. A full read ("*", no limit) replaces whatever the
// mirror had for the same filters, so deletions made elsewhere disappear here
// too; a partial read only merges fields.
function absorb(t, chain, res) {
  const sel = chain.find((c) => c[0] === "select");
  const cols = sel ? (sel[1][0] ?? "*") : "*";
  if (sel && sel[1][1] && sel[1][1].head) return;
  let rows = res.data == null ? [] : Array.isArray(res.data) ? res.data : [res.data];
  const embeds = embedsOf(cols);
  rows = rows.map((r) => {
    const o = { ...r };
    for (const e of embeds) { const v = o[e]; delete o[e]; if (v) { (Array.isArray(v) ? v : [v]).forEach((x) => upsertRow(e, x, true)); S.seen.add(e); } }
    return o;
  });
  const full = /(^|,)\s*\*\s*(,|$)/.test(String(cols)) && !chain.some((c) => c[0] === "limit" || c[0] === "range");
  if (full) {
    const fs = filtersOf(chain);
    S.tables[t] = tbl(t).filter((r) => !fs.every((f) => f(r)));
    rows.forEach((r) => upsertRow(t, r));
  } else rows.forEach((r) => upsertRow(t, r, true));
  S.seen.add(t);
  rebase();
  persistSoon();
}
// Queued changes sit on top of whatever the server last said.
function rebase() { for (const op of S.outbox) { try { execLocal(op.table, op.chain); } catch (_) {} } }

/* ----------------------------------- reads -------------------------------- */
async function runSelect(t, chain) {
  if (S.online && !S.simulate) {
    const res = await replay(S.real.from(t), chain);
    if (!isNet(res)) {
      if (!res.error && S.uid) {
        await S.loaded;
        absorb(t, chain, res);
        // With changes still queued, answer from the mirror so they show.
        if (S.outbox.length) return execLocal(t, chain);
      }
      return res;
    }
    goOffline();
  }
  await S.loaded;
  if (!S.uid) return { data: null, error: { message: OFFLINE_MSG, code: "OFFLINE" }, count: null, status: 0, statusText: "" };
  return execLocal(t, chain);
}

/* ---------------------------------- writes -------------------------------- */
// For a change to existing rows: the fields' values before it, per row, so
// the upload can tell whether someone else changed them in the meantime.
function baseFor(t, chain) {
  if (kindOf(chain) !== "update") return null;
  const patch = argOf(chain, "update")[0] || {};
  const fs = filtersOf(chain), k = keyOf(t), base = {};
  for (const r of S.tables[t] || []) if (fs.every((f) => f(r))) { base[str(r[k])] = {}; for (const f of Object.keys(patch)) base[str(r[k])][f] = clone(r[f]); }
  return base;
}

// For a delete: the rows as they were, and what was attached to them that
// the delete would take too (a project's bookings…), so the upload can tell
// whether anyone changed them in the meantime.
function deleteSnapshot(t, chain) {
  if (kindOf(chain) !== "delete") return null;
  const fs = filtersOf(chain), k = keyOf(t);
  const rows = (S.tables[t] || []).filter((r) => fs.every((f) => f(r)));
  const snap = { rows: {}, kids: {} };
  rows.forEach((r) => { snap.rows[str(r[k])] = clone(r); });
  const ids = new Set(rows.map((r) => str(r.id)));
  for (const [child, fk, how] of CASCADE[t] || []) {
    if (how !== "cascade" || !S.seen.has(child)) continue;
    const ck = keyOf(child);
    snap.kids[child] = { fk, rows: {} };
    (S.tables[child] || []).filter((c) => c[fk] != null && ids.has(str(c[fk]))).forEach((c) => { snap.kids[child].rows[str(c[ck])] = clone(c); });
  }
  return snap;
}

async function runWrite(t, chain) {
  await S.loaded;
  const kind = kindOf(chain);
  // Online with nothing queued: write straight through, so errors (e.g. a
  // permission) still come back to the screen that made the change.
  if (S.online && !S.simulate && S.outbox.length === 0) {
    const res = await replay(S.real.from(t), chain);
    if (!isNet(res)) {
      if (!res.error && S.uid) {
        if (kind === "update" || kind === "delete" || !res.data) execLocal(t, stripReturn(chain));
        else (Array.isArray(res.data) ? res.data : [res.data]).forEach((r) => upsertRow(t, r, kind === "upsert"));
        S.seen.add(t); persistSoon();
      }
      return res;
    }
    goOffline();
    // The request may or may not have landed — queue it; inserts carry their
    // own ids, so a second send can't duplicate.
  }
  if (!S.uid) return { data: null, error: { message: OFFLINE_MSG, code: "OFFLINE" }, count: null, status: 0, statusText: "" };

  const base = baseFor(t, chain);
  const del = deleteSnapshot(t, chain);
  const res = execLocal(t, chain);
  const last = S.outbox[S.outbox.length - 1];
  // Repeated edits to the same thing (dragging a bar about) become one change.
  // The merged change gets a new id and replaces the old one in a single
  // write, so it can't be lost if the old one is mid-upload.
  if (kind === "update" && last && last.id !== S.sendingId && last.table === t && kindOf(last.chain) === "update" && filterSig(last.chain) === filterSig(chain)) {
    const patch = { ...argOf(last.chain, "update")[0], ...argOf(chain, "update")[0] };
    const mergedBase = { ...(last.base || {}) };
    for (const [id, fields] of Object.entries(base || {})) mergedBase[id] = { ...fields, ...(mergedBase[id] || {}) };
    const merged = { ...last, id: uuid(), chain: last.chain.map((c) => (c[0] === "update" ? ["update", [patch]] : c)), base: mergedBase };
    S.outbox[S.outbox.length - 1] = merged;
    await edit("outbox", (l) => [...l.filter((x) => x.id !== last.id), merged]);
  } else {
    const op = { id: uuid(), table: t, chain: stripReturn(chain), base, del, at: Date.now(), uid: S.uid };
    S.outbox.push(op);
    await putOp(op);
  }
  persistSoon();
  emit();
  flushSoon();
  return res;
}

/* ---------------------------------- upload -------------------------------- */
let flushT = null;
function flushSoon(ms = 50) { clearTimeout(flushT); flushT = setTimeout(flush, ms); }
setInterval(() => { if (S.uid && !S.syncing) { if (S.online) flush(); else if (S.outbox.length) probe(); } }, 15000);

// One tab uploads at a time (a Web Lock); it works from the queue on disk,
// re-read before each change, so it also sends what other tabs queued.
async function flush() {
  if (S.syncing || !S.uid || !S.online || S.simulate) return;
  const uid = S.uid;
  const run = async () => {
    S.syncing = true; emit();
    let sent = 0;
    try {
      while (S.uid === uid && S.online && !S.simulate) {
        const list = (await kvGet("outbox:" + uid)) || [];
        S.outbox = list;
        if (!list.length) break;
        const op = list[0];
        S.sendingId = op.id;
        const r = await send(op);
        if (r === "net") { goOffline(); break; }
        if (r === "auth") { flushSoon(15000); break; }
        if (r !== "ok") { S.issues = [...S.issues, r]; await addIssue(r); }
        await dropOp(op.id);
        S.outbox = S.outbox.filter((x) => x.id !== op.id);
        sent++; emit();
      }
    } finally { S.syncing = false; S.sendingId = null; }
    if (sent && !S.outbox.length) {
      S.justSynced = Date.now();
      try { window.dispatchEvent(new CustomEvent("huddle:synced")); } catch (_) {}
    }
    emit();
  };
  if (typeof navigator !== "undefined" && navigator.locks && navigator.locks.request) {
    await navigator.locks.request("huddle-sync-" + uid, { ifAvailable: true }, (lock) => (lock ? run() : null));
  } else await run();
}

const isAuthErr = (res) => res.status === 401 || /jwt/i.test(res.error?.message || "") || res.error?.code === "PGRST301";

async function send(op) {
  const kind = kindOf(op.chain), k = keyOf(op.table);
  const issue = (kindName, extra = {}) => ({ id: uuid(), kind: kindName, op, at: Date.now(), ...extra });

  if (kind === "update" && op.base) {
    const ids = Object.keys(op.base);
    if (ids.length) {
      const fields = [...new Set(ids.flatMap((id) => Object.keys(op.base[id])))];
      const cur = await S.real.from(op.table).select([k, ...fields.filter((f) => f !== k)].join(",")).in(k, ids);
      if (isNet(cur)) return "net";
      if (!cur.error) {
        const patch = argOf(op.chain, "update")[0] || {};
        const clashes = [], perRow = {};
        let merged = false;
        for (const row of cur.data || []) {
          const id = str(row[k]), before = op.base[id] || {};
          perRow[id] = { ...patch };
          for (const f of Object.keys(before)) {
            if (same(row[f], before[f]) || same(row[f], patch[f])) continue;
            const r = merge3(before[f], patch[f], row[f], !!op.force);
            if (r.ok) { perRow[id][f] = r.value; merged = true; }
            else clashes.push({ row: id, field: f, path: r.path || [], theirs: r.path ? r.theirs : row[f], mine: r.path ? r.mine : patch[f] });
          }
        }
        if (clashes.length) return issue("clash", { clashes });
        if (!(cur.data || []).length) return issue("gone");
        // Merged with someone else's edit: send each row its merged values.
        if (merged) {
          for (const [id, rowPatch] of Object.entries(perRow)) {
            const res = await S.real.from(op.table).update(rowPatch).eq(k, id);
            if (isNet(res)) return "net";
            if (res.error && isAuthErr(res)) return "auth";
            if (res.error) return issue("failed", { error: res.error.message || "The server refused this change." });
          }
          return "ok";
        }
      }
    }
  }

  // Nothing is deleted if someone changed it (or added to it) since: the
  // delete waits for "Delete anyway" / "Keep it".
  if (kind === "delete" && op.del && !op.force) {
    const ids = Object.keys(op.del.rows);
    if (ids.length) {
      const cur = await S.real.from(op.table).select("*").in(k, ids);
      if (isNet(cur)) return "net";
      if (!cur.error) {
        const changes = [];
        for (const row of cur.data || []) {
          const before = op.del.rows[str(row[k])] || {};
          for (const f of Object.keys(row)) if (f in before && !same(row[f], before[f])) changes.push({ row: str(row[k]), field: f, theirs: row[f], mine: before[f] });
        }
        const kids = [];
        for (const [child, { fk, rows }] of Object.entries(op.del.kids || {})) {
          const kc = await S.real.from(child).select("*").in(fk, ids);
          if (isNet(kc)) return "net";
          if (kc.error) continue;
          const ck = keyOf(child);
          const n = (kc.data || []).filter((c) => { const was = rows[str(c[ck])]; return !was || !same(c, { ...c, ...was }); }).length;
          if (n) kids.push({ table: child, count: n });
        }
        if (changes.length || kids.length) return issue("delclash", { clashes: changes, kids });
      }
    }
  }

  let chain = stripReturn(op.chain);
  if (kind === "update") chain = [...chain, ["select", [k]]];
  const res = await replay(S.real.from(op.table), chain);
  if (isNet(res)) return "net";
  if (res.error && isAuthErr(res)) { try { await S.real.auth.refreshSession(); } catch (_) {} return "auth"; }
  if (res.error) {
    // A retry of an insert that did land the first time.
    if (res.error.code === "23505" && kind === "insert") {
      const ids = (argOf(op.chain, "insert")[0] || []).map((r) => r[k]).filter((x) => x != null);
      if (ids.length) {
        const chk = await S.real.from(op.table).select(k).in(k, ids);
        if (isNet(chk)) return "net";
        if (!chk.error && (chk.data || []).length === ids.length) return "ok";
      }
    }
    return issue("failed", { error: res.error.message || "The server refused this change." });
  }
  if (kind === "update" && op.base && Object.keys(op.base).length && Array.isArray(res.data) && !res.data.length) return issue("gone");
  return "ok";
}

async function requeue(issueId, patch = {}) {
  const it = S.issues.find((x) => x.id === issueId);
  if (!it) return;
  S.issues = S.issues.filter((x) => x.id !== issueId);
  const op = { ...it.op, ...patch, id: uuid() };
  S.outbox.push(op);
  execLocal(it.op.table, it.op.chain);
  await putOp(op); await dropIssue(issueId);
  persistSoon(); emit(); flushSoon(0);
}
function keepMine(issueId) { return requeue(issueId, { force: true }); }
function retryIssue(issueId) { return requeue(issueId); }
async function discardIssue(issueId) {
  S.issues = S.issues.filter((x) => x.id !== issueId);
  await dropIssue(issueId); emit();
  try { window.dispatchEvent(new CustomEvent("huddle:synced")); } catch (_) {} // refresh from the server
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || "")); return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]}` : v; };

// "Add time entry · 3 Oct · 2h · Launch site", "Change booking · Devon · 20 Oct – 24 Oct", …
function describeOp(op) {
  const kind = kindOf(op.chain);
  const noun = NOUN[op.table] || op.table.replace(/_/g, " ");
  const verb = { insert: "Add", upsert: "Save", update: "Change", delete: "Delete" }[kind] || "Save";
  let row = null;
  if (kind === "insert" || kind === "upsert") row = (argOf(op.chain, kind)[0] || [])[0];
  else if (kind === "delete" && op.del) row = Object.values(op.del.rows)[0] || null;
  else { const fs = filtersOf(op.chain); row = (S.tables[op.table] || []).find((r) => fs.every((f) => f(r))); }
  let label = "";
  if (row) {
    if (op.table === "time_logs") {
      const p = (S.tables.projects || []).find((x) => x.id === row.project_id);
      label = [fmtDay(row.log_date), row.minutes ? Math.round(row.minutes / 6) / 10 + "h" : "", p ? p.name : ""].filter(Boolean).join(" · ");
    } else if (op.table === "assignments") {
      const m = (S.tables.memberships || []).find((x) => x.id === row.membership_id);
      label = [m ? m.display_name || m.email : "", row.start_date && row.end_date ? fmtDay(row.start_date) + " – " + fmtDay(row.end_date) : ""].filter(Boolean).join(" · ");
    } else label = row.name || row.title || row.display_name || (row.body ? String(row.body).slice(0, 40) : "") || fmtDay(row.day) || "";
  }
  const fields = kind === "update" ? Object.keys(argOf(op.chain, "update")[0] || {}).map((f) => f.replace(/_id$/, "").replace(/_/g, " ")) : [];
  return { title: `${verb} ${noun}`, label, fields };
}

/* --------------------------------- wrapper -------------------------------- */
function storedSession() {
  try {
    const key = S.real.auth.storageKey;
    const raw = key && localStorage.getItem(key);
    const s = raw && JSON.parse(raw);
    return s && s.user && s.access_token ? s : null;
  } catch (_) { return null; }
}

export function withOffline(real, { url = null, anon = null } = {}) {
  if (!real) return real;
  S.real = real; S.url = url; S.anon = anon;

  real.auth.onAuthStateChange((_e, s) => { setUser(s?.user?.id || null); });

  const from = (t) => {
    const chain = [];
    const b = {};
    const add = (m) => (...a) => {
      if (m === "insert" || m === "upsert") {
        // Ids are made here, so a re-sent insert is recognisably the same row.
        const rows = (Array.isArray(a[0]) ? a[0] : [a[0]]).map((r) => (SERVER_IDS.has(t) || keyOf(t) !== "id" || r.id ? { ...r } : { id: uuid(), ...r }));
        a = [rows, ...a.slice(1)];
      }
      chain.push([m, clone(a)]);
      return b;
    };
    ["select", "insert", "upsert", "update", "delete", ...FILTERS, "order", "limit", "range", "single", "maybeSingle"].forEach((m) => { b[m] = add(m); });
    b.then = (ok, err) => (WRITE.includes(kindOf(chain)) ? runWrite(t, chain) : runSelect(t, chain)).then(ok, err);
    b.catch = (err) => b.then(undefined, err);
    return b;
  };

  const rpc = (name, args, opts) => {
    if (!S.online || S.simulate) return Promise.resolve({ data: null, error: { message: OFFLINE_MSG, code: "OFFLINE" }, status: 0 });
    return Promise.resolve(real.rpc(name, args, opts)).then((res) => {
      if (isNet(res)) { goOffline(); return { data: null, error: { message: OFFLINE_MSG, code: "OFFLINE" }, status: 0 }; }
      return res;
    });
  };

  const getSession = async () => {
    // Offline with an expired token, the library spends ~30s retrying the
    // refresh and then reports no session. The saved session is still ours —
    // use it rather than signing the person out. (The real refresh carries on
    // and takes over when the connection is back.)
    const real$ = Promise.resolve(real.auth.getSession()).catch((e) => ({ data: { session: null }, error: e }));
    const quick = new Promise((res) => setTimeout(() => res(null), 4000));
    let r = await Promise.race([real$, quick]);
    let s = r?.data?.session || null;
    if (!r || (!s && r.error && /fetch|network|retryable/i.test((r.error.name || "") + (r.error.message || "")))) {
      const saved = storedSession();
      if (saved) { s = saved; if (r) goOffline(); }
      else if (!r) { r = await real$; s = r?.data?.session || null; }
    }
    setUser(s?.user?.id || null);
    return { data: { session: s }, error: null };
  };

  const signOut = async (...a) => {
    const uid = S.uid;
    let r = { error: null };
    try { r = await real.auth.signOut(...a); } catch (e) { r = { error: e }; }
    // Offline the server can't be told; forget the session on this computer anyway.
    if (r?.error) { try { localStorage.removeItem(real.auth.storageKey); } catch (_) {} r = { error: null }; }
    clearTimeout(persistT);
    setUser(null);
    if (uid) await kvDel("mirror:" + uid);   // queued changes stay for next sign-in
    return r;
  };

  const auth = new Proxy(real.auth, {
    get(target, p) {
      if (p === "getSession") return getSession;
      if (p === "signOut") return signOut;
      const v = target[p];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });

  // Our own server functions (invites, billing…) can't work offline; make the
  // failure say so instead of "Failed to fetch".
  if (typeof window !== "undefined" && !window.__huddleApiFetch) {
    const f = window.fetch.bind(window);
    window.__huddleApiFetch = true;
    window.fetch = (input, init) => {
      const u = typeof input === "string" ? input : input?.url || "";
      if (!/^\/api\/|^https?:\/\/[^/]+\/api\//.test(u) || (u.startsWith("http") && !u.startsWith(location.origin))) return f(input, init);
      return f(input, init).then((r) => { goOnline(); return r; }, (e) => { if (e?.name === "AbortError") throw e; goOffline(); throw new TypeError(OFFLINE_MSG); });
    };
  }

  const client = new Proxy(real, {
    get(target, p) {
      if (p === "from") return from;
      if (p === "rpc") return rpc;
      if (p === "auth") return auth;
      const v = target[p];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  // Dev/demo test hook: the wrapped client, the raw one ("someone else's"
  // edits), and the switches.
  if (typeof window !== "undefined" && (import.meta.env.DEV || import.meta.env.VITE_DEMO === "1")) window.__huddleOffline = { ...offline, real, sb: client };
  return client;
}

export { OFFLINE_MSG, NOUN };
