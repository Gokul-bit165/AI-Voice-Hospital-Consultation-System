"use client";

import React, { useState, useEffect, useRef, use } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Visit, Vitals, Medicine } from "@/lib/api";
import Navbar from "@/components/Navbar";
import {
  ArrowLeft, Loader2, CheckCircle, Printer,
  Mic, MicOff, Plus, Trash2, Pill, Activity, Stethoscope,
  BookOpen, Send, Sparkles, ShieldCheck, Edit3,
} from "lucide-react";

// ─── Local types ─────────────────────────────────────────────────────────────
type MainTab = "prescription" | "vitals" | "verify";
type RagMsg  = { sender: "user" | "ai"; text: string; citations?: string[] };

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ConsultationPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: patientId } = use(paramsPromise);
  const queryClient = useQueryClient();

  const [activeVisit, setActiveVisit] = useState<Visit | null>(null);
  const [activeTab,   setActiveTab]   = useState<MainTab>("prescription");

  // ── Voice dictation ──────────────────────────────────────────────────────
  const [dictating,       setDictating]       = useState(false);
  const [dictationLoading,setDictationLoading]= useState(false);
  const [dictationStatus, setDictationStatus] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  // ── Data ─────────────────────────────────────────────────────────────────
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [vitals,    setVitals]    = useState<Vitals>({ bp:"", hr:"", temp:"", weight:"", spo2:"" });

  // ── UI states ────────────────────────────────────────────────────────────
  const [saving,       setSaving]       = useState(false);
  const [printLoading, setPrintLoading] = useState(false);

  // ── RAG sidebar ───────────────────────────────────────────────────────────
  const [ragQuery,    setRagQuery]    = useState("");
  const [ragMessages, setRagMessages] = useState<RagMsg[]>([
    { sender:"ai", text:'Hello Doctor 👋  I am the patient\'s RAG assistant. Click "Summarize Patient Info" for a quick overview, or ask anything about their medical history.' },
  ]);
  const [ragLoading,  setRagLoading]  = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const ragEndRef = useRef<HTMLDivElement>(null);

  // ── Patient query ─────────────────────────────────────────────────────────
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn:  () => api.getPatient(patientId),
  });

  // ── Init visit on mount ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const visit = await api.startVisit(patientId, "Prescription consultation");
        setActiveVisit(visit);
        if (visit.vitals)       setVitals(visit.vitals);
        if (visit.prescription) setMedicines(visit.prescription.medicines ?? []);
      } catch (err: any) {
        alert("Failed to start session: " + err.message);
      }
    })();
  }, [patientId]);

  // ── Auto-scroll RAG ────────────────────────────────────────────────────────
  useEffect(() => {
    ragEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [ragMessages]);

  // ─── Voice Dictation ──────────────────────────────────────────────────────
  const startDictation = async () => {
    setDictating(true);
    setDictationStatus("🎙 Listening — dictate the prescription now");
    chunksRef.current = [];
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio:true });
      const recorder = new MediaRecorder(stream, { mimeType:"audio/webm" });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        await parseDictation(new Blob(chunksRef.current, { type:"audio/webm" }));
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
    } catch {
      alert("Microphone access required.");
      setDictating(false);
      setDictationStatus("");
    }
  };

  const stopDictation = () => {
    recorderRef.current?.stop();
    setDictating(false);
    setDictationStatus("⚙ AI is parsing your dictation…");
  };

  const parseDictation = async (blob: Blob) => {
    if (!activeVisit) return;
    setDictationLoading(true);
    try {
      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          try {
            const b64 = (reader.result as string).split(",")[1];
            const rx  = await api.createPrescription(activeVisit.id, { audio_base64: b64 });
            setMedicines(rx.medicines ?? []);
            setDictationStatus("✅ Parsed! Review in the Verify & Print tab.");
            setActiveTab("verify");                    // ← auto-switch to Verify
            setTimeout(() => setDictationStatus(""), 5000);
            resolve();
          } catch (err) { reject(err); }
        };
        reader.onerror = reject;
      });
    } catch (err: any) {
      setDictationStatus("❌ Failed: " + err.message);
      setTimeout(() => setDictationStatus(""), 5000);
    } finally {
      setDictationLoading(false);
    }
  };

  // ─── Medicine helpers ─────────────────────────────────────────────────────
  const handleMedChange = (i: number, key: keyof Medicine, val: string) => {
    const list = [...medicines];
    list[i] = { ...list[i], [key]: val };
    setMedicines(list);
  };
  const addMedRow    = () => setMedicines(prev => [...prev, { name:"", strength:"", frequency:"", duration:"", instructions:"", warnings:"" }]);
  const removeMedRow = (i: number) => setMedicines(prev => prev.filter((_, idx) => idx !== i));

  // ─── RAG actions ──────────────────────────────────────────────────────────
  const handleSummarize = async () => {
    setSummarizing(true);
    setRagMessages(prev => [...prev, { sender:"user", text:"Summarize this patient's medical history for me." }]);
    try {
      const res = await api.queryRAG(
        patientId,
        "Summarize this patient's complete medical history, current allergies, active medications, recent visits and any important clinical flags in a concise doctor-friendly format.",
        activeVisit?.id,
      );
      setRagMessages(prev => [...prev, { sender:"ai", text: res.answer, citations: res.cited_chunks }]);
    } catch (err: any) {
      setRagMessages(prev => [...prev, { sender:"ai", text: "Could not summarize: " + err.message }]);
    } finally {
      setSummarizing(false);
    }
  };

  const handleRagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragQuery.trim()) return;
    const q = ragQuery; setRagQuery("");
    setRagMessages(prev => [...prev, { sender:"user", text: q }]);
    setRagLoading(true);
    try {
      const res = await api.queryRAG(patientId, q, activeVisit?.id);
      setRagMessages(prev => [...prev, { sender:"ai", text: res.answer, citations: res.cited_chunks }]);
    } catch (err: any) {
      setRagMessages(prev => [...prev, { sender:"ai", text: "Error: " + err.message }]);
    } finally {
      setRagLoading(false);
    }
  };

  // ─── Print PDF ────────────────────────────────────────────────────────────
  const handlePrint = async () => {
    if (!activeVisit) return;
    setPrintLoading(true);
    try {
      const finalMeds = medicines.filter(m => m.name.trim() !== "");
      const rx = await api.createPrescription(activeVisit.id, { medicines: finalMeds });
      window.location.href = `/patient/${patientId}/prescription/preview?prescriptionId=${rx.id}`;
    } catch (err: any) {
      alert("Print error: " + err.message);
    } finally {
      setPrintLoading(false);
    }
  };

  // ─── Save & Finalize ──────────────────────────────────────────────────────
  const handleFinalize = async () => {
    if (!activeVisit) return;
    setSaving(true);
    try {
      await api.updateVisit(activeVisit.id, { vitals });
      const finalMeds = medicines.filter(m => m.name.trim() !== "");
      await api.createPrescription(activeVisit.id, { medicines: finalMeds });
      await api.completeVisit(activeVisit.id);
      queryClient.invalidateQueries({ queryKey:["patients"] });
      alert("Consultation saved. Prescription compiled & visit indexed.");
      window.location.href = "/doctor";
    } catch (err: any) {
      alert("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Shared style tokens ──────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background:    "rgba(15,23,42,0.88)",
    border:        "1px solid rgba(255,255,255,0.07)",
    backdropFilter:"blur(20px)",
    borderRadius:  16,
    overflow:      "hidden",
  };
  const divider: React.CSSProperties = { borderBottom:"1px solid rgba(255,255,255,0.06)" };

  // ─── Bottom buttons (reused in multiple tabs) ─────────────────────────────
  const BottomBar = () => (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={handlePrint} disabled={printLoading}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
        style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"#cbd5e1" }}
      >
        {printLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        A4 PDF Preview
      </button>
      <button
        onClick={handleFinalize} disabled={saving}
        className="ml-auto inline-flex items-center gap-2 px-7 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
        style={{ background:"linear-gradient(135deg,#0ea5e9,#0284c7)", color:"white", boxShadow:"0 4px 24px rgba(14,165,233,0.4)" }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
        {saving ? "Saving…" : "Save & Finalize"}
      </button>
    </div>
  );

  // ─────────────────────────────────────────── RENDER ──────────────────────
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background:"linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)", fontFamily:"'Inter',sans-serif" }}
    >
      <Navbar />

      <div className="flex-1 w-full max-w-[1400px] mx-auto px-5 py-5 flex flex-col gap-4">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => window.location.href = `/patient/${patientId}`}
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-xs font-semibold uppercase tracking-widest transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Patient Profile
          </button>
          {patient && (
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold"
              style={{ background:"rgba(14,165,233,0.12)", border:"1px solid rgba(14,165,233,0.25)", color:"#38bdf8" }}
            >
              <Stethoscope className="h-3.5 w-3.5" />
              {patient.full_name}
            </div>
          )}
        </div>

        {/* ── Two-column layout ── */}
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">

          {/* ══════════════ LEFT COLUMN ══════════════ */}
          <div className="flex flex-col gap-4">

            {/* ── Voice Dictation Card ── */}
            <div style={{ ...card, border:"1px solid rgba(14,165,233,0.22)" }}>
              {/* header row */}
              <div className="px-5 py-4 flex items-center justify-between" style={divider}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl" style={{ background:"rgba(14,165,233,0.12)" }}>
                    <Mic className="h-5 w-5 text-sky-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Voice Prescription Digitizer</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Speak naturally — AI extracts medicines, dosage &amp; instructions</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {dictationStatus && (
                    <span className="text-[11px] font-medium px-3 py-1 rounded-full hidden sm:block"
                      style={{ background:"rgba(14,165,233,0.1)", color:"#7dd3fc" }}>
                      {dictationStatus}
                    </span>
                  )}
                  {dictating ? (
                    <button onClick={stopDictation}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95"
                      style={{ background:"linear-gradient(135deg,#dc2626,#b91c1c)", color:"white", boxShadow:"0 4px 20px rgba(220,38,38,0.4)" }}>
                      <MicOff className="h-4 w-4" /> Stop &amp; Parse
                    </button>
                  ) : (
                    <button onClick={startDictation} disabled={dictationLoading}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                      style={{ background:"linear-gradient(135deg,#0ea5e9,#0284c7)", color:"white", boxShadow:"0 4px 20px rgba(14,165,233,0.4)" }}>
                      {dictationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                      {dictationLoading ? "Processing…" : "Dictate Prescription"}
                    </button>
                  )}
                </div>
              </div>
              {/* live indicator */}
              <div className="px-5 py-3 min-h-[46px] flex items-center">
                {dictating ? (
                  <div className="flex items-center gap-4 w-full">
                    <div className="flex items-end gap-[3px] h-6">
                      {[...Array(22)].map((_, i) => (
                        <div key={i} style={{
                          width:3, borderRadius:4, background:"rgba(14,165,233,0.7)", height:"100%",
                          animation:`rxwave ${0.5+(i%5)*0.1}s ease-in-out infinite alternate`,
                          animationDelay:`${i*0.04}s`,
                        }} />
                      ))}
                    </div>
                    <span className="text-xs text-sky-300 font-medium animate-pulse">Recording — speak the prescription now</span>
                  </div>
                ) : dictationLoading ? (
                  <div className="flex items-center gap-2 text-sky-400 text-xs">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>AI is parsing your dictation into medicine rows…</span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Press <span className="text-sky-400 font-semibold not-italic">"Dictate Prescription"</span> and speak —
                    e.g. <span className="text-slate-400 not-italic">"Paracetamol 500mg twice daily for 5 days after food"</span>
                  </p>
                )}
              </div>
            </div>

            {/* ── Tab strip ── */}
            <div className="flex gap-1 p-1 rounded-xl w-fit"
              style={{ background:"rgba(15,23,42,0.85)", border:"1px solid rgba(255,255,255,0.07)" }}>
              {([
                { key:"prescription", label:"Prescription Rx", icon: Pill },
                { key:"vitals",       label:"Vitals",          icon: Activity },
                { key:"verify",       label:"Verify & Print",  icon: ShieldCheck },
              ] as { key:MainTab; label:string; icon:any }[]).map(({ key, label, icon:Icon }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all"
                  style={activeTab === key
                    ? { background:"linear-gradient(135deg,#0ea5e9,#0284c7)", color:"white", boxShadow:"0 2px 12px rgba(14,165,233,0.3)" }
                    : { color:"#64748b" }
                  }>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {key === "verify" && medicines.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                      style={{
                        background: activeTab === "verify" ? "rgba(255,255,255,0.22)" : "rgba(14,165,233,0.22)",
                        color:      activeTab === "verify" ? "white" : "#38bdf8",
                      }}>
                      {medicines.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ══ TAB: Prescription Rx Builder ══ */}
            {activeTab === "prescription" && (
              <div style={card}>
                <div className="px-5 py-4 flex items-center justify-between" style={divider}>
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-sky-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-widest">Medicine List</span>
                    {medicines.length > 0 && (
                      <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background:"rgba(14,165,233,0.18)", color:"#38bdf8" }}>
                        {medicines.length}
                      </span>
                    )}
                  </div>
                  <button onClick={addMedRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                    style={{ background:"rgba(14,165,233,0.1)", border:"1px solid rgba(14,165,233,0.22)", color:"#38bdf8" }}>
                    <Plus className="h-3.5 w-3.5" /> Add Row
                  </button>
                </div>
                <MedicineTable medicines={medicines} onMedChange={handleMedChange} onRemove={removeMedRow} />
              </div>
            )}

            {/* ══ TAB: Patient Vitals ══ */}
            {activeTab === "vitals" && (
              <div className="rounded-2xl p-5"
                style={{ background:"rgba(15,23,42,0.88)", border:"1px solid rgba(255,255,255,0.07)", backdropFilter:"blur(20px)" }}>
                <div className="flex items-center gap-2 mb-5">
                  <Activity className="h-4 w-4 text-sky-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-widest">Patient Vitals</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {[
                    { key:"bp",     label:"Blood Pressure", unit:"mmHg", ph:"120/80", emoji:"🩸" },
                    { key:"hr",     label:"Heart Rate",      unit:"bpm",  ph:"72",     emoji:"❤️" },
                    { key:"temp",   label:"Temperature",     unit:"°F",   ph:"98.6",   emoji:"🌡️" },
                    { key:"weight", label:"Weight",          unit:"kg",   ph:"70",     emoji:"⚖️" },
                    { key:"spo2",   label:"SpO₂",            unit:"%",    ph:"98",     emoji:"💨" },
                  ].map(({ key, label, unit, ph, emoji }) => (
                    <div key={key} className="p-4 rounded-xl flex flex-col gap-2"
                      style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
                        <span className="text-base">{emoji}</span>
                      </div>
                      <input type="text" value={(vitals as any)[key] ?? ""} placeholder={ph}
                        onChange={e => setVitals({ ...vitals, [key]: e.target.value })}
                        className="w-full bg-transparent text-white text-xl font-bold placeholder-slate-700 focus:outline-none" />
                      <span className="text-[10px] text-slate-600 font-semibold">{unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══ TAB: Verify & Print ══ */}
            {activeTab === "verify" && (
              <div style={card}>
                {/* header */}
                <div className="px-5 py-4 flex items-center justify-between" style={divider}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-widest">Verify Prescription</span>
                    <span className="text-[11px] text-slate-500">— Review &amp; edit, then print or save</span>
                  </div>
                  <button onClick={addMedRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                    style={{ background:"rgba(14,165,233,0.1)", border:"1px solid rgba(14,165,233,0.22)", color:"#38bdf8" }}>
                    <Plus className="h-3.5 w-3.5" /> Add Row
                  </button>
                </div>

                {/* editable table */}
                <MedicineTable medicines={medicines} onMedChange={handleMedChange} onRemove={removeMedRow} />

                {/* action bar */}
                <div className="px-5 py-4 flex items-center gap-3 flex-wrap"
                  style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit any row above before printing
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <button onClick={handlePrint} disabled={printLoading}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                      style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", color:"#cbd5e1" }}>
                      {printLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                      Print A4 PDF
                    </button>
                    <button onClick={handleFinalize} disabled={saving}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                      style={{ background:"linear-gradient(135deg,#0ea5e9,#0284c7)", color:"white", boxShadow:"0 4px 20px rgba(14,165,233,0.4)" }}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      {saving ? "Saving…" : "Save & Finalize"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Bottom bar for non-verify tabs ── */}
            {activeTab !== "verify" && <BottomBar />}
          </div>
          {/* ── end LEFT COLUMN ── */}

          {/* ══════════════ RIGHT COLUMN — RAG ══════════════ */}
          <div
            className="flex flex-col rounded-2xl overflow-hidden"
            style={{
              background:    "rgba(15,23,42,0.92)",
              border:        "1px solid rgba(255,255,255,0.07)",
              backdropFilter:"blur(24px)",
              maxHeight:     "calc(100vh - 120px)",
              position:      "sticky",
              top:           80,
            }}
          >
            {/* RAG header */}
            <div className="px-5 py-4 flex items-center gap-2 flex-shrink-0" style={divider}>
              <div className="p-1.5 rounded-lg" style={{ background:"rgba(14,165,233,0.12)" }}>
                <BookOpen className="h-4 w-4 text-sky-400" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-widest">RAG Clinical Assistant</span>
            </div>

            {/* Summarize button */}
            <div className="px-5 py-3 flex-shrink-0" style={divider}>
              <button
                onClick={handleSummarize} disabled={summarizing || ragLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-60"
                style={{
                  background:"linear-gradient(135deg,rgba(14,165,233,0.2),rgba(2,132,199,0.14))",
                  border:    "1px solid rgba(14,165,233,0.28)",
                  color:     "#38bdf8",
                }}
              >
                {summarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {summarizing ? "Summarizing patient…" : "Summarize Patient Info"}
              </button>
            </div>

            {/* Messages scroll area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
              {ragMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className="px-3.5 py-2.5 rounded-2xl max-w-[93%] leading-relaxed"
                    style={msg.sender === "user"
                      ? { background:"linear-gradient(135deg,#0ea5e9,#0284c7)", color:"white", borderBottomRightRadius:4 }
                      : { background:"rgba(255,255,255,0.06)", color:"#cbd5e1", border:"1px solid rgba(255,255,255,0.08)", borderBottomLeftRadius:4 }
                    }
                  >
                    {msg.text}
                  </div>
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-1.5 p-2.5 rounded-xl text-[10px] text-slate-500 leading-relaxed max-w-[95%]"
                      style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)" }}>
                      <span className="font-bold text-slate-400 uppercase block mb-1.5 text-[9px] tracking-widest">Grounded Citations</span>
                      {msg.citations.map((c, j) => (
                        <p key={j} className="border-t pt-1 mt-1 first:border-0 first:mt-0 first:pt-0"
                          style={{ borderColor:"rgba(255,255,255,0.05)" }}>{c}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {(ragLoading || summarizing) && (
                <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Searching patient collection…</span>
                </div>
              )}
              <div ref={ragEndRef} />
            </div>

            {/* Ask input */}
            <form onSubmit={handleRagSubmit} className="flex gap-2 px-4 py-3 flex-shrink-0"
              style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}>
              <input
                type="text" value={ragQuery} onChange={e => setRagQuery(e.target.value)}
                placeholder="Ask about patient history…"
                className="flex-1 px-3 py-2 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none transition-all"
                style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)" }}
                onFocus={e => { e.target.style.borderColor = "rgba(14,165,233,0.35)"; }}
                onBlur={e  => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; }}
              />
              <button type="submit" disabled={ragLoading || summarizing}
                className="p-2 rounded-xl cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                style={{ background:"linear-gradient(135deg,#0ea5e9,#0284c7)", color:"white" }}>
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
          {/* ── end RIGHT COLUMN ── */}

        </div>
        {/* ── end two-column ── */}

      </div>

      {/* Waveform keyframe */}
      <style>{`
        @keyframes rxwave {
          from { transform: scaleY(0.15); opacity: 0.4; }
          to   { transform: scaleY(1);   opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

// ─── Shared editable medicine table sub-component ────────────────────────────
function MedicineTable({
  medicines,
  onMedChange,
  onRemove,
}: {
  medicines: Medicine[];
  onMedChange: (i: number, key: keyof Medicine, val: string) => void;
  onRemove:   (i: number) => void;
}) {
  const COLS = [
    { key:"name",         placeholder:"e.g. Paracetamol", minW:130 },
    { key:"strength",     placeholder:"500mg",             minW:72  },
    { key:"frequency",    placeholder:"1-0-1",             minW:72  },
    { key:"duration",     placeholder:"5 days",            minW:72  },
    { key:"instructions", placeholder:"After food",        minW:110 },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background:"rgba(255,255,255,0.025)", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
            {["Medicine Name","Strength","Frequency","Duration","Instructions",""].map((h,i) => (
              <th key={i} className="px-4 py-3 text-left font-bold uppercase tracking-widest text-slate-500"
                style={{ fontSize:10 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {medicines.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="p-4 rounded-2xl" style={{ background:"rgba(14,165,233,0.06)" }}>
                    <Pill className="h-8 w-8 text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-xs font-medium">No medicines yet</p>
                  <p className="text-slate-600 text-[11px]">Dictate above or click <span className="text-sky-500">"Add Row"</span></p>
                </div>
              </td>
            </tr>
          ) : medicines.map((med, i) => (
            <tr key={i} className="group" style={{ borderBottom:"1px solid rgba(255,255,255,0.035)" }}>
              {COLS.map(({ key, placeholder, minW }) => (
                <td key={key} className="px-3 py-2">
                  <input
                    type="text"
                    value={(med as any)[key] ?? ""}
                    placeholder={placeholder}
                    onChange={e => onMedChange(i, key as keyof Medicine, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none transition-all"
                    style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)", minWidth:minW }}
                    onFocus={e => { e.target.style.background="rgba(14,165,233,0.08)"; e.target.style.borderColor="rgba(14,165,233,0.3)"; }}
                    onBlur={e  => { e.target.style.background="rgba(255,255,255,0.04)"; e.target.style.borderColor="rgba(255,255,255,0.06)"; }}
                  />
                </td>
              ))}
              <td className="px-3 py-2 text-center">
                <button onClick={() => onRemove(i)}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  style={{ background:"rgba(239,68,68,0.12)", color:"#f87171" }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
