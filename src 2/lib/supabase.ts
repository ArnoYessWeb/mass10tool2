import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Standard static client using server env variables
export const supabase = createClient(
  supabaseUrl || "https://placeholder-project-id.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);

/**
 * Creates or retrieves a Supabase client.
 * If custom credentials are provided (e.g. from user settings), it will initialize a custom client.
 * Otherwise, it falls back to the environment variables.
 */
export function getSupabaseClient(customUrl?: string, customKey?: string) {
  const url = customUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = customKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!url || !key || url.includes("placeholder") || key.includes("placeholder")) {
    throw new Error("Supabase is not configured. Please enter your credentials in Settings.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}
