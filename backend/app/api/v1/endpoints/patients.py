import base64
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_

from backend.app.core.deps import get_db_session, require_reception, require_any_role
from backend.app.models.models import Patient, Timeline, AuditLog, Doctor
from backend.app.schemas.schemas import PatientCreate, PatientResponse, PatientUpdate, VoiceRegisterRequest, VoiceRegisterConfirmRequest
from backend.app.services.voice import voice_service
from backend.app.services.llm_client import llm_client
from backend.app.services.rag import rag_service
from backend.app.core.prompts import load_prompt_template

router = APIRouter()

async def log_audit_action(db: AsyncSession, doctor_id: str, action: str, entity_type: str, entity_id: str):
    audit = AuditLog(
        user_id=doctor_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id)
    )
    db.add(audit)
    # We flush inside active session, it gets committed when the endpoint commits

@router.post("", response_model=PatientResponse)
async def create_patient(
    patient_in: PatientCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_reception)
):
    # Check if phone already registered
    stmt = select(Patient).filter(Patient.phone == patient_in.phone)
    existing = (await db.execute(stmt)).scalars().first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A patient with this phone number is already registered."
        )

    db_patient = Patient(
        full_name=patient_in.full_name,
        date_of_birth=patient_in.date_of_birth,
        gender=patient_in.gender,
        phone=patient_in.phone,
        address=patient_in.address,
        emergency_contact_name=patient_in.emergency_contact_name,
        emergency_contact_phone=patient_in.emergency_contact_phone,
        blood_group=patient_in.blood_group
    )
    db_patient.allergies = patient_in.allergies # Enters via encryption wrapper
    db.add(db_patient)
    await db.flush() # Populate ID

    # Add timeline event
    timeline_evt = Timeline(
        patient_id=db_patient.id,
        event_type="registration",
        event_summary="Patient profile created via manual entry.",
        event_date=datetime.now()
    )
    db.add(timeline_evt)
    
    # Audit log
    await log_audit_action(db, current_user.email, "CREATE", "Patient", db_patient.id)
    
    await db.commit()
    return db_patient

@router.get("/search", response_model=List[PatientResponse])
async def search_patients(
    query: str,
    type: str = "name", # phone, id, name
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_any_role)
):
    stmt = select(Patient)
    
    if type == "phone":
        stmt = stmt.filter(Patient.phone.like(f"%{query}%"))
    elif type == "id":
        stmt = stmt.filter(Patient.id.ilike(f"%{query}%"))
    elif type == "name":
        stmt = stmt.filter(Patient.full_name.ilike(f"%{query}%"))
    else:
        # General search fallback
        stmt = stmt.filter(
            or_(
                Patient.full_name.ilike(f"%{query}%"),
                Patient.phone.like(f"%{query}%"),
                Patient.id.ilike(f"%{query}%")
            )
        )
        
    result = await db.execute(stmt)
    patients = result.scalars().all()
    return patients

@router.get("/{id}", response_model=PatientResponse)
async def get_patient(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_any_role)
):
    result = await db.execute(select(Patient).filter(Patient.id == id))
    patient = result.scalars().first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient

@router.put("/{id}", response_model=PatientResponse)
async def update_patient(
    id: str,
    patient_in: PatientUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_reception)
):
    result = await db.execute(select(Patient).filter(Patient.id == id))
    patient = result.scalars().first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    for field, value in patient_in.model_dump(exclude_unset=True).items():
        if field == "allergies":
            patient.allergies = value
        else:
            setattr(patient, field, value)
            
    await log_audit_action(db, current_user.email, "UPDATE", "Patient", patient.id)
    await db.commit()
    return patient

@router.delete("/{id}")
async def delete_patient(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_admin)
):
    result = await db.execute(select(Patient).filter(Patient.id == id))
    patient = result.scalars().first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
        
    # Delete patient-isolated ChromaDB collection
    rag_service.delete_patient_collection(patient.id)
    
    await db.delete(patient)
    await log_audit_action(db, current_user.email, "DELETE", "Patient", id)
    await db.commit()
    return {"detail": "Patient deleted successfully from database and vector stores"}

@router.post("/voice-register", response_model=PatientCreate)
async def voice_register_patient(
    req: VoiceRegisterRequest,
    current_user: Doctor = Depends(require_reception)
):
    """
    Accepts base64-encoded audio dictation, transcribes it, extracts patient demographics.
    """
    try:
        audio_data = base64.b64decode(req.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")
        
    # Transcribe audio (Whisper API or Gemini)
    transcript = voice_service.transcribe_audio(audio_data, file_format="wav")
    if not transcript:
        raise HTTPException(status_code=400, detail="Could not extract transcription from audio")
        
    # Extract structured fields using LLM
    template = load_prompt_template("voice_registration_extraction.txt")
    prompt = template.format(transcript=transcript)
    
    system_instruction = (
        "You are a medical data extraction bot. "
        "Your task is to parse unstructured registration details into patient schemas."
    )
    
    patient_draft = llm_client.extract_structured(
        prompt=prompt,
        response_model=PatientCreate,
        system_instruction=system_instruction
    )
    
    return patient_draft

@router.get("/{id}/timeline", response_model=List[TimelineResponse])
async def get_patient_timeline(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_any_role)
):
    """
    Get sorted timeline events for a patient.
    """
    stmt = select(Timeline).filter(Timeline.patient_id == id).order_by(Timeline.event_date.desc(), Timeline.created_at.desc())
    result = await db.execute(stmt)
    events = result.scalars().all()
    return events
