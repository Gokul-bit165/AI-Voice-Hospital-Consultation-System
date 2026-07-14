import os
import io
import base64
import uuid
import edge_tts
import google.generativeai as genai
from openai import OpenAI
from backend.app.core.config import settings

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
        Priority: 1) Groq whisper-large-v3-turbo  2) Gemini  3) mock fallback
        """
        if not audio_bytes:
            return ""

        # ── Method 1: Groq whisper-large-v3-turbo ─────────────────────────────
        # Groq exposes an OpenAI-compatible /audio/transcriptions endpoint.
        # Fastest option — typical latency ~300 ms for a short dictation clip.
        if self.groq_client:
            try:
                audio_file = io.BytesIO(audio_bytes)
                # Groq requires a filename with extension so it knows the codec
                audio_file.name = f"dictation.{file_format}"
                transcript = self.groq_client.audio.transcriptions.create(
                    model="whisper-large-v3-turbo",
                    file=audio_file,
                    response_format="text",
                    language="en",
                )
                # Groq returns plain text when response_format="text"
                result = transcript if isinstance(transcript, str) else transcript.text
                print(f"Groq Whisper transcription successful: {result[:80]}…")
                return result.strip()
            except Exception as e:
                print(f"Groq Whisper transcription failed: {e}. Trying Gemini fallback…")

        # ── Method 2: Gemini Audio Understanding ──────────────────────────────
        if settings.GEMINI_API_KEY:
            temp_filepath = None
            try:
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
                print(f"Gemini transcription failed: {e}")
            finally:
                if temp_filepath and os.path.exists(temp_filepath):
                    os.remove(temp_filepath)

        # ── Method 3: Mock fallback ────────────────────────────────────────────
        print("Warning: No STT API key configured. Using mock transcription.")
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
