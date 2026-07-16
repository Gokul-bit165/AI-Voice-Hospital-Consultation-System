import uuid
from sqlalchemy import Column, String, Date, DateTime, ForeignKey, Text, Float, JSON, Index, func, Boolean, Integer
from sqlalchemy.orm import relationship
from backend.app.core.database import Base
from backend.app.core.encryption import encrypt_text, decrypt_text, encrypt_json, decrypt_json

class Doctor(Base):
    __tablename__ = "doctors"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name = Column(String(255), nullable=False)
    specialization = Column(String(255), nullable=False)
    license_number = Column(String(100), nullable=False)
    phone = Column(String(50), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="Doctor") # Doctor, Reception, Admin
    created_at = Column(DateTime, default=func.now())

class Patient(Base):
    __tablename__ = "patients"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name = Column(String(255), nullable=False)
    date_of_birth = Column(Date, nullable=False)
    gender = Column(String(50), nullable=False)
    phone = Column(String(50), unique=True, index=True, nullable=False)
    address = Column(Text, nullable=True)
    emergency_contact_name = Column(String(255), nullable=True)
    emergency_contact_phone = Column(String(50), nullable=True)
    blood_group = Column(String(10), nullable=True)
    
    # Encrypted fields at rest
    _allergies = Column("allergies", Text, nullable=True)
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships with cascade delete to prevent orphaned data
    records = relationship("MedicalRecord", back_populates="patient", cascade="all, delete-orphan")
    ocr_records = relationship("OCRRecord", back_populates="patient", cascade="all, delete-orphan")
    embeddings = relationship("Embedding", back_populates="patient", cascade="all, delete-orphan")
    visits = relationship("Visit", back_populates="patient", cascade="all, delete-orphan")
    prescriptions = relationship("Prescription", back_populates="patient", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="patient", cascade="all, delete-orphan")
    timeline_events = relationship("Timeline", back_populates="patient", cascade="all, delete-orphan")
    
    @property
    def allergies(self):
        return decrypt_json(self._allergies) or []
        
    @allergies.setter
    def allergies(self, value):
        self._allergies = encrypt_json(value)

class MedicalRecord(Base):
    __tablename__ = "medical_records"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    file_path = Column(String(512), nullable=False)
    file_type = Column(String(50), nullable=False) # pdf, png, jpg, etc.
    original_filename = Column(String(255), nullable=False)
    uploaded_by = Column(String(255), nullable=False)
    uploaded_at = Column(DateTime, default=func.now())
    
    patient = relationship("Patient", back_populates="records")
    ocr_record = relationship("OCRRecord", back_populates="medical_record", cascade="all, delete-orphan", uselist=False)

    __table_args__ = (
        Index("idx_records_patient_uploaded", "patient_id", "uploaded_at"),
    )

class OCRRecord(Base):
    __tablename__ = "ocr_records"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    medical_record_id = Column(String(36), ForeignKey("medical_records.id", ondelete="CASCADE"), nullable=False)
    patient_id = Column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Encrypted fields
    _raw_text = Column("raw_text", Text, nullable=True)
    _structured_data = Column("structured_data", Text, nullable=True)
    
    ocr_engine_used = Column(String(50), nullable=False) # PaddleOCR, EasyOCR, GeminiVision
    confidence_score = Column(Float, nullable=False, default=1.0)
    created_at = Column(DateTime, default=func.now())
    
    patient = relationship("Patient", back_populates="ocr_records")
    medical_record = relationship("MedicalRecord", back_populates="ocr_record")

    __table_args__ = (
        Index("idx_ocr_patient_created", "patient_id", "created_at"),
    )

    @property
    def raw_text(self):
        return decrypt_text(self._raw_text)
        
    @raw_text.setter
    def raw_text(self, value):
        self._raw_text = encrypt_text(value)

    @property
    def structured_data(self):
        return decrypt_json(self._structured_data) or {}
        
    @structured_data.setter
    def structured_data(self, value):
        self._structured_data = encrypt_json(value)

class Embedding(Base):
    __tablename__ = "embeddings"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type = Column(String(50), nullable=False) # ocr_record, consultation, prescription
    source_id = Column(String(36), nullable=False)
    
    # Encrypted source chunk text
    _chunk_text = Column("chunk_text", Text, nullable=False)
    
    chroma_collection_name = Column(String(100), nullable=False)
    chroma_document_id = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=func.now())
    
    patient = relationship("Patient", back_populates="embeddings")

    __table_args__ = (
        Index("idx_embeddings_patient_created", "patient_id", "created_at"),
    )

    @property
    def chunk_text(self):
        return decrypt_text(self._chunk_text)
        
    @chunk_text.setter
    def chunk_text(self, value):
        self._chunk_text = encrypt_text(value)

class Visit(Base):
    __tablename__ = "visits"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    doctor_id = Column(String(36), ForeignKey("doctors.id"), nullable=False)
    visit_date = Column(DateTime, default=func.now())
    
    # Encrypted SOAP and chief complaint fields
    _chief_complaint = Column("chief_complaint", Text, nullable=True)
    _soap_notes = Column("soap_notes", Text, nullable=True) # JSON subjective, objective, assessment, plan
    _vitals = Column("vitals", Text, nullable=True) # JSON {bp: ..., hr: ..., temp: ...}
    
    status = Column(String(50), nullable=False, default="in_progress") # in_progress, completed
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    patient = relationship("Patient", back_populates="visits")
    doctor = relationship("Doctor")
    prescription = relationship("Prescription", back_populates="visit", cascade="all, delete-orphan", uselist=False)
    conversations = relationship("Conversation", back_populates="visit", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_visits_patient_created", "patient_id", "created_at"),
    )

    @property
    def chief_complaint(self):
        return decrypt_text(self._chief_complaint)
        
    @chief_complaint.setter
    def chief_complaint(self, value):
        self._chief_complaint = encrypt_text(value)

    @property
    def soap_notes(self):
        return decrypt_json(self._soap_notes) or {}
        
    @soap_notes.setter
    def soap_notes(self, value):
        self._soap_notes = encrypt_json(value)

    @property
    def vitals(self):
        return decrypt_json(self._vitals) or {}
        
    @vitals.setter
    def vitals(self, value):
        self._vitals = encrypt_json(value)

class Prescription(Base):
    __tablename__ = "prescriptions"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    visit_id = Column(String(36), ForeignKey("visits.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id = Column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Encrypted list of medicines
    _medicines = Column("medicines", Text, nullable=True) # JSON list
    
    pdf_path = Column(String(512), nullable=True)
    qr_code_data = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    
    patient = relationship("Patient", back_populates="prescriptions")
    visit = relationship("Visit", back_populates="prescription")

    __table_args__ = (
        Index("idx_prescriptions_patient_created", "patient_id", "created_at"),
    )

    @property
    def medicines(self):
        return decrypt_json(self._medicines) or []
        
    @medicines.setter
    def medicines(self, value):
        self._medicines = encrypt_json(value)

class Conversation(Base):
    __tablename__ = "conversations"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    visit_id = Column(String(36), ForeignKey("visits.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id = Column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), nullable=False) # doctor, patient, ai
    
    # Encrypted message text
    _message_text = Column("message_text", Text, nullable=False)
    
    audio_path = Column(String(512), nullable=True)
    timestamp = Column(DateTime, default=func.now())
    
    patient = relationship("Patient", back_populates="conversations")
    visit = relationship("Visit", back_populates="conversations")

    __table_args__ = (
        Index("idx_conversations_patient_timestamp", "patient_id", "timestamp"),
    )

    @property
    def message_text(self):
        return decrypt_text(self._message_text)
        
    @message_text.setter
    def message_text(self, value):
        self._message_text = encrypt_text(value)

class Timeline(Base):
    __tablename__ = "timelines"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False) # registration, upload, visit, prescription, note
    event_summary = Column(Text, nullable=False)
    reference_id = Column(String(36), nullable=True) # ID of the related Visit, Prescription, MedicalRecord, etc.
    event_date = Column(DateTime, default=func.now())
    created_at = Column(DateTime, default=func.now())
    
    patient = relationship("Patient", back_populates="timeline_events")

    __table_args__ = (
        Index("idx_timelines_patient_created", "patient_id", "created_at"),
    )

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), nullable=True) # ID or email of user making change
    action = Column(String(50), nullable=False) # CREATE, UPDATE, DELETE
    entity_type = Column(String(100), nullable=False) # Patient, Visit, Prescription, MedicalRecord
    entity_id = Column(String(36), nullable=False)
    ip_address = Column(String(50), nullable=True)
    timestamp = Column(DateTime, default=func.now())

class ApiKey(Base):
    __tablename__ = "api_keys"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    service = Column(String(50), nullable=False) # 'openai', 'gemini', 'groq', 'openrouter'
    name = Column(String(100), nullable=True)
    _key_value = Column("key_value", Text, nullable=False) # Encrypted
    priority = Column(Integer, nullable=False, default=1)
    is_active = Column(Boolean, nullable=False, default=True)
    fail_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now())

    @property
    def key_value(self):
        return decrypt_text(self._key_value)
        
    @key_value.setter
    def key_value(self, value):
        self._key_value = encrypt_text(value)

