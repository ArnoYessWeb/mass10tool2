"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  FileSpreadsheet,
  Upload,
  Play,
  Square,
  Edit,
  CloudLightning,
  AlertOctagon,
  Download,
  Trash2,
  CheckCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  X,
  Plus,
  ArrowRight,
  Loader2,
  DollarSign,
  Image as ImageIcon
} from "lucide-react";
import {
  ProductPayload,
  calculatePricing,
  buildPayload,
  getCompetitorSearchUrl,
  getImageSearchUrl,
  downloadCSV
} from "@/lib/utils";

interface QueueItem {
  id: string;
  sku: string;
  desc: string;
  cost: number;
  status: "pending" | "processing" | "done" | "failed" | "skipped";
  reason: string;
  payload: ProductPayload | null;
}

interface BatchResearchProps {
  markup: number;
  supplier: string;
  anthropicApiKey: string;
  customSupabaseUrl: string;
  customSupabaseKey: string;
  customSupabaseTable: string;
  addToast: (message: string, type: "success" | "error" | "info") => void;
}

export default function BatchResearch({
  markup,
  supplier,
  anthropicApiKey,
  customSupabaseUrl,
  customSupabaseKey,
  customSupabaseTable,
  addToast
}: BatchResearchProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [pushingAll, setPushingAll] = useState(false);
  
  // Ref to track running state in async loops
  const isRunningRef = useRef(false);
  
  // Track statistics
  const totalItems = queue.length;
  const doneItems = queue.filter(item => item.status === "done").length;
  const failedItems = queue.filter(item => item.status === "failed").length;
  const pendingItems = queue.filter(item => item.status === "pending" || item.status === "processing").length;
  const progressPercent = totalItems > 0 ? Math.round(((doneItems + failedItems) / totalItems) * 100) : 0;

  // Sync pricing estimates when global markup changes
  useEffect(() => {
    if (queue.length > 0 && !isRunning) {
      setQueue(prev =>
        prev.map(item => {
          if (item.payload) {
            const pricing = calculatePricing(item.cost, markup);
            return {
              ...item,
              payload: {
                ...item.payload,
                _markup: markup,
                cost_price_excl_vat: item.cost,
                price_excl_vat: pricing.sellExcl
              }
            };
          }
          return item;
        })
      );
    }
  }, [markup]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle supplier name updates
  useEffect(() => {
    if (queue.length > 0 && !isRunning) {
      setQueue(prev =>
        prev.map(item => {
          if (item.payload) {
            return {
              ...item,
              payload: {
                ...item.payload,
                supplier
              }
            };
          }
          return item;
        })
      );
    }
  }, [supplier]); // eslint-disable-line react-hooks/exhaustive-deps

  // CSV parsing functions
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsedRows = parseCSV(text);

        if (parsedRows.length === 0) {
          addToast("No valid rows found in the CSV.", "error");
          return;
        }

        const newItems: QueueItem[] = parsedRows
          .map((row, index) => {
            const sku = row.sku || "";
            const desc = row.short_description || row.description || "";
            const costStr = row.cost_excl_vat || row.cost || row.price || "0";
            const cost = parseFloat(costStr.replace(/[^\d.]/g, "")) || 0;

            if (!sku) return null;

            return {
              id: `${Date.now()}-${index}`,
              sku: sku.trim(),
              desc: desc.trim(),
              cost,
              status: "pending" as const,
              reason: "",
              payload: null
            };
          })
          .filter(Boolean) as QueueItem[];

        setQueue(newItems);
        addToast(`Successfully loaded ${newItems.length} products to queue!`, "success");
      } catch (err: any) {
        addToast(`CSV Parse Error: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
    // Reset file input value so user can upload the same file again
    e.target.value = "";
  };

  const parseCSV = (text: string): Array<Record<string, string>> => {
    const lines: string[] = [];
    let currentLine = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      }
      if (char === "\n" && !inQuotes) {
        lines.push(currentLine);
        currentLine = "";
      } else {
        currentLine += char;
      }
    }
    if (currentLine) lines.push(currentLine);

    if (lines.length < 2) return [];

    const headers = splitCSVLine(lines[0]);
    const results: Array<Record<string, string>> = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = splitCSVLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        const cleanHeader = header.trim().toLowerCase().replace(/["\s]/g, "_");
        row[cleanHeader] = values[index] ? values[index].trim().replace(/^"|"$/g, "") : "";
      });
      results.push(row);
    }
    return results;
  };

  const splitCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let currentVal = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(currentVal);
        currentVal = "";
      } else {
        currentVal += char;
      }
    }
    result.push(currentVal);
    return result;
  };

  const handleDownloadSample = () => {
    const headers = ["sku", "short_description", "cost_excl_vat"];
    const rows = [
      ["HIK-DS2CD2143G2-I", "Hikvision 4MP AcuSense Fixed Dome Camera", "1250.00"],
      ["EATONUPS-5E1200", "Eaton 5E 1200VA USB IEC G2 UPS", "2100.00"],
      ["KL10429DCFS", "Kaspersky Plus 3 Device 1 Year", "330.00"],
      ["TP-ARCHERAX73", "TP-Link Archer AX73 AX5400 Wi-Fi 6 Router", "2400.00"],
      ["LOGI-G413SE-BLK", "Logitech G413 SE Black Mechanical Gaming Keyboard", "1129.00"]
    ];

    const csvContent = headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mass10_sample_import.csv";
    link.click();
    addToast("Sample CSV template downloaded.", "info");
  };

  // Batch Research Loop
  const startResearch = async () => {
    if (queue.length === 0) {
      addToast("Queue is empty. Import a CSV first.", "error");
      return;
    }

    setIsRunning(true);
    isRunningRef.current = true;
    addToast("Batch research started...", "info");

    const items = [...queue];

    for (let i = 0; i < items.length; i++) {
      if (!isRunningRef.current) {
        // Exclude/Stop rest
        items[i] = {
          ...items[i],
          status: "skipped" as const,
          reason: "Stopped by user"
        };
        setQueue([...items]);
        continue;
      }

      if (items[i].status === "done" && items[i].payload) {
        continue; // Skip already finished items if restarting
      }

      // Update state to processing
      items[i] = {
        ...items[i],
        status: "processing" as const,
        reason: ""
      };
      setQueue([...items]);

      try {
        const response = await fetch("/api/research", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-anthropic-api-key": anthropicApiKey
          },
          body: JSON.stringify({
            sku: items[i].sku,
            description: items[i].desc
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to research.");
        }

        const newPayload = buildPayload(
          items[i].sku,
          items[i].desc,
          items[i].cost,
          markup,
          data,
          supplier
        );

        items[i] = {
          ...items[i],
          status: "done" as const,
          reason: "Researched successfully",
          payload: newPayload
        };
      } catch (err: any) {
        console.error(err);
        items[i] = {
          ...items[i],
          status: "failed" as const,
          reason: err.message || "Failed during AI call"
        };
      }

      setQueue([...items]);

      // Throttling: Pause 3 seconds between products to avoid Anthropic rate limit (unless it is the last item)
      if (i < items.length - 1 && isRunningRef.current) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    setIsRunning(false);
    isRunningRef.current = false;
    addToast("Batch research finished!", "success");
  };

  const stopResearch = () => {
    setIsRunning(false);
    isRunningRef.current = false;
    addToast("Stopping batch queue after active item...", "info");
  };

  // Push all to Supabase sequentially
  const handlePushAll = async () => {
    const readyItems = queue.filter(item => item.status === "done" && item.payload);
    if (readyItems.length === 0) {
      addToast("No researched items ready to push.", "error");
      return;
    }

    setPushingAll(true);
    addToast(`Pushes started for ${readyItems.length} products...`, "info");

    const items = [...queue];

    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== "done" || !items[i].payload) continue;

      items[i] = {
        ...items[i],
        reason: "Pushing..."
      };
      setQueue([...items]);

      try {
        const response = await fetch("/api/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            product: items[i].payload,
            customUrl: customSupabaseUrl,
            customKey: customSupabaseKey,
            customTable: customSupabaseTable
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to push.");
        }

        items[i] = {
          ...items[i],
          reason: "Synced ✓"
        };
      } catch (err: any) {
        items[i] = {
          ...items[i],
          reason: `Push Error: ${err.message || "Unknown error"}`
        };
      }
      setQueue([...items]);
    }

    setPushingAll(false);
    addToast("Batch catalog sync finished!", "success");
  };

  // Export Bulk CSV matching Mass10 Import columns
  const handleExportCSV = () => {
    const readyItems = queue.filter(item => item.status === "done" && item.payload);
    if (readyItems.length === 0) {
      addToast("No researched items ready to export.", "error");
      return;
    }
    const payloads = readyItems.map(item => item.payload) as ProductPayload[];
    downloadCSV(payloads, `mass10_import_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}.csv`);
    addToast(`Exported CSV with ${payloads.length} products!`, "success");
  };

  // Export Errors Report CSV
  const handleExportReport = () => {
    if (queue.length === 0) return;
    const headers = ["#", "SKU", "Input Description", "Cost Price Excl", "Selling Price Excl", "Status", "Note / Error"];
    const rows = queue.map((p, index) => {
      const sellPrice = p.payload ? p.payload.price_excl_vat : (p.cost * (1 + markup / 100)).toFixed(2);
      return [
        index + 1,
        p.sku,
        p.desc,
        p.cost.toFixed(2),
        sellPrice,
        p.status.toUpperCase(),
        p.reason
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mass10_report_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}.csv`;
    link.click();
  };

  // Review Modal Helpers
  const updateModalPayload = (itemId: string, key: keyof ProductPayload, value: any) => {
    setQueue(prev =>
      prev.map(item => {
        if (item.id === itemId && item.payload) {
          return {
            ...item,
            payload: { ...item.payload, [key]: value }
          };
        }
        return item;
      })
    );
  };

  const handleModalSpecChange = (itemId: string, specIndex: number, field: "name" | "value", value: string) => {
    setQueue(prev =>
      prev.map(item => {
        if (item.id === itemId && item.payload && item.payload._specs) {
          const updatedSpecs = [...item.payload._specs];
          updatedSpecs[specIndex] = { ...updatedSpecs[specIndex], [field]: value };
          return {
            ...item,
            payload: { ...item.payload, _specs: updatedSpecs }
          };
        }
        return item;
      })
    );
  };

  const handleModalAddSpec = (itemId: string) => {
    setQueue(prev =>
      prev.map(item => {
        if (item.id === itemId && item.payload) {
          const updatedSpecs = [...(item.payload._specs || []), { name: "", value: "" }];
          return {
            ...item,
            payload: { ...item.payload, _specs: updatedSpecs }
          };
        }
        return item;
      })
    );
  };

  const handleModalRemoveSpec = (itemId: string, specIndex: number) => {
    setQueue(prev =>
      prev.map(item => {
        if (item.id === itemId && item.payload && item.payload._specs) {
          const updatedSpecs = item.payload._specs.filter((_, idx) => idx !== specIndex);
          return {
            ...item,
            payload: { ...item.payload, _specs: updatedSpecs }
          };
        }
        return item;
      })
    );
  };

  const excludeFromQueue = (itemId: string) => {
    setQueue(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            status: "skipped" as const,
            reason: "Excluded during review"
          };
        }
        return item;
      })
    );
  };

  return (
    <div className="flex flex-col gap-6 p-1 fade-in h-full">
      {/* BUTTONS BAR */}
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="bg-[#272c3f] hover:bg-[#21253a] border border-[#272c3f] text-[#e8eaf0] text-sm font-bold px-4 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors">
            <Upload className="h-4 w-4 text-[#01b3fd]" />
            <span>Import CSV</span>
            <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
          </label>

          <button
            onClick={handleDownloadSample}
            className="bg-[#1c2030] hover:bg-[#272c3f] border border-[#272c3f] text-[#8c92a4] text-xs font-semibold px-3.5 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Sample CSV</span>
          </button>

          <div className="w-px h-6 bg-[#272c3f] mx-2 hidden sm:block"></div>

          {isRunning ? (
            <button
              onClick={stopResearch}
              className="bg-[#ef4444] hover:bg-red-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-red-500/10"
            >
              <Square className="h-4 w-4 fill-white" />
              <span>Stop Research</span>
            </button>
          ) : (
            <button
              onClick={startResearch}
              disabled={queue.length === 0}
              className="bg-[#01b3fd] hover:bg-[#1ac0ff] disabled:bg-[#1c2030] disabled:text-[#8c92a4] text-black text-sm font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-[#01b3fd]/5"
            >
              <Play className="h-4 w-4 fill-black" />
              <span>Start Research</span>
            </button>
          )}

          <button
            onClick={() => setIsReviewing(true)}
            disabled={queue.filter(item => item.payload).length === 0}
            className="bg-[#f5a623] hover:bg-[#ffb636] disabled:bg-[#1c2030] disabled:text-[#8c92a4] text-black text-sm font-bold px-4 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Edit className="h-4 w-4" />
            <span>Review & Edit ({queue.filter(item => item.payload).length})</span>
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handlePushAll}
            disabled={pushingAll || queue.filter(item => item.status === "done" && item.payload).length === 0}
            className="bg-[#01b3fd] hover:bg-[#1ac0ff] disabled:bg-[#1c2030] disabled:text-[#8c92a4] text-black text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {pushingAll ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Syncing Store...</span>
              </>
            ) : (
              <>
                <CloudLightning className="h-3.5 w-3.5" />
                <span>Push All to Store</span>
              </>
            )}
          </button>

          <button
            onClick={handleExportCSV}
            disabled={queue.filter(item => item.status === "done" && item.payload).length === 0}
            className="bg-[#10b981] hover:bg-[#059669] disabled:bg-[#1c2030] disabled:text-[#8c92a4] text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportReport}
            disabled={queue.length === 0}
            className="bg-[#1c2030] hover:bg-[#272c3f] border border-[#272c3f] text-[#8c92a4] text-xs font-bold px-3.5 py-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <AlertOctagon className="h-3.5 w-3.5" />
            <span>Report</span>
          </button>
        </div>
      </div>

      {/* STATISTICS PANELS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Rows", val: totalItems, color: "text-[#e8eaf0]" },
          { label: "Pending", val: pendingItems, color: "text-[#8c92a4]" },
          { label: "Researched", val: doneItems, color: "text-[#10b981]" },
          { label: "Failed / Skipped", val: failedItems, color: "text-[#ef4444]" }
        ].map((stat, i) => (
          <div key={i} className="glass-panel rounded-xl p-4 flex flex-col gap-1.5 border border-[#272c3f]/50">
            <span className="text-xs font-semibold text-[#8c92a4]">{stat.label}</span>
            <span className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.val}</span>
          </div>
        ))}
      </div>

      {/* PROGRESS BAR */}
      {totalItems > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs text-[#8c92a4]">
            <span>Research Progress</span>
            <span className="font-semibold">{progressPercent}%</span>
          </div>
          <div className="w-full bg-[#1c2030] rounded-full h-2 overflow-hidden border border-[#272c3f]/30">
            <div
              className="bg-[#01b3fd] h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* QUEUE TABLE */}
      <div className="glass-panel rounded-2xl flex-1 flex flex-col overflow-hidden min-h-[300px]">
        <div className="px-6 py-4 border-b border-[#272c3f] flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-wider text-[#01b3fd] uppercase">
            Product Queue
          </h3>
          <span className="text-xs text-[#8c92a4] font-semibold italic">
            CSV schema: sku | short_description | cost_excl_vat
          </span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#151823] border-b border-[#272c3f] text-left text-xs font-semibold text-[#8c92a4]">
                <th className="p-3.5 text-center w-12">#</th>
                <th className="p-3.5 w-40">SKU</th>
                <th className="p-3.5 w-[300px]">Description Input</th>
                <th className="p-3.5 text-right w-32">Cost Excl</th>
                <th className="p-3.5 text-right w-32">Sell Excl</th>
                <th className="p-3.5 text-center w-36">Status</th>
                <th className="p-3.5 pl-6">Note / Errors</th>
              </tr>
            </thead>
            <tbody>
              {queue.length > 0 ? (
                queue.map((item, index) => {
                  const estSellExcl = item.payload 
                    ? item.payload.price_excl_vat 
                    : item.cost * (1 + markup / 100);

                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-[#272c3f]/30 hover:bg-[#151823]/20 text-sm transition-colors ${
                        item.status === "processing" ? "bg-[#01b3fd]/5" : ""
                      }`}
                    >
                      <td className="p-3 text-center text-[#8c92a4] font-mono">{index + 1}</td>
                      <td className="p-3 font-semibold text-[#e8eaf0] truncate max-w-[160px]" title={item.sku}>
                        {item.sku}
                      </td>
                      <td className="p-3 text-[#8c92a4] truncate max-w-[280px]" title={item.desc}>
                        {item.desc}
                      </td>
                      <td className="p-3 text-right font-mono text-[#8c92a4]">
                        R {item.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono text-[#e8eaf0]">
                        R {estSellExcl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center">
                          {item.status === "pending" && (
                            <span className="bg-[#1c2030] text-[#8c92a4] border border-[#272c3f] text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>PENDING</span>
                            </span>
                          )}
                          {item.status === "processing" && (
                            <span className="bg-[#f5a623]/10 text-[#f5a623] border border-[#f5a623]/20 text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              <span>WORKING</span>
                            </span>
                          )}
                          {item.status === "done" && (
                            <span className="bg-emerald-500/10 text-[#10b981] border border-emerald-500/20 text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              <span>DONE</span>
                            </span>
                          )}
                          {item.status === "failed" && (
                            <span className="bg-red-500/10 text-[#ef4444] border border-red-500/20 text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                              <AlertOctagon className="h-3 w-3" />
                              <span>FAILED</span>
                            </span>
                          )}
                          {item.status === "skipped" && (
                            <span className="bg-[#1c2030] text-[#8c92a4]/70 border border-[#272c3f]/50 text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                              <span>SKIPPED</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className={`p-3 pl-6 text-xs truncate max-w-[200px] ${
                          item.status === "failed" ? "text-[#ef4444]" : "text-[#8c92a4]"
                        }`}
                        title={item.reason}
                      >
                        {item.reason}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center p-16 text-[#8c92a4] text-sm italic">
                    Queue is empty. Click &quot;Import CSV&quot; above to load a supplier spreadsheet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* REVIEW & EDIT OVERLAY MODAL */}
      {isReviewing && (
        <div className="fixed inset-0 bg-[#0b0d13]/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="glass-panel w-full max-w-5xl h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl shadow-black/50">
            {/* Modal Header */}
            <div className="bg-[#151823] px-6 py-4 border-b border-[#272c3f] flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-base font-bold text-[#e8eaf0] flex items-center gap-2">
                  <Edit className="h-4 w-4 text-[#f5a623]" />
                  <span>Review Researched Products</span>
                </h3>
                <span className="text-xs text-[#8c92a4]">
                  Update details inline. Excluded products will not be included in the CSV or pushed to the store.
                </span>
              </div>
              <button
                onClick={() => setIsReviewing(false)}
                className="text-[#8c92a4] hover:text-[#e8eaf0] p-1.5 rounded-lg hover:bg-[#272c3f] transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {queue
                .filter(item => item.payload)
                .map((item) => {
                  const p = item.payload!;
                  const isExcluded = item.status === "skipped";

                  return (
                    <div
                      key={item.id}
                      className={`glass-card rounded-xl p-5 border relative overflow-hidden transition-all duration-200 ${
                        isExcluded 
                          ? "bg-red-500/5 border-red-500/20 opacity-60" 
                          : "bg-[#1c2030]/50 border-[#272c3f]"
                      }`}
                    >
                      {/* Top banner info */}
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#01b3fd] font-mono">{p.sku}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            isExcluded ? "bg-red-500/10 text-[#ef4444]" : "bg-emerald-500/10 text-[#10b981]"
                          }`}>
                            {isExcluded ? "EXCLUDED" : "READY"}
                          </span>
                        </div>

                        {!isExcluded && (
                          <button
                            onClick={() => excludeFromQueue(item.id)}
                            className="text-xs text-[#ef4444] hover:text-red-400 font-semibold px-2 py-1 rounded hover:bg-red-500/10 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Exclude Product</span>
                          </button>
                        )}
                      </div>

                      {/* Main grids */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#8c92a4] uppercase">Product Name</label>
                          <input
                            type="text"
                            value={p.name}
                            onChange={e => updateModalPayload(item.id, "name", e.target.value)}
                            disabled={isExcluded}
                            className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#8c92a4] uppercase">Brand</label>
                          <input
                            type="text"
                            value={p.brand}
                            onChange={e => updateModalPayload(item.id, "brand", e.target.value)}
                            disabled={isExcluded}
                            className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#8c92a4] uppercase">Category</label>
                          <input
                            type="text"
                            value={p.category}
                            onChange={e => updateModalPayload(item.id, "category", e.target.value)}
                            disabled={isExcluded}
                            className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#8c92a4] uppercase">Subcategory</label>
                          <input
                            type="text"
                            value={p.subcategory}
                            onChange={e => updateModalPayload(item.id, "subcategory", e.target.value)}
                            disabled={isExcluded}
                            className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                          />
                        </div>

                        {/* Details grid inline */}
                        <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 my-1">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[#8c92a4] uppercase">Warranty</label>
                            <input
                              type="text"
                              value={p.warranty}
                              onChange={e => updateModalPayload(item.id, "warranty", e.target.value)}
                              disabled={isExcluded}
                              className="bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded px-2 py-1 focus:outline-none disabled:opacity-50"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[#8c92a4] uppercase">Shipping</label>
                            <input
                              type="text"
                              value={p.shipping_class}
                              onChange={e => updateModalPayload(item.id, "shipping_class", e.target.value)}
                              disabled={isExcluded}
                              className="bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded px-2 py-1 focus:outline-none disabled:opacity-50"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[#8c92a4] uppercase">Cost Excl</label>
                            <input
                              type="number"
                              value={p.cost_price_excl_vat}
                              onChange={e => {
                                const costVal = parseFloat(e.target.value) || 0;
                                const pricing = calculatePricing(costVal, markup);
                                updateModalPayload(item.id, "cost_price_excl_vat", costVal);
                                updateModalPayload(item.id, "price_excl_vat", pricing.sellExcl);
                              }}
                              disabled={isExcluded}
                              className="bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded px-2 py-1 focus:outline-none disabled:opacity-50 font-mono"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[#8c92a4] uppercase">Selling Excl</label>
                            <input
                              type="number"
                              value={p.price_excl_vat}
                              onChange={e => updateModalPayload(item.id, "price_excl_vat", parseFloat(e.target.value) || 0)}
                              disabled={isExcluded}
                              className="bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded px-2 py-1 focus:outline-none disabled:opacity-50 font-mono"
                            />
                          </div>
                        </div>

                        {/* Short Description */}
                        <div className="md:col-span-2 flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#8c92a4] uppercase">Short Description</label>
                          <input
                            type="text"
                            value={p.short_description}
                            onChange={e => updateModalPayload(item.id, "short_description", e.target.value)}
                            disabled={isExcluded}
                            className="bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                          />
                        </div>

                        {/* Main Image URL */}
                        <div className="md:col-span-2 flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#8c92a4] uppercase">Main Image URL</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={p.image_url}
                              onChange={e => updateModalPayload(item.id, "image_url", e.target.value)}
                              disabled={isExcluded}
                              className="flex-1 bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                              placeholder="Paste main image URL..."
                            />
                            {p.image_url && (
                              <div className="w-8 h-8 rounded border border-[#272c3f] overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.image_url} alt="thumbnail" className="max-w-full max-h-full object-contain" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Gallery URLs */}
                        <div className="md:col-span-2 flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#8c92a4] uppercase">Gallery URLs (one per line)</label>
                          <textarea
                            rows={2}
                            value={p.gallery_urls.replace(/\|/g, "\n")}
                            onChange={e => updateModalPayload(item.id, "gallery_urls", e.target.value.split("\n").filter(Boolean).join("|"))}
                            disabled={isExcluded}
                            className="bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded-lg p-2 focus:outline-none focus:border-[#01b3fd] resize-none disabled:opacity-50"
                            placeholder="Paste gallery image URLs..."
                          />
                        </div>

                        {/* Specs grid */}
                        <div className="md:col-span-2 border border-[#272c3f]/50 rounded-lg p-3 bg-[#151823]/30">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-[#8c92a4] uppercase">Specifications</span>
                            <button
                              onClick={() => handleModalAddSpec(item.id)}
                              disabled={isExcluded}
                              className="text-[10px] text-[#01b3fd] hover:text-[#1ac0ff] flex items-center gap-1 font-semibold disabled:opacity-50 cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                              <span>Add Spec</span>
                            </button>
                          </div>
                          <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                            {p._specs && p._specs.length > 0 ? (
                              p._specs.map((spec, sIdx) => (
                                <div key={sIdx} className="flex gap-2 items-center">
                                  <input
                                    type="text"
                                    value={spec.name}
                                    onChange={e => handleModalSpecChange(item.id, sIdx, "name", e.target.value)}
                                    placeholder="Name"
                                    disabled={isExcluded}
                                    className="w-1/3 bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded px-2 py-1 focus:outline-none"
                                  />
                                  <input
                                    type="text"
                                    value={spec.value}
                                    onChange={e => handleModalSpecChange(item.id, sIdx, "value", e.target.value)}
                                    placeholder="Value"
                                    disabled={isExcluded}
                                    className="flex-1 bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded px-2 py-1 focus:outline-none"
                                  />
                                  <button
                                    onClick={() => handleModalRemoveSpec(item.id, sIdx)}
                                    disabled={isExcluded}
                                    className="text-[#ef4444] hover:text-red-400 p-1 rounded hover:bg-red-500/10 disabled:opacity-50 cursor-pointer"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <span className="text-[11px] text-[#8c92a4] italic text-center py-2">No specs defined.</span>
                            )}
                          </div>
                        </div>

                        {/* Search tools links */}
                        <div className="md:col-span-2 flex flex-wrap gap-4 mt-2">
                          <a
                            href={getImageSearchUrl(`${p.brand} ${p.name} ${p.sku} product photo`)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[#01b3fd] hover:underline flex items-center gap-1"
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            <span>Find images on Google</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>

                          <a
                            href={getCompetitorSearchUrl(p.name, p.sku)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[#f5a623] hover:underline flex items-center gap-1"
                          >
                            <DollarSign className="h-3.5 w-3.5" />
                            <span>Compare Pricing</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Modal Footer */}
            <div className="bg-[#151823] px-6 py-4 border-t border-[#272c3f] flex justify-end">
              <button
                onClick={() => setIsReviewing(false)}
                className="bg-[#10b981] hover:bg-[#059669] text-white text-sm font-bold px-6 py-2 rounded-lg cursor-pointer transition-colors"
              >
                Done - Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
