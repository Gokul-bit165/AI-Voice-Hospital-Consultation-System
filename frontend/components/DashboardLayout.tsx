"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, UserResponse, Vitals } from "@/lib/api";
import {
  Activity, ClipboardList, FileText, User, LogOut,
  ChevronLeft, ChevronRight, Bell, HelpCircle, Search,
  UserPlus, Settings, Stethoscope, Clock, ShieldAlert,
  Menu, Mic, Pill, History
} from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
  vitals?: Vitals;
  setVitals?: (vitals: Vitals) => void;
  timeline?: any[];
}

export default function DashboardLayout({ children, vitals, setVitals, timeline }: DashboardLayoutProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
      </div>
    }>
      <DashboardLayoutContent vitals={vitals} setVitals={setVitals} timeline={timeline}>
        {children}
      </DashboardLayoutContent>
    </Suspense>
  );
}

function DashboardLayoutContent({ children, vitals, setVitals, timeline }: DashboardLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const patientId = params?.id as string | undefined;
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Sync collapsed state with localStorage
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebar_collapsed");
      if (saved === "true") {
        setIsCollapsed(true);
      }
    }
  }, []);

  // Fetch active user details
  useEffect(() => {
    api.getMe()
      .then(setUser)
      .catch(() => {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      });
  }, []);

  const handleToggleSidebar = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar_collapsed", String(nextState));
    }
  };

  const handleLogout = () => {
    api.logout();
    router.push("/login");
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  // Define sidebar navigation items based on user's role
  const getNavItems = () => {
    if (!user) return [];
    
    const role = user.role;
    const items = [];

    if (role === "Doctor") {
      items.push(
        { label: "Patients Queue", icon: ClipboardList, path: "/doctor" }
      );
      if (patientId) {
        items.push(
          { label: "Patient Profile", icon: User, path: `/patient/${patientId}` },
          { label: "Voice Consultation", icon: Stethoscope, path: `/patient/${patientId}/consultation` },
          { label: "Scanned Records", icon: FileText, path: `/patient/${patientId}/upload` }
        );
      }
    } else if (role === "Reception") {
      items.push(
        { label: "Directory", icon: ClipboardList, path: "/reception" },
        { label: "Voice Register", icon: UserPlus, path: "/reception/register-voice" }
      );
      if (patientId) {
        items.push(
          { label: "Patient Details", icon: User, path: `/patient/${patientId}` },
          { label: "Scanned Records", icon: FileText, path: `/patient/${patientId}/upload` }
        );
      }
    } else if (role === "Admin") {
      items.push(
        { label: "System Logs", icon: Settings, path: "/admin" }
      );
    }
    
    return items;
  };

  const navItems = getNavItems();

  return (
    <div className="h-screen w-screen flex bg-[#F8FAFC] text-[#111827] overflow-hidden antialiased text-[14px]">
      
      {/* ══════════════ LEFT SIDEBAR ══════════════ */}
      <aside 
        className={`bg-white border-r border-[#E5E7EB] flex flex-col justify-between p-4 flex-shrink-0 transition-all duration-300 ${
          isCollapsed ? "w-20" : "w-60"
        }`}
      >
        {/* Logo / Clinical Branding (Fixed Top) */}
        <div className="flex items-center justify-between px-1 flex-shrink-0 mb-4">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100 flex-shrink-0">
              <Activity className="h-5 w-5 text-[#2563EB]" />
            </div>
            {!isCollapsed && (
              <div className="transition-all duration-300 whitespace-nowrap">
                <span className="font-bold text-sm tracking-tight text-[#111827] block">
                  MetroVoice AI
                </span>
                <span className="text-[10px] text-[#6B7280] font-medium tracking-wide block -mt-0.5">
                  SaaS Portal
                </span>
              </div>
            )}
          </div>

          {/* Toggle Button */}
          <button 
            onClick={handleToggleSidebar}
            className="p-1.5 rounded-lg border border-[#E5E7EB] hover:bg-slate-50 text-[#6B7280] hover:text-[#111827] cursor-pointer transition-colors"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Scrollable Center Content */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1 min-h-0 my-2">
          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              const isConsultationLink = item.path.endsWith("/consultation");
              const isActive = pathname === item.path;
              const currentTab = searchParams.get("tab") || "vitals";

              return (
                <div key={idx} className="space-y-1">
                  <button
                    onClick={() => router.push(item.path)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isActive && !isConsultationLink
                        ? "bg-blue-50 text-[#2563EB]"
                        : isActive
                        ? "text-[#111827] bg-[#F8FAFC]"
                        : "text-[#6B7280] hover:bg-[#F8FAFC] hover:text-[#111827]"
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon className="h-4.5 w-4.5 flex-shrink-0" />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </button>

                  {/* Consultation nested sub-tabs */}
                  {isConsultationLink && pathname?.endsWith("/consultation") && (
                    <div className={`pl-4 space-y-1 mt-1 ${isCollapsed ? "pl-0 flex flex-col items-center" : ""}`}>
                      {[
                        { label: "Voice Dictation", tabId: "vitals", icon: Mic },
                        { label: "Medication List", tabId: "rx", icon: Pill },
                        { label: "Trends & Labs", tabId: "history", icon: History }
                      ].map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = currentTab === sub.tabId;
                        return (
                          <button
                            key={sub.tabId}
                            onClick={() => router.push(`${item.path}?tab=${sub.tabId}`)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              isSubActive
                                ? "bg-blue-50 text-[#2563EB] border-l-2 border-[#2563EB] rounded-l-none"
                                : "text-[#6B7280] hover:bg-[#F8FAFC] hover:text-[#111827]"
                            }`}
                            title={isCollapsed ? sub.label : undefined}
                          >
                            <SubIcon className="h-3.5 w-3.5 flex-shrink-0" />
                            {!isCollapsed && <span className="truncate">{sub.label}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Session Vitals Desk (Left Sidebar Version) */}
          {!isCollapsed && pathname?.endsWith("/consultation") && vitals && (
            <div className="border-t border-[#E5E7EB] pt-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-1.5 flex-shrink-0">
                <Activity className="h-4 w-4 text-[#2563EB]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#111827]">
                  Session Vitals Desk
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { key: "hr", label: "Heart Rate", unit: "bpm", placeholder: "72" },
                  { key: "bp", label: "Blood Pressure", unit: "mmHg", placeholder: "120/80" },
                  { key: "spo2", label: "SpO₂ Status", unit: "%", placeholder: "98" },
                  { key: "temp", label: "Temperature", unit: "°F", placeholder: "98.6" },
                  { key: "weight", label: "Weight", unit: "kg", placeholder: "70" }
                ].map((vt) => (
                  <div key={vt.key} className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">{vt.label}</span>
                    <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl px-2.5 py-1.5">
                      <input
                        type="text"
                        value={(vitals as any)[vt.key] ?? ""}
                        placeholder={vt.placeholder}
                        onChange={(e) => setVitals?.({ ...vitals, [vt.key]: e.target.value })}
                        className="w-full bg-transparent text-xs font-bold text-[#111827] focus:outline-none placeholder-slate-300"
                      />
                      <span className="text-[9px] text-[#6B7280] font-bold uppercase">{vt.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Patient Case Timeline Card (Left Sidebar Version) */}
          {!isCollapsed && pathname?.endsWith("/consultation") && timeline && (
            <div className="border-t border-[#E5E7EB] pt-4 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3 border-b border-[#E5E7EB] pb-1.5 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#2563EB]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#111827]">
                    Clinical Timeline
                  </h3>
                </div>
              </div>

              <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                {timeline.length === 0 ? (
                  <p className="text-xs text-[#6B7280] text-center py-2">No items recorded.</p>
                ) : (
                  timeline.slice(0, 5).map((evt: any) => (
                    <div key={evt.id} className="relative pl-4 pb-3 border-l border-[#E5E7EB] last:border-0 last:pb-0">
                      <span
                        className={`absolute left-[-4.5px] top-1.5 h-2 w-2 rounded-full ${
                          evt.event_type === "registration" ? "bg-[#2563EB]" :
                          evt.event_type === "upload" ? "bg-indigo-500" :
                          evt.event_type === "visit" ? "bg-[#16A34A]" :
                          evt.event_type === "prescription" ? "bg-[#DC2626]" : "bg-slate-400"
                        }`}
                      />
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="text-[9px] font-mono text-[#6B7280] font-semibold uppercase">
                          {new Date(evt.event_date).toLocaleString()}
                        </span>
                        <span className="text-slate-700 font-medium leading-tight">
                          {evt.event_summary}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Footer Logout details */}
        <div className="space-y-3 pt-4 border-t border-[#E5E7EB]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-[#DC2626] hover:bg-red-50 transition-all cursor-pointer"
            title={isCollapsed ? "Logout" : undefined}
          >
            <LogOut className="h-4.5 w-4.5 flex-shrink-0" />
            {!isCollapsed && <span>Logout</span>}
          </button>

          {/* Collapsed small indicator */}
          {!isCollapsed && user && (
            <div className="p-3 bg-[#F8FAFC] rounded-xl border border-[#E5E7EB] text-[11px] text-[#6B7280]">
              <p className="font-semibold text-slate-700 truncate">Role: {user.role}</p>
              <p className="font-medium truncate">{user.email}</p>
            </div>
          )}
        </div>
      </aside>

      {/* ══════════════ MAIN CONTENT AREA ══════════════ */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* Top Header Bar */}
        <header className="h-16 border-b border-[#E5E7EB] bg-white px-6 flex items-center justify-between gap-4 flex-shrink-0">
          
          {/* Breadcrumbs or Role Badge */}
          <div className="flex items-center gap-2">
            <span className="bg-blue-50 text-[#2563EB] text-[10px] px-2 py-0.5 rounded-full border border-blue-100 uppercase font-bold tracking-wider">
              {user?.role || "PORTAL"}
            </span>
            <span className="text-slate-300 text-xs font-medium">/</span>
            <span className="text-xs text-[#6B7280] font-semibold truncate capitalize">
              {pathname?.split("/").filter(Boolean).slice(-1)[0] || "dashboard"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Assist status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-[#2563EB] text-xs font-bold">
              <Activity className="h-3.5 w-3.5 text-[#2563EB] animate-pulse" />
              <span className="hidden sm:inline">Voice System Online</span>
            </div>

            {/* Notifications */}
            <button className="p-2 rounded-xl hover:bg-[#F8FAFC] text-[#6B7280] hover:text-[#111827] transition-all relative cursor-pointer border border-[#E5E7EB]">
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-[#DC2626] rounded-full"></span>
            </button>

            {/* Help */}
            <button className="p-2 rounded-xl hover:bg-[#F8FAFC] text-[#6B7280] hover:text-[#111827] transition-all border border-[#E5E7EB] cursor-pointer">
              <HelpCircle className="h-4.5 w-4.5" />
            </button>

            {/* User Profile */}
            <div className="flex items-center gap-3 pl-2 border-l border-[#E5E7EB]">
              <div className="bg-blue-50 text-[#2563EB] p-2 rounded-full border border-blue-100 w-8 h-8 flex items-center justify-center font-bold text-xs">
                {user?.full_name?.split(" ").map((n) => n[0]).join("") || "DJ"}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-[#111827]">{user?.full_name || "Doctor Jenkins"}</p>
                <p className="text-[9px] text-[#6B7280] font-medium uppercase tracking-wider">
                  {user?.specialization || "Clinical Staff"}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content Wrapper */}
        <div className="flex-1 overflow-hidden h-full">
          {children}
        </div>
      </div>
    </div>
  );
}

// Small loader helper for mount state
function Loader2({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}
