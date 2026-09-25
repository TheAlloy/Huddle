-- ============================================================
-- Huddle: one-off data tidy — give phase-less time entries their phase
-- Run in Supabase → SQL Editor (project ewszodwpenvxjktcknfp).
-- Safe to run more than once; only touches entries with no phase.
--
-- Until 2026-09 the project pickers (calendar planner, + Add project,
-- Summary "Add time") saved entries with no phase, so the same work
-- showed twice — "VOL007" and "VOL007 · UX". The app now fills the phase
-- itself; this fixes the entries saved before that, the same way: the phase
-- the person was scheduled on for that project that day. Entries whose
-- schedule bar has no phase (or with no bar that day) stay phase-less —
-- a blank phase on the schedule means "no phase", so nothing is guessed.
-- ============================================================

-- Preview first — what will change (run this on its own to check):
--   select l.id, l.log_date, p.code, p.name, l.minutes,
--          (select a.phase_id from assignments a
--            where a.membership_id = l.membership_id and a.kind = 'work'
--              and a.project_id = l.project_id and a.phase_id is not null
--              and a.start_date <= l.log_date and a.end_date >= l.log_date
--            order by a.start_date desc limit 1) as new_phase
--   from time_logs l join projects p on p.id = l.project_id
--   where l.phase_id is null and l.task_id is null;

-- The phase they were scheduled on that day.
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
