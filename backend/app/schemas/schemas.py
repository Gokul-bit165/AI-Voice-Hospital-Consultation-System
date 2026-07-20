from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Any
from datetime import date, datetime

# Auth
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None
    type: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    specialization: str = "General Medicine"
    license_number: str = "N/A"
    phone: str = "N/A"
    role: str = "Doctor" # Doctor, Reception, Admin

# Patient
class PatientBase(BaseModel):
    full_name: str
    date_of_birth: date
    gender: str
    phone: str
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: List[str] = []

class PatientCreate(PatientBase):
    pass

class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[List[str]] = None

class PatientResponse(PatientBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Voice Registration
class VoiceRegisterRequest(BaseModel):
    audio_base64: str # Base64 encoded audio string

class VoiceRegisterConfirmRequest(PatientBase):
    pass

# OCR
class OCRStructuredData(BaseModel):
    diagnoses: List[str] = []
    medications: List[str] = []
    lab_values: List[dict] = [] # e.g. [{"name": "HbA1c", "value": "6.5", "unit": "%"}]
    dates: List[str] = []
    doctor_names: List[str] = []
    
    # Demographic fields
    blood_group: Optional[str] = None
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    allergies: List[str] = []
    emergency_contact: Optional[str] = None
    extraction_confidence: Optional[dict] = None

class OCRRecordResponse(BaseModel):
    id: str
    medical_record_id: str
    patient_id: str
    raw_text: Optional[str] = None
    structured_data: OCRStructuredData
    ocr_engine_used: str
    confidence_score: float
    created_at: datetime

    class Config:
        from_attributes = True

# Medical Record
class MedicalRecordResponse(BaseModel):
    id: str
    patient_id: str
    file_path: str
    file_type: str
    original_filename: str
    uploaded_by: str
    uploaded_at: datetime
    ocr_record: Optional[OCRRecordResponse] = None
    file_available: bool = True

    class Config:
        from_attributes = True

# Vitals & SOAP Notes
class VitalsSchema(BaseModel):
    bp: Optional[str] = None # e.g. "120/80"
    hr: Optional[str] = None # e.g. "72"
    temp: Optional[str] = None # e.g. "98.6"
    weight: Optional[str] = None # e.g. "70kg"
    spo2: Optional[str] = None # e.g. "98%"

class SOAPNotesSchema(BaseModel):
    subjective: Optional[str] = None
    objective: Optional[str] = None
    assessment: Optional[str] = None
    plan: Optional[str] = None

class VisitBase(BaseModel):
    chief_complaint: Optional[str] = None
    soap_notes: SOAPNotesSchema = Field(default_factory=SOAPNotesSchema)
    vitals: VitalsSchema = Field(default_factory=VitalsSchema)
    status: str = "in_progress"

class VisitCreate(BaseModel):
    chief_complaint: Optional[str] = None

class VisitUpdate(BaseModel):
    chief_complaint: Optional[str] = None
    soap_notes: Optional[SOAPNotesSchema] = None
    vitals: Optional[VitalsSchema] = None
    status: Optional[str] = None

# Medicines & Prescription
class MedicineSchema(BaseModel):
    name: str
    strength: Optional[str] = None # e.g. "500mg"
    frequency: Optional[str] = None # e.g. "Once daily" or "1-0-1"
    duration: Optional[str] = None # e.g. "5 days"
    instructions: Optional[str] = None # e.g. "Before food"
    warnings: Optional[str] = None


class PrescriptionBase(BaseModel):
    medicines: List[MedicineSchema] = []

class PrescriptionCreate(PrescriptionBase):
    pass

class PrescriptionUpdate(PrescriptionBase):
    pass

class PrescriptionResponse(PrescriptionBase):
    id: str
    visit_id: str
    patient_id: str
    pdf_path: Optional[str] = None
    qr_code_data: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class VisitResponse(VisitBase):
    id: str
    patient_id: str
    doctor_id: str
    visit_date: datetime
    prescription: Optional[PrescriptionResponse] = None

    class Config:
        from_attributes = True

# Timeline
class TimelineResponse(BaseModel):
    id: str
    patient_id: str
    event_type: str # registration, upload, visit, prescription, note
    event_summary: str
    reference_id: Optional[str] = None
    event_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True

# Conversation
class ConversationMessage(BaseModel):
    role: str # doctor, patient, ai
    message_text: str
    timestamp: datetime

class ConversationResponse(BaseModel):
    messages: List[ConversationMessage] = []

class RAGQueryRequest(BaseModel):
    question: str
    visit_id: Optional[str] = None

class RAGQueryResponse(BaseModel):
    answer: str
    cited_chunks: List[str] = []

# Voice Command
class VoiceCommandRequest(BaseModel):
    audio_base64: str

class VoiceCommandResponse(BaseModel):
    intent: str # e.g. "open_patient", "show_allergies", "print_prescription", etc.
    parameters: dict # e.g. {"patient_name": "John Doe", "query": "..."}
    confidence: float
    transcript: str

class AudioTranscribeRequest(BaseModel):
    audio_base64: str
    file_format: Optional[str] = "wav"

class AudioTranscribeResponse(BaseModel):
    transcript: str

# Audit Log
class AuditLogResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    action: str
    entity_type: str
    entity_id: str
    ip_address: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

# ── Agent Query ──────────────────────────────────────────────────────────────

class AgentQueryRequest(BaseModel):
    question: str
    visit_id: Optional[str] = None

class AgentStep(BaseModel):
    type: str                          # "tool_call" | "observation" | "error"
    tool_name: Optional[str] = None
    tool_args: Optional[dict] = None
    result: Optional[str] = None
    duration_ms: Optional[int] = None
    is_safety_relevant: bool = False   # True when allergy/drug-check tools fire

class AgentQueryResponse(BaseModel):
    final_answer: str
    steps: List[AgentStep] = []
    tool_calls_made: List[str] = []
    is_grounded: bool = False          # True if patient-specific tools were used
    has_safety_disclaimer: bool = False # True if drug/allergy tools fired

# API Key Management
class ApiKeyCreate(BaseModel):
    service: str # 'openai', 'gemini', 'groq', 'openrouter'
    name: Optional[str] = None
    key_value: str
    priority: Optional[int] = 1
    is_active: Optional[bool] = True

class ApiKeyUpdate(BaseModel):
    name: Optional[str] = None
    key_value: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None

class ApiKeyResponse(BaseModel):
    id: str
    service: str
    name: Optional[str] = None
    masked_key: str
    priority: int
    is_active: bool
    fail_count: int
    created_at: datetime

    class Config:
        from_attributes = True

