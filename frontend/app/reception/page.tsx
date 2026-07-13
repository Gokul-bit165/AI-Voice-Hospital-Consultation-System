"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Patient } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { Search, UserPlus, Phone, Calendar, Heart, ShieldAlert, FileText, Plus, ChevronRight, ClipboardList } from "lucide-react";

export default function ReceptionDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchType, setSearchType] = useState("name"); // name, phone, id
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  // Debouncing search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300); // 300ms debounce
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // TanStack Query for searching patients
  const { data: patients = [], isLoading } = useQuery({
    queryKey: ["patients", debouncedQuery, searchType],
    queryFn: () => api.searchPatients(debouncedQuery, searchType),
    enabled: true,
  });

  // Query selected patient's details
  const { data: selectedPatient } = useQuery({
    queryKey: ["patient", selectedPatientId],
    queryFn: () => api.getPatient(selectedPatientId!),
    enabled: !!selectedPatientId,
  });

  // Query selected patient's timeline
  const { data: timeline = [] } = useQuery({
    queryKey: ["patient-timeline", selectedPatientId],
    queryFn: () => api.getPatientTimeline(selectedPatientId!),
    enabled: !!selectedPatientId,
  });

  const getAge = (dobString: string) => {
    if (!dobString) return "N/A";
    const dob = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Search and list */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Patient Directory</h2>
              <p className="text-xs text-slate-500">Search or register patient records</p>
            </div>
            <button
              onClick={() => window.location.href = "/reception/register-voice"}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm hover:shadow-sky-600/10 cursor-pointer active:scale-95 transition-all"
            >
              <UserPlus className="h-4 w-4" />
              <span>Voice Register</span>
            </button>
          </div>

          {/* Search bar & Type selection */}
          <div className="space-y-3 mb-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient name, phone, or ID..."
                className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Search By:</span>
              <div className="flex gap-1.5">
                {["name", "phone", "id"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setSearchType(type)}
                    className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer border uppercase tracking-wider ${
                      searchType === type
                        ? "bg-sky-50 border-sky-200 text-sky-700"
                        : "bg-transparent border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto max-h-[50vh] lg:max-h-[60vh] space-y-2 pr-1">
            {isLoading ? (
              <div className="text-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600 mx-auto"></div>
                <p className="text-xs text-slate-400 mt-2 font-medium">Searching patient index...</p>
              </div>
            ) : patients.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl">
                <p className="text-sm text-slate-500 font-medium">No patients found</p>
                <p className="text-xs text-slate-400 mt-1 mb-4">Would you like to register a new patient profile?</p>
                <button
                  onClick={() => window.location.href = "/reception/register-voice"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Start Voice Registration</span>
                </button>
              </div>
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
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{pat.full_name}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-0.5"><Calendar className="h-3.5 w-3.5 text-slate-400" /> DOB: {pat.date_of_birth}</span>
                      <span className="flex items-center gap-0.5"><Phone className="h-3.5 w-3.5 text-slate-400" /> {pat.phone}</span>
                    </div>
                  </div>
                  <ChevronRight className={`h-4 w-4 transition-transform ${selectedPatientId === pat.id ? "text-sky-500 translate-x-0.5" : "text-slate-400"}`} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column: Patient profile and details */}
        <div className="lg:col-span-7 space-y-6">
          {selectedPatient ? (
            <>
              {/* Demographics Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-950">{selectedPatient.full_name}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">Patient ID: {selectedPatient.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-100 text-slate-800 text-xs px-2.5 py-1 rounded-md font-semibold">
                      {selectedPatient.gender}
                    </span>
                    <span className="bg-sky-50 text-sky-700 text-xs px-2.5 py-1 rounded-md font-semibold">
                      {getAge(selectedPatient.date_of_birth)} Yrs Old
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact Number</p>
                    <p className="text-slate-900 mt-0.5 font-medium">{selectedPatient.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Address Location</p>
                    <p className="text-slate-900 mt-0.5 font-medium">{selectedPatient.address || "No address on file"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Emergency Contact</p>
                    <p className="text-slate-900 mt-0.5 font-medium">
                      {selectedPatient.emergency_contact_name || "N/A"} 
                      {selectedPatient.emergency_contact_phone ? ` (${selectedPatient.emergency_contact_phone})` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Blood Group</p>
                      <p className="text-rose-600 mt-0.5 font-bold inline-flex items-center gap-0.5">
                        <Heart className="h-4 w-4 fill-rose-600" />
                        <span>{selectedPatient.blood_group || "Unknown"}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Allergies block */}
                <div className="bg-amber-50/50 border border-amber-200/50 rounded-xl p-3 flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Allergies & Contraindications</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {selectedPatient.allergies && selectedPatient.allergies.length > 0 ? (
                        selectedPatient.allergies.map((allergy, i) => (
                          <span key={i} className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                            {allergy}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-amber-700 font-medium">No known medical allergies on file</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick actions for receptionist */}
                <div className="flex gap-3 mt-5 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => window.location.href = `/patient/${selectedPatient.id}/upload`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer active:scale-98 transition-all"
                  >
                    <FileText className="h-4 w-4" />
                    <span>Upload Medical Records</span>
                  </button>
                </div>
              </div>

              {/* Timeline Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex-1 flex flex-col">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 inline-flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-slate-400" />
                  <span>Medical Visit Timeline</span>
                </h3>
                
                <div className="space-y-4 max-h-[30vh] overflow-y-auto pr-1">
                  {timeline.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">No historical clinical events recorded for this patient.</p>
                  ) : (
                    timeline.map((evt) => (
                      <div key={evt.id} className="relative pl-6 pb-2 border-l border-slate-200 last:border-0 last:pb-0">
                        {/* Event indicator icon dot */}
                        <span className={`absolute left-[-5px] top-1.5 h-2 w-2 rounded-full ${
                          evt.event_type === "registration" ? "bg-sky-500" :
                          evt.event_type === "upload" ? "bg-indigo-500" :
                          evt.event_type === "visit" ? "bg-emerald-500" :
                          evt.event_type === "prescription" ? "bg-rose-500" : "bg-slate-400"
                        }`} />
                        
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-slate-400 font-mono font-semibold">
                            {new Date(evt.event_date).toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-850 font-medium">
                            {evt.event_summary}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full min-h-[40vh] bg-white border border-slate-200 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center text-slate-500">
              <ClipboardList className="h-10 w-10 text-slate-350 mb-3" />
              <p className="text-sm font-bold">No Patient Profile Opened</p>
              <p className="text-xs text-slate-400 mt-1">Please select a patient from the left column search results to view details.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
