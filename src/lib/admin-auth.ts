import { cookies } from "next/headers";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";

export function getAllowedAdminEmails() {
  const configured = process.env.MASS10_ADMIN_EMAILS || "arno@yessweb.co.za";
  return configured
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedAdmin(email?: string | null) {
  if (!email) return false;
  return getAllowedAdminEmails().includes(email.toLowerCase());
}

export async function requireAdminUser() {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient(cookieStore);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || !isAllowedAdmin(user.email)) {
    return null;
  }

  return user;
}
