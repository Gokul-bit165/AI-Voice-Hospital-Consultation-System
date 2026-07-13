"use client";

import React, { useState, useEffect, useRef, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Visit, SOAPNotes, Vitals, Medicine, Prescription } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { 
  ArrowLeft, Play, Square, Loader2, Wand2, Save, Printer, CheckCircle, 
  MessageSquare, Send, BookOpen, HeartPulse, User, ListPlus, Volume2
} from "lucide-react";

export default function ConsultationPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const patientId = params.id;
  const queryClient = useQueryClient();

  // Active visit and prescription reference states
  const [activeVisit, setActiveVisit] = useState<Visit | null>(null);
  
  // Voice streaming websocket states
  const [listening, setListening] = useState(false);
  const [transcriptSegments, setTranscriptSegments] = useState<Array<{ role: string; text: string; time: string }>>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioIntervalRef = useRef<any>(null);

  // Active tab state in clinical panel: 'soap' | 'vitals' | 'prescription'
  const [activeTab, setActiveTab] = useState<"soap" | "vitals" | "prescription">("soap");

  // Local drafts (which are filled by Scribe or manually editable)
  const [soapNotes, setSoapNotes] = useState<SOAPNotes>({ subjective: "", objective: "", assessment: "", plan: "" });
  const [vitals, setVitals] = useState<Vitals>({ bp: "", hr: "", temp: "", weight: "", spo2: "" });
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [prescLoading, setPrescLoading] = useState(false);
  
  // RAG Chat Sidebar states
  const [ragQuery, setRagQuery] = useState("");
  const [ragMessages, setRagMessages] = useState<Array<{ sender: "user" | "ai"; text: string; citations?: string[] }>>([
    { sender: "ai", text: "Hello Dr. Jenkins. I am your clinical RAG assistant. Ask me anything about this patient's history." }
  ]);
  const [ragLoading, setRagLoading] = useState(false);

  // Voice Command push-to-talk states
  const [voiceCommandListening, setVoiceCommandListening] = useState(false);
  const commandRecorderRef = useRef<MediaRecorder | null>(null);
  const commandChunksRef = useRef<Blob[]>([]);

  // Fetch patient profile
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.getPatient(patientId),
  });

  // Start the visit on mount
  useEffect(() => {
    const initVisit = async () => {
      try {
        const visit = await api.startVisit(patientId, "General consultation");
        setActiveVisit(visit);
        
        // Load initial values from visit details
        if (visit.soap_notes) setSoapNotes(visit.soap_notes);
        if (visit.vitals) setVitals(visit.vitals);
        if (visit.prescription) setMedicines(visit.prescription.medicines || []);
      } catch (err: any) {
        alert("Failed to initialize consultation session: " + err.message);
      }
    };
    initVisit();

    return () => {
      stopListening();
    };
  }, [patientId]);

  // WebSocket Live Transcription Start/Stop
  const startListening = async () => {
    if (!activeVisit) return;
    setListening(true);
    
    // Clear transcript preview
    setTranscriptSegments([]);

    // 1. Connect WS
    const wsUrl = `ws://localhost:8000/api/v1/visits/${activeVisit.id}/transcribe-stream`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected for live transcript stream");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.transcript) {
        setTranscriptSegments(prev => [
          ...prev, 
          { role: data.role, text: data.transcript, time: new Date(data.timestamp).toLocaleTimeString() }
        ]);
      } else if (data.error) {
        console.error("Transcription WS error:", data.error);
      }
    };

    ws.onerror = (err) => {
      console.error("WS error: ", err);
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
    };

    // 2. Open Microphone Stream and record chunks
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          // Convert Blob to base64
          const reader = new FileReader();
          reader.readAsDataURL(event.data);
          reader.onloadend = () => {
            const base64Data = reader.result as string;
            const base64Audio = base64Data.split(",")[1];
            
            ws.send(JSON.stringify({
              role: "doctor",
              audio_base64: base64Audio
            }));
          };
        }
      };

      // Slice audio chunks every 1.5 seconds to balance responsiveness and quality
      mediaRecorder.start(1500);
    } catch (err) {
      console.error("Could not capture microphone stream: ", err);
      setListening(false);
      ws.close();
    }
  };

  const stopListening = () => {
    setListening(false);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  // Run AI Clinical Scribe
  const handleScribe = async () => {
    if (!activeVisit) return;
    setPrescLoading(true);
    try {
      const updatedVisit = await api.scribeVisit(activeVisit.id);
      setActiveVisit(updatedVisit);
      
      // Update local drafts
      if (updatedVisit.soap_notes) setSoapNotes(updatedVisit.soap_notes);
      if (updatedVisit.vitals) setVitals(updatedVisit.vitals);
      alert("AI Scribe converted conversation logs to SOAP clinical notes successfully!");
    } catch (err: any) {
      alert("AI Scribe error: " + err.message);
    } finally {
      setPrescLoading(false);
    }
  };

  // Voice Dictate Prescription
  const handleDictatePrescriptionStart = async () => {
    setVoiceCommandListening(true);
    commandChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      commandRecorderRef.current = recorder;
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          commandChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(commandChunksRef.current, { type: "audio/webm" });
        await parseVoicePrescription(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
    } catch (err) {
      alert("Microphone required.");
      setVoiceCommandListening(false);
    }
  };

  const handleDictatePrescriptionStop = () => {
    if (commandRecorderRef.current && voiceCommandListening) {
      commandRecorderRef.current.stop();
      setVoiceCommandListening(false);
    }
  };

  const parseVoicePrescription = async (audioBlob: Blob) => {
    if (!activeVisit) return;
    setPrescLoading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        const base64Audio = base64Data.split(",")[1];
        
        const prescription = await api.createPrescription(activeVisit.id, {
          audio_base64: base64Audio
        });
        setMedicines(prescription.medicines || []);
        alert("Prescription dictation parsed successfully.");
      };
    } catch (err: any) {
      alert("Failed to parse dictation: " + err.message);
    } finally {
      setPrescLoading(false);
    }
  };

  // Editable lists helpers for medicines
  const handleMedChange = (index: number, key: keyof Medicine, val: string) => {
    const list = [...medicines];
    list[index] = { ...list[index], [key]: val };
    setMedicines(list);
  };

  const addMedRow = () => {
    setMedicines([...medicines, { name: "", strength: "", frequency: "", duration: "", instructions: "", warnings: "" }]);
  };

  const removeMedRow = (index: number) => {
    const list = medicines.filter((_, i) => i !== index);
    setMedicines(list);
  };

  // Query RAG Agent
  const handleRAGSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragQuery.trim()) return;

    const userText = ragQuery;
    setRagMessages(prev => [...prev, { sender: "user", text: userText }]);
    setRagQuery("");
    setRagLoading(true);

    try {
      const response = await api.queryRAG(patientId, userText, activeVisit?.id);
      setRagMessages(prev => [
        ...prev, 
        { sender: "ai", text: response.answer, citations: response.cited_chunks }
      ]);
    } catch (err: any) {
      setRagMessages(prev => [
        ...prev, 
        { sender: "ai", text: "Error matching history: " + err.message }
      ]);
    } finally {
      setRagLoading(false);
    }
  };

  // Save drafts and complete consultation session
  const handleFinalizeVisit = async () => {
    if (!activeVisit) return;
    try {
      // 1. Update active SOAP/Vitals
      await api.updateVisit(activeVisit.id, {
        soap_notes: soapNotes,
        vitals: vitals
      });

      // 2. Save Prescription Medicines
      const finalMeds = medicines.filter(m => m.name.trim() !== "");
      await api.createPrescription(activeVisit.id, {
        medicines: finalMeds
      });

      // 3. Mark Visit Completed (handles embeddings index)
      await api.completeVisit(activeVisit.id);
      
      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      
      alert("Consultation closed successfully. Prescription A4 document compiled and visit SOAP notes indexed.");
      window.location.href = "/doctor";
    } catch (err: any) {
      alert("Failed to finalize session: " + err.message);
    }
  };

  // PDF Download Trigger
  const handlePrintPDF = async () => {
    if (!activeVisit) return;
    try {
      // We must get prescription details first
      const visitRes = await api.getVisit(activeVisit.id);
      if (!visitRes.prescription) {
        // Build one first if not present
        const p = await api.createPrescription(activeVisit.id, { medicines });
        visitRes.prescription = p;
      }

      if (visitRes.prescription?.id) {
        // Route to preview page
        window.location.href = `/patient/${patientId}/prescription/preview?prescriptionId=${visitRes.prescription.id}`;
      } else {
        alert("No prescription found to preview.");
      }
    } catch (err: any) {
      alert("Error generating print preview: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Side: clinical tools (cols 8) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          
          {/* Top header navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => window.location.href = `/patient/${patientId}`}
              className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Patient Profile</span>
            </button>
            {patient && (
              <span className="text-xs font-bold text-slate-900">
                Active Consulting Room: <span className="text-sky-600">{patient.full_name}</span>
              </span>
            )}
          </div>

          {/* Voice transcription session block */}
          <div className="bg-slate-900 border border-slate-800 text-white rounded-xl p-4 shadow-md flex flex-col min-h-[22vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-sky-400" />
                <span>Streaming Dictation Logger</span>
              </span>
              
              <div className="flex items-center gap-2">
                {listening ? (
                  <button
                    onClick={stopListening}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all shadow-md shadow-rose-600/10"
                  >
                    <Square className="h-3 w-3 fill-white" />
                    <span>Mute Microphone</span>
                  </button>
                ) : (
                  <button
                    onClick={startListening}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all shadow-md shadow-sky-600/10"
                  >
                    <Play className="h-3 w-3 fill-white" />
                    <span>Listen Speech</span>
                  </button>
                )}
              </div>
            </div>

            {/* Transcript scrollable panel */}
            <div className="flex-1 overflow-y-auto max-h-[12vh] text-xs font-mono space-y-1.5 pr-1">
              {transcriptSegments.length === 0 ? (
                <p className="text-slate-500 italic text-center py-4">Click "Listen Speech" and dictate the consultation. Dictations automatically build clinical details.</p>
              ) : (
                transcriptSegments.map((seg, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-sky-400 font-bold shrink-0">[{seg.role.toUpperCase()}]</span>
                    <span className="text-slate-300">{seg.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* clinical Tabs Workspace */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex-1 flex flex-col">
            <div className="flex border-b border-slate-100 pb-3 mb-4">
              <div className="flex gap-1.5 text-xs">
                <button
                  onClick={() => setActiveTab("soap")}
                  className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
                    activeTab === "soap" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  SOAP Notes Editor
                </button>
                <button
                  onClick={() => setActiveTab("vitals")}
                  className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
                    activeTab === "vitals" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Patient Vitals
                </button>
                <button
                  onClick={() => setActiveTab("prescription")}
                  className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
                    activeTab === "prescription" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Prescription Rx Builder
                </button>
              </div>
            </div>

            {/* Tab 1: SOAP Notes */}
            {activeTab === "soap" && (
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase tracking-wide">Subjective Symptoms</label>
                  <textarea
                    rows={4}
                    value={soapNotes.subjective || ""}
                    onChange={(e) => setSoapNotes({ ...soapNotes, subjective: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-sky-500 rounded-lg focus:outline-none leading-relaxed"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase tracking-wide">Objective Examinations</label>
                  <textarea
                    rows={4}
                    value={soapNotes.objective || ""}
                    onChange={(e) => setSoapNotes({ ...soapNotes, objective: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-sky-500 rounded-lg focus:outline-none leading-relaxed"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase tracking-wide">Clinical Assessment / Diagnosis</label>
                  <textarea
                    rows={3}
                    value={soapNotes.assessment || ""}
                    onChange={(e) => setSoapNotes({ ...soapNotes, assessment: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-sky-500 rounded-lg focus:outline-none leading-relaxed"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase tracking-wide">Clinical Management Plan</label>
                  <textarea
                    rows={3}
                    value={soapNotes.plan || ""}
                    onChange={(e) => setSoapNotes({ ...soapNotes, plan: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-sky-500 rounded-lg focus:outline-none leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* Tab 2: Vitals */}
            {activeTab === "vitals" && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase tracking-wide">Blood Pressure (BP)</label>
                  <input
                    type="text"
                    placeholder="e.g. 120/80"
                    value={vitals.bp || ""}
                    onChange={(e) => setVitals({ ...vitals, bp: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase tracking-wide">Heart Rate (HR)</label>
                  <input
                    type="text"
                    placeholder="e.g. 72 bpm"
                    value={vitals.hr || ""}
                    onChange={(e) => setVitals({ ...vitals, hr: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase tracking-wide">Temperature</label>
                  <input
                    type="text"
                    placeholder="e.g. 98.6 F"
                    value={vitals.temp || ""}
                    onChange={(e) => setVitals({ ...vitals, temp: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase tracking-wide">Body Weight</label>
                  <input
                    type="text"
                    placeholder="e.g. 70kg"
                    value={vitals.weight || ""}
                    onChange={(e) => setVitals({ ...vitals, weight: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase tracking-wide">Oxygen (SPO2)</label>
                  <input
                    type="text"
                    placeholder="e.g. 98%"
                    value={vitals.spo2 || ""}
                    onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
            )}

            {/* Tab 3: Prescriptions */}
            {activeTab === "prescription" && (
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Dictate prescription naturally or build rows manually</span>
                  
                  <div className="flex gap-2">
                    {voiceCommandListening ? (
                      <button
                        onClick={handleDictatePrescriptionStop}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        <Square className="h-3 w-3 fill-white" />
                        <span>Stop Dictation</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleDictatePrescriptionStart}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        <span>Dictate Rx</span>
                      </button>
                    )}
                    <button
                      onClick={addMedRow}
                      className="text-xs text-sky-600 font-bold hover:underline"
                    >
                      + Add Medicine
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-x-auto min-h-[30vh]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                        <th className="py-2.5 px-2 font-bold uppercase tracking-wider">Medicine Name</th>
                        <th className="py-2.5 px-2 font-bold uppercase tracking-wider w-20">Strength</th>
                        <th className="py-2.5 px-2 font-bold uppercase tracking-wider w-24">Frequency</th>
                        <th className="py-2.5 px-2 font-bold uppercase tracking-wider w-20">Duration</th>
                        <th className="py-2.5 px-2 font-bold uppercase tracking-wider">Instructions / Warnings</th>
                        <th className="py-2.5 px-2 font-bold uppercase tracking-wider w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {medicines.map((med, i) => (
                        <tr key={i} className="align-top">
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={med.name}
                              placeholder="e.g. Paracetamol"
                              onChange={(e) => handleMedChange(i, "name", e.target.value)}
                              className="w-full p-2 bg-slate-50 rounded focus:bg-white focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={med.strength}
                              placeholder="500mg"
                              onChange={(e) => handleMedChange(i, "strength", e.target.value)}
                              className="w-full p-2 bg-slate-50 rounded focus:bg-white focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={med.frequency}
                              placeholder="1-0-1"
                              onChange={(e) => handleMedChange(i, "frequency", e.target.value)}
                              className="w-full p-2 bg-slate-50 rounded focus:bg-white focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={med.duration}
                              placeholder="5 days"
                              onChange={(e) => handleMedChange(i, "duration", e.target.value)}
                              className="w-full p-2 bg-slate-50 rounded focus:bg-white focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={med.instructions || ""}
                              placeholder="After food"
                              onChange={(e) => handleMedChange(i, "instructions", e.target.value)}
                              className="w-full p-2 bg-slate-50 rounded focus:bg-white focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-1 text-center">
                            <button
                              onClick={() => removeMedRow(i)}
                              className="text-rose-500 font-bold hover:underline py-2 block"
                            >
                              X
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons row */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleScribe}
              disabled={prescLoading}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              {prescLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              <span>Convert running transcript to SOAP notes</span>
            </button>
            
            <button
              onClick={handlePrintPDF}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>A4 Prescription PDF Preview</span>
            </button>

            <button
              onClick={handleFinalizeVisit}
              className="sm:ml-auto inline-flex items-center justify-center gap-1.5 px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer transition-all active:scale-98"
            >
              <CheckCircle className="h-4 w-4" />
              <span>Save & Finalize Consultation</span>
            </button>
          </div>
        </div>

        {/* Right Side: AI Assistant Sidebar (cols 4) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col max-h-[85vh]">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 inline-flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-sky-600" />
            <span>RAG Clinical Assistant</span>
          </h3>

          {/* Messages stream */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1 text-xs">
            {ragMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                <div className={`p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                  msg.sender === "user" 
                    ? "bg-slate-900 text-white rounded-tr-none" 
                    : "bg-slate-50 text-slate-850 rounded-tl-none border border-slate-100"
                }`}>
                  {msg.text}
                </div>
                
                {/* Citations viewer */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-1.5 p-2 bg-slate-50 border border-slate-100 rounded-lg text-[9px] text-slate-500 leading-relaxed max-w-[95%]">
                    <span className="font-bold text-slate-600 uppercase block mb-1">Grounded Citations:</span>
                    {msg.citations.map((cit, idx) => (
                      <p key={idx} className="border-t border-slate-100/50 pt-1 mt-1 first:border-0 first:mt-0 first:pt-0">
                        {cit}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {ragLoading && (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Searching Patient Collection...</span>
              </div>
            )}
          </div>

          {/* Ask input form */}
          <form onSubmit={handleRAGSubmit} className="flex gap-2">
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              placeholder="Ask RAG about medical history..."
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:bg-white"
            />
            <button
              type="submit"
              disabled={ragLoading}
              className="p-2 bg-slate-900 text-white hover:bg-slate-850 rounded-lg cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
