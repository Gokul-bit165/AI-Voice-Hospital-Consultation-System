// Relative URL — Next.js rewrites proxy this to http://127.0.0.1:8000/api/v1
// Works identically from localhost, LAN IP (10.x.x.x), or ngrok HTTPS tunnel.
export const API_BASE_URL = "/api/v1";


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
  file_available: boolean;
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

export interface ApiKeyResponse {
  id: string;
  service: string;
  name: string | null;
  masked_key: string;
  priority: number;
  is_active: boolean;
  fail_count: number;
  created_at: string;
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

  getRecordViewUrl(recordId: string): string {
    return `${API_BASE_URL}/records/${recordId}/view`;
  },

  async viewRecord(recordId: string): Promise<Blob> {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const res = await fetch(`${API_BASE_URL}/records/${recordId}/view`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = "Failed to open document.";
      try {
        const err = await res.json();
        if (err?.detail) msg = err.detail;
      } catch {}
      throw new Error(msg);
    }
    return res.blob();
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
  async createPrescription(visitId: string, data: { medicines?: Medicine[]; audio_base64?: string; transcript?: string }): Promise<Prescription> {
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

  async transcribeAudio(audioBase64: string, fileFormat = "wav"): Promise<{ transcript: string }> {
    return fetchWithAuth(`${API_BASE_URL}/voice/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_base64: audioBase64, file_format: fileFormat }),
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
  },

  async getApiKeys(): Promise<ApiKeyResponse[]> {
    return fetchWithAuth(`${API_BASE_URL}/admin/api-keys`);
  },

  async createApiKey(keyData: { service: string; name?: string; key_value: string; priority?: number; is_active?: boolean }): Promise<ApiKeyResponse> {
    return fetchWithAuth(`${API_BASE_URL}/admin/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keyData),
    });
  },

  async updateApiKey(keyId: string, keyData: { name?: string; key_value?: string; priority?: number; is_active?: boolean }): Promise<ApiKeyResponse> {
    return fetchWithAuth(`${API_BASE_URL}/admin/api-keys/${keyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keyData),
    });
  },

  async deleteApiKey(keyId: string): Promise<{ detail: string }> {
    return fetchWithAuth(`${API_BASE_URL}/admin/api-keys/${keyId}`, {
      method: "DELETE",
    });
  },


  // ── Agent streaming ──────────────────────────────────────────────────────
  async streamAgentQuery(
    patientId: string,
    question: string,
    visitId: string | undefined,
    callbacks: {
      onThinking?: (msg: string) => void;
      onToolCall?: (tool_name: string, tool_args: Record<string, any>, label: string) => void;
      onObservation?: (tool_name: string, result: string, duration_ms: number, is_safety_relevant: boolean) => void;
      onChunk?: (chunk: string) => void;
      onDone?: (data: { is_grounded: boolean; has_safety_disclaimer: boolean; steps: any[]; tool_calls_made: string[] }) => void;
      onError?: (msg: string) => void;
    },
    signal?: AbortSignal
  ): Promise<void> {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const res = await fetch(`${API_BASE_URL}/patients/${patientId}/agent-query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ question, visit_id: visitId }),
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Agent request failed" }));
      callbacks.onError?.(err.detail || "Agent request failed");
      return;
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          switch (event.type) {
            case "thinking":    callbacks.onThinking?.(event.message); break;
            case "tool_call":   callbacks.onToolCall?.(event.tool_name, event.tool_args ?? {}, event.label ?? event.tool_name); break;
            case "observation": callbacks.onObservation?.(event.tool_name, event.result ?? "", event.duration_ms ?? 0, event.is_safety_relevant ?? false); break;
            case "final_answer_chunk": callbacks.onChunk?.(event.chunk ?? ""); break;
            case "done":        callbacks.onDone?.({ is_grounded: event.is_grounded, has_safety_disclaimer: event.has_safety_disclaimer, steps: event.steps ?? [], tool_calls_made: event.tool_calls_made ?? [] }); break;
            case "error":       callbacks.onError?.(event.message ?? "Unknown agent error"); break;
          }
        } catch { /* skip malformed lines */ }
      }
    }
  },
};
