"use client";

import React, { useEffect, useState } from "react";
import { api, UserResponse } from "@/lib/api";
import { LogOut, User, Activity } from "lucide-react";

export default function Navbar() {
  const [user, setUser] = useState<UserResponse | null>(null);

  useEffect(() => {
    api.getMe()
      .then(setUser)
      .catch(() => {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      });
  }, []);

  const handleLogout = () => {
    api.logout();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  const handleLogoClick = () => {
    if (!user) return;
    if (user.role === "Doctor") {
      window.location.href = "/doctor";
    } else if (user.role === "Reception") {
      window.location.href = "/reception";
    } else if (user.role === "Admin") {
      window.location.href = "/admin";
    }
  };

  return (
    <nav className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800 shadow-md">
      <div 
        onClick={handleLogoClick}
        className="flex items-center gap-2 cursor-pointer select-none active:scale-95 transition-transform"
      >
        <Activity className="h-6 w-6 text-sky-400 animate-pulse" />
        <span className="font-bold text-lg tracking-wide uppercase">MetroVoice RAG</span>
        <span className="bg-sky-500/20 text-sky-400 text-[10px] px-2 py-0.5 rounded-full border border-sky-400/25 uppercase font-bold tracking-wider">
          {user?.role || "PORTAL"}
        </span>
      </div>
      
      {user && (
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="bg-slate-800 p-2 rounded-full border border-slate-700">
              <User className="h-4 w-4 text-sky-400" />
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold">{user.full_name}</p>
              <p className="text-[10px] text-slate-400 font-mono">{user.specialization}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 bg-slate-850 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer font-medium"
          >
            <LogOut className="h-3.5 w-3.5 text-rose-400" />
            <span>Logout</span>
          </button>
        </div>
      )}
    </nav>
  );
}
