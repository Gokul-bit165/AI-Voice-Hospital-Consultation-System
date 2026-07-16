"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { 
  Loader2, 
  ShieldCheck, 
  ClipboardList, 
  UserPlus, 
  KeyRound, 
  AlertTriangle, 
  Trash2, 
  ToggleLeft, 
  ToggleRight, 
  Plus, 
  RefreshCw, 
  CheckCircle,
  Brain,
  Mic,
  Database
} from "lucide-react";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"users" | "api-keys" | "logs">("users");

  // Clinician creation form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [specialization, setSpecialization] = useState("General Medicine");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("Doctor"); // Doctor, Reception, Admin

  const [createSuccess, setCreateSuccess] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Dynamic API Key form state
  const [keyService, setKeyService] = useState("openai");
  const [keyName, setKeyName] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [keyPriority, setKeyPriority] = useState(1);
  const [keyActive, setKeyActive] = useState(true);

  const [keySuccess, setKeySuccess] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(false);

  // Fetch audit logs
  const { data: auditLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.getAuditLogs(),
    enabled: activeTab === "logs",
  });

  // Fetch API Keys
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.getApiKeys(),
    enabled: activeTab === "api-keys",
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccess(false);

    try {
      await api.createClinician({
        full_name: fullName,
        email,
        password,
        specialization,
        license_number: licenseNumber || "N/A",
        phone,
        role
      });
      setCreateSuccess(true);
      
      // Clear form
      setFullName("");
      setEmail("");
      setPassword("");
      setLicenseNumber("");
      setPhone("");
    } catch (err: any) {
      setCreateError(err.message || "Failed to create clinician user.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyLoading(true);
    setKeyError(null);
    setKeySuccess(false);

    try {
      await api.createApiKey({
        service: keyService,
        name: keyName || undefined,
        key_value: keyValue,
        priority: Number(keyPriority),
        is_active: keyActive,
      });
      setKeySuccess(true);
      setKeyName("");
      setKeyValue("");
      setKeyPriority(1);
      setKeyActive(true);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    } catch (err: any) {
      setKeyError(err.message || "Failed to add API key.");
    } finally {
      setKeyLoading(false);
    }
  };

  const handleToggleKey = async (keyId: string, currentActive: boolean) => {
    try {
      await api.updateApiKey(keyId, { is_active: !currentActive });
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    } catch (err: any) {
      alert(err.message || "Failed to update key status.");
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to delete this API key? This cannot be undone.")) {
      return;
    }
    try {
      await api.deleteApiKey(keyId);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    } catch (err: any) {
      alert(err.message || "Failed to delete API key.");
    }
  };

  // Render Service Badges
  const renderServiceBadge = (service: string) => {
    const s = service.toLowerCase();
    if (s === "openai") {
      return (
        <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase">
          <Brain className="h-3.5 w-3.5" /> OpenAI GPT-4o
        </span>
      );
    } else if (s === "gemini") {
      return (
        <span className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase">
          <Brain className="h-3.5 w-3.5" /> Gemini 1.5
        </span>
      );
    } else if (s === "groq") {
      return (
        <span className="inline-flex items-center gap-1 bg-orange-50 border border-orange-100 text-orange-700 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase">
          <Mic className="h-3.5 w-3.5" /> Groq Whisper
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase">
          <Database className="h-3.5 w-3.5" /> OpenRouter
        </span>
      );
    }
  };

  return (
    <DashboardLayout>
      <div className="h-full w-full p-4 sm:p-6 flex flex-col overflow-hidden pb-24">
        
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#111827]">MetroVoice Admin Suite</h1>
            <p className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider mt-0.5">Control Center & API Router Config</p>
          </div>
        </div>

        {/* Tab Headers */}
        <div className="flex border-b border-[#E5E7EB] mb-6 gap-6 flex-shrink-0">
          <button
            onClick={() => setActiveTab("users")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === "users"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-[#6B7280] hover:text-[#111827]"
            }`}
          >
            Clinician Directory
          </button>
          <button
            onClick={() => setActiveTab("api-keys")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === "api-keys"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-[#6B7280] hover:text-[#111827]"
            }`}
          >
            API Key Manager
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === "logs"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-[#6B7280] hover:text-[#111827]"
            }`}
          >
            System Audit Logs
          </button>
        </div>

        {/* Tab Content Panels */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          
          {/* TAB 1: Clinician Registry */}
          {activeTab === "users" && (
            <div className="max-w-xl bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-3 mb-2">
                <UserPlus className="h-5 w-5 text-[#2563EB]" />
                <h2 className="text-xs font-bold text-[#111827] uppercase tracking-wider">Register Clinician Account</h2>
              </div>

              {createSuccess && (
                <div className="bg-emerald-50 border border-emerald-100 text-[#16A34A] text-xs px-3 py-2.5 rounded-xl text-center font-bold">
                  Clinician profile created successfully!
                </div>
              )}

              {createError && (
                <div className="bg-red-50 border border-red-100 text-[#DC2626] text-xs px-3 py-2.5 rounded-xl text-center font-bold">
                  {createError}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Dr. Robert Chen"
                      className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. chen@hospital.com"
                      className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Account Password</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Role Type</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-850 focus:outline-none focus:border-[#2563EB] transition-colors"
                    >
                      <option value="Doctor">Doctor (Clinical Desk)</option>
                      <option value="Reception">Receptionist (Front Desk)</option>
                      <option value="Admin">System Admin (Full Access)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Contact Phone</label>
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 5550190100"
                      className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">License Number</label>
                    <input
                      type="text"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder={role === "Doctor" ? "e.g. LIC-12345" : "N/A"}
                      className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
                    />
                  </div>
                </div>

                {role === "Doctor" && (
                  <div>
                    <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Specialization</label>
                    <input
                      type="text"
                      required
                      value={specialization}
                      onChange={(e) => setSpecialization(e.target.value)}
                      placeholder="e.g. Cardiology, Pediatrics"
                      className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={createLoading}
                  className="w-full py-3 bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all active:scale-95 text-xs shadow-sm flex items-center justify-center gap-1.5"
                >
                  {createLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {createLoading ? "Registering account..." : "Register User Profile"}
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: API Keys Management */}
          {activeTab === "api-keys" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Add Key Form */}
              <div className="lg:col-span-4 bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-3 mb-2">
                  <KeyRound className="h-5 w-5 text-[#2563EB]" />
                  <h2 className="text-xs font-bold text-[#111827] uppercase tracking-wider">Configure API Key</h2>
                </div>

                {keySuccess && (
                  <div className="bg-emerald-50 border border-emerald-100 text-[#16A34A] text-xs px-3 py-2.5 rounded-xl text-center font-bold">
                    API Key registered successfully!
                  </div>
                )}

                {keyError && (
                  <div className="bg-red-50 border border-red-100 text-[#DC2626] text-xs px-3 py-2.5 rounded-xl text-center font-bold">
                    {keyError}
                  </div>
                )}

                <form onSubmit={handleCreateApiKey} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Service Provider</label>
                    <select
                      value={keyService}
                      onChange={(e) => setKeyService(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-850 focus:outline-none focus:border-[#2563EB] transition-colors font-semibold"
                    >
                      <option value="openai">OpenAI (LLM & Embeddings)</option>
                      <option value="gemini">Gemini (STT, LLM & Embeddings)</option>
                      <option value="groq">Groq (STT Transcription)</option>
                      <option value="openrouter">OpenRouter (Fallback Provider)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Friendly Name</label>
                    <input
                      type="text"
                      required
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      placeholder="e.g. Primary OpenAI Key, Backup Groq Key"
                      className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">API Key String</label>
                    <input
                      type="password"
                      required
                      value={keyValue}
                      onChange={(e) => setKeyValue(e.target.value)}
                      placeholder="Paste your key here (e.g. sk-proj-...)"
                      className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Priority Order</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        required
                        value={keyPriority}
                        onChange={(e) => setKeyPriority(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Initial Status</label>
                      <select
                        value={keyActive ? "true" : "false"}
                        onChange={(e) => setKeyActive(e.target.value === "true")}
                        className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={keyLoading}
                    className="w-full py-2.5 bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all active:scale-95 text-xs shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {keyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add Key Config
                  </button>
                </form>
              </div>

              {/* API Keys List */}
              <div className="lg:col-span-8 bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-[#2563EB]" />
                    <h2 className="text-xs font-bold text-[#111827] uppercase tracking-wider">Active API Keys Routing Pool</h2>
                  </div>
                  <span className="text-[10px] bg-slate-50 border border-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded-lg">
                    Total: {apiKeys.length}
                  </span>
                </div>

                {keysLoading ? (
                  <div className="py-20 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-[#2563EB] mx-auto" />
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="py-12 text-center text-[#6B7280] space-y-2">
                    <KeyRound className="h-8 w-8 text-[#6B7280]/40 mx-auto" />
                    <p className="font-semibold text-xs">No custom API keys registered.</p>
                    <p className="text-[10px] max-w-sm mx-auto">MetroVoice is currently running on credentials defined in your system environment (`.env`) file.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                    {apiKeys.map((k) => (
                      <div
                        key={k.id}
                        className={`p-4 border rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors ${
                          k.is_active ? "bg-white border-[#E5E7EB]" : "bg-slate-50 border-slate-200 opacity-70"
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {renderServiceBadge(k.service)}
                            <span className="font-semibold text-slate-800 text-xs">{k.name}</span>
                            <span className="bg-[#2563EB]/10 text-[#2563EB] text-[9px] font-bold px-1.5 py-0.5 rounded font-mono">
                              Priority {k.priority}
                            </span>
                            {k.fail_count > 0 && (
                              <span className="bg-red-50 border border-red-100 text-[#DC2626] text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5">
                                <AlertTriangle className="h-3 w-3" /> Fails: {k.fail_count}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#6B7280] font-mono select-all bg-[#F8FAFC] border border-[#E5E7EB] px-2 py-0.5 rounded">
                            {k.masked_key}
                          </div>
                          <p className="text-[9px] text-slate-400">Added: {new Date(k.created_at).toLocaleDateString()}</p>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                          <button
                            onClick={() => handleToggleKey(k.id, k.is_active)}
                            className="p-1 text-slate-500 hover:text-slate-800 transition-colors"
                            title={k.is_active ? "Deactivate key" : "Activate key"}
                          >
                            {k.is_active ? (
                              <ToggleRight className="h-7 w-7 text-[#2563EB]" />
                            ) : (
                              <ToggleLeft className="h-7 w-7 text-[#6B7280]" />
                            )}
                          </button>
                          
                          <button
                            onClick={() => handleDeleteKey(k.id)}
                            className="p-2 border border-red-100 hover:border-red-200 bg-red-50 text-[#DC2626] hover:bg-red-100 rounded-lg transition-colors"
                            title="Delete configuration"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 3: System Audit Logs */}
          {activeTab === "logs" && (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm flex flex-col h-[70vh]">
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3 mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-[#2563EB]" />
                  <h2 className="text-xs font-bold text-[#111827] uppercase tracking-wider">Centralized System Audit Logs</h2>
                </div>
                <button 
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["audit-logs"] })}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-[#6B7280] hover:text-[#111827] transition-colors"
                  title="Refresh Audit Logs"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs min-h-0">
                {logsLoading ? (
                  <div className="text-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-[#2563EB] mx-auto" />
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-12 text-[#6B7280]">
                    <ClipboardList className="h-8 w-8 text-[#6B7280]/40 mx-auto mb-2" />
                    <p className="font-semibold">No audit records logged yet.</p>
                  </div>
                ) : (
                  auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 border border-[#E5E7EB] bg-[#F8FAFC] rounded-xl space-y-1.5"
                    >
                      <div className="flex justify-between items-center text-[9px] font-mono text-[#6B7280] font-semibold">
                        <span>IP: {log.ip_address || "Internal"}</span>
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      
                      <p className="text-slate-800 font-semibold leading-relaxed">
                        User <span className="text-[#2563EB] font-mono font-bold">{log.user_id}</span> performed action <span className="bg-blue-50 border border-blue-100 text-[#2563EB] px-1.5 py-0.5 rounded font-bold">{log.action}</span> on clinical entity <span className="font-bold text-[#111827]">{log.entity_type}</span>.
                      </p>
                      <p className="text-[10px] text-[#6B7280] font-mono mt-0.5">Entity ID reference: {log.entity_id}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </DashboardLayout>
  );
}
