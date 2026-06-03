import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";
import {
  createSettingsAdminClient,
  USER_SETTINGS_TABLE,
} from "@/lib/user-settings";
import { isAllowedAdmin } from "@/lib/admin-auth";

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

interface SettingsInput {
  supabaseProjectUrl?: string;
  supabaseApiKey?: string;
  supabaseTable?: string;
  anthropicApiKey?: string;
}

async function getAuthenticatedClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  ) {
    throw new Error("Supabase auth is not configured on this deployment.");
  }

  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient(cookieStore);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null };
  }

  return { supabase, user };
}

export async function GET() {
  try {
    const { user } = await getAuthenticatedClient();

    if (!user) {
      return NextResponse.json({ user: null, settings: null });
    }

    const adminSupabase = createSettingsAdminClient();
    const { data, error } = await adminSupabase
      .from(USER_SETTINGS_TABLE)
      .select("supabase_project_url,supabase_table,supabase_api_key,anthropic_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: `Could not load account settings: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        isAdmin: isAllowedAdmin(user.email),
      },
      settings: {
        supabaseProjectUrl: data?.supabase_project_url || "",
        supabaseTable: data?.supabase_table || "products",
        hasSupabaseApiKey: !!data?.supabase_api_key,
        hasAnthropicApiKey: !!data?.anthropic_api_key,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to load account settings.") },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const { user } = await getAuthenticatedClient();

    if (!user) {
      return NextResponse.json(
        { error: "Please log in before saving account settings." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as SettingsInput;
    const payload: Record<string, string> = {
      user_id: user.id,
      supabase_project_url: body.supabaseProjectUrl?.trim() || "",
      supabase_table: body.supabaseTable?.trim() || "products",
      updated_at: new Date().toISOString(),
    };

    if (body.supabaseApiKey?.trim()) {
      payload.supabase_api_key = body.supabaseApiKey.trim();
    }

    if (body.anthropicApiKey?.trim()) {
      payload.anthropic_api_key = body.anthropicApiKey.trim();
    }

    const adminSupabase = createSettingsAdminClient();
    const { error } = await adminSupabase
      .from(USER_SETTINGS_TABLE)
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      return NextResponse.json(
        { error: `Could not save account settings: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to save account settings.") },
      { status: 500 }
    );
  }
}
