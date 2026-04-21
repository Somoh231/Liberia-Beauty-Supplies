# Supabase backend — Liberian Beauty Salon & Supplies

This folder holds **PostgreSQL migrations** for your Supabase project. Together they define:

- **Auth-linked staff:** `roles`, `users` (1:1 with `auth.users`)
- **CRM / POS:** `customers`, `suppliers`, `inventory_items`, `stock_movements`, `sales`, `sale_items`
- **Salon:** `services`, `stylists`, `stylist_services`, `bookings` (from the first migration) plus extensions from the second
- **Config:** `settings`

## Migration order

Run **in this order** (filenames are timestamp-prefixed):

1. `migrations/20260419120000_booking_system.sql` — `btree_gist`, services/stylists/bookings, `create_booking_atomic`, seed data  
2. `migrations/20260420100000_core_business_schema.sql` — roles, users, customers, inventory, sales, settings, RLS, auth trigger  
3. `migrations/20260421130000_admin_portal_roles.sql` — `owner` role, `can_access_admin_portal()` RPC, RLS tweaks for `/admin`  
4. `migrations/20260422133000_phase1_admin_portal_access.sql` — **Phase 1 repair:** permissive `can_access_admin_portal()` (auto-creates missing `public.users` on first RPC) + stronger `auth.users` → `public.users` sync (insert/update + backfill)  
5. `migrations/20260421200000_dashboard_bookings_rls.sql` — staff **SELECT** on `bookings` for the admin dashboard (writes still via RPC / service role)  
6. `migrations/20260421210000_bookings_staff_update_rls.sql` — staff **UPDATE** on `bookings` for `/admin/bookings` (status changes, reschedule)  
7. `migrations/20260421220000_admin_customer_booking_stats_view.sql` — `admin_customer_booking_stats` view for CRM visit counts (linked + email-matched walk-ins)  
8. `migrations/20260421230000_inventory_platform.sql` — `inventory_categories`, product `category_id`, `selling_price_cents`, optional `expiry_date` for `/admin/inventory`  
9. `migrations/20260421240000_pos_create_sale_rpc.sql` — **`create_pos_sale`** RPC: atomic POS checkout (sale + lines + stock) for `/admin/sales`

On a **brand-new** Supabase project: paste each file into **SQL Editor → New query → Run** (or use [Supabase CLI](https://supabase.com/docs/guides/cli) `supabase db push` with a linked project).

If you already ran only the first migration, run **only** the second file next.

## Environment variables (Next.js app)

Create `web/.env.local` (never commit it):

| Variable | Where to find it | Used for |
|----------|------------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project **Settings → API → Project URL** | Browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Settings → API → anon public** | Client-side Supabase (auth, RLS-safe queries) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Settings → API → service_role** (secret) | **Server only** — bypasses RLS; booking server actions, admin jobs |

Booking notification email (SMTP) is configured in the **Next.js** app — see `web/.env.example` and `web/README.md` (`SMTP_*`, `BOOKING_NOTIFY_EMAIL`).

**Admin portal (`/admin`)** uses the **anon** key with **cookie sessions** (`NEXT_PUBLIC_SUPABASE_ANON_KEY` + SSR). Enable **Email** auth under **Authentication → Providers**, create users there, then assign `owner`, `manager`, or `staff` in `public.users.role_id` (see below).

Optional:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_JWT_SECRET` | Only if you verify JWTs outside Supabase helpers |
| Direct Postgres URL | **Settings → Database** connection string — local tools, `psql`, ETL |

**Security:** Never expose `SUPABASE_SERVICE_ROLE_KEY` or the database password in client code, Git, or screenshots.

## Entity relationships (summary)

- `auth.users` → `public.users` (trigger on signup) → optional `role_id` → `roles`
- `customers` → optional `user_id` → `users`
- `bookings` → `services`, `stylists`, optional `customer_id` → `customers`
- `inventory_items` → optional `supplier_id` → `suppliers`
- `stock_movements` → `inventory_items` (trigger updates `quantity_on_hand`)
- `sales` → optional `customer_id`, `created_by` → `users`
- `sale_items` → `sales`, optional `inventory_item_id` → `inventory_items`
- `stylists` → optional `user_id` → `users` (link stylist profile to login)

## First owner / manager / staff

1. **Authentication → Users → Add user** (or invite) with email + password.  
2. That creates `auth.users` and, via trigger, a row in **`public.users`** (default **`staff`** — allowed into `/admin`).  
3. If the profile row is missing or you want **Administrator** (`admin` slug), run **`scripts/grant-admin-portal-access-by-email.sql`** (edit the email if needed) in the SQL Editor.  
4. Promote the business owner instead:

```sql
update public.users u
set role_id = (select id from public.roles where slug = 'owner' limit 1)
where u.email = 'you@yourdomain.com';
```

Portal access is enforced by **`can_access_admin_portal()`**.

- **Baseline / role-based (stricter):** `20260421130000_admin_portal_roles.sql` ties access to `public.users` + `roles`.
- **Phase 1 (permissive repair):** `20260422133000_phase1_admin_portal_access.sql` temporarily allows **any signed-in user** into `/admin` and will **create a missing `public.users` row** the first time the RPC runs, so middleware/login checks don’t deadlock on profile setup.

Stylists and **readonly** should be blocked again when you tighten the function for production.

**Trigger repair:** migration **`20260422120000_ensure_auth_user_profile_trigger.sql`** re-applies `handle_new_auth_user` + `on_auth_user_created_profiles` so new Auth signups always get `public.users`.

## RLS summary

- **Authenticated** staff (`admin`, `manager`, `staff`, `stylist`) can use CRUD policies on customers, suppliers, inventory, stock movements, and sales (see migration).
- **`public.users`:** each user can read/update **self**; **admins** can manage all rows.
- **`service_role`** (server key) **bypasses RLS** — used by your existing `/book` server actions for public booking.

## Inventory ledger

Inserting a row into `stock_movements` **after insert** runs `apply_stock_movement()`, which:

1. Locks the parent `inventory_items` row  
2. Ensures `quantity_on_hand + quantity_change >= 0`  
3. Updates `quantity_on_hand`  

POS flows should insert `sales` / `sale_items` and then insert matching `stock_movements` with `reason = 'sale'` (negative `quantity_change`) when you wire deductions.

## Regenerating types (optional)

```bash
npx supabase gen types typescript --project-id YOUR_REF > src/types/database.ts
```

(Requires Supabase CLI and login.)
