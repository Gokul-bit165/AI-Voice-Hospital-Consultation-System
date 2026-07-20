import asyncio
import os
import shutil
from backend.app.core.database import Base, engine
from backend.app.core.config import settings
from backend.app.seed import seed_data

async def reset_all():
    print("Resetting hospital voiceai system data...")

    # 1. Drop all tables
    print("Dropping all PostgreSQL tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    print("Tables dropped and re-created.")

    # 2. Clear Chroma collection directories
    chroma_dirs = [
        settings.CHROMA_DIR,
        os.path.join(settings.STORAGE_DIR, "chroma_old"),
        os.path.join(settings.STORAGE_DIR, "chroma_test_fresh")
    ]
    for c_dir in chroma_dirs:
        if os.path.exists(c_dir):
            print(f"Removing Chroma directory: {c_dir}")
            shutil.rmtree(c_dir, ignore_errors=True)

    # 3. Clear Patient medical records files
    patients_dir = os.path.join(settings.STORAGE_DIR, "patients")
    if os.path.exists(patients_dir):
        print(f"Removing physical patient records: {patients_dir}")
        shutil.rmtree(patients_dir, ignore_errors=True)
    os.makedirs(patients_dir, exist_ok=True)

    # 4. Clear Draft uploads
    drafts_dir = os.path.join(settings.STORAGE_DIR, "drafts")
    if os.path.exists(drafts_dir):
        print(f"Removing drafts uploads: {drafts_dir}")
        shutil.rmtree(drafts_dir, ignore_errors=True)
    os.makedirs(drafts_dir, exist_ok=True)

    # 5. Run standard Seeding to populate default entries
    print("Running initial database seeding...")
    await seed_data()

    print("SUCCESS: System data reset complete. Ready for fresh uploads!")

if __name__ == "__main__":
    asyncio.run(reset_all())
