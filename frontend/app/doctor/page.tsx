"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { Search, User, Clipboard, Play, CheckCircle2, History, ChevronRight, Loader2, Users, Clock, Sparkles, ClipboardList } from "lucide-react";

export default function DoctorDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  
  // Custom shake state
  const [shouldShake, setShouldShake] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Nudge shake listener
  useEffect(() => {
    const handleNudge = () => {
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 500);
    };
    window.addEventListener("nudge-patient-queue", handleNudge);
    return () => window.removeEventListener("nudge-patient-queue", handleNudge);
  }, []);

  // Query patient list
  const { data: patients = [], isLoading } = useQuery({
    queryKey: ["patients", debouncedQuery],
    queryFn: () => api.searchPatients(debouncedQuery, "name"),
  });

  // Query selected patient
  const { data: selectedPatient } = useQuery({
    queryKey: ["patient", selectedPatientId],
    queryFn: () => api.getPatient(selectedPatientId!),
    enabled: !!selectedPatientId,
  });

  return (
    <DashboardLayout>
      <div className="h-full w-full p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto pb-24">
        
        {/* Left column: Patient Queue / List */}
        <div className={`lg:col-span-5 bg-white border border-[#E5E7EB] rounded-2xl p-5 flex flex-col shadow-sm h-fit max-h-[80vh] transition-all ${
          shouldShake ? "animate-shake ring-2 ring-amber-400" : ""
        }`}>
          <div className="mb-4">
            <h2 className="text-base font-bold text-[#111827]">Doctor's Patient Queue</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">Select a patient to review profile or begin a voice consultation</p>
          </div>

          <div className="relative mb-4">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-[#6B7280]" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patients by name..."
              className="block w-full pl-9 pr-3 py-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-xs placeholder-[#6B7280] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {isLoading ? (
              <div className="space-y-2.5 animate-pulse">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="p-3 border border-slate-100 rounded-xl flex items-center justify-between bg-white">
                    <div className="flex items-center gap-3 w-full">
                      <div className="bg-slate-150 h-9 w-9 rounded-xl shrink-0" />
                      <div className="space-y-2 w-1/2">
                        <div className="h-3 bg-slate-200 rounded w-3/4" />
                        <div className="h-2 bg-slate-100 rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : patients.length === 0 ? (
              <p className="text-xs text-[#6B7280] text-center py-6">No patient records found.</p>
            ) : (
              patients.map((pat) => (
                <div
                  key={pat.id}
                  onClick={() => setSelectedPatientId(pat.id)}
                  className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                    selectedPatientId === pat.id
                      ? "border-[#2563EB] bg-blue-50/50 shadow-sm"
                      : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-100 p-2.5 rounded-xl text-[#6B7280]">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#111827]">{pat.full_name}</p>
                      <p className="text-[10px] text-[#6B7280] font-mono mt-0.5">DOB: {pat.date_of_birth}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#6B7280]" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column: Patient Card & Consulting Start options */}
        <div className="lg:col-span-7">
          {selectedPatient ? (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm space-y-6 animate-fade-in">
              <div className="flex items-start justify-between border-b border-[#E5E7EB] pb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#111827]">{selectedPatient.full_name}</h3>
                  <p className="text-xs text-[#6B7280] mt-1">DOB: {selectedPatient.date_of_birth} | Phone: {selectedPatient.phone}</p>
                </div>
                <span className="bg-blue-50 text-[#2563EB] border border-blue-100 text-xs px-2.5 py-1 rounded-md font-bold">
                  Cardiology Clinic
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-bold text-[#6B7280] uppercase tracking-wider block">Blood Group</span>
                  <span className="text-[#DC2626] font-bold text-sm mt-1 inline-block">{selectedPatient.blood_group || "N/A"}</span>
                </div>
                <div>
                  <span className="font-bold text-[#6B7280] uppercase tracking-wider block">Allergies Warning</span>
                  <span className="text-[#111827] font-semibold text-xs mt-1 inline-block">
                    {selectedPatient.allergies.join(", ") || "No known allergies"}
                  </span>
                </div>
              </div>

              {/* Consultation flow prompt options */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex gap-4">
                <Clipboard className="h-8 w-8 text-[#2563EB] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active Voice Consultation Room</h4>
                  <p className="text-xs text-[#6B7280] mt-1">
                    Entering the room starts a consultation. While consulting, the portal transcribes conversation, allows patient RAG matching, and compiles SOAP notes.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={() => window.location.href = `/patient/${selectedPatient.id}/consultation`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition-all active:scale-95"
                >
                  <Play className="h-4 w-4 fill-white" />
                  <span>Start Live Voice Consultation</span>
                </button>
                
                <button
                  onClick={() => window.location.href = `/patient/${selectedPatient.id}`}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-3 bg-white border border-[#E5E7EB] text-[#111827] hover:bg-[#F8FAFC] hover:border-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95"
                >
                  <History className="h-4 w-4 text-[#2563EB]" />
                  <span>View Clinical History</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm space-y-6 animate-fade-in">
              {/* Welcome banner */}
              <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/30 border border-blue-100/50 rounded-2xl p-5 relative overflow-hidden">
                <div className="relative z-10 space-y-1">
                  <span className="text-[10px] font-bold text-[#2563EB] bg-blue-100/80 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Portal Active
                  </span>
                  <h3 className="text-base font-bold text-slate-900 pt-1">Welcome back, Dr. Sarah Jenkins 🩺</h3>
                  <p className="text-xs text-slate-500 max-w-lg leading-relaxed mt-1">
                    MetroVoice AI is ready. Select a patient from the queue to review profile metrics, run drug safety checks, or record a live consultation.
                  </p>
                </div>
                <div className="absolute right-4 bottom-0 opacity-10 pointer-events-none">
                  <User className="h-32 w-32 text-blue-900" />
                </div>
              </div>

              {/* Responsive Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {isLoading ? (
                  [1, 2, 3, 4].map((n) => (
                    <div key={n} className="border border-slate-100 bg-[#F8FAFC]/30 rounded-xl p-4 flex flex-col justify-between animate-pulse">
                      <div className="flex items-start justify-between">
                        <div className="h-3 bg-slate-200 rounded w-2/3" />
                        <div className="h-6 w-6 bg-slate-150 rounded" />
                      </div>
                      <div className="mt-4 space-y-1">
                        <div className="h-5 bg-slate-200 rounded w-1/2" />
                        <div className="h-2.5 bg-slate-100 rounded w-3/4" />
                      </div>
                    </div>
                  ))
                ) : (
                  [
                    {
                      label: "Patients Waiting",
                      value: patients.length,
                      icon: Users,
                      color: "text-blue-600 bg-blue-50 border-blue-100",
                      description: "Active in clinic queue"
                    },
                    {
                      label: "Prescriptions Issued",
                      value: "14", // TODO: Replace with live query of today's prescriptions
                      icon: CheckCircle2,
                      color: "text-emerald-600 bg-emerald-50 border-emerald-100",
                      description: "Finalized today"
                    },
                    {
                      label: "OCR Records Logged",
                      value: "12", // TODO: Replace with live query of patient documents
                      icon: Clipboard,
                      color: "text-amber-600 bg-amber-50 border-amber-100",
                      description: "Scanned files processed"
                    },
                    {
                      label: "Avg. Session Length",
                      value: "6m 45s", // TODO: Replace with live query of consultation average durations
                      icon: Clock,
                      color: "text-purple-600 bg-purple-50 border-purple-100",
                      description: "Per voice dictation"
                    }
                  ].map((stat, idx) => {
                    const StatIcon = stat.icon;
                    return (
                      <div key={idx} className="border border-[#E5E7EB] bg-[#F8FAFC]/50 rounded-xl p-4 flex flex-col justify-between hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between">
                          <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider leading-tight">{stat.label}</span>
                          <div className={`p-1.5 rounded-lg border ${stat.color}`}>
                            <StatIcon className="h-4 w-4" />
                          </div>
                        </div>
                        <div className="mt-3">
                          <span className="text-xl font-bold text-[#111827] tracking-tight">{stat.value}</span>
                          <span className="text-[9px] text-[#6B7280] block mt-0.5 font-medium">{stat.description}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom split grid: Quick guide & Checklist */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                {/* Voice Dictation Quick Guide */}
                <div className="border border-[#E5E7EB] rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-100">
                      <Sparkles className="h-4 w-4 text-[#2563EB]" />
                    </div>
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Voice consultation room guide</span>
                  </div>
                  <div className="space-y-3 text-xs">
                    {[
                      { step: "1", title: "Select a patient", desc: "Choose a patient from the waiting queue on the left side panel." },
                      { step: "2", title: "Record dictation", desc: "Click 'Start Live Voice Consultation' and speak vitals, diagnoses, and medicines." },
                      { step: "3", title: "Review AI SOAP", desc: "Let the AI parse the audio transcript, analyze drug safety conflicts, and generate prescription drafts." }
                    ].map((step) => (
                      <div key={step.step} className="flex gap-3">
                        <span className="h-5 w-5 rounded-full bg-blue-50 text-[#2563EB] border border-blue-100 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                          {step.step}
                        </span>
                        <div>
                          <p className="font-bold text-slate-800">{step.title}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Priority Clinical Reminders */}
                <div className="border border-[#E5E7EB] rounded-2xl p-5 space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-100">
                        <ClipboardList className="h-4 w-4 text-[#F59E0B]" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-semibold">Priority reminders checklist</span>
                    </div>
                    <div className="space-y-2.5 text-xs">
                      {[
                        "Verify Penicillin allergy warnings before prescription writing",
                        "Approve pending scanned document OCR reports",
                        "Synchronize consultation audio logs with database",
                        "Review cardiology clinic queue status"
                      ].map((item, index) => (
                        <div key={index} className="flex items-start gap-2.5">
                          <input type="checkbox" defaultChecked={index === 3} className="mt-0.5 accent-[#2563EB]" />
                          <span className={`text-[11px] leading-tight ${index === 3 ? "line-through text-slate-400 font-normal" : "text-slate-600 font-medium"}`}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-3">
                    📋 Checklist resets automatically at midnight
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Visual nudge animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}</style>
    </DashboardLayout>
  );
}
