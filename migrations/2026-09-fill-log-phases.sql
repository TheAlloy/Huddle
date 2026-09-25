-- ============================================================
-- Huddle: one-off data tidy — give phase-less time entries their phase
-- Run in Supabase → SQL Editor (project ewszodwpenvxjktcknfp).
-- Safe to run more than once; only touches entries with no phase.
--
-- Until 2026-09 the project pickers (calendar planner, + Add project,
-- Summary "Add time") saved entries with no phase, so the same work
-- showed twice — "VOL007" and "VOL007 · UX". The app now fills the phase
-- itself; this fixes the entries saved before that, the same way:
--   1. the phase the person was scheduled on for that project that day;
--   2. otherwise the project's only phase, when it has exactly one.
-- Entries that match neither are left as they are.
-- ============================================================

-- Preview first — what will change (run this on its own to check):
--   select l.id, l.log_date, p.code, p.name, l.minutes,
--          coalesce(
--            (select a.phase_id from assignments a
--              where a.membership_id = l.membership_id and a.kind = 'work'
--                and a.project_id = l.project_id and a.phase_id is not null
--                and a.start_date <= l.log_date and a.end_date >= l.log_date
--              order by a.start_date desc limit 1),
--            case when jsonb_array_length(p.phases) = 1 then p.phases->0->>'id' end
--          ) as new_phase
--   from time_logs l join projects p on p.id = l.project_id
--   where l.phase_id is null and l.task_id is null;

-- 1) The phase they were scheduled on that day.
update time_logs l
set phase_id = (
  select a.phase_id from assignments a
  where a.membership_id = l.membership_id and a.kind = 'work'
    and a.project_id = l.project_id and a.phase_id is not null
    and a.start_date <= l.log_date and a.end_date >= l.log_date
  order by a.start_date desc limit 1)
where l.phase_id is null and l.task_id is null and l.project_id is not null
  and exists (
    select 1 from assignments a
    where a.membership_id = l.membership_id and a.kind = 'work'
      and a.project_id = l.project_id and a.phase_id is not null
      and a.start_date <= l.log_date and a.end_date >= l.log_date);

-- 2) Otherwise, a project with exactly one phase.
update time_logs l
set phase_id = p.phases->0->>'id'
from projects p
where p.id = l.project_id and l.phase_id is null and l.task_id is null
  and jsonb_array_length(p.phases) = 1;
