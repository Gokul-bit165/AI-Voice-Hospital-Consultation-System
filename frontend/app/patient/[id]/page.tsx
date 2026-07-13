"use client";

import React, { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { ArrowLeft, Calendar, Phone, Heart, ShieldAlert, FileText, ChevronRight, Play, Upload, Clock, UserPlus } from "lucide-react";

export default function PatientProfilePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const patientId = params.id;

  // Fetch patient profile
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.getPatient(patientId),
  });

  // Fetch patient records
  const { data: records = [] } = useQuery({
    queryKey: ["patient-records", patientId],
    queryFn: () => api.getRecords(patientId),
  });

  // Fetch patient timeline
  const { data: timeline = [] } = useQuery({
    queryKey: ["patient-timeline", patientId],
    queryFn: () => api.getPatientTimeline(patientId),
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
      
      {patient ? (
        <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
          
          {/* Header section with back navigation and direct quick action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  const role = localStorage.getItem("role");
                  window.location.href = role === "Doctor" ? "/doctor" : "/reception";
                }
              }}
              className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Dashboard</span>
            </button>
            
            <div className="flex gap-2">
              <button
                onClick={() => window.location.href = `/patient/${patientId}/consultation`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-sm hover:shadow-sky-600/10 cursor-pointer active:scale-95 transition-all"
              >
                <Play className="h-4 w-4 fill-white" />
                <span>Start Voice Consultation</span>
              </button>
              
              <button
                onClick={() => window.location.href = `/patient/${patientId}/upload`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all"
              >
                <Upload className="h-4 w-4" />
                <span>Upload Records</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left column: Demographics info (cols 4) */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{patient.full_name}</h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {patient.id}</p>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3 text-xs">
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider">Date of Birth</span>
                  <p className="text-slate-850 font-medium text-sm mt-0.5">{patient.date_of_birth} ({getAge(patient.date_of_birth)} years old)</p>
                </div>
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider">Gender Identity</span>
                  <p className="text-slate-850 font-medium text-sm mt-0.5">{patient.gender}</p>
                </div>
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider">Contact Number</span>
                  <p className="text-slate-850 font-medium text-sm mt-0.5">{patient.phone}</p>
                </div>
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider">Residential Address</span>
                  <p className="text-slate-850 font-medium text-sm mt-0.5">{patient.address || "N/A"}</p>
                </div>
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider">Emergency Contact</span>
                  <p className="text-slate-850 font-medium text-sm mt-0.5">
                    {patient.emergency_contact_name || "N/A"}<br />
                    {patient.emergency_contact_phone && <span className="text-slate-500">{patient.emergency_contact_phone}</span>}
                  </p>
                </div>
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider">Blood Group</span>
                  <p className="text-rose-600 font-bold text-sm mt-0.5 inline-flex items-center gap-1">
                    <Heart className="h-4 w-4 fill-rose-600" />
                    <span>{patient.blood_group || "Unknown"}</span>
                  </p>
                </div>
              </div>

              {/* Allergies Alerts */}
              <div className="bg-amber-50/50 border border-amber-200/50 rounded-xl p-4">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider inline-flex items-center gap-1.5 mb-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  <span>Allergies & Alerts</span>
                </span>
                <div className="flex flex-wrap gap-1">
                  {patient.allergies && patient.allergies.length > 0 ? (
                    patient.allergies.map((allergy, i) => (
                      <span key={i} className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                        {allergy}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-amber-700 font-medium">No allergies on record.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right column: Timeline and Records (cols 8) */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Medical Records List */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 inline-flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <span>Patient Medical Records ({records.length})</span>
                </h3>

                {records.length === 0 ? (
                  <div className="text-center py-8 border border-slate-100 rounded-xl bg-slate-50/50">
                    <p className="text-xs text-slate-500">No scanned records or diagnostics uploaded yet.</p>
                    <button
                      onClick={() => window.location.href = `/patient/${patientId}/upload`}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Medical Record</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {records.map((rec) => (
                      <div
                        key={rec.id}
                        className="p-3 border border-slate-100 rounded-xl flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-sky-50 text-sky-600 p-2.5 rounded-xl border border-sky-100">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{rec.original_filename}</p>
                            <p className="text-[10px] text-slate-400">
                              Uploaded by: {rec.uploaded_by} | {new Date(rec.uploaded_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {rec.ocr_record ? (
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              OCR Sync ({rec.ocr_record.ocr_engine_used})
                            </span>
                          ) : (
                            <button
                              onClick={() => window.location.href = `/patient/${patientId}/upload`}
                              className="text-[10px] text-sky-600 hover:underline font-bold cursor-pointer"
                            >
                              Run OCR Parsing
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detailed Timeline */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 inline-flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span>Clinical Case Timeline</span>
                </h3>

                <div className="space-y-4">
                  {timeline.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">No historical clinical actions registered.</p>
                  ) : (
                    timeline.map((evt) => (
                      <div key={evt.id} className="relative pl-6 pb-4 border-l border-slate-200 last:border-0 last:pb-0">
                        <span className={`absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full ${
                          evt.event_type === "registration" ? "bg-sky-500" :
                          evt.event_type === "upload" ? "bg-indigo-500" :
                          evt.event_type === "visit" ? "bg-emerald-500" :
                          evt.event_type === "prescription" ? "bg-rose-500" : "bg-slate-400"
                        }`} />
                        
                        <div>
                          <p className="text-[10px] text-slate-400 font-mono font-semibold">
                            {new Date(evt.event_date).toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-850 font-semibold mt-0.5">
                            {evt.event_summary}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center py-10 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto"></div>
        </div>
      )}
    </div>
  );
}
