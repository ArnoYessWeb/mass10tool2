import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { product, customUrl, customKey, customTable } = await req.json();

    if (!product || !product.sku) {
      return NextResponse.json(
        { error: "Product payload and SKU are required." },
        { status: 400 }
      );
    }

    const tableName = customTable || "products";

    let supabaseClient;
    try {
      supabaseClient = getSupabaseClient(customUrl, customKey);
    } catch (configError: any) {
      return NextResponse.json({ error: configError.message }, { status: 400 });
    }

    // Prepare the product record for writing.
    // Ensure all numeric fields are correctly formatted and JSON structures are generated.
    const record: Record<string, any> = {
      name: product.name || "",
      sku: product.sku,
      brand: product.brand || "",
      category: product.category || "",
      subcategory: product.subcategory || "",
      supplier: product.supplier || "",
      short_description: product.short_description || "",
      description: product.description || "",
      warranty: product.warranty || "",
      price_excl_vat: parseFloat(product.price_excl_vat) || 0,
      cost_price_excl_vat: parseFloat(product.cost_price_excl_vat) || 0,
      sale_price_excl_vat: product.sale_price_excl_vat ? parseFloat(product.sale_price_excl_vat) : null,
      promo_expires_at: product.promo_expires_at || null,
      stock_status: product.stock_status || "in_stock",
      stock_quantity: parseInt(product.stock_quantity) || 0,
      low_stock_threshold: parseInt(product.low_stock_threshold) || 5,
      shipping_class: product.shipping_class || "small",
      weight_kg: product.weight_kg ? parseFloat(product.weight_kg) : null,
      length_cm: product.length_cm ? parseFloat(product.length_cm) : null,
      width_cm: product.width_cm ? parseFloat(product.width_cm) : null,
      height_cm: product.height_cm ? parseFloat(product.height_cm) : null,
      image_url: product.image_url || "",
      gallery_urls: product.gallery_urls || "",
      badge: product.badge || "none",
      is_featured: String(product.is_featured).toUpperCase() === "TRUE",
      is_hot_deal: String(product.is_hot_deal).toUpperCase() === "TRUE",
      is_clearance: String(product.is_clearance).toUpperCase() === "TRUE",
      is_refurbished: String(product.is_refurbished).toUpperCase() === "TRUE",
      is_on_special: String(product.is_on_special).toUpperCase() === "TRUE",
      is_active: String(product.is_active).toUpperCase() !== "FALSE",
      product_type: product.product_type || "simple",
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
      record.specs_json = product.specs_json || "[]";
      record.spec_groups_json = product.spec_groups_json || "[]";
    }
    record.attributes_json = product.attributes_json || "[]";

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
      message: `Product ${product.sku} successfully pushed to Table "${tableName}".`,
      data: data?.[0] || null,
    });
  } catch (error: any) {
    console.error("Error in push API route:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
