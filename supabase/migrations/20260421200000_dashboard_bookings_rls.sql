-- Allow staff to read bookings for admin dashboard (writes still via create_booking_atomic / service role)
drop policy if exists "bookings_no_direct" on public.bookings;

create policy "bookings_staff_select"
  on public.bookings for select
  to authenticated
  using (public.is_staff_user());
