"use client";

import React, { useState, useRef } from "react";
import { api, PatientCreate } from "@/lib/api";
import Navbar from "@/components/Navbar";
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
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6">
        <button
          onClick={() => window.location.href = "/reception"}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 text-xs font-semibold uppercase tracking-wider mb-5 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Reception</span>
        </button>

        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          <div className="text-center max-w-lg mx-auto mb-8">
            <h2 className="text-xl font-bold text-slate-900">Voice Demographics Registration</h2>
            <p className="text-xs text-slate-500 mt-1">
              Press the recording button and speak the patient's demographics details clearly. 
              Example: <i>"Patient name is Alex Cooper, age 45, male. Phone number is 9876500123. Emergency contact is Helen Cooper at 9876500124. Allergies: Penicillin."</i>
            </p>
          </div>

          {/* Voice recorder interface */}
          <div className="flex flex-col items-center justify-center py-6 border border-slate-100 bg-slate-50/50 rounded-2xl mb-8">
            {recording ? (
              <div className="flex flex-col items-center space-y-4">
                {/* Stylized waveform */}
                <div className="flex items-end gap-1.5 h-10 px-6">
                  {[...Array(9)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-sky-500 rounded-full animate-bounce"
                      style={{
                        height: `${Math.random() * 80 + 20}%`,
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: "0.6s"
                      }}
                    ></div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 font-semibold animate-pulse">Recording patient details... click stop when finished.</p>
                <button
                  onClick={stopRecording}
                  className="p-4 bg-rose-600 hover:bg-rose-500 text-white rounded-full shadow-lg shadow-rose-600/10 active:scale-95 transition-all cursor-pointer"
                >
                  <Square className="h-5 w-5 fill-white" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4">
                <p className="text-xs text-slate-400 font-semibold">Press microphone to start recording dictation</p>
                <button
                  onClick={startRecording}
                  disabled={loading}
                  className="p-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-full shadow-lg shadow-sky-600/10 active:scale-95 transition-all cursor-pointer mic-pulse"
                >
                  <Mic className="h-5 w-5" />
                </button>
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 mt-4 text-xs font-semibold text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                <span>AI Clinical Extraction parsing speech transcript...</span>
              </div>
            )}
          </div>

          {/* Render confirmation form when draft parsed */}
          {patientDraft && (
            <div className="border-t border-slate-100 pt-6">
              <div className="flex items-center gap-2 mb-5">
                <UserCircle2 className="h-5 w-5 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Confirm Patient Demographics Draft</h3>
              </div>

              <form onSubmit={handleConfirmSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={patientDraft.full_name || ""}
                      onChange={(e) => handleFieldChange("full_name", e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Date of Birth</label>
                    <input
                      type="date"
                      required
                      value={patientDraft.date_of_birth || ""}
                      onChange={(e) => handleFieldChange("date_of_birth", e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Gender</label>
                    <select
                      value={patientDraft.gender || ""}
                      onChange={(e) => handleFieldChange("gender", e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500 focus:bg-white"
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Phone Number</label>
                    <input
                      type="text"
                      required
                      value={patientDraft.phone || ""}
                      onChange={(e) => handleFieldChange("phone", e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Residential Address</label>
                    <input
                      type="text"
                      value={patientDraft.address || ""}
                      onChange={(e) => handleFieldChange("address", e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Emergency Contact Name</label>
                    <input
                      type="text"
                      value={patientDraft.emergency_contact_name || ""}
                      onChange={(e) => handleFieldChange("emergency_contact_name", e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Emergency Contact Phone</label>
                    <input
                      type="text"
                      value={patientDraft.emergency_contact_phone || ""}
                      onChange={(e) => handleFieldChange("emergency_contact_phone", e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Blood Group</label>
                    <select
                      value={patientDraft.blood_group || ""}
                      onChange={(e) => handleFieldChange("blood_group", e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500 focus:bg-white"
                    >
                      <option value="">Select Blood Group</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                    </select>
                  </div>
                </div>

                {/* Allergies list section */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wide inline-flex items-center gap-1.5">
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      <span>Allergies</span>
                    </span>
                    <button
                      type="button"
                      onClick={addAllergyField}
                      className="text-xs text-sky-600 hover:text-sky-500 font-semibold cursor-pointer"
                    >
                      + Add Allergy
                    </button>
                  </div>
                  
                  {patientDraft.allergies.length === 0 ? (
                    <p className="text-xs text-slate-400">No allergies listed. Click Add Allergy if patient has known reactions.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {patientDraft.allergies.map((allergy, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            type="text"
                            placeholder="e.g. Penicillin"
                            value={allergy}
                            onChange={(e) => handleAllergyChange(i, e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-sky-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeAllergyField(i)}
                            className="text-xs text-rose-500 font-bold hover:underline cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-lg hover:shadow-sky-600/10 transition-all cursor-pointer"
                  >
                    {submitLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Saving patient profile...</span>
                      </>
                    ) : success ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 fill-white" />
                        <span>Registration Successful!</span>
                      </>
                    ) : (
                      <span>Save and Confirm Registration</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
