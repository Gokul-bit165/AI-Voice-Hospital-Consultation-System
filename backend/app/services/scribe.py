from pydantic import BaseModel, Field
from typing import List, Optional
from backend.app.core.prompts import load_prompt_template
from backend.app.services.llm_client import llm_client
from backend.app.schemas.schemas import VitalsSchema

class StructuredScribeOutput(BaseModel):
    chief_complaint: str = Field(description="The primary reason the patient is seeking care.")
    subjective: str = Field(description="Symptoms, history, patient's own statements, onset, duration.")
    objective: str = Field(description="Physical exam findings, test results mentioned, vitals discussed.")
    assessment: str = Field(description="Diagnoses, clinical reasoning, rule-outs. Highlight any clinical ambiguity.")
    plan: str = Field(description="Medications, tests ordered, follow-ups, lifestyle advice.")
    vitals: VitalsSchema = Field(default_factory=VitalsSchema, description="Extracted vitals values like BP, Heart Rate, Temp, SPO2.")
    review_notes: List[str] = Field(default_factory=list, description="Clinical concerns, missing details, or ambiguous statements that the doctor should verify.")

class ScribeService:
    def scribe_consultation(self, transcript: str) -> StructuredScribeOutput:
        """
        Processes a raw transcript, extracting structured SOAP notes, vitals, and chief complaints.
        """
        if not transcript or len(transcript.strip()) < 5:
            return StructuredScribeOutput(
                chief_complaint="",
                subjective="No transcript contents available.",
                objective="",
                assessment="",
                plan="",
                vitals=VitalsSchema(),
                review_notes=["Transcript was empty."]
            )

        template = load_prompt_template("medical_scribe.txt")
        formatted_prompt = template.format(transcript=transcript)
        
        system_instruction = (
            "You are a strict, highly accurate AI Medical Scribe. "
            "You write highly structured, clean clinical notes based on standard SOAP formatting. "
            "Never hallucinate facts. Preserves medical terms."
        )
        
        extracted: StructuredScribeOutput = llm_client.extract_structured(
            prompt=formatted_prompt,
            response_model=StructuredScribeOutput,
            system_instruction=system_instruction
        )
        
        return extracted

scribe_service = ScribeService()
