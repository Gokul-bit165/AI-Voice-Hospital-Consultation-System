"use client";

import React, { useState, useRef } from "react";
import { api, PatientCreate } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { Mic, Square, Loader2, ArrowLeft, CheckCircle2, UserCircle2, ShieldAlert } from "lucide-react";

export default function RegisterVoicePage() {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  
  // Structured draft details returned from LLM
  const [patientDraft, setPatientDraft] = useState<PatientCreate | null>(null);
  
  // Submit state
  const [submitLoading, setSubmitLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);
        
        // Stop all tracks on the stream
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
      setPatientDraft(null);
      setTranscript(null);
    } catch (err) {
      alert("Microphone access is required to use voice registration. Please grant permission.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setLoading(true);
    try {
      // Convert Blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        // Strip the header "data:audio/webm;base64,"
        const base64Audio = base64Data.split(",")[1];
        
        // Send to API
        const draft = await api.voiceRegister(base64Audio);
        setPatientDraft(draft);
      };
    } catch (err: any) {
      alert(err.message || "Failed to process speech. Please speak clearly and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field: keyof PatientCreate, value: any) => {
    if (!patientDraft) return;
    setPatientDraft({
      ...patientDraft,
      [field]: value,
    });
  };

  const handleAllergyChange = (index: number, val: string) => {
    if (!patientDraft) return;
    const list = [...patientDraft.allergies];
    list[index] = val;
    setPatientDraft({ ...patientDraft, allergies: list });
  };

  const addAllergyField = () => {
    if (!patientDraft) return;
    setPatientDraft({
      ...patientDraft,
      allergies: [...patientDraft.allergies, ""],
    });
  };

  const removeAllergyField = (index: number) => {
    if (!patientDraft) return;
    const list = patientDraft.allergies.filter((_, i) => i !== index);
    setPatientDraft({ ...patientDraft, allergies: list });
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientDraft) return;
    
    setSubmitLoading(true);
    try {
      // Strip empty allergies
      const cleanAllergies = patientDraft.allergies.filter(a => a.trim() !== "");
      const finalPatient = { ...patientDraft, allergies: cleanAllergies };
      
      await api.createPatient(finalPatient);
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/reception";
      }, 1500);
    } catch (err: any) {
      alert(err.message || "Failed to register patient profile.");
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="h-full w-full p-4 sm:p-6 overflow-y-auto pb-24">
        <button
          onClick={() => window.location.href = "/reception"}
          className="inline-flex items-center gap-1.5 text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider mb-5 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Directory</span>
        </button>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 sm:p-8 shadow-sm max-w-3xl mx-auto">
          <div className="text-center max-w-lg mx-auto mb-8">
            <h2 className="text-base font-bold text-[#111827] uppercase tracking-wider">Voice Demographics Registration</h2>
            <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
              Press the recording button and speak the patient's demographics details clearly. 
              Example: <i>"Patient name is Alex Cooper, age 45, male. Phone number is 9876500123. Emergency contact is Helen Cooper at 9876500124. Allergies: Penicillin."</i>
            </p>
          </div>

          {/* Voice recorder interface */}
          <div className="flex flex-col items-center justify-center py-6 border border-[#E5E7EB] bg-[#F8FAFC] rounded-2xl mb-8">
            {recording ? (
              <div className="flex flex-col items-center space-y-4">
                {/* Stylized waveform */}
                <div className="flex items-end gap-[3px] h-8 px-6">
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className="w-[2px] bg-[#2563EB] rounded-full"
                      style={{
                        height: "100%",
                        animation: `rxwave ${0.4 + (i % 4) * 0.1}s ease-in-out infinite alternate`,
                        animationDelay: `${i * 0.03}s`
                      }}
                    ></div>
                  ))}
                </div>
                <p className="text-xs text-[#2563EB] font-bold uppercase tracking-wider animate-pulse">Recording patient details... click stop when finished.</p>
                <button
                  onClick={stopRecording}
                  className="p-4 bg-[#DC2626] hover:bg-red-700 text-white rounded-full shadow-sm active:scale-95 transition-all cursor-pointer flex-shrink-0"
                >
                  <Square className="h-5 w-5 fill-white" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4">
                <p className="text-xs text-[#6B7280] font-bold uppercase tracking-wider">Press microphone to start recording dictation</p>
                <button
                  onClick={startRecording}
                  disabled={loading}
                  className="p-4 bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white rounded-full shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Mic className="h-5 w-5" />
                </button>
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 mt-4 text-xs font-bold text-[#2563EB] uppercase tracking-wider">
                <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
                <span>AI Clinical Extraction parsing speech transcript...</span>
              </div>
            )}
          </div>

          {/* Registration form details */}
          {patientDraft && (
            <form onSubmit={handleConfirmSubmit} className="space-y-6">
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex gap-3 mb-2">
                <UserCircle2 className="h-6 w-6 text-[#2563EB] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold text-[#111827] uppercase tracking-wider">Review Speech Extracted Details</h3>
                  <p className="text-xs text-[#6B7280] mt-0.5">Please review the AI extracted demographics profile below. Edit fields manually if needed before finalizing.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Full Patient Name</label>
                  <input
                    type="text"
                    required
                    value={patientDraft.full_name}
                    onChange={(e) => handleFieldChange("full_name", e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Date of Birth</label>
                  <input
                    type="date"
                    required
                    value={patientDraft.date_of_birth}
                    onChange={(e) => handleFieldChange("date_of_birth", e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-slate-850 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Gender</label>
                  <select
                    required
                    value={patientDraft.gender}
                    onChange={(e) => handleFieldChange("gender", e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-slate-850 focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Contact Phone</label>
                  <input
                    type="text"
                    required
                    value={patientDraft.phone}
                    onChange={(e) => handleFieldChange("phone", e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-slate-850 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Emergency Contact Name</label>
                  <input
                    type="text"
                    value={patientDraft.emergency_contact_name || ""}
                    onChange={(e) => handleFieldChange("emergency_contact_name", e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-slate-850 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Emergency Contact Phone</label>
                  <input
                    type="text"
                    value={patientDraft.emergency_contact_phone || ""}
                    onChange={(e) => handleFieldChange("emergency_contact_phone", e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-slate-850 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Address</label>
                  <input
                    type="text"
                    value={patientDraft.address || ""}
                    onChange={(e) => handleFieldChange("address", e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-slate-850 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                {/* Allergies subform */}
                <div className="col-span-1 md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Allergies & Contraindications</label>
                    <button
                      type="button"
                      onClick={addAllergyField}
                      className="px-2 py-1 rounded bg-blue-50 border border-blue-100 text-[10px] font-bold text-[#2563EB] hover:bg-blue-100 cursor-pointer"
                    >
                      + Add Allergy
                    </button>
                  </div>
                  {patientDraft.allergies.length === 0 ? (
                    <p className="text-xs italic text-[#6B7280]">No allergies captured. Click Add Allergy if needed.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {patientDraft.allergies.map((allergy, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            type="text"
                            required
                            value={allergy}
                            onChange={(e) => handleAllergyChange(i, e.target.value)}
                            placeholder="e.g. Penicillin"
                            className="flex-1 px-3.5 py-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-slate-850 focus:outline-none focus:border-[#2563EB]"
                          />
                          <button
                            type="button"
                            onClick={() => removeAllergyField(i)}
                            className="px-3 bg-red-50 hover:bg-red-100 text-[#DC2626] border border-red-100 rounded-xl font-bold text-xs cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setPatientDraft(null)}
                  className="px-4 py-2.5 border border-[#E5E7EB] hover:bg-slate-50 text-slate-700 rounded-xl font-bold cursor-pointer text-xs"
                >
                  Discard Draft
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="px-5 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer transition-all active:scale-95 text-xs shadow-sm flex items-center gap-1.5"
                >
                  {submitLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>Save Demographics Profile</span>
                </button>
              </div>
            </form>
          )}

          {success && (
            <div className="mt-6 bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-[#16A34A] shrink-0" />
              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Patient profile saved successfully! Redirecting...</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Waveform keyframe animations */}
      <style>{`
        @keyframes rxwave {
          from { transform: scaleY(0.12); opacity: 0.5; }
          to   { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </DashboardLayout>
  );
}
