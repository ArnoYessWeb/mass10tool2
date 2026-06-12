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
  Image as ImageIcon,
  Search,
  Check,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import {
  ProductPayload,
  calculatePricing,
  buildPayload,
  getCompetitorSearchUrl,
  getImageSearchUrl,
  downloadCSV,
  parseFlexibleDecimal
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
  openAiApiKey: string;
  aiProvider: "Claude" | "OpenAI";
  customSupabaseUrl: string;
  customSupabaseKey: string;
  customSupabaseTable: string;
  addToast: (message: string, type: "success" | "error" | "info") => void;
}

export default function BatchResearch({
  markup,
  supplier,
  anthropicApiKey,
  openAiApiKey,
  aiProvider,
  customSupabaseUrl,
  customSupabaseKey,
  customSupabaseTable,
  addToast
}: BatchResearchProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [pushingAll, setPushingAll] = useState(false);
  
  // States for enhanced Review & Edit modal
  const [selectedReviewItemId, setSelectedReviewItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeEditTab, setActiveEditTab] = useState<"info" | "price" | "images" | "specs">("info");
  const [pushingItemId, setPushingItemId] = useState<string | null>(null);

  // Set default selected item in review modal
  useEffect(() => {
    if (isReviewing && !selectedReviewItemId) {
      const firstItem = queue.find(item => item.payload);
      if (firstItem) {
        setSelectedReviewItemId(firstItem.id);
      }
    }
  }, [isReviewing, queue, selectedReviewItemId]);
  
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
            const cost = parseFlexibleDecimal(costStr);

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

  const handleDownloadTemplate = () => {
    const headers = ["sku", "short_description", "cost_excl_vat"];
    const csvContent = "\uFEFF" + headers.join(",") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mass10_batch_import_template.csv";
    link.click();
    URL.revokeObjectURL(url);
    addToast("Blank CSV import template downloaded.", "info");
  };

  // Batch Research Loop
  const startResearch = async () => {
    if (queue.length === 0) {
      addToast("Queue is empty. Import a CSV first.", "error");
      return;
    }
    if (!supplier.trim()) {
      addToast("Add the batch provider in the top bar before starting research.", "error");
      return;
    }

    setIsRunning(true);
    isRunningRef.current = true;
    addToast(`Batch research started for provider ${supplier.trim()}...`, "info");

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
            "x-anthropic-api-key": anthropicApiKey,
            "x-openai-api-key": openAiApiKey,
            "x-ai-provider": aiProvider
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

  const includeInQueue = (itemId: string) => {
    setQueue(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            status: "done" as const,
            reason: "Researched successfully"
          };
        }
        return item;
      })
    );
  };

  const handlePushSingle = async (itemId: string) => {
    const item = queue.find(it => it.id === itemId);
    if (!item || !item.payload) return;

    setPushingItemId(itemId);
    addToast(`Syncing SKU ${item.sku} to store...`, "info");

    try {
      const response = await fetch("/api/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          product: item.payload,
          customUrl: customSupabaseUrl,
          customKey: customSupabaseKey,
          customTable: customSupabaseTable
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to push.");
      }

      setQueue(prev =>
        prev.map(it => {
          if (it.id === itemId) {
            return {
              ...it,
              reason: "Synced ✓"
            };
          }
          return it;
        })
      );
      addToast(`Successfully synced SKU ${item.sku}!`, "success");
    } catch (err: any) {
      const errMsg = err.message || "Unknown error";
      setQueue(prev =>
        prev.map(it => {
          if (it.id === itemId) {
            return {
              ...it,
              reason: `Push Error: ${errMsg}`
            };
          }
          return it;
        })
      );
      addToast(`Sync failed for ${item.sku}: ${errMsg}`, "error");
    } finally {
      setPushingItemId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-1 fade-in h-full">
      {/* BUTTONS BAR */}
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className={`border rounded-lg px-3.5 py-2.5 flex items-center gap-2 ${
            supplier.trim()
              ? "bg-[#10b981]/10 border-[#10b981]/25 text-[#10b981]"
              : "bg-[#ef4444]/10 border-[#ef4444]/25 text-[#ef4444]"
          }`}>
            <CloudLightning className="h-3.5 w-3.5" />
            <span className="text-xs font-bold">
              Provider: {supplier.trim() || "Required"}
            </span>
          </div>

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

          <button
            onClick={handleDownloadTemplate}
            className="bg-[#1c2030] hover:bg-[#272c3f] border border-[#272c3f] text-[#8c92a4] text-xs font-semibold px-3.5 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Blank Template</span>
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
              disabled={queue.length === 0 || !supplier.trim()}
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
            CSV schema: sku | short_description | cost_excl_vat. Provider comes from the top bar.
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
      {isReviewing && (() => {
        const reviewedItems = queue.filter(item => item.payload);
        const filteredReviewedItems = reviewedItems.filter(item => {
          const q = searchQuery.toLowerCase().trim();
          if (!q) return true;
          return (
            item.sku.toLowerCase().includes(q) ||
            (item.payload?.name || "").toLowerCase().includes(q) ||
            (item.payload?.brand || "").toLowerCase().includes(q)
          );
        });

        const selectedItem = queue.find(item => item.id === selectedReviewItemId) || filteredReviewedItems[0];
        const currentItemIndex = selectedItem ? filteredReviewedItems.findIndex(it => it.id === selectedItem.id) : -1;
        const p = selectedItem?.payload;
        const isExcluded = selectedItem?.status === "skipped";
        const isSynced = selectedItem?.reason?.startsWith("Synced");

        return (
          <div className="fixed inset-0 bg-[#0b0d13]/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="glass-panel w-full max-w-6xl h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl shadow-black/60 border border-[#272c3f]">
              {/* Header */}
              <div className="bg-[#151823] px-6 py-4 border-b border-[#272c3f] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#f5a623]/10 flex items-center justify-center border border-[#f5a623]/35 shadow-sm shadow-[#f5a623]/5">
                    <Edit className="h-5 w-5 text-[#f5a623]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#e8eaf0] uppercase tracking-wider">
                      Review & Edit Products ({reviewedItems.length})
                    </h3>
                    <p className="text-[11px] text-[#8c92a4]">
                      Edit items individually, preview images, and push directly to store to verify sync behavior.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsReviewing(false);
                    setSearchQuery("");
                  }}
                  className="text-[#8c92a4] hover:text-[#e8eaf0] p-1.5 rounded-lg hover:bg-[#272c3f] transition-all cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body layout (sidebar + editor) */}
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Sidebar (320px) */}
                <div className="w-80 border-r border-[#272c3f]/50 flex flex-col bg-[#11141e]/50">
                  {/* Sidebar Search */}
                  <div className="p-4 border-b border-[#272c3f]/30">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8c92a4]" />
                      <input
                        type="text"
                        placeholder="Search SKU or Name..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-[#151823] text-xs text-[#e8eaf0] pl-9 pr-4 py-2 rounded-lg border border-[#272c3f] focus:outline-none focus:border-[#01b3fd] transition-colors"
                      />
                    </div>
                  </div>

                  {/* Sidebar Scroll List */}
                  <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
                    {filteredReviewedItems.length > 0 ? (
                      filteredReviewedItems.map(item => {
                        const itemPayload = item.payload!;
                        const isItSelected = selectedItem?.id === item.id;
                        const isItExcluded = item.status === "skipped";
                        const isItSynced = item.reason?.startsWith("Synced");

                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setSelectedReviewItemId(item.id);
                            }}
                            className={`w-full text-left p-3 rounded-xl border flex flex-col gap-1.5 transition-all cursor-pointer ${
                              isItSelected
                                ? "bg-[#01b3fd]/10 border-[#01b3fd] shadow-lg shadow-[#01b3fd]/5"
                                : "bg-[#1c2030]/20 border-[#272c3f]/50 hover:bg-[#1c2030]/40 hover:border-[#272c3f]"
                            }`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-xs font-bold text-[#e8eaf0] font-mono break-all leading-tight">
                                {item.sku}
                              </span>
                              {isItExcluded ? (
                                <span className="bg-red-500/10 text-[#ef4444] border border-red-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  Excluded
                                </span>
                              ) : isItSynced ? (
                                <span className="bg-emerald-500/10 text-[#10b981] border border-emerald-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  Synced
                                </span>
                              ) : (
                                <span className="bg-blue-500/10 text-[#01b3fd] border border-blue-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  Ready
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-[#8c92a4] truncate w-full font-medium">
                              {itemPayload.brand ? `[${itemPayload.brand}] ` : ""}{itemPayload.name || item.desc}
                            </span>
                            <div className="flex justify-between items-center text-[10px] text-[#8c92a4] font-mono">
                              <span>Cost: R {item.cost.toFixed(2)}</span>
                              <span className="text-[#e8eaf0] font-bold">R {(itemPayload.price_excl_vat || 0).toFixed(2)}</span>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="text-center p-8 text-xs text-[#8c92a4] italic">
                        No matching items found.
                      </div>
                    )}
                  </div>
                </div>

                {/* Editor Content Panel (70%) */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-[#0f111a]/40">
                  {selectedItem && p ? (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Top selected item info & actions */}
                      <div className="bg-[#151823]/50 px-6 py-4 border-b border-[#272c3f]/50 flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex flex-col gap-0.5 max-w-[50%]">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-[#01b3fd] font-mono leading-none">
                              {p.sku}
                            </span>
                            <span className="text-xs text-[#8c92a4] font-semibold italic">
                              ({p.brand || "No Brand"})
                            </span>
                          </div>
                          <span className="text-xs text-[#8c92a4] truncate w-full font-medium" title={p.name}>
                            {p.name || "Untitled Product"}
                          </span>
                        </div>

                        {/* Top quick actions */}
                        <div className="flex items-center gap-3">
                          {/* Exclude / Include toggle */}
                          {isExcluded ? (
                            <button
                              onClick={() => includeInQueue(selectedItem.id)}
                              className="text-xs text-[#10b981] hover:text-[#10b981]/80 font-bold px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Include Product</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => excludeFromQueue(selectedItem.id)}
                              className="text-xs text-[#ef4444] hover:text-[#ef4444]/80 font-bold px-3 py-1.5 rounded-lg border border-red-500/25 bg-red-500/5 hover:bg-red-500/10 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Exclude Product</span>
                            </button>
                          )}

                          {/* Search tools links */}
                          <div className="h-6 w-px bg-[#272c3f]/80"></div>

                          {/* Sync to Store Action */}
                          <button
                            onClick={() => handlePushSingle(selectedItem.id)}
                            disabled={pushingItemId === selectedItem.id || isExcluded}
                            className="bg-[#01b3fd]/10 hover:bg-[#01b3fd]/20 text-[#01b3fd] border border-[#01b3fd]/30 disabled:border-[#272c3f] disabled:bg-[#1c2030] disabled:text-[#8c92a4] text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                          >
                            {pushingItemId === selectedItem.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Syncing...</span>
                              </>
                            ) : isSynced ? (
                              <>
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Synced ✓</span>
                              </>
                            ) : (
                              <>
                                <CloudLightning className="h-3.5 w-3.5" />
                                <span>Sync to Store</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Editor Tabs bar */}
                      <div className="flex border-b border-[#272c3f]/30 px-6 bg-[#11141e]/20 shrink-0">
                        {([
                          { id: "info", label: "Product Info" },
                          { id: "price", label: "Pricing & Margin" },
                          { id: "images", label: "Images & Gallery" },
                          { id: "specs", label: "Specifications" }
                        ] as const).map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveEditTab(tab.id)}
                            className={`pb-2.5 pt-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                              activeEditTab === tab.id
                                ? "border-[#01b3fd] text-[#01b3fd]"
                                : "border-transparent text-[#8c92a4] hover:text-[#e8eaf0]"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Tab contents (Scrollable container) */}
                      <div className="flex-1 overflow-y-auto p-6">
                        {/* TAB 1: PRODUCT INFO */}
                        {activeEditTab === "info" && (
                          <div className="flex flex-col gap-4 max-w-3xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">SKU</label>
                                <input
                                  type="text"
                                  value={p.sku}
                                  onChange={e => updateModalPayload(selectedItem.id, "sku", e.target.value)}
                                  disabled={isExcluded}
                                  className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50 font-mono"
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">Brand</label>
                                <input
                                  type="text"
                                  value={p.brand}
                                  onChange={e => updateModalPayload(selectedItem.id, "brand", e.target.value)}
                                  disabled={isExcluded}
                                  className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                                />
                              </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">Product Name</label>
                              <input
                                type="text"
                                value={p.name}
                                onChange={e => updateModalPayload(selectedItem.id, "name", e.target.value)}
                                disabled={isExcluded}
                                className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">Category</label>
                                <input
                                  type="text"
                                  value={p.category}
                                  onChange={e => updateModalPayload(selectedItem.id, "category", e.target.value)}
                                  disabled={isExcluded}
                                  className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">Subcategory</label>
                                <input
                                  type="text"
                                  value={p.subcategory}
                                  onChange={e => updateModalPayload(selectedItem.id, "subcategory", e.target.value)}
                                  disabled={isExcluded}
                                  className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">Warranty</label>
                                <input
                                  type="text"
                                  value={p.warranty}
                                  onChange={e => updateModalPayload(selectedItem.id, "warranty", e.target.value)}
                                  disabled={isExcluded}
                                  className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">Shipping Class</label>
                                <input
                                  type="text"
                                  value={p.shipping_class}
                                  onChange={e => updateModalPayload(selectedItem.id, "shipping_class", e.target.value)}
                                  disabled={isExcluded}
                                  className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">Supplier</label>
                                <input
                                  type="text"
                                  value={p.supplier}
                                  onChange={e => updateModalPayload(selectedItem.id, "supplier", e.target.value)}
                                  disabled={isExcluded}
                                  className="bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                                />
                              </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">Short Description</label>
                              <textarea
                                rows={3}
                                value={p.short_description}
                                onChange={e => updateModalPayload(selectedItem.id, "short_description", e.target.value)}
                                disabled={isExcluded}
                                className="bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded-lg p-3 focus:outline-none focus:border-[#01b3fd] resize-y disabled:opacity-50"
                              />
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">Long Description</label>
                              <textarea
                                rows={5}
                                value={p.description}
                                onChange={e => updateModalPayload(selectedItem.id, "description", e.target.value)}
                                disabled={isExcluded}
                                className="bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded-lg p-3 focus:outline-none focus:border-[#01b3fd] resize-y disabled:opacity-50"
                              />
                            </div>
                          </div>
                        )}

                        {/* TAB 2: PRICING & MARGIN */}
                        {activeEditTab === "price" && (() => {
                          const costPriceExcl = p.cost_price_excl_vat || 0;
                          const sellPriceExcl = p.price_excl_vat || 0;

                          const costPriceIncl = costPriceExcl * 1.15;
                          const sellPriceIncl = sellPriceExcl * 1.15;

                          const profitExcl = sellPriceExcl - costPriceExcl;
                          const profitIncl = sellPriceIncl - costPriceIncl;

                          const actualMarkup = costPriceExcl > 0 ? (profitExcl / costPriceExcl) * 100 : 0;
                          const actualMargin = sellPriceExcl > 0 ? (profitExcl / sellPriceExcl) * 100 : 0;

                          return (
                            <div className="flex flex-col gap-6 max-w-4xl">
                              {/* Pricing Inputs */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">
                                    Cost Price (Excl VAT)
                                  </label>
                                  <div className="relative">
                                    <span className="absolute left-3.5 top-2 text-[#8c92a4] text-sm font-semibold">R</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={p.cost_price_excl_vat}
                                      onChange={e => {
                                        const costVal = parseFlexibleDecimal(e.target.value);
                                        const pricing = calculatePricing(costVal, markup);
                                        updateModalPayload(selectedItem.id, "cost_price_excl_vat", costVal);
                                        updateModalPayload(selectedItem.id, "price_excl_vat", pricing.sellExcl);
                                      }}
                                      disabled={isExcluded}
                                      className="w-full bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg pl-8 pr-4 py-2 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50 font-mono"
                                    />
                                  </div>
                                  <span className="text-[10px] text-[#8c92a4] italic font-mono">
                                    Cost Incl VAT: R {costPriceIncl.toFixed(2)}
                                  </span>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">
                                    Selling Price (Excl VAT)
                                  </label>
                                  <div className="relative">
                                    <span className="absolute left-3.5 top-2 text-[#8c92a4] text-sm font-semibold">R</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={p.price_excl_vat}
                                      onChange={e => updateModalPayload(selectedItem.id, "price_excl_vat", parseFlexibleDecimal(e.target.value))}
                                      disabled={isExcluded}
                                      className="w-full bg-[#151823] text-sm text-[#e8eaf0] border border-[#272c3f] rounded-lg pl-8 pr-4 py-2 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50 font-mono"
                                    />
                                  </div>
                                  <span className="text-[10px] text-[#8c92a4] italic font-mono">
                                    Selling Incl VAT: R {sellPriceIncl.toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              {/* Profit Stats Dashboard */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="glass-panel border border-[#272c3f]/50 p-4 rounded-xl flex flex-col gap-1">
                                  <span className="text-[10px] text-[#8c92a4] font-semibold uppercase tracking-wider">Net Profit</span>
                                  <span className="text-lg font-bold font-mono text-[#10b981]">
                                    R {profitExcl.toFixed(2)}
                                  </span>
                                </div>
                                <div className="glass-panel border border-[#272c3f]/50 p-4 rounded-xl flex flex-col gap-1">
                                  <span className="text-[10px] text-[#8c92a4] font-semibold uppercase tracking-wider">Gross Margin</span>
                                  <span className="text-lg font-bold font-mono text-[#e8eaf0]">
                                    {actualMargin.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="glass-panel border border-[#272c3f]/50 p-4 rounded-xl flex flex-col gap-1">
                                  <span className="text-[10px] text-[#8c92a4] font-semibold uppercase tracking-wider">Markup Earned</span>
                                  <span className="text-lg font-bold font-mono text-[#f5a623]">
                                    {actualMarkup.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="glass-panel border border-[#272c3f]/50 p-4 rounded-xl flex flex-col gap-1 justify-center">
                                  <button
                                    onClick={() => {
                                      const pricing = calculatePricing(costPriceExcl, markup);
                                      updateModalPayload(selectedItem.id, "price_excl_vat", pricing.sellExcl);
                                    }}
                                    disabled={isExcluded}
                                    className="w-full text-center bg-[#272c3f] hover:bg-[#21253a] border border-[#272c3f]/70 text-[#e8eaf0] text-[10px] font-bold py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                                  >
                                    Reset to Default ({markup}%)
                                  </button>
                                </div>
                              </div>

                              {/* Price check alert / note */}
                              <div className="bg-[#1c2030]/60 border border-[#272c3f]/60 rounded-xl p-4 flex gap-3.5 text-xs text-[#8c92a4]">
                                <DollarSign className="h-5 w-5 text-[#f5a623] shrink-0" />
                                <div className="flex flex-col gap-1">
                                  <span className="font-bold text-[#e8eaf0]">South African VAT is auto-calculated at 15%.</span>
                                  <span>Ensure the selling price allows for competitive positioning. Use the compare tools in the footer of this pane to double-check local vendor valuations.</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* TAB 3: IMAGES & GALLERY */}
                        {activeEditTab === "images" && (
                          <div className="flex flex-col gap-6 max-w-4xl">
                            {/* Main Image Setup */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <div className="md:col-span-2 flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">Main Image URL</label>
                                  <input
                                    type="text"
                                    value={p.image_url}
                                    onChange={e => updateModalPayload(selectedItem.id, "image_url", e.target.value)}
                                    disabled={isExcluded}
                                    className="bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 focus:outline-none focus:border-[#01b3fd] disabled:opacity-50"
                                    placeholder="https://example.com/image.jpg"
                                  />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">
                                    Gallery URLs (one per line)
                                  </label>
                                  <textarea
                                    rows={4}
                                    value={p.gallery_urls.replace(/\|/g, "\n")}
                                    onChange={e => updateModalPayload(selectedItem.id, "gallery_urls", e.target.value.split("\n").filter(Boolean).join("|"))}
                                    disabled={isExcluded}
                                    className="bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded-lg p-3 focus:outline-none focus:border-[#01b3fd] resize-y disabled:opacity-50 font-mono"
                                    placeholder="Paste additional gallery image URLs (one URL per line)..."
                                  />
                                </div>
                              </div>

                              {/* Main image preview */}
                              <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider text-center">
                                  Main Preview
                                </label>
                                <div className="aspect-square w-full rounded-xl border border-[#272c3f] overflow-hidden bg-[#151823]/40 flex items-center justify-center p-3 relative shadow-inner">
                                  {p.image_url ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                      src={p.image_url}
                                      alt="Main Preview"
                                      className="max-w-full max-h-full object-contain rounded-lg transition-transform duration-300 hover:scale-105"
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = "none";
                                      }}
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center gap-1.5 text-[#8c92a4] text-xs font-semibold">
                                      <ImageIcon className="h-8 w-8 opacity-45" />
                                      <span>No Image Set</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Gallery Preview Thumbnails */}
                            <div className="flex flex-col gap-2">
                              <label className="text-[10px] font-bold text-[#8c92a4] uppercase tracking-wider">
                                Gallery Previews
                              </label>
                              <div className="glass-panel border border-[#272c3f]/40 p-4 rounded-xl flex flex-wrap gap-3.5 min-h-[90px] bg-[#151823]/20">
                                {p.gallery_urls.split("|").filter(Boolean).length > 0 ? (
                                  p.gallery_urls.split("|").filter(Boolean).map((url, idx) => (
                                    <div
                                      key={idx}
                                      className="w-16 h-16 rounded-lg border border-[#272c3f] bg-white/5 overflow-hidden flex items-center justify-center p-1 hover:border-[#01b3fd]/50 transition-colors relative group"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={url}
                                        alt={`Gallery ${idx + 1}`}
                                        className="max-w-full max-h-full object-contain rounded"
                                      />
                                      <div className="absolute inset-0 bg-[#000]/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <button
                                          onClick={() => {
                                            const urls = p.gallery_urls.split("|").filter(Boolean);
                                            const updated = urls.filter((_, uidx) => uidx !== idx).join("|");
                                            updateModalPayload(selectedItem.id, "gallery_urls", updated);
                                          }}
                                          disabled={isExcluded}
                                          className="text-[#ef4444] hover:text-red-400 p-1 cursor-pointer"
                                          title="Remove from gallery"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-[11px] text-[#8c92a4] italic my-auto">
                                    No gallery images. Paste links on new lines inside the text area above.
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* TAB 4: SPECIFICATIONS */}
                        {activeEditTab === "specs" && (
                          <div className="flex flex-col gap-4 max-w-4xl">
                            <div className="flex justify-between items-center bg-[#151823]/60 border border-[#272c3f]/50 px-4 py-3 rounded-xl">
                              <div>
                                <span className="text-xs font-bold text-[#e8eaf0] uppercase tracking-wider block">
                                  Technical Details Table
                                </span>
                                <span className="text-[11px] text-[#8c92a4]">
                                  Configure key specifications that map directly into WooCommerce / Supabase spec grids.
                                </span>
                              </div>
                              <button
                                onClick={() => handleModalAddSpec(selectedItem.id)}
                                disabled={isExcluded}
                                className="bg-[#01b3fd]/10 hover:bg-[#01b3fd]/20 text-[#01b3fd] border border-[#01b3fd]/35 text-[11px] px-3.5 py-1.5 rounded-lg flex items-center gap-1 font-bold disabled:opacity-50 cursor-pointer transition-colors"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>Add Specification</span>
                              </button>
                            </div>

                            <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1">
                              {p._specs && p._specs.length > 0 ? (
                                p._specs.map((spec, sIdx) => (
                                  <div
                                    key={sIdx}
                                    className="flex gap-3 items-center bg-[#1c2030]/20 hover:bg-[#1c2030]/40 p-2 border border-[#272c3f]/30 rounded-lg"
                                  >
                                    <input
                                      type="text"
                                      value={spec.name}
                                      onChange={e => handleModalSpecChange(selectedItem.id, sIdx, "name", e.target.value)}
                                      placeholder="Specification Key (e.g. Resolution)"
                                      disabled={isExcluded}
                                      className="w-1/3 bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded-md px-3 py-1.5 focus:outline-none focus:border-[#01b3fd] font-semibold"
                                    />
                                    <input
                                      type="text"
                                      value={spec.value}
                                      onChange={e => handleModalSpecChange(selectedItem.id, sIdx, "value", e.target.value)}
                                      placeholder="Specification Value (e.g. 4MP (2688 x 1520))"
                                      disabled={isExcluded}
                                      className="flex-1 bg-[#151823] text-xs text-[#e8eaf0] border border-[#272c3f] rounded-md px-3 py-1.5 focus:outline-none focus:border-[#01b3fd]"
                                    />
                                    <button
                                      onClick={() => handleModalRemoveSpec(selectedItem.id, sIdx)}
                                      disabled={isExcluded}
                                      className="text-[#ef4444] hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50 cursor-pointer transition-colors"
                                      title="Delete Specification"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-10 border border-dashed border-[#272c3f] rounded-xl flex flex-col items-center gap-1 text-[#8c92a4]">
                                  <AlertOctagon className="h-6 w-6 opacity-30" />
                                  <span className="text-xs italic">No technical specs defined yet. Click &quot;Add Specification&quot; to begin.</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer bar of Editor Panel */}
                      <div className="bg-[#151823]/80 px-6 py-4 border-t border-[#272c3f] flex items-center justify-between shrink-0">
                        {/* Search tools / competitor check links */}
                        <div className="flex flex-wrap gap-4">
                          <a
                            href={getImageSearchUrl(`${p.brand || ""} ${p.name || ""} ${p.sku || ""} product photo`)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[#01b3fd] hover:text-[#1ac0ff] hover:underline flex items-center gap-1 bg-[#01b3fd]/5 border border-[#01b3fd]/15 px-3 py-1.5 rounded-lg font-semibold transition-colors"
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            <span>Verify Logo / Image on Google</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>

                          <a
                            href={getCompetitorSearchUrl(p.name || "", p.sku || "")}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[#f5a623] hover:text-[#ffb636] hover:underline flex items-center gap-1 bg-[#f5a623]/5 border border-[#f5a623]/15 px-3 py-1.5 rounded-lg font-semibold transition-colors"
                          >
                            <DollarSign className="h-3.5 w-3.5" />
                            <span>Compare Supplier Price</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>

                        {/* Navigation button panel */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[#8c92a4] font-mono mr-2">
                            Product {currentItemIndex + 1} of {filteredReviewedItems.length}
                          </span>

                          <button
                            onClick={() => {
                              if (currentItemIndex > 0) {
                                setSelectedReviewItemId(filteredReviewedItems[currentItemIndex - 1].id);
                              }
                            }}
                            disabled={currentItemIndex <= 0}
                            className="bg-[#272c3f] hover:bg-[#21253a] border border-[#272c3f] text-[#e8eaf0] disabled:bg-[#1c2030] disabled:text-[#8c92a4]/40 disabled:border-[#272c3f]/50 p-2 rounded-lg cursor-pointer transition-colors"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => {
                              if (currentItemIndex !== -1 && currentItemIndex < filteredReviewedItems.length - 1) {
                                setSelectedReviewItemId(filteredReviewedItems[currentItemIndex + 1].id);
                              }
                            }}
                            disabled={currentItemIndex === -1 || currentItemIndex === filteredReviewedItems.length - 1}
                            className="bg-[#272c3f] hover:bg-[#21253a] border border-[#272c3f] text-[#e8eaf0] disabled:bg-[#1c2030] disabled:text-[#8c92a4]/40 disabled:border-[#272c3f]/50 p-2 rounded-lg cursor-pointer transition-colors"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center gap-2">
                      <FileSpreadsheet className="h-10 w-10 text-[#8c92a4] opacity-35" />
                      <span className="text-sm font-bold text-[#e8eaf0]">No Product Selected</span>
                      <span className="text-xs text-[#8c92a4] max-w-xs">
                        Select a researched item from the sidebar queue to inspect and edit its catalog specifications.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal footer overall */}
              <div className="bg-[#151823] px-6 py-4 border-t border-[#272c3f] flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => {
                    setIsReviewing(false);
                    setSearchQuery("");
                  }}
                  className="bg-[#10b981] hover:bg-[#059669] text-white text-xs font-bold px-6 py-2.5 rounded-lg cursor-pointer transition-colors shadow-lg shadow-emerald-500/10 flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>Done - Save & Exit Review</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
