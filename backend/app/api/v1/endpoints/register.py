import os
import uuid
import shutil
from typing import List, Optional
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from backend.app.core.deps import get_db_session, require_reception
from backend.app.core.config import settings
from backend.app.models.models import Patient, PatientRegistrationDraft, MedicalRecord, OCRRecord, Embedding, Timeline, Doctor
from backend.app.schemas.schemas import PatientResponse, OCRStructuredData
from backend.app.services.ocr import ocr_service
from backend.app.services.llm_client import llm_client
from backend.app.services.rag import rag_service
from backend.app.core.prompts import load_prompt_template
from backend.app.api.v1.endpoints.patients import log_audit_action
from backend.app.api.v1.endpoints.records import cleanup_stale_records_task

router = APIRouter()

class DraftConfirmRequest(BaseModel):
    full_name: str
    date_of_birth: str
    gender: str
    phone: str
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: List[str] = []

@router.post("/register/upload-documents", status_code=201)
async def upload_registration_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_reception)
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    draft_id = str(uuid.uuid4())
    temp_dir = os.path.join(settings.STORAGE_DIR, "drafts", draft_id)
    os.makedirs(temp_dir, exist_ok=True)

    uploaded_files_info = []
    combined_raw_texts = []

    for file in files:
        filename = file.filename or "record.dat"
        ext = os.path.splitext(filename)[1].lower()
        if ext not in (".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"):
            # Clean up temp folder on error
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type for {filename}. Only PDF and Images are accepted."
            )

        unique_name = f"{uuid.uuid4()}_{filename}"
        temp_path = os.path.join(temp_dir, unique_name)

        try:
            with open(temp_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail=f"Failed to save temp file: {e}")

        # Run OCR
        raw_text, ocr_engine, confidence = ocr_service.run_ocr(temp_path)
        combined_raw_texts.append(raw_text)

        uploaded_files_info.append({
            "filename": filename,
            "temp_path": temp_path,
            "raw_text": raw_text,
            "ocr_engine": ocr_engine,
            "confidence": confidence
        })

    # Join OCR texts
    joined_text = "\n\n".join(combined_raw_texts)

    # Process through LLM to extract structured demographics
    template = load_prompt_template("ocr_to_structured_data.txt")
    prompt = template.replace("{ocr_text}", joined_text)
    system_instruction = (
        "You are a medical record analyzer. "
        "Extract diagnoses, medications, lab values, and metadata into strict JSON."
    )
    structured: OCRStructuredData = llm_client.extract_structured(
        prompt=prompt,
        response_model=OCRStructuredData,
        system_instruction=system_instruction
    )

    # Prepare extraction fields and confidence
    fields = structured.model_dump()
    confidence_dict = fields.pop("extraction_confidence") or {}

    # Save to staging database table
    draft = PatientRegistrationDraft(
        id=draft_id,
        status="pending_review",
        created_at=datetime.now()
    )
    draft.uploaded_files = uploaded_files_info
    draft.extracted_fields = fields
    draft.extraction_confidence = confidence_dict

    db.add(draft)
    await db.commit()

    # Trigger background cleanup task to purge expired drafts/discrepancies
    background_tasks.add_task(cleanup_stale_records_task)

    return {
        "draft_id": draft_id,
        "extracted_fields": fields,
        "extraction_confidence": confidence_dict,
        "files": [{"filename": f["filename"]} for f in uploaded_files_info]
    }

@router.get("/register/drafts/{draft_id}")
async def get_registration_draft(
    draft_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_reception)
):
    result = await db.execute(select(PatientRegistrationDraft).filter(PatientRegistrationDraft.id == draft_id))
    draft = result.scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Registration draft not found.")
    
    return {
        "id": draft.id,
        "status": draft.status,
        "extracted_fields": draft.extracted_fields,
        "extraction_confidence": draft.extraction_confidence,
        "files": [{"filename": f["filename"]} for f in draft.uploaded_files],
        "created_at": draft.created_at
    }

@router.post("/register/drafts/{draft_id}/confirm", response_model=PatientResponse)
async def confirm_registration_draft(
    draft_id: str,
    body: DraftConfirmRequest,
    force: bool = Query(False),
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_reception)
):
    # Fetch draft
    draft_res = await db.execute(select(PatientRegistrationDraft).filter(PatientRegistrationDraft.id == draft_id))
    draft = draft_res.scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Registration draft not found.")

    if draft.status != "pending_review":
        raise HTTPException(status_code=400, detail=f"Draft is in {draft.status} status and cannot be confirmed.")

    # Parse date_of_birth robustly
    dob_str = body.date_of_birth.strip()
    if not dob_str:
        raise HTTPException(status_code=400, detail="Date of birth is required.")
        
    parsed_dob = None
    # Support clean date components extraction (removing ISO timezone details like T00:00:00.000Z)
    clean_dob_str = dob_str.split("T")[0].split(" ")[0]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d-%m-%Y", "%Y.%m.%d"):
        try:
            parsed_dob = datetime.strptime(clean_dob_str, fmt).date()
            break
        except ValueError:
            continue
            
    if not parsed_dob:
        try:
            from dateutil import parser
            parsed_dob = parser.parse(dob_str).date()
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid date format for birth date: '{body.date_of_birth}'. Please enter date as YYYY-MM-DD."
            )

    # Check duplicates if force=False
    if not force:
        # Phone duplicate check
        phone_match = (await db.execute(select(Patient).filter(Patient.phone == body.phone))).scalars().first()
        if phone_match:
            raise HTTPException(
                status_code=409,
                detail=f"Conflict: A patient with phone '{body.phone}' is already registered (ID: {phone_match.id}, Name: {phone_match.full_name})."
            )

        # Name + DOB duplicate check
        name_dob_match = (await db.execute(
            select(Patient).filter(
                Patient.full_name.ilike(body.full_name),
                Patient.date_of_birth == parsed_dob
            )
        )).scalars().first()
        if name_dob_match:
            raise HTTPException(
                status_code=409,
                detail=f"Conflict: A potential duplicate patient is already registered with Name '{body.full_name}' and DOB '{parsed_dob}' (ID: {name_dob_match.id})."
            )

    # Create Patient
    patient = Patient(
        full_name=body.full_name,
        date_of_birth=parsed_dob,
        gender=body.gender,
        phone=body.phone,
        address=body.address,
        emergency_contact_name=body.emergency_contact_name,
        emergency_contact_phone=body.emergency_contact_phone,
        blood_group=body.blood_group
    )
    patient.allergies = body.allergies
    db.add(patient)
    await db.flush() # Generate patient.id

    # Move files and create MedicalRecords
    files_info = draft.uploaded_files
    for file_info in files_info:
        temp_path = file_info["temp_path"]
        filename = file_info["filename"]
        raw_text = file_info["raw_text"]
        ocr_engine = file_info["ocr_engine"]
        confidence = file_info["confidence"]

        if not os.path.exists(temp_path):
            continue

        patient_records_dir = os.path.join(settings.STORAGE_DIR, "patients", str(patient.id), "records")
        os.makedirs(patient_records_dir, exist_ok=True)

        unique_filename = os.path.basename(temp_path)
        dest_path = os.path.join(patient_records_dir, unique_filename)

        try:
            shutil.move(temp_path, dest_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to move document to patient storage: {e}")

        rel_path = os.path.relpath(dest_path, settings.STORAGE_DIR).replace("\\", "/")

        db_rec = MedicalRecord(
            patient_id=patient.id,
            file_path=rel_path,
            file_type=os.path.splitext(filename)[1].replace(".", ""),
            original_filename=filename,
            uploaded_by=current_user.full_name
        )
        db.add(db_rec)
        await db.flush()

        # Save OCRRecord
        db_ocr = OCRRecord(
            medical_record_id=db_rec.id,
            patient_id=patient.id,
            ocr_engine_used=ocr_engine,
            confidence_score=confidence
        )
        db_ocr.raw_text = raw_text
        # Map original LLM structured output to OCRStructuredData model structure
        fields = draft.extracted_fields
        db_ocr.structured_data = fields
        db.add(db_ocr)
        await db.flush()

        # Chroma vector indexing for this record
        chunks = []
        structured_summary = (
            f"Document Diagnoses: {', '.join(fields.get('diagnoses', []))}\n"
            f"Document Medications: {', '.join(fields.get('medications', []))}\n"
            f"Document Labs: {str(fields.get('lab_values', []))}\n"
            f"Document Dates: {', '.join(fields.get('dates', []))}"
        )
        chunks.append(structured_summary)

        raw_paragraphs = [p.strip() for p in raw_text.split("\n\n") if len(p.strip()) > 30]
        for p in raw_paragraphs:
            chunks.append(f"Source Document excerpt: {p}")
        if not chunks:
            chunks.append(f"Source Document text excerpt: {raw_text[:800]}")

        metadatas = []
        doc_ids = []
        for i, chunk in enumerate(chunks):
            doc_id = f"ocr_{db_ocr.id}_{i}"
            meta = {
                "source_type": "ocr_record",
                "source_id": db_ocr.id,
                "patient_id": patient.id,
                "original_filename": filename,
                "created_at": datetime.now().isoformat()
            }
            metadatas.append(meta)
            doc_ids.append(doc_id)

            db_emb = Embedding(
                patient_id=patient.id,
                source_type="ocr_record",
                source_id=db_ocr.id,
                chroma_collection_name=rag_service._get_collection_name(patient.id),
                chroma_document_id=doc_id
            )
            db_emb.chunk_text = chunk
            db.add(db_emb)

        rag_service.add_patient_documents(
            patient_id=patient.id,
            texts=chunks,
            metadatas=metadatas,
            document_ids=doc_ids
        )

    # Clean up temp folder
    shutil.rmtree(os.path.dirname(files_info[0]["temp_path"]), ignore_errors=True)

    # Update draft status
    draft.status = "confirmed"
    draft.reviewed_by = current_user.id
    draft.reviewed_at = datetime.now()

    # Timeline event
    timeline_evt = Timeline(
        patient_id=patient.id,
        event_type="registration",
        event_summary="Patient profile created via document-first registration review.",
        event_date=datetime.now()
    )
    db.add(timeline_evt)

    # Audit log
    await log_audit_action(db, current_user.email, "CREATE", "Patient", patient.id)
    await db.commit()

    return patient
