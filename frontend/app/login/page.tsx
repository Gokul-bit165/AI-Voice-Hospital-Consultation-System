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
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* Background visual accents */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-8 z-10">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-sky-500/15 border border-sky-500/25 rounded-2xl mb-4">
            <Activity className="h-8 w-8 text-sky-400 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wider font-sans">MetroVoice Portal</h1>
          <p className="text-sm text-slate-400 mt-1 font-medium">Smart Voice Clinical Suite</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs px-4 py-3 rounded-lg mb-6 text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none transition-colors"
                placeholder="doctor@hospital.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-semibold shadow-lg hover:shadow-sky-600/10 focus:outline-none transition-all active:scale-98 cursor-pointer disabled:opacity-50"
          >
            {loading ? "Authenticating session..." : "Login to Workspace"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500 mb-3 font-semibold uppercase tracking-wider">
            Quick Testing Access
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleQuickFill("doctor")}
              className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] text-sky-400 font-bold rounded-lg cursor-pointer transition-colors"
            >
              Doctor Desk
            </button>
            <button
              onClick={() => handleQuickFill("reception")}
              className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] text-indigo-400 font-bold rounded-lg cursor-pointer transition-colors"
            >
              Reception
            </button>
            <button
              onClick={() => handleQuickFill("admin")}
              className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] text-amber-500 font-bold rounded-lg cursor-pointer transition-colors"
            >
              System Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
