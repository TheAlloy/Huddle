import { sb } from "./supabase.js";

/** Turn an email (or empty name) into a readable name, e.g. alex.dangerfield@x.com → "Alex Dangerfield". */
export function prettyName(email) {
  if (!email) return "Member";
  const local = String(email).split("@")[0];
  const parts = local.split(/[._\-+]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1));
  return parts.length ? parts.join(" ") : String(email);
}
export function memberName(m) {
  return (m && m.display_name && String(m.display_name).trim()) ? m.display_name : prettyName(m && m.email);
}

/** Everything here is org-scoped. The database enforces it too (RLS). */
export async function loadOrgData(orgId, meId){
  const q = (t, sel="*") => sb.from(t).select(sel).eq("org_id", orgId);
  const [members, clients, projects, assignments, timeLogs, tasks, holidays] = await Promise.all([
    q("memberships"), q("clients"), q("projects"), q("assignments"),
    q("time_logs"), q("tasks"), q("public_holidays"),
  ]);
  const first = [members,clients,projects,assignments,timeLogs,tasks,holidays].find(r=>r.error);
  if (first) throw first.error;
  // Billing is permission-gated at the database level; a denial here is normal, not fatal.
  let billing = [];
  try { const b = await q("billing_entries"); if(!b.error) billing = b.data||[]; } catch(_) {}
  // Comments: the counts on schedule bars, and loaded in full so a thread can
  // still be read (and added to) offline. Non-fatal.
  let comments = [];
  try { const c = await q("assignment_comments"); if(!c.error) comments = c.data||[]; } catch(_) {}
  // Your private notes. The database only ever returns your own; the filter
  // says so too. Non-fatal (e.g. before the notes table exists).
  let notes = [];
  if (meId) { try { const n = await q("notes").eq("membership_id", meId); if(!n.error) notes = n.data||[]; } catch(_) {} }
  return {
    // People who left the team (status 'left') drop out of every list and
    // board; their past time and comments stay in the database.
    members: (members.data||[]).filter(m => m.status !== "left").map(m => ({ ...m, display_name: (m.display_name && String(m.display_name).trim()) ? m.display_name : prettyName(m.email) })),
    clients: clients.data||[], projects: projects.data||[],
    assignments: assignments.data||[], timeLogs: timeLogs.data||[], tasks: tasks.data||[],
    holidays: holidays.data||[], billing, comments, notes,
  };
}

export async function logAudit(orgId, action, entity, meta){
  try{ await sb.from("audit_log").insert({ org_id:orgId, action, entity: entity||null, meta: meta||{} }); }catch(_){}
}
