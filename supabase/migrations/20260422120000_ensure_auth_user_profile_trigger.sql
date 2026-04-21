-- Idempotent: ensure new Auth users get a public.users profile row (default staff).
-- Fixes projects where the trigger was missing or dropped.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role_id uuid;
begin
  select r.id into staff_role_id from public.roles r where r.slug = 'staff' limit 1;

  insert into public.users (id, email, display_name, role_id)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    staff_role_id
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.users.display_name, excluded.display_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profiles on auth.users;

create trigger on_auth_user_created_profiles
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
