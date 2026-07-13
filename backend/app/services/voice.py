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
        self.openai_client = None
        if settings.OPENAI_API_KEY:
            self.openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

    def transcribe_audio(self, audio_bytes: bytes, file_format: str = "wav") -> str:
        """
        Transcribe audio bytes using OpenAI Whisper API or Gemini audio understanding.
        """
        if not audio_bytes:
            return ""

        # Method 1: OpenAI Whisper API if configured
        if settings.LLM_PROVIDER.lower() == "openai" and self.openai_client:
            try:
                # Need to wrap bytes in a file-like object with a name so openai knows the format
                audio_file = io.BytesIO(audio_bytes)
                audio_file.name = f"dictation.{file_format}"
                transcript = self.openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file
                )
                return transcript.text
            except Exception as e:
                print(f"OpenAI Whisper transcribing failed: {e}. Trying fallback...")

        # Method 2: Gemini Audio API (Gemini 1.5 Flash can read audio bytes/files directly)
        if settings.GEMINI_API_KEY:
            try:
                # Save to a temporary file
                temp_filename = f"temp_{uuid.uuid4()}.{file_format}"
                temp_filepath = os.path.join(settings.STORAGE_DIR, temp_filename)
                with open(temp_filepath, "wb") as f:
                    f.write(audio_bytes)
                
                # Upload to Gemini Files API
                uploaded_file = genai.upload_file(path=temp_filepath, mime_type=f"audio/{file_format}")
                
                # Generate transcription
                model = genai.GenerativeModel("gemini-1.5-flash")
                response = model.generate_content([
                    "Please transcribe this audio recording accurately. Only output the spoken words. Do not add headers, summaries, or metadata. If there is no speech, return an empty string.",
                    uploaded_file
                ])
                
                # Clean up file in gemini and locally
                try:
                    uploaded_file.delete()
                except Exception:
                    pass
                if os.path.exists(temp_filepath):
                    os.remove(temp_filepath)
                    
                return response.text.strip()
            except Exception as e:
                print(f"Gemini transcription failed: {e}")
                if os.path.exists(temp_filepath):
                    os.remove(temp_filepath)

        # Method 3: Mock/Fallback if no API keys are provided
        print("Warning: No LLM/Speech API keys configured. Using transcription mock.")
        return "This is a fallback transcription. Please check your GEMINI_API_KEY or OPENAI_API_KEY."

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
