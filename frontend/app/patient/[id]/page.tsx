"use client";

import React, { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import ProfileDiscrepancies from "@/components/ProfileDiscrepancies";
import { ArrowLeft, Calendar, Phone, Heart, ShieldAlert, FileText, ChevronRight, Play, Upload, Clock, UserPlus, Loader2, Eye, Trash2 } from "lucide-react";

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

  const handleDeletePatient = async () => {
    if (confirm("Are you sure you want to permanently delete this patient record and all their clinical files? This action cannot be undone.")) {
      try {
        await api.deletePatient(patientId);
        alert("Patient record deleted successfully.");
        if (typeof window !== "undefined") {
          const role = localStorage.getItem("role");
          window.location.href = role === "Doctor" ? "/doctor" : "/reception";
        }
      } catch (err: any) {
        alert("Failed to delete patient: " + err.message);
      }
    }
  };

  const handleViewDocument = async (recordId: string, filename: string) => {
    try {
      const blob = await api.viewRecord(recordId);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      // Revoke object URL after a short delay to free memory
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (!win) alert("Please allow pop-ups to view documents.");
    } catch (err: any) {
      alert(err?.message || "Failed to open document. Please try again.");
    }
  };

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
    <DashboardLayout>
      {patient ? (
        <div className="h-full w-full p-4 sm:p-6 space-y-6 overflow-y-auto pb-24">
          
          {/* Header section with back navigation and direct quick action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  const role = localStorage.getItem("role");
                  window.location.href = role === "Doctor" ? "/doctor" : "/reception";
                }
              }}
              className="inline-flex items-center gap-1.5 text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Dashboard</span>
            </button>
            
            <div className="flex gap-2">
              <button
                onClick={() => window.location.href = `/patient/${patientId}/consultation`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer active:scale-95 transition-all"
              >
                <Play className="h-4 w-4 fill-white" />
                <span>Start Voice Consultation</span>
              </button>
              
              <button
                onClick={() => window.location.href = `/patient/${patientId}/upload`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-[#E5E7EB] text-[#111827] hover:bg-[#F8FAFC] hover:border-slate-300 rounded-xl text-xs font-bold cursor-pointer active:scale-95 transition-all"
              >
                <Upload className="h-4 w-4 text-[#2563EB]" />
                <span>Upload Records</span>
              </button>

              <button
                onClick={handleDeletePatient}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-xl text-xs font-bold cursor-pointer active:scale-95 transition-all"
              >
                <Trash2 className="h-4 w-4 text-red-600" />
                <span>Delete Patient</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left column: Demographics info (cols 4) */}
            <div className="lg:col-span-4 bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-bold text-[#111827]">{patient.full_name}</h2>
                <p className="text-xs text-[#6B7280] font-mono mt-1">ID: {patient.id}</p>
              </div>

              <div className="border-t border-[#E5E7EB] pt-4 space-y-3.5 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Date of Birth</span>
                  <p className="text-slate-800 font-semibold mt-0.5">{patient.date_of_birth} ({getAge(patient.date_of_birth)} years old)</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Gender Identity</span>
                  <p className="text-slate-800 font-semibold mt-0.5">{patient.gender}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Contact Number</span>
                  <p className="text-slate-800 font-semibold mt-0.5">{patient.phone}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Residential Address</span>
                  <p className="text-slate-800 font-semibold mt-0.5">{patient.address || "N/A"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Emergency Contact</span>
                  <p className="text-slate-800 font-semibold mt-0.5">
                    {patient.emergency_contact_name || "N/A"}<br />
                    {patient.emergency_contact_phone && <span className="text-[#6B7280] font-medium">{patient.emergency_contact_phone}</span>}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Blood Group</span>
                  <p className="text-[#DC2626] font-bold text-sm mt-0.5 inline-flex items-center gap-1">
                    <Heart className="h-4 w-4 fill-[#DC2626] stroke-none" />
                    <span>{patient.blood_group || "Unknown"}</span>
                  </p>
                </div>
              </div>

              {/* Allergies Alerts */}
              <div className="bg-amber-50/50 border border-amber-250/50 rounded-xl p-4">
                <span className="text-xs font-bold text-amber-850 uppercase tracking-wider inline-flex items-center gap-1.5 mb-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  <span>Allergies & Alerts</span>
                </span>
                <div className="flex flex-wrap gap-1">
                  {patient.allergies && patient.allergies.length > 0 ? (
                    patient.allergies.map((allergy, i) => (
                      <span key={i} className="bg-amber-100 text-amber-850 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
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
              
              {/* Profile Discrepancies Reconciliation */}
              <ProfileDiscrepancies patientId={patientId} />
              
              {/* Medical Records List */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-[#111827] uppercase tracking-wider mb-4 inline-flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#2563EB]" />
                  <span>Patient Medical Records ({records.length})</span>
                </h3>

                {records.length === 0 ? (
                  <div className="text-center py-8 border border-[#E5E7EB] border-dashed rounded-2xl bg-[#F8FAFC]">
                    <p className="text-xs text-[#6B7280]">No scanned records or diagnostics uploaded yet.</p>
                    <button
                      onClick={() => window.location.href = `/patient/${patientId}/upload`}
                      className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 shadow-sm"
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
                        className="p-3 border border-[#E5E7EB] rounded-xl flex items-center justify-between hover:bg-slate-50 transition-colors bg-white"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-50 text-[#2563EB] p-2.5 rounded-xl border border-blue-100">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#111827]">{rec.original_filename}</p>
                            <p className="text-[10px] text-[#6B7280] font-medium mt-0.5">
                              Uploaded by: {rec.uploaded_by} | {new Date(rec.uploaded_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          {rec.file_available ? (
                            <button
                              onClick={() => handleViewDocument(rec.id, rec.original_filename)}
                              className="inline-flex items-center gap-1 text-[10px] text-[#2563EB] hover:bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg font-bold cursor-pointer transition-colors"
                              title="Open document in new tab"
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] text-[#DC2626] bg-red-50 border border-red-100 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider" title="File no longer on disk. Please re-upload.">
                              ⚠ File Missing
                            </span>
                          )}
                          {rec.ocr_record ? (
                            <span className="bg-emerald-50 border border-emerald-100 text-[#16A34A] text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              OCR Sync ({rec.ocr_record.ocr_engine_used})
                            </span>
                          ) : (
                            <button
                              onClick={() => window.location.href = `/patient/${patientId}/upload`}
                              className="text-[10px] text-[#2563EB] hover:underline font-bold cursor-pointer"
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
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-[#111827] uppercase tracking-wider mb-4 inline-flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#2563EB]" />
                  <span>Clinical Case Timeline</span>
                </h3>

                <div className="space-y-4">
                  {timeline.length === 0 ? (
                    <p className="text-xs text-[#6B7280] text-center py-6">No historical clinical actions registered.</p>
                  ) : (
                    timeline.map((evt) => (
                      <div key={evt.id} className="relative pl-6 pb-4 border-l border-[#E5E7EB] last:border-0 last:pb-0">
                        <span className={`absolute left-[-4.5px] top-1.5 h-2 w-2 rounded-full ${
                          evt.event_type === "registration" ? "bg-[#2563EB]" :
                          evt.event_type === "upload" ? "bg-indigo-500" :
                          evt.event_type === "visit" ? "bg-[#16A34A]" :
                          evt.event_type === "prescription" ? "bg-[#DC2626]" : "bg-slate-400"
                        }`} />
                        
                        <div className="flex items-start justify-between gap-4 text-xs">
                          <div>
                            <p className="text-[9px] text-[#6B7280] font-mono font-semibold">
                              {new Date(evt.event_date).toLocaleString()}
                            </p>
                            <p className="text-slate-805 font-semibold mt-0.5 leading-tight">
                              {evt.event_summary}
                            </p>
                          </div>
                          {evt.event_type === "prescription" && evt.reference_id && (
                            <button
                              onClick={() => window.location.href = `/patient/${patientId}/prescription/preview?prescriptionId=${evt.reference_id}`}
                              className="text-[10px] text-[#2563EB] hover:underline font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>View Prescription</span>
                            </button>
                          )}
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
        <div className="h-full w-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
        </div>
      )}
    </DashboardLayout>
  );
}
