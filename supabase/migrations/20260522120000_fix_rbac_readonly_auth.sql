-- Fix: can_access_admin_portal() must not mutate during read-only transactions
-- (middleware, RSC, RLS USING clauses). Split login stamp to record_portal_login().

create or replace function public.can_access_admin_portal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role in ('owner', 'manager', 'staff')
  );
$$;

create or replace function public.record_portal_login()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.user_profiles
  set last_login_at = now()
  where id = auth.uid()
    and active = true
    and role in ('owner', 'manager', 'staff');
$$;

comment on function public.can_access_admin_portal() is
  'Read-only portal access check — no side effects.';
comment on function public.record_portal_login() is
  'Explicit sign-in only — updates last_login_at.';

revoke all on function public.can_access_admin_portal() from public;
revoke all on function public.record_portal_login() from public;
grant execute on function public.can_access_admin_portal() to authenticated;
grant execute on function public.record_portal_login() to authenticated;
