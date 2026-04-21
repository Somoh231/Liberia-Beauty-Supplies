-- Aggregated booking visits per CRM customer (linked customer_id OR same email on unlinked bookings).
create or replace view public.admin_customer_booking_stats as
with visit_union as (
  select c.id as customer_id, b.id as booking_id, b.starts_at
  from public.customers c
  inner join public.bookings b on b.customer_id = c.id
  union
  select c.id, b.id, b.starts_at
  from public.customers c
  inner join public.bookings b on b.customer_id is null
    and c.email is not null
    and length(trim(c.email)) > 0
    and b.customer_email is not null
    and length(trim(b.customer_email)) > 0
    and lower(trim(b.customer_email)) = lower(trim(c.email))
)
select
  customer_id,
  count(distinct booking_id)::int as visit_count,
  max(starts_at) as last_visit_at,
  min(starts_at) as first_visit_at
from visit_union
group by customer_id;

comment on view public.admin_customer_booking_stats is 'Admin CRM: distinct visits per customer (linked bookings + email-matched walk-ins).';

grant select on public.admin_customer_booking_stats to authenticated;
