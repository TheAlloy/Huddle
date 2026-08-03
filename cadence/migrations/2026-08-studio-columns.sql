-- Cadence · studio-parity migration
-- Run this ONCE in Supabase → SQL Editor BEFORE deploying the updated code.
-- It is idempotent: safe to run more than once. It only ADDS columns; nothing is dropped.

-- Assignments: the studio scheduler stores part-day times, an hours/day mode+value,
-- a free note, a manual lane index, and (for task bars) a task link.
alter table public.assignments add column if not exists mode        text;
alter table public.assignments add column if not exists value       numeric;
alter table public.assignments add column if not exists note        text;
alter table public.assignments add column if not exists start_time  text;
alter table public.assignments add column if not exists end_time    text;
alter table public.assignments add column if not exists lane        integer;
alter table public.assignments add column if not exists task_id     uuid;

-- Time logs: the tracker can log against a task (not just a project/phase),
-- and records where the entry came from.
alter table public.time_logs   add column if not exists task_id     uuid;
alter table public.time_logs   add column if not exists note        text;
alter table public.time_logs   add column if not exists source      text default 'manual';

-- Make sure the assignment "kind" allows task bars as well as work/leave.
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'assignments' and column_name = 'kind'
  ) then
    begin
      alter table public.assignments drop constraint if exists assignments_kind_check;
    exception when others then null;
    end;
  end if;
  begin
    alter table public.assignments
      add constraint assignments_kind_check check (kind in ('work','leave','task'));
  exception when duplicate_object then null;
       when others then null;
  end;
end $$;
