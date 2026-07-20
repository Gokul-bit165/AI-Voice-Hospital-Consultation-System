import asyncio
import asyncpg

async def main():
    try:
        print("Connecting to DB...")
        conn = await asyncpg.connect("postgresql://postgres:postgres@localhost:5435/hospital_voiceai", timeout=5)
        print("Connected. Querying patients...")
        rows = await conn.fetch("SELECT id, full_name, blood_group, phone FROM patients;")
        print("Registered Patients:")
        for r in rows:
            print(dict(r))
        await conn.close()
    except Exception as e:
        print(f"Error querying database: {e}")

if __name__ == "__main__":
    asyncio.run(main())
