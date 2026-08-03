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
export async function loadOrgData(orgId){
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
  return {
    members: (members.data||[]).map(m => ({ ...m, display_name: (m.display_name && String(m.display_name).trim()) ? m.display_name : prettyName(m.email) })),
    clients: clients.data||[], projects: projects.data||[],
    assignments: assignments.data||[], timeLogs: timeLogs.data||[], tasks: tasks.data||[],
    holidays: holidays.data||[], billing,
  };
}

export async function logAudit(orgId, action, entity, meta){
  try{ await sb.from("audit_log").insert({ org_id:orgId, action, entity: entity||null, meta: meta||{} }); }catch(_){}
}
