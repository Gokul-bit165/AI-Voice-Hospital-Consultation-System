import threading
from typing import List, Dict, Optional

class ApiKeyManager:
    def __init__(self):
        self._lock = threading.Lock()
        # Structure: { "service_name": [{"id": str, "key": str, "priority": int, "fail_count": int}] }
        self._keys: Dict[str, List[dict]] = {}
        self._indices: Dict[str, int] = {}

    def set_keys(self, service: str, keys: List[dict]):
        """
        Sets and caches the keys for a given service.
        Automatically sorts them by priority in descending order (higher priority first).
        """
        service_key = service.lower()
        sorted_keys = sorted(keys, key=lambda x: x.get("priority", 1), reverse=True)
        with self._lock:
            self._keys[service_key] = sorted_keys
            self._indices[service_key] = 0

    def get_keys(self, service: str) -> List[dict]:
        service_key = service.lower()
        with self._lock:
            return list(self._keys.get(service_key, []))

    def get_active_key_values(self, service: str) -> List[str]:
        service_key = service.lower()
        with self._lock:
            keys = self._keys.get(service_key, [])
            return [k["key"] for k in keys if k.get("key")]

    def get_next_key(self, service: str) -> Optional[str]:
        service_key = service.lower()
        with self._lock:
            keys = self._keys.get(service_key, [])
            if not keys:
                return None
            idx = self._indices.get(service_key, 0)
            key_item = keys[idx % len(keys)]
            self._indices[service_key] = (idx + 1) % len(keys)
            return key_item["key"]

    def increment_fail_count(self, service: str, key_value: str):
        service_key = service.lower()
        with self._lock:
            keys = self._keys.get(service_key, [])
            for k in keys:
                if k["key"] == key_value:
                    k["fail_count"] = k.get("fail_count", 0) + 1
                    break

api_key_manager = ApiKeyManager()

async def load_api_keys():
    from backend.app.core.database import SessionLocal
    from backend.app.models.models import ApiKey
    from sqlalchemy.future import select
    
    try:
        async with SessionLocal() as db:
            result = await db.execute(select(ApiKey).filter(ApiKey.is_active == True))
            keys = result.scalars().all()
            
            # Group keys by service
            grouped_keys = {}
            for key in keys:
                service = key.service.lower()
                if service not in grouped_keys:
                    grouped_keys[service] = []
                grouped_keys[service].append({
                    "id": key.id,
                    "key": key.key_value,
                    "priority": key.priority,
                    "fail_count": key.fail_count
                })
            
            # Clear existing keys first by setting empty lists for known services
            for s in ["openai", "gemini", "groq", "openrouter"]:
                api_key_manager.set_keys(s, [])
                
            for service, key_list in grouped_keys.items():
                api_key_manager.set_keys(service, key_list)
            print(f"Successfully loaded API keys from database. Service counts: { {s: len(k) for s, k in grouped_keys.items()} }")
    except Exception as e:
        print(f"Error loading API keys: {e}")

