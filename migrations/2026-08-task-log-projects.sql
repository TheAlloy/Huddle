-- 2026-08: task time attributes to the task's project (docs/time-tracker-plan.md
-- slice 6). From this release, new task time logs carry the task's
-- project_id/phase_id so they count toward phase budgets.
--
-- The statement below OPTIONALLY backfills historical task logs the same way.
-- ⚠ Decision required before running it: this changes reported numbers —
-- every phase budget absorbs the task time already logged against it. If
-- historical budgets should stay as they are, do NOT run this; only new logs
-- will be attributed.

update time_logs
set project_id = t.project_id,
    phase_id   = t.phase_id
from tasks t
where time_logs.task_id = t.id
  and time_logs.project_id is null
  and t.project_id is not null;
