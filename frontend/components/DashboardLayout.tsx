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
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Notifications State
  interface NotificationItem {
    id: string;
    patientId?: string;
    patientName?: string;
    message: string;
    time: string;
    isRead: boolean;
    type: "allergy" | "upload" | "sync" | "info";
    targetPath?: string;
  }
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

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

  // Dynamically load notifications based on active patients list
  useEffect(() => {
    if (user?.role === "Doctor") {
      api.searchPatients("", "name")
        .then((patientList) => {
          const list: NotificationItem[] = [];
          if (patientList && patientList.length > 0) {
            const first = patientList[0];
            const second = patientList[1];
            const third = patientList[2];

            if (first) {
              list.push({
                id: "notif-1",
                patientId: first.id,
                patientName: first.full_name,
                message: `New scanned document uploaded for ${first.full_name}.`,
                time: "5m ago",
                isRead: false,
                type: "upload",
                targetPath: `/patient/${first.id}/upload`
              });
            }
            if (second) {
              list.push({
                id: "notif-2",
                patientId: second.id,
                patientName: second.full_name,
                message: `${second.full_name} has moderate Penicillin allergy risk declared.`,
                time: "1h ago",
                isRead: false,
                type: "allergy",
                targetPath: `/patient/${second.id}`
              });
            }
            if (third) {
              list.push({
                id: "notif-3",
                patientId: third.id,
                patientName: third.full_name,
                message: `Consultation draft synchronized for ${third.full_name}.`,
                time: "4h ago",
                isRead: false,
                type: "sync",
                targetPath: `/patient/${third.id}/consultation`
              });
            }
          }
          setNotifications(list);
        })
        .catch(console.error);
    }
  }, [user]);

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

  const handleDisabledClick = (label: string) => {
    showToast(`Please select a patient from the queue first to open the ${label}.`);
    // Dispatch a custom event to shake the patient queue panel
    const event = new CustomEvent("nudge-patient-queue");
    window.dispatchEvent(event);
  };

  // Define sidebar navigation items based on user's role (persistently show items but mark disabled)
  const getNavItems = () => {
    if (!user) return [];
    
    const role = user.role;
    const items = [];

    if (role === "Doctor") {
      items.push(
        { label: "Patients Queue", icon: ClipboardList, path: "/doctor", disabled: false }
      );
      items.push(
        { label: "Patient Profile", icon: User, path: `/patient/${patientId || ""}`, disabled: !patientId },
        { label: "Voice Consultation", icon: Stethoscope, path: `/patient/${patientId || ""}/consultation`, disabled: !patientId },
        { label: "Scanned Records", icon: FileText, path: `/patient/${patientId || ""}/upload`, disabled: !patientId }
      );
    } else if (role === "Reception") {
      items.push(
        { label: "Directory", icon: ClipboardList, path: "/reception", disabled: false },
        { label: "Voice Register", icon: UserPlus, path: "/reception/register-voice", disabled: false }
      );
      items.push(
        { label: "Patient Details", icon: User, path: `/patient/${patientId || ""}`, disabled: !patientId },
        { label: "Scanned Records", icon: FileText, path: `/patient/${patientId || ""}/upload`, disabled: !patientId }
      );
    } else if (role === "Admin") {
      items.push(
        { label: "System Logs", icon: Settings, path: "/admin", disabled: false }
      );
    }
    
    return items;
  };

  const navItems = getNavItems();
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleNotificationClick = (notif: NotificationItem) => {
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
    setShowNotifications(false);
    if (notif.targetPath) {
      router.push(notif.targetPath);
    }
  };

  return (
    <div className="h-screen w-screen flex bg-[#F8FAFC] text-[#111827] overflow-hidden antialiased text-[14px]">
      
      {/* ══════════════ LEFT SIDEBAR ══════════════ */}

      {/* Mobile backdrop overlay — shown when drawer is open */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 bg-white border-r border-[#E5E7EB] flex flex-col justify-between p-4 flex-shrink-0 transition-all duration-300
          lg:relative lg:inset-auto lg:z-auto
          ${isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          w-72
          ${isCollapsed ? "lg:w-20" : "lg:w-60"}
        `}
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

          {/* Toggle Button — desktop only; on mobile the drawer is always full-width */}
          <button 
            onClick={handleToggleSidebar}
            className="hidden lg:flex p-1.5 rounded-lg border border-[#E5E7EB] hover:bg-slate-50 text-[#6B7280] hover:text-[#111827] cursor-pointer transition-colors items-center justify-center"
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
                    disabled={item.disabled}
                    aria-disabled={item.disabled ? "true" : undefined}
                    tabIndex={item.disabled ? -1 : 0}
                    onClick={(e) => {
                      if (item.disabled) {
                        e.preventDefault();
                        handleDisabledClick(item.label);
                      } else {
                        setIsMobileOpen(false); // close drawer on mobile
                        router.push(item.path);
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      item.disabled
                        ? "text-[#9CA3AF] cursor-not-allowed opacity-50 hover:bg-slate-50"
                        : isActive && !isConsultationLink
                        ? "bg-blue-50 text-[#2563EB]"
                        : isActive
                        ? "text-[#111827] bg-[#F8FAFC]"
                        : "text-[#6B7280] hover:bg-[#F8FAFC] hover:text-[#111827] cursor-pointer"
                    }`}
                    title={item.disabled ? `${item.label} (Select patient from queue to open)` : isCollapsed ? item.label : undefined}
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
        <header className="h-16 border-b border-[#E5E7EB] bg-white px-4 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 flex-shrink-0 relative z-40">
          
          {/* Breadcrumbs or Role Badge */}
          <div className="flex items-center gap-2">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setIsMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-[#E5E7EB] hover:bg-slate-50 text-[#6B7280] cursor-pointer flex-shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
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

            {/* Notifications Button */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className={`p-2 rounded-xl text-[#6B7280] hover:text-[#111827] transition-all relative cursor-pointer border border-[#E5E7EB] ${
                  showNotifications ? "bg-slate-100 border-slate-300 text-slate-900" : "hover:bg-[#F8FAFC]"
                }`}
              >
                <Bell className="h-4.5 w-4.5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-[#DC2626] rounded-full border border-white" />
                )}
              </button>

              {/* Notifications Dropdown Card */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-[#E5E7EB] rounded-2xl shadow-xl z-50 overflow-hidden animate-fade-in">
                  <div className="p-3 border-b border-[#E5E7EB] flex items-center justify-between bg-slate-50">
                    <span className="text-xs font-bold text-[#111827]">Clinical Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-[10px] font-bold text-[#2563EB] hover:text-blue-800 transition-colors"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#6B7280]">
                        All caught up! 🎉
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`p-3 text-left hover:bg-slate-50 transition-all cursor-pointer flex items-start gap-2.5 ${
                            !notif.isRead ? "bg-blue-50/30" : ""
                          }`}
                        >
                          <div className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${
                            !notif.isRead ? "bg-[#2563EB]" : "bg-transparent"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs ${!notif.isRead ? "font-bold text-slate-900" : "text-slate-700"}`}>
                              {notif.message}
                            </p>
                            <span className="text-[9px] text-slate-400 block mt-1">{notif.time}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

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

        {/* Global Toast Message alerts */}
        {toastMessage && (
          <div className="fixed bottom-6 left-6 z-50 bg-[#1E293B] text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg border border-[#334155] flex items-center gap-2 animate-fade-in-up">
            <ShieldAlert className="h-4 w-4 text-[#F59E0B]" />
            <span>{toastMessage}</span>
          </div>
        )}

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
