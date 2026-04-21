-- -----------------------------------------------------------------------------
-- Grant admin portal access for mdonzo1998@gmail.com
-- Run in Supabase Dashboard → SQL → New query.
--
-- Prerequisites:
--   • User exists: Authentication → Users (same email).
--   • Migrations applied: core_business_schema + admin_portal_roles (RPC + roles).
--
-- Rule: can_access_admin_portal() requires public.users.is_active = true and
-- role slug in ('owner', 'manager', 'staff', 'admin'). This sets slug 'admin'.
--
-- To use another email, replace both occurrences of the address below.
-- -----------------------------------------------------------------------------

INSERT INTO public.users (id, email, display_name, role_id, is_active)
SELECT
  au.id,
  au.email,
  COALESCE(
    NULLIF(TRIM(au.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(TRIM(au.raw_user_meta_data ->> 'display_name'), ''),
    SPLIT_PART(au.email, '@', 1)
  ),
  (SELECT id FROM public.roles WHERE slug = 'admin' LIMIT 1),
  true
FROM auth.users au
WHERE lower(au.email) = lower('mdonzo1998@gmail.com')
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  role_id = (SELECT id FROM public.roles WHERE slug = 'admin' LIMIT 1),
  is_active = true,
  display_name = COALESCE(public.users.display_name, EXCLUDED.display_name);

-- If INSERT affects 0 rows: no auth user with that email — create the user in Auth first.

SELECT u.id, u.email, r.slug AS role_slug, u.is_active
FROM public.users u
JOIN public.roles r ON r.id = u.role_id
WHERE lower(u.email) = lower('mdonzo1998@gmail.com');
