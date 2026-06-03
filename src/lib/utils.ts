export const VAT_RATE = 0.15;

export interface ProductPayload {
  name: string;
  sku: string;
  brand: string;
  category: string;
  subcategory: string;
  supplier: string;
  short_description: string;
  description: string;
  warranty: string;
  price_excl_vat: number;
  cost_price_excl_vat: number;
  sale_price_excl_vat: string | number;
  promo_expires_at: string;
  stock_status: string;
  stock_quantity: number | string;
  low_stock_threshold: number | string;
  shipping_class: string;
  weight_kg: string | number;
  length_cm: string | number;
  width_cm: string | number;
  height_cm: string | number;
  image_url: string;
  gallery_urls: string;
  badge: string;
  is_featured: boolean | string;
  is_hot_deal: boolean | string;
  is_clearance: boolean | string;
  is_refurbished: boolean | string;
  is_on_special: boolean | string;
  is_active: boolean | string;
  product_type: string;
  spec_groups_json?: string;
  specs_json?: string;
  attributes_json?: string;
  _specs?: Array<{ name: string; value: string }>;
  _cost_excl: number;
  _markup: number;
}

export function calculatePricing(costExcl: number, markupPct: number) {
  const costIncl = costExcl * (1 + VAT_RATE);
  const sellExcl = costExcl * (1 + markupPct / 100);
  const sellIncl = sellExcl * (1 + VAT_RATE);
  
  return {
    costExcl,
    costIncl: parseFloat(costIncl.toFixed(2)),
    sellExcl: parseFloat(sellExcl.toFixed(2)),
    sellIncl: parseFloat(sellIncl.toFixed(2))
  };
}

export function parseFlexibleDecimal(value: unknown, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return fallback;

  let normalized = raw.replace(/[^\d,.-]/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = normalized
      .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
      .replace(decimalSeparator, ".");
  } else if (lastComma !== -1) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(/,/g, "");
  }

  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildPayload(
  sku: string,
  desc: string,
  costExcl: number,
  markupPct: number,
  ai: Partial<ProductPayload> & { specs?: Array<{ name: string; value: string }> },
  supplier = ""
): ProductPayload {
  const pricing = calculatePricing(costExcl, markupPct);
  
  return {
    name: ai.name || "",
    sku: sku,
    brand: ai.brand || "",
    category: ai.category || "",
    subcategory: ai.subcategory || "",
    supplier: supplier,
    short_description: ai.short_description || "",
    description: ai.description || "",
    warranty: ai.warranty || "",
    price_excl_vat: pricing.sellExcl,
    cost_price_excl_vat: costExcl,
    sale_price_excl_vat: "",
    promo_expires_at: "",
    stock_status: "in_stock",
    stock_quantity: 0,
    low_stock_threshold: 5,
    shipping_class: ai.shipping_class || "small",
    weight_kg: ai.weight_kg || "",
    length_cm: ai.length_cm || "",
    width_cm: ai.width_cm || "",
    height_cm: ai.height_cm || "",
    image_url: "",
    gallery_urls: "",
    badge: "none",
    is_featured: false,
    is_hot_deal: false,
    is_clearance: false,
    is_refurbished: false,
    is_on_special: false,
    is_active: true,
    product_type: "simple",
    spec_groups_json: "",
    specs_json: "",
    attributes_json: "",
    _specs: ai.specs || [],
    _cost_excl: costExcl,
    _markup: markupPct
  };
}

export function getCompetitorSearchUrl(name: string, sku: string): string {
  const query = encodeURIComponent(`${name} ${sku}`);
  return `https://www.google.co.za/search?q=${query}`;
}

export function getImageSearchUrl(query: string): string {
  const q = encodeURIComponent(query);
  return `https://www.google.co.za/search?q=${q}&tbm=isch`;
}

export function downloadCSV(products: ProductPayload[], filename: string) {
  const headers = [
    "name", "sku", "brand", "category", "subcategory", "supplier",
    "short_description", "description", "warranty",
    "price_excl_vat", "cost_price_excl_vat", "sale_price_excl_vat", "promo_expires_at",
    "stock_status", "stock_quantity", "low_stock_threshold",
    "shipping_class", "weight_kg", "length_cm", "width_cm", "height_cm",
    "image_url", "gallery_urls",
    "badge", "is_featured", "is_hot_deal", "is_clearance",
    "is_refurbished", "is_on_special", "is_active", "product_type",
    "spec_groups_json", "specs_json", "attributes_json"
  ];
  
  const escapeCSV = (val: any) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = products.map(p => {
    let specGroupsStr = p.spec_groups_json || "[]";
    let specsStr = p.specs_json || "[]";
    
    if (p._specs && Array.isArray(p._specs)) {
      specsStr = JSON.stringify(p._specs);
      specGroupsStr = JSON.stringify([
        {
          group_name: "Technical Specifications",
          specs: p._specs
        }
      ]);
    }

    const record: Record<string, any> = {
      ...p,
      spec_groups_json: specGroupsStr,
      specs_json: specsStr,
      attributes_json: p.attributes_json || "[]",
      is_featured: String(p.is_featured).toUpperCase() === "TRUE" || p.is_featured === true ? "TRUE" : "FALSE",
      is_hot_deal: String(p.is_hot_deal).toUpperCase() === "TRUE" || p.is_hot_deal === true ? "TRUE" : "FALSE",
      is_clearance: String(p.is_clearance).toUpperCase() === "TRUE" || p.is_clearance === true ? "TRUE" : "FALSE",
      is_refurbished: String(p.is_refurbished).toUpperCase() === "TRUE" || p.is_refurbished === true ? "TRUE" : "FALSE",
      is_on_special: String(p.is_on_special).toUpperCase() === "TRUE" || p.is_on_special === true ? "TRUE" : "FALSE",
      is_active: String(p.is_active).toUpperCase() !== "FALSE" && p.is_active !== false ? "TRUE" : "FALSE",
    };

    return headers.map(h => escapeCSV(record[h])).join(",");
  });

  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n"); // Include UTF-8 BOM for Excel
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
