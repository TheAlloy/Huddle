import { sb } from "./supabase.js";

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
    members: members.data||[], clients: clients.data||[], projects: projects.data||[],
    assignments: assignments.data||[], timeLogs: timeLogs.data||[], tasks: tasks.data||[],
    holidays: holidays.data||[], billing,
  };
}

export async function logAudit(orgId, action, entity, meta){
  try{ await sb.from("audit_log").insert({ org_id:orgId, action, entity: entity||null, meta: meta||{} }); }catch(_){}
}
