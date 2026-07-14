"use client";

import React, { useState, useEffect, useRef, useCallback, use } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { api, Visit, Vitals, Medicine } from "@/lib/api";
import {
  ArrowLeft, Loader2, CheckCircle, Printer,
  Mic, MicOff, Plus, Trash2, Pill, Activity, Stethoscope,
  BookOpen, Send, Sparkles, ShieldCheck, Edit3, Heart,
  Thermometer, Wind, FileText, Calendar, Clock, User,
  Bell, HelpCircle, Search, Settings, MoreHorizontal,
  ChevronDown, UserPlus, ShieldAlert, Maximize2, RefreshCw,
  GripVertical, ClipboardList, History, AlertTriangle, Info
} from "lucide-react";

// ─── Local types ─────────────────────────────────────────────────────────────
type RagMsg = { sender: "user" | "ai"; text: string; citations?: string[] };
type Tab = "vitals" | "rx" | "history";

const MEDICINES_LIST = [
  "Paracetamol", "Amoxicillin", "Azithromycin", "Metformin", "Cetirizine",
  "Ibuprofen", "Omeprazole", "Pantoprazole", "Diclofenac", "Amlodipine",
  "Losartan", "Atorvastatin", "Rosuvastatin", "Levothyroxine", "Glimepiride",
  "Ciprofloxacin", "Levofloxacin", "Doxycycline", "Metronidazole", "Ondansetron",
  "Domperidone", "Rabeprazole", "Montelukast", "Levocetirizine", "Aspirin",
  "Clopidogrel", "Telmisartan", "Olmesartan", "Teneligliptin", "Vildagliptin",
  "Sitagliptin", "Gliclazide", "Pioglitazone", "Gabapentin", "Pregabalin",
  "Mecobalamin", "Vitamin D3", "Calcium", "Iron", "Folic Acid",
  "Salbutamol", "Budesonide", "Formoterol", "Fluticasone", "Tamsulosin",
  "Finasteride", "Sildenafil", "Tadalafil", "Fluconazole", "Itraconazole",
  "Ketoconazole", "Clotrimazole", "Mupirocin", "Fusidic Acid", "Hydrocortisone",
  "Betamethasone", "Clobetasol", "Permethrin", "Albendazole", "Ivermectin",
  "Dexamethasone", "Prednisolone", "Methylprednisolone", "Deflazacort", "Aceclofenac",
  "Etoricoxib", "Tramadol", "Tapentadol", "Ranitidine", "Famotidine",
  "Sucralfate", "Ursodeoxycholic Acid", "Lactulose", "Bisacodyl", "Loperamide",
  "Racecadotril", "Saccharomyces boulardii", "Bacillus clausii", "ORS", "Zinc",
  "Vitamin C", "B-Complex", "Alpha Lipoic Acid", "Cilostazol", "Pentoxifylline",
  "Flunarizine", "Propranolol", "Metoprolol", "Bisoprolol", "Carvedilol",
  "Amiodarone", "Digoxin", "Warfarin", "Acenocoumarol", "Rivaroxaban",
  "Apixaban", "Dabigatran", "Enoxaparin", "Heparin", "Insulin"
];

// Helper to parse frequency string like "1-0-1" or fallback
const parseFrequency = (freqStr: string) => {
  const parts = (freqStr || "").split("-");
  if (parts.length === 3) {
    return {
      morn: parts[0] === "1",
      aft: parts[1] === "1",
      night: parts[2] === "1"
    };
  }
  return { morn: false, aft: false, night: false };
};

// Helper to format frequency
const formatFrequency = (morn: boolean, aft: boolean, night: boolean) => {
  return `${morn ? "1" : "0"}-${aft ? "1" : "0"}-${night ? "1" : "0"}`;
};

// Classify an AI chat message so the bubble color communicates meaning at a glance
const classifyMessage = (text: string) => {
  const t = text.toLowerCase();
  if (t.includes("allerg") || t.includes("⚠") || t.includes("risk") || t.includes("interaction") || t.includes("avoid")) {
    return {
      key: "alert",
      bubble: "bg-red-50 border border-red-200 text-red-900",
      icon: AlertTriangle,
      iconColor: "text-red-600",
      chip: "bg-red-100 text-red-700",
    };
  }
  if (t.includes("safe") || t.includes("no interaction") || t.includes("normal") || t.includes("✅")) {
    return {
      key: "safe",
      bubble: "bg-emerald-50 border border-emerald-200 text-emerald-900",
      icon: ShieldCheck,
      iconColor: "text-emerald-600",
      chip: "bg-emerald-100 text-emerald-700",
    };
  }
  if (t.includes("suggest") || t.includes("alternative") || t.includes("consider") || t.includes("recommend")) {
    return {
      key: "suggestion",
      bubble: "bg-amber-50 border border-amber-200 text-amber-900",
      icon: Sparkles,
      iconColor: "text-amber-600",
      chip: "bg-amber-100 text-amber-700",
    };
  }
  return {
    key: "info",
    bubble: "bg-slate-50 border border-slate-200 text-slate-800",
    icon: Info,
    iconColor: "text-blue-600",
    chip: "bg-blue-100 text-blue-700",
  };
};

// SVG Patient Profile Silhouette Avatar
const PatientAvatar = () => (
  <svg viewBox="0 0 120 120" className="h-20 w-20 rounded-2xl border border-[#E5E7EB] bg-blue-50/50 flex-shrink-0">
    <rect width="120" height="120" fill="#eff6ff" />
    <circle cx="60" cy="50" r="24" fill="#93c5fd" />
    <path d="M 25,105 C 25,85 45,75 60,75 C 75,75 95,85 95,105" fill="#3b82f6" />
    <circle cx="60" cy="50" r="20" fill="#fed7aa" />
    <path d="M 38,46 C 36,36 44,28 60,28 C 76,28 84,36 82,46 C 78,34 42,34 38,46 Z" fill="#475569" />
    <rect x="54" y="65" width="12" height="15" fill="#fed7aa" />
    <path d="M 40,82 L 80,82 L 72,105 L 48,105 Z" fill="#1e40af" />
    <path d="M 60,82 L 48,95 L 60,105 L 72,95 Z" fill="#ffffff" />
  </svg>
);

// Simple sparkline visualizer using SVG
const Sparkline = ({ points, color }: { points: number[]; color: string }) => {
  if (!points || points.length < 2) {
    points = [65, 78, 72, 85, 75, 78];
  }
  const width = 90;
  const height = 26;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * height;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={`M ${coords.join(" L ")}`}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "vitals", label: "Vitals & Voice", icon: Activity },
  { id: "rx", label: "Prescription", icon: Pill },
  { id: "history", label: "Trends & Labs", icon: History },
];

export default function ConsultationPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: patientId } = use(paramsPromise);
  const queryClient = useQueryClient();

  const [activeVisit, setActiveVisit] = useState<Visit | null>(null);
  const [currentUser, setCurrentUser] = useState<{ full_name: string; specialization: string } | null>(null);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") || "vitals") as Tab;
  const handleTabChange = (tabId: Tab) => {
    router.push(`/patient/${patientId}/consultation?tab=${tabId}`);
  };

  const [liveTranscript, setLiveTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  // ── Resizable AI assistant panel ─────────────────────────────────────────
  const [chatWidth, setChatWidth] = useState(420);
  const isResizing = useRef(false);

  const startResize = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const next = window.innerWidth - e.clientX;
      setChatWidth(Math.min(640, Math.max(340, next)));
    };
    const onUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Voice dictation ──────────────────────────────────────────────────────
  const [dictating, setDictating] = useState(false);
  const [dictationLoading, setDictationLoading] = useState(false);
  const [dictationStatus, setDictationStatus] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // ── Data states ──────────────────────────────────────────────────────────
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [vitals, setVitals] = useState<Vitals>({ bp: "", hr: "", temp: "", weight: "", spo2: "" });
  const [saving, setSaving] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);

  // ── Timer state ──────────────────────────────────────────────────────────
  const [secondsElapsed, setSecondsElapsed] = useState(768);
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${hrs > 0 ? hrs.toString().padStart(2, "0") + ":" : ""}${mins
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ── RAG sidebar ───────────────────────────────────────────────────────────
  const [ragQuery, setRagQuery] = useState("");
  const [ragMessages, setRagMessages] = useState<RagMsg[]>([
    {
      sender: "ai",
      text: "Hello Dr. Jenkins 👋 I am the patient's RAG clinical assistant. How can I help you with this consultation?",
    },
  ]);
  const [ragLoading, setRagLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const ragEndRef = useRef<HTMLDivElement>(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.getPatient(patientId),
  });

  const { data: timeline = [] } = useQuery({
    queryKey: ["patient-timeline", patientId],
    queryFn: () => api.getPatientTimeline(patientId),
  });

  useEffect(() => {
    api.getMe()
      .then((u) => setCurrentUser({ full_name: u.full_name, specialization: u.specialization }))
      .catch(() => {
        setCurrentUser({ full_name: "Sarah Jenkins", specialization: "Cardiology" });
      });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const visit = await api.startVisit(patientId, "Prescription consultation");
        setActiveVisit(visit);
        if (visit.vitals) setVitals(visit.vitals);
        if (visit.prescription) setMedicines(visit.prescription.medicines ?? []);
      } catch (err: any) {
        alert("Failed to start session: " + err.message);
      }
    })();
  }, [patientId]);

  useEffect(() => {
    ragEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ragMessages]);

  // ─── Voice Dictation ──────────────────────────────────────────────────────
  const startDictation = async () => {
    setDictating(true);
    setDictationStatus("🎙 Listening — speak now");
    setLiveTranscript("");
    chunksRef.current = [];
    
    // Start native Web Speech API recognition for realtime captioning
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        
        recognition.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          setLiveTranscript(finalTranscript + interimTranscript);
        };
        
        recognition.onerror = (e: any) => {
          console.error("Speech recognition error:", e);
        };
        
        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.error("Failed to start SpeechRecognition:", err);
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        await parseDictation(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
    } catch {
      alert("Microphone access required.");
      setDictating(false);
      setDictationStatus("");
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
  };

  const stopDictation = () => {
    if (recorderRef.current && dictating) {
      recorderRef.current.stop();
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setDictating(false);
    setDictationStatus("⚙ AI parsing...");
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
            const rx = await api.createPrescription(activeVisit.id, { audio_base64: b64 });
            setMedicines(rx.medicines ?? []);
            setDictationStatus("✅ Parsed!");
            handleTabChange("rx");
            setTimeout(() => setDictationStatus(""), 4000);
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
      });
    } catch (err: any) {
      setDictationStatus("❌ Failed: " + err.message);
      setTimeout(() => setDictationStatus(""), 4000);
    } finally {
      setDictationLoading(false);
    }
  };

  // ─── Medicine helpers ─────────────────────────────────────────────────────
  const handleMedChange = (i: number, key: keyof Medicine, val: any) => {
    const list = [...medicines];
    list[i] = { ...list[i], [key]: val };
    setMedicines(list);
  };
  const addMedRow = () => {
    setMedicines((prev) => [
      ...prev,
      { name: "", strength: "", frequency: "0-0-0", duration: "", instructions: "", warnings: "" },
    ]);
    handleTabChange("rx");
  };
  const removeMedRow = (i: number) => setMedicines((prev) => prev.filter((_, idx) => idx !== i));

  // Quick-add a medicine suggested by the AI assistant directly into the table
  const addSuggestedMedicine = (name: string, strength = "") => {
    setMedicines((prev) => [
      ...prev,
      { name, strength, frequency: "0-0-0", duration: "", instructions: "", warnings: "" },
    ]);
    handleTabChange("rx");
  };

  // ─── RAG actions ──────────────────────────────────────────────────────────
  const handleSummarize = async () => {
    setSummarizing(true);
    setRagMessages((prev) => [...prev, { sender: "user", text: "Summarize this patient's medical history." }]);
    try {
      const res = await api.queryRAG(
        patientId,
        "Summarize patient history, current allergies, recent visits, and active medications concisely.",
        activeVisit?.id
      );
      setRagMessages((prev) => [...prev, { sender: "ai", text: res.answer, citations: res.cited_chunks }]);
    } catch (err: any) {
      setRagMessages((prev) => [...prev, { sender: "ai", text: "Could not summarize: " + err.message }]);
    } finally {
      setSummarizing(false);
    }
  };

  const handleRagQueryText = async (text: string) => {
    setRagMessages((prev) => [...prev, { sender: "user", text }]);
    setRagLoading(true);
    try {
      const res = await api.queryRAG(patientId, text, activeVisit?.id);
      setRagMessages((prev) => [...prev, { sender: "ai", text: res.answer, citations: res.cited_chunks }]);
    } catch (err: any) {
      setRagMessages((prev) => [...prev, { sender: "ai", text: "Error: " + err.message }]);
    } finally {
      setRagLoading(false);
    }
  };

  const handleRagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragQuery.trim()) return;
    const q = ragQuery;
    setRagQuery("");
    await handleRagQueryText(q);
  };

  // ─── Print/Save helpers ───────────────────────────────────────────────────
  const handlePrint = async () => {
    if (!activeVisit) return;
    setPrintLoading(true);
    try {
      const finalMeds = medicines.filter((m) => m.name.trim() !== "");
      const rx = await api.createPrescription(activeVisit.id, { medicines: finalMeds });
      window.location.href = `/patient/${patientId}/prescription/preview?prescriptionId=${rx.id}`;
    } catch (err: any) {
      alert("Print error: " + err.message);
    } finally {
      setPrintLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!activeVisit) return;
    setSaving(true);
    try {
      await api.updateVisit(activeVisit.id, { vitals });
      const finalMeds = medicines.filter((m) => m.name.trim() !== "");
      await api.createPrescription(activeVisit.id, { medicines: finalMeds });
      alert("Draft consultation saved successfully.");
    } catch (err: any) {
      alert("Failed to save draft: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!activeVisit) return;
    setSaving(true);
    try {
      await api.updateVisit(activeVisit.id, { vitals });
      const finalMeds = medicines.filter((m) => m.name.trim() !== "");
      await api.createPrescription(activeVisit.id, { medicines: finalMeds });
      await api.completeVisit(activeVisit.id);
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      alert("Consultation finalized successfully.");
      window.location.href = "/doctor";
    } catch (err: any) {
      alert("Failed to finalize: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Allergy warning engine
  const checkMedicineSafety = (medName: string) => {
    if (!medName) return { safe: true, message: "Safe / No Interaction" };
    const nameLower = medName.toLowerCase();
    const hasPenicillinAllergy = patient?.allergies?.some((a) =>
      a.toLowerCase().includes("penicillin")
    );

    if (
      hasPenicillinAllergy &&
      (nameLower.includes("amoxicillin") ||
        nameLower.includes("penicillin") ||
        nameLower.includes("ampicillin") ||
        nameLower.includes("clavulanate"))
    ) {
      return { safe: false, message: "Allergy Risk" };
    }
    return { safe: true, message: "Safe" };
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

  const unresolvedAllergyCount = medicines.filter((m) => !checkMedicineSafety(m.name).safe).length;

  return (
    <DashboardLayout vitals={vitals} setVitals={setVitals} timeline={timeline}>
      {/* ══════════════ BODY: MAIN (tabs) + RESIZE HANDLE + AI PANEL ══════════════ */}
      <div className="flex-1 flex min-h-0 h-full w-full overflow-hidden">

        {/* ══════ MAIN WORKSPACE ══════ */}
        <div className="flex-1 flex flex-col min-w-0" style={{ width: `calc(100% - ${chatWidth}px)` }}>
          <div className="px-6 pt-4 flex items-center justify-between flex-shrink-0">
            <button
              onClick={() => (window.location.href = `/patient/${patientId}`)}
              className="inline-flex items-center gap-2 text-[#6B7280] hover:text-[#111827] text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Profile
            </button>
            <div className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider">
              Visit ID: <span className="font-mono text-[#111827] font-semibold">{activeVisit?.id?.slice(0, 8) || "..."}</span>
              <span className="mx-2 text-[#E5E7EB]">|</span>
              <span className="inline-flex items-center gap-1 text-[#2563EB]"><Clock className="h-3.5 w-3.5" />{formatTimer(secondsElapsed)}</span>
            </div>
          </div>

          {/* Patient Header Card — persistent context, always visible regardless of tab */}
          <div className="mx-6 mt-4 p-5 rounded-2xl border border-[#E5E7EB] bg-white shadow-sm flex-shrink-0">
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              <PatientAvatar />

              <div className="space-y-3 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl font-bold tracking-tight text-[#111827]">
                    {patient?.full_name || "Loading Patient..."}
                  </h1>
                  <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center text-[#2563EB]">
                    <CheckCircle className="h-4 w-4 fill-current" />
                  </div>

                  {patient?.allergies && patient.allergies.length > 0 ? (
                    <div className="flex gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 border border-red-100 text-[#DC2626] uppercase">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {patient.allergies[0]} Allergy
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 border border-amber-100 text-[#F59E0B] uppercase">
                        Moderate Risk
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 border border-emerald-100 text-[#16A34A] uppercase">
                      No Allergies
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-6 text-sm border-b border-[#E5E7EB] pb-3.5">
                  <div>
                    <span className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider block">Patient Reference</span>
                    <span className="font-mono text-[#111827] font-semibold block mt-0.5">ID: {patient?.id?.slice(0, 8) || "..."}</span>
                  </div>
                  <div>
                    <span className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider block">Age / Gender</span>
                    <span className="text-[#111827] font-medium block mt-0.5">
                      {patient ? `${getAge(patient.date_of_birth)} Yrs, ${patient.gender}` : "..."}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider block">Blood Group</span>
                    <span className="text-[#DC2626] font-bold block mt-0.5 inline-flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5 fill-[#DC2626] stroke-none" />
                      {patient?.blood_group || "Unknown"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider block">Insurance Profile</span>
                    <span className="text-[#111827] font-medium block mt-0.5">Star Health Insurance</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                  {[
                    { label: "Height", value: "170 cm" },
                    { label: "Weight", value: vitals.weight ? `${vitals.weight} kg` : "72 kg" },
                    { label: "BMI Ratio", value: `${(parseFloat(vitals.weight || "72") / 2.89).toFixed(1)} (Normal)` },
                    { label: "Primary Diagnosis", value: "Acute Tonsillitis" },
                  ].map((stat, i) => (
                    <div key={i}>
                      <span className="text-xs text-[#6B7280] font-bold uppercase tracking-wider block">{stat.label}</span>
                      <span className="text-sm font-semibold text-[#111827] block mt-0.5">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tab content — scrollable */}
          <main className="flex-1 overflow-y-auto px-6 py-5 pb-24 space-y-4">

            {/* ── TAB: VITALS & VOICE ───────────────────────────────────────── */}
            {activeTab === "vitals" && (
              <div className="flex-1 flex flex-col h-full items-stretch justify-center p-2 space-y-6">
                <div className="flex-1 min-h-[48vh] flex flex-col items-center justify-between p-8 border border-[#E5E7EB] bg-white rounded-2xl shadow-sm text-center">
                  
                  {/* Header info */}
                  <div className="space-y-2 max-w-xl">
                    <h2 className="text-sm font-bold text-[#111827] uppercase tracking-wider">
                      Active Voice Dictation Workspace
                    </h2>
                    <p className="text-xs text-[#6B7280]">
                      Speak medication names, dosages, and clinical instructions. The system transcribes in real time and automatically structures the medical prescription.
                    </p>
                  </div>

                  {/* Hero Voice Controller */}
                  <div className="flex flex-col items-center justify-center space-y-6 py-6 w-full max-w-2xl">
                    
                    {/* Live Waveform and mic */}
                    <div className="relative flex items-center justify-center h-40 w-40">
                      
                      {/* Animated waves when dictating */}
                      {dictating && (
                        <>
                          <div className="absolute inset-0 rounded-full bg-blue-50 border border-blue-100 animate-ping opacity-60" style={{ animationDuration: "1.8s" }} />
                          <div className="absolute inset-4 rounded-full bg-blue-100/50 animate-ping opacity-45" style={{ animationDuration: "1.4s" }} />
                        </>
                      )}
                      
                      {dictating ? (
                        <button
                          onClick={stopDictation}
                          className="h-28 w-28 rounded-full bg-[#DC2626] hover:bg-red-700 text-white flex flex-col items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer z-10"
                        >
                          <MicOff className="h-8 w-8 text-white animate-pulse" />
                          <span className="text-[9px] font-bold uppercase tracking-wider mt-2">Stop Listening</span>
                        </button>
                      ) : (
                        <button
                          onClick={startDictation}
                          disabled={dictationLoading}
                          className="h-28 w-28 rounded-full bg-[#2563EB] hover:bg-blue-700 disabled:opacity-40 text-white flex flex-col items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer z-10"
                        >
                          {dictationLoading ? (
                            <Loader2 className="h-8 w-8 text-white animate-spin" />
                          ) : (
                            <Mic className="h-8 w-8 text-white animate-pulse" />
                          )}
                          <span className="text-[9px] font-bold uppercase tracking-wider mt-2">
                            {dictationLoading ? "Analyzing Audio" : "Start Recording"}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Google Assistant waves */}
                    {dictating && (
                      <div className="flex items-end gap-[4px] h-6 px-6">
                        {[...Array(16)].map((_, i) => (
                          <div
                            key={i}
                            className="w-[2px] bg-[#2563EB] rounded-full"
                            style={{
                              height: "100%",
                              animation: `rxwave ${0.4 + (i % 4) * 0.15}s ease-in-out infinite alternate`,
                              animationDelay: `${i * 0.04}s`,
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {dictationStatus && (
                      <span className="text-xs bg-blue-50 text-[#2563EB] px-3.5 py-1.5 rounded-full border border-blue-100 font-bold uppercase tracking-wider">
                        {dictationStatus}
                      </span>
                    )}
                  </div>

                  {/* Realtime Live Text blackboard */}
                  <div className="w-full bg-[#F8FAFC] border border-[#E5E7EB] rounded-2xl p-5 h-44 overflow-y-auto text-left flex flex-col justify-start">
                    <span className="text-[10px] text-[#6B7280] font-bold uppercase tracking-wider block mb-2">
                      Realtime Transcription Output
                    </span>
                    <div className="flex-1 overflow-y-auto">
                      {liveTranscript ? (
                        <p className="text-sm text-slate-800 font-medium leading-relaxed">
                          {liveTranscript}
                          <span className="inline-block w-1.5 h-4 bg-[#2563EB] ml-1 animate-pulse" />
                        </p>
                      ) : (
                        <p className="text-xs italic text-[#6B7280] mt-1">
                          No audio input. Click "Start Recording" and speak clearly to see realtime transcription...
                        </p>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* ── TAB: PRESCRIPTION ─────────────────────────────────────────── */}
            {activeTab === "rx" && (
              <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Pill className="h-5 w-5 text-[#2563EB]" />
                    <h2 className="text-base font-bold text-[#111827]">Prescription Medication Guide</h2>
                    {medicines.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 border border-blue-100 text-[#2563EB]">
                        {medicines.length} Rows
                      </span>
                    )}
                  </div>
                  <button
                    onClick={addMedRow}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#2563EB] cursor-pointer active:scale-95 transition-all"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Medication</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <datalist id="medicine-suggestions">
                    {MEDICINES_LIST.map((med) => (
                      <option key={med} value={med} />
                    ))}
                  </datalist>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
                        <th className="px-4 py-3 text-left text-xs text-[#6B7280] font-bold uppercase tracking-wider w-8">#</th>
                        <th className="px-3 py-3 text-left text-xs text-[#6B7280] font-bold uppercase tracking-wider min-w-[160px]">Medication</th>
                        <th className="px-3 py-3 text-left text-xs text-[#6B7280] font-bold uppercase tracking-wider w-24">Strength</th>
                        <th className="px-3 py-3 text-left text-xs text-[#6B7280] font-bold uppercase tracking-wider w-24">Dosage</th>
                        <th className="px-3 py-3 text-left text-xs text-[#6B7280] font-bold uppercase tracking-wider min-w-[130px]">Frequency</th>
                        <th className="px-3 py-3 text-center text-xs text-[#6B7280] font-bold uppercase tracking-wider w-44">Timing</th>
                        <th className="px-3 py-3 text-left text-xs text-[#6B7280] font-bold uppercase tracking-wider w-24">Duration</th>
                        <th className="px-3 py-3 text-left text-xs text-[#6B7280] font-bold uppercase tracking-wider min-w-[130px]">Instructions</th>
                        <th className="px-3 py-3 text-left text-xs text-[#6B7280] font-bold uppercase tracking-wider w-40">Safety</th>
                        <th className="px-4 py-3 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {medicines.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-16 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <div className="p-4 rounded-full bg-[#F8FAFC] border border-[#E5E7EB]">
                                <Pill className="h-8 w-8 text-[#6B7280]" />
                              </div>
                              <div>
                                <p className="text-[#111827] text-sm font-bold">Prescription Guide is Empty</p>
                                <p className="text-sm text-[#6B7280] mt-1 font-normal">
                                  Dictate notes on the Vitals & Voice tab or click "Add Medication" to start.
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        medicines.map((med, idx) => {
                          const safetyInfo = checkMedicineSafety(med.name);
                          const freqVals = parseFrequency(med.frequency);

                          return (
                            <tr key={idx} className="border-b border-[#E5E7EB] hover:bg-slate-50 group transition-colors bg-white">
                              <td className="px-4 py-2 text-[#6B7280] font-bold text-center font-mono">{idx + 1}</td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  list="medicine-suggestions"
                                  value={med.name ?? ""}
                                  placeholder="Amoxicillin"
                                  onChange={(e) => handleMedChange(idx, "name", e.target.value)}
                                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm font-semibold text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  value={med.strength ?? ""}
                                  placeholder="250 mg"
                                  onChange={(e) => handleMedChange(idx, "strength", e.target.value)}
                                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  value={med.warnings ?? ""}
                                  placeholder="1 Tablet"
                                  onChange={(e) => handleMedChange(idx, "warnings", e.target.value)}
                                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  placeholder="3 times daily"
                                  value={
                                    med.frequency && !med.frequency.includes("-")
                                      ? med.frequency
                                      : `${[freqVals.morn, freqVals.aft, freqVals.night].filter(Boolean).length} time(s) daily`
                                  }
                                  onChange={(e) => handleMedChange(idx, "frequency", e.target.value)}
                                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center justify-center gap-3">
                                  {[
                                    { label: "Morn", val: freqVals.morn, keyName: "morn" },
                                    { label: "Aft", val: freqVals.aft, keyName: "aft" },
                                    { label: "Night", val: freqVals.night, keyName: "night" },
                                  ].map((t) => (
                                    <label key={t.label} className="flex items-center gap-1 cursor-pointer select-none text-xs font-bold uppercase text-[#6B7280] hover:text-[#111827]">
                                      <input
                                        type="checkbox"
                                        checked={t.val}
                                        onChange={(e) => {
                                          const newVals = { ...freqVals, [t.keyName]: e.target.checked };
                                          handleMedChange(idx, "frequency", formatFrequency(newVals.morn, newVals.aft, newVals.night));
                                        }}
                                        className="h-4 w-4 rounded border-[#E5E7EB] text-[#2563EB] focus:ring-1 focus:ring-[#2563EB] cursor-pointer accent-[#2563EB]"
                                      />
                                      <span>{t.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  value={med.duration ?? ""}
                                  placeholder="7 days"
                                  onChange={(e) => handleMedChange(idx, "duration", e.target.value)}
                                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  value={med.instructions ?? ""}
                                  placeholder="After meals"
                                  onChange={(e) => handleMedChange(idx, "instructions", e.target.value)}
                                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
                                />
                              </td>
                              <td className="px-2 py-2">
                                {safetyInfo.safe ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold bg-emerald-50 border border-emerald-100 text-[#16A34A] uppercase tracking-wider">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    {safetyInfo.message}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold bg-red-50 border border-red-100 text-[#DC2626] uppercase tracking-wider animate-pulse">
                                    <ShieldAlert className="h-3.5 w-3.5" />
                                    {safetyInfo.message}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  onClick={() => removeMedRow(idx)}
                                  className="p-2 rounded-lg text-[#6B7280] hover:text-[#DC2626] hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer border border-transparent hover:border-red-100"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB: TRENDS & LABS ────────────────────────────────────────── */}
            {activeTab === "history" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Vitals Trend — drag the bottom-
                 {/* Vitals Trend — drag the bottom- */}
                <div className="p-4 rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-4 border-b border-[#E5E7EB] pb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-[#2563EB]" />
                      <h3 className="text-sm font-bold text-[#111827]">
                        Vitals Historical Trend
                      </h3>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Heart Rate", value: vitals.hr ? `${vitals.hr} bpm` : "78 bpm", color: "#DC2626", points: [68, 72, 70, 78, 74, 78] },
                      { label: "Blood Pressure", value: vitals.bp ? `${vitals.bp} mmHg` : "120/80 mmHg", color: "#2563EB", points: [118, 122, 120, 118, 121, 120] },
                      { label: "Body Temp", value: vitals.temp ? `${vitals.temp} °F` : "98.6 °F", color: "#F59E0B", points: [98.4, 98.6, 98.5, 98.7, 98.6, 98.6] },
                      { label: "Oxygen SpO₂", value: vitals.spo2 ? `${vitals.spo2} %` : "98 %", color: "#16A34A", points: [97, 98, 97, 99, 98, 98] },
                    ].map((trend, idx) => (
                      <div key={idx} className="p-3 bg-[#F8FAFC] rounded-xl border border-[#E5E7EB] flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-[#6B7280] font-bold uppercase tracking-wider block">
                            {trend.label}
                          </span>
                          <span className="text-xs font-bold text-[#111827] block mt-0.5">{trend.value}</span>
                        </div>
                        <div className="opacity-80">
                          <Sparkline points={trend.points} color={trend.color} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Lab Reports Section */}
                <div className="p-4 rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-4 border-b border-[#E5E7EB] pb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#2563EB]" />
                      <h3 className="text-sm font-bold text-[#111827]">
                        Recent Lab Records
                      </h3>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {[
                      { test: "CBC Complete Blood Count", date: "10 May 2025", status: "Normal" },
                      { test: "ESR Erythrocyte Sedimentation Rate", date: "10 May 2025", status: "Normal" },
                      { test: "Throat Swab Culture", date: "08 May 2025", status: "Normal" },
                    ].map((lab, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB] hover:bg-slate-55 transition-all text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#111827] truncate">{lab.test}</p>
                          <p className="text-[10px] text-[#6B7280] mt-0.5">{lab.date}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 border border-emerald-250 text-[#16A34A] uppercase">
                          {lab.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* Sticky Bottom Actions Bar */}
          <footer className="h-16 border-t border-[#E5E7EB] bg-white px-6 flex items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrint}
                disabled={printLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-[#E5E7EB] rounded-xl text-xs font-bold text-slate-700 cursor-pointer active:scale-95 transition-all disabled:opacity-55 shadow-sm"
              >
                {printLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 text-[#2563EB]" />}
                <span>Preview PDF</span>
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-[#E5E7EB] rounded-xl text-xs font-bold text-slate-700 cursor-pointer active:scale-95 transition-all disabled:opacity-55 shadow-sm"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
                <span>Save Draft</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleFinalize}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer active:scale-95 transition-all shadow-sm disabled:opacity-55"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                <span>Finalize Prescription</span>
              </button>

              <button
                onClick={handlePrint}
                disabled={printLoading}
                className="p-2 hover:bg-slate-55 bg-white border border-[#E5E7EB] rounded-xl text-slate-500 hover:text-slate-900 cursor-pointer active:scale-95 transition-all hidden sm:block shadow-sm"
              >
                <Printer className="h-4 w-4" />
              </button>
              <button className="p-2 hover:bg-slate-55 bg-white border border-[#E5E7EB] rounded-xl text-slate-500 hover:text-slate-900 cursor-pointer active:scale-95 transition-all hidden sm:block shadow-sm">
                <RefreshCw className="h-4 w-4" />
              </button>
              <button className="p-2 hover:bg-slate-55 bg-white border border-[#E5E7EB] rounded-xl text-slate-500 hover:text-slate-900 cursor-pointer active:scale-95 transition-all shadow-sm">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </div>

        {/* ══════ COL-RESIZE HANDLE ══════ */}
        <div
          onMouseDown={startResize}
          className="w-1.5 hover:w-2 bg-[#E5E7EB] hover:bg-[#2563EB] cursor-col-resize flex-shrink-0 transition-all duration-150 relative z-30"
          title="Drag to resize RAG Clinical Assistant"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-[#E5E7EB] rounded-md p-1 shadow-sm pointer-events-none text-[#6B7280]">
            <GripVertical className="h-4.5 w-4.5" />
          </div>
        </div>

        {/* ══════ AI CLINICAL ASSISTANT & TIMELINE PANEL (Right Sidebar) ══════ */}
        <div
          className="flex-shrink-0 flex flex-col bg-white border-l border-[#E5E7EB] h-full overflow-hidden"
          style={{ width: chatWidth }}
        >
          {/* AI Clinical Assistant Chat Card */}
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-[#E5E7EB] flex items-center justify-between bg-[#F8FAFC] flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-100">
                  <BookOpen className="h-4 w-4 text-[#2563EB]" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#111827]">
                  AI Clinical Assistant
                </span>
              </div>
              <div className="flex gap-2">
                <Maximize2 className="h-3.5 w-3.5 text-[#6B7280] hover:text-[#111827] cursor-pointer transition-colors" />
                <Settings className="h-3.5 w-3.5 text-[#6B7280] hover:text-[#111827] cursor-pointer transition-colors" />
              </div>
            </div>

            {/* Conversation Space */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white min-h-0">
              {ragMessages.map((msg, i) => {
                const isAi = msg.sender === "ai";
                const classification = isAi ? classifyMessage(msg.text) : null;
                const Icon = classification ? classification.icon : Info;
                
                return (
                  <div key={i} className={`flex flex-col ${isAi ? "items-start" : "items-end"}`}>
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] text-[#6B7280] font-semibold uppercase">
                      {isAi ? (
                        <>
                          <Icon className={`h-3 w-3 ${classification?.iconColor}`} />
                          <span className={`px-1.5 py-0.5 rounded ${classification?.chip}`}>
                            {classification?.key}
                          </span>
                        </>
                      ) : (
                        <span>You</span>
                      )}
                    </div>
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl max-w-[90%] leading-relaxed text-xs shadow-sm ${
                        msg.sender === "ai" ? classification?.bubble : ""
                      }`}
                      style={
                        msg.sender === "user"
                          ? { background: "#2563EB", color: "white", borderBottomRightRadius: 4 }
                          : { borderBottomLeftRadius: 4 }
                      }
                    >
                      {msg.text}
                      
                      {/* Suggested Medicine Actions */}
                      {isAi && (
                        <div className="mt-2.5 flex flex-wrap gap-2 pt-2 border-t border-slate-200/50">
                          {msg.text.includes("Azithromycin") && (
                            <button
                              type="button"
                              onClick={() => addSuggestedMedicine("Azithromycin", "500 mg")}
                              className="px-2 py-1 bg-white border border-[#E5E7EB] hover:bg-blue-50 text-[10px] font-bold text-[#2563EB] rounded-lg inline-flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                            >
                              <Plus className="h-3 w-3" /> Add Azithromycin 500mg
                            </button>
                          )}
                          {msg.text.includes("Clindamycin") && (
                            <button
                              type="button"
                              onClick={() => addSuggestedMedicine("Clindamycin", "300 mg")}
                              className="px-2 py-1 bg-white border border-[#E5E7EB] hover:bg-blue-50 text-[10px] font-bold text-[#2563EB] rounded-lg inline-flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                            >
                              <Plus className="h-3 w-3" /> Add Clindamycin 300mg
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-1.5 p-2.5 rounded-xl text-[10px] text-[#6B7280] bg-[#F8FAFC] border border-[#E5E7EB] leading-relaxed max-w-[95%]">
                        <span className="font-bold text-[#111827] uppercase tracking-wider text-[8px] block mb-1">
                          Grounded Citations
                        </span>
                        {msg.citations.map((c, j) => (
                          <p key={j} className="border-t border-[#E5E7EB] pt-1 mt-1 first:border-0 first:mt-0 first:pt-0">
                            {c}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {(ragLoading || summarizing) && (
                <div className="flex items-center gap-2 text-[#6B7280] font-semibold text-[10px]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>SEARCHING CLINICAL HISTORY...</span>
                </div>
              )}
              <div ref={ragEndRef} />
            </div>

            {/* Quick Actions */}
            <div className="px-4 py-2 border-t border-[#E5E7EB] bg-[#F8FAFC]/50 flex-shrink-0">
              <span className="text-[8px] font-bold text-[#6B7280] uppercase tracking-wider block mb-1.5">
                Clinical Queries
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Summarize History", action: () => handleSummarize() },
                  { label: "Review Allergies", action: () => handleRagQueryText("What allergies does this patient have?") },
                  { label: "Suggest Medicines", action: () => handleRagQueryText("Suggest non-penicillin alternative medicines for acute tonsillitis.") },
                  { label: "Check Interactions", action: () => handleRagQueryText("Check interactions for amoxicillin with allergies.") },
                ].map((btn, index) => (
                  <button
                    key={index}
                    onClick={btn.action}
                    disabled={ragLoading || summarizing}
                    className="py-1.5 px-2 bg-white hover:bg-slate-55 border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] rounded-lg text-[9px] font-semibold transition-all text-left truncate cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Form */}
            <form onSubmit={handleRagSubmit} className="flex gap-2 p-3 border-t border-[#E5E7EB] bg-white flex-shrink-0">
              <input
                type="text"
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                placeholder="Ask clinical assistant..."
                className="flex-1 px-3 py-2 rounded-xl text-xs bg-[#F8FAFC] border border-[#E5E7EB] text-[#111827] placeholder-[#6B7280] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
              />
              <button
                type="submit"
                disabled={ragLoading || summarizing}
                className="p-2 bg-[#2563EB] hover:bg-blue-700 rounded-xl text-white transition-all cursor-pointer active:scale-95 disabled:opacity-50 flex items-center justify-center shadow-sm"
              >
                <Send className="h-4.5 w-4.5" />
              </button>
            </form>
          </div>
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
