"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { Loader2, ShieldCheck, ClipboardList, UserPlus, KeyRound, AlertTriangle } from "lucide-react";

export default function AdminPage() {
  const queryClient = useQueryClient();

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

  // Fetch audit logs
  const { data: auditLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.getAuditLogs(),
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
      
      // Refresh audit logs
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    } catch (err: any) {
      setCreateError(err.message || "Failed to create clinician user.");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="h-full w-full p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto pb-24">
        
        {/* Left Side: Create User Form (cols 4) */}
        <div className="lg:col-span-4 bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-4 h-fit">
          <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-3">
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

          <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
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
              <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. chen@hospital.com"
                className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
              />
            </div>
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
            
            {role === "Doctor" && (
              <div>
                <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Specialization</label>
                <input
                  type="text"
                  required
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  placeholder="e.g. Cardiology"
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">License number</label>
              <input
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="e.g. LIC-12345"
                className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 focus:outline-none focus:border-[#2563EB] transition-colors"
              />
            </div>
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

            <button
              type="submit"
              disabled={createLoading}
              className="w-full py-2.5 bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all active:scale-95 text-xs shadow-sm"
            >
              {createLoading ? "Registering account..." : "Register User Profile"}
            </button>
          </form>
        </div>

        {/* Right Side: Centralized Audit Logs (cols 8) */}
        <div className="lg:col-span-8 bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm flex flex-col h-[80vh]">
          <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-3 mb-4 flex-shrink-0">
            <ClipboardList className="h-5 w-5 text-[#2563EB]" />
            <h2 className="text-xs font-bold text-[#111827] uppercase tracking-wider">Centralized System Audit Logs</h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs min-h-0">
            {logsLoading ? (
              <div className="text-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB] mx-auto" />
              </div>
            ) : auditLogs.length === 0 ? (
              <p className="text-[#6B7280] text-center py-6">No audit records logged yet.</p>
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

      </div>
    </DashboardLayout>
  );
}
