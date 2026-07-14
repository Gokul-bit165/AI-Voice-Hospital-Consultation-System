import os
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Voice Hospital Consultation System"
    API_V1_STR: str = "/api/v1"
    
    # Security
    JWT_SECRET_KEY: str = Field(default="supersecretjwtkeyforhospitalvoiceai1234567890!")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    
    # AES Encryption Key (must be 32 URL-safe base64-encoded bytes for Fernet)
    # We will generate a default fallback if not set, but in production, this must be set.
    ENCRYPTION_KEY: str = Field(default="8fKx_ZJvW9-B_T_zKz7X5d9G7O5l_G3vW2m_K1o_zX4=")
    
    # Database
    # Defaulting to local postgres for docker compose setup (port 5435)
    DATABASE_URL: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:5435/hospital_voiceai")
    
    # LLM Settings
    # Supports 'gemini' or 'openai'
    LLM_PROVIDER: str = Field(default="gemini")
    OPENAI_API_KEY: Optional[str] = Field(default=None)
    GEMINI_API_KEY: Optional[str] = Field(default=None)
    # Groq — for whisper-large-v3-turbo STT via OpenAI-compatible endpoint
    GROQ_API_KEY: Optional[str] = Field(default=None)

    
    # Storage
    STORAGE_DIR: str = Field(default="c:/Users/gokul/hospital-voiceAI/storage")
    CHROMA_DIR: str = Field(default="c:/Users/gokul/hospital-voiceAI/storage/chroma")
    
    # OCR Features
    ENABLE_GEMINI_VISION_OCR: bool = Field(default=True)
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"),
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()

# Ensure directories exist
os.makedirs(settings.STORAGE_DIR, exist_ok=True)
os.makedirs(settings.CHROMA_DIR, exist_ok=True)
os.makedirs(os.path.join(settings.STORAGE_DIR, "patients"), exist_ok=True)
