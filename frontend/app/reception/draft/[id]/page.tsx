"use client";

import React, { useState, use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { ArrowLeft, Check, AlertCircle, Loader2, FileText, HelpCircle, ShieldAlert } from "lucide-react";

export default function DraftReviewPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const draftId = params.id;

  const [formData, setFormData] = useState({
    full_name: "",
    date_of_birth: "",
    gender: "Male",
    phone: "",
    address: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    blood_group: "Unknown",
    allergies: "",
  });

  const [initialized, setInitialized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Fetch draft
  const { data: draft, isLoading, error } = useQuery({
    queryKey: ["registration-draft", draftId],
    queryFn: async () => {
      const res = await api.getRegistrationDraft(draftId);
      if (res && res.extracted_fields && !initialized) {
        const fields = res.extracted_fields;
        setFormData({
          full_name: fields.full_name || "",
          date_of_birth: fields.date_of_birth || "",
          gender: fields.gender || "Male",
          phone: fields.phone || "",
          address: fields.address || "",
          emergency_contact_name: fields.emergency_contact || "",
          emergency_contact_phone: "", // phone not extracted separately in ocr prompt
          blood_group: fields.blood_group || "Unknown",
          allergies: fields.allergies ? fields.allergies.join(", ") : "",
        });
        setInitialized(true);
      }
      return res;
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="h-full w-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !draft) {
    return (
      <DashboardLayout>
        <div className="h-full w-full flex flex-col items-center justify-center p-6 space-y-4">
          <AlertCircle className="h-12 w-12 text-[#DC2626]" />
          <p className="text-sm font-semibold text-slate-800">Failed to load registration draft.</p>
          <button
            onClick={() => window.location.href = "/reception"}
            className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Go Back
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const getConfidenceBadge = (field: string) => {
    const confidence = draft.extraction_confidence?.[field];
    if (confidence === undefined || confidence === null) {
      return <span className="text-[9px] font-bold text-slate-400 uppercase">Not Extracted</span>;
    }
    const pct = (confidence * 100).toFixed(0);
    if (confidence >= 0.85) {
      return <span className="text-[9px] font-bold text-[#16A34A] bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-wider">{pct}% Match</span>;
    } else if (confidence >= 0.5) {
      return <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider">{pct}% Match</span>;
    } else {
      return <span className="text-[9px] font-bold text-[#DC2626] bg-red-50 px-1.5 py-0.5 rounded uppercase tracking-wider">{pct}% Match</span>;
    }
  };

  const handleRegister = async (force = false) => {
    setSubmitting(true);
    setDuplicateWarning(null);

    const submitData = {
      full_name: formData.full_name,
      date_of_birth: formData.date_of_birth,
      gender: formData.gender,
      phone: formData.phone,
      address: formData.address || null,
      emergency_contact_name: formData.emergency_contact_name || null,
      emergency_contact_phone: formData.emergency_contact_phone || null,
      blood_group: formData.blood_group === "Unknown" ? null : formData.blood_group,
      allergies: formData.allergies.split(",").map((a) => a.trim()).filter((a) => a),
    };

    try {
      const res = await api.confirmRegistrationDraft(draftId, submitData, force);
      if (res && res.id) {
        window.location.href = `/patient/${res.id}`;
      }
    } catch (err: any) {
      if (err.message && err.message.includes("Conflict")) {
        setDuplicateWarning(err.message);
      } else {
        alert(err.message || "Failed to confirm registration.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="h-full w-full p-4 sm:p-6 space-y-6 overflow-y-auto pb-24">
        
        {/* Navigation Back */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => window.location.href = "/reception"}
            className="inline-flex items-center gap-1.5 text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Desk</span>
          </button>
          
          <span className="text-xs font-semibold text-slate-500 font-mono">Draft Reference: {draftId.slice(0,8)}</span>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Review Extracted Demographic Profile</h2>
              <p className="text-xs text-slate-500 mt-1">
                OCR scanned files successfully. Please review and verify the staging draft before committing to patient database records.
              </p>
            </div>

            {/* Files associated with draft */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Uploaded Scan Reference Documents</span>
              <div className="flex flex-wrap gap-2">
                {draft.files && draft.files.map((f: any, idx: number) => (
                  <span key={idx} className="bg-white border border-slate-200 text-slate-800 text-[10px] px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1.5 shadow-sm">
                    <FileText className="h-3.5 w-3.5 text-[#2563EB]" />
                    <span>{f.filename}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Duplicate Patient Alert Dialog Block */}
            {duplicateWarning && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-red-800">
                  <ShieldAlert className="h-5 w-5 text-red-600 fill-red-100 shrink-0" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Duplicate Patient Warning</h4>
                </div>
                <p className="text-xs text-red-800/80 leading-relaxed">{duplicateWarning}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRegister(true)}
                    className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold shadow-sm cursor-pointer transition-all active:scale-95"
                  >
                    Force Register Anyway
                  </button>
                  <button
                    onClick={() => setDuplicateWarning(null)}
                    className="px-3.5 py-2 bg-white border border-red-200 text-red-700 hover:bg-red-100 rounded-lg text-[10px] font-bold cursor-pointer transition-all"
                  >
                    Cancel Resolution
                  </button>
                </div>
              </div>
            )}

            {/* Staging registration form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              
              {/* Full Name */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Full Name *</label>
                  {getConfidenceBadge("full_name")}
                </div>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors text-xs"
                />
              </div>

              {/* DOB */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Date of Birth *</label>
                  {getConfidenceBadge("date_of_birth")}
                </div>
                <input
                  type="date"
                  required
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-805 font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors text-xs"
                />
              </div>

              {/* Gender */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Gender *</label>
                  {getConfidenceBadge("gender")}
                </div>
                <select
                  required
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-850 font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors text-xs"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Contact Phone */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Contact Phone *</label>
                  {getConfidenceBadge("phone")}
                </div>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors text-xs"
                />
              </div>

              {/* Blood Group */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Blood Group</label>
                  {getConfidenceBadge("blood_group")}
                </div>
                <select
                  value={formData.blood_group}
                  onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-850 font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors text-xs"
                >
                  <option value="Unknown">Unknown</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>

              {/* Residential Address */}
              <div className="space-y-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Address</label>
                  {getConfidenceBadge("address")}
                </div>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. 123 Main St, Metro City"
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors text-xs"
                />
              </div>

              {/* Emergency Contact Name */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Emergency Contact Name</label>
                  {getConfidenceBadge("emergency_contact")}
                </div>
                <input
                  type="text"
                  value={formData.emergency_contact_name}
                  onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                  placeholder="e.g. Mary R."
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors text-xs"
                />
              </div>

              {/* Emergency Contact Phone */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Emergency Contact Phone</label>
                <input
                  type="text"
                  value={formData.emergency_contact_phone}
                  onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                  placeholder="e.g. 9876543211"
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors text-xs"
                />
              </div>

              {/* Allergies */}
              <div className="space-y-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Allergies (Comma separated)</label>
                  {getConfidenceBadge("allergies")}
                </div>
                <input
                  type="text"
                  value={formData.allergies}
                  onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                  placeholder="e.g. Penicillin, Peanuts"
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-slate-800 font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors text-xs"
                />
              </div>

            </div>

            {/* Form actions */}
            <div className="border-t border-[#E5E7EB] pt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => window.location.href = "/reception"}
                className="px-4 py-2.5 border border-[#E5E7EB] text-slate-700 hover:bg-[#F8FAFC] rounded-xl text-xs font-bold cursor-pointer transition-colors active:scale-95"
              >
                Cancel Review
              </button>
              
              <button
                onClick={() => handleRegister(false)}
                disabled={submitting}
                className="px-5 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors active:scale-95 shadow-sm"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>Confirm & Register Patient</span>
              </button>
            </div>

          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
