-- ============================================================
-- Huddle: undo phases the app guessed on 2026-09-25
-- Run in Supabase → SQL Editor (project ewszodwpenvxjktcknfp).
--
-- For part of 25 Sep 2026 the app gave a phase-less time entry the
-- project's only phase ("Phase 1") even when the schedule bar had no
-- phase. This clears the phase again on entries that match all of:
--   * saved on/after 25 Sep 2026,
--   * their phase is the project's one and only phase,
--   * the person's schedule that day does NOT have them on that phase.
-- Entries logged against a phase the schedule really gave them are kept.
-- ============================================================

-- Preview first (run on its own):
--   select l.id, l.log_date, p.code, p.name, l.minutes, l.source, l.created_at
--   from time_logs l join projects p on p.id = l.project_id
--   where l.created_at >= '2026-09-25' and l.task_id is null and l.phase_id is not null
--     and jsonb_array_length(p.phases) = 1 and l.phase_id = p.phases->0->>'id'
--     and not exists (
--       select 1 from assignments a
--       where a.membership_id = l.membership_id and a.kind = 'work'
--         and a.project_id = l.project_id and a.phase_id = l.phase_id
--         and a.start_date <= l.log_date and a.end_date >= l.log_date);

update time_logs l
set phase_id = null
from projects p
where p.id = l.project_id
  and l.created_at >= '2026-09-25' and l.task_id is null and l.phase_id is not null
  and jsonb_array_length(p.phases) = 1 and l.phase_id = p.phases->0->>'id'
  and not exists (
    select 1 from assignments a
    where a.membership_id = l.membership_id and a.kind = 'work'
      and a.project_id = l.project_id and a.phase_id = l.phase_id
      and a.start_date <= l.log_date and a.end_date >= l.log_date);

-- If you ALSO ran the earlier version of migrations/2026-09-fill-log-phases.sql
-- (the one with a step "2) Otherwise, a project with exactly one phase"),
-- older entries were guessed too. Re-run the update above with the line
--   l.created_at >= '2026-09-25' and
-- removed to cover them. (Only do this if you ran that step — it would also
-- clear "Phase 1" on older entries logged without a matching schedule bar.)
