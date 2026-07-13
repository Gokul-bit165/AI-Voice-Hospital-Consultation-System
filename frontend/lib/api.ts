export const API_BASE_URL = "http://localhost:8000/api/v1";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role: string;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  specialization: string;
  role: string;
}

export interface Patient {
  id: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  blood_group: string | null;
  allergies: string[];
  created_at: string;
  updated_at: string;
}

export interface PatientCreate {
  full_name: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  blood_group: string | null;
  allergies: string[];
}

export interface MedicalRecord {
  id: string;
  patient_id: string;
  file_path: string;
  file_type: string;
  original_filename: string;
  uploaded_by: string;
  uploaded_at: string;
  ocr_record?: OCRRecord | null;
}

export interface OCRStructuredData {
  diagnoses: string[];
  medications: string[];
  lab_values: Array<{ name: string; value: string; unit: string }>;
  dates: string[];
  doctor_names: string[];
}

export interface OCRRecord {
  id: string;
  medical_record_id: string;
  patient_id: string;
  raw_text: string | null;
  structured_data: OCRStructuredData;
  ocr_engine_used: string;
  confidence_score: number;
  created_at: string;
}

export interface Vitals {
  bp: string | null;
  hr: string | null;
  temp: string | null;
  weight: string | null;
  spo2: string | null;
}

export interface SOAPNotes {
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
}

export interface Medicine {
  name: string;
  strength: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  warnings: string | null;
}

export interface Prescription {
  id: string;
  visit_id: string;
  patient_id: string;
  medicines: Medicine[];
  pdf_path: string | null;
  qr_code_data: string | null;
  created_at: string;
}

export interface Visit {
  id: string;
  patient_id: string;
  doctor_id: string;
  visit_date: string;
  chief_complaint: string | null;
  soap_notes: SOAPNotes;
  vitals: Vitals;
  status: string;
  prescription?: Prescription | null;
}

export interface TimelineEvent {
  id: string;
  patient_id: string;
  event_type: "registration" | "upload" | "visit" | "prescription" | "note";
  event_summary: string;
  reference_id: string | null;
  event_date: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  ip_address: string | null;
  timestamp: string;
}

// Fetch helper that appends token
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<any> {
  const headers = new Headers(options.headers || {});
  
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401) {
    // Attempt Token Refresh in a real application
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("role");
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  // Handle PDF file response or JSON
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/pdf")) {
    return response.blob();
  }

  return response.json();
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<TokenResponse> {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail || "Login failed");
    }
    const data: TokenResponse = await res.json();
    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("role", data.role);
    }
    return data;
  },

  async getMe(): Promise<UserResponse> {
    return fetchWithAuth(`${API_BASE_URL}/auth/me`);
  },

  logout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("role");
    }
  },

  // Patients
  async searchPatients(query: string, type: string = "name"): Promise<Patient[]> {
    return fetchWithAuth(`${API_BASE_URL}/patients/search?query=${encodeURIComponent(query)}&type=${type}`);
  },

  async getPatient(id: string): Promise<Patient> {
    return fetchWithAuth(`${API_BASE_URL}/patients/${id}`);
  },

  async createPatient(patient: PatientCreate): Promise<Patient> {
    return fetchWithAuth(`${API_BASE_URL}/patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patient),
    });
  },

  async updatePatient(id: string, patient: Partial<Patient>): Promise<Patient> {
    return fetchWithAuth(`${API_BASE_URL}/patients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patient),
    });
  },

  async deletePatient(id: string): Promise<{ detail: string }> {
    return fetchWithAuth(`${API_BASE_URL}/patients/${id}`, {
      method: "DELETE",
    });
  },

  async getPatientTimeline(id: string): Promise<TimelineEvent[]> {
    return fetchWithAuth(`${API_BASE_URL}/patients/${id}/timeline`);
  },

  // Voice registration
  async voiceRegister(audioBase64: string): Promise<PatientCreate> {
    return fetchWithAuth(`${API_BASE_URL}/patients/voice-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_base64: audioBase64 }),
    });
  },

  // Medical Records & OCR
  async uploadRecord(patientId: string, file: File): Promise<MedicalRecord> {
    const formData = new FormData();
    formData.append("file", file);
    
    // Manual fetch since we are uploading multipart form data
    const headers = new Headers();
    const token = localStorage.getItem("access_token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    
    const res = await fetch(`${API_BASE_URL}/patients/${patientId}/records`, {
      method: "POST",
      headers,
      body: formData,
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "File upload failed" }));
      throw new Error(err.detail || "File upload failed");
    }
    return res.json();
  },

  async getRecords(patientId: string): Promise<MedicalRecord[]> {
    return fetchWithAuth(`${API_BASE_URL}/patients/${patientId}/records`);
  },

  async deleteRecord(recordId: string): Promise<{ detail: string }> {
    return fetchWithAuth(`${API_BASE_URL}/records/${recordId}`, {
      method: "DELETE",
    });
  },

  async runOCR(recordId: string): Promise<OCRRecord> {
    return fetchWithAuth(`${API_BASE_URL}/records/${recordId}/ocr`, {
      method: "POST",
    });
  },

  async getOCRResult(recordId: string): Promise<OCRRecord> {
    return fetchWithAuth(`${API_BASE_URL}/records/${recordId}/ocr-result`);
  },

  // Visits / Consultation
  async startVisit(patientId: string, chiefComplaint?: string): Promise<Visit> {
    return fetchWithAuth(`${API_BASE_URL}/patients/${patientId}/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chief_complaint: chiefComplaint || "" }),
    });
  },

  async getVisit(visitId: string): Promise<Visit> {
    return fetchWithAuth(`${API_BASE_URL}/visits/${visitId}`);
  },

  async updateVisit(visitId: string, data: { chief_complaint?: string; soap_notes?: SOAPNotes; vitals?: Vitals; status?: string }): Promise<Visit> {
    return fetchWithAuth(`${API_BASE_URL}/visits/${visitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async scribeVisit(visitId: string): Promise<Visit> {
    return fetchWithAuth(`${API_BASE_URL}/visits/${visitId}/scribe`, {
      method: "POST",
    });
  },

  async completeVisit(visitId: string): Promise<Visit> {
    return fetchWithAuth(`${API_BASE_URL}/visits/${visitId}/complete`, {
      method: "POST",
    });
  },

  // Prescription
  async createPrescription(visitId: string, data: { medicines?: Medicine[]; audio_base64?: string }): Promise<Prescription> {
    return fetchWithAuth(`${API_BASE_URL}/visits/${visitId}/prescription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async updatePrescription(prescriptionId: string, medicines: Medicine[]): Promise<Prescription> {
    return fetchWithAuth(`${API_BASE_URL}/prescriptions/${prescriptionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(medicines),
    });
  },

  async getPrescriptionPDFBlob(prescriptionId: string): Promise<Blob> {
    return fetchWithAuth(`${API_BASE_URL}/prescriptions/${prescriptionId}/pdf`);
  },

  async printPrescription(prescriptionId: string): Promise<{ detail: string }> {
    return fetchWithAuth(`${API_BASE_URL}/prescriptions/${prescriptionId}/print`, {
      method: "POST",
    });
  },

  // RAG & Embeddings
  async queryRAG(patientId: string, question: string, visitId?: string): Promise<{ answer: string; cited_chunks: string[] }> {
    return fetchWithAuth(`${API_BASE_URL}/patients/${patientId}/rag-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, visit_id: visitId }),
    });
  },

  async regenerateEmbeddings(patientId: string): Promise<{ detail: string }> {
    return fetchWithAuth(`${API_BASE_URL}/patients/${patientId}/embeddings`, {
      method: "POST",
    });
  },

  // Voice Command
  async processVoiceCommand(audioBase64: string): Promise<{ intent: string; parameters: any; confidence: number; transcript: string }> {
    return fetchWithAuth(`${API_BASE_URL}/voice/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_base64: audioBase64 }),
    });
  },

  // Admin Centralized logs & User creation
  async getAuditLogs(): Promise<AuditLog[]> {
    return fetchWithAuth(`${API_BASE_URL}/admin/audit-logs`);
  },

  async createClinician(user: any): Promise<{ detail: string }> {
    return fetchWithAuth(`${API_BASE_URL}/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    });
  }
};
