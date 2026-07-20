import base64
import os
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from backend.app.core.deps import get_db_session, require_doctor, require_any_role
from backend.app.core.config import settings
from backend.app.models.models import Visit, Patient, Doctor, Prescription, Timeline, Embedding
from backend.app.schemas.schemas import PrescriptionResponse, MedicineSchema
from backend.app.services.prescription import prescription_service
from backend.app.services.voice import voice_service
from backend.app.services.rag import rag_service
from backend.app.api.v1.endpoints.patients import log_audit_action

router = APIRouter()

class PrescriptionCreateRequest(BaseModel):
    medicines: Optional[List[MedicineSchema]] = None
    audio_base64: Optional[str] = None # For dictating prescription via voice
    transcript: Optional[str] = None # Direct text dictation fallback (e.g. mobile)

def check_and_set_allergy_warnings(medicines_list: List[dict], patient_allergies: Optional[List[str]]) -> List[dict]:
    if not patient_allergies:
        return medicines_list
        
    allergy_map = {
        "penicillin": ["amoxicillin", "penicillin", "ampicillin", "clavulanate", "piperacillin", "cefadroxil", "cephalexin"],
        "sulfa": ["sulfamethoxazole", "co-trimoxazole", "dapsone", "sulfasalazine"],
        "aspirin": ["aspirin", "ibuprofen", "diclofenac", "naproxen"]
    }
    
    updated_list = []
    for med in medicines_list:
        name = str(med.get("name") or "").strip()
        name_lower = name.lower()
        if not name:
            updated_list.append(med)
            continue
            
        warns = med.get("warnings") or ""
        has_conflict = False
        conflict_allergy = ""
        
        for allergy in patient_allergies:
            allergy_lower = allergy.lower()
            if allergy_lower in name_lower or name_lower in allergy_lower:
                has_conflict = True
                conflict_allergy = allergy
                break
                
            for allergy_class, drugs in allergy_map.items():
                if allergy_class in allergy_lower:
                    if any(d in name_lower for d in drugs):
                        has_conflict = True
                        conflict_allergy = allergy
                        break
            if has_conflict:
                break
                
        if has_conflict:
            warn_str = f"🚨 Allergy Warning: conflicts with recorded allergy to {conflict_allergy}"
            if warn_str not in warns:
                med["warnings"] = (warns + " " + warn_str).strip()
        else:
            warn_prefix = "🚨 Allergy Warning: conflicts with recorded allergy to"
            if warn_prefix in warns:
                parts = warns.split(warn_prefix)
                before = parts[0].strip()
                med["warnings"] = before if before else None
                
        updated_list.append(med)
    return updated_list

@router.post("/visits/{visit_id}/prescription", response_model=PrescriptionResponse)
async def create_prescription(
    visit_id: str,
    req: PrescriptionCreateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_doctor)
):
    # Fetch visit with row level locking
    result = await db.execute(
        select(Visit)
        .filter(Visit.id == visit_id)
        .options(selectinload(Visit.prescription))
        .with_for_update()
    )
    visit = result.scalars().first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")

    # Fetch patient details
    p_result = await db.execute(select(Patient).filter(Patient.id == visit.patient_id))
    patient = p_result.scalars().first()
    
    # Calculate age
    today = datetime.today()
    age = today.year - patient.date_of_birth.year - ((today.month, today.day) < (patient.date_of_birth.month, patient.date_of_birth.day))

    patient_data = {
        "full_name": patient.full_name,
        "age": age,
        "gender": patient.gender,
        "phone": patient.phone,
        "blood_group": patient.blood_group,
        "allergies": patient.allergies
    }

    # Fetch doctor details
    d_result = await db.execute(select(Doctor).filter(Doctor.id == visit.doctor_id))
    doctor = d_result.scalars().first()
    doctor_data = {
        "full_name": doctor.full_name,
        "specialization": doctor.specialization,
        "license_number": doctor.license_number,
        "phone": doctor.phone
    }

    medicines_list = []
    
    if req.transcript:
        # Direct text transcript (used as fallback for mobile devices)
        extracted_meds = prescription_service.parse_dictation(req.transcript)
        medicines_list = [med.model_dump() for med in extracted_meds]
    elif req.audio_base64:
        # Dictated prescription parsing
        try:
            audio_bytes = base64.b64decode(req.audio_base64)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 audio data")
            
        transcript = voice_service.transcribe_audio(audio_bytes, file_format="wav")
        if not transcript:
            raise HTTPException(status_code=400, detail="Could not transcribe dictation audio")
            
        extracted_meds = prescription_service.parse_dictation(transcript)
        medicines_list = [med.model_dump() for med in extracted_meds]
    elif req.medicines is not None:
        # Direct schema input
        medicines_list = [med.model_dump() for med in req.medicines]
    else:
        raise HTTPException(status_code=400, detail="Must provide either medicines list or audio dictation")

    db_prescription = visit.prescription

    # Cumulative dictation parsing: append new extractions to existing prescription list
    if db_prescription and (req.transcript or req.audio_base64):
        existing_meds = db_prescription.medicines or []
        accumulated_meds = [dict(m) for m in existing_meds]
        
        for new_med in medicines_list:
            new_name = str(new_med.get("name") or "").strip().lower()
            if not new_name:
                continue
                
            match_found = False
            for idx, existing in enumerate(accumulated_meds):
                existing_name = str(existing.get("name") or "").strip().lower()
                if existing_name == new_name:
                    # Update properties in-place (merge rather than duplicate)
                    accumulated_meds[idx]["strength"] = new_med.get("strength") or existing.get("strength")
                    accumulated_meds[idx]["dosage"] = new_med.get("dosage") or existing.get("dosage")
                    accumulated_meds[idx]["frequency"] = new_med.get("frequency") or existing.get("frequency")
                    accumulated_meds[idx]["duration"] = new_med.get("duration") or existing.get("duration")
                    accumulated_meds[idx]["instructions"] = new_med.get("instructions") or existing.get("instructions")
                    if new_med.get("warnings"):
                        accumulated_meds[idx]["warnings"] = new_med.get("warnings")
                    match_found = True
                    break
                    
            if not match_found:
                accumulated_meds.append(new_med)
                
        medicines_list = accumulated_meds

    # Run allergy check and set warning flags
    medicines_list = check_and_set_allergy_warnings(medicines_list, patient.allergies)

    # Generate Prescription PDF
    pdf_rel_path = prescription_service.generate_prescription_pdf(
        patient_id=visit.patient_id,
        visit_id=visit.id,
        patient_data=patient_data,
        doctor_data=doctor_data,
        medicines=medicines_list,
        visit_date=visit.visit_date.strftime("%Y-%m-%d")
    )

    if db_prescription:
        # Update existing
        db_prescription.medicines = medicines_list
        db_prescription.pdf_path = pdf_rel_path
        db_prescription.qr_code_data = str(visit.id)
    else:
        # Create new
        db_prescription = Prescription(
            visit_id=visit.id,
            patient_id=visit.patient_id,
            pdf_path=pdf_rel_path,
            qr_code_data=str(visit.id)
        )
        db_prescription.medicines = medicines_list
        db.add(db_prescription)
        await db.flush()

    # Index prescription details in ChromaDB
    meds_text = "\n".join([
        f"- {m.get('name')} {m.get('strength') or ''}: {m.get('frequency')} for {m.get('duration')} ({m.get('instructions') or ''})"
        for m in medicines_list
    ])
    prescription_chunk = (
        f"Prescription Date: {visit.visit_date.strftime('%Y-%m-%d')}\n"
        f"Prescribed Medications:\n{meds_text}"
    )

    doc_id = f"prescription_{db_prescription.id}"
    meta = {
        "source_type": "prescription",
        "source_id": db_prescription.id,
        "patient_id": visit.patient_id,
        "created_at": datetime.now().isoformat()
    }

    # Save relational embedding reference
    db_emb = Embedding(
        patient_id=visit.patient_id,
        source_type="prescription",
        source_id=db_prescription.id,
        chroma_collection_name=rag_service._get_collection_name(visit.patient_id),
        chroma_document_id=doc_id
    )
    db_emb.chunk_text = prescription_chunk
    db.add(db_emb)

    # Add to ChromaDB
    rag_service.add_patient_documents(
        patient_id=visit.patient_id,
        texts=[prescription_chunk],
        metadatas=[meta],
        document_ids=[doc_id]
    )

    # Timeline entry
    med_names = ", ".join([m.get("name") for m in medicines_list[:3]])
    summary = f"Prescription generated. Meds: {med_names}."
    timeline_evt = Timeline(
        patient_id=visit.patient_id,
        event_type="prescription",
        event_summary=summary,
        reference_id=db_prescription.id,
        event_date=datetime.now()
    )
    db.add(timeline_evt)

    # Audit log
    await log_audit_action(db, current_user.email, "CREATE", "Prescription", db_prescription.id)
    await db.commit()

    return db_prescription

@router.put("/prescriptions/{id}", response_model=PrescriptionResponse)
async def update_prescription(
    id: str,
    prescription_in: List[MedicineSchema],
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_doctor)
):
    result = await db.execute(
        select(Prescription)
        .filter(Prescription.id == id)
        .options(selectinload(Prescription.visit))
    )
    prescription = result.scalars().first()
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")

    visit = prescription.visit
    
    # Fetch patient details
    p_result = await db.execute(select(Patient).filter(Patient.id == visit.patient_id))
    patient = p_result.scalars().first()
    today = datetime.today()
    age = today.year - patient.date_of_birth.year - ((today.month, today.day) < (patient.date_of_birth.month, patient.date_of_birth.day))
    
    patient_data = {
        "full_name": patient.full_name,
        "age": age,
        "gender": patient.gender,
        "phone": patient.phone,
        "blood_group": patient.blood_group,
        "allergies": patient.allergies
    }

    # Fetch doctor details
    d_result = await db.execute(select(Doctor).filter(Doctor.id == visit.doctor_id))
    doctor = d_result.scalars().first()
    doctor_data = {
        "full_name": doctor.full_name,
        "specialization": doctor.specialization,
        "license_number": doctor.license_number,
        "phone": doctor.phone
    }

    medicines_list = [med.model_dump() for med in prescription_in]

    # Re-generate PDF
    pdf_rel_path = prescription_service.generate_prescription_pdf(
        patient_id=visit.patient_id,
        visit_id=visit.id,
        patient_data=patient_data,
        doctor_data=doctor_data,
        medicines=medicines_list,
        visit_date=visit.visit_date.strftime("%Y-%m-%d")
    )

    prescription.medicines = medicines_list
    prescription.pdf_path = pdf_rel_path

    await log_audit_action(db, current_user.email, "UPDATE", "Prescription", id)
    await db.commit()
    return prescription

@router.get("/prescriptions/{id}/pdf")
async def get_prescription_pdf(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_any_role)
):
    result = await db.execute(select(Prescription).filter(Prescription.id == id))
    prescription = result.scalars().first()
    if not prescription or not prescription.pdf_path:
        raise HTTPException(status_code=404, detail="Prescription PDF not found")

    pdf_full_path = os.path.join(settings.STORAGE_DIR, prescription.pdf_path)
    if not os.path.exists(pdf_full_path):
        raise HTTPException(status_code=404, detail="Prescription PDF file does not exist on storage")

    return FileResponse(
        pdf_full_path, 
        media_type="application/pdf", 
        filename=f"prescription_{prescription.visit_id}.pdf"
    )

@router.post("/prescriptions/{id}/print")
async def print_prescription(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_any_role)
):
    # Retrieve PDF details
    result = await db.execute(select(Prescription).filter(Prescription.id == id))
    prescription = result.scalars().first()
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")

    # In a full hospital layout, this would route to a local network thermal or laser printer.
    # For this working prototype, we simulate sending a print job and return confirmation.
    return {"detail": f"Simulated: Print job for prescription ID '{id}' successfully sent to hospital clinic printer desk."}
