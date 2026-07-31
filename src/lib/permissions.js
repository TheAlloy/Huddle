// Cadence — permission model.
// These names match the checks in schema.sql, so the UI and the database agree.

export const PERMISSIONS = [
  { key: "schedule.view",   group: "Schedule", label: "See the schedule" },
  { key: "schedule.edit",   group: "Schedule", label: "Book and move work on the schedule" },
  { key: "summary.view",    group: "Time",     label: "See time summaries and reports" },
  { key: "summary.edit",    group: "Time",     label: "Edit anyone's logged hours" },
  { key: "time.track",      group: "Time",     label: "Use the timer to track own time" },
  { key: "time.manual",     group: "Time",     label: "Add or upload hours manually" },
  { key: "tasks.view",      group: "Tasks",    label: "See the tasks board" },
  { key: "tasks.edit",      group: "Tasks",    label: "Create and move tasks" },
  { key: "projects.manage", group: "Setup",    label: "Add and edit projects and phases" },
  { key: "clients.manage",  group: "Setup",    label: "Add and edit clients" },
  { key: "billing.view",    group: "Billing",  label: "See the billing plan and invoices" },
  { key: "billing.edit",    group: "Billing",  label: "Edit billing, raise invoices" },
  { key: "team.view",       group: "People",   label: "See the team list" },
  { key: "team.manage",     group: "People",   label: "Invite people and set permissions" },
  { key: "org.admin",       group: "Admin",    label: "Company settings and subscription" },
];

export const PERMISSION_GROUPS = ["Schedule", "Time", "Tasks", "Setup", "Billing", "People", "Admin"];

// Role presets — mirrored by app_has() in schema.sql.
export const ROLES = {
  owner:   { label: "Owner",        blurb: "Full access, billing and subscription.", all: true },
  admin:   { label: "Administrator",blurb: "Full access to everything in the studio.", all: true },
  manager: { label: "Manager",      blurb: "Runs the schedule, projects and people's time.",
    perms: ["schedule.view","schedule.edit","summary.view","summary.edit","projects.manage","clients.manage","tasks.view","tasks.edit","time.track","time.manual","team.view"] },
  finance: { label: "Finance",      blurb: "Billing, invoices and reporting.",
    perms: ["billing.view","billing.edit","summary.view","schedule.view","team.view"] },
  member:  { label: "Team member",  blurb: "Sees the schedule, tracks their own time, uses tasks.",
    perms: ["schedule.view","summary.view","tasks.view","tasks.edit","time.track","time.manual","team.view"] },
  tracker: { label: "Time tracking only", blurb: "Can only start the timer and see their schedule.",
    perms: ["time.track","schedule.view"] },
  viewer:  { label: "Viewer",       blurb: "Read-only. Cannot change anything.",
    perms: ["schedule.view","summary.view","tasks.view"] },
};

export const ROLE_KEYS = ["owner","admin","manager","finance","member","tracker","viewer"];

/** Everything this membership can do (role preset + any extra grants). */
export function effectivePermissions(membership) {
  if (!membership) return [];
  const role = ROLES[membership.role] || ROLES.member;
  if (role.all) return PERMISSIONS.map(p => p.key);
  const extra = Array.isArray(membership.permissions) ? membership.permissions : [];
  return [...new Set([...(role.perms || []), ...extra])];
}

export function can(membership, perm) {
  if (!membership || membership.status !== "active") return false;
  const role = ROLES[membership.role];
  if (role && role.all) return true;
  return effectivePermissions(membership).includes(perm);
}

/** Permissions granted by the role itself (shown as locked-on in the UI). */
export function isFromRole(membership, perm) {
  const role = ROLES[membership?.role];
  if (!role) return false;
  if (role.all) return true;
  return (role.perms || []).includes(perm);
}
