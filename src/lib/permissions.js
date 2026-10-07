// Huddle — permission model.
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

// Role presets — mirrored by app_has() in schema.sql. Four roles since
// 2026-10: Administrator and Manager merged into "Admin / Manager" (full
// access); Finance and Viewer retired.
export const ROLES = {
  owner:   { label: "Owner",        blurb: "Full access, billing and subscription.", all: true },
  admin:   { label: "Admin / Manager", blurb: "Full access — runs the schedule, projects, people and the studio.", all: true },
  member:  { label: "Team member",  blurb: "Sees the schedule, tracks their own time, uses tasks.",
    perms: ["schedule.view","summary.view","tasks.view","tasks.edit","time.track","time.manual","team.view"] },
  tracker: { label: "Time tracking only", blurb: "Can only start the timer and see their schedule.",
    perms: ["time.track","schedule.view"] },
};

export const ROLE_KEYS = ["owner","admin","member","tracker"];

// Retired roles read as their replacement until migrations/2026-10-*.sql
// rewrites them in the database.
const LEGACY_ROLES = { manager: "admin", finance: "admin", viewer: "member" };
export const roleKey = (role) => LEGACY_ROLES[role] || role;

/** Everything this membership can do (role preset + any extra grants). */
export function effectivePermissions(membership) {
  if (!membership) return [];
  const role = ROLES[roleKey(membership.role)] || ROLES.member;
  if (role.all) return PERMISSIONS.map(p => p.key);
  const extra = Array.isArray(membership.permissions) ? membership.permissions : [];
  return [...new Set([...(role.perms || []), ...extra])];
}

// Some actions are owner-only and are NOT granted by an "all access" admin role.
export const OWNER_ONLY = ["account.close"];

export function can(membership, perm) {
  if (!membership || membership.status !== "active") return false;
  if (OWNER_ONLY.includes(perm)) return membership.role === "owner";
  const role = ROLES[roleKey(membership.role)];
  if (role && role.all) return true;
  return effectivePermissions(membership).includes(perm);
}

/** Permissions granted by the role itself (shown as locked-on in the UI). */
export function isFromRole(membership, perm) {
  const role = ROLES[roleKey(membership?.role)];
  if (!role) return false;
  if (role.all) return true;
  return (role.perms || []).includes(perm);
}
