"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Settings,
  Sparkles,
  Layers,
  Database,
  Key,
  LogIn,
  LogOut,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  Info,
  UserCircle
} from "lucide-react";
import SingleResearch from "@/components/SingleResearch";
import BatchResearch from "@/components/BatchResearch";
import { createClient } from "@/utils/supabase/client";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface AccountSettings {
  supabaseProjectUrl: string;
  supabaseTable: string;
  hasSupabaseApiKey: boolean;
  hasAnthropicApiKey: boolean;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

const getStoredProviders = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem("mass10_providers") || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const DEFAULT_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"single" | "batch">("single");
  const [showSettings, setShowSettings] = useState(false);

  // Global app settings
  const [markup, setMarkup] = useState<number>(10);
  const [supplier, setSupplier] = useState<string>("");
  const [anthropicApiKey, setAnthropicApiKey] = useState<string>("");
  const [supabaseUrl, setSupabaseUrl] = useState<string>(DEFAULT_SUPABASE_URL);
  const [supabaseKey, setSupabaseKey] = useState<string>("");
  const [supabaseTable, setSupabaseTable] = useState<string>("products");
  const [accountEmail, setAccountEmail] = useState<string>("");
  const [authEmail, setAuthEmail] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [accountSettings, setAccountSettings] = useState<AccountSettings | null>(null);
  const [savedProviders, setSavedProviders] = useState<string[]>([]);

  const hasSupabaseAuthConfig =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

  // Toast Management
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((message: string, type: "success" | "error" | "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMarkup(parseInt(localStorage.getItem("mass10_markup") || "10") || 10);
      setSupplier(localStorage.getItem("mass10_supplier") || "");
      setSavedProviders(getStoredProviders());
      setAnthropicApiKey(localStorage.getItem("mass10_anthropic_key") || "");
      setSupabaseUrl(localStorage.getItem("mass10_supabase_url") || DEFAULT_SUPABASE_URL);
      setSupabaseKey("");
      setSupabaseTable(localStorage.getItem("mass10_supabase_table") || "products");
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const loadAccountSettings = async () => {
    const response = await fetch("/api/settings");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load account settings.");
    }

    if (!data.user) {
      setAccountEmail("");
      setAccountSettings(null);
      return;
    }

    setAccountEmail(data.user.email || "");
    setAccountSettings(data.settings || null);

    if (data.settings?.supabaseProjectUrl) {
      setSupabaseUrl(data.settings.supabaseProjectUrl);
    }
    if (data.settings?.supabaseTable) {
      setSupabaseTable(data.settings.supabaseTable);
    }
  };

  useEffect(() => {
    if (!hasSupabaseAuthConfig) {
      window.setTimeout(() => setIsAuthChecking(false), 0);
      return;
    }

    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user.email || "";
      setAccountEmail(email);
      if (email) {
        loadAccountSettings().catch((err) => {
          addToast(getErrorMessage(err, "Could not load account settings."), "error");
        }).finally(() => setIsAuthChecking(false));
      } else {
        setIsAuthChecking(false);
      }
    }).catch(() => setIsAuthChecking(false));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user.email || "";
      setAccountEmail(email);
      if (email) {
        loadAccountSettings().catch((err) => {
          addToast(getErrorMessage(err, "Could not load account settings."), "error");
        });
      } else {
        setAccountSettings(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [addToast, hasSupabaseAuthConfig]);

  const saveProvider = (value: string) => {
    const provider = value.trim();
    if (!provider) return "";

    setSavedProviders(prev => {
      const withoutDuplicate = prev.filter(
        item => item.toLowerCase() !== provider.toLowerCase()
      );
      const next = [provider, ...withoutDuplicate].slice(0, 30);
      localStorage.setItem("mass10_providers", JSON.stringify(next));
      return next;
    });

    return provider;
  };

  // Save settings helpers
  const handleSaveSettings = async () => {
    const normalizedProvider = saveProvider(supplier);
    localStorage.setItem("mass10_markup", String(markup));
    localStorage.setItem("mass10_supplier", normalizedProvider);
    localStorage.setItem("mass10_anthropic_key", anthropicApiKey);
    localStorage.setItem("mass10_supabase_url", supabaseUrl);
    localStorage.removeItem("mass10_supabase_key");
    localStorage.setItem("mass10_supabase_table", supabaseTable);

    if (accountEmail) {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supabaseProjectUrl: supabaseUrl,
          supabaseTable,
          anthropicApiKey,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        addToast(data.error || "Local settings saved, but account sync failed.", "error");
        return;
      }

      await loadAccountSettings();
    }
    
    setShowSettings(false);
    addToast(accountEmail ? "Settings saved to this browser and your account." : "Settings successfully saved!", "success");
  };

  const handleAuthSubmit = async () => {
    if (!hasSupabaseAuthConfig) {
      addToast("Supabase auth is not configured for this deployment.", "error");
      return;
    }
    if (!authEmail.trim() || !authPassword.trim()) {
      addToast("Enter your email and password first.", "error");
      return;
    }

    setIsAuthLoading(true);
    try {
      const supabase = createClient();
      const result = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });

      if (result.error) {
        throw result.error;
      }

      setAuthPassword("");
      setAccountEmail(result.data.user?.email || authEmail.trim());
      await loadAccountSettings();
      addToast("Logged in. Account settings loaded.", "success");
    } catch (err: unknown) {
      addToast(getErrorMessage(err, "Authentication failed."), "error");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!hasSupabaseAuthConfig) return;
    setIsAuthLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setAccountEmail("");
      setAccountSettings(null);
      addToast("Logged out. Local settings are still available.", "info");
    } catch (err: unknown) {
      addToast(getErrorMessage(err, "Could not log out."), "error");
    } finally {
      setIsAuthLoading(false);
    }
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
  const isApiKeyConfigured =
    !!anthropicApiKey.trim() || !!accountSettings?.hasAnthropicApiKey;
  const isSupabaseConfigured =
    !!supabaseUrl.trim() && hasSupabaseAuthConfig;

  const toastContainer = (
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
  );

  if (!accountEmail) {
    return (
      <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center p-6">
        <div className="w-full max-w-md glass-panel rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
          <div className="bg-[#151823] px-6 py-5 border-b border-[#272c3f] flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl overflow-hidden bg-[#1c2030] flex items-center justify-center border border-[#272c3f]/50 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69ae58de07517f75e0d39cfd/4c7929b8c_Untitleddesign1.png"
                alt="Mass10 Logo"
                className="w-full h-full object-contain p-1"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="text-base font-bold text-[#e8eaf0]">Mass10 Research Portal</h1>
              <span className="text-[11px] text-[#8c92a4]">Secure staff login required</span>
            </div>
          </div>

          <div className="p-6 flex flex-col gap-4">
            <div className="bg-[#01b3fd]/5 border border-[#01b3fd]/20 rounded-xl p-3.5 flex gap-2 text-xs text-[#8c92a4]">
              <Info className="h-4 w-4 text-[#01b3fd] shrink-0" />
              <span>Sign in with the account created by the Mass10 admin to access research and catalog sync tools.</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#8c92a4]">Email</label>
              <input
                type="email"
                placeholder="you@company.co.za"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                disabled={isAuthChecking}
                className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#01b3fd] transition-colors disabled:opacity-60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#8c92a4]">Password</label>
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleAuthSubmit();
                }}
                disabled={isAuthChecking}
                className="bg-[#1c2030] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#01b3fd] transition-colors disabled:opacity-60"
              />
            </div>

            <button
              onClick={handleAuthSubmit}
              disabled={isAuthLoading || isAuthChecking}
              className="bg-[#01b3fd] hover:bg-[#1ac0ff] disabled:opacity-60 text-black text-sm font-bold px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              <span>{isAuthChecking ? "Checking session..." : isAuthLoading ? "Logging in..." : "Login"}</span>
            </button>
          </div>
        </div>
        {toastContainer}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-[#0b0d13]">
      {/* HEADER BAR */}
      <header className="bg-[#151823] border-b border-[#272c3f] px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0 shadow-lg shadow-black/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#1c2030] flex items-center justify-center border border-[#272c3f]/50 shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69ae58de07517f75e0d39cfd/4c7929b8c_Untitleddesign1.png"
              alt="Mass10 Logo"
              className="w-full h-full object-contain p-1"
            />
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

          {/* Provider Name */}
          <div className={`flex items-center gap-2 bg-[#1c2030] px-3 py-1.5 rounded-lg border ${
            supplier.trim() ? "border-[#272c3f]" : "border-[#ef4444]/50"
          }`}>
            <span className={`text-xs font-semibold ${supplier.trim() ? "text-[#8c92a4]" : "text-[#ef4444]"}`}>
              Provider *
            </span>
            <input
              list="mass10-provider-options"
              type="text"
              placeholder="e.g. Pinnacle"
              value={supplier}
              onChange={e => setSupplier(e.target.value)}
              onBlur={e => saveProvider(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  saveProvider(e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
              className="bg-transparent text-xs text-[#e8eaf0] font-semibold w-28 focus:outline-none"
            />
            <datalist id="mass10-provider-options">
              {savedProviders.map(provider => (
                <option key={provider} value={provider} />
              ))}
            </datalist>
          </div>

          <div className="w-px h-6 bg-[#272c3f] hidden md:block"></div>

          {/* Credentials Indicators */}
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[11px] font-semibold">
              <span className={`w-2 h-2 rounded-full ${accountEmail ? "bg-[#10b981]" : "bg-[#8c92a4]"}`}></span>
              <span className={accountEmail ? "text-[#8c92a4]" : "text-[#ef4444]"}>
                {accountEmail ? "Logged In" : "Logged Out"}
              </span>
            </span>
            <span className="flex items-center gap-1 text-[11px] font-semibold">
              <span className={`w-2 h-2 rounded-full ${isApiKeyConfigured ? "bg-[#10b981]" : "bg-[#ef4444]"}`}></span>
              <span className={isApiKeyConfigured ? "text-[#8c92a4]" : "text-[#ef4444]"}>Claude</span>
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
                <span>
                  Log in to load saved Supabase credentials and API settings. New accounts are managed outside this app.
                </span>
              </div>

              <div className="bg-[#1c2030] border border-[#272c3f] rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserCircle className="h-4 w-4 text-[#01b3fd] shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-[#e8eaf0]">
                        Account Login
                      </span>
                      <span className="text-[11px] text-[#8c92a4] truncate">
                        {accountEmail || "Use your assigned Mass10 account"}
                      </span>
                    </div>
                  </div>

                  {accountEmail && (
                    <button
                      onClick={handleSignOut}
                      disabled={isAuthLoading}
                      className="bg-[#272c3f] hover:bg-[#21253a] disabled:opacity-60 text-[#e8eaf0] text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Log Out</span>
                    </button>
                  )}
                </div>

                {!accountEmail && (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      type="email"
                      placeholder="Email"
                      value={authEmail}
                      onChange={e => setAuthEmail(e.target.value)}
                      className="bg-[#151823] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd] transition-colors"
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={authPassword}
                      onChange={e => setAuthPassword(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleAuthSubmit();
                      }}
                      className="bg-[#151823] text-[#e8eaf0] border border-[#272c3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#01b3fd] transition-colors"
                    />
                    <button
                      onClick={handleAuthSubmit}
                      disabled={isAuthLoading}
                      className="bg-[#01b3fd] hover:bg-[#1ac0ff] disabled:opacity-60 text-black text-xs font-bold px-4 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <LogIn className="h-3.5 w-3.5" />
                      <span>{isAuthLoading ? "Working..." : "Login"}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Anthropic field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#8c92a4] flex items-center gap-1">
                  <Key className="h-3.5 w-3.5 text-[#01b3fd]" />
                  <span>Claude API Key</span>
                  {accountSettings?.hasAnthropicApiKey && !anthropicApiKey && (
                    <span className="text-[#10b981]">(saved on account)</span>
                  )}
                </label>
                <input
                  type="password"
                  placeholder={accountSettings?.hasAnthropicApiKey ? "Leave blank to keep saved Claude key" : "Paste sk-ant-... API key"}
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

              {/* Supabase Key status */}
              <div className="bg-[#1c2030] border border-[#272c3f] rounded-lg px-3 py-2.5 flex items-center gap-2">
                <Key className="h-3.5 w-3.5 text-[#10b981]" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-[#e8eaf0]">Supabase API Key</span>
                  <span className="text-[11px] text-[#8c92a4]">
                    Server-managed through Vercel environment variables.
                  </span>
                </div>
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

      {toastContainer}
    </div>
  );
}
