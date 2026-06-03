import { NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  getAuthenticatedSettings,
  resolveAnthropicApiKey,
} from "@/lib/user-settings";

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

const SYSTEM_PROMPT = `You are a product researcher for Mass10, a South African IT, CCTV, and Audio/Visual store in Welkom.
Return ONLY valid JSON — no markdown, no code fences, no preamble.`;

const USER_PROMPT_TEMPLATE = `Research this product and return a JSON object with EXACTLY these fields.

SKU: {sku}
Supplier Description: {desc}

Rules for short_description:
- Comma-separated list of key features in plain text
- NO HTML, no bullet points, no newlines
- NEVER start with or include the brand name
- Every word starts with a Capital Letter EXCEPT technology terms with their own style: macOS, iOS, Wi-Fi, USB, VPN, DPI, GHz, HDMI, NVMe, PCIe, DDR5, etc.
- For product families (e.g. same antivirus range), keep feature order consistent — only change differing values

Rules for description:
- Full rich HTML product description
- Structure: opening <p> paragraph, then <h3><strong> section headings, then content <p> paragraphs, then <h4>Specifications</h4> followed by <ul><li> list of ALL specs
- Each spec list item format: Model, Brand, Series, Product Type, then all technical specs, then Compatibility items, then Color, then Warranty
- Professional, factual, no marketing fluff
- Do NOT include the brand name in the opening paragraph's first sentence

{
  "name": "Full official product name",
  "brand": "Brand/manufacturer name",
  "category": "One of: computing, audio, networking, cctv, power, storage, mobile, software, other",
  "subcategory": "Specific subcategory matching existing patterns e.g. Computing Accessories, Headset, UPS, IP Camera, Antivirus",
  "short_description": "See rules above",
  "description": "See rules above — full rich HTML",
  "warranty": "e.g. 1 Year, 2 Years, 3 Years, No Warranty",
  "shipping_class": "one of: small, medium, large, extra-large, freight",
  "weight_kg": "estimated weight as decimal number only e.g. 0.78",
  "length_cm": "estimated length as decimal number only",
  "width_cm": "estimated width as decimal number only",
  "height_cm": "estimated height as decimal number only",
  "specs": [
    {"name": "spec name", "value": "spec value"}
  ],
  "image_search_query": "best search query to find official product photos e.g. Logitech G413 SE Black mechanical keyboard official"
}`;

export async function POST(req: Request) {
  try {
    const { sku, description } = await req.json();

    if (!sku || !description) {
      return NextResponse.json(
        { error: "SKU and Description are required." },
        { status: 400 }
      );
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Please log in before using product research." },
        { status: 401 }
      );
    }

    const clientKey = req.headers.get("x-anthropic-api-key");
    let account: Awaited<ReturnType<typeof getAuthenticatedSettings>> = null;
    try {
      account = await getAuthenticatedSettings();
    } catch (settingsError) {
      console.warn("Could not load account Claude key:", settingsError);
    }
    const apiKey = resolveAnthropicApiKey(clientKey, account?.settings);

    if (!apiKey || apiKey === "your_anthropic_api_key_here") {
      return NextResponse.json(
        { error: "Claude API key is not configured. Log in and add it to Settings, or add it to local Settings/server environment." },
        { status: 401 }
      );
    }

    const prompt = USER_PROMPT_TEMPLATE
      .replace("{sku}", sku)
      .replace("{desc}", description);

    // Call the Anthropic API via direct fetch
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as {
        error?: { message?: string };
      };
      const errorMessage = errorData?.error?.message || `Anthropic API returned status ${response.status}`;
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const responseData = await response.json();
    let text = responseData?.content?.[0]?.text || "";

    // Clean markdown code fences if Claude includes them
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      const parsedData = JSON.parse(text);
      return NextResponse.json(parsedData);
    } catch {
      console.error("Failed to parse JSON response from Claude:", text);
      return NextResponse.json(
        { error: "AI returned invalid JSON. Please try again.", rawResponse: text },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("Error in research API route:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
