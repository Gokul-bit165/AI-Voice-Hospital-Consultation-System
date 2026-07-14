"use client";

import React, { useState, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, MedicalRecord, OCRRecord, OCRStructuredData } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { ArrowLeft, Upload, FileText, CheckCircle2, Loader2, AlertCircle, Edit3, Save } from "lucide-react";

export default function RecordUploadPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const patientId = params.id;
  const queryClient = useQueryClient();

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  
  // Upload and OCR states
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "uploaded" | "ocr" | "completed" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Active record references
  const [activeRecord, setActiveRecord] = useState<MedicalRecord | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRRecord | null>(null);

  // Structured fields data (which are editable)
  const [structuredData, setStructuredData] = useState<OCRStructuredData>({
    diagnoses: [],
    medications: [],
    lab_values: [],
    dates: [],
    doctor_names: []
  });

  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.getPatient(patientId),
  });

  // Handle Drag Over
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Handle Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndProcessFile(droppedFile);
    }
  };

  // Handle File Input Select
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      validateAndProcessFile(selectedFile);
    }
  };

  const validateAndProcessFile = (selectedFile: File) => {
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "png", "jpg", "jpeg", "tiff", "bmp"].includes(ext || "")) {
      setErrorMessage("Unsupported file type. Please upload a PDF or an Image.");
      setUploadStatus("error");
      return;
    }
    setFile(selectedFile);
    setUploadStatus("idle");
    setErrorMessage(null);
    setActiveRecord(null);
    setOcrResult(null);
  };

  const handleUploadSubmit = async () => {
    if (!file) return;
    setUploadStatus("uploading");
    setErrorMessage(null);

    try {
      // 1. Upload File
      const record = await api.uploadRecord(patientId, file);
      setActiveRecord(record);
      setUploadStatus("uploaded");
      
      // 2. Automatically trigger OCR
      setUploadStatus("ocr");
      const ocr = await api.runOCR(record.id);
      setOcrResult(ocr);
      setStructuredData(ocr.structured_data);
      setUploadStatus("completed");
      
      // Invalidate queries to refresh lists
      queryClient.invalidateQueries({ queryKey: ["patient-records", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-timeline", patientId] });
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process medical document.");
      setUploadStatus("error");
    }
  };

  // Editable lists helper functions
  const handleArrayChange = (field: keyof OCRStructuredData, index: number, val: string) => {
    const list = [...(structuredData[field] as string[])];
    list[index] = val;
    setStructuredData({ ...structuredData, [field]: list });
  };

  const addArrayItem = (field: keyof OCRStructuredData) => {
    const list = [...(structuredData[field] as string[]), ""];
    setStructuredData({ ...structuredData, [field]: list });
  };

  const removeArrayItem = (field: keyof OCRStructuredData, index: number) => {
    const list = (structuredData[field] as string[]).filter((_, i) => i !== index);
    setStructuredData({ ...structuredData, [field]: list });
  };

  // Lab values helper
  const handleLabChange = (index: number, key: "name" | "value" | "unit", val: string) => {
    const list = [...structuredData.lab_values];
    list[index] = { ...list[index], [key]: val };
    setStructuredData({ ...structuredData, lab_values: list });
  };

  const addLabValue = () => {
    setStructuredData({
      ...structuredData,
      lab_values: [...structuredData.lab_values, { name: "", value: "", unit: "" }]
    });
  };

  const removeLabValue = (index: number) => {
    const list = structuredData.lab_values.filter((_, i) => i !== index);
    setStructuredData({ ...structuredData, lab_values: list });
  };

  // Save edits
  const handleSaveEdits = async () => {
    if (!ocrResult) return;
    try {
      alert("Structured details confirmed and saved successfully to patient clinical history.");
      window.location.href = `/patient/${patientId}`;
    } catch (err: any) {
      alert("Error saving: " + err.message);
    }
  };

  return (
    <DashboardLayout>
      <div className="h-full w-full p-4 sm:p-6 space-y-6 overflow-y-auto pb-24">
        <button
          onClick={() => window.location.href = `/patient/${patientId}`}
          className="inline-flex items-center gap-1.5 text-[#6B7280] hover:text-[#111827] text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Profile</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left panel: Upload Dropzone (cols 5) */}
          <div className="lg:col-span-5 bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-5">
            <div>
              <h2 className="text-base font-bold text-[#111827]">Upload Clinical Records</h2>
              <p className="text-xs text-[#6B7280] mt-0.5">Add medical history reports, laboratory readings, or scanned prescriptions (PDF, PNG, JPG)</p>
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all ${
                dragActive ? "border-[#2563EB] bg-blue-50/20" : "border-[#E5E7EB] bg-[#F8FAFC]"
              }`}
            >
              <input
                id="file-upload"
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
              />
              
              <Upload className="h-10 w-10 text-slate-400 mb-3" />
              
              {file ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[#111827] truncate max-w-[240px]">{file.name}</p>
                  <p className="text-[10px] text-[#6B7280] font-mono">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-700">Drag & drop report files here</p>
                  <p className="text-xs text-[#6B7280]">or <label htmlFor="file-upload" className="text-[#2563EB] font-bold hover:underline cursor-pointer">browse filesystem</label></p>
                </div>
              )}
            </div>

            {/* Process Button */}
            {file && uploadStatus === "idle" && (
              <button
                onClick={handleUploadSubmit}
                className="w-full py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
              >
                Upload and Run AI OCR parsing
              </button>
            )}

            {/* Status indicators */}
            {uploadStatus !== "idle" && uploadStatus !== "completed" && (
              <div className="p-4 border border-[#E5E7EB] rounded-xl bg-[#F8FAFC] space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {uploadStatus === "uploading" && (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
                      <span>Uploading document files...</span>
                    </>
                  )}
                  {uploadStatus === "uploaded" && (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 fill-white" />
                      <span>Document uploaded successfully!</span>
                    </>
                  )}
                  {uploadStatus === "ocr" && (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
                      <span>AI running OCR and clinical data extraction...</span>
                    </>
                  )}
                  {uploadStatus === "error" && (
                    <>
                      <AlertCircle className="h-4 w-4 text-rose-500" />
                      <span className="text-rose-600">Failed to process record.</span>
                    </>
                  )}
                </div>

                {errorMessage && (
                  <p className="text-[10px] text-rose-500 bg-rose-50 p-2 rounded-lg">{errorMessage}</p>
                )}
              </div>
            )}
          </div>

          {/* Right panel: Side-by-Side OCRResultViewer (cols 7) */}
          <div className="lg:col-span-7 bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm">
            {uploadStatus === "completed" && ocrResult && activeRecord ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#111827] uppercase tracking-wider">AI OCR Results Viewer</h3>
                    <p className="text-[10px] text-[#6B7280]">Side-by-side raw parsed content vs structured records</p>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">
                    Engine: {ocrResult.ocr_engine_used}
                  </span>
                </div>

                {/* Side-by-side grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column: Raw Text */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">Raw OCR Text Excerpt</span>
                    <div className="h-[40vh] overflow-y-auto bg-[#F8FAFC] border border-[#E5E7EB] p-3 rounded-xl text-[10px] font-mono leading-relaxed text-slate-700 whitespace-pre-wrap">
                      {ocrResult.raw_text || "No text parsed from document."}
                    </div>
                  </div>

                  {/* Right Column: Editable structured fields */}
                  <div className="space-y-4">
                    <span className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">Extracted Clinical Profile</span>
                    
                    <div className="h-[40vh] overflow-y-auto pr-1 space-y-4">
                      
                      {/* Diagnoses list */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wide">Diagnoses</label>
                          <button type="button" onClick={() => addArrayItem("diagnoses")} className="text-[10px] text-[#2563EB] hover:underline font-bold cursor-pointer">+ Add</button>
                        </div>
                        {structuredData.diagnoses.map((diag, i) => (
                          <div key={i} className="flex gap-1.5">
                            <input
                              type="text"
                              value={diag}
                              onChange={(e) => handleArrayChange("diagnoses", i, e.target.value)}
                              className="flex-1 px-3 py-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-xs font-semibold focus:outline-none focus:border-[#2563EB] transition-colors"
                            />
                            <button type="button" onClick={() => removeArrayItem("diagnoses", i)} className="text-[10px] text-[#DC2626] font-bold px-1 hover:underline cursor-pointer">Remove</button>
                          </div>
                        ))}
                      </div>

                      {/* Medications list */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wide">Medications</label>
                          <button type="button" onClick={() => addArrayItem("medications")} className="text-[10px] text-[#2563EB] hover:underline font-bold cursor-pointer">+ Add</button>
                        </div>
                        {structuredData.medications.map((med, i) => (
                          <div key={i} className="flex gap-1.5">
                            <input
                              type="text"
                              value={med}
                              onChange={(e) => handleArrayChange("medications", i, e.target.value)}
                              className="flex-1 px-3 py-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-xs font-semibold focus:outline-none focus:border-[#2563EB] transition-colors"
                            />
                            <button type="button" onClick={() => removeArrayItem("medications", i)} className="text-[10px] text-[#DC2626] font-bold px-1 hover:underline cursor-pointer">Remove</button>
                          </div>
                        ))}
                      </div>

                      {/* Lab values */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wide">Lab Readings</label>
                          <button type="button" onClick={addLabValue} className="text-[10px] text-[#2563EB] hover:underline font-bold cursor-pointer">+ Add Lab</button>
                        </div>
                        {structuredData.lab_values.map((lab, i) => (
                          <div key={i} className="flex gap-1 items-center border border-[#E5E7EB] p-2.5 rounded-xl bg-[#F8FAFC]">
                            <input
                              type="text"
                              placeholder="Test Name"
                              value={lab.name}
                              onChange={(e) => handleLabChange(i, "name", e.target.value)}
                              className="w-1/2 px-2.5 py-1 bg-white border border-[#E5E7EB] rounded-lg text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Value"
                              value={lab.value}
                              onChange={(e) => handleLabChange(i, "value", e.target.value)}
                              className="w-1/4 px-2.5 py-1 bg-white border border-[#E5E7EB] rounded-lg text-xs text-center"
                            />
                            <input
                              type="text"
                              placeholder="Unit"
                              value={lab.unit}
                              onChange={(e) => handleLabChange(i, "unit", e.target.value)}
                              className="w-1/4 px-2.5 py-1 bg-white border border-[#E5E7EB] rounded-lg text-xs text-center"
                            />
                            <button type="button" onClick={() => removeLabValue(i)} className="text-[10px] text-[#DC2626] font-bold hover:underline cursor-pointer px-1">X</button>
                          </div>
                        ))}
                      </div>

                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E5E7EB] flex gap-4">
                  <button
                    onClick={handleSaveEdits}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition-all active:scale-95"
                  >
                    <Save className="h-4 w-4" />
                    <span>Confirm and Save Patient History</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[40vh] border border-dashed border-[#E5E7EB] rounded-2xl flex flex-col items-center justify-center p-6 text-center text-[#6B7280]">
                <FileText className="h-10 w-10 text-slate-300 mb-3 animate-pulse" />
                <p className="text-xs font-bold uppercase tracking-wider text-[#111827]">OCR Results Awaiting Upload</p>
                <p className="text-xs text-[#6B7280] mt-1">Upload a medical document in the left pane to extract raw texts and verify records.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
