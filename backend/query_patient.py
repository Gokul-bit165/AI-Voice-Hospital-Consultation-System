import asyncio
from sqlalchemy.future import select
from app.core.database import SessionLocal, engine
from app.models.models import Patient

async def main():
    try:
        async with SessionLocal() as session:
            result = await session.execute(select(Patient))
            patients = result.scalars().all()
            print("Registered Patients:")
            for p in patients:
                print(f"ID: {p.id}, Name: {p.full_name}, DOB: {p.date_of_birth}, Gender: {p.gender}, Phone: {p.phone}, Blood Group: {p.blood_group}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
