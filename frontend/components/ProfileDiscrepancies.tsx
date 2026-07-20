"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AlertTriangle, Check, X, Loader2, RefreshCw } from "lucide-react";

interface ProfileDiscrepanciesProps {
  patientId: string;
}

export default function ProfileDiscrepancies({ patientId }: ProfileDiscrepanciesProps) {
  const queryClient = useQueryClient();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Fetch discrepancies
  const { data: discrepancies = [], refetch, isLoading } = useQuery({
    queryKey: ["patient-discrepancies", patientId],
    queryFn: () => api.getPatientDiscrepancies(patientId),
  });

  const pendingDiscrepancies = discrepancies.filter((d) => d.status === "pending_review");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 bg-slate-50 border border-slate-100 rounded-2xl">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  if (pendingDiscrepancies.length === 0) {
    return null;
  }

  const formatFieldName = (name: string) => {
    return name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const handleResolve = async (discrepancyId: string, action: "approve" | "reject") => {
    setResolvingId(discrepancyId);
    try {
      await api.resolveDiscrepancy(patientId, discrepancyId, action);
      // Invalidate related queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ["patient", patientId] });
      await queryClient.invalidateQueries({ queryKey: ["patient-timeline", patientId] });
      await queryClient.invalidateQueries({ queryKey: ["patient-discrepancies", patientId] });
    } catch (err: any) {
      alert(err.message || "Failed to resolve discrepancy.");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-500 fill-amber-100" />
          <h4 className="text-xs font-bold uppercase tracking-wider">Demographic Reconciliation Required</h4>
        </div>
        <span className="bg-amber-100 text-amber-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
          {pendingDiscrepancies.length} Pending
        </span>
      </div>

      <p className="text-xs text-amber-800/80 leading-relaxed">
        We detected discrepancies between the current patient profile database and the text extracted from the uploaded medical record. Please verify and reconcile the differences below:
      </p>

      <div className="overflow-hidden border border-amber-200/60 rounded-xl bg-white/80 backdrop-blur-sm divide-y divide-amber-100">
        {pendingDiscrepancies.map((d) => (
          <div key={d.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
            <div className="space-y-1.5 flex-1">
              <span className="inline-block bg-slate-100 text-slate-800 text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                {formatFieldName(d.field_name)}
              </span>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Current Value</span>
                  <p className="font-semibold text-slate-700 mt-0.5 break-words">{d.current_value || "None"}</p>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-[#2563EB] uppercase tracking-wider">Extracted Value</span>
                  <p className="font-bold text-[#2563EB] mt-0.5 break-words">{d.extracted_value}</p>
                </div>
              </div>
              {d.confidence !== null && (
                <p className="text-[10px] text-slate-400 font-medium">
                  Extraction Confidence: {(d.confidence * 100).toFixed(0)}%
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button
                disabled={resolvingId !== null}
                onClick={() => handleResolve(d.id, "approve")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#16A34A] hover:bg-green-700 text-white rounded-lg text-[10px] font-bold shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
              >
                {resolvingId === d.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>Approve Sync</span>
              </button>
              <button
                disabled={resolvingId !== null}
                onClick={() => handleResolve(d.id, "reject")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold cursor-pointer disabled:opacity-50 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                <span>Reject</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
