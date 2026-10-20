-- ============================================================
-- Huddle: comments know their phase
-- Run in Supabase → SQL Editor (project ewszodwpenvxjktcknfp),
-- BEFORE the matching app code goes live. Safe to run more than once.
--
-- A project's comments are grouped by phase in its view. A comment made on a
-- booking takes the booking's phase; a note shared from My notes or the
-- tracker lands in the phase it was written against; comments posted on the
-- project itself can pick a phase or stay general.
-- ============================================================

alter table assignment_comments add column if not exists phase_id text;
update assignment_comments c set phase_id = a.phase_id
  from assignments a where a.id = c.assignment_id and c.phase_id is null and a.phase_id is not null;

notify pgrst, 'reload schema';
