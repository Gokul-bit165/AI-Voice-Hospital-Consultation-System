import asyncio
from datetime import date, datetime
from sqlalchemy.future import select
from backend.app.core.database import SessionLocal
from backend.app.core.security import get_password_hash
from backend.app.core.init_db import create_tables
from backend.app.models.models import Doctor, Patient, Timeline

async def seed_data():
    # Ensure tables exist
    await create_tables()
    
    async with SessionLocal() as session:
        # 1. Seed Users (Doctors, Reception, Admin)
        users_to_seed = [
            {
                "email": "doctor@hospital.com",
                "full_name": "Sarah Jenkins",
                "specialization": "Cardiology",
                "license_number": "LIC-908123",
                "phone": "555-019-1234",
                "password": "Password123",
                "role": "Doctor"
            },
            {
                "email": "reception@hospital.com",
                "full_name": "Mark Miller",
                "specialization": "Reception Desk",
                "license_number": "N/A",
                "phone": "555-019-5678",
                "password": "Password123",
                "role": "Reception"
            },
            {
                "email": "admin@hospital.com",
                "full_name": "Alex Carter",
                "specialization": "IT Systems",
                "license_number": "N/A",
                "phone": "555-019-0000",
                "password": "Password123",
                "role": "Admin"
            }
        ]
        
        seeded_doctors = {}
        for u in users_to_seed:
            result = await session.execute(select(Doctor).filter(Doctor.email == u["email"]))
            existing_user = result.scalars().first()
            if not existing_user:
                db_user = Doctor(
                    email=u["email"],
                    full_name=u["full_name"],
                    specialization=u["specialization"],
                    license_number=u["license_number"],
                    phone=u["phone"],
                    password_hash=get_password_hash(u["password"]),
                    role=u["role"]
                )
                session.add(db_user)
                await session.flush() # Populate ID
                seeded_doctors[u["role"]] = db_user
                print(f"Seeded user: {u['email']} as {u['role']}")
            else:
                seeded_doctors[u["role"]] = existing_user
                print(f"User {u['email']} already exists.")
                
        # 2. Seed Patients
        patients_to_seed = [
            {
                "full_name": "John Doe",
                "date_of_birth": date(1980, 5, 15),
                "gender": "Male",
                "phone": "9876543210",
                "address": "456 Oak Lane, Metro City",
                "emergency_contact_name": "Mary Doe",
                "emergency_contact_phone": "9876543211",
                "blood_group": "A+",
                "allergies": ["Penicillin", "Peanuts"]
            },
            {
                "full_name": "Jane Smith",
                "date_of_birth": date(1992, 11, 23),
                "gender": "Female",
                "phone": "1234567890",
                "address": "789 Pine Road, Cityville",
                "emergency_contact_name": "Robert Smith",
                "emergency_contact_phone": "1234567891",
                "blood_group": "O-",
                "allergies": ["Sulfa Drugs"]
            }
        ]
        
        for p in patients_to_seed:
            result = await session.execute(select(Patient).filter(Patient.phone == p["phone"]))
            existing_patient = result.scalars().first()
            if not existing_patient:
                db_patient = Patient(
                    full_name=p["full_name"],
                    date_of_birth=p["date_of_birth"],
                    gender=p["gender"],
                    phone=p["phone"],
                    address=p["address"],
                    emergency_contact_name=p["emergency_contact_name"],
                    emergency_contact_phone=p["emergency_contact_phone"],
                    blood_group=p["blood_group"]
                )
                db_patient.allergies = p["allergies"] # trigger encryption setter
                session.add(db_patient)
                await session.flush()
                
                # Add timeline registration event
                timeline_evt = Timeline(
                    patient_id=db_patient.id,
                    event_type="registration",
                    event_summary="Patient profile created via reception desk.",
                    event_date=datetime.now()
                )
                session.add(timeline_evt)
                
                print(f"Seeded patient: {p['full_name']}")
            else:
                print(f"Patient {p['full_name']} already exists.")
                
        await session.commit()
        print("Data seeding completed successfully.")

if __name__ == "__main__":
    asyncio.run(seed_data())
