-- Weekly operational log: retail + services for salon reporting.

create table if not exists public.weekly_logs (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  staff_on_duty text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_logs_week_order check (week_end >= week_start)
);

comment on table public.weekly_logs is 'One row per reporting week; header for weekly log UI.';

create unique index if not exists weekly_logs_week_start_uidx on public.weekly_logs (week_start);

create table if not exists public.weekly_log_product_lines (
  id uuid primary key default gen_random_uuid(),
  weekly_log_id uuid not null references public.weekly_logs (id) on delete cascade,
  day_date date not null,
  product_name text not null,
  inventory_item_id uuid references public.inventory_items (id) on delete set null,
  qty_sold numeric(14, 4) not null,
  unit_price_cents int not null,
  total_cents int not null,
  inventory_qty_applied numeric(14, 4) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint weekly_log_product_lines_qty_pos check (qty_sold > 0),
  constraint weekly_log_product_lines_prices_nonneg check (unit_price_cents >= 0 and total_cents >= 0),
  constraint weekly_log_product_lines_applied_nonneg check (inventory_qty_applied >= 0)
);

comment on table public.weekly_log_product_lines is 'Retail rows for weekly log; optional inventory link with ledger sync.';

create index if not exists weekly_log_product_lines_log_idx on public.weekly_log_product_lines (weekly_log_id);

create table if not exists public.weekly_log_service_lines (
  id uuid primary key default gen_random_uuid(),
  weekly_log_id uuid not null references public.weekly_logs (id) on delete cascade,
  day_date date not null,
  service_id uuid references public.services (id) on delete set null,
  service_name text not null,
  stylist_name text not null,
  client_name text not null,
  cost_cents int not null,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'mobile_money', 'card', 'other')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint weekly_log_service_lines_cost_nonneg check (cost_cents >= 0)
);

comment on table public.weekly_log_service_lines is 'Service rows for weekly log with payment method for cash-up summary.';

create index if not exists weekly_log_service_lines_log_idx on public.weekly_log_service_lines (weekly_log_id);

drop trigger if exists tr_weekly_logs_updated_at on public.weekly_logs;
create trigger tr_weekly_logs_updated_at
  before update on public.weekly_logs
  for each row
  execute function public.set_updated_at();

alter table public.weekly_logs enable row level security;
alter table public.weekly_log_product_lines enable row level security;
alter table public.weekly_log_service_lines enable row level security;

drop policy if exists "weekly_logs_staff_all" on public.weekly_logs;
create policy "weekly_logs_staff_all"
  on public.weekly_logs for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

drop policy if exists "weekly_log_product_lines_staff_all" on public.weekly_log_product_lines;
create policy "weekly_log_product_lines_staff_all"
  on public.weekly_log_product_lines for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

drop policy if exists "weekly_log_service_lines_staff_all" on public.weekly_log_service_lines;
create policy "weekly_log_service_lines_staff_all"
  on public.weekly_log_service_lines for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());
