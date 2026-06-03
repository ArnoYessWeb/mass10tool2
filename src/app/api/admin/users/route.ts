import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { createSettingsAdminClient } from "@/lib/user-settings";
import { sendPortalAccessEmail } from "@/lib/resend";

interface CreateUserInput {
  email?: string;
  password?: string;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export async function POST(req: Request) {
  try {
    const adminUser = await requireAdminUser();

    if (!adminUser?.email) {
      return NextResponse.json(
        { error: "Only the Mass10 admin can create users." },
        { status: 403 }
      );
    }

    const body = (await req.json()) as CreateUserInput;
    const email = body.email?.trim().toLowerCase() || "";
    const password = body.password || "";

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Enter a valid user email address." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const supabase = createSettingsAdminClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        created_by: adminUser.email,
      },
    });

    if (error) {
      return NextResponse.json(
        { error: `Could not create Supabase user: ${error.message}` },
        { status: 500 }
      );
    }

    const emailResult = await sendPortalAccessEmail({
      email,
      password,
      createdBy: adminUser.email,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
      },
      email: emailResult,
      message: emailResult.sent
        ? `Created ${email} and sent the access email.`
        : `Created ${email}, but the access email was not sent: ${emailResult.error}`,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Could not create user.") },
      { status: 500 }
    );
  }
}
