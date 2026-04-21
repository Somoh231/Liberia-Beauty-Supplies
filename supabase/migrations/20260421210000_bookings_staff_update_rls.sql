-- Staff can update bookings from the admin portal (status, schedule) while authenticated.
create policy "bookings_staff_update"
  on public.bookings for update
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());
