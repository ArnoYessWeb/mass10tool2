"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  Sparkles,
  Plus,
  Trash2,
  Image as ImageIcon,
  Check,
  FileSpreadsheet,
  ExternalLink,
  Eye,
  RefreshCw,
  AlertTriangle,
  Send,
  Loader2,
  DollarSign
} from "lucide-react";
import {
  calculatePricing,
  buildPayload,
  ProductPayload,
  getCompetitorSearchUrl,
  getImageSearchUrl,
  downloadCSV,
  parseFlexibleDecimal
} from "@/lib/utils";

interface SingleResearchProps {
  markup: number;
  supplier: string;
  anthropicApiKey: string;
  openAiApiKey: string;
  aiProvider: "Claude" | "OpenAI";
  customSupabaseUrl: string;
  customSupabaseKey: string;
  customSupabaseTable: string;
  addToast: (message: string, type: "success" | "error" | "info") => void;
}

export default function SingleResearch({
  markup,
  supplier,
  anthropicApiKey,
  openAiApiKey,
  aiProvider,
  customSupabaseUrl,
  customSupabaseKey,
  customSupabaseTable,
  addToast
}: SingleResearchProps) {
  // Input fields
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [costExcl, setCostExcl] = useState("");

  // UI state
  const [isResearching, setIsResearching] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"info" | "specs" | "description" | "images" | "preview">("info");
  const [pushStatus, setPushStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [pushMessage, setPushMessage] = useState("");

  // Researched payload
  const [payload, setPayload] = useState<ProductPayload | null>(null);

  // Pricing calculations for input panel
  const [prices, setPrices] = useState({
    costExcl: 0,
    costIncl: 0,
    sellExcl: 0,
    sellIncl: 0
  });

  // Keep pricing updated when cost, markup changes
  useEffect(() => {
    const cost = parseFlexibleDecimal(costExcl);
    const computed = calculatePricing(cost, markup);
    setPrices({
      costExcl: cost,
      costIncl: computed.costIncl,
      sellExcl: computed.sellExcl,
      sellIncl: computed.sellIncl
    });

    if (payload) {
      setPayload(prev => {
        if (!prev) return null;
        return {
          ...prev,
          cost_price_excl_vat: cost,
          price_excl_vat: computed.sellExcl,
          _cost_excl: cost,
          _markup: markup
        };
      });
    }
  }, [costExcl, markup, payload ? null : 1]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle supplier name updates
  useEffect(() => {
    if (payload) {
      setPayload(prev => {
        if (!prev) return null;
        return { ...prev, supplier };
      });
    }
  }, [supplier]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResearch = async () => {
    if (!sku.trim()) {
      addToast("Please enter a valid SKU.", "error");
      return;
    }
    if (!description.trim()) {
      addToast("Please enter a supplier description.", "error");
      return;
    }
    if (prices.costExcl <= 0) {
      addToast("Please enter a valid cost price.", "error");
      return;
    }

    setIsResearching(true);
    setPushStatus("idle");
    setPushMessage("");

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anthropic-api-key": anthropicApiKey,
          "x-openai-api-key": openAiApiKey,
          "x-ai-provider": aiProvider
        },
        body: JSON.stringify({ sku, description })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to research product.");
      }

      // Build payload based on researched data
      const newPayload = buildPayload(
        sku.trim(),
        description.trim(),
        prices.costExcl,
        markup,
        data,
        supplier
      );

      setPayload(newPayload);
      setActiveSubTab("info");
      addToast(`Research completed for ${sku}!`, "success");
    } catch (err: any) {
      console.error(err);
      addToast(err.message || "An error occurred during AI research.", "error");
    } finally {
      setIsResearching(false);
    }
  };

  const handlePushToStore = async () => {
    if (!payload) return;

    setPushStatus("loading");
    setPushMessage("");

    try {
      const response = await fetch("/api/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          product: payload,
          customUrl: customSupabaseUrl,
          customKey: customSupabaseKey,
          customTable: customSupabaseTable
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to push to database.");
      }

      setPushStatus("success");
      setPushMessage(data.message || "Successfully pushed to Mass10 store.");
      addToast(`Pushed ${payload.sku} to live store!`, "success");
    } catch (err: any) {
      console.error(err);
      setPushStatus("error");
      setPushMessage(err.message || "Push failed.");
      addToast(err.message || "Failed to push to database.", "error");
    }
  };

  const handleExportCSV = () => {
    if (!payload) return;
    downloadCSV([payload], `mass10_${payload.sku}.csv`);
    addToast(`CSV exported for ${payload.sku}`, "success");
  };

  const updateField = (key: keyof ProductPayload, value: any) => {
    if (!payload) return;
    setPayload(prev => {
      if (!prev) return null;
      return { ...prev, [key]: value };
    });
  };

  // Specs helpers
  const handleSpecChange = (index: number, field: "name" | "value", value: string) => {
    if (!payload || !payload._specs) return;
    const updatedSpecs = [...payload._specs];
    updatedSpecs[index] = { ...updatedSpecs[index], [field]: value };
    setPayload(prev => {
      if (!prev) return null;
      return { ...prev, _specs: updatedSpecs };
    });
  };

  const addSpecRow = () => {
    if (!payload) return;
    const updatedSpecs = [...(payload._specs || []), { name: "", value: "" }];
    setPayload(prev => {
      if (!prev) return null;
      return { ...prev, _specs: updatedSpecs };
    });
  };

  const removeSpecRow = (index: number) => {
    if (!payload || !payload._specs) return;
    const updatedSpecs = payload._specs.filter((_, i) => i !== index);
    setPayload(prev => {
      if (!prev) return null;
      return { ...prev, _specs: updatedSpecs };
    });
  };

  // Pre-generate image search query helper
  const imageSearchQuery = payload?.name 
    ? `${payload.brand || ""} ${payload.name} ${payload.sku} product photo`.trim() 
    : `${sku} product photo`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-1 fade-in">
      {/* LEFT: INPUT PANEL */}
      <div className="lg:col-span-4 flex flex-col gap-5">
        <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="text-sm font-bold tracking-wider text-[#01b3fd] uppercase">
            Product Input
          </h2>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#8c92a4]">SKU *</label>
            <input
              type="text"
              placeholder="e.g. HIK-DS2CD2143G2-I"
              value={sku}
              onChange={e => setSku(e.target.value)}
              className="w-full bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#01b3fd] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#8c92a4]">Supplier Description *</label>
            <textarea
              rows={4}
              placeholder="Paste description from supplier pricelist..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#01b3fd] transition-colors resize-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#8c92a4]">Cost Price Excl. VAT (R) *</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-[#01b3fd] font-bold text-sm">R</span>
              <input
                type="text"
                placeholder="1250.00"
                value={costExcl}
                onChange={e => setCostExcl(e.target.value)}
                className="w-full bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#01b3fd] transition-colors"
              />
            </div>
          </div>

          {/* Pricing Math Display */}
          <div className="bg-[#1c2030]/50 rounded-xl p-4 border border-[#272c3f]/50 flex flex-col gap-2">
            <div className="flex justify-between text-xs text-[#8c92a4]">
              <span>Cost Price (Incl. 15% VAT):</span>
              <span className="font-semibold text-[#10b981]">
                R {prices.costIncl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-[#e8eaf0]">Selling Price Excl. VAT:</span>
              <span className="font-bold text-[#f5a623]">
                R {prices.sellExcl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-xs text-[#8c92a4]">
              <span>Selling Price (Incl. 15% VAT):</span>
              <span>
                R {prices.sellIncl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <button
            onClick={handleResearch}
            disabled={isResearching}
            className="w-full bg-[#01b3fd] hover:bg-[#1ac0ff] disabled:bg-[#1c2030] disabled:text-[#8c92a4] text-black font-bold text-sm py-3 px-4 rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg shadow-[#01b3fd]/10"
          >
            {isResearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Researching Product...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Research Product</span>
              </>
            )}
          </button>

          {payload && (
            <button
              onClick={handleExportCSV}
              className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-sm py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Export to CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* RIGHT: RESULTS PANEL */}
      <div className="lg:col-span-8">
        {!payload && !isResearching ? (
          <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center gap-4 text-center min-h-[480px]">
            <Search className="h-16 w-16 text-[#272c3f]" />
            <div className="max-w-md">
              <h3 className="text-lg font-bold text-[#e8eaf0]">No Product Researched Yet</h3>
              <p className="text-sm text-[#8c92a4] mt-2">
                Enter a SKU, supplier description, and cost price on the left, then click <strong>Research Product</strong> to gather details with AI.
              </p>
            </div>
          </div>
        ) : isResearching ? (
          <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center gap-6 text-center min-h-[480px]">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-[#272c3f] border-t-[#01b3fd] animate-spin"></div>
              <Sparkles className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#01b3fd] h-6 w-6 animate-pulse" />
            </div>
            <div className="max-w-md">
              <h3 className="text-lg font-bold text-[#e8eaf0]">{aiProvider} is researching...</h3>
              <p className="text-sm text-[#8c92a4] mt-2 animate-pulse">
                Analyzing specification databases for SKU <strong>{sku}</strong>. Generating descriptions and classifying dimensions...
              </p>
            </div>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl flex flex-col overflow-hidden min-h-[580px]">
            {/* SUB-TABS NAVIGATION */}
            <div className="bg-[#151823] border-b border-[#272c3f] px-6 flex gap-4 overflow-x-auto scrollbar-none">
              {(["info", "specs", "description", "images", "preview"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveSubTab(tab)}
                  className={`py-4 px-2 text-sm font-semibold border-b-2 transition-all cursor-pointer capitalize whitespace-nowrap ${
                    activeSubTab === tab
                      ? "border-[#01b3fd] text-[#01b3fd]"
                      : "border-transparent text-[#8c92a4] hover:text-[#e8eaf0]"
                  }`}
                >
                  {tab === "info" ? "Product Info" : tab === "specs" ? "Specs Grid" : tab === "preview" ? "Preview & Push" : tab}
                </button>
              ))}
            </div>

            {/* TAB CONTENT PANES */}
            <div className="p-6 flex-1 flex flex-col">
              {/* TAB 1: PRODUCT INFO */}
              {activeSubTab === "info" && payload && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 fade-in">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[#8c92a4]">Product Name</label>
                    <input
                      type="text"
                      value={payload.name}
                      onChange={e => updateField("name", e.target.value)}
                      className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[#8c92a4]">Brand</label>
                    <input
                      type="text"
                      value={payload.brand}
                      onChange={e => updateField("brand", e.target.value)}
                      className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[#8c92a4]">Category</label>
                    <input
                      type="text"
                      value={payload.category}
                      onChange={e => updateField("category", e.target.value)}
                      className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[#8c92a4]">Subcategory</label>
                    <input
                      type="text"
                      value={payload.subcategory}
                      onChange={e => updateField("subcategory", e.target.value)}
                      className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[#8c92a4]">Warranty</label>
                    <input
                      type="text"
                      value={payload.warranty}
                      onChange={e => updateField("warranty", e.target.value)}
                      className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[#8c92a4]">Shipping Class</label>
                    <select
                      value={payload.shipping_class}
                      onChange={e => updateField("shipping_class", e.target.value)}
                      className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#01b3fd]"
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                      <option value="extra-large">Extra Large</option>
                      <option value="freight">Freight</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-4 gap-3 md:col-span-2 mt-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-[#8c92a4]">Weight (kg)</label>
                      <input
                        type="text"
                        value={payload.weight_kg}
                        onChange={e => updateField("weight_kg", e.target.value)}
                        className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm text-center focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-[#8c92a4]">Length (cm)</label>
                      <input
                        type="text"
                        value={payload.length_cm}
                        onChange={e => updateField("length_cm", e.target.value)}
                        className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm text-center focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-[#8c92a4]">Width (cm)</label>
                      <input
                        type="text"
                        value={payload.width_cm}
                        onChange={e => updateField("width_cm", e.target.value)}
                        className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm text-center focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-[#8c92a4]">Height (cm)</label>
                      <input
                        type="text"
                        value={payload.height_cm}
                        onChange={e => updateField("height_cm", e.target.value)}
                        className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm text-center focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SPECS GRID */}
              {activeSubTab === "specs" && payload && (
                <div className="flex-1 flex flex-col gap-4 fade-in">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-semibold text-[#8c92a4] uppercase tracking-wider">
                      Technical Specifications
                    </h3>
                    <button
                      onClick={addSpecRow}
                      className="text-xs bg-[#1c2030] hover:bg-[#272c3f] border border-[#272c3f] text-[#01b3fd] px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Spec Row</span>
                    </button>
                  </div>

                  <div className="border border-[#272c3f] rounded-xl overflow-hidden flex-1 min-h-[300px]">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-[#151823] border-b border-[#272c3f] text-left text-[#8c92a4] text-xs font-semibold">
                          <th className="p-3 w-1/3">Specification Name</th>
                          <th className="p-3 w-1/2">Specification Value</th>
                          <th className="p-3 w-12 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload._specs && payload._specs.length > 0 ? (
                          payload._specs.map((spec, i) => (
                            <tr key={i} className="border-b border-[#272c3f]/50 hover:bg-[#151823]/30">
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={spec.name}
                                  onChange={e => handleSpecChange(i, "name", e.target.value)}
                                  className="w-full bg-transparent text-[#e8eaf0] text-sm focus:outline-none border-b border-transparent focus:border-[#01b3fd]/30 px-1 py-0.5"
                                  placeholder="e.g. Resolution"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={spec.value}
                                  onChange={e => handleSpecChange(i, "value", e.target.value)}
                                  className="w-full bg-transparent text-[#e8eaf0] text-sm focus:outline-none border-b border-transparent focus:border-[#01b3fd]/30 px-1 py-0.5"
                                  placeholder="e.g. 1920x1080"
                                />
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  onClick={() => removeSpecRow(i)}
                                  className="text-[#ef4444] hover:text-red-400 p-1.5 transition-colors cursor-pointer rounded-lg hover:bg-red-500/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="text-center p-8 text-[#8c92a4] text-sm italic">
                              No specifications defined. Click &quot;Add Spec Row&quot; to begin.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: DESCRIPTION EDITING */}
              {activeSubTab === "description" && payload && (
                <div className="flex-1 flex flex-col gap-5 fade-in">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-[#8c92a4]">Short Description</label>
                      <span className="text-[10px] text-[#8c92a4] italic">Comma-separated features</span>
                    </div>
                    <input
                      type="text"
                      value={payload.short_description}
                      onChange={e => updateField("short_description", e.target.value)}
                      className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd]"
                    />
                  </div>

                  <div className="flex-1 flex flex-col md:grid md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-xs font-semibold text-[#8c92a4]">Full Description (HTML Editor)</label>
                      <textarea
                        value={payload.description}
                        onChange={e => updateField("description", e.target.value)}
                        className="w-full flex-1 bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg p-3 text-xs font-mono focus:outline-none focus:border-[#01b3fd] resize-none min-h-[300px]"
                      />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8c92a4]">
                        <Eye className="h-3.5 w-3.5" />
                        <span>Live HTML Preview</span>
                      </div>
                      <div
                        className="w-full flex-1 bg-[#151823] border border-[#272c3f] rounded-lg p-4 text-xs overflow-y-auto min-h-[300px] prose prose-invert max-w-none text-[#e8eaf0]"
                        dangerouslySetInnerHTML={{ __html: payload.description }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: IMAGES & COMPARISONS */}
              {activeSubTab === "images" && payload && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 fade-in flex-1">
                  <div className="md:col-span-8 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-[#8c92a4]">Main Image URL</label>
                      <input
                        type="text"
                        placeholder="Paste image URL ending in .jpg, .png, etc..."
                        value={payload.image_url}
                        onChange={e => updateField("image_url", e.target.value)}
                        className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd]"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-[#8c92a4]">Gallery Image URLs</label>
                        <span className="text-[10px] text-[#8c92a4] italic">One URL per line</span>
                      </div>
                      <textarea
                        rows={4}
                        placeholder="Paste gallery URLs, one per line..."
                        value={payload.gallery_urls.replace(/\|/g, "\n")}
                        onChange={e => updateField("gallery_urls", e.target.value.split("\n").filter(Boolean).join("|"))}
                        className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg p-3 text-xs focus:outline-none focus:border-[#01b3fd] resize-none"
                      />
                    </div>

                    {/* Web Search buttons */}
                    <div className="flex flex-wrap gap-3 mt-2">
                      <a
                        href={getImageSearchUrl(imageSearchQuery)}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-[#272c3f] hover:bg-[#01b3fd] hover:text-black border border-[#272c3f] text-[#e8eaf0] text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <ImageIcon className="h-4 w-4" />
                        <span>Search Google Images</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>

                      <a
                        href={getCompetitorSearchUrl(payload.name, payload.sku)}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-[#272c3f] hover:bg-[#f5a623] hover:text-black border border-[#272c3f] text-[#e8eaf0] text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <DollarSign className="h-4 w-4" />
                        <span>Compare Competitor Prices</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>

                  <div className="md:col-span-4 flex flex-col gap-4">
                    <label className="text-xs font-semibold text-[#8c92a4]">Image Previews</label>
                    <div className="flex-1 bg-[#151823] border border-[#272c3f] rounded-xl p-4 flex flex-col items-center justify-center min-h-[220px]">
                      {payload.image_url ? (
                        <div className="flex flex-col items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={payload.image_url}
                            alt="Main product"
                            className="max-h-48 rounded-lg object-contain bg-white/5 border border-[#272c3f] p-1"
                            onError={(e) => {
                              (e.target as any).src = "";
                              addToast("Invalid Main Image URL, failed to render preview.", "error");
                            }}
                          />
                          <span className="text-[10px] text-[#8c92a4] font-mono truncate max-w-[200px]">
                            {payload.image_url.split("/").pop()}
                          </span>
                        </div>
                      ) : (
                        <div className="text-center text-[#8c92a4] flex flex-col items-center gap-2">
                          <ImageIcon className="h-10 w-10 text-[#272c3f]" />
                          <span className="text-xs italic">No main image URL pasted yet</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: PREVIEW & PUSH */}
              {activeSubTab === "preview" && payload && (
                <div className="flex-1 flex flex-col gap-6 fade-in">
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-xs font-semibold text-[#8c92a4] uppercase tracking-wider">
                      Database Sync Status
                    </h3>

                    {pushStatus === "idle" && (
                      <div className="bg-[#1c2030] border border-[#272c3f] rounded-xl p-4 flex items-center gap-3 text-sm text-[#8c92a4]">
                        <AlertTriangle className="h-5 w-5 text-[#f5a623]" />
                        <span>This product is ready to be published to your database.</span>
                      </div>
                    )}

                    {pushStatus === "loading" && (
                      <div className="bg-[#1c2030]/50 border border-[#01b3fd]/30 rounded-xl p-4 flex items-center gap-3 text-sm text-[#01b3fd]">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Pushing payload directly to table &quot;{customSupabaseTable || "products"}&quot;...</span>
                      </div>
                    )}

                    {pushStatus === "success" && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3 text-sm text-[#10b981]">
                        <Check className="h-5 w-5" />
                        <div className="flex flex-col">
                          <span className="font-semibold">Successfully Pushed</span>
                          <span className="text-xs text-[#8c92a4] mt-0.5">{pushMessage}</span>
                        </div>
                      </div>
                    )}

                    {pushStatus === "error" && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3 text-sm text-[#ef4444]">
                        <AlertTriangle className="h-5 w-5" />
                        <div className="flex flex-col">
                          <span className="font-semibold">Failed to publish</span>
                          <span className="text-xs text-[#8c92a4] mt-0.5">{pushMessage}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold text-[#8c92a4] uppercase tracking-wider">
                      Actions
                    </h3>
                    <div className="flex gap-4">
                      <button
                        onClick={handlePushToStore}
                        disabled={pushStatus === "loading"}
                        className="bg-[#01b3fd] hover:bg-[#1ac0ff] disabled:bg-[#1c2030] disabled:text-[#8c92a4] text-black font-bold text-sm px-6 py-3 rounded-lg flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-[#01b3fd]/5"
                      >
                        <Send className="h-4 w-4" />
                        <span>Push Directly to Store</span>
                      </button>

                      <button
                        onClick={handleExportCSV}
                        className="bg-[#272c3f] hover:bg-[#21253a] border border-[#272c3f] text-[#e8eaf0] font-bold text-sm px-6 py-3 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        <span>Export CSV</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col gap-2">
                    <label className="text-xs font-semibold text-[#8c92a4]">CSV Export Record Draft</label>
                    <div className="w-full flex-1 bg-[#151823] border border-[#272c3f] rounded-xl p-4 text-xs font-mono overflow-y-auto max-h-[260px] text-[#8c92a4]">
                      {Object.entries(payload)
                        .filter(([k]) => !k.startsWith("_"))
                        .map(([k, v]) => (
                          <div key={k} className="flex border-b border-[#272c3f]/20 py-1 hover:bg-[#1c2030]/20">
                            <span className="w-48 text-[#01b3fd] font-medium shrink-0">{k}:</span>
                            <span className="text-[#e8eaf0] break-all">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
