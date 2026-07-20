"use client";

import React, { useState, useEffect, useRef, useCallback, use } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import LiveCaption from "@/components/LiveCaption";
import { TimeSeriesChart } from "@/components/TimeSeriesChart";
import { api, Visit, Vitals, Medicine } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, Loader2, CheckCircle, Printer,
  Mic, MicOff, Plus, Trash2, Pill, Activity,
  BookOpen, Send, Sparkles, ShieldCheck, Heart,
  FileText, Clock, Wrench, Eye, EyeOff, Copy, RotateCcw,
  ChevronDown, ChevronRight, ShieldAlert, Maximize2,
  GripVertical, History, AlertTriangle, Info, Brain, Zap, Square,
  RefreshCw, MoreHorizontal
} from "lucide-react";

// ─── Agent types ──────────────────────────────────────────────────────────────
type AgentStepUI = {
  type: "tool_call" | "observation" | "error";
  tool_name?: string;
  tool_args?: Record<string, any>;
  label?: string;
  result?: string;
  duration_ms?: number;
  is_safety_relevant?: boolean;
};
type AgentMessage = {
  id: string;
  sender: "user" | "agent";
  // User message
  text?: string;
  // Agent message
  steps?: AgentStepUI[];
  streamingText?: string;
  finalText?: string;
  isStreaming?: boolean;
  isThinking?: boolean;
  thinkingMsg?: string;
  isGrounded?: boolean;
  hasSafetyDisclaimer?: boolean;
  tool_calls_made?: string[];
  isError?: boolean;
};
type Tab = "vitals" | "rx" | "history";

import { MEDICINES_LIST } from "@/lib/medicines";
import { AgentMessageBubble } from "@/components/AgentMessageBubble";

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

const getLevenshteinDistance = (a: string, b: string): number => {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
};

const getMedicineSuggestion = (input: string): string | null => {
  if (!input || input.trim() === "") return null;
  const name = input.trim().toLowerCase();
  
  const hasExact = MEDICINES_LIST.some((m) => m.toLowerCase() === name);
  if (hasExact) return null;
  
  let bestMatch: string | null = null;
  let minDistance = 999;
  
  for (const med of MEDICINES_LIST) {
    const medLower = med.toLowerCase();
    
    if (medLower.includes(name) && name.length >= 3) {
      return med;
    }
    if (name.includes(medLower) && medLower.length >= 3) {
      return med;
    }
    
    const dist = getLevenshteinDistance(name, medLower);
    
    const targetLen = medLower.length;
    let maxDist = 3;
    if (targetLen <= 5) maxDist = 1;
    else if (targetLen <= 8) maxDist = 2;
    else maxDist = 4;

    if (dist < minDistance && dist <= maxDist) {
      minDistance = dist;
      bestMatch = med;
    }
  }
  
  return bestMatch;
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
  const [expandedLab, setExpandedLab] = useState<string | null>(null);
  
  const [activeEditName, setActiveEditName] = useState("");
  const [debouncedEditName, setDebouncedEditName] = useState("");
  const [activeEditIndex, setActiveEditIndex] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEditName(activeEditName);
    }, 200);
    return () => clearTimeout(timer);
  }, [activeEditName]);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") || "vitals") as Tab;
  const handleTabChange = (tabId: Tab) => {
    router.push(`/patient/${patientId}/consultation?tab=${tabId}`);
  };

  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>("");

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

  // ── Agent sidebar ─────────────────────────────────────────────────────────
  const [agentInput, setAgentInput] = useState("");
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([
    {
      id: "welcome",
      sender: "agent",
      finalText: "Hello Dr. 👋 I'm your **AI Clinical Agent** — I reason step-by-step using your patient's live data. Ask me anything about this patient, a drug interaction, or their history.",
      steps: [],
      isGrounded: false,
    },
  ]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [seenFirstAgentAnswer, setSeenFirstAgentAnswer] = useState(false);
  const [aiSheetOpen, setAiSheetOpen] = useState(false); // mobile AI slide-up sheet
  const [chatbotDictating, setChatbotDictating] = useState(false);
  const [chatbotLoading, setChatbotLoading] = useState(false);
  const chatbotRecorderRef = useRef<MediaRecorder | null>(null);
  const chatbotChunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const ragEndRef = useRef<HTMLDivElement>(null);

  const cacheKey = `clinical_agent_chat_${patientId}`;

  // Load agent messages cache and listen for updates from other tabs
  useEffect(() => {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        setAgentMessages(JSON.parse(cached));
        setSeenFirstAgentAnswer(true);
      } catch (e) {
        console.error("Failed to parse cached agent messages", e);
      }
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === cacheKey && e.newValue) {
        try {
          setAgentMessages(JSON.parse(e.newValue));
          setSeenFirstAgentAnswer(true);
        } catch (err) {
          console.error("Failed to parse synced agent messages", err);
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [cacheKey]);

  // Save agent messages cache
  useEffect(() => {
    if (agentMessages.length > 1 || (agentMessages.length === 1 && agentMessages[0].id !== "welcome")) {
      const cleanMsgs = agentMessages.map(m => ({
        ...m,
        isThinking: false,
        isStreaming: false,
        streamingText: undefined
      }));
      localStorage.setItem(cacheKey, JSON.stringify(cleanMsgs));
    }
  }, [agentMessages, cacheKey]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.getPatient(patientId),
  });

  const { data: timeline = [] } = useQuery({
    queryKey: ["patient-timeline", patientId],
    queryFn: () => api.getPatientTimeline(patientId),
  });

  const { data: trends } = useQuery({
    queryKey: ["patient-trends", patientId],
    queryFn: () => api.getPatientTrends(patientId),
  });

  const [selectedMetric, setSelectedMetric] = useState("heart_rate");
  const [selectedRange, setSelectedRange] = useState("30d");

  const { data: vitalsHistory = [], isLoading: isVitalsLoading } = useQuery({
    queryKey: ["patient-vitals-history", patientId, selectedMetric, selectedRange],
    queryFn: () => api.getPatientVitalsHistory(patientId, selectedMetric, selectedRange),
  });

  const { data: labHistory = [], isLoading: isLabHistoryLoading } = useQuery({
    queryKey: ["patient-lab-history", patientId, expandedLab],
    queryFn: () => expandedLab ? api.getPatientLabHistory(patientId, expandedLab) : Promise.resolve([]),
    enabled: !!expandedLab,
  });

  const getDeltaIndicator = (history: any[]) => {
    if (history.length < 2) return null;
    const latest = history[history.length - 1];
    const prev = history[history.length - 2];
    const latestVal = parseFloat(latest.value);
    const prevVal = parseFloat(prev.value);
    if (isNaN(latestVal) || isNaN(prevVal)) return null;
    const diff = latestVal - prevVal;
    const sign = diff >= 0 ? "+" : "";
    const color = diff <= 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold";
    let prevDateStr = "";
    try {
      prevDateStr = new Date(prev.timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    } catch {
      prevDateStr = prev.date || "";
    }
    return (
      <span className={`text-[11px] ml-2 ${color}`}>
        ({sign}{diff.toFixed(1)} since {prevDateStr})
      </span>
    );
  };

  const getUnit = (metric: string) => {
    switch (metric) {
      case "heart_rate": return "bpm";
      case "body_temperature": return "°F";
      case "oxygen": return "%";
      case "weight": return "kg";
      case "bmi": return "";
      default: return "";
    }
  };

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
  }, [agentMessages]);

  // ─── Voice Dictation ──────────────────────────────────────────────────────
  const startDictation = async () => {
    setDictating(true);
    setDictationStatus("🎙 Listening — speak now");
    setFinalTranscript("");
    setInterimTranscript("");
    finalTranscriptRef.current = "";
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
          for (let i = 0; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          setFinalTranscript(finalTranscript);
          setInterimTranscript(interimTranscript);
          finalTranscriptRef.current = finalTranscript;
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

    // Detect mobile device to skip MediaRecorder (avoids hardware concurrency conflict)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      return;
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
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    if (isMobile) {
      setDictating(false);
      setDictationStatus("⚙ AI parsing...");
      parseDictationText(finalTranscriptRef.current);
    } else {
      if (recorderRef.current && dictating) {
        recorderRef.current.stop();
      }
      setDictating(false);
      setDictationStatus("⚙ AI parsing...");
    }
  };

  const parseDictationText = async (text: string) => {
    if (!activeVisit) return;
    if (!text.trim()) {
      setDictationStatus("❌ No speech recognized");
      setTimeout(() => setDictationStatus(""), 3000);
      return;
    }
    setDictationLoading(true);
    try {
      const rx = await api.createPrescription(activeVisit.id, { transcript: text });
      setMedicines(rx.medicines ?? []);
      setDictationStatus("✅ Parsed!");
      handleTabChange("rx");
      setTimeout(() => setDictationStatus(""), 4000);
    } catch (err: any) {
      alert("Failed to parse dictation: " + err.message);
      setDictationStatus("");
    } finally {
      setDictationLoading(false);
    }
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

  // ─── Agent actions ────────────────────────────────────────────────────────
  const sendAgentMessage = async (question: string) => {
    if (!question.trim() || agentRunning) return;

    // Add user message
    const userMsgId = crypto.randomUUID();
    const agentMsgId = crypto.randomUUID();
    setAgentMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: "user", text: question },
      { id: agentMsgId, sender: "agent", isThinking: true, thinkingMsg: "Reasoning about your question…", steps: [], isStreaming: false, streamingText: "" },
    ]);
    setAgentRunning(true);

    const abort = new AbortController();
    abortRef.current = abort;

    const updateAgent = (patch: Partial<AgentMessage>) =>
      setAgentMessages((prev) => prev.map((m) => (m.id === agentMsgId ? { ...m, ...patch } : m)));

    try {
      await api.streamAgentQuery(
        patientId, question, activeVisit?.id,
        {
          onThinking: (msg) => updateAgent({ isThinking: true, thinkingMsg: msg }),
          onToolCall: (tool_name, tool_args, label) =>
            setAgentMessages((prev) => prev.map((m) =>
              m.id !== agentMsgId ? m : {
                ...m,
                isThinking: false,
                steps: [...(m.steps ?? []), { type: "tool_call" as const, tool_name, tool_args, label }],
              }
            )),
          onObservation: (tool_name, result, duration_ms, is_safety_relevant) =>
            setAgentMessages((prev) => prev.map((m) => {
              if (m.id !== agentMsgId) return m;
              const steps = [...(m.steps ?? [])];
              // Update the last tool_call step with observation
              const lastToolIdx = [...steps].reverse().findIndex(s => s.type === "tool_call" && s.tool_name === tool_name);
              const idx = lastToolIdx >= 0 ? steps.length - 1 - lastToolIdx : -1;
              if (idx >= 0) {
                steps[idx] = { ...steps[idx], result, duration_ms, is_safety_relevant };
              } else {
                steps.push({ type: "observation", tool_name, result, duration_ms, is_safety_relevant });
              }
              return { ...m, steps };
            })),
          onChunk: (chunk) =>
            setAgentMessages((prev) => prev.map((m) =>
              m.id === agentMsgId
                ? { ...m, isThinking: false, isStreaming: true, streamingText: (m.streamingText ?? "") + chunk }
                : m
            )),
          onDone: (data) => {
            setSeenFirstAgentAnswer(true);
            setAgentMessages((prev) => prev.map((m) =>
              m.id === agentMsgId
                ? { ...m, isStreaming: false, finalText: m.streamingText, streamingText: undefined,
                    isGrounded: data.is_grounded, hasSafetyDisclaimer: data.has_safety_disclaimer,
                    tool_calls_made: data.tool_calls_made }
                : m
            ));
          },
          onError: (msg) => updateAgent({ isError: true, finalText: `⚠️ ${msg}`, isThinking: false, isStreaming: false }),
        },
        abort.signal
      );
    } catch (err: any) {
      if (err.name !== "AbortError") {
        updateAgent({ isError: true, finalText: `⚠️ ${err.message}`, isThinking: false, isStreaming: false });
      }
    } finally {
      setAgentRunning(false);
      abortRef.current = null;
    }
  };
  const parseChatbotDictation = async (blob: Blob) => {
    setChatbotLoading(true);
    try {
      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          try {
            const b64 = (reader.result as string).split(",")[1];
            const res = await api.transcribeAudio(b64, "webm");
            if (res.transcript) {
              setAgentInput(res.transcript);
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
      });
    } catch (err: any) {
      console.error("Chatbot dictation failed:", err);
    } finally {
      setChatbotLoading(false);
    }
  };

  const toggleChatbotDictation = async () => {
    if (chatbotDictating) {
      chatbotRecorderRef.current?.stop();
      setChatbotDictating(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chatbotRecorderRef.current = recorder;
      chatbotChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chatbotChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chatbotChunksRef.current, { type: "audio/webm" });
        await parseChatbotDictation(audioBlob);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setChatbotDictating(true);
    } catch (err) {
      alert("Microphone access required for chatbot voice input.");
      setChatbotDictating(false);
    }
  };

  const handleAgentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentInput.trim()) return;
    if (chatbotDictating) {
      chatbotRecorderRef.current?.stop();
      setChatbotDictating(false);
    }
    const q = agentInput;
    setAgentInput("");
    sendAgentMessage(q);
  };

  const stopAgent = () => {
    abortRef.current?.abort();
    setAgentRunning(false);
  };

  const copyMessage = (text: string) => navigator.clipboard.writeText(text);
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
      const rx = await api.createPrescription(activeVisit.id, { medicines: finalMeds });
      await api.completeVisit(activeVisit.id);
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      alert("Consultation finalized successfully.");
      window.location.href = `/patient/${patientId}/prescription/preview?prescriptionId=${rx.id}`;
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
      <div 
        className="flex-1 flex flex-col lg:flex-row min-h-0 h-full w-full overflow-y-auto"
        style={{ "--chat-width": `${chatWidth}px` } as React.CSSProperties}
      >

        {/* ══════ MAIN WORKSPACE ══════ */}
        <div className="flex-1 flex flex-col min-w-0 w-full lg:w-[calc(100%-var(--chat-width))]" style={{}}>
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
          <div className="mx-3 sm:mx-6 mt-3 sm:mt-4 p-3 sm:p-5 rounded-2xl border border-[#E5E7EB] bg-white shadow-sm flex-shrink-0">
            <div className="flex flex-col md:flex-row md:items-center gap-4 sm:gap-5">
              <div className="hidden sm:block flex-shrink-0">
                <PatientAvatar />
              </div>

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
          <main className="flex-1 px-3 sm:px-6 py-4 sm:py-5 pb-28 lg:pb-6 space-y-4">

            {/* ── TAB: VITALS & VOICE ───────────────────────────────────────── */}
            {activeTab === "vitals" && (
              <div className="flex-1 flex flex-col h-full items-stretch justify-center p-2 space-y-6">
                <div className="flex-1 min-h-[48vh] flex flex-col items-center justify-between p-8 border border-[#E5E7EB] bg-white rounded-2xl shadow-sm text-center">
                  
                  {/* Dynamic Voice Dictation Workspace */}
                  <div className="flex-1 w-full flex flex-col items-center justify-center py-6 max-w-2xl min-h-[30vh]">
                    {dictationLoading ? (
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="h-12 w-12 text-[#2563EB] animate-spin" />
                        <span className="text-sm font-bold uppercase tracking-wider text-[#6B7280]">
                          Analyzing Audio...
                        </span>
                      </div>
                    ) : dictating ? (
                      <div className="flex flex-col items-center justify-center space-y-6 w-full animate-fade-in">
                        {/* Live Captioning takes over the entire center space */}
                        <LiveCaption transcriptStream={{ finalText: finalTranscript, interimText: interimTranscript }} />
                        
                        {/* Google Assistant waves */}
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

                        {/* Smaller stop button underneath the text */}
                        <button
                          onClick={stopDictation}
                          className="h-12 px-6 rounded-full bg-[#DC2626] hover:bg-red-700 text-white flex items-center justify-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer z-10"
                        >
                          <MicOff className="h-4 w-4 text-white animate-pulse" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Stop Listening</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-4 animate-fade-in">
                        {/* Big Start Recording Button */}
                        <button
                          onClick={startDictation}
                          className="h-28 w-28 rounded-full bg-[#2563EB] hover:bg-blue-700 text-white flex flex-col items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer z-10"
                        >
                          <Mic className="h-8 w-8 text-white animate-pulse" />
                          <span className="text-[9px] font-bold uppercase tracking-wider mt-2">
                            Start Recording
                          </span>
                        </button>
                        <span className="text-[11px] text-[#9CA3AF] font-bold uppercase tracking-wider">
                          Click to dictate prescription
                        </span>
                      </div>
                    )}

                    {dictationStatus && (
                      <span className="text-xs bg-blue-50 text-[#2563EB] px-3.5 py-1.5 rounded-full border border-blue-100 font-bold uppercase tracking-wider mt-4">
                        {dictationStatus}
                      </span>
                    )}
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
                                  onFocus={() => {
                                    setActiveEditIndex(idx);
                                    setActiveEditName(med.name ?? "");
                                  }}
                                  onBlur={() => setTimeout(() => setActiveEditIndex(null), 250)}
                                  onChange={(e) => {
                                    handleMedChange(idx, "name", e.target.value);
                                    setActiveEditName(e.target.value);
                                  }}
                                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm font-semibold text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
                                />
                                {(() => {
                                  const searchVal = activeEditIndex === idx ? debouncedEditName : (med.name ?? "");
                                  const suggestion = getMedicineSuggestion(searchVal);
                                  if (suggestion && suggestion.toLowerCase() !== (med.name ?? "").toLowerCase()) {
                                    return (
                                      <div className="mt-1.5 px-2 py-1 bg-amber-50 border border-amber-100 rounded-lg text-[10px] text-amber-700 font-semibold flex items-center gap-1.5">
                                        <span>Did you mean:</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleMedChange(idx, "name", suggestion);
                                            setActiveEditName(suggestion);
                                          }}
                                          className="underline cursor-pointer hover:text-amber-900 font-bold px-1.5 py-0.5 bg-white border border-amber-200 rounded shadow-sm hover:bg-slate-50 transition-all"
                                        >
                                          {suggestion}
                                        </button>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
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
              <div className="space-y-6 w-full text-[#111827]">
                
                {/* 1. Full-Width Vitals Trend Section */}
                <div className="p-5 rounded-2xl border border-[#E5E7EB] bg-white shadow-sm space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-[#2563EB]" />
                      <div>
                        <h3 className="text-base font-bold text-[#111827]">Vitals Historical Trend</h3>
                        <p className="text-xs text-[#6B7280]">Select a vital parameter and range to track patient health timeline.</p>
                      </div>
                    </div>
                    
                    {/* Range Selector */}
                    <div className="flex bg-[#F1F5F9] p-0.5 rounded-xl text-xs font-semibold self-start sm:self-center">
                      {[
                        { label: "7d", id: "7d" },
                        { label: "30d", id: "30d" },
                        { label: "90d", id: "90d" },
                        { label: "All", id: "all" }
                      ].map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setSelectedRange(r.id)}
                          className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                            selectedRange === r.id
                              ? "bg-white shadow-sm text-[#111827] font-bold"
                              : "text-[#6B7280] hover:text-[#111827]"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Vitals Tab Switcher */}
                  <div className="flex flex-wrap gap-2 border-b border-[#F1F5F9] pb-3">
                    {[
                      { label: "Heart Rate", id: "heart_rate" },
                      { label: "Blood Pressure", id: "blood_pressure" },
                      { label: "Body Temp", id: "body_temperature" },
                      { label: "Oxygen SpO₂", id: "oxygen" },
                      { label: "Weight", id: "weight" },
                      { label: "BMI", id: "bmi" }
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMetric(m.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                          selectedMetric === m.id
                            ? "bg-blue-50 border-[#2563EB] text-[#2563EB]"
                            : "bg-white border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] hover:border-[#D1D5DB]"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Chart Content Area */}
                  <div className="min-h-[280px] flex items-center justify-center">
                    {isVitalsLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 text-[#2563EB] animate-spin" />
                        <span className="text-sm font-semibold text-[#6B7280]">Loading history...</span>
                      </div>
                    ) : vitalsHistory && vitalsHistory.length >= 3 ? (
                      <div className="w-full">
                        <TimeSeriesChart data={vitalsHistory} metric={selectedMetric} />
                      </div>
                    ) : (
                      // Fallback Table View
                      <div className="w-full space-y-3">
                        <div className="text-center p-4 bg-[#F8FAFC] border border-[#E5E7EB] rounded-2xl max-w-md mx-auto">
                          <Info className="h-5 w-5 text-[#6B7280] mx-auto mb-2" />
                          <p className="text-xs font-bold text-[#111827]">Insufficient History for Charting</p>
                          <p className="text-[11px] text-[#6B7280] mt-1 font-normal">
                            At least 3 data points are required to plot a trend line. Showing raw records table.
                          </p>
                        </div>
                        
                        {vitalsHistory && vitalsHistory.length > 0 && (
                          <div className="overflow-hidden border border-[#E5E7EB] rounded-2xl bg-white">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[#6B7280] font-bold uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-2.5">Date & Time</th>
                                  {selectedMetric === "blood_pressure" ? (
                                    <>
                                      <th className="px-4 py-2.5">Systolic (mmHg)</th>
                                      <th className="px-4 py-2.5">Diastolic (mmHg)</th>
                                    </>
                                  ) : (
                                    <th className="px-4 py-2.5">Value</th>
                                  )}
                                  <th className="px-4 py-2.5">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#E5E7EB] text-[#111827] font-semibold">
                                {vitalsHistory.map((item: any, idx: number) => {
                                  let status = "Normal";
                                  if (selectedMetric === "heart_rate") {
                                    status = item.value < 60 || item.value > 100 ? "Out of Range" : "Normal";
                                  } else if (selectedMetric === "blood_pressure") {
                                    status = (item.systolic < 90 || item.systolic > 120 || item.diastolic < 60 || item.diastolic > 80) ? "Out of Range" : "Normal";
                                  } else if (selectedMetric === "body_temperature") {
                                    status = item.value < 97.0 || item.value > 99.0 ? "Out of Range" : "Normal";
                                  } else if (selectedMetric === "oxygen") {
                                    status = item.value < 95 ? "Low" : "Normal";
                                  } else if (selectedMetric === "bmi") {
                                    status = item.value < 18.5 || item.value > 24.9 ? "Out of Range" : "Normal";
                                  }
                                  
                                  return (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                      <td className="px-4 py-2.5 font-normal text-[#6B7280]">
                                        {new Date(item.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                      </td>
                                      {selectedMetric === "blood_pressure" ? (
                                        <>
                                          <td className="px-4 py-2.5">{item.systolic}</td>
                                          <td className="px-4 py-2.5">{item.diastolic}</td>
                                        </>
                                      ) : (
                                        <td className="px-4 py-2.5">{item.value} {getUnit(selectedMetric)}</td>
                                      )}
                                      <td className="px-4 py-2.5">
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                          status === "Normal"
                                            ? "bg-emerald-50 border border-emerald-200 text-[#16A34A]"
                                            : "bg-red-50 border border-red-200 text-red-600"
                                        }`}>
                                          {status}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Full-Width Lab History Section */}
                <div className="p-5 rounded-2xl border border-[#E5E7EB] bg-white shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-3">
                    <FileText className="h-5 w-5 text-[#2563EB]" />
                    <div>
                      <h3 className="text-base font-bold text-[#111827]">Recent Lab Records</h3>
                      <p className="text-xs text-[#6B7280]">Click any lab row to expand and view historical values and progress deltas.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(trends?.labs || []).map((lab: any, i: number) => {
                      const cleanName = lab.test.split(" (")[0];
                      const isExpanded = expandedLab === cleanName;

                      return (
                        <div key={i} className="border border-[#E5E7EB] rounded-2xl overflow-hidden bg-[#F8FAFC]/50 hover:bg-[#F8FAFC] transition-all">
                          <button
                            type="button"
                            onClick={() => setExpandedLab(isExpanded ? null : cleanName)}
                            className="w-full flex items-center justify-between p-3.5 text-left text-xs font-semibold cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-[#6B7280]" /> : <ChevronRight className="h-4 w-4 text-[#6B7280]" />}
                              <div className="min-w-0">
                                <p className="font-bold text-sm text-[#111827] truncate">{lab.test}</p>
                                <p className="text-[10px] text-[#6B7280] mt-0.5">Latest: {lab.date}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {!isExpanded && (
                                <span className="text-[10px] text-[#6B7280] italic">Click to view trend</span>
                              )}
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                lab.status === "High"
                                  ? "bg-red-50 border border-red-200 text-red-600"
                                  : lab.status === "Low"
                                  ? "bg-blue-50 border border-blue-200 text-blue-600"
                                  : "bg-emerald-50 border border-emerald-250 text-[#16A34A]"
                              }`}>
                                {lab.status}
                              </span>
                            </div>
                          </button>

                          {/* Expanded Lab History Area */}
                          {isExpanded && (
                            <div className="p-4 bg-white border-t border-[#E5E7EB] space-y-4">
                              {isLabHistoryLoading ? (
                                <div className="flex items-center gap-2 justify-center py-4">
                                  <Loader2 className="h-4 w-4 text-[#2563EB] animate-spin" />
                                  <span className="text-xs font-semibold text-[#6B7280]">Loading history...</span>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                                  {/* Lab Chart */}
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold text-[#111827]">Trend Chart</span>
                                      {getDeltaIndicator(labHistory)}
                                    </div>
                                    <div className="p-2 border border-[#E5E7EB] rounded-2xl bg-[#F8FAFC]/30">
                                      <TimeSeriesChart data={labHistory} metric="lab" height={200} />
                                    </div>
                                  </div>

                                  {/* Lab History Table */}
                                  <div className="space-y-2">
                                    <span className="text-xs font-bold text-[#111827] block">Measurement Logs</span>
                                    <div className="overflow-hidden border border-[#E5E7EB] rounded-2xl bg-white text-xs">
                                      <table className="w-full text-left">
                                        <thead className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[#6B7280] font-bold uppercase tracking-wider">
                                          <tr>
                                            <th className="px-3 py-2">Date & Time</th>
                                            <th className="px-3 py-2">Value</th>
                                            <th className="px-3 py-2">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#E5E7EB] text-[#111827] font-semibold">
                                          {labHistory.map((h: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-slate-55 transition-colors">
                                              <td className="px-3 py-2 font-normal text-[#6B7280]">
                                                {new Date(h.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                              </td>
                                              <td className="px-3 py-2">{h.display_value}</td>
                                              <td className="px-3 py-2">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                                  h.status === "High"
                                                    ? "bg-red-50 border border-red-200 text-red-600"
                                                    : h.status === "Low"
                                                    ? "bg-blue-50 border border-blue-200 text-blue-600"
                                                    : "bg-emerald-50 border border-emerald-250 text-[#16A34A]"
                                                }`}>
                                                  {h.status}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}
          </main>

          {/* ── Mobile Bottom Tab Bar (hidden on lg+) ── */}
          <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E5E7EB] flex items-stretch h-14 safe-pb">
            {([
              { label: "Dictation",   tabId: "vitals",   icon: Mic },
              { label: "Medications", tabId: "rx",        icon: Pill },
              { label: "Labs",        tabId: "history",   icon: History },
            ] as { label: string; tabId: Tab; icon: React.FC<{className?: string}> }[]).map(({ label, tabId, icon: Icon }) => (
              <button
                key={tabId}
                onClick={() => handleTabChange(tabId)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors min-h-[44px] cursor-pointer ${
                  activeTab === tabId
                    ? "text-[#2563EB] border-t-2 border-[#2563EB] -mt-px bg-blue-50/50"
                    : "text-[#6B7280] hover:text-[#111827]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </button>
            ))}
            {/* AI Agent toggle tab */}
            <button
              onClick={() => setAiSheetOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold text-[#6B7280] hover:text-[#2563EB] transition-colors min-h-[44px] cursor-pointer relative"
            >
              <Brain className="h-5 w-5" />
              <span>AI Agent</span>
              {agentRunning && (
                <span className="absolute top-2 right-[18%] h-2 w-2 rounded-full bg-[#2563EB] animate-pulse" />
              )}
            </button>
          </nav>

          {/* Sticky Bottom Actions Bar */}
          <footer className="border-t border-[#E5E7EB] bg-white px-3 sm:px-6 py-2 sm:h-16 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrint}
                disabled={printLoading}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-white hover:bg-slate-50 border border-[#E5E7EB] rounded-xl text-xs font-bold text-slate-700 cursor-pointer active:scale-95 transition-all disabled:opacity-55 shadow-sm"
              >
                {printLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 text-[#2563EB]" />}
                <span>Preview PDF</span>
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-white hover:bg-slate-50 border border-[#E5E7EB] rounded-xl text-xs font-bold text-slate-700 cursor-pointer active:scale-95 transition-all disabled:opacity-55 shadow-sm"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
                <span>Save Draft</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleFinalize}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer active:scale-95 transition-all shadow-sm disabled:opacity-55"
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
          className="hidden lg:block w-1.5 hover:w-2 bg-[#E5E7EB] hover:bg-[#2563EB] cursor-col-resize flex-shrink-0 transition-all duration-150 relative z-30"
          title="Drag to resize RAG Clinical Assistant"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-[#E5E7EB] rounded-md p-1 shadow-sm pointer-events-none text-[#6B7280]">
            <GripVertical className="h-4.5 w-4.5" />
          </div>
        </div>

        {/* ══════ AI CLINICAL AGENT PANEL ══════ */}

        {/* Mobile backdrop for AI slide-up sheet */}
        {aiSheetOpen && (
          <div
            onClick={() => setAiSheetOpen(false)}
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            aria-hidden="true"
          />
        )}

        <div className={`
          flex-shrink-0 flex flex-col bg-white overflow-hidden
          border-t border-[#E5E7EB] lg:border-t-0 lg:border-l
          lg:relative lg:h-full lg:w-[var(--chat-width)] lg:translate-y-0
          fixed inset-x-0 bottom-0 z-40 lg:z-auto
          transition-transform duration-300 ease-out
          ${aiSheetOpen ? "translate-y-0" : "translate-y-full lg:translate-y-0"}
          max-h-[85vh] lg:max-h-full rounded-t-2xl lg:rounded-none shadow-2xl lg:shadow-none
        `}>
          <div className="flex-1 flex flex-col min-h-0 bg-white">

            {/* ── Header ── */}
            <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFC] flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#2563EB] shadow-sm">
                  <Brain className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <span className="text-xs font-bold text-[#111827] block leading-tight">AI Clinical Agent</span>
                  <span className="text-[9px] text-[#6B7280] font-medium">Multi-tool · RAG · Safety-aware</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Mobile close handle for AI sheet */}
                <button
                  onClick={() => setAiSheetOpen(false)}
                  className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-[#6B7280] cursor-pointer"
                  aria-label="Close AI panel"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                {agentRunning && (
                  <span className="flex items-center gap-1 text-[9px] text-[#2563EB] font-bold bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB] animate-pulse inline-block" />
                    RUNNING
                  </span>
                )}
                <Maximize2
                  onClick={() => window.open(`/patient/${patientId}/chat?visitId=${activeVisit?.id || ""}`, "_blank")}
                  className="h-3.5 w-3.5 text-[#6B7280] hover:text-[#111827] cursor-pointer transition-colors"
                />
              </div>
            </div>

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-[#F8FAFC]/30 min-h-0">
              {agentMessages.map((msg) => (
                <AgentMessageBubble
                  key={msg.id}
                  msg={msg}
                  seenFirst={seenFirstAgentAnswer}
                  onCopy={copyMessage}
                  onResend={() => msg.text && sendAgentMessage(msg.text)}
                  onAddMed={addSuggestedMedicine}
                />
              ))}
              <div ref={ragEndRef} />
            </div>

            {/* ── Quick Actions ── */}
            <div className="px-3 py-2 border-t border-[#E5E7EB] bg-white flex-shrink-0">
              <span className="text-[8px] font-bold text-[#6B7280] uppercase tracking-widest block mb-1.5">Quick Agent Queries</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: "📋 Summarize History", q: "Summarize this patient's complete medical history, allergies, recent visits and current medications." },
                  { label: "🔬 Review Allergies",  q: "What allergies does this patient have? Are there any current medications that conflict?" },
                  { label: "💊 Suggest Medicines", q: "Suggest safe non-penicillin alternatives for acute tonsillitis given this patient's allergy profile." },
                  { label: "⚠️ Drug Safety Check", q: "Check if Amoxicillin is safe to prescribe for this patient given their declared allergies." },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    onClick={() => sendAgentMessage(btn.q)}
                    disabled={agentRunning}
                    className="py-1.5 px-2 bg-[#F8FAFC] hover:bg-blue-50 border border-[#E5E7EB] hover:border-blue-200 text-[#6B7280] hover:text-[#2563EB] rounded-lg text-[9px] font-semibold transition-all text-left cursor-pointer active:scale-95 disabled:opacity-40 leading-tight"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Input ── */}
            <form onSubmit={handleAgentSubmit} className="flex gap-2 p-3 border-t border-[#E5E7EB] bg-white flex-shrink-0 items-center">
              <div className="relative flex-1 flex items-center">
                <input
                  type="text"
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  placeholder={chatbotLoading ? "Transcribing voice..." : "Ask the clinical agent…"}
                  disabled={agentRunning || chatbotDictating || chatbotLoading}
                  className="w-full pl-3 pr-9 py-2 rounded-xl text-xs bg-[#F8FAFC] border border-[#E5E7EB] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={toggleChatbotDictation}
                  disabled={agentRunning || chatbotLoading}
                  className={`absolute right-2.5 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                    chatbotDictating
                      ? "text-[#DC2626] bg-red-50 animate-pulse hover:bg-red-100"
                      : "text-[#6B7280] hover:text-[#111827] hover:bg-slate-100"
                  }`}
                  title={chatbotLoading ? "Transcribing" : chatbotDictating ? "Stop Voice Input" : "Start Voice Input"}
                >
                  {chatbotLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
                  ) : chatbotDictating ? (
                    <MicOff className="h-3.5 w-3.5" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              {agentRunning ? (
                <button
                  type="button"
                  onClick={stopAgent}
                  title="Stop agent"
                  className="relative flex items-center gap-1.5 pl-2.5 pr-3 py-2 bg-[#DC2626] hover:bg-red-700 active:scale-95 rounded-xl text-white text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md overflow-hidden"
                >
                  {/* Pulsing ring behind button */}
                  <span className="absolute inset-0 rounded-xl bg-red-400 animate-ping opacity-20 pointer-events-none" />
                  <Square className="h-3.5 w-3.5 fill-white shrink-0" />
                  <span>Stop</span>
                </button>
              ) : (
                <button type="submit" disabled={!agentInput.trim() || chatbotDictating || chatbotLoading}
                  className="p-2 bg-[#2563EB] hover:bg-blue-700 rounded-xl text-white transition-all cursor-pointer active:scale-95 disabled:opacity-40 flex items-center justify-center shadow-sm">
                  <Send className="h-4 w-4" />
                </button>
              )}
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
