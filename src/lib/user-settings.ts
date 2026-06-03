import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";

export interface UserApiSettings {
  supabase_project_url?: string | null;
  supabase_api_key?: string | null;
  supabase_table?: string | null;
  anthropic_api_key?: string | null;
}

export interface AuthenticatedSettingsResult {
  userId: string;
  email?: string;
  settings: UserApiSettings | null;
}

export const USER_SETTINGS_TABLE = "mass10_user_settings";

export function createSettingsAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Account settings require NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

export async function getAuthenticatedUser() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  ) {
    return null;
  }

  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient(cookieStore);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function getAuthenticatedSettings(): Promise<AuthenticatedSettingsResult | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  ) {
    return null;
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    return null;
  }

  const adminSupabase = createSettingsAdminClient();
  const { data, error } = await adminSupabase
    .from(USER_SETTINGS_TABLE)
    .select("supabase_project_url,supabase_api_key,supabase_table,anthropic_api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Could not load account settings from "${USER_SETTINGS_TABLE}": ${error.message}`
    );
  }

  return {
    userId: user.id,
    email: user.email || undefined,
    settings: data,
  };
}

export function resolveAnthropicApiKey(
  clientKey: string | null,
  settings?: UserApiSettings | null
) {
  return (
    clientKey?.trim() ||
    settings?.anthropic_api_key?.trim() ||
    process.env.ANTHROPIC_API_KEY ||
    ""
  );
}

export function resolveSupabaseConfig(
  customUrl?: string,
  customKey?: string,
  customTable?: string,
  settings?: UserApiSettings | null
) {
  return {
    url: customUrl?.trim() || settings?.supabase_project_url?.trim() || "",
    key: customKey?.trim() || settings?.supabase_api_key?.trim() || "",
    table: customTable?.trim() || settings?.supabase_table?.trim() || "products",
  };
}
