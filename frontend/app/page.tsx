"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token");
      const role = localStorage.getItem("role");

      if (!token) {
        window.location.href = "/login";
      } else {
        if (role === "Doctor") {
          window.location.href = "/doctor";
        } else if (role === "Reception") {
          window.location.href = "/reception";
        } else if (role === "Admin") {
          window.location.href = "/admin";
        } else {
          window.location.href = "/login";
        }
      }
    }
  }, []);

  return (
    <div className="min-height-screen bg-slate-900 text-white flex items-center justify-center font-sans">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-slate-400 text-sm font-medium">Redirecting to session dashboard...</p>
      </div>
    </div>
  );
}
