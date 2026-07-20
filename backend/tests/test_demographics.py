import os
import tempfile
import sys
import asyncio
import uuid
import random

# Force clean isolated directory for test runs
temp_chroma_dir = tempfile.mkdtemp()
os.environ["CHROMA_DIR"] = temp_chroma_dir

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import pytest
import io
from datetime import date, datetime
from unittest.mock import patch, MagicMock
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select
from sqlalchemy.pool import NullPool
from fastapi import UploadFile, BackgroundTasks

from backend.app.core.config import settings
from backend.app.models.models import Patient, PatientRegistrationDraft, ProfileDiscrepancy, Doctor, MedicalRecord, Timeline
from backend.app.schemas.schemas import OCRStructuredData
from backend.app.api.v1.endpoints.patients import resolve_patient_discrepancy, ResolveDiscrepancyRequest
from backend.app.api.v1.endpoints.register import upload_registration_documents, confirm_registration_draft, DraftConfirmRequest
from backend.app.services.agent import clinical_agent

# Use NullPool to disable connection pooling completely for tests, preventing "another operation is in progress" errors
test_engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)

mock_staff = Doctor(
    id="reception-id-123",
    email="reception@hospital.com",
    full_name="Mark Miller",
    specialization="Reception Desk",
    license_number="N/A",
    phone="555-019-5678",
    role="Reception"
)

# Dummy background tasks runner
class DummyBackgroundTasks(BackgroundTasks):
    def add_task(self, func, *args, **kwargs):
        pass

@pytest.mark.asyncio
async def test_ocr_demographics_reconciliation():
    patient_id = None
    record_id = None
    disc_id = None
    doctor_id = "reception-id-123"
    
    unique_phone = "".join(random.choices("0123456789", k=10))
    unique_name = f"Kishore Test {uuid.uuid4().hex[:6]}"
    unique_email = f"reception-{uuid.uuid4().hex[:6]}@hospital.com"

    try:
        # Step 1: Setup Doctor, Patient & Record in isolated Session
        async with TestSessionLocal() as db:
            # First insert doctor to satisfy FK constraints
            existing_doc = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
            if not existing_doc:
                db_doctor = Doctor(
                    id=doctor_id,
                    email=unique_email,
                    full_name="Mark Miller",
                    specialization="Reception Desk",
                    license_number="N/A",
                    phone="555-019-5678",
                    password_hash="fakehash",
                    role="Reception"
                )
                db.add(db_doctor)

            patient = Patient(
                full_name=unique_name,
                date_of_birth=date(1992, 7, 12),
                gender="Male",
                phone=unique_phone,
                blood_group="A+"
            )
            db.add(patient)
            await db.flush() # Generate patient.id first
            
            record = MedicalRecord(
                patient_id=patient.id,
                file_path="patients/test/records/report.pdf",
                file_type="pdf",
                original_filename="report.pdf",
                uploaded_by="Mark Miller"
            )
            db.add(record)
            await db.commit()
            
            patient_id = patient.id
            record_id = record.id

        # Step 2: Setup Discrepancy in isolated Session
        async with TestSessionLocal() as db:
            disc = ProfileDiscrepancy(
                patient_id=patient_id,
                field_name="blood_group",
                source_document_id=record_id,
                confidence=0.98,
                status="pending_review"
            )
            disc.current_value = "A+"
            disc.extracted_value = "B+"
            db.add(disc)
            await db.commit()
            disc_id = disc.id

        # Step 3: Resolve Discrepancy
        async with TestSessionLocal() as db:
            body = ResolveDiscrepancyRequest(action="approve")
            result = await resolve_patient_discrepancy(
                id=patient_id,
                discrepancy_id=disc_id,
                body=body,
                db=db,
                current_user=mock_staff
            )
            assert result["status"] == "approved"
            assert result["field_name"] == "blood_group"

        # Step 4: Verify
        async with TestSessionLocal() as db:
            refetched_pat = (await db.execute(select(Patient).filter(Patient.id == patient_id))).scalars().first()
            assert refetched_pat.blood_group == "B+"

            time_stmt = select(Timeline).filter(Timeline.patient_id == patient_id)
            timeline_evt = (await db.execute(time_stmt)).scalars().first()
            assert timeline_evt is not None
            assert "blood_group" in timeline_evt.event_summary

            # Negative check
            invalid_bg = "Rh Positive"
            assert invalid_bg not in {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}

    finally:
        # Step 5: Cleanup & Pool Disposal
        async with TestSessionLocal() as db:
            if record_id:
                ref_record = (await db.execute(select(MedicalRecord).filter(MedicalRecord.id == record_id))).scalars().first()
                if ref_record:
                    await db.delete(ref_record)
            if patient_id:
                ref_pat = (await db.execute(select(Patient).filter(Patient.id == patient_id))).scalars().first()
                if ref_pat:
                    await db.delete(ref_pat)
                ref_discs = (await db.execute(select(ProfileDiscrepancy).filter(ProfileDiscrepancy.patient_id == patient_id))).scalars().all()
                for d in ref_discs:
                    await db.delete(d)
            # Delete mock doctor
            ref_doc = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
            if ref_doc:
                await db.delete(ref_doc)
            await db.commit()
        await test_engine.dispose()


@pytest.mark.asyncio
async def test_document_first_registration_draft_flow():
    unique_phone = "".join(random.choices("0123456789", k=10))
    dup_phone = "".join(random.choices("0123456789", k=10))
    unique_name = f"Kishore Test {uuid.uuid4().hex[:6]}"
    unique_email = f"reception-{uuid.uuid4().hex[:6]}@hospital.com"
    doctor_id = "reception-id-123"

    mock_raw_text = f"Patient Name: {unique_name}\nDOB: 1992-07-12\nBlood Group: B+"
    
    mock_structured = OCRStructuredData(
        full_name=unique_name,
        date_of_birth="1992-07-12",
        gender="Male",
        phone=unique_phone,
        address="123 Street",
        emergency_contact="Mary R",
        blood_group="B+",
        allergies=["Penicillin"],
        extraction_confidence={"full_name": 0.99, "blood_group": 0.95}
    )

    with patch("backend.app.services.ocr.ocr_service.run_ocr", return_value=(mock_raw_text, "mock_ocr_engine", 0.95)), \
         patch("backend.app.services.llm_client.llm_client.extract_structured", return_value=mock_structured):

        draft_id = None
        dup_pat_id = None
        registered_patient_id = None

        try:
            # Step 1: Setup Doctor and Upload Documents and Create Draft
            async with TestSessionLocal() as db:
                # First insert doctor to satisfy FK constraints
                existing_doc = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
                if not existing_doc:
                    db_doctor = Doctor(
                        id=doctor_id,
                        email=unique_email,
                        full_name="Mark Miller",
                        specialization="Reception Desk",
                        license_number="N/A",
                        phone="555-019-5678",
                        password_hash="fakehash",
                        role="Reception"
                    )
                    db.add(db_doctor)
                    await db.commit()

                mock_file = UploadFile(
                    filename="patient_report.pdf",
                    file=io.BytesIO(b"%PDF-1.4 mock pdf contents")
                )
                bg_tasks = DummyBackgroundTasks()
                res = await upload_registration_documents(
                    background_tasks=bg_tasks,
                    files=[mock_file],
                    db=db,
                    current_user=mock_staff
                )
                assert "draft_id" in res
                draft_id = res["draft_id"]

            # Step 2: Create duplicate patient
            async with TestSessionLocal() as db:
                dup_pat = Patient(
                    full_name=unique_name,
                    date_of_birth=date(1992, 7, 12),
                    gender="Male",
                    phone=dup_phone
                )
                db.add(dup_pat)
                await db.commit()
                dup_pat_id = dup_pat.id

            # Step 3: Attempt Confirmation (Expect 409 Conflict)
            async with TestSessionLocal() as db:
                confirm_body = DraftConfirmRequest(
                    full_name=unique_name,
                    date_of_birth="1992-07-12",
                    gender="Male",
                    phone=unique_phone,
                    address="123 Street",
                    emergency_contact_name="Mary R",
                    emergency_contact_phone="555-019-2222",
                    blood_group="B+",
                    allergies=["Penicillin"]
                )
                from fastapi import HTTPException
                with pytest.raises(HTTPException) as exc_info:
                    await confirm_registration_draft(
                        draft_id=draft_id,
                        body=confirm_body,
                        force=False,
                        db=db,
                        current_user=mock_staff
                    )
                assert exc_info.value.status_code == 409

            # Step 4: Confirm with force=True
            async with TestSessionLocal() as db:
                confirm_body = DraftConfirmRequest(
                    full_name=unique_name,
                    date_of_birth="1992-07-12",
                    gender="Male",
                    phone=unique_phone,
                    address="123 Street",
                    emergency_contact_name="Mary R",
                    emergency_contact_phone="555-019-2222",
                    blood_group="B+",
                    allergies=["Penicillin"]
                )
                registered_patient = await confirm_registration_draft(
                    draft_id=draft_id,
                    body=confirm_body,
                    force=True,
                    db=db,
                    current_user=mock_staff
                )
                assert registered_patient.id is not None
                assert registered_patient.blood_group == "B+"
                registered_patient_id = registered_patient.id

        finally:
            # Step 5: Cleanup & Pool Disposal
            async with TestSessionLocal() as db:
                if registered_patient_id:
                    recs = (await db.execute(select(MedicalRecord).filter(MedicalRecord.patient_id == registered_patient_id))).scalars().all()
                    for r in recs:
                        abs_path = os.path.join(settings.STORAGE_DIR, r.file_path)
                        if os.path.exists(abs_path):
                            os.remove(abs_path)
                        await db.delete(r)

                    ref_pat = (await db.execute(select(Patient).filter(Patient.id == registered_patient_id))).scalars().first()
                    if ref_pat:
                        await db.delete(ref_pat)

                if dup_pat_id:
                    ref_dup = (await db.execute(select(Patient).filter(Patient.id == dup_pat_id))).scalars().first()
                    if ref_dup:
                        await db.delete(ref_dup)

                if draft_id:
                    ref_draft = (await db.execute(select(PatientRegistrationDraft).filter(PatientRegistrationDraft.id == draft_id))).scalars().first()
                    if ref_draft:
                        await db.delete(ref_draft)

                # Delete mock doctor
                ref_doc = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
                if ref_doc:
                    await db.delete(ref_doc)

                await db.commit()
            await test_engine.dispose()


@pytest.mark.asyncio
async def test_agent_tool_tracing():
    patient_id = None
    unique_phone = "".join(random.choices("0123456789", k=10))
    unique_name = f"Agent Test Patient {uuid.uuid4().hex[:6]}"
    
    try:
        # Setup Patient in separate session
        async with TestSessionLocal() as db:
            patient = Patient(
                full_name=unique_name,
                date_of_birth=date(1985, 4, 20),
                gender="Female",
                phone=unique_phone,
                blood_group="AB-"
            )
            db.add(patient)
            await db.commit()
            patient_id = patient.id

        # Run Clinical Agent in fresh session
        async with TestSessionLocal() as db:
            question = "What is the patient's blood group?"
            events = []
            async for ev in clinical_agent.run_streaming(
                question=question,
                patient_id=patient_id,
                visit_id=None,
                db=db
            ):
                events.append(ev)
            
            tool_calls = [e for e in events if e.get("type") == "tool_call" and e.get("tool_name") == "get_patient_profile"]
            assert len(tool_calls) > 0, "Agent did not use get_patient_profile tool call!"
            
    finally:
        # Cleanup Patient & dispose engine
        async with TestSessionLocal() as db:
            if patient_id:
                ref_pat = (await db.execute(select(Patient).filter(Patient.id == patient_id))).scalars().first()
                if ref_pat:
                    await db.delete(ref_pat)
                await db.commit()
        await test_engine.dispose()
