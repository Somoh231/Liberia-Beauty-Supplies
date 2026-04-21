-- Liberian Beauty Salon & Supplies: booking schema + atomic create + seed
-- Run in Supabase SQL editor or via `supabase db push`

create extension if not exists "btree_gist";

-- Services offered at the salon
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_minutes int not null check (duration_minutes > 0 and duration_minutes <= 480),
  price_cents int,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Stylists
create table if not exists public.stylists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Optional: restrict which stylists perform which services.
-- If this table is empty, every active stylist can perform every service.
create table if not exists public.stylist_services (
  stylist_id uuid not null references public.stylists (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (stylist_id, service_id)
);

-- Appointments (stylist always assigned — "no preference" resolved in RPC)
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id),
  stylist_id uuid not null references public.stylists (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint bookings_time_order check (ends_at > starts_at),
  constraint bookings_exclusion exclude using gist (
    stylist_id with =,
    tstzrange (starts_at, ends_at, '[)') with &&
  )
);

create index if not exists bookings_starts_at_idx on public.bookings (starts_at);
create index if not exists bookings_stylist_idx on public.bookings (stylist_id);

alter table public.services enable row level security;
alter table public.stylists enable row level security;
alter table public.stylist_services enable row level security;
alter table public.bookings enable row level security;

-- Read-only for anon (optional — this app uses service role on server)
create policy "services_read" on public.services for select using (active = true);
create policy "stylists_read" on public.stylists for select using (active = true);
create policy "stylist_services_read" on public.stylist_services for select using (true);
create policy "bookings_no_direct" on public.bookings for all using (false);

-- Atomic booking: exclusion constraint prevents double-book per stylist/time range.
create or replace function public.create_booking_atomic (
  p_service_id uuid,
  p_stylist_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration int;
  v_ends timestamptz;
  v_booking_id uuid;
  r record;
  v_qualifies boolean;
begin
  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'invalid_input' using errcode = '22000';
  end if;
  if p_customer_phone is null or length(trim(p_customer_phone)) < 5 then
    raise exception 'invalid_input' using errcode = '22000';
  end if;
  if p_customer_email is null or length(trim(p_customer_email)) < 3 then
    raise exception 'invalid_input' using errcode = '22000';
  end if;

  select duration_minutes into v_duration
  from services
  where id = p_service_id and active = true;

  if v_duration is null then
    raise exception 'invalid_service' using errcode = '22000';
  end if;

  v_ends := p_starts_at + make_interval(mins => v_duration);

  if p_stylist_id is not null then
    select
      (
        not exists (select 1 from stylist_services)
        or exists (
          select 1
          from stylist_services ss
          where ss.stylist_id = p_stylist_id
            and ss.service_id = p_service_id
        )
      )
      and exists (select 1 from stylists s where s.id = p_stylist_id and s.active)
    into v_qualifies;

    if not coalesce(v_qualifies, false) then
      raise exception 'stylist_invalid' using errcode = '22000';
    end if;

    begin
      insert into bookings (
        service_id, stylist_id, starts_at, ends_at,
        customer_name, customer_phone, customer_email, notes
      )
      values (
        p_service_id, p_stylist_id, p_starts_at, v_ends,
        trim(p_customer_name), trim(p_customer_phone), lower(trim(p_customer_email)),
        nullif(trim(coalesce(p_notes, '')), '')
      )
      returning id into v_booking_id;
      return v_booking_id;
    exception
      when exclusion_violation then
        raise exception 'slot_unavailable' using errcode = 'P0001';
    end;
  end if;

  for r in
    select s.id
    from stylists s
    where s.active
      and (
        not exists (select 1 from stylist_services)
        or exists (
          select 1
          from stylist_services ss
          where ss.stylist_id = s.id
            and ss.service_id = p_service_id
        )
      )
    order by s.sort_order, s.id
  loop
    begin
      insert into bookings (
        service_id, stylist_id, starts_at, ends_at,
        customer_name, customer_phone, customer_email, notes
      )
      values (
        p_service_id, r.id, p_starts_at, v_ends,
        trim(p_customer_name), trim(p_customer_phone), lower(trim(p_customer_email)),
        nullif(trim(coalesce(p_notes, '')), '')
      )
      returning id into v_booking_id;
      return v_booking_id;
    exception
      when exclusion_violation then
        null;
    end;
  end loop;

  raise exception 'slot_unavailable' using errcode = 'P0001';
end;
$$;

revoke all on function public.create_booking_atomic (uuid, uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.create_booking_atomic (uuid, uuid, timestamptz, text, text, text, text) to service_role;

-- Seed (idempotent-ish: only inserts if tables empty)
insert into public.services (name, description, duration_minutes, price_cents, sort_order)
select * from (values
  ('Hair braiding & sewing', 'Cornrows, knotless braids, sew-ins, and extensions — includes consultation and scalp prep.', 180, 22000, 1),
  ('Locs care & styling', 'Retwist, maintenance, styling, and loc health check.', 90, 8500, 2),
  ('Weaving & extensions', 'Install, blend, cut, and finish for weaves and extension work.', 120, 18000, 3),
  ('Manicure & nail styling', 'Shape, cuticle care, polish or gel, and detailed nail styling.', 60, 4500, 4),
  ('Pedicure', 'Soak, shape, callus care, massage, and polish.', 60, 4000, 5),
  ('Make-up (events & shoots)', 'Soft glam to full coverage — calibrated for events and photo shoots.', 75, 12000, 6)
) as v(name, description, duration_minutes, price_cents, sort_order)
where not exists (select 1 from public.services limit 1);

insert into public.stylists (name, title, sort_order)
select * from (values
  ('Aminata K.', 'Lead stylist', 1),
  ('Fatoumata S.', 'Colour & extensions', 2),
  ('Blessing T.', 'Nails & beauty', 3)
) as v(name, title, sort_order)
where not exists (select 1 from public.stylists limit 1);

-- Map stylists to services (optional granularity)
insert into public.stylist_services (stylist_id, service_id)
select st.id, sv.id
from public.stylists st
cross join public.services sv
where st.name in ('Aminata K.', 'Fatoumata S.')
  and sv.name in (
    'Hair braiding & sewing',
    'Locs care & styling',
    'Weaving & extensions',
    'Make-up (events & shoots)'
  )
on conflict do nothing;

insert into public.stylist_services (stylist_id, service_id)
select st.id, sv.id
from public.stylists st
cross join public.services sv
where st.name = 'Blessing T.'
  and sv.name in ('Manicure & nail styling', 'Pedicure', 'Make-up (events & shoots)')
on conflict do nothing;
