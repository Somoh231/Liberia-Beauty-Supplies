-- Lightweight customer fields on service_logs for repeat-client tracking (no full CRM).

alter table public.service_logs
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_facebook text;

comment on column public.service_logs.customer_name is 'Optional client name for service history lookup.';
comment on column public.service_logs.customer_phone is 'Optional client phone for service history lookup.';
comment on column public.service_logs.customer_facebook is 'Optional Facebook name or profile hint for client lookup.';

create index if not exists service_logs_customer_name_lower_idx
  on public.service_logs (lower(customer_name))
  where customer_name is not null;

create index if not exists service_logs_customer_phone_idx
  on public.service_logs (customer_phone)
  where customer_phone is not null;

create index if not exists service_logs_customer_facebook_lower_idx
  on public.service_logs (lower(customer_facebook))
  where customer_facebook is not null;
