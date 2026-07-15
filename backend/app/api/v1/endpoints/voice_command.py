import base64
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.core.deps import require_any_role
from backend.app.core.prompts import load_prompt_template
from backend.app.services.voice import voice_service
from backend.app.services.llm_client import llm_client
from backend.app.schemas.schemas import VoiceCommandRequest, VoiceCommandResponse, AudioTranscribeRequest, AudioTranscribeResponse

router = APIRouter()

class StructuredCommandOutput(BaseModel):
    intent: str = Field(description="The matched command intent. Options: register_patient, open_patient, show_last_prescription, show_allergies, previous_surgery, current_medications, start_consultation, stop_listening, generate_prescription, print_prescription, save_consultation, unknown")
    parameters: dict = Field(default_factory=dict, description="Parameters extracted from command, like patient_name.")
    confidence: float = Field(description="Confidence score from 0.0 to 1.0.")

@router.post("/command", response_model=VoiceCommandResponse)
async def process_voice_command(
    req: VoiceCommandRequest,
    current_user = Depends(require_any_role)
):
    """
    Classifies a voice dictation base64 chunk into a system intent command.
    """
    try:
        audio_bytes = base64.b64decode(req.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")

    # Transcribe
    transcript = voice_service.transcribe_audio(audio_bytes, file_format="wav")
    if not transcript:
        raise HTTPException(status_code=400, detail="Could not transcribe command audio")

    # Load prompt and classify
    template = load_prompt_template("voice_command_classification.txt")
    prompt = template.replace("{command}", transcript)
    
    system_instruction = (
        "You are a command classifier for a medical voice portal. "
        "Classify the clinician's utterance into one of the designated command types and extract details."
    )
    
    classified: StructuredCommandOutput = llm_client.extract_structured(
        prompt=prompt,
        response_model=StructuredCommandOutput,
        system_instruction=system_instruction
    )
    
    return VoiceCommandResponse(
        intent=classified.intent,
        parameters=classified.parameters,
        confidence=classified.confidence,
        transcript=transcript
    )

@router.post("/transcribe", response_model=AudioTranscribeResponse)
async def transcribe_audio_endpoint(
    req: AudioTranscribeRequest,
    current_user = Depends(require_any_role)
):
    """
    Transcribes raw base64 audio dictation into text using Whisper/Gemini.
    """
    try:
        audio_bytes = base64.b64decode(req.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")

    transcript = voice_service.transcribe_audio(audio_bytes, file_format=req.file_format or "wav")
    if not transcript:
        raise HTTPException(status_code=400, detail="Could not transcribe audio")

    return AudioTranscribeResponse(transcript=transcript)
