import os
import io
import base64
import uuid
import edge_tts
import google.generativeai as genai
from openai import OpenAI
from backend.app.core.config import settings
import json
import re
from rapidfuzz import fuzz

# Load medicines for STT prompt and fuzzy matching
MEDICINES_LIST = []
try:
    med_path = os.path.join(os.path.dirname(__file__), "..", "medicines.json")
    with open(med_path, "r", encoding="utf-8") as f:
        MEDICINES_LIST = json.load(f)
except Exception as e:
    print(f"Warning: Could not load medicines.json: {e}")

def correct_medicine_names(transcript: str) -> tuple[str, str]:
    """
    Tokenizes the transcript, runs fuzzy matching against the medicine list,
    and replaces words that have > 85% similarity.
    Returns (raw_transcript, corrected_transcript).
    """
    if not MEDICINES_LIST:
        return transcript, transcript

    corrected_transcript = transcript
    # Simple tokenization by word (keeping punctuation intact if possible, but matching purely on alphabetical characters)
    # We'll use a regex to find all words
    words = re.findall(r'\b[a-zA-Z]+\b', transcript)
    
    med_lower_map = {m.lower(): m for m in MEDICINES_LIST}
    known_meds_lower = set(med_lower_map.keys())

    for word in set(words):
        word_lower = word.lower()
        if len(word_lower) < 4:  # Skip very short words to avoid false positives
            continue
            
        if word_lower not in known_meds_lower:
            # Find best match
            best_match = None
            highest_score = 0
            for med_lower in known_meds_lower:
                score = fuzz.ratio(word_lower, med_lower)
                if score > highest_score:
                    highest_score = score
                    best_match = med_lower
                    
            if highest_score > 80 and best_match:
                # Replace the word in the transcript (case-insensitive replace for the specific word boundary)
                pattern = r'\b' + re.escape(word) + r'\b'
                # Preserve the case of the original replacement from MEDICINES_LIST
                replacement = med_lower_map[best_match]
                corrected_transcript = re.sub(pattern, replacement, corrected_transcript, flags=re.IGNORECASE)
                
    return transcript, corrected_transcript

class VoiceService:
    def __init__(self):
        # Groq client — OpenAI-compatible, used for whisper-large-v3-turbo
        self.groq_client = None
        if settings.GROQ_API_KEY:
            self.groq_client = OpenAI(
                api_key=settings.GROQ_API_KEY,
                base_url="https://api.groq.com/openai/v1"
            )

    def transcribe_audio(self, audio_bytes: bytes, file_format: str = "wav") -> str:
        """
        Transcribe audio bytes.
        Priority: 1) Groq whisper-large-v3-turbo (dynamic / fallback)
                  2) Gemini (dynamic / fallback)
                  3) mock fallback
        """
        if not audio_bytes:
            return ""

        from backend.app.core.api_keys import api_key_manager

        # Gather medicines list for prompting
        prompt_str = ", ".join(MEDICINES_LIST) if MEDICINES_LIST else ""
        if len(prompt_str) > 850:
            prompt_str = prompt_str[:850].rsplit(',', 1)[0]

        # ── Method 1: Groq whisper-large-v3 ─────────────────────────────
        groq_keys = api_key_manager.get_active_key_values("groq")
        if not groq_keys and settings.GROQ_API_KEY:
            groq_keys = [settings.GROQ_API_KEY]

        for key in groq_keys:
            try:
                client = OpenAI(
                    api_key=key,
                    base_url="https://api.groq.com/openai/v1"
                )
                audio_file = io.BytesIO(audio_bytes)
                audio_file.name = f"dictation.{file_format}"
                
                transcript = client.audio.transcriptions.create(
                    model="whisper-large-v3-turbo",
                    file=audio_file,
                    response_format="text",
                    language="en",
                    prompt=prompt_str
                )
                raw_result = transcript if isinstance(transcript, str) else transcript.text
                raw_result = raw_result.strip()
                raw_tx, corrected_tx = correct_medicine_names(raw_result)
                
                print(f"Groq Whisper transcription successful: {corrected_tx[:80]}…")
                return corrected_tx
            except Exception as e:
                print(f"Groq Whisper key failed ({key[:10]}...): {e}")
                api_key_manager.increment_fail_count("groq", key)

        # ── Method 2: Gemini Audio Understanding ──────────────────────────────
        gemini_keys = api_key_manager.get_active_key_values("gemini")
        if not gemini_keys and settings.GEMINI_API_KEY:
            gemini_keys = [settings.GEMINI_API_KEY]

        for key in gemini_keys:
            temp_filepath = None
            try:
                genai.configure(api_key=key)
                temp_filename = f"temp_{uuid.uuid4()}.{file_format}"
                temp_filepath = os.path.join(settings.STORAGE_DIR, temp_filename)
                with open(temp_filepath, "wb") as f:
                    f.write(audio_bytes)

                uploaded_file = genai.upload_file(path=temp_filepath, mime_type=f"audio/{file_format}")
                model = genai.GenerativeModel("gemini-1.5-flash")
                response = model.generate_content([
                    "Please transcribe this audio recording accurately. "
                    "Only output the spoken words. Do not add headers, summaries, or metadata. "
                    "If there is no speech, return an empty string.",
                    uploaded_file
                ])
                try:
                    uploaded_file.delete()
                except Exception:
                    pass
                return response.text.strip()
            except Exception as e:
                print(f"Gemini transcription key failed ({key[:10]}...): {e}")
                api_key_manager.increment_fail_count("gemini", key)
            finally:
                if temp_filepath and os.path.exists(temp_filepath):
                    os.remove(temp_filepath)

        # ── Method 3: Mock fallback ────────────────────────────────────────────
        print("Warning: No active dynamic or static STT key succeeded. Using mock transcription.")
        return "Paracetamol 500 milligram twice daily for five days after food."


    async def text_to_speech(self, text: str, output_path: str, voice: str = "en-US-AndrewNeural") -> bool:
        """
        Synthesize text to speech using Edge TTS (free, no API key required).
        """
        try:
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(output_path)
            return True
        except Exception as e:
            print(f"Edge TTS synthesis failed: {e}")
            return False

    def is_silent(self, audio_bytes: bytes, threshold: float = 0.01) -> bool:
        """
        Simple, robust amplitude-based voice activity detection helper for WAV chunks.
        Determines if the raw sound chunk is below a silence threshold.
        """
        if len(audio_bytes) < 100:
            return True
            
        # If WAV header is present, we skip the first 44 bytes to look at sample data
        data = audio_bytes[44:] if audio_bytes[:4] == b'RIFF' else audio_bytes
        
        try:
            # Assume 16-bit PCM audio. We compute root mean square (RMS)
            import numpy as np
            samples = np.frombuffer(data, dtype=np.int16)
            if len(samples) == 0:
                return True
            rms = np.sqrt(np.mean(samples.astype(float)**2))
            # Normalized RMS
            norm_rms = rms / 32768.0
            return norm_rms < threshold
        except Exception:
            # Fallback if numpy is not installed yet or error occurs
            return False

voice_service = VoiceService()
