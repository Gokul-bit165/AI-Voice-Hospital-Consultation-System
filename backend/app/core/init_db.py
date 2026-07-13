from backend.app.core.database import Base, engine
# Import all models to ensure they are registered on Base before creation
from backend.app.models.models import Doctor, Patient, MedicalRecord, OCRRecord, Embedding, Visit, Prescription, Conversation, Timeline, AuditLog

async def create_tables():
    """
    Creates all database tables defined in models.py using engine.begin().
    """
    print("Initializing database tables...")
    async with engine.begin() as conn:
        # To make it clean and repeatable for a prototype, we don't drop tables,
        # we just create if they don't exist.
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables initialized successfully.")
