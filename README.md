# MetroVoice AI: Hospital Consultation System

A production-grade, fully working prototype of an AI Voice Hospital Consultation System. This system covers Voice Registration, Patient CRUD, Medical Record Upload, OCR, Patient Timeline, Patient-specific RAG, Voice Consultation, AI Medical Scribe, Voice Prescription, Printable Prescription, Save Consultation, and Update Patient History, all in one seamless workflow.

---

## 🖥️ System Interface & Patient Workflow

#### 1. Secure Clinical Workspace Login
Access the clinical portal through a role-based login interface. Quick testing links at the bottom facilitate rapid switching between Doctor, Receptionist, and Admin desks.
![MetroVoice Portal Login](screenshots/01_login_portal.png)

---

#### 2. Doctor's Patient Queue Dashboard
The clinical home dashboard lists active patients waiting in the clinic queue, real-time metrics (patients waiting, prescriptions issued today, OCR records logged, and average session length), clinical guides, and a daily priority reminder checklist.
![Doctor's Patient Queue](screenshots/05_doctor_queue_dashboard.png)

---

#### 3. Voice Consultation & Live Dictation
Within the patient's consultation room, doctors can activate the speech system to capture live clinical dictation. The system records vitals, symptoms, diagnoses, and medication instructions in real-time.
![Voice Dictation & Speech System](screenshots/04_voice_dictation_listening.png)

---

#### 4. Patient Scribe & Medication Guide Workspace
The primary consultation workspace consolidates the patient's profiles (demographics, BMI, allergies), a dynamically adjustable Prescription Medication Guide, and a persistent sidebar for the AI Clinical Agent.
![Voice Consultation Room & Medication Guide](screenshots/02_voice_consultation_dashboard.png)

---

#### 5. Standalone AI Clinical Agent (Isolated Patient RAG)
A dedicated, expanded layout for the AI Clinical Agent allows complex queries (e.g., summarizing medical history, reviewing active allergies, drug-safety checks) powered by ChromaDB RAG.
![Standalone Clinical Agent Workspace](screenshots/03_clinical_agent_standalone.png)

---

#### 6. Prescription Print Preview
A print-ready digital preview of the clinical prescription. It compiles doctor coordinates, patient demographic cards, QR-code validation, detailed Rx guidelines (strength, frequency, duration, instructions), and signature lines in a clean, high-fidelity PDF format.
![Prescription Print Preview](screenshots/06_prescription_print_preview.png)

---

## 🔒 Core Principle — Patient Data Isolation

This system implements strict patient-data partitioning at the vector-database layer to ensure maximum clinical privacy:
- **Deterministic Namespaces:** Every patient has their own vector database collection in ChromaDB, named deterministically as `patient_{patient_id}_collection`.
- **Scoped RAG Queries:** RAG queries are strictly scoped to the collection matching the active patient ID — there are no shared collections or cross-patient query fallbacks.
- **Safety Verification:** Includes an automated test suite verifying zero cross-patient retrieval leakage.

---

## 📂 Directory Structure

Below is the directory map of the system. Click on the folder/file names to navigate directly to their source files:

- [/frontend](file:///c:/Users/gokul/hospital-voiceAI/frontend) - Next.js (App Router), TypeScript, Tailwind CSS, TanStack Query
- [/backend](file:///c:/Users/gokul/hospital-voiceAI/backend) - FastAPI, SQLAlchemy, Pydantic v2, PostgreSQL, ChromaDB
  - [backend/app/core](file:///c:/Users/gokul/hospital-voiceAI/backend/app/core) - Config, security (JWT, RBAC), dependencies, AES encryption helpers
  - [backend/app/models](file:///c:/Users/gokul/hospital-voiceAI/backend/app/models) - SQLAlchemy clinical models
  - [backend/app/schemas](file:///c:/Users/gokul/hospital-voiceAI/backend/app/schemas) - Pydantic v2 schemas
  - [backend/app/services](file:///c:/Users/gokul/hospital-voiceAI/backend/app/services) - LLM APIs, Speech (Whisper/Edge TTS), OCR (PaddleOCR/Gemini Vision), Chroma RAG, Medical Scribe, ReportLab PDF prescription builders
  - [backend/app/api/v1](file:///c:/Users/gokul/hospital-voiceAI/backend/app/api/v1) - Auth, Patients, Records, Visits, Prescriptions, Voice, RAG, Admin routers
  - [backend/app/prompt_templates](file:///c:/Users/gokul/hospital-voiceAI/backend/app/prompt_templates) - Externalized YAML/text prompt templates
  - [backend/tests](file:///c:/Users/gokul/hospital-voiceAI/backend/tests) - Patient isolation automated tests
- [/docker](file:///c:/Users/gokul/hospital-voiceAI/docker) - [docker-compose.yml](file:///c:/Users/gokul/hospital-voiceAI/docker/docker-compose.yml) for PostgreSQL data nodes
- [/storage](file:///c:/Users/gokul/hospital-voiceAI/storage) - Encrypted patient records and generated PDF prescriptions

---

## ⚙️ Required Environment Variables

Create a `.env` file in the [backend](file:///c:/Users/gokul/hospital-voiceAI/backend) directory (see [backend/.env](file:///c:/Users/gokul/hospital-voiceAI/backend/.env)) or set them in your system environment:

```env
# Selected LLM provider: 'gemini' or 'openai'
LLM_PROVIDER=gemini

# API Credentials (at least one is required depending on provider selection)
GEMINI_API_KEY=your-google-gemini-api-key
OPENAI_API_KEY=your-openai-api-key

# Relational Database connection (Port 5435 avoids host conflicts)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5435/hospital_voiceai

# AES-256 Fernet Encryption Key (URL-safe base64-encoded 32-byte key)
ENCRYPTION_KEY=8fKx_ZJvW9-B_T_zKz7X5d9G7O5l_G3vW2m_K1o_zX4=
```

---

## 🚀 Quick Start Guide

### 1. Start the Database Container
Spin up the PostgreSQL alpine container. It binds to host port `5435` to avoid port sharing conflicts with any local Windows database instances:
```powershell
docker compose -f docker/docker-compose.yml up -d
```

### 2. Activate Conda Environment & Install Python Requirements
This prototype utilizes a Python environment with necessary dependencies. From the project root, run:
```powershell
# Installs FastAPI, SQLAlchemy, asyncpg, cryptography, chromadb, ReportLab, edge-tts, etc.
pip install -r backend/requirements.txt
```

### 3. Seed Database & Create Tables
Create all database tables and seed default Doctor, Receptionist, and Patient data:
```powershell
python -m backend.app.seed
```

> [!NOTE]
> **Test Accounts Created:**
> - **Doctor Desk:** `doctor@hospital.com` / `Password123` (Cardiology Clinic)
> - **Reception Desk:** `reception@hospital.com` / `Password123` (Front desk receptionist)
> - **Admin Desk:** `admin@hospital.com` / `Password123` (Systems admin access)

### 4. Run Automated Patient Data Isolation Tests
Verify RAG safety and double check that cross-patient searches return zero leak results:
```powershell
python -m unittest backend.tests.test_isolation
```

### 5. Launch Backend FastAPI Server
```powershell
uvicorn backend.app.main:app --reload --port 8000
```
Interactive FastAPI Swagger documentation will be available at [http://localhost:8000/docs](http://localhost:8000/docs).

### 6. Launch Frontend Next.js Web Application
```powershell
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser. Log in using one of the quick testing links at the bottom of the login container.

---

## 🛠️ Feature Walkthrough

### 🎙️ Voice Registration & Reception Portal
The receptionist desk allows creating new patients, updating medical profile records, and registering patients' voice prints to speed up clinical visits.

### 📄 Medical Record Upload & OCR Engine
Supports PDF/image clinical records upload. It utilizes OCR models (PaddleOCR/Gemini Vision) to extract unstructured text from uploads, which is then parsed and structured before writing to the patient's timeline and the patient's local vector collection.

### 🕰️ Patient Timeline & RAG Sidebar
Clinical visits, prescriptions, and parsed external medical records are structured chronologically on a patient timeline. The AI Clinical Agent queries this data locally via ChromaDB RAG, assuring contextually relevant and safe responses.

### 📝 AI Medical Scribe & Voice Dictation
Doctors can dictate consultation findings directly using Whisper/Edge TTS speech integrations. The AI Medical Scribe interprets the draft text, classifies medical terms, builds a structured SOAP consultation report, and pre-fills prescription recommendations.

### 🖨️ Printable PDF Prescription Builder
Generate production-quality, formal clinic prescriptions using the ReportLab engine. Features custom table layouts, clinic signatures, and a clear patient timeline recap, saving directly to `/storage`.