"use server";

import { STAFF_LOGIN_PATH } from "@/lib/auth/safe-admin-next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signOutAdmin() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(STAFF_LOGIN_PATH);
}
