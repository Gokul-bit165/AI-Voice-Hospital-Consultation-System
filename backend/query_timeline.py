import asyncio
import asyncpg

async def main():
    try:
        conn = await asyncpg.connect("postgresql://postgres:postgres@localhost:5435/hospital_voiceai")
        
        # Query timelines
        rows = await conn.fetch(
            "SELECT event_type, event_summary, created_at FROM timelines WHERE patient_id = '29b0f7f9-5497-46c4-9f58-74d2c0a7d7b3' ORDER BY created_at;"
        )
        print("Timeline Events for KISHORE:")
        for r in rows:
            print(dict(r))
            
        # Query audit logs
        audit_rows = await conn.fetch(
            "SELECT action, entity_type, entity_id, timestamp FROM audit_logs WHERE entity_id = '29b0f7f9-5497-46c4-9f58-74d2c0a7d7b3' OR (entity_type = 'MedicalRecord' AND entity_id IN (SELECT id::text FROM medical_records WHERE patient_id = '29b0f7f9-5497-46c4-9f58-74d2c0a7d7b3')) ORDER BY timestamp DESC LIMIT 10;"
        )
        print("\nRecent Audit Logs:")
        for ar in audit_rows:
            print(dict(ar))
            
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
