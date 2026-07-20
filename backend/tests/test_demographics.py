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
from backend.app.models.models import Patient, PatientRegistrationDraft, ProfileDiscrepancy, Doctor, MedicalRecord, Timeline, Visit, OCRRecord, Prescription
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


@pytest.mark.asyncio
async def test_vitals_and_labs_trends():
    from datetime import timedelta
    patient_id = None
    doctor_id = "doctor-test-123"
    visit_id = None

    try:
        # Step 1: Create Doctor, Patient & Vitals Data
        async with TestSessionLocal() as db:
            existing_doc = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
            if not existing_doc:
                unique_doc_phone = "".join(random.choices("0123456789", k=10))
                db_doctor = Doctor(
                    id=doctor_id,
                    email=f"doc-{uuid.uuid4().hex[:6]}@hospital.com",
                    full_name="Dr. Test",
                    specialization="General Medicine",
                    license_number="TEST-123",
                    phone=unique_doc_phone,
                    password_hash="fakehash",
                    role="Doctor"
                )
                db.add(db_doctor)

            unique_pat_phone = "".join(random.choices("0123456789", k=10))
            patient = Patient(
                full_name="Kishore Test Vitals",
                date_of_birth=date(1992, 7, 12),
                gender="Male",
                phone=unique_pat_phone,
                blood_group="B+"
            )
            db.add(patient)
            await db.flush()
            patient_id = patient.id

            # Create a manual Visit record with Vitals on Day 2
            visit = Visit(
                patient_id=patient_id,
                doctor_id=doctor_id,
                chief_complaint="Routine checkup",
                status="completed",
                visit_date=datetime.utcnow() - timedelta(days=2)
            )
            visit.vitals = {"bp": "120/80", "hr": "72", "temp": "98.6", "weight": "70", "spo2": "98"}
            db.add(visit)
            await db.flush()
            visit_id = visit.id

            # Create MedicalRecord 1
            med_rec1 = MedicalRecord(
                patient_id=patient_id,
                file_path="records/test1.pdf",
                file_type="pdf",
                original_filename="test1.pdf",
                uploaded_by="System"
            )
            db.add(med_rec1)
            await db.flush()

            # Create a duplicate OCR record on Day 2 (should be overridden by manual Visit entry)
            ocr_same_day = OCRRecord(
                patient_id=patient_id,
                medical_record_id=med_rec1.id,
                ocr_engine_used="EasyOCR",
                confidence_score=0.95,
                created_at=datetime.utcnow() - timedelta(days=2)
            )
            ocr_same_day.structured_data = {
                "lab_values": [
                    {"name": "Heart Rate", "value": "80 bpm", "unit": ""},
                    {"name": "Hemoglobin A1c (HbA1c)", "value": "7.4", "unit": "%"}
                ]
            }
            db.add(ocr_same_day)

            # Create MedicalRecord 2
            med_rec2 = MedicalRecord(
                patient_id=patient_id,
                file_path="records/test2.pdf",
                file_type="pdf",
                original_filename="test2.pdf",
                uploaded_by="System"
            )
            db.add(med_rec2)
            await db.flush()

            # Create a second OCR record on Day 5 to verify timeline trend
            ocr_diff_day = OCRRecord(
                patient_id=patient_id,
                medical_record_id=med_rec2.id,
                ocr_engine_used="EasyOCR",
                confidence_score=0.95,
                created_at=datetime.utcnow() - timedelta(days=5)
            )
            ocr_diff_day.structured_data = {
                "lab_values": [
                    {"name": "Hemoglobin A1c (HbA1c)", "value": "6.8", "unit": "%"}
                ]
            }
            db.add(ocr_diff_day)

            await db.commit()

        # Step 2: Query vitals and verify deduplication
        from backend.app.api.v1.endpoints.patients import get_patient_vitals, get_patient_lab_history
        async with TestSessionLocal() as db:
            # Query heart rate
            hr_vitals = await get_patient_vitals(
                id=patient_id,
                metric="heart_rate",
                range="30d",
                db=db,
                current_user=mock_staff
            )
            # Deduplication should yield exactly 1 entry for Day 2, prioritizing the manual value (72.0)
            assert len(hr_vitals) == 1
            assert hr_vitals[0]["value"] == 72.0

            # Query blood pressure
            bp_vitals = await get_patient_vitals(
                id=patient_id,
                metric="blood_pressure",
                range="30d",
                db=db,
                current_user=mock_staff
            )
            assert len(bp_vitals) == 1
            assert bp_vitals[0]["systolic"] == 120.0
            assert bp_vitals[0]["diastolic"] == 80.0

            # Query lab history (HbA1c)
            hba1c_history = await get_patient_lab_history(
                id=patient_id,
                test_name="HbA1c",
                db=db,
                current_user=mock_staff
            )
            # Both OCR reports contain HbA1c, returned chronologically (6.8 first, then 7.4)
            assert len(hba1c_history) == 2
            assert hba1c_history[0]["value"] == 6.8
            assert hba1c_history[0]["status"] == "High" # HbA1c > 5.7
            assert hba1c_history[1]["value"] == 7.4
            assert hba1c_history[1]["status"] == "High"

            # Query empty metric fallback
            empty_labs = await get_patient_lab_history(
                id=patient_id,
                test_name="NonExistentLab",
                db=db,
                current_user=mock_staff
            )
            assert len(empty_labs) == 0

    finally:
        # Step 3: Cleanup
        async with TestSessionLocal() as db:
            if patient_id:
                ref_visits = (await db.execute(select(Visit).filter(Visit.patient_id == patient_id))).scalars().all()
                for v in ref_visits:
                    await db.delete(v)
                ref_ocrs = (await db.execute(select(OCRRecord).filter(OCRRecord.patient_id == patient_id))).scalars().all()
                for o in ref_ocrs:
                    await db.delete(o)
                ref_meds = (await db.execute(select(MedicalRecord).filter(MedicalRecord.patient_id == patient_id))).scalars().all()
                for m in ref_meds:
                    await db.delete(m)
                ref_pat = (await db.execute(select(Patient).filter(Patient.id == patient_id))).scalars().first()
                if ref_pat:
                    await db.delete(ref_pat)
            ref_doc = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
            if ref_doc:
                await db.delete(ref_doc)
            await db.commit()
        await test_engine.dispose()


@pytest.mark.asyncio
async def test_cumulative_prescription_and_allergies():
    from backend.app.api.v1.endpoints.prescriptions import create_prescription, PrescriptionCreateRequest
    from backend.app.schemas.schemas import MedicineSchema
    from unittest.mock import patch

    patient_id = None
    doctor_id = "doctor-rx-test-123"
    visit_id = None

    try:
        # Step 1: Create Doctor and Patient (with Penicillin Allergy)
        async with TestSessionLocal() as db:
            existing_doc = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
            if not existing_doc:
                unique_doc_phone = "".join(random.choices("0123456789", k=10))
                db_doctor = Doctor(
                    id=doctor_id,
                    email=f"doc-{uuid.uuid4().hex[:6]}@hospital.com",
                    full_name="Dr. Rx Test",
                    specialization="General Medicine",
                    license_number="RX-TEST-123",
                    phone=unique_doc_phone,
                    password_hash="fakehash",
                    role="Doctor"
                )
                db.add(db_doctor)

            unique_pat_phone = "".join(random.choices("0123456789", k=10))
            patient = Patient(
                full_name="Kishore Rx Test",
                date_of_birth=date(1992, 7, 12),
                gender="Male",
                phone=unique_pat_phone,
                blood_group="B+",
                allergies=["Penicillin"]
            )
            db.add(patient)
            await db.flush()
            patient_id = patient.id

            visit = Visit(
                patient_id=patient_id,
                doctor_id=doctor_id,
                chief_complaint="Prescription test",
                status="in_progress",
                visit_date=datetime.utcnow()
            )
            db.add(visit)
            await db.commit()
            visit_id = visit.id

        # Step 2: Dictate first medicine: Metformin 500mg
        first_parsed = [
            MedicineSchema(
                name="Metformin",
                strength="500mg",
                frequency="Once daily",
                duration="30 days",
                instructions="After food"
            )
        ]
        with patch("backend.app.api.v1.endpoints.prescriptions.prescription_service.parse_dictation", return_value=first_parsed), \
             patch("backend.app.api.v1.endpoints.prescriptions.prescription_service.generate_prescription_pdf", return_value="prescriptions/test.pdf"):
            
            async with TestSessionLocal() as db:
                req = PrescriptionCreateRequest(transcript="dictate Metformin 500mg")
                db_doctor = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
                res = await create_prescription(visit_id=visit_id, req=req, db=db, current_user=db_doctor)
                
                assert len(res.medicines) == 1
                assert res.medicines[0]["name"] == "Metformin"
                assert res.medicines[0]["strength"] == "500mg"

        # Step 3: Dictate duplicate medicine with different strength (should update in-place, NOT duplicate)
        second_parsed = [
            MedicineSchema(
                name="Metformin",
                strength="1000mg",
                frequency="Twice daily",
                duration="30 days",
                instructions="After food"
            )
        ]
        with patch("backend.app.api.v1.endpoints.prescriptions.prescription_service.parse_dictation", return_value=second_parsed), \
             patch("backend.app.api.v1.endpoints.prescriptions.prescription_service.generate_prescription_pdf", return_value="prescriptions/test.pdf"):
            
            async with TestSessionLocal() as db:
                req = PrescriptionCreateRequest(transcript="dictate Metformin 1000mg twice daily")
                db_doctor = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
                res = await create_prescription(visit_id=visit_id, req=req, db=db, current_user=db_doctor)
                
                # Should STILL be 1 medicine row, but strength updated to 1000mg
                assert len(res.medicines) == 1
                assert res.medicines[0]["name"] == "Metformin"
                assert res.medicines[0]["strength"] == "1000mg"
                assert res.medicines[0]["frequency"] == "Twice daily"

        # Step 4: Dictate a new medicine: Amoxicillin (should append, AND trigger Penicillin allergy warning)
        third_parsed = [
            MedicineSchema(
                name="Amoxicillin",
                strength="500mg",
                frequency="Three times daily",
                duration="7 days",
                instructions="After food"
            )
        ]
        with patch("backend.app.api.v1.endpoints.prescriptions.prescription_service.parse_dictation", return_value=third_parsed), \
             patch("backend.app.api.v1.endpoints.prescriptions.prescription_service.generate_prescription_pdf", return_value="prescriptions/test.pdf"):
            
            async with TestSessionLocal() as db:
                req = PrescriptionCreateRequest(transcript="dictate Amoxicillin 500mg")
                db_doctor = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
                res = await create_prescription(visit_id=visit_id, req=req, db=db, current_user=db_doctor)
                
                # Should now be 2 medicine rows: Metformin and Amoxicillin
                assert len(res.medicines) == 2
                
                # Find Amoxicillin row
                amox_row = next((m for m in res.medicines if m["name"] == "Amoxicillin"), None)
                assert amox_row is not None
                # Assert allergy warning was injected into warnings field
                assert amox_row.get("warnings") is not None
                assert "Allergy Warning" in amox_row["warnings"]
                assert "penicillin" in amox_row["warnings"].lower()

    finally:
        # Step 5: Cleanup
        async with TestSessionLocal() as db:
            # Delete any prescriptions/visits referencing this doctor first to avoid FK violation
            visits_res = await db.execute(select(Visit).filter(Visit.doctor_id == doctor_id))
            for v in visits_res.scalars().all():
                pres_res = await db.execute(select(Prescription).filter(Prescription.visit_id == v.id))
                for p in pres_res.scalars().all():
                    await db.delete(p)
                await db.delete(v)
            await db.flush()

            if patient_id:
                ref_pat = (await db.execute(select(Patient).filter(Patient.id == patient_id))).scalars().first()
                if ref_pat:
                    await db.delete(ref_pat)
            await db.flush()

            ref_doc = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
            if ref_doc:
                await db.delete(ref_doc)
            await db.commit()
        await test_engine.dispose()


@pytest.mark.asyncio
async def test_delete_patient_doctor_role():
    from backend.app.api.v1.endpoints.patients import delete_patient
    
    patient_id = None
    doctor_id = "doctor-del-test-123"

    try:
        # Create a Doctor
        async with TestSessionLocal() as db:
            existing_doc = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
            if not existing_doc:
                unique_doc_phone = "".join(random.choices("0123456789", k=10))
                db_doctor = Doctor(
                    id=doctor_id,
                    email=f"doc-{uuid.uuid4().hex[:6]}@hospital.com",
                    full_name="Dr. Delete Test",
                    specialization="General Medicine",
                    license_number="DEL-TEST-123",
                    phone=unique_doc_phone,
                    password_hash="fakehash",
                    role="Doctor"
                )
                db.add(db_doctor)

            # Create a Patient to delete
            unique_pat_phone = "".join(random.choices("0123456789", k=10))
            patient = Patient(
                full_name="Patient to Delete",
                date_of_birth=date(1995, 1, 1),
                gender="Male",
                phone=unique_pat_phone,
                blood_group="O+",
                allergies=[]
            )
            db.add(patient)
            await db.flush()
            patient_id = patient.id
            await db.commit()

        # Call delete_patient route function directly with doctor role credentials
        async with TestSessionLocal() as db:
            db_doctor = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
            res = await delete_patient(id=patient_id, db=db, current_user=db_doctor)
            assert res["detail"] == "Patient deleted successfully from database and vector stores"

            # Assert patient is actually deleted from database
            ref_pat = (await db.execute(select(Patient).filter(Patient.id == patient_id))).scalars().first()
            assert ref_pat is None

    finally:
        # Cleanup doctor
        async with TestSessionLocal() as db:
            ref_doc = (await db.execute(select(Doctor).filter(Doctor.id == doctor_id))).scalars().first()
            if ref_doc:
                await db.delete(ref_doc)
            await db.commit()
        await test_engine.dispose()
