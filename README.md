# Liberian Beauty Salon & Supplies

Next.js (App Router) + TypeScript + Tailwind CSS v4.

## Commands

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### If the site looks “unstyled” in dev (CSS/JS 404)

This usually means the dev build cache is out of sync (common after env changes, interrupted dev servers, or switching ports).

```bash
cd web
npm run dev:clean
```

Then hard refresh the browser (**Cmd+Shift+R**).

## Brand assets

Logo and salon photography live in `public/brand/` and `public/salon/` (replace files there to update the site).

## Supabase database

Full setup, table list, RLS notes, and env vars: **`supabase/README.md`**.

1. Create a Supabase project.  
2. Run SQL migrations **in order** (minimum for this repo’s `/admin` + `/book` flows):  
   - `supabase/migrations/20260419120000_booking_system.sql`  
   - `supabase/migrations/20260420100000_core_business_schema.sql`  
   - `supabase/migrations/20260421130000_admin_portal_roles.sql`  
   - `supabase/migrations/20260422133000_phase1_admin_portal_access.sql` (Phase 1 permissive portal gate + profile sync repair)  
3. Copy `web/.env.example` → `.env.local` and fill URL + keys.

Schema includes **users** (profiles linked to `auth.users`), **roles**, **customers**, **services**, **stylists**, **bookings**, **inventory_items**, **stock_movements**, **suppliers**, **sales**, **sale_items**, and **settings**.

## Booking (`/book`)

Uses **service role** server-side for the public booking flow. Service names in the first migration align with the salon menu.

### Booking emails (SMTP)

After a successful reservation, the server can email **your business inbox** (and optionally the **guest**) using **Nodemailer** + `.env.local` SMTP settings. See **`.env.example`** for `SMTP_*`, `BOOKING_NOTIFY_EMAIL`, and `BOOKING_CUSTOMER_CONFIRMATION`. If SMTP is not configured, bookings still save; emails are skipped.

**GoDaddy Workspace (common):** host `smtpout.secureserver.net`, port **465** with `SMTP_SECURE=true`, or **587** with `SMTP_SECURE=false`. Use the full email as `SMTP_USER` and the mailbox password. Templates live in `src/lib/email/templates/`.

## Routes

**Public:** `/`, `/services`, `/supplies`, `/shop` (redirects to `/supplies`), `/gallery`, `/about`, `/contact`, `/book`, `/book/success`

**Admin (Supabase Auth + cookie session):** `/admin/login`, `/admin/inventory` (and product detail / new). Requires `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the migrations that define `can_access_admin_portal()` (see `supabase/README.md` — include `20260422133000_phase1_admin_portal_access.sql` for Phase 1).

## Deployment checklist

1. Set all **`.env.example`** variables in the host (Vercel / Node) — especially `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, and **SMTP** if booking emails are required.  
2. Confirm **Supabase migrations** are applied in order (`supabase/README.md`).  
3. **Middleware** blocks `/admin/*` when Supabase env is missing (except `/admin/login` with `?error=config`).  
4. Run `npm run build` locally before shipping; smoke-test `/book`, `/book/success?booking=<uuid>`, and `/admin/inventory` after login.
