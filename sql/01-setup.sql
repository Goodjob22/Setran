-- ============================================================
--  ศูนย์เคลียร์เคลม 48 ชั่วโมง — ติดตั้งฐานข้อมูลบน Supabase
--  ไฟล์ที่ 1 จาก 2  (ไฟล์ที่ 2 คือข้อมูล 124 เคส)
--  วิธีใช้ : เปิด Supabase > SQL Editor > New query > วางทั้งไฟล์ > Run
--  วางซ้ำได้ ไม่พัง (ทุกคำสั่งเขียนแบบ "ถ้ามีอยู่แล้วให้ข้าม")
-- ============================================================

-- ─── ส่วนที่ 0 : ฟังก์ชันช่วย ───────────────────────────────

-- ทำทะเบียนรถให้เป็นรูปแบบเดียวกัน  "72-3215" และ "72 3215" ให้ได้ "723215"
create or replace function public.plate_key(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p,''), '[[:space:].-]', '', 'g'))
$$;

-- ─── ส่วนที่ 1 : ตาราง ─────────────────────────────────────

-- ผู้ใช้งาน (ผูกกับระบบล็อกอินของ Supabase)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  display    text,
  role       text not null default 'user' check (role in ('admin','user')),
  bu         text,                    -- ว่าง = เห็นทุก BU
  active     boolean not null default false,   -- ต้องให้แอดมินเปิดให้ก่อนถึงใช้ได้
  created_at timestamptz not null default now()
);

-- ทะเบียนซับ
create table if not exists public.vendors (
  code       text primary key,
  display    text,
  aliases    text[] not null default '{}',
  email      text default '',
  contact    text default '',
  carriers   text[] not null default '{}',
  active     boolean not null default true,
  note       text default '',
  updated_at timestamptz not null default now()
);

-- ทะเบียนรถ
create table if not exists public.trucks (
  key            text primary key,           -- ทะเบียนแบบตัดขีดออก
  plate          text not null,              -- ทะเบียนแบบที่คนอ่าน
  bu             text,
  drivers        text[] not null default '{}',
  primary_vendor text,                       -- ซับสัมปทานหลัก (คนตั้งเอง)
  roster         text[] not null default '{}', -- รายชื่อซับที่แจ้งว่ามีรถคันนี้ (ไฟล์อ้างอิง มีได้หลายราย)
  roster_note    text default '',
  note           text default '',
  updated_at     timestamptz not null default now()
);

-- เคส
create table if not exists public.cases (
  id         text primary key,
  carrier    text not null check (carrier in ('DHL','CJ')),
  store      text default '',
  store_name text default '',
  dept       text default '',
  driver     text default '',
  truck      text default '',
  ref_date   date,
  t0         timestamp,                      -- เวลาไทยตรง ๆ ไม่แปลงโซนเวลา
  amount     numeric(12,2) default 0,
  reason     text default '',
  items      jsonb not null default '[]'::jsonb,
  t0fix      timestamp,                      -- เวลารับเมลที่แก้ด้วยมือ (ทับค่าที่อ่านจากไฟล์)
  t0why      text default '',                -- เหตุผลที่แก้
  bu         text,                           -- ระบบเติมให้เองจากทะเบียนรถ
  source     text default 'entry',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ไทม์ไลน์ของแต่ละเคส
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  case_id    text not null references public.cases(id) on delete cascade,
  type       text not null,          -- ชนิดเหตุการณ์ ดูรายการที่ท้ายไฟล์
  at         timestamp,                      -- เวลาไทยตรง ๆ
  vendor     text,
  text       text default '',
  flag       text,
  src        text default 'entry',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- หลักฐาน (ตัวไฟล์รูปเก็บใน Storage ตารางนี้เก็บแค่รายการ)
create table if not exists public.evidence (
  id        uuid primary key default gen_random_uuid(),
  case_id   text not null references public.cases(id) on delete cascade,
  path      text,                    -- ที่อยู่ไฟล์ใน Storage
  type      text default '',         -- ชนิดหลักฐาน เช่น ใบนำออก / ภาพ GPS
  w         int,
  h         int,
  size      int,
  event_key text default '',         -- ผูกกับเหตุการณ์ไหนในไทม์ไลน์
  mail_at   text default '',         -- วันเวลาที่ปรากฏในเมล
  amount    text default '',
  descr     text default '',
  by_name   text default '',
  added_at  timestamptz not null default now()
);

-- ตั้งค่าทั่วไป มีแถวเดียว
create table if not exists public.settings (
  id         smallint primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.settings (id, data)
values (1, '{"bus":["MKM","CDC"]}'::jsonb)
on conflict (id) do nothing;

-- ─── ส่วนที่ 1.5 : อัปเกรดตารางเก่า (ถ้าเคยรันไฟล์นี้รุ่นก่อนหน้า) ───
alter table public.trucks add column if not exists roster text[] not null default '{}';
alter table public.trucks add column if not exists roster_note text default '';
alter table public.cases  add column if not exists t0fix timestamp;
alter table public.cases  add column if not exists t0why text default '';

alter table public.events drop constraint if exists events_type_check;
alter table public.events add  constraint events_type_check check (type in
  ('RECEIVE','FORWARD','FOLLOWUP','ACCEPT','REJECT','REJECT_FINAL','ESCALATE','CLOSE','NOTE'));

-- ─── ส่วนที่ 2 : ดัชนี (ทำให้ค้นเร็ว) ──────────────────────
create index if not exists cases_bu_idx      on public.cases(bu);
create index if not exists cases_carrier_idx on public.cases(carrier);
create index if not exists cases_t0_idx      on public.cases(t0 desc);
create index if not exists cases_truck_idx   on public.cases(truck);
create index if not exists events_case_idx   on public.events(case_id, at);
create index if not exists evidence_case_idx on public.evidence(case_id);
create index if not exists trucks_bu_idx     on public.trucks(bu);

-- ─── ส่วนที่ 3 : เติม BU ให้เคสอัตโนมัติ ───────────────────
-- กติกา: ดูจากทะเบียนรถก่อน ถ้าทะเบียนยังไม่ระบุ BU ให้เดาจากผู้ขนส่ง
create or replace function public.case_bu(p_truck text, p_carrier text)
returns text language sql stable as $$
  select coalesce(
    (select t.bu
       from public.trucks t
      where t.key in (
              select public.plate_key(trim(x))
                from unnest(string_to_array(coalesce(p_truck,''), '/')) as x
            )
        and t.bu is not null
      limit 1),
    case when p_carrier = 'DHL' then 'MKM' else 'CDC' end
  )
$$;

create or replace function public.set_case_bu()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.bu is null then new.bu := public.case_bu(new.truck, new.carrier); end if;
  else
    if new.truck is distinct from old.truck
       or new.carrier is distinct from old.carrier then
      new.bu := public.case_bu(new.truck, new.carrier);
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists cases_set_bu on public.cases;
create trigger cases_set_bu before insert or update on public.cases
  for each row execute function public.set_case_bu();

-- ถ้าแก้ BU ของทะเบียนรถ ให้เคสที่ใช้ทะเบียนนั้นอัปเดตตาม
create or replace function public.refresh_cases_for_truck()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.cases c
     set bu = public.case_bu(c.truck, c.carrier)
   where exists (
     select 1 from unnest(string_to_array(coalesce(c.truck,''), '/')) as x
      where public.plate_key(trim(x)) = new.key
   );
  return null;
end $$;

drop trigger if exists trucks_refresh_cases on public.trucks;
create trigger trucks_refresh_cases after insert or update of bu on public.trucks
  for each row execute function public.refresh_cases_for_truck();

-- ─── ส่วนที่ 4 : สร้างโปรไฟล์ให้ผู้ใช้ใหม่อัตโนมัติ ────────
-- คนแรกที่สมัคร = แอดมิน และเปิดใช้งานทันที
-- คนถัดไป = ผู้ใช้ทั่วไป และ "ปิด" ไว้ก่อน รอแอดมินกดเปิด
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  select count(*) into n from public.profiles;
  insert into public.profiles (id, email, display, role, bu, active)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'display',''), split_part(new.email,'@',1)),
    case when n = 0 then 'admin' else 'user' end,
    nullif(new.raw_user_meta_data->>'bu',''),
    n = 0
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── ส่วนที่ 5 : ฟังก์ชันเช็คสิทธิ์ ────────────────────────
create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role from public.profiles p
                    where p.id = auth.uid() and p.active), 'none')
$$;

create or replace function public.my_bu() returns text
language sql stable security definer set search_path = '' as $$
  select (select p.bu from public.profiles p
           where p.id = auth.uid() and p.active)
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.active)
$$;

-- เห็นเคสนี้ได้ไหม
create or replace function public.can_see_bu(p_bu text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member()
     and (public.my_role() = 'admin' or public.my_bu() is null or p_bu = public.my_bu())
$$;

-- ─── ส่วนที่ 6 : เปิดการ์ดกันข้อมูลรั่ว (RLS) ──────────────
alter table public.profiles enable row level security;
alter table public.vendors  enable row level security;
alter table public.trucks   enable row level security;
alter table public.cases    enable row level security;
alter table public.events   enable row level security;
alter table public.evidence enable row level security;
alter table public.settings enable row level security;

-- โปรไฟล์ : เห็นของตัวเอง แอดมินเห็นทุกคนและแก้ได้
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() = 'admin');

drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ทะเบียนซับ / ทะเบียนรถ : สมาชิกที่เปิดใช้งานแล้วอ่านและแก้ได้
drop policy if exists vendors_all on public.vendors;
create policy vendors_all on public.vendors for all to authenticated
  using (public.is_member()) with check (public.is_member());

drop policy if exists trucks_all on public.trucks;
create policy trucks_all on public.trucks for all to authenticated
  using (public.is_member()) with check (public.is_member());

-- เคส : เห็นเฉพาะ BU ตัวเอง (แอดมินหรือคนที่ไม่ระบุ BU เห็นหมด)
drop policy if exists cases_bu on public.cases;
create policy cases_bu on public.cases for all to authenticated
  using (public.can_see_bu(bu)) with check (public.can_see_bu(bu));

-- ไทม์ไลน์และหลักฐาน : ตามสิทธิ์ของเคสแม่
drop policy if exists events_parent on public.events;
create policy events_parent on public.events for all to authenticated
  using   (exists (select 1 from public.cases c where c.id = case_id))
  with check (exists (select 1 from public.cases c where c.id = case_id));

drop policy if exists evidence_parent on public.evidence;
create policy evidence_parent on public.evidence for all to authenticated
  using   (exists (select 1 from public.cases c where c.id = case_id))
  with check (exists (select 1 from public.cases c where c.id = case_id));

-- ตั้งค่า : ทุกคนอ่านได้ แอดมินแก้ได้
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated
  using (public.is_member());

drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ─── ส่วนที่ 7 : ให้สิทธิ์เฉพาะคนที่ล็อกอินแล้ว ────────────
-- anon (คนที่ยังไม่ล็อกอิน) ไม่ให้แตะอะไรเลย
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.vendors, public.trucks,
  public.cases, public.events, public.evidence, public.settings
  to authenticated;
grant execute on function
  public.plate_key(text), public.case_bu(text,text),
  public.my_role(), public.my_bu(), public.is_member(), public.can_see_bu(text)
  to authenticated;

revoke all on public.profiles, public.vendors, public.trucks,
              public.cases, public.events, public.evidence, public.settings
  from anon;

-- ─── ส่วนที่ 8 : เปิดอัปเดตสด ให้หลายคนเห็นตรงกันทันที ────
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.cases;
    alter publication supabase_realtime add table public.events;
  end if;
exception when duplicate_object then null;
end $$;
