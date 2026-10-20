-- 0002: 함께 짜기(권한 초대), 장소 저장·주변 추천, 투어 코스 판매

-- ========== 동선 표: 이름만 적은 행(위치 없음)과 메모 허용 ==========

alter table public.stops
  alter column lat drop not null,
  alter column lng drop not null,
  add column memo text not null default '';

-- ========== 함께 짜기 ==========

create table public.trip_members (
  trip_id uuid not null references public.trips on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  nickname text not null default '',
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index on public.trip_members (user_id);

create table public.trip_invites (
  code text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  trip_id uuid not null references public.trips on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now()
);
create index on public.trip_invites (trip_id);

-- 현재 사용자의 여행 권한: 'owner' | 'editor' | 'viewer' | null
create or replace function public.trip_role(t uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.trips where id = t and user_id = (select auth.uid())) then 'owner'
    else (select role from public.trip_members where trip_id = t and user_id = (select auth.uid()))
  end
$$;

-- 초대 코드로 여행에 참여. 이미 편집자면 보기 링크로 들어와도 권한이 내려가지 않는다.
create or replace function public.join_trip(invite_code text, nickname text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.trip_invites;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다';
  end if;
  select * into inv from public.trip_invites where code = invite_code;
  if not found then
    raise exception '초대 링크가 올바르지 않거나 취소되었습니다';
  end if;
  if exists (select 1 from public.trips where id = inv.trip_id and user_id = auth.uid()) then
    return inv.trip_id;
  end if;
  insert into public.trip_members (trip_id, user_id, role, nickname)
  values (inv.trip_id, auth.uid(), inv.role, coalesce(nickname, ''))
  on conflict (trip_id, user_id) do update
    set role = case when public.trip_members.role = 'editor' then 'editor' else excluded.role end,
        nickname = excluded.nickname;
  return inv.trip_id;
end
$$;
revoke execute on function public.join_trip(text, text) from anon;

-- trips: 소유자 + 멤버가 보고, 소유자 + 편집자가 수정. 소유자 변경은 컬럼 권한으로 막는다.
drop policy "own trips" on public.trips;
create policy "trips read" on public.trips for select to authenticated
  using (user_id = (select auth.uid()) or public.trip_role(id) is not null);
create policy "trips insert" on public.trips for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "trips update" on public.trips for update to authenticated
  using (public.trip_role(id) in ('owner', 'editor'));
create policy "trips delete" on public.trips for delete to authenticated
  using (user_id = (select auth.uid()));
revoke update on public.trips from authenticated;
grant update (title, destination, start_date, end_date, people, memo) on public.trips to authenticated;

-- 여행 하위 테이블: 멤버는 읽기, 소유자·편집자는 쓰기
drop policy "own stops" on public.stops;
drop policy "own checklist" on public.checklist_items;
drop policy "own packing" on public.packing_items;
drop policy "own budget" on public.budget_items;
do $$
declare
  t text;
begin
  foreach t in array array['stops', 'checklist_items', 'packing_items', 'budget_items'] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.trip_role(trip_id) is not null)', t);
    execute format('create policy "editors insert" on public.%I for insert to authenticated with check (public.trip_role(trip_id) in (''owner'', ''editor''))', t);
    execute format('create policy "editors update" on public.%I for update to authenticated using (public.trip_role(trip_id) in (''owner'', ''editor''))', t);
    execute format('create policy "editors delete" on public.%I for delete to authenticated using (public.trip_role(trip_id) in (''owner'', ''editor''))', t);
  end loop;
end
$$;

alter table public.trip_members enable row level security;
create policy "members read" on public.trip_members for select to authenticated
  using (public.trip_role(trip_id) is not null);
create policy "owner changes role" on public.trip_members for update to authenticated
  using (public.trip_role(trip_id) = 'owner');
create policy "owner removes or self leaves" on public.trip_members for delete to authenticated
  using (public.trip_role(trip_id) = 'owner' or user_id = (select auth.uid()));
-- 추가는 join_trip 함수로만

alter table public.trip_invites enable row level security;
create policy "owner manages invites" on public.trip_invites for all to authenticated
  using (public.trip_role(trip_id) = 'owner')
  with check (public.trip_role(trip_id) = 'owner');

-- ========== 장소 저장 · 주변 추천 ==========

-- 저장한 장소는 다른 사용자 추천에 쓰인다(공개)
create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  address text not null default '',
  lat double precision not null,
  lng double precision not null,
  place_id text,
  category text not null default '관광지',
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, place_id)
);
create index on public.saved_places (lat, lng);

alter table public.saved_places enable row level security;
create policy "anyone reads" on public.saved_places for select to authenticated using (true);
create policy "own insert" on public.saved_places for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own update" on public.saved_places for update to authenticated
  using (user_id = (select auth.uid()));
create policy "own delete" on public.saved_places for delete to authenticated
  using (user_id = (select auth.uid()));

-- 기준 좌표 반경 안에서 많이 저장된 순으로 추천
create or replace function public.nearby_places(p_lat double precision, p_lng double precision, p_radius_km double precision default 5)
returns table (
  name text, address text, lat double precision, lng double precision, place_id text,
  category text, saves bigint, distance_km double precision, comments text[]
)
language sql stable set search_path = '' as $$
  with p as (
    select s.*, 12742 * asin(sqrt(
      power(sin(radians(s.lat - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2)
    )) as dist
    from public.saved_places s
    where s.lat between p_lat - p_radius_km / 111.0 and p_lat + p_radius_km / 111.0
  )
  select min(p.name), min(p.address), avg(p.lat), avg(p.lng), min(p.place_id), min(p.category),
         count(distinct p.user_id), min(p.dist),
         array_remove(array_agg(nullif(p.comment, '')), null)
  from p
  where p.dist <= p_radius_km
  group by coalesce(p.place_id, p.name || round(p.lat::numeric, 4)::text || round(p.lng::numeric, 4)::text)
  order by count(distinct p.user_id) desc, min(p.dist)
  limit 20
$$;

-- ========== 투어 코스 판매 ==========

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  description text not null default '',
  region text not null default '',
  author_name text not null default '',
  price int not null default 0 check (price >= 0),
  stop_count int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.courses (seller_id);

create table public.course_stops (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses on delete cascade,
  position int not null,
  type text not null default '관광지',
  name text not null,
  address text not null default '',
  lat double precision,
  lng double precision,
  place_id text,
  memo text not null default ''
);
create index on public.course_stops (course_id, position);

create table public.course_purchases (
  course_id uuid not null references public.courses on delete cascade,
  buyer_id uuid not null default auth.uid() references auth.users on delete cascade,
  price int not null default 0,
  created_at timestamptz not null default now(),
  primary key (course_id, buyer_id)
);
create index on public.course_purchases (buyer_id);

create or replace function public.owns_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses where id = c and seller_id = (select auth.uid()))
$$;

-- 판매자, 구매자, 무료 코스는 상세 동선을 볼 수 있다
create or replace function public.can_view_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.courses
    where id = c and (seller_id = (select auth.uid()) or (published and price = 0))
  ) or exists (
    select 1 from public.course_purchases where course_id = c and buyer_id = (select auth.uid())
  )
$$;

alter table public.courses enable row level security;
create policy "published or own" on public.courses for select to authenticated
  using (published or seller_id = (select auth.uid()));
create policy "seller insert" on public.courses for insert to authenticated
  with check (seller_id = (select auth.uid()));
create policy "seller update" on public.courses for update to authenticated
  using (seller_id = (select auth.uid()));
create policy "seller delete" on public.courses for delete to authenticated
  using (seller_id = (select auth.uid()));

alter table public.course_stops enable row level security;
create policy "viewers read" on public.course_stops for select to authenticated
  using (public.can_view_course(course_id));
create policy "seller writes" on public.course_stops for all to authenticated
  using (public.owns_course(course_id))
  with check (public.owns_course(course_id));

alter table public.course_purchases enable row level security;
create policy "buyer or seller reads" on public.course_purchases for select to authenticated
  using (buyer_id = (select auth.uid()) or public.owns_course(course_id));
-- 테스트용: 결제 없이 구매 기록. 결제 연동 시 이 정책을 지우고 서버(결제 확인)에서만 기록한다.
create policy "test purchase" on public.course_purchases for insert to authenticated
  with check (buyer_id = (select auth.uid()));
