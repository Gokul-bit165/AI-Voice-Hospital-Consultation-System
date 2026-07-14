"use client";

import React, { useState } from "react";
import { api } from "@/lib/api";
import { Lock, Mail, Activity } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await api.login(email, password);
      if (response.role === "Doctor") {
        window.location.href = "/doctor";
      } else if (response.role === "Reception") {
        window.location.href = "/reception";
      } else if (response.role === "Admin") {
        window.location.href = "/admin";
      }
    } catch (err: any) {
      setError(err.message || "Failed to log in. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (role: "doctor" | "reception" | "admin") => {
    if (role === "doctor") {
      setEmail("doctor@hospital.com");
      setPassword("Password123");
    } else if (role === "reception") {
      setEmail("reception@hospital.com");
      setPassword("Password123");
    } else if (role === "admin") {
      setEmail("admin@hospital.com");
      setPassword("Password123");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 antialiased text-[#111827]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>

      <div className="w-full max-w-md bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden p-8 z-10">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-blue-50 border border-blue-100 rounded-2xl mb-4">
            <Activity className="h-7 w-7 text-[#2563EB] animate-pulse" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#111827] uppercase">MetroVoice Portal</h1>
          <p className="text-xs text-[#6B7280] mt-1 font-semibold uppercase tracking-wider">Clinical Workspace Suite</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-[#DC2626] text-xs px-4 py-3 rounded-xl mb-6 text-center font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-[#6B7280]" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-10 pr-3.5 py-3 bg-[#F8FAFC] border border-[#E5E7EB] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-xl text-xs text-[#111827] placeholder-[#6B7280] focus:outline-none transition-colors font-semibold"
                placeholder="doctor@hospital.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-[#6B7280]" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3.5 py-3 bg-[#F8FAFC] border border-[#E5E7EB] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-xl text-xs text-[#111827] placeholder-[#6B7280] focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm focus:outline-none transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {loading ? "Authenticating session..." : "Login to Workspace"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#E5E7EB] text-center">
          <p className="text-[10px] text-[#6B7280] mb-3.5 font-bold uppercase tracking-wider">
            Quick Testing Access
          </p>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <button
              onClick={() => handleQuickFill("doctor")}
              className="px-2 py-2.5 bg-white hover:bg-slate-50 border border-[#E5E7EB] text-[#2563EB] font-bold rounded-xl cursor-pointer transition-colors shadow-xs"
            >
              Doctor Desk
            </button>
            <button
              onClick={() => handleQuickFill("reception")}
              className="px-2 py-2.5 bg-white hover:bg-slate-50 border border-[#E5E7EB] text-[#2563EB] font-bold rounded-xl cursor-pointer transition-colors shadow-xs"
            >
              Reception
            </button>
            <button
              onClick={() => handleQuickFill("admin")}
              className="px-2 py-2.5 bg-white hover:bg-slate-50 border border-[#E5E7EB] text-slate-700 font-bold rounded-xl cursor-pointer transition-colors shadow-xs"
            >
              Admin Desk
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
