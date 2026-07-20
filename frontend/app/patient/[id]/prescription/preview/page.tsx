"use client";

import React, { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { ArrowLeft, Printer, Download, Eye, ChevronRight } from "lucide-react";

export default function PrescriptionPreviewPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const patientId = params.id;
  
  const searchParams = useSearchParams();
  const prescriptionId = searchParams.get("prescriptionId");
  
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [nextPatientId, setNextPatientId] = useState<string | null>(null);

  useEffect(() => {
    api.searchPatients("")
      .then((patients) => {
        const currentIndex = patients.findIndex((p) => p.id === patientId);
        if (currentIndex !== -1 && currentIndex + 1 < patients.length) {
          setNextPatientId(patients[currentIndex + 1].id);
        }
      })
      .catch((err) => {
        console.error("Failed to load patient queue: ", err);
      });
  }, [patientId]);

  useEffect(() => {
    if (prescriptionId) {
      // Create a blob URL for the PDF stream
      api.getPrescriptionPDFBlob(prescriptionId)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
        })
        .catch((err) => {
          console.error("Failed to load PDF blob: ", err);
        });
    }
  }, [prescriptionId]);

  const handlePrint = async () => {
    if (!prescriptionId) return;
    try {
      const res = await api.printPrescription(prescriptionId);
      setPrintSuccess(true);
      alert(res.detail || "Prescription print job queued.");
      setTimeout(() => setPrintSuccess(false), 2000);
    } catch (err: any) {
      alert("Failed to queue print job: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-4 flex flex-col">
        
        {/* Navigation row */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => window.location.href = `/patient/${patientId}`}
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Patient Profile</span>
          </button>
          
          <div className="flex gap-2 items-center">
            {pdfUrl && (
              <>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  <span>Simulate Print</span>
                </button>
                <a
                  href={pdfUrl}
                  download={`prescription_${prescriptionId}.pdf`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Download PDF</span>
                </a>
              </>
            )}

            {nextPatientId ? (
              <button
                onClick={() => window.location.href = `/patient/${nextPatientId}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all shadow-sm"
              >
                <span>Next Patient</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={() => window.location.href = "/doctor"}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-500 hover:bg-slate-600 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all shadow-sm"
              >
                <span>Doctor Queue</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* PDF viewer frame */}
        <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[70vh]">
          {pdfUrl ? (
            <iframe
              src={`${pdfUrl}#toolbar=0&navpanes=0`}
              className="w-full flex-1 border-0"
              title="Prescription PDF Preview"
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mb-4"></div>
              <p className="text-xs font-medium">Generating ReportLab printable A4 document...</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
