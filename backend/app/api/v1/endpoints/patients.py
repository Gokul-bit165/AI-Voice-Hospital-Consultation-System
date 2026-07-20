import base64
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_

from backend.app.core.deps import get_db_session, require_reception, require_any_role, require_admin
from backend.app.models.models import Patient, Timeline, AuditLog, Doctor, ProfileDiscrepancy
from backend.app.schemas.schemas import PatientCreate, PatientResponse, PatientUpdate, VoiceRegisterRequest, VoiceRegisterConfirmRequest, TimelineResponse
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
    prompt = template.replace("{transcript}", transcript)
    
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

from pydantic import BaseModel

class ResolveDiscrepancyRequest(BaseModel):
    action: str # approve, reject

@router.get("/{id}/discrepancies")
async def list_patient_discrepancies(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_any_role)
):
    stmt = select(ProfileDiscrepancy).filter(ProfileDiscrepancy.patient_id == id).order_by(ProfileDiscrepancy.created_at.desc())
    result = await db.execute(stmt)
    discrepancies = result.scalars().all()
    
    # Format current/extracted value for frontend response
    resp = []
    for d in discrepancies:
        resp.append({
            "id": d.id,
            "patient_id": d.patient_id,
            "field_name": d.field_name,
            "current_value": d.current_value,
            "extracted_value": d.extracted_value,
            "source_document_id": d.source_document_id,
            "confidence": d.confidence,
            "status": d.status,
            "created_at": d.created_at,
            "reviewed_by": d.reviewed_by,
            "reviewed_at": d.reviewed_at
        })
    return resp

@router.patch("/{id}/discrepancies/{discrepancy_id}/resolve")
async def resolve_patient_discrepancy(
    id: str,
    discrepancy_id: str,
    body: ResolveDiscrepancyRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_reception)
):
    # Verify patient
    p_result = await db.execute(select(Patient).filter(Patient.id == id))
    patient = p_result.scalars().first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")
        
    # Verify discrepancy
    d_result = await db.execute(select(ProfileDiscrepancy).filter(ProfileDiscrepancy.id == discrepancy_id, ProfileDiscrepancy.patient_id == id))
    discrepancy = d_result.scalars().first()
    if not discrepancy:
        raise HTTPException(status_code=404, detail="Discrepancy not found for this patient.")
        
    if discrepancy.status != "pending_review":
        raise HTTPException(status_code=400, detail=f"Discrepancy already resolved with status {discrepancy.status}.")
        
    action = body.action.strip().lower()
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'.")
        
    old_val = discrepancy.current_value or "None"
    new_val = discrepancy.extracted_value
    
    if action == "approve":
        # Write extracted_value into Patient
        field = discrepancy.field_name
        if field == "date_of_birth":
            try:
                dob_date = datetime.strptime(new_val, "%Y-%m-%d").date()
                patient.date_of_birth = dob_date
            except Exception:
                raise HTTPException(status_code=400, detail=f"Invalid date format for birth date: '{new_val}'.")
        elif field == "allergies":
            patient.allergies = [a.strip() for a in new_val.split(",") if a.strip()]
        else:
            setattr(patient, field, new_val)
            
        discrepancy.status = "approved"
        
        # Timeline event for audit
        timeline_evt = Timeline(
            patient_id=patient.id,
            event_type="note",
            event_summary=f"Profile field '{field}' updated from '{old_val}' to '{new_val}' based on uploaded report (confirmed by {current_user.full_name}).",
            reference_id=discrepancy.source_document_id,
            event_date=datetime.now()
        )
        db.add(timeline_evt)
        await log_audit_action(db, current_user.email, "UPDATE", "Patient", patient.id)
        
    elif action == "reject":
        discrepancy.status = "rejected"
        
        # Keep timeline note for audit trail
        timeline_evt = Timeline(
            patient_id=patient.id,
            event_type="note",
            event_summary=f"Discrepancy for field '{discrepancy.field_name}' (extracted: '{new_val}') rejected by {current_user.full_name}. Profile remains '{old_val}'.",
            reference_id=discrepancy.source_document_id,
            event_date=datetime.now()
        )
        db.add(timeline_evt)
        
    discrepancy.reviewed_by = current_user.id
    discrepancy.reviewed_at = datetime.now()
    
    await db.commit()
    
    return {
        "id": discrepancy.id,
        "status": discrepancy.status,
        "field_name": discrepancy.field_name,
        "current_value": discrepancy.current_value,
        "extracted_value": discrepancy.extracted_value,
        "reviewed_by": discrepancy.reviewed_by,
        "reviewed_at": discrepancy.reviewed_at
    }
