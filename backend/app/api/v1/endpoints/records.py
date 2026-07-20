import os
import uuid
import shutil
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from backend.app.core.deps import get_db_session, require_reception, require_any_role
from backend.app.core.config import settings
from backend.app.models.models import MedicalRecord, Patient, OCRRecord, Embedding, Timeline, Doctor, ProfileDiscrepancy
from backend.app.schemas.schemas import MedicalRecordResponse, OCRRecordResponse, OCRStructuredData
from backend.app.services.ocr import ocr_service
from backend.app.services.llm_client import llm_client
from backend.app.services.rag import rag_service
from backend.app.core.prompts import load_prompt_template
from backend.app.api.v1.endpoints.patients import log_audit_action

router = APIRouter()

@router.post("/patients/{patient_id}/records", response_model=MedicalRecordResponse)
async def upload_medical_record(
    patient_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_reception)
):
    # Verify patient exists
    result = await db.execute(select(Patient).filter(Patient.id == patient_id))
    patient = result.scalars().first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Validate file type
    filename = file.filename or "record.dat"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Only PDF and Image files (PNG, JPG, JPEG, TIFF, BMP) are accepted."
        )

    # Local storage path structure: /storage/patients/{patient_id}/records/
    patient_records_dir = os.path.join(settings.STORAGE_DIR, "patients", str(patient_id), "records")
    os.makedirs(patient_records_dir, exist_ok=True)
    
    # Prepend UUID to avoid file collisions
    unique_filename = f"{uuid.uuid4()}_{filename}"
    abs_file_path = os.path.join(patient_records_dir, unique_filename)
    
    # Save the file
    try:
        with open(abs_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write record file: {e}")

    # Relative path for database
    rel_file_path = os.path.relpath(abs_file_path, settings.STORAGE_DIR).replace("\\", "/")

    # Create MedicalRecord entry
    db_record = MedicalRecord(
        patient_id=patient_id,
        file_path=rel_file_path,
        file_type=ext.replace(".", ""),
        original_filename=filename,
        uploaded_by=current_user.full_name
    )
    db_record.ocr_record = None
    db.add(db_record)
    await db.flush()

    # Timeline entry
    timeline_evt = Timeline(
        patient_id=patient_id,
        event_type="upload",
        event_summary=f"Uploaded medical record: '{filename}' ({db_record.file_type.upper()}).",
        reference_id=db_record.id,
        event_date=datetime.now()
    )
    db.add(timeline_evt)

    # Audit log
    await log_audit_action(db, current_user.email, "CREATE", "MedicalRecord", db_record.id)
    await db.commit()

    return db_record

@router.get("/patients/{patient_id}/records", response_model=List[MedicalRecordResponse])
async def list_medical_records(
    patient_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_any_role)
):
    stmt = select(MedicalRecord).filter(MedicalRecord.patient_id == patient_id).options(selectinload(MedicalRecord.ocr_record)).order_by(MedicalRecord.uploaded_at.desc())
    result = await db.execute(stmt)
    records = result.scalars().all()

    # Enrich each record with disk availability
    response = []
    for rec in records:
        abs_path = os.path.join(settings.STORAGE_DIR, rec.file_path)
        rec_dict = {
            "id": rec.id,
            "patient_id": rec.patient_id,
            "file_path": rec.file_path,
            "file_type": rec.file_type,
            "original_filename": rec.original_filename,
            "uploaded_by": rec.uploaded_by,
            "uploaded_at": rec.uploaded_at,
            "ocr_record": rec.ocr_record,
            "file_available": os.path.exists(abs_path),
        }
        response.append(rec_dict)
    return response

@router.get("/records/{id}/view")
async def view_medical_record(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_any_role)
):
    result = await db.execute(select(MedicalRecord).filter(MedicalRecord.id == id))
    record = result.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")

    abs_path = os.path.join(settings.STORAGE_DIR, record.file_path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=410, detail="File no longer available on disk. Please re-upload this document.")

    # Determine media type for inline viewing
    ext = os.path.splitext(record.original_filename)[1].lower()
    media_type_map = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".tiff": "image/tiff",
        ".bmp": "image/bmp",
    }
    media_type = media_type_map.get(ext, "application/octet-stream")

    return FileResponse(
        path=abs_path,
        media_type=media_type,
        filename=record.original_filename,
        headers={"Content-Disposition": f"inline; filename=\"{record.original_filename}\""}
    )

@router.delete("/records/{id}")
async def delete_medical_record(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_reception)
):
    result = await db.execute(select(MedicalRecord).filter(MedicalRecord.id == id))
    record = result.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")

    # Delete physical file
    abs_path = os.path.join(settings.STORAGE_DIR, record.file_path)
    if os.path.exists(abs_path):
        try:
            os.remove(abs_path)
        except Exception as e:
            print(f"Error removing physical file {abs_path}: {e}")

    await log_audit_action(db, current_user.email, "DELETE", "MedicalRecord", id)
    await db.delete(record)
    await db.commit()
    return {"detail": "Medical record deleted successfully"}

async def cleanup_stale_records_task():
    """
    Cleans up PatientRegistrationDraft and ProfileDiscrepancy records older than 30 days.
    Deletes physical temp files of draft registrations.
    """
    from backend.app.core.database import SessionLocal
    from backend.app.models.models import PatientRegistrationDraft, ProfileDiscrepancy
    from datetime import datetime, timedelta
    cutoff = datetime.now() - timedelta(days=30)
    
    async with SessionLocal() as session:
        try:
            # 1. Stale drafts
            drafts_result = await session.execute(
                select(PatientRegistrationDraft)
                .filter(
                    PatientRegistrationDraft.status == "pending_review",
                    PatientRegistrationDraft.created_at < cutoff
                )
            )
            stale_drafts = drafts_result.scalars().all()
            for draft in stale_drafts:
                # Delete temp files
                files = draft.uploaded_files
                for f in files:
                    tpath = f.get("temp_path")
                    if tpath and os.path.exists(tpath):
                        try:
                            os.remove(tpath)
                        except Exception as e:
                            print(f"Failed to remove temp file during cleanup: {e}")
                if files:
                    tpath = files[0].get("temp_path")
                    if tpath:
                        tdir = os.path.dirname(tpath)
                        if os.path.exists(tdir) and not os.listdir(tdir):
                            try:
                                os.rmdir(tdir)
                            except Exception:
                                pass
                draft.status = "rejected"
                
            # 2. Stale discrepancies
            discrepancies_result = await session.execute(
                select(ProfileDiscrepancy)
                .filter(
                    ProfileDiscrepancy.status == "pending_review",
                    ProfileDiscrepancy.created_at < cutoff
                )
            )
            stale_discrepancies = discrepancies_result.scalars().all()
            for disc in stale_discrepancies:
                disc.status = "rejected"
                
            await session.commit()
        except Exception as e:
            print(f"Error in cleanup task: {e}")

@router.post("/records/{id}/ocr", response_model=OCRRecordResponse)
async def process_record_ocr(
    id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_reception)
):
    # Fetch medical record
    result = await db.execute(select(MedicalRecord).filter(MedicalRecord.id == id).options(selectinload(MedicalRecord.ocr_record)))
    record = result.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")

    if record.ocr_record:
        # Already processed OCR
        return record.ocr_record

    # Perform OCR
    abs_file_path = os.path.join(settings.STORAGE_DIR, record.file_path)
    if not os.path.exists(abs_file_path):
        raise HTTPException(status_code=404, detail="Original record file not found on disk")

    raw_text, ocr_engine, confidence = ocr_service.run_ocr(abs_file_path)
    
    # Process through LLM to extract structured data
    template = load_prompt_template("ocr_to_structured_data.txt")
    prompt = template.replace("{ocr_text}", raw_text)
    system_instruction = (
        "You are a medical record analyzer. "
        "Extract diagnoses, medications, lab values, and metadata into strict JSON."
    )
    structured: OCRStructuredData = llm_client.extract_structured(
        prompt=prompt,
        response_model=OCRStructuredData,
        system_instruction=system_instruction
    )

    # Save OCR Record
    db_ocr = OCRRecord(
        medical_record_id=record.id,
        patient_id=record.patient_id,
        ocr_engine_used=ocr_engine,
        confidence_score=confidence
    )
    db_ocr.raw_text = raw_text # enters via encryption
    db_ocr.structured_data = structured.model_dump() # enters via encryption
    db.add(db_ocr)
    await db.flush()

    # Demographic reconciliation for existing patients
    from sqlalchemy.exc import IntegrityError
    
    p_result = await db.execute(select(Patient).filter(Patient.id == record.patient_id))
    patient = p_result.scalars().first()
    if patient:
        fields_to_check = []
        
        # 1. blood_group
        if structured.blood_group:
            bg = structured.blood_group.strip().upper()
            if bg in {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}:
                fields_to_check.append(("blood_group", patient.blood_group, bg))
                
        # 2. full_name
        if structured.full_name:
            fn = structured.full_name.strip()
            if fn:
                fields_to_check.append(("full_name", patient.full_name, fn))
                
        # 3. date_of_birth
        if structured.date_of_birth:
            dob_str = structured.date_of_birth.strip()
            try:
                datetime.strptime(dob_str, "%Y-%m-%d")
                curr_dob_str = patient.date_of_birth.strftime("%Y-%m-%d") if patient.date_of_birth else None
                fields_to_check.append(("date_of_birth", curr_dob_str, dob_str))
            except ValueError:
                pass
                
        # 4. gender
        if structured.gender:
            g = structured.gender.strip()
            if g:
                fields_to_check.append(("gender", patient.gender, g))
                
        # 5. phone
        if structured.phone:
            import re
            cleaned_phone = re.sub(r"\D", "", structured.phone.strip())
            if 7 <= len(cleaned_phone) <= 15:
                fields_to_check.append(("phone", patient.phone, cleaned_phone))
                
        # 6. address
        if structured.address:
            addr = structured.address.strip()
            if addr:
                fields_to_check.append(("address", patient.address, addr))
                
        # 7. emergency_contact (map to emergency_contact_name)
        if structured.emergency_contact:
            ec = structured.emergency_contact.strip()
            if ec:
                fields_to_check.append(("emergency_contact_name", patient.emergency_contact_name, ec))
                
        # 8. allergies
        if structured.allergies:
            ext_allergies = sorted([a.strip() for a in structured.allergies if a.strip()])
            curr_allergies = sorted(patient.allergies or [])
            if ext_allergies != curr_allergies:
                fields_to_check.append(("allergies", ", ".join(curr_allergies), ", ".join(ext_allergies)))
                
        for field_name, current_val, extracted_val in fields_to_check:
            c_norm = (current_val or "").strip().lower()
            e_norm = (extracted_val or "").strip().lower()
            if c_norm != e_norm:
                # Discrepancy found!
                conf = None
                if structured.extraction_confidence and isinstance(structured.extraction_confidence, dict):
                    conf_val = structured.extraction_confidence.get(field_name)
                    if conf_val is None and field_name == "emergency_contact_name":
                        conf_val = structured.extraction_confidence.get("emergency_contact")
                    if conf_val is not None:
                        try:
                            conf = float(conf_val)
                        except (ValueError, TypeError):
                            pass
                
                # Check for existing pending discrepancy
                exist_stmt = select(ProfileDiscrepancy).filter(
                    ProfileDiscrepancy.patient_id == patient.id,
                    ProfileDiscrepancy.field_name == field_name,
                    ProfileDiscrepancy.status == "pending_review"
                )
                
                # Try application-level deduplication
                existing_disc = (await db.execute(exist_stmt)).scalars().first()
                if existing_disc:
                    existing_disc.extracted_value = extracted_val
                    existing_disc.source_document_id = record.id
                    existing_disc.confidence = conf
                    existing_disc.created_at = datetime.now()
                else:
                    # Catch constraint violation at database level via savepoint nested transaction
                    try:
                        async with db.begin_nested():
                            new_disc = ProfileDiscrepancy(
                                patient_id=patient.id,
                                field_name=field_name,
                                source_document_id=record.id,
                                confidence=conf,
                                status="pending_review",
                                created_at=datetime.now()
                            )
                            new_disc.current_value = current_val
                            new_disc.extracted_value = extracted_val
                            db.add(new_disc)
                            await db.flush()
                    except IntegrityError:
                        # Conflict occurred, fall back to update the existing record
                        existing_disc = (await db.execute(exist_stmt)).scalars().first()
                        if existing_disc:
                            existing_disc.extracted_value = extracted_val
                            existing_disc.source_document_id = record.id
                            existing_disc.confidence = conf
                            existing_disc.created_at = datetime.now()

    # Trigger background cleanup job
    background_tasks.add_task(cleanup_stale_records_task)

    # Dynamic chunking of OCR Text for ChromaDB RAG
    # We chunk by paragraph/newlines or fixed blocks.
    chunks = []
    
    # Chunk 1: Structured medical profile summary
    structured_summary = (
        f"Document Diagnoses: {', '.join(structured.diagnoses)}\n"
        f"Document Medications: {', '.join(structured.medications)}\n"
        f"Document Labs: {str(structured.lab_values)}\n"
        f"Document Dates: {', '.join(structured.dates)}"
    )
    chunks.append(structured_summary)
    
    # Chunks 2+: Split raw OCR text by paragraphs
    raw_paragraphs = [p.strip() for p in raw_text.split("\n\n") if len(p.strip()) > 30]
    for p in raw_paragraphs:
        chunks.append(f"Source Document excerpt: {p}")
        
    if not chunks:
        chunks.append(f"Source Document text excerpt: {raw_text[:800]}")

    # Embed and index ONLY in this patient's vector collection
    metadatas = []
    doc_ids = []
    
    for i, chunk in enumerate(chunks):
        doc_id = f"ocr_{db_ocr.id}_{i}"
        meta = {
            "source_type": "ocr_record",
            "source_id": db_ocr.id,
            "patient_id": record.patient_id,
            "original_filename": record.original_filename,
            "created_at": datetime.now().isoformat()
        }
        metadatas.append(meta)
        doc_ids.append(doc_id)
        
        # Save embedding record in relational DB as well
        db_emb = Embedding(
            patient_id=record.patient_id,
            source_type="ocr_record",
            source_id=db_ocr.id,
            chroma_collection_name=rag_service._get_collection_name(record.patient_id),
            chroma_document_id=doc_id
        )
        db_emb.chunk_text = chunk
        db.add(db_emb)

    # Insert into ChromaDB collection
    rag_service.add_patient_documents(
        patient_id=record.patient_id,
        texts=chunks,
        metadatas=metadatas,
        document_ids=doc_ids
    )

    # Timeline event
    diagnoses_summary = f", Diagnoses: {', '.join(structured.diagnoses[:3])}" if structured.diagnoses else ""
    meds_summary = f", Meds: {', '.join(structured.medications[:3])}" if structured.medications else ""
    summary = f"Processed OCR for '{record.original_filename}' via {ocr_engine}{diagnoses_summary}{meds_summary}."
    
    timeline_evt = Timeline(
        patient_id=record.patient_id,
        event_type="note",
        event_summary=summary,
        reference_id=record.id,
        event_date=datetime.now()
    )
    db.add(timeline_evt)
    
    await db.commit()
    return db_ocr

@router.get("/records/{id}/ocr-result", response_model=OCRRecordResponse)
async def get_ocr_result(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_any_role)
):
    result = await db.execute(select(OCRRecord).filter(OCRRecord.medical_record_id == id))
    ocr = result.scalars().first()
    if not ocr:
        raise HTTPException(status_code=404, detail="OCR details not found or not yet processed for this record")
    return ocr
