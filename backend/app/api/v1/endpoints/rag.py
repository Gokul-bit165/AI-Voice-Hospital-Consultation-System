from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from backend.app.core.deps import get_db_session, require_doctor
from backend.app.models.models import Patient, Embedding, Conversation, Doctor
from backend.app.schemas.schemas import RAGQueryRequest, RAGQueryResponse
from backend.app.services.rag import rag_service
from backend.app.services.llm_client import llm_client
from backend.app.core.prompts import load_prompt_template

router = APIRouter()

@router.post("/patients/{id}/embeddings")
async def regenerate_patient_embeddings(
    id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_doctor)
):
    """
    Regenerates the patient's vector database collection from the SQL database records.
    Useful for sync, debugging, or database migration.
    """
    # Verify patient
    p_result = await db.execute(select(Patient).filter(Patient.id == id))
    patient = p_result.scalars().first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Get all embeddings records from SQL
    result = await db.execute(select(Embedding).filter(Embedding.patient_id == id))
    embeddings_list = result.scalars().all()

    # Reset Chroma collection
    rag_service.delete_patient_collection(id)

    if not embeddings_list:
        return {"detail": "Embeddings collection reset. No historical record chunks found to index."}

    texts = [emb.chunk_text for emb in embeddings_list]
    document_ids = [emb.chroma_document_id for emb in embeddings_list]
    
    metadatas = []
    for emb in embeddings_list:
        metadatas.append({
            "source_type": emb.source_type,
            "source_id": emb.source_id,
            "patient_id": id
        })

    # Re-insert into Chroma
    rag_service.add_patient_documents(
        patient_id=id,
        texts=texts,
        metadatas=metadatas,
        document_ids=document_ids
    )

    return {"detail": f"Successfully re-indexed {len(texts)} document chunks in patient vector storage."}

@router.post("/patients/{id}/rag-query", response_model=RAGQueryResponse)
async def query_patient_rag(
    id: str,
    req: RAGQueryRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: Doctor = Depends(require_doctor)
):
    """
    Queries only the patient-isolated RAG collection. Combines it with live visit history.
    """
    # 1. Retrieve RAG Context (from Chroma)
    retrieved_chunks = rag_service.query_patient_documents(patient_id=id, query=req.question, n_results=4)
    
    rag_context_list = []
    cited_chunks = []
    for chunk in retrieved_chunks:
        doc_text = chunk["document"]
        source_type = chunk["metadata"].get("source_type", "record")
        filename = chunk["metadata"].get("original_filename", "")
        source_label = f"[{source_type.upper()}" + (f" - {filename}]" if filename else "]")
        
        rag_context_list.append(f"{source_label}: {doc_text}")
        cited_chunks.append(doc_text)
        
    rag_context = "\n\n".join(rag_context_list) if rag_context_list else "No historical records found for this patient."

    # 2. Retrieve Live Context (from current Visit Conversation)
    live_transcript = "No active visit transcription."
    if req.visit_id:
        conv_result = await db.execute(
            select(Conversation)
            .filter(Conversation.visit_id == req.visit_id)
            .order_by(Conversation.timestamp.asc())
        )
        messages = conv_result.scalars().all()
        if messages:
            live_lines = []
            for msg in messages:
                role_label = "Doctor" if msg.role == "doctor" else "Patient" if msg.role == "patient" else "AI"
                live_lines.append(f"{role_label}: {msg.message_text}")
            live_transcript = "\n".join(live_lines)

    # 3. Compile prompt and run LLM
    template = load_prompt_template("patient_rag_answer.txt")
    prompt = template.format(
        rag_context=rag_context,
        live_transcript=live_transcript,
        question=req.question
    )

    system_instruction = (
        "You are a clinical assistant. "
        "Answer the question using ONLY the provided contexts. "
        "Strictly adhere to the Patient isolation guidelines."
    )

    answer = llm_client.generate_text(
        prompt=prompt,
        system_instruction=system_instruction
    )

    return RAGQueryResponse(
        answer=answer,
        cited_chunks=cited_chunks
    )
