"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  Sparkles,
  Layers,
  Database,
  Key,
  Save,
  X,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Info
} from "lucide-react";
import SingleResearch from "@/components/SingleResearch";
import BatchResearch from "@/components/BatchResearch";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"single" | "batch">("single");
  const [showSettings, setShowSettings] = useState(false);

  // Global app settings
  const [markup, setMarkup] = useState<number>(10);
  const [supplier, setSupplier] = useState<string>("");
  const [anthropicApiKey, setAnthropicApiKey] = useState<string>("");
  const [supabaseUrl, setSupabaseUrl] = useState<string>("");
  const [supabaseKey, setSupabaseKey] = useState<string>("");
  const [supabaseTable, setSupabaseTable] = useState<string>("products");

  // Load settings from localStorage on mount (prevents hydration mismatch)
  useEffect(() => {
    setMarkup(parseInt(localStorage.getItem("mass10_markup") || "10") || 10);
    setSupplier(localStorage.getItem("mass10_supplier") || "");
    setAnthropicApiKey(localStorage.getItem("mass10_anthropic_key") || "");
    setSupabaseUrl(localStorage.getItem("mass10_supabase_url") || "");
    setSupabaseKey(localStorage.getItem("mass10_supabase_key") || "");
    setSupabaseTable(localStorage.getItem("mass10_supabase_table") || "products");
  }, []);

  // Save settings helpers
  const handleSaveSettings = () => {
    localStorage.setItem("mass10_markup", String(markup));
    localStorage.setItem("mass10_supplier", supplier);
    localStorage.setItem("mass10_anthropic_key", anthropicApiKey);
    localStorage.setItem("mass10_supabase_url", supabaseUrl);
    localStorage.setItem("mass10_supabase_key", supabaseKey);
    localStorage.setItem("mass10_supabase_table", supabaseTable);
    
    setShowSettings(false);
    addToast("Settings successfully saved!", "success");
  };

  // Toast Management
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = (message: string, type: "success" | "error" | "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Auto-remove toasts after 4 seconds
  useEffect(() => {
    if (toasts.length > 0) {
      const timer = setTimeout(() => {
        removeToast(toasts[0].id);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toasts]);

  // Credentials configured status checkers
  const isApiKeyConfigured = !!anthropicApiKey.trim();
  const isSupabaseConfigured = !!supabaseUrl.trim() && !!supabaseKey.trim();

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-[#0b0d13]">
      {/* HEADER BAR */}
      <header className="bg-[#151823] border-b border-[#272c3f] px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0 shadow-lg shadow-black/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#01b3fd] to-[#f5a623] flex items-center justify-center shadow-lg shadow-[#01b3fd]/10">
            <Sparkles className="h-5 w-5 text-black" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-md font-bold tracking-tight text-[#e8eaf0] flex items-center gap-1.5">
              <span>Mass10 Research Portal</span>
              <span className="bg-[#272c3f] text-[#01b3fd] text-[10px] font-bold px-1.5 py-0.5 rounded">v4.0</span>
            </h1>
            <span className="text-[11px] text-[#8c92a4]">South African IT & CCTV Store Catalog Builder</span>
          </div>
        </div>

        {/* Dynamic header options */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Markup Spinbox */}
          <div className="flex items-center gap-2 bg-[#1c2030] px-3 py-1.5 rounded-lg border border-[#272c3f]">
            <span className="text-xs text-[#8c92a4] font-semibold">Markup:</span>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setMarkup(m => Math.max(1, m - 1))}
                className="text-xs text-[#8c92a4] hover:text-[#01b3fd] p-1 font-bold transition-colors cursor-pointer"
              >
                -
              </button>
              <input 
                type="number"
                value={markup}
                onChange={e => setMarkup(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-10 bg-transparent text-center text-sm font-bold text-[#e8eaf0] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button 
                onClick={() => setMarkup(m => m + 1)}
                className="text-xs text-[#8c92a4] hover:text-[#01b3fd] p-1 font-bold transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
            <span className="text-xs text-[#8c92a4]">%</span>
          </div>

          {/* Supplier Name */}
          <div className="flex items-center gap-2 bg-[#1c2030] px-3 py-1.5 rounded-lg border border-[#272c3f]">
            <span className="text-xs text-[#8c92a4] font-semibold">Supplier:</span>
            <input
              type="text"
              placeholder="e.g. Pinnacle"
              value={supplier}
              onChange={e => setSupplier(e.target.value)}
              className="bg-transparent text-xs text-[#e8eaf0] font-semibold w-24 focus:outline-none"
            />
          </div>

          <div className="w-px h-6 bg-[#272c3f] hidden md:block"></div>

          {/* Credentials Indicators */}
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[11px] font-semibold">
              <span className={`w-2 h-2 rounded-full ${isApiKeyConfigured ? "bg-[#10b981]" : "bg-[#ef4444]"}`}></span>
              <span className={isApiKeyConfigured ? "text-[#8c92a4]" : "text-[#ef4444]"}>API Key</span>
            </span>
            <span className="flex items-center gap-1 text-[11px] font-semibold">
              <span className={`w-2 h-2 rounded-full ${isSupabaseConfigured ? "bg-[#10b981]" : "bg-[#ef4444]"}`}></span>
              <span className={isSupabaseConfigured ? "text-[#8c92a4]" : "text-[#ef4444]"}>Supabase</span>
            </span>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="bg-[#272c3f] hover:bg-[#21253a] border border-[#272c3f] text-[#e8eaf0] p-2.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer shadow-sm"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* CORE WORKSPACE TABS */}
      <main className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
        <div className="flex gap-4 border-b border-[#272c3f] shrink-0">
          <button
            onClick={() => setActiveTab("single")}
            className={`pb-3 px-1 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "single"
                ? "border-[#01b3fd] text-[#01b3fd]"
                : "border-transparent text-[#8c92a4] hover:text-[#e8eaf0]"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Single Product Research</span>
          </button>
          <button
            onClick={() => setActiveTab("batch")}
            className={`pb-3 px-1 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "batch"
                ? "border-[#01b3fd] text-[#01b3fd]"
                : "border-transparent text-[#8c92a4] hover:text-[#e8eaf0]"
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Batch CSV Import Queue</span>
          </button>
        </div>

        {/* View Switch */}
        <div className="flex-1 min-h-0">
          {activeTab === "single" ? (
            <SingleResearch
              markup={markup}
              supplier={supplier}
              anthropicApiKey={anthropicApiKey}
              customSupabaseUrl={supabaseUrl}
              customSupabaseKey={supabaseKey}
              customSupabaseTable={supabaseTable}
              addToast={addToast}
            />
          ) : (
            <BatchResearch
              markup={markup}
              supplier={supplier}
              anthropicApiKey={anthropicApiKey}
              customSupabaseUrl={supabaseUrl}
              customSupabaseKey={supabaseKey}
              customSupabaseTable={supabaseTable}
              addToast={addToast}
            />
          )}
        </div>
      </main>

      {/* SETTINGS MODAL / OVERLAY */}
      {showSettings && (
        <div className="fixed inset-0 bg-[#0b0d13]/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="glass-panel w-full max-w-lg rounded-2xl flex flex-col overflow-hidden shadow-2xl shadow-black/40">
            {/* Settings Header */}
            <div className="bg-[#151823] px-6 py-4 border-b border-[#272c3f] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#e8eaf0] flex items-center gap-2">
                <Settings className="h-4 w-4 text-[#01b3fd]" />
                <span>System Configurations</span>
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-[#8c92a4] hover:text-[#e8eaf0] p-1 rounded hover:bg-[#272c3f] transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Settings Forms */}
            <div className="p-6 flex flex-col gap-4">
              <div className="bg-[#10b981]/5 border border-[#10b981]/25 rounded-xl p-3.5 flex gap-2 text-xs text-[#8c92a4]">
                <Info className="h-4 w-4 text-[#10b981] shrink-0" />
                <span>Credentials entered below will be stored securely inside your browser&apos;s LocalStorage. They do not get saved to any server and remain 100% private to you.</span>
              </div>

              {/* Anthropic field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#8c92a4] flex items-center gap-1">
                  <Key className="h-3.5 w-3.5 text-[#01b3fd]" />
                  <span>Anthropic API Key</span>
                </label>
                <input
                  type="password"
                  placeholder="Paste sk-ant-... API Key"
                  value={anthropicApiKey}
                  onChange={e => setAnthropicApiKey(e.target.value)}
                  className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd] transition-colors"
                />
              </div>

              {/* Supabase URL field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#8c92a4] flex items-center gap-1">
                  <Database className="h-3.5 w-3.5 text-[#f5a623]" />
                  <span>Supabase Project URL</span>
                </label>
                <input
                  type="text"
                  placeholder="https://your-project.supabase.co"
                  value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd] transition-colors"
                />
              </div>

              {/* Supabase Key field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#8c92a4] flex items-center gap-1">
                  <Key className="h-3.5 w-3.5 text-[#f5a623]" />
                  <span>Supabase API Key (Anon or Service Role)</span>
                </label>
                <input
                  type="password"
                  placeholder="Paste Supabase API secret key"
                  value={supabaseKey}
                  onChange={e => setSupabaseKey(e.target.value)}
                  className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd] transition-colors"
                />
              </div>

              {/* Supabase Table name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#8c92a4] flex items-center gap-1">
                  <Database className="h-3.5 w-3.5 text-[#8c92a4]" />
                  <span>Catalog Database Table Name</span>
                </label>
                <input
                  type="text"
                  placeholder="products"
                  value={supabaseTable}
                  onChange={e => setSupabaseTable(e.target.value)}
                  className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd] transition-colors"
                />
              </div>
            </div>

            {/* Settings Footer */}
            <div className="bg-[#151823] px-6 py-4 border-t border-[#272c3f] flex justify-end gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="text-xs text-[#8c92a4] hover:text-[#e8eaf0] px-4 py-2 font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="bg-[#01b3fd] hover:bg-[#1ac0ff] text-black text-xs font-bold px-5 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Save className="h-4 w-4" />
                <span>Save Configurations</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST SYSTEM CONTAINER */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50 pointer-events-none max-w-sm w-full">
        {toasts.map(toast => (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className={`glass-panel border rounded-xl p-4 flex gap-3 shadow-lg pointer-events-auto cursor-pointer animate-fadeIn w-full ${
              toast.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-[#10b981]"
                : toast.type === "error"
                ? "border-red-500/30 bg-red-500/10 text-[#ef4444]"
                : "border-[#01b3fd]/30 bg-[#01b3fd]/10 text-[#01b3fd]"
            }`}
          >
            {toast.type === "success" && <CheckCircle2 className="h-5 w-5 shrink-0" />}
            {toast.type === "error" && <AlertCircle className="h-5 w-5 shrink-0" />}
            {toast.type === "info" && <Info className="h-5 w-5 shrink-0" />}
            <span className="text-xs font-medium text-[#e8eaf0]">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
