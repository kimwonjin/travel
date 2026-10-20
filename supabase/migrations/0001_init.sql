-- 여행 준비 앱 초기 스키마
-- 모든 데이터는 로그인 사용자(익명 로그인 포함) 본인 것만 읽고 쓸 수 있다 (RLS).

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default '내 여행',
  destination text not null default '',
  start_date date,
  end_date date,
  people int not null default 1 check (people > 0),
  memo text not null default '',
  created_at timestamptz not null default now()
);

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  position int not null,
  type text not null default '관광지',
  name text not null,
  address text not null default '',
  lat double precision not null,
  lng double precision not null,
  place_id text,
  created_at timestamptz not null default now()
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  position int not null default 0,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  position int not null default 0,
  category text not null,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  text text not null,
  amount bigint not null default 0 check (amount >= 0),
  created_at timestamptz not null default now()
);

create index on public.trips (user_id);
create index on public.stops (trip_id, position);
create index on public.checklist_items (trip_id);
create index on public.packing_items (trip_id);
create index on public.budget_items (trip_id);

alter table public.trips enable row level security;
alter table public.stops enable row level security;
alter table public.checklist_items enable row level security;
alter table public.packing_items enable row level security;
alter table public.budget_items enable row level security;

create policy "own trips" on public.trips
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 하위 테이블: 소유한 여행에 속한 행만 접근
create policy "own stops" on public.stops
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())));

create policy "own checklist" on public.checklist_items
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())));

create policy "own packing" on public.packing_items
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())));

create policy "own budget" on public.budget_items
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())));
