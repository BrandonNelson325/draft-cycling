-- Coach check-ins: the coach reaches out first when it spots a pattern a real
-- coach would act on (workouts keep feeling easy / too hard, missed sessions,
-- rides cut short, easy days ridden hard, gone quiet, a great consistent block).
-- One row per message sent — used for per-kind cooldowns so the coach never nags.
create table if not exists public.coach_checkins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  kind text not null,
  facts jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coach_checkins_athlete_created_idx
  on public.coach_checkins (athlete_id, created_at desc);

grant select, insert, update, delete on public.coach_checkins to service_role;
alter table public.coach_checkins enable row level security;
