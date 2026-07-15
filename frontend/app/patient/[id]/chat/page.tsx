"use client";

import React, { useState, useEffect, useRef, use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { AgentMessageBubble } from "@/components/AgentMessageBubble";
import {
  Brain, Send, Square, Loader2, ArrowLeft,
  ChevronLeft, Sparkles, Activity, ShieldCheck, Heart,
  Mic, MicOff
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
  text?: string;
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

export default function StandaloneChatPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: patientId } = use(paramsPromise);
  const searchParams = useSearchParams();
  const visitId = searchParams.get("visitId") || undefined;

  const [agentInput, setAgentInput] = useState("");
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([
    {
      id: "welcome",
      sender: "agent",
      finalText: "Hello Dr. 👋 Welcome to the **Dedicated Clinical Agent Workspace**.\n\nI have access to this patient's medical records, scanned files, allergies, and prescriptions history. Ask me any clinical questions or run safety checks here.",
      steps: [],
      isGrounded: false,
    },
  ]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [seenFirstAgentAnswer, setSeenFirstAgentAnswer] = useState(false);
  const [chatbotDictating, setChatbotDictating] = useState(false);
  const [chatbotLoading, setChatbotLoading] = useState(false);
  const chatbotRecorderRef = useRef<MediaRecorder | null>(null);
  const chatbotChunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch patient profile for context header
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.getPatient(patientId),
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages]);

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

  const sendAgentMessage = async (question: string) => {
    if (!question.trim() || agentRunning) return;

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
        patientId, question, visitId,
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

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F8FAFC]">
      {/* ── TOP HEADER ── */}
      <header className="min-h-14 bg-white border-b border-[#E5E7EB] px-4 sm:px-6 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 py-2 sm:py-0 sm:h-16 shadow-sm flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.close()}
            className="p-2 hover:bg-slate-50 border border-[#E5E7EB] rounded-xl text-slate-600 hover:text-slate-900 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-sm min-h-[44px]"
          >
            <ChevronLeft className="h-4 w-4" />
            Close Tab
          </button>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#2563EB] shadow-md">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#111827] leading-tight">Standalone Clinical Agent</h1>
              <p className="text-[10px] text-[#6B7280] font-medium hidden sm:block">Isolated Patient Context Mode</p>
            </div>
          </div>
        </div>

        {/* Patient Profile Context Ribbon */}
        {patient && (
          <div className="flex items-center gap-2 sm:gap-4 bg-blue-50/50 border border-blue-100 rounded-xl px-3 sm:px-4 py-1.5 text-xs overflow-x-auto max-w-full scrollbar-none">
            <div>
              <span className="text-[9px] text-[#6B7280] font-bold uppercase tracking-wider block">Patient Context</span>
              <span className="font-bold text-slate-800">{patient.full_name}</span>
            </div>
            <div className="hidden sm:block h-6 w-px bg-blue-100" />
            <div className="hidden sm:block">
              <span className="text-[9px] text-[#6B7280] font-bold uppercase tracking-wider block">Age / Gender</span>
              <span className="font-semibold text-slate-700">{patient.gender}</span>
            </div>
            {patient.allergies && patient.allergies.length > 0 && (
              <>
                <div className="h-6 w-px bg-blue-100" />
                <div className="flex items-center gap-1 text-[#DC2626] font-bold uppercase text-[9px] bg-red-50 border border-red-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Allergy: {patient.allergies[0]}
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {/* ── CONVERSATION SPACE ── */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6 max-w-4xl w-full mx-auto min-h-0 bg-white shadow-sm border-x border-[#E5E7EB]">
        {agentMessages.map((msg) => (
          <div key={msg.id} className="max-w-3xl mx-auto">
            <AgentMessageBubble
              msg={msg}
              seenFirst={seenFirstAgentAnswer}
              onCopy={copyMessage}
              onResend={() => msg.text && sendAgentMessage(msg.text)}
              onAddMed={(name, strength) => alert(`Medicine suggested: ${name} ${strength || ""}. You can add it back on the consultation tab.`)}
            />
          </div>
        ))}
        <div ref={chatEndRef} />
      </main>

      {/* ── BOTTOM ACTIONS & INPUT AREA ── */}
      <footer className="bg-white border-t border-[#E5E7EB] py-3 sm:py-4 px-4 sm:px-6 flex-shrink-0 shadow-inner z-10 pb-safe">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Quick clinical queries */}
          <div className="flex gap-2 items-center overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Quick Actions:</span>
            {[
              { label: "📋 Summarize Medical History", q: "Summarize this patient's complete medical history, allergies, recent visits and current medications." },
              { label: "🔬 Review Active Allergies",  q: "What allergies does this patient have? Are there any current medications that conflict?" },
              { label: "💊 Safe Medications Suggestions", q: "Suggest safe non-penicillin alternatives for acute tonsillitis given this patient's allergy profile." },
              { label: "⚠️ Standard Drug Check", q: "Check if Amoxicillin is safe to prescribe for this patient given their declared allergies." },
            ].map((btn) => (
              <button
                key={btn.label}
                onClick={() => sendAgentMessage(btn.q)}
                disabled={agentRunning}
                className="py-1 px-2.5 bg-slate-50 hover:bg-blue-50 border border-[#E5E7EB] hover:border-blue-200 text-[#6B7280] hover:text-[#2563EB] rounded-lg text-[10px] font-semibold transition-all cursor-pointer active:scale-95 disabled:opacity-40"
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Form input bar */}
          <form onSubmit={handleAgentSubmit} className="flex gap-3 items-center">
            <div className="relative flex-1 flex items-center">
              <input
                type="text"
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                placeholder={chatbotLoading ? "Transcribing voice..." : "Ask the clinical agent details, analyze logs, or check safety..."}
                disabled={agentRunning || chatbotDictating || chatbotLoading}
                className="w-full pl-4 pr-14 py-3 min-h-[44px] rounded-xl text-xs bg-[#F8FAFC] border border-[#E5E7EB] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors disabled:opacity-60 shadow-sm"
              />
              <button
                type="button"
                onClick={toggleChatbotDictation}
                disabled={agentRunning || chatbotLoading}
                className={`absolute right-3 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                  chatbotDictating
                    ? "text-[#DC2626] bg-red-50 animate-pulse hover:bg-red-100"
                    : "text-[#6B7280] hover:text-[#111827] hover:bg-slate-100"
                }`}
                title={chatbotLoading ? "Transcribing" : chatbotDictating ? "Stop Voice Input" : "Start Voice Input"}
              >
                {chatbotLoading ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin text-[#2563EB]" />
                ) : chatbotDictating ? (
                  <MicOff className="h-4.5 w-4.5" />
                ) : (
                  <Mic className="h-4.5 w-4.5" />
                )}
              </button>
            </div>
            {agentRunning ? (
              <button
                type="button"
                onClick={stopAgent}
                title="Stop agent"
                className="relative flex items-center gap-2 pl-3 pr-4 py-3 bg-[#DC2626] hover:bg-red-700 active:scale-95 rounded-xl text-white text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md overflow-hidden"
              >
                {/* Pulsing ring behind button */}
                <span className="absolute inset-0 rounded-xl bg-red-400 animate-ping opacity-20 pointer-events-none" />
                <Square className="h-4 w-4 fill-white shrink-0" />
                <span>Stop Agent</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!agentInput.trim() || chatbotDictating || chatbotLoading}
                className="p-3 bg-[#2563EB] hover:bg-blue-700 rounded-xl text-white transition-all cursor-pointer active:scale-95 disabled:opacity-40 flex items-center justify-center shadow-md"
              >
                <Send className="h-5 w-5" />
              </button>
            )}
          </form>
        </div>
      </footer>
    </div>
  );
}
