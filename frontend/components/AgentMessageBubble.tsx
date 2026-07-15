"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Brain, Wrench, CheckCircle, AlertTriangle, Copy,
  ChevronDown, ChevronRight, Loader2, ShieldAlert, Plus, Info
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
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

// ── Tool icon & color map ────────────────────────────────────────────────────
const TOOL_META: Record<string, { emoji: string; color: string; bg: string; border: string }> = {
  search_patient_history:   { emoji: "🔍", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  get_patient_profile:      { emoji: "👤", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  get_recent_prescriptions: { emoji: "💊", color: "#0891B2", bg: "#ECFEFF", border: "#A5F3FC" },
  check_drug_allergy:       { emoji: "⚠️", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  get_visit_timeline:       { emoji: "📅", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  general_medical_knowledge:{ emoji: "🧠", color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
};

const DEFAULT_TOOL = { emoji: "🔧", color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB" };

function getToolMeta(name?: string) {
  if (!name) return DEFAULT_TOOL;
  return TOOL_META[name] ?? DEFAULT_TOOL;
}

// ── ToolCallCard ──────────────────────────────────────────────────────────────
function ToolCallCard({ step, autoExpand }: { step: AgentStepUI; autoExpand?: boolean }) {
  const [expanded, setExpanded] = useState(autoExpand ?? false);
  const meta = getToolMeta(step.tool_name);
  const isDone = step.result !== undefined;
  const isSafety = step.is_safety_relevant;
  const hasConflict = step.result?.includes("CONFLICT") || step.result?.includes("🚨");
  const hasWarning = step.result?.includes("ALERT") || step.result?.includes("⚠️");

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all"
      style={{ borderColor: isSafety || hasConflict ? "#FECACA" : meta.border, background: isSafety || hasConflict ? "#FEF2F2" : meta.bg }}
    >
      {/* Card header row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left cursor-pointer hover:opacity-80 transition-opacity"
      >
        <span className="text-sm leading-none">{meta.emoji}</span>
        <span className="flex-1 min-w-0">
          <span className="text-[10px] font-bold block leading-tight truncate max-w-[160px] sm:max-w-none" style={{ color: meta.color }}>
            {step.label || step.tool_name?.replace(/_/g, " ")}
          </span>
          {step.duration_ms !== undefined && isDone && (
            <span className="text-[9px] text-[#6B7280]">✓ {step.duration_ms}ms</span>
          )}
        </span>
        {isDone ? (
          hasConflict || hasWarning ? (
            <AlertTriangle className="h-3 w-3 text-[#DC2626] flex-shrink-0" />
          ) : (
            <CheckCircle className="h-3 w-3 text-[#16A34A] flex-shrink-0" />
          )
        ) : (
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" style={{ color: meta.color }} />
        )}
        {isDone && (
          expanded
            ? <ChevronDown className="h-3 w-3 text-[#6B7280] flex-shrink-0" />
            : <ChevronRight className="h-3 w-3 text-[#6B7280] flex-shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && isDone && (
        <div className="px-2.5 pb-2.5 border-t" style={{ borderColor: meta.border }}>
          {step.tool_args && Object.keys(step.tool_args).length > 0 && (
            <div className="mb-1.5 mt-1.5">
              <span className="text-[8px] font-bold uppercase tracking-widest text-[#6B7280] block mb-0.5">Args</span>
              <pre className="text-[9px] bg-white/80 rounded p-1.5 overflow-x-auto max-w-full text-[#374151] font-mono leading-relaxed border border-white/60 break-all">
                {JSON.stringify(step.tool_args, null, 2)}
              </pre>
            </div>
          )}
          {step.result && (
            <div>
              <span className="text-[8px] font-bold uppercase tracking-widest text-[#6B7280] block mb-0.5">Result</span>
              <p className="text-[9px] text-[#374151] leading-relaxed whitespace-pre-wrap bg-white/80 rounded p-1.5 border border-white/60">
                {step.result.slice(0, 500)}{step.result.length > 500 ? "…" : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── AgentMessageBubble ────────────────────────────────────────────────────────
export function AgentMessageBubble({
  msg,
  seenFirst,
  onCopy,
  onResend,
  onAddMed,
}: {
  msg: AgentMessage;
  seenFirst: boolean;
  onCopy: (text: string) => void;
  onResend: () => void;
  onAddMed: (name: string, strength?: string) => void;
}) {
  const [hovering, setHovering] = useState(false);

  // ── User message ────────────────────────────────────────────────────────────
  if (msg.sender === "user") {
    return (
      <div className="flex flex-col items-end">
        <span className="text-[9px] text-[#9CA3AF] font-semibold mb-1 uppercase tracking-wider">You</span>
        <div
          className="px-3 py-2 rounded-2xl max-w-[90%] text-xs leading-relaxed text-white shadow-sm"
          style={{ background: "#2563EB", borderBottomRightRadius: 4 }}
        >
          {msg.text}
        </div>
      </div>
    );
  }

  // ── Agent message ────────────────────────────────────────────────────────────
  const displayText = msg.isStreaming ? msg.streamingText : msg.finalText;
  const hasSteps = msg.steps && msg.steps.length > 0;
  // Auto-expand trace accordion only on the first-ever agent answer (teaches user it exists)
  const [traceOpen, setTraceOpen] = useState(!seenFirst && hasSteps);

  return (
    <div
      className="flex flex-col items-start"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Agent label */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className="h-4 w-4 rounded-md bg-[#2563EB] flex items-center justify-center flex-shrink-0">
          <Brain className="h-2.5 w-2.5 text-white" />
        </div>
        <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">Agent</span>
        {msg.isGrounded && (
          <span className="text-[8px] bg-blue-50 border border-blue-100 text-[#2563EB] px-1.5 py-0.5 rounded-full font-bold">
            📄 Patient Data
          </span>
        )}
        {!msg.isGrounded && !msg.isThinking && !msg.isStreaming && (msg.finalText?.includes("general") || (msg.tool_calls_made ?? []).includes("general_medical_knowledge")) && (
          <span className="text-[8px] bg-emerald-50 border border-emerald-100 text-[#16A34A] px-1.5 py-0.5 rounded-full font-bold">
            🧠 General Knowledge
          </span>
        )}
      </div>

      {/* Thinking state */}
      {msg.isThinking && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-[#E5E7EB] text-xs text-[#6B7280] shadow-sm">
          <Loader2 className="h-3 w-3 animate-spin text-[#2563EB]" />
          <span className="font-medium">{msg.thinkingMsg || "Reasoning…"}</span>
          <span className="flex gap-0.5">
            {[0,1,2].map(i => <span key={i} className="h-1 w-1 rounded-full bg-[#2563EB] animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
          </span>
        </div>
      )}

      {/* Tool call cards — appear inline as agent runs */}
      {hasSteps && (
        <div className="w-full space-y-1.5 mb-2 mt-1">
          <button
            type="button"
            onClick={() => setTraceOpen(!traceOpen)}
            className="flex items-center gap-1.5 text-[9px] font-bold text-[#6B7280] uppercase tracking-wider hover:text-[#111827] transition-colors cursor-pointer"
          >
            {traceOpen
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />}
            🤖 Agent Trace ({msg.steps!.length} step{msg.steps!.length !== 1 ? "s" : ""})
          </button>
          {traceOpen && (
            <div className="space-y-1.5 pl-1">
              {msg.steps!.map((step, i) => (
                <ToolCallCard key={i} step={step} autoExpand={false} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Safety warning banner */}
      {msg.hasSafetyDisclaimer && (
        <div className="w-full mb-2 flex items-start gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200">
          <ShieldAlert className="h-3.5 w-3.5 text-[#DC2626] flex-shrink-0 mt-0.5" />
          <p className="text-[9px] text-[#DC2626] font-semibold leading-relaxed">
            Drug safety information. Always verify against current patient records and confirm with clinician judgment before prescribing.
          </p>
        </div>
      )}

      {/* Final answer bubble */}
      {displayText && (
        <div className={`w-full max-w-[97%] rounded-2xl px-3.5 py-2.5 shadow-sm text-xs leading-relaxed border ${
          msg.isError
            ? "bg-red-50 border-red-200 text-red-900"
            : msg.isGrounded
            ? "bg-white border-[#E5E7EB] text-[#111827]"
            : "bg-[#F0FDF4] border-[#BBF7D0] text-[#111827]"
        }`} style={{ borderBottomLeftRadius: 4 }}>
          {/* Ungrounded label */}
          {!msg.isGrounded && !msg.isError && (displayText?.includes("general knowledge") || (msg.tool_calls_made ?? []).includes("general_medical_knowledge")) && (
            <div className="flex items-center gap-1 mb-2 pb-1.5 border-b border-emerald-100">
              <Info className="h-3 w-3 text-[#16A34A]" />
              <span className="text-[8px] font-bold text-[#16A34A] uppercase tracking-wider">General knowledge · Not patient-specific</span>
            </div>
          )}

          {/* Markdown rendered text */}
          <div className="prose prose-xs max-w-none text-[#111827] agent-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {displayText}
            </ReactMarkdown>
          </div>

          {/* Streaming caret */}
          {msg.isStreaming && (
            <span className="inline-block h-3 w-0.5 ml-0.5 bg-[#2563EB] animate-pulse align-middle" />
          )}

          {/* Medicine quick-add buttons */}
          {!msg.isStreaming && !msg.isError && displayText && (
            <div className="mt-2 flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
              {["Azithromycin|500mg", "Clindamycin|300mg", "Cetirizine|10mg", "Ibuprofen|400mg"].map((pair) => {
                const [name, strength] = pair.split("|");
                if (!displayText.includes(name)) return null;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onAddMed(name, strength)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-[#E5E7EB] hover:bg-blue-50 hover:border-blue-200 text-[9px] font-bold text-[#2563EB] rounded-lg active:scale-95 transition-all cursor-pointer"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    Add {name} {strength}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Message hover actions */}
      {!msg.isStreaming && !msg.isThinking && displayText && (
        <div className={`flex items-center gap-2 mt-1 transition-opacity ${hovering ? "opacity-100" : "opacity-0"}`}>
          <button
            type="button"
            onClick={() => onCopy(displayText)}
            className="flex items-center gap-1 text-[9px] text-[#6B7280] hover:text-[#111827] transition-colors cursor-pointer"
          >
            <Copy className="h-2.5 w-2.5" /> Copy
          </button>
        </div>
      )}
    </div>
  );
}
