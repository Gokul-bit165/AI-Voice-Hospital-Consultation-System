"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Patient } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { Search, UserPlus, Phone, Calendar, Heart, ShieldAlert, FileText, Plus, ChevronRight, ClipboardList, X } from "lucide-react";

export default function ReceptionDashboard() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchType, setSearchType] = useState("name"); // name, phone, id
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  // Manual Register form state
  const [showManualModal, setShowManualModal] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    date_of_birth: "",
    gender: "Male",
    phone: "",
    address: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    blood_group: "Unknown",
    allergies: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Debouncing search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300); // 300ms debounce
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // TanStack Query for searching patients
  const { data: patients = [], isLoading } = useQuery({
    queryKey: ["patients", debouncedQuery, searchType],
    queryFn: () => api.searchPatients(debouncedQuery, searchType),
    enabled: true,
  });

  // Query selected patient's details
  const { data: selectedPatient } = useQuery({
    queryKey: ["patient", selectedPatientId],
    queryFn: () => api.getPatient(selectedPatientId!),
    enabled: !!selectedPatientId,
  });

  // Query selected patient's timeline
  const { data: timeline = [] } = useQuery({
    queryKey: ["patient-timeline", selectedPatientId],
    queryFn: () => api.getPatientTimeline(selectedPatientId!),
    enabled: !!selectedPatientId,
  });

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

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const allergiesList = formData.allergies
        ? formData.allergies.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      
      const newPatient = await api.createPatient({
        full_name: formData.full_name,
        date_of_birth: formData.date_of_birth,
        gender: formData.gender,
        phone: formData.phone,
        address: formData.address || null,
        emergency_contact_name: formData.emergency_contact_name || null,
        emergency_contact_phone: formData.emergency_contact_phone || null,
        blood_group: formData.blood_group === "Unknown" ? null : formData.blood_group,
        allergies: allergiesList,
      });

      // Clear form & close
      setFormData({
        full_name: "",
        date_of_birth: "",
        gender: "Male",
        phone: "",
        address: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        blood_group: "Unknown",
        allergies: "",
      });
      setShowManualModal(false);

      // Refresh list
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setSelectedPatientId(newPatient.id);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to register patient profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Search and list */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Patient Directory</h2>
              <p className="text-xs text-slate-500">Search or register patient records</p>
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowManualModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm cursor-pointer active:scale-95 transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Manual Register</span>
              </button>
              <button
                onClick={() => window.location.href = "/reception/register-voice"}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm hover:shadow-sky-600/10 cursor-pointer active:scale-95 transition-all"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Voice Register</span>
              </button>
            </div>
          </div>

          {/* Search bar & Type selection */}
          <div className="space-y-3 mb-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient name, phone, or ID..."
                className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Search By:</span>
              <div className="flex gap-1.5">
                {["name", "phone", "id"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setSearchType(type)}
                    className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer border uppercase tracking-wider ${
                      searchType === type
                        ? "bg-sky-50 border-sky-200 text-sky-700"
                        : "bg-transparent border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto max-h-[50vh] lg:max-h-[60vh] space-y-2 pr-1">
            {isLoading ? (
              <div className="text-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600 mx-auto"></div>
                <p className="text-xs text-slate-400 mt-2 font-medium">Searching patient index...</p>
              </div>
            ) : patients.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl">
                <p className="text-sm text-slate-500 font-medium">No patients found</p>
                <p className="text-xs text-slate-400 mt-1 mb-4">Would you like to register a new patient profile?</p>
                <div className="flex flex-col gap-2 max-w-[200px] mx-auto">
                  <button
                    onClick={() => setShowManualModal(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Register Manually</span>
                  </button>
                  <button
                    onClick={() => window.location.href = "/reception/register-voice"}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Start Voice Registration</span>
                  </button>
                </div>
              </div>
            ) : (
              patients.map((pat) => (
                <div
                  key={pat.id}
                  onClick={() => setSelectedPatientId(pat.id)}
                  className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                    selectedPatientId === pat.id
                      ? "border-sky-500 bg-sky-50/50 shadow-sm"
                      : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{pat.full_name}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-0.5"><Calendar className="h-3.5 w-3.5 text-slate-400" /> DOB: {pat.date_of_birth}</span>
                      <span className="flex items-center gap-0.5"><Phone className="h-3.5 w-3.5 text-slate-400" /> {pat.phone}</span>
                    </div>
                  </div>
                  <ChevronRight className={`h-4 w-4 transition-transform ${selectedPatientId === pat.id ? "text-sky-500 translate-x-0.5" : "text-slate-400"}`} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column: Patient profile and details */}
        <div className="lg:col-span-7 space-y-6">
          {selectedPatient ? (
            <>
              {/* Demographics Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-950">{selectedPatient.full_name}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">Patient ID: {selectedPatient.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-100 text-slate-800 text-xs px-2.5 py-1 rounded-md font-semibold">
                      {selectedPatient.gender}
                    </span>
                    <span className="bg-sky-50 text-sky-700 text-xs px-2.5 py-1 rounded-md font-semibold">
                      {getAge(selectedPatient.date_of_birth)} Yrs Old
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact Number</p>
                    <p className="text-slate-900 mt-0.5 font-medium">{selectedPatient.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Address Location</p>
                    <p className="text-slate-900 mt-0.5 font-medium">{selectedPatient.address || "No address on file"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Emergency Contact</p>
                    <p className="text-slate-900 mt-0.5 font-medium">
                      {selectedPatient.emergency_contact_name || "N/A"} 
                      {selectedPatient.emergency_contact_phone ? ` (${selectedPatient.emergency_contact_phone})` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Blood Group</p>
                      <p className="text-rose-600 mt-0.5 font-bold inline-flex items-center gap-0.5">
                        <Heart className="h-4 w-4 fill-rose-600" />
                        <span>{selectedPatient.blood_group || "Unknown"}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Allergies block */}
                <div className="bg-amber-50/50 border border-amber-200/50 rounded-xl p-3 flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Allergies & Contraindications</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {selectedPatient.allergies && selectedPatient.allergies.length > 0 ? (
                        selectedPatient.allergies.map((allergy, i) => (
                          <span key={i} className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                            {allergy}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-amber-700 font-medium">No known medical allergies on file</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick actions for receptionist */}
                <div className="flex gap-3 mt-5 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => window.location.href = `/patient/${selectedPatient.id}/upload`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer active:scale-98 transition-all"
                  >
                    <FileText className="h-4 w-4" />
                    <span>Upload Medical Records</span>
                  </button>
                </div>
              </div>

              {/* Timeline Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex-1 flex flex-col">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 inline-flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-slate-400" />
                  <span>Medical Visit Timeline</span>
                </h3>
                
                <div className="space-y-4 max-h-[30vh] overflow-y-auto pr-1">
                  {timeline.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">No historical clinical events recorded for this patient.</p>
                  ) : (
                    timeline.map((evt) => (
                      <div key={evt.id} className="relative pl-6 pb-2 border-l border-slate-200 last:border-0 last:pb-0">
                        {/* Event indicator icon dot */}
                        <span className={`absolute left-[-5px] top-1.5 h-2 w-2 rounded-full ${
                          evt.event_type === "registration" ? "bg-sky-500" :
                          evt.event_type === "upload" ? "bg-indigo-500" :
                          evt.event_type === "visit" ? "bg-emerald-500" :
                          evt.event_type === "prescription" ? "bg-rose-500" : "bg-slate-400"
                        }`} />
                        
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-slate-400 font-mono font-semibold">
                            {new Date(evt.event_date).toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-850 font-medium">
                            {evt.event_summary}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full min-h-[40vh] bg-white border border-slate-200 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center text-slate-500">
              <ClipboardList className="h-10 w-10 text-slate-350 mb-3" />
              <p className="text-sm font-bold">No Patient Profile Opened</p>
              <p className="text-xs text-slate-400 mt-1">Please select a patient from the left column search results to view details.</p>
            </div>
          )}
        </div>

      </div>

      {/* Manual Registration Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Manual Patient Registration</h3>
              </div>
              <button 
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={handleManualSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {submitError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-600 px-3.5 py-2.5 rounded-lg font-medium">
                  {submitError}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Full Patient Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    required
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white text-slate-700"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Gender *</label>
                  <select
                    required
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white text-slate-700"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Contact Phone *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. 5550190100"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Blood Group</label>
                  <select
                    value={formData.blood_group}
                    onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white text-slate-700"
                  >
                    <option value="Unknown">Unknown</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="e.g. 123 Main St, Springfield"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Emergency Contact Name</label>
                  <input
                    type="text"
                    value={formData.emergency_contact_name}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                    placeholder="e.g. Mary Doe"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Emergency Contact Phone</label>
                  <input
                    type="text"
                    value={formData.emergency_contact_phone}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                    placeholder="e.g. 5550190101"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Allergies (comma separated)</label>
                  <input
                    type="text"
                    value={formData.allergies}
                    onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                    placeholder="e.g. Penicillin, Peanuts"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg font-bold cursor-pointer transition-all active:scale-95"
                >
                  {isSubmitting ? "Registering..." : "Save Patient profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
