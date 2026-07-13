import base64
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from backend.app.core.deps import get_db_session, require_doctor, require_any_role
from backend.app.models.models import Visit, Patient, Timeline, Conversation, Embedding, Doctor
from backend.app.schemas.schemas import VisitResponse, VisitCreate, VisitUpdate, SOAPNotesSchema, VitalsSchema
from backend.app.services.scribe import scribe_service
from backend.app.services.voice import voice_service
from backend.app.services.rag import rag_service
from backend.app.api.v1.endpoints.patients import log_audit_action

router = APIRouter()

@router.post("/patients/{patient_id}/visits", response_model=VisitResponse)
async def start_visit(
    patient_id: str,
    visit_in: VisitCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_doctor)
):
    # Verify patient exists
    result = await db.execute(select(Patient).filter(Patient.id == patient_id))
    patient = result.scalars().first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Check if there's already an active visit for this patient
    stmt = select(Visit).filter(Visit.patient_id == patient_id, Visit.status == "in_progress")
    existing_visit = (await db.execute(stmt)).scalars().first()
    if existing_visit:
        # Return existing visit instead of throwing error to make workflow robust
        return existing_visit

    # Create new visit
    db_visit = Visit(
        patient_id=patient_id,
        doctor_id=current_user.id,
        chief_complaint=visit_in.chief_complaint,
        status="in_progress"
    )
    # Initialize empty SOAP and Vitals
    db_visit.soap_notes = {"subjective": "", "objective": "", "assessment": "", "plan": ""}
    db_visit.vitals = {"bp": "", "hr": "", "temp": "", "weight": "", "spo2": ""}
    
    db.add(db_visit)
    await db.flush()

    # Timeline entry
    timeline_evt = Timeline(
        patient_id=patient_id,
        event_type="visit",
        event_summary=f"Consultation started by Dr. {current_user.full_name}. Chief Complaint: {visit_in.chief_complaint or 'None specified'}.",
        reference_id=db_visit.id,
        event_date=datetime.now()
    )
    db.add(timeline_evt)

    # Audit log
    await log_audit_action(db, current_user.email, "CREATE", "Visit", db_visit.id)
    await db.commit()
    return db_visit

@router.get("/visits/{id}", response_model=VisitResponse)
async def get_visit(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_any_role)
):
    result = await db.execute(select(Visit).filter(Visit.id == id).options(selectinload(Visit.prescription)))
    visit = result.scalars().first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    return visit

@router.patch("/visits/{id}", response_model=VisitResponse)
async def update_visit(
    id: str,
    visit_in: VisitUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_doctor)
):
    result = await db.execute(select(Visit).filter(Visit.id == id))
    visit = result.scalars().first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")

    if visit_in.chief_complaint is not None:
        visit.chief_complaint = visit_in.chief_complaint
    if visit_in.soap_notes is not None:
        visit.soap_notes = visit_in.soap_notes.model_dump()
    if visit_in.vitals is not None:
        visit.vitals = visit_in.vitals.model_dump()
    if visit_in.status is not None:
        visit.status = visit_in.status

    await log_audit_action(db, current_user.email, "UPDATE", "Visit", id)
    await db.commit()
    return visit

@router.post("/visits/{id}/scribe", response_model=VisitResponse)
async def scribe_visit_transcript(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_doctor)
):
    """
    Fetches the running transcript conversation from the DB,
    passes it to the Medical Scribe agent, extracts SOAP notes, and updates the Visit.
    """
    # Fetch visit
    result = await db.execute(select(Visit).filter(Visit.id == id))
    visit = result.scalars().first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")

    # Fetch conversation messages for this visit
    conv_result = await db.execute(
        select(Conversation)
        .filter(Conversation.visit_id == id)
        .order_by(Conversation.timestamp.asc())
    )
    messages = conv_result.scalars().all()
    
    # Construct raw transcript
    transcript_lines = []
    for msg in messages:
        role_label = "Doctor" if msg.role == "doctor" else "Patient" if msg.role == "patient" else "AI"
        transcript_lines.append(f"{role_label}: {msg.message_text}")
        
    raw_transcript = "\n".join(transcript_lines)
    
    if not raw_transcript:
        raise HTTPException(status_code=400, detail="No conversation transcript found for this visit. Please record audio first.")

    # Call medical scribe service
    scribe_output = scribe_service.scribe_consultation(raw_transcript)
    
    # Update SOAP and Vitals
    visit.chief_complaint = scribe_output.chief_complaint or visit.chief_complaint
    visit.soap_notes = {
        "subjective": scribe_output.subjective,
        "objective": scribe_output.objective,
        "assessment": scribe_output.assessment,
        "plan": scribe_output.plan
    }
    
    # Merge vitals if found, otherwise keep existing
    current_vitals = visit.vitals or {}
    new_vitals = scribe_output.vitals.model_dump(exclude_unset=True)
    for k, v in new_vitals.items():
        if v:
            current_vitals[k] = v
    visit.vitals = current_vitals

    await log_audit_action(db, current_user.email, "UPDATE", f"Visit Scribed", id)
    await db.commit()
    return visit

@router.post("/visits/{id}/complete", response_model=VisitResponse)
async def complete_visit(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_doctor)
):
    # Fetch visit
    result = await db.execute(select(Visit).filter(Visit.id == id).options(selectinload(Visit.prescription)))
    visit = result.scalars().first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")

    if visit.status == "completed":
        return visit

    # Update status
    visit.status = "completed"
    visit.updated_at = datetime.now()

    # Index SOAP notes in patient-specific collection
    soap = visit.soap_notes or {}
    soap_text = (
        f"Visit date: {visit.visit_date.strftime('%Y-%m-%d')}\n"
        f"Chief Complaint: {visit.chief_complaint}\n"
        f"SOAP Notes:\n"
        f"- Subjective: {soap.get('subjective')}\n"
        f"- Objective: {soap.get('objective')}\n"
        f"- Assessment: {soap.get('assessment')}\n"
        f"- Plan: {soap.get('plan')}\n"
        f"Vitals: BP={visit.vitals.get('bp')}, HR={visit.vitals.get('hr')}, Temp={visit.vitals.get('temp')}"
    )

    doc_id = f"visit_{visit.id}_soap"
    meta = {
        "source_type": "consultation",
        "source_id": visit.id,
        "patient_id": visit.patient_id,
        "created_at": datetime.now().isoformat()
    }

    # Save relational embedding row
    db_emb = Embedding(
        patient_id=visit.patient_id,
        source_type="consultation",
        source_id=visit.id,
        chroma_collection_name=rag_service._get_collection_name(visit.patient_id),
        chroma_document_id=doc_id
    )
    db_emb.chunk_text = soap_text
    db.add(db_emb)

    # Insert into ChromaDB
    rag_service.add_patient_documents(
        patient_id=visit.patient_id,
        texts=[soap_text],
        metadatas=[meta],
        document_ids=[doc_id]
    )

    # Add Timeline Event
    timeline_evt = Timeline(
        patient_id=visit.patient_id,
        event_type="note",
        event_summary=f"Consultation finalized by Dr. {current_user.full_name}. Diagnosis/Assessment: {soap.get('assessment') or 'No diagnosis listed'}.",
        reference_id=visit.id,
        event_date=datetime.now()
    )
    db.add(timeline_evt)

    # Audit log
    await log_audit_action(db, current_user.email, "UPDATE", "Visit Completed", visit.id)
    await db.commit()
    return visit

# Live websocket audio transcription
@router.websocket("/visits/{id}/transcribe-stream")
async def websocket_transcribe_stream(websocket: WebSocket, id: str):
    await websocket.accept()
    
    # We must open a separate db session inside websocket since it is a persistent connection
    async with SessionLocal() as db:
        # Check visit
        result = await db.execute(select(Visit).filter(Visit.id == id))
        visit = result.scalars().first()
        if not visit:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        try:
            while True:
                # Receive message
                # Expected format: JSON {"role": "doctor"|"patient", "audio_base64": "..."}
                data = await websocket.receive_json()
                
                role = data.get("role", "doctor")
                audio_b64 = data.get("audio_base64")
                
                if not audio_b64:
                    await websocket.send_json({"error": "No audio chunk received"})
                    continue
                    
                # Decode base64 audio
                try:
                    audio_bytes = base64.b64decode(audio_b64)
                except Exception:
                    await websocket.send_json({"error": "Failed to decode base64 audio"})
                    continue
                    
                # Check VAD
                if voice_service.is_silent(audio_bytes, threshold=0.005):
                    # Sound is silent, skip transcription to save API calls
                    continue

                # Transcribe chunk
                transcript = voice_service.transcribe_audio(audio_bytes, file_format="webm")
                
                if transcript and len(transcript.strip()) > 1:
                    # Save segment to database Conversation list
                    db_msg = Conversation(
                        visit_id=visit.id,
                        patient_id=visit.patient_id,
                        role=role,
                    )
                    db_msg.message_text = transcript # Encrypted
                    db.add(db_msg)
                    await db.commit()
                    
                    # Return results to client
                    await websocket.send_json({
                        "role": role,
                        "transcript": transcript,
                        "timestamp": datetime.now().isoformat()
                    })
        except WebSocketDisconnect:
            print(f"Websocket disconnected for visit {id}")
        except Exception as e:
            print(f"WebSocket error: {e}")
            try:
                await websocket.send_json({"error": str(e)})
            except Exception:
                pass
