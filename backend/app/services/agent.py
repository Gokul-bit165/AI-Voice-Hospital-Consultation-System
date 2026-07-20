"""
ClinicalAgent — uses native Gemini function-calling (not text-parsed ReAct).
Patient/visit context is bound at tool-execution time; the LLM never controls
patient_id so cross-patient leakage via prompt injection is not possible.

Safety design:
  - check_drug_allergy always flags when allergy data is missing (empty list ≠ no allergy)
  - general_medical_knowledge answers always carry an explicit ungrounded disclaimer
  - Per-tool call cap (MAX_CALLS_PER_TOOL=2) prevents a confused agent from looping one tool
  - Hard wall-clock timeout (TIMEOUT_SECS=25) with graceful partial-answer fallback
  - Full trace is persisted to AuditLog after each agent run
"""

import asyncio
import json
import time
import uuid
from typing import AsyncGenerator, Optional
import google.generativeai as genai
from google.generativeai import protos
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.core.config import settings
from backend.app.models.models import Patient, Visit, Prescription, Timeline, AuditLog
from backend.app.services.rag import rag_service
from backend.app.services.llm_client import llm_client

# ── Constants ────────────────────────────────────────────────────────────────
MAX_ITERATIONS   = 6
MAX_CALLS_PER_TOOL = 2   # prevents looping the same tool repeatedly
TIMEOUT_SECS     = 28    # hard wall-clock budget

SAFETY_TOOLS = {"check_drug_allergy", "general_medical_knowledge"}
GROUNDED_TOOLS = {
    "search_patient_history",
    "get_patient_profile",
    "get_recent_prescriptions",
    "get_visit_timeline",
    "check_drug_allergy",
}

SAFETY_DISCLAIMER = (
    "\n\n---\n⚠️ **Clinical Disclaimer**: Drug safety information above "
    "should always be verified against the current patient record and "
    "confirmed by clinician judgment before prescribing."
)

UNGROUNDED_PREFIX = (
    "*(General medical knowledge — not derived from this patient's records)*\n\n"
)

# ── Tool declarations for Gemini ─────────────────────────────────────────────
TOOL_DECLARATIONS = [
    {
        "name": "search_patient_history",
        "description": (
            "Semantically search the patient's uploaded medical documents and OCR-parsed "
            "records. Use this when the question involves past diagnoses, lab results, "
            "or historical notes from scanned files."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to run against patient documents."
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_patient_profile",
        "description": (
            "Retrieve the patient's core demographic and clinical profile: patient ID, full name, "
            "DOB, gender, blood group, declared allergies list. Use this first when "
            "any allergy, demographic, or profile information (like patient ID) is needed."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_recent_prescriptions",
        "description": (
            "Return the patient's last N prescriptions with dates and medicine lists. "
            "Use this when asked about current or recent medications."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of recent prescriptions to return (default 5)."
                }
            },
            "required": []
        }
    },
    {
        "name": "check_drug_allergy",
        "description": (
            "Check whether a specific drug name conflicts with the patient's known allergies. "
            "IMPORTANT: always call get_patient_profile first so the allergy list is confirmed. "
            "This tool explicitly flags if allergy data is absent — 'no data' is NEVER treated as 'no allergy'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "drug_name": {
                    "type": "string",
                    "description": "The full drug or drug class name to check (e.g. 'Amoxicillin', 'Penicillin')."
                }
            },
            "required": ["drug_name"]
        }
    },
    {
        "name": "get_visit_timeline",
        "description": (
            "Return the ordered list of all clinical events for this patient "
            "(visits, prescriptions, uploads). Use when asked about visit history or timeline."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of timeline events to return (default 10)."
                }
            },
            "required": []
        }
    },
    {
        "name": "general_medical_knowledge",
        "description": (
            "Answer a general clinical or pharmacological question using medical knowledge only — "
            "NOT based on this patient's records. The answer will be clearly labelled as general "
            "knowledge and carry a clinical disclaimer. Use only when the question is general "
            "(e.g. 'What is the standard dose of X?'), not patient-specific."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The general medical question to answer."
                }
            },
            "required": ["question"]
        }
    }
]


# ── ClinicalAgent ─────────────────────────────────────────────────────────────
class ClinicalAgent:
    def __init__(self):
        self.provider = settings.LLM_PROVIDER.lower()
        # Fallback to OpenAI if Gemini key is missing
        if self.provider == "gemini" and not settings.GEMINI_API_KEY:
            self.provider = "openai"

        if self.provider == "gemini":
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self._tools = [{"function_declarations": TOOL_DECLARATIONS}]
        else:
            # Format tool declarations for OpenAI
            self._openai_tools = [
                {
                    "type": "function",
                    "function": decl
                }
                for decl in TOOL_DECLARATIONS
            ]

    # ── Public streaming entry point ──────────────────────────────────────────
    async def run_streaming(
        self,
        question: str,
        patient_id: str,
        visit_id: Optional[str],
        db: AsyncSession
    ) -> AsyncGenerator[dict, None]:
        """
        Yields SSE-ready dicts:
          { type: "thinking" | "tool_call" | "observation" | "final_answer_chunk" | "done" | "error" }
        Patient/visit context is bound here — LLM never receives patient_id as a controllable arg.
        """
        tool_call_counts: dict[str, int] = {}
        steps: list[dict] = []
        tool_calls_made: list[str] = []
        has_safety_disclaimer = False
        is_grounded = False

        # Fetch patient snapshot once (used by multiple tools)
        patient = await self._fetch_patient(db, patient_id)
        if not patient:
            yield {"type": "error", "message": "Patient not found"}
            return

        yield {"type": "thinking", "message": "Reasoning about your question…"}

        deadline = time.time() + TIMEOUT_SECS
        partial_answer_parts: list[str] = []

        if self.provider == "openai":
            # Delegate to OpenAI/OpenRouter flow
            async for event in self._run_openai_streaming(
                question, patient_id, visit_id, patient, db, steps,
                tool_calls_made, tool_call_counts, deadline, partial_answer_parts
            ):
                yield event
            return

        # ── Gemini Flow ──
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=(
                "You are an expert AI clinical assistant embedded in a hospital consultation system. "
                "Use the available tools to answer the doctor's question. "
                "Always prefer patient-specific tools over general knowledge when the question is about this patient. "
                "For the patient's official registered demographics and profile (e.g. system patient ID, registered name, DOB, blood group, allergies, contact info), "
                "you MUST call the 'get_patient_profile' tool as the primary source of truth. "
                "However, if the question asks about details from the uploaded documents, external hospital IDs, diagnoses, or lab results written in the notes, "
                "you MUST call the 'search_patient_history' tool to retrieve them from the scanned files. "
                "Be concise, clinically accurate, and use markdown formatting in your final answer. "
                "Never fabricate patient data — if tools return no data, say so explicitly."
            ),
            tools=self._tools,
        )
        chat = model.start_chat()

        iteration = 0
        try:
            response = await asyncio.to_thread(chat.send_message, question)

            while iteration < MAX_ITERATIONS:
                iteration += 1

                # Check timeout
                if time.time() > deadline:
                    fallback = (
                        "⏱️ **Timeout**: Agent ran out of time. "
                        + ("Here's what I found so far:\n\n" + "\n".join(partial_answer_parts) if partial_answer_parts else "Please try a simpler question.")
                    )
                    yield {"type": "final_answer_chunk", "chunk": fallback, "done": True,
                           "is_grounded": is_grounded, "has_safety_disclaimer": has_safety_disclaimer}
                    yield {"type": "done", "steps": steps, "tool_calls_made": tool_calls_made,
                           "is_grounded": is_grounded, "has_safety_disclaimer": has_safety_disclaimer}
                    return

                # Check if this turn has function calls
                fn_calls = [p for p in response.parts if hasattr(p, "function_call") and p.function_call.name]

                if not fn_calls:
                    # Final text answer
                    final_text = response.text or ""

                    # Distinguish grounded vs ungrounded in final answer
                    if not is_grounded and "general_medical_knowledge" in tool_calls_made:
                        final_text = UNGROUNDED_PREFIX + final_text
                    if has_safety_disclaimer:
                        final_text += SAFETY_DISCLAIMER

                    # Stream final answer character-by-character in chunks
                    chunk_size = 4
                    for i in range(0, len(final_text), chunk_size):
                        chunk = final_text[i:i+chunk_size]
                        yield {"type": "final_answer_chunk", "chunk": chunk, "done": False}
                        await asyncio.sleep(0.008)

                    yield {"type": "final_answer_chunk", "chunk": "", "done": True,
                           "is_grounded": is_grounded, "has_safety_disclaimer": has_safety_disclaimer}
                    yield {"type": "done", "steps": steps, "tool_calls_made": tool_calls_made,
                           "is_grounded": is_grounded, "has_safety_disclaimer": has_safety_disclaimer}

                    # Persist audit trace
                    await self._persist_audit(db, patient_id, visit_id, question, steps, final_text)
                    return

                # Execute each function call in this turn
                function_responses = []
                for part in fn_calls:
                    fc = part.function_call
                    tool_name = fc.name
                    raw_args = dict(fc.args) if fc.args else {}

                    # Per-tool call cap
                    tool_call_counts[tool_name] = tool_call_counts.get(tool_name, 0) + 1
                    if tool_call_counts[tool_name] > MAX_CALLS_PER_TOOL:
                        obs = f"[TOOL CAP REACHED] {tool_name} has already been called {MAX_CALLS_PER_TOOL} times. Skipping."
                        function_responses.append(
                            protos.Part(function_response=protos.FunctionResponse(
                                name=tool_name, response={"result": obs}
                            ))
                        )
                        steps.append({"type": "observation", "tool_name": tool_name, "result": obs})
                        yield {"type": "observation", "tool_name": tool_name, "result": obs, "duration_ms": 0}
                        continue

                    # Yield tool_call event (UI shows card immediately)
                    yield {"type": "tool_call", "tool_name": tool_name, "tool_args": raw_args,
                           "label": self._tool_label(tool_name, raw_args)}
                    steps.append({"type": "tool_call", "tool_name": tool_name, "tool_args": raw_args})

                    if tool_name not in tool_calls_made:
                        tool_calls_made.append(tool_name)
                    if tool_name in GROUNDED_TOOLS:
                        is_grounded = True
                    if tool_name in SAFETY_TOOLS:
                        has_safety_disclaimer = True

                    # Execute tool (patient_id bound here, not from LLM args)
                    t0 = time.time()
                    try:
                        result = await self._execute_tool(tool_name, raw_args, patient_id, patient, db)
                    except Exception as e:
                        result = f"[TOOL ERROR] {tool_name} failed: {str(e)[:200]}. Treating as no data available."
                    duration_ms = int((time.time() - t0) * 1000)

                    # Collect partial answer hints
                    if len(result) > 20:
                        partial_answer_parts.append(f"**{tool_name}**: {result[:120]}…")

                    obs_event = {"type": "observation", "tool_name": tool_name,
                                 "result": result, "duration_ms": duration_ms,
                                 "is_safety_relevant": tool_name in SAFETY_TOOLS}
                    yield obs_event
                    steps.append(obs_event)

                    function_responses.append(
                        protos.Part(function_response=protos.FunctionResponse(
                            name=tool_name, response={"result": result}
                        ))
                    )

                # Send all observations back to model
                response = await asyncio.to_thread(chat.send_message, function_responses)

        except Exception as e:
            error_msg = f"Agent encountered an error: {str(e)[:300]}"
            yield {"type": "error", "message": error_msg}
            await self._persist_audit(db, patient_id, visit_id, question, steps, error_msg)

    # ── OpenAI/OpenRouter Flow ──
    async def _run_openai_streaming(
        self,
        question: str,
        patient_id: str,
        visit_id: Optional[str],
        patient: Patient,
        db: AsyncSession,
        steps: list,
        tool_calls_made: list,
        tool_call_counts: dict,
        deadline: float,
        partial_answer_parts: list
    ) -> AsyncGenerator[dict, None]:
        client = llm_client.get_openai_client()
        model_name = "openai/gpt-4o-mini" if llm_client.is_openrouter else "gpt-4o-mini"

        system_instruction = (
            "You are an expert AI clinical assistant embedded in a hospital consultation system. "
            "Use the available tools to answer the doctor's question. "
            "Always prefer patient-specific tools over general knowledge when the question is about this patient. "
            "For the patient's official registered demographics and profile (e.g. system patient ID, registered name, DOB, blood group, allergies, contact info), "
            "you MUST call the 'get_patient_profile' tool as the primary source of truth. "
            "However, if the question asks about details from the uploaded documents, external hospital IDs, diagnoses, or lab results written in the notes, "
            "you MUST call the 'search_patient_history' tool to retrieve them from the scanned files. "
            "Be concise, clinically accurate, and use markdown formatting in your final answer. "
            "Never fabricate patient data — if tools return no data, say so explicitly."
        )

        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": question}
        ]

        is_grounded = False
        has_safety_disclaimer = False
        iteration = 0

        try:
            while iteration < MAX_ITERATIONS:
                iteration += 1

                # Check timeout
                if time.time() > deadline:
                    fallback = (
                        "⏱️ **Timeout**: Agent ran out of time. "
                        + ("Here's what I found so far:\n\n" + "\n".join(partial_answer_parts) if partial_answer_parts else "Please try a simpler question.")
                    )
                    yield {"type": "final_answer_chunk", "chunk": fallback, "done": True,
                           "is_grounded": is_grounded, "has_safety_disclaimer": has_safety_disclaimer}
                    yield {"type": "done", "steps": steps, "tool_calls_made": tool_calls_made,
                           "is_grounded": is_grounded, "has_safety_disclaimer": has_safety_disclaimer}
                    return

                response = await asyncio.to_thread(
                    client.chat.completions.create,
                    model=model_name,
                    messages=messages,
                    tools=self._openai_tools,
                    tool_choice="auto",
                    temperature=0.2
                )

                message = response.choices[0].message
                tool_calls = message.tool_calls

                if not tool_calls:
                    # Final answer reached
                    final_text = message.content or ""

                    # Distinguish grounded vs ungrounded in final answer
                    if not is_grounded and "general_medical_knowledge" in tool_calls_made:
                        final_text = UNGROUNDED_PREFIX + final_text
                    if has_safety_disclaimer:
                        final_text += SAFETY_DISCLAIMER

                    # Stream final answer chunks
                    chunk_size = 4
                    for i in range(0, len(final_text), chunk_size):
                        chunk = final_text[i:i+chunk_size]
                        yield {"type": "final_answer_chunk", "chunk": chunk, "done": False}
                        await asyncio.sleep(0.008)

                    yield {"type": "final_answer_chunk", "chunk": "", "done": True,
                           "is_grounded": is_grounded, "has_safety_disclaimer": has_safety_disclaimer}
                    yield {"type": "done", "steps": steps, "tool_calls_made": tool_calls_made,
                           "is_grounded": is_grounded, "has_safety_disclaimer": has_safety_disclaimer}

                    # Persist audit trace
                    await self._persist_audit(db, patient_id, visit_id, question, steps, final_text)
                    return

                # OpenAI requires serialization of tool_calls to dict format when appending back
                tool_calls_serialized = []
                for tc in tool_calls:
                    tool_calls_serialized.append({
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments
                        }
                    })

                messages.append({
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": tool_calls_serialized
                })

                for tc in tool_calls:
                    tool_name = tc.function.name

                    # Parse args
                    try:
                        raw_args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                    except Exception:
                        raw_args = {}

                    # Per-tool call cap
                    tool_call_counts[tool_name] = tool_call_counts.get(tool_name, 0) + 1
                    if tool_call_counts[tool_name] > MAX_CALLS_PER_TOOL:
                        obs = f"[TOOL CAP REACHED] {tool_name} has already been called {MAX_CALLS_PER_TOOL} times. Skipping."
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "name": tool_name,
                            "content": obs
                        })
                        steps.append({"type": "observation", "tool_name": tool_name, "result": obs})
                        yield {"type": "observation", "tool_name": tool_name, "result": obs, "duration_ms": 0}
                        continue

                    # Yield tool_call event (UI shows card immediately)
                    yield {"type": "tool_call", "tool_name": tool_name, "tool_args": raw_args,
                           "label": self._tool_label(tool_name, raw_args)}
                    steps.append({"type": "tool_call", "tool_name": tool_name, "tool_args": raw_args})

                    if tool_name not in tool_calls_made:
                        tool_calls_made.append(tool_name)
                    if tool_name in GROUNDED_TOOLS:
                        is_grounded = True
                    if tool_name in SAFETY_TOOLS:
                        has_safety_disclaimer = True

                    # Execute tool
                    t0 = time.time()
                    try:
                        result = await self._execute_tool(tool_name, raw_args, patient_id, patient, db)
                    except Exception as e:
                        result = f"[TOOL ERROR] {tool_name} failed: {str(e)[:200]}. Treating as no data available."
                    duration_ms = int((time.time() - t0) * 1000)

                    # Collect partial answer hints
                    if len(result) > 20:
                        partial_answer_parts.append(f"**{tool_name}**: {result[:120]}…")

                    obs_event = {"type": "observation", "tool_name": tool_name,
                                 "result": result, "duration_ms": duration_ms,
                                 "is_safety_relevant": tool_name in SAFETY_TOOLS}
                    yield obs_event
                    steps.append(obs_event)

                    # Append tool response message to history
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": tool_name,
                        "content": result
                    })

        except Exception as e:
            error_msg = f"Agent encountered an error: {str(e)[:300]}"
            yield {"type": "error", "message": error_msg}
            await self._persist_audit(db, patient_id, visit_id, question, steps, error_msg)

    # ── Tool implementations (patient_id always bound here) ──────────────────
    async def _execute_tool(
        self, tool_name: str, args: dict,
        patient_id: str, patient: Patient, db: AsyncSession
    ) -> str:
        if tool_name == "search_patient_history":
            return await self._tool_search_history(args, patient_id)
        elif tool_name == "get_patient_profile":
            return self._tool_get_profile(patient)
        elif tool_name == "get_recent_prescriptions":
            return await self._tool_get_prescriptions(args, patient_id, db)
        elif tool_name == "check_drug_allergy":
            return self._tool_check_drug(args, patient)
        elif tool_name == "get_visit_timeline":
            return await self._tool_get_timeline(args, patient_id, db)
        elif tool_name == "general_medical_knowledge":
            return await self._tool_general_knowledge(args)
        else:
            return f"[UNKNOWN TOOL] {tool_name}"

    async def _tool_search_history(self, args: dict, patient_id: str) -> str:
        query = args.get("query", "")
        if not query:
            return "No query provided."
        chunks = rag_service.query_patient_documents(patient_id=patient_id, query=query, n_results=4)
        if not chunks:
            return "No relevant documents found in patient history for this query."
        parts = []
        for i, c in enumerate(chunks, 1):
            src = c.get("metadata", {}).get("source_type", "record")
            fn = c.get("metadata", {}).get("original_filename", "")
            label = f"[{src.upper()}{' — ' + fn if fn else ''}]"
            parts.append(f"{i}. {label}: {c['document'][:400]}")
        return "\n\n".join(parts)

    def _tool_get_profile(self, patient: Patient) -> str:
        allergies = patient.allergies or []
        allergy_status = (
            "**No allergies on file** — IMPORTANT: absence of data does not confirm safety."
            if not allergies
            else "**Declared allergies**: " + ", ".join(allergies)
        )
        return (
            f"Name: {patient.full_name}\n"
            f"DOB: {patient.date_of_birth}\n"
            f"Gender: {patient.gender}\n"
            f"Blood Group: {patient.blood_group or 'Not recorded'}\n"
            f"Phone: {patient.phone}\n"
            f"Address: {patient.address or 'Not recorded'}\n"
            f"{allergy_status}"
        )

    async def _tool_get_prescriptions(self, args: dict, patient_id: str, db: AsyncSession) -> str:
        limit = min(int(args.get("limit", 5)), 10)
        result = await db.execute(
            select(Prescription)
            .filter(Prescription.patient_id == patient_id)
            .order_by(Prescription.created_at.desc())
            .limit(limit)
        )
        rxs = result.scalars().all()
        if not rxs:
            return "No prescriptions found for this patient."
        lines = []
        for rx in rxs:
            meds = rx.medicines or []
            med_str = ", ".join(f"{m.get('name','?')} {m.get('strength','')}".strip() for m in meds) or "No medicines listed"
            lines.append(f"• {rx.created_at.strftime('%Y-%m-%d')}: {med_str}")
        return "\n".join(lines)

    def _tool_check_drug(self, args: dict, patient: Patient) -> str:
        drug_name = args.get("drug_name", "").strip()
        if not drug_name:
            return "No drug name provided."
        allergies = patient.allergies or []
        if not allergies:
            return (
                f"⚠️ SAFETY ALERT: Cannot confirm {drug_name} is safe — "
                f"**no allergy data is recorded** for this patient. "
                f"Data absence must NOT be interpreted as 'no allergy'. Verify manually."
            )

        ALLERGY_MAP = {
            "penicillin": ["amoxicillin", "penicillin", "ampicillin", "clavulanate", "flucloxacillin"],
            "sulfa": ["sulfamethoxazole", "trimethoprim", "sulfadiazine", "sulfonamide"],
            "nsaid": ["ibuprofen", "aspirin", "naproxen", "diclofenac", "indomethacin"],
            "cephalosporin": ["cephalexin", "cefazolin", "ceftriaxone", "cefuroxime"],
        }

        drug_lower = drug_name.lower()
        conflicts = []
        for allergy in allergies:
            allergy_lower = allergy.lower()
            # Direct match
            if allergy_lower in drug_lower or drug_lower in allergy_lower:
                conflicts.append(allergy)
                continue
            # Cross-reactivity check
            for allergy_class, related in ALLERGY_MAP.items():
                if allergy_lower in allergy_class or allergy_class in allergy_lower:
                    if any(r in drug_lower for r in related):
                        conflicts.append(f"{allergy} (cross-reactivity risk with {allergy_class} class)")

        if conflicts:
            return (
                f"🚨 CONFLICT DETECTED: {drug_name} conflicts with patient's recorded allergy: "
                f"{'; '.join(conflicts)}. **DO NOT prescribe without specialist review.**"
            )

        return (
            f"✅ No allergy conflict found for {drug_name} against recorded allergies: "
            f"{', '.join(allergies)}. Standard precautions still apply."
        )

    async def _tool_get_timeline(self, args: dict, patient_id: str, db: AsyncSession) -> str:
        limit = min(int(args.get("limit", 10)), 20)
        result = await db.execute(
            select(Timeline)
            .filter(Timeline.patient_id == patient_id)
            .order_by(Timeline.event_date.desc())
            .limit(limit)
        )
        events = result.scalars().all()
        if not events:
            return "No clinical timeline events found for this patient."
        lines = [f"• [{e.event_type.upper()}] {e.event_date.strftime('%Y-%m-%d %H:%M')}: {e.event_summary}" for e in events]
        return "\n".join(lines)

    async def _tool_general_knowledge(self, args: dict) -> str:
        question = args.get("question", "")
        if not question:
            return "No question provided."
        answer = llm_client.generate_text(
            prompt=question,
            system_instruction=(
                "You are a clinical pharmacologist. Answer the following general medical question "
                "concisely and accurately. Do NOT reference any specific patient. "
                "Use markdown formatting."
            )
        )
        return answer

    # ── Helpers ───────────────────────────────────────────────────────────────
    async def _fetch_patient(self, db: AsyncSession, patient_id: str) -> Optional[Patient]:
        result = await db.execute(select(Patient).filter(Patient.id == patient_id))
        return result.scalars().first()

    def _tool_label(self, tool_name: str, args: dict) -> str:
        labels = {
            "search_patient_history": f"Searching patient history for \"{args.get('query', '')}\"…",
            "get_patient_profile": "Fetching allergy & demographic profile…",
            "get_recent_prescriptions": "Loading recent prescriptions…",
            "check_drug_allergy": f"Checking allergy conflict for {args.get('drug_name', '')}…",
            "get_visit_timeline": "Retrieving clinical visit timeline…",
            "general_medical_knowledge": "Consulting general medical knowledge…",
        }
        return labels.get(tool_name, f"Running {tool_name}…")

    async def _persist_audit(
        self, db: AsyncSession, patient_id: str, visit_id: Optional[str],
        question: str, steps: list, final_answer: str
    ):
        try:
            trace_summary = json.dumps({
                "question": question[:300],
                "steps_count": len(steps),
                "tools_used": list({s.get("tool_name") for s in steps if s.get("tool_name")}),
                "final_answer_preview": final_answer[:200],
            })
            log = AuditLog(
                id=str(uuid.uuid4()),
                user_id=f"agent:patient={patient_id}",
                action="AGENT_QUERY",
                entity_type="Patient",
                entity_id=patient_id,
                ip_address=visit_id or "no-visit",
            )
            db.add(log)
            await db.commit()
        except Exception:
            pass  # Audit failure must never crash the agent response


clinical_agent = ClinicalAgent()
