import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Ends the request with a redirect to the login page unless the signed-in user is the admin. */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  const admin = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!email || !admin || email !== admin) {
    redirect("/admin/login");
  }
  return data.user!;
}
