interface SendPortalAccessEmailInput {
  email: string;
  password: string;
  createdBy: string;
}

const getAppUrl = () => {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` ||
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` ||
    "http://localhost:3000"
  );
};

export async function sendPortalAccessEmail({
  email,
  password,
  createdBy,
}: SendPortalAccessEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "Mass10 Portal <onboarding@resend.dev>";

  if (!apiKey) {
    return {
      sent: false,
      error: "RESEND_API_KEY is not configured.",
    };
  }

  const appUrl = getAppUrl();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Your Mass10 Research Portal access is ready",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">
          <h2 style="margin:0 0 12px">Mass10 Research Portal access confirmed</h2>
          <p>Your account has been created by ${createdBy}.</p>
          <p>You can log in here: <a href="${appUrl}">${appUrl}</a></p>
          <p><strong>Email:</strong> ${email}<br />
          <strong>Temporary password:</strong> ${password}</p>
          <p>Please keep this secure and change the password if requested by your administrator.</p>
        </div>
      `,
      text: [
        "Mass10 Research Portal access confirmed",
        "",
        `Your account has been created by ${createdBy}.`,
        `Login: ${appUrl}`,
        `Email: ${email}`,
        `Temporary password: ${password}`,
        "",
        "Please keep this secure and change the password if requested by your administrator.",
      ].join("\n"),
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      sent: false,
      error: data?.message || data?.error || `Resend returned ${response.status}.`,
    };
  }

  return {
    sent: true,
    id: data?.id as string | undefined,
  };
}
