from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.core.api_keys import load_api_keys

# Import routers
from backend.app.api.v1.endpoints import auth, patients, records, visits, prescriptions, voice_command, rag, admin

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load API keys into cache
    print("FastAPI starting: loading dynamic API keys...")
    await load_api_keys()
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API for the AI Voice Hospital Consultation System prototype.",
    version="1.0.0",
    lifespan=lifespan
)

# Set CORS origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(patients.router, prefix=f"{settings.API_V1_STR}/patients", tags=["patients"])
app.include_router(records.router, prefix=f"{settings.API_V1_STR}", tags=["records"])
app.include_router(visits.router, prefix=f"{settings.API_V1_STR}", tags=["visits"])
app.include_router(prescriptions.router, prefix=f"{settings.API_V1_STR}", tags=["prescriptions"])
app.include_router(voice_command.router, prefix=f"{settings.API_V1_STR}/voice", tags=["voice"])
app.include_router(rag.router, prefix=f"{settings.API_V1_STR}", tags=["rag"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin"])

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "docs_url": "/docs"
    }
