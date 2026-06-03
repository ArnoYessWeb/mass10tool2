import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { parseFlexibleDecimal } from "@/lib/utils";
import {
  getAuthenticatedUser,
  getAuthenticatedSettings,
  resolveSupabaseConfig,
} from "@/lib/user-settings";

type ProductRecord = Record<string, unknown>;

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

const readString = (value: unknown, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  return String(value) || fallback;
};

const readNumber = (value: unknown, fallback = 0) => {
  return parseFlexibleDecimal(value, fallback);
};

const readInteger = (value: unknown, fallback = 0) => {
  const parsed = parseInt(readString(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readBoolean = (value: unknown, defaultValue = false) => {
  if (typeof value === "boolean") return value;
  const text = readString(value).toUpperCase();
  if (!text) return defaultValue;
  return text === "TRUE";
};

export async function POST(req: Request) {
  try {
    const {
      product,
      customUrl,
      customKey,
      customTable,
    } = (await req.json()) as {
      product?: ProductRecord;
      customUrl?: string;
      customKey?: string;
      customTable?: string;
    };
    const productSku = readString(product?.sku);

    if (!product || !productSku) {
      return NextResponse.json(
        { error: "Product payload and SKU are required." },
        { status: 400 }
      );
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Please log in before pushing products to the store." },
        { status: 401 }
      );
    }

    let account: Awaited<ReturnType<typeof getAuthenticatedSettings>> = null;
    try {
      account = await getAuthenticatedSettings();
    } catch (settingsError) {
      console.warn("Could not load account Supabase settings:", settingsError);
    }

    const supabaseConfig = resolveSupabaseConfig(
      customUrl,
      customKey,
      customTable,
      account?.settings
    );
    const tableName = supabaseConfig.table;

    let supabaseClient;
    try {
      supabaseClient = getSupabaseClient(
        supabaseConfig.url,
        supabaseConfig.key
      );
    } catch (configError: unknown) {
      return NextResponse.json(
        { error: getErrorMessage(configError, "Supabase is not configured.") },
        { status: 400 }
      );
    }

    // Prepare the product record for writing.
    // Ensure all numeric fields are correctly formatted and JSON structures are generated.
    const record: Record<string, unknown> = {
      name: readString(product.name),
      sku: productSku,
      brand: readString(product.brand),
      category: readString(product.category),
      subcategory: readString(product.subcategory),
      supplier: readString(product.supplier),
      short_description: readString(product.short_description),
      description: readString(product.description),
      warranty: readString(product.warranty),
      price_excl_vat: readNumber(product.price_excl_vat),
      cost_price_excl_vat: readNumber(product.cost_price_excl_vat),
      sale_price_excl_vat: product.sale_price_excl_vat ? readNumber(product.sale_price_excl_vat) : null,
      promo_expires_at: product.promo_expires_at || null,
      stock_status: readString(product.stock_status, "in_stock"),
      stock_quantity: readInteger(product.stock_quantity),
      low_stock_threshold: readInteger(product.low_stock_threshold, 5),
      shipping_class: readString(product.shipping_class, "small"),
      weight_kg: product.weight_kg ? readNumber(product.weight_kg) : null,
      length_cm: product.length_cm ? readNumber(product.length_cm) : null,
      width_cm: product.width_cm ? readNumber(product.width_cm) : null,
      height_cm: product.height_cm ? readNumber(product.height_cm) : null,
      image_url: readString(product.image_url),
      gallery_urls: readString(product.gallery_urls),
      badge: readString(product.badge, "none"),
      is_featured: readBoolean(product.is_featured),
      is_hot_deal: readBoolean(product.is_hot_deal),
      is_clearance: readBoolean(product.is_clearance),
      is_refurbished: readBoolean(product.is_refurbished),
      is_on_special: readBoolean(product.is_on_special),
      is_active: readBoolean(product.is_active, true),
      product_type: readString(product.product_type, "simple"),
    };

    // If specs exist, format them into JSON configurations
    if (product._specs && Array.isArray(product._specs)) {
      record.specs_json = JSON.stringify(product._specs);
      record.spec_groups_json = JSON.stringify([
        {
          group_name: "Technical Specifications",
          specs: product._specs
        }
      ]);
    } else {
      record.specs_json = readString(product.specs_json, "[]");
      record.spec_groups_json = readString(product.spec_groups_json, "[]");
    }
    record.attributes_json = readString(product.attributes_json, "[]");

    // Perform an upsert based on SKU
    const { data, error } = await supabaseClient
      .from(tableName)
      .upsert(record, { onConflict: "sku" })
      .select();

    if (error) {
      console.error("Supabase write error:", error);
      return NextResponse.json(
        { error: `Database write failed: ${error.message} (code: ${error.code})` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Product ${productSku} successfully pushed to Table "${tableName}".`,
      data: data?.[0] || null,
    });
  } catch (error: unknown) {
    console.error("Error in push API route:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
