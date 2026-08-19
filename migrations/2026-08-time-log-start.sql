-- 2026-08: optional time-of-day placement for time logs (docs/time-tracker-ux-audit.md
-- §5, calendar revision). start_min = minutes from midnight, local to the studio;
-- null = a duration-only entry with no claimed position (typed totals, ghost
-- accepts, historical rows). Timer stops fill it from the timer's real start;
-- calendar drags set it explicitly. No backfill — historical entries stay unplaced.

alter table time_logs add column if not exists start_min integer;
