"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { Search, User, Clipboard, Play, CheckCircle2, History, ChevronRight } from "lucide-react";

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
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Patient Queue / List */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">Doctor's Patient Queue</h2>
            <p className="text-xs text-slate-500">Select a patient to review profile or begin a voice consultation</p>
          </div>

          <div className="relative mb-4">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patients by name..."
              className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
            />
          </div>

          <div className="flex-1 overflow-y-auto max-h-[55vh] space-y-2 pr-1">
            {isLoading ? (
              <div className="text-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600 mx-auto"></div>
              </div>
            ) : patients.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No patient records found.</p>
            ) : (
              patients.map((pat) => (
                <div
                  key={pat.id}
                  onClick={() => setSelectedPatientId(pat.id)}
                  className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                    selectedPatientId === pat.id
                      ? "border-sky-500 bg-sky-50/50 shadow-sm"
                      : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-100 p-2 rounded-full text-slate-600">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{pat.full_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">DOB: {pat.date_of_birth}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column: Patient Card & Consulting Start options */}
        <div className="lg:col-span-7">
          {selectedPatient ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedPatient.full_name}</h3>
                  <p className="text-xs text-slate-500 mt-1">DOB: {selectedPatient.date_of_birth} | Phone: {selectedPatient.phone}</p>
                </div>
                <span className="bg-sky-50 text-sky-700 text-xs px-2.5 py-1 rounded-md font-bold">
                  Cardiology Clinic
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider block">Blood Group</span>
                  <span className="text-rose-600 font-bold text-sm mt-0.5 inline-block">{selectedPatient.blood_group || "N/A"}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider block">Allergies Warning</span>
                  <span className="text-slate-900 font-medium text-xs mt-0.5 inline-block">
                    {selectedPatient.allergies.join(", ") || "No known allergies"}
                  </span>
                </div>
              </div>

              {/* Consultation flow prompt options */}
              <div className="bg-sky-50/50 border border-sky-100 rounded-xl p-4 flex gap-4">
                <Clipboard className="h-8 w-8 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-sky-950">Active Voice Consultation Room</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Entering the room starts a consultation. While consulting, the portal transcribes conversation, allows patient RAG matching, and compiles SOAP notes.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={() => window.location.href = `/patient/${selectedPatient.id}/consultation`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-lg hover:shadow-sky-600/10 cursor-pointer transition-all active:scale-98"
                >
                  <Play className="h-4 w-4 fill-white" />
                  <span>Start Live voice Consultation</span>
                </button>
                
                <button
                  onClick={() => window.location.href = `/patient/${selectedPatient.id}`}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-all active:scale-98"
                >
                  <History className="h-4 w-4" />
                  <span>View Clinical History</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[40vh] bg-white border border-slate-200 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center text-slate-500 shadow-sm">
              <Clipboard className="h-10 w-10 text-slate-300 mb-3" />
              <p className="text-sm font-bold">Select Patient for Consultation</p>
              <p className="text-xs text-slate-400 mt-1">Choose a patient from your queue on the left to start consulting.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
