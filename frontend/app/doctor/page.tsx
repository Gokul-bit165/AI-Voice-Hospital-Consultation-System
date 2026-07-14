"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { Search, User, Clipboard, Play, CheckCircle2, History, ChevronRight, Loader2 } from "lucide-react";

export default function DoctorDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

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
        <div className="lg:col-span-5 bg-white border border-[#E5E7EB] rounded-2xl p-5 flex flex-col shadow-sm h-fit max-h-[80vh]">
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
              <div className="text-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB] mx-auto" />
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
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm space-y-6">
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
            <div className="h-full min-h-[40vh] bg-white border border-dashed border-[#E5E7EB] rounded-2xl flex flex-col items-center justify-center p-6 text-center text-[#6B7280] shadow-sm">
              <Clipboard className="h-10 w-10 text-slate-350 mb-3" />
              <p className="text-xs font-bold uppercase tracking-wider text-[#111827]">Select Patient for Consultation</p>
              <p className="text-xs text-[#6B7280] mt-1">Choose a patient from your queue on the left to start consulting.</p>
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
