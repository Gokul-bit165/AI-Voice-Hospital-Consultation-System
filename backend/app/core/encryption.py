import json
from typing import Any, Optional
from cryptography.fernet import Fernet
from backend.app.core.config import settings

# Initialize Fernet cipher. In a real system, the key should be loaded securely from environment.
# Since we provided a default safe Fernet key in settings, we can use it directly.
try:
    cipher = Fernet(settings.ENCRYPTION_KEY.encode())
except Exception as e:
    # If the key is invalid (e.g. not 32 base64 bytes), generate a temporary valid key
    # but print a warning.
    import base64
    fallback_key = Fernet.generate_key()
    cipher = Fernet(fallback_key)
    print(f"Warning: Invalid ENCRYPTION_KEY, generated a fallback key: {fallback_key.decode()}. Error: {e}")

def encrypt_text(text: Optional[str]) -> Optional[str]:
    if text is None:
        return None
    if not isinstance(text, str):
        text = str(text)
    return cipher.encrypt(text.encode('utf-8')).decode('utf-8')

def decrypt_text(encrypted_text: Optional[str]) -> Optional[str]:
    if encrypted_text is None:
        return None
    try:
        return cipher.decrypt(encrypted_text.encode('utf-8')).decode('utf-8')
    except Exception as e:
        print(f"Decryption error: {e}")
        return encrypted_text # Fallback to original text if not encrypted or key mismatch

def encrypt_json(data: Any) -> Optional[str]:
    if data is None:
        return None
    serialized = json.dumps(data)
    return encrypt_text(serialized)

def decrypt_json(encrypted_json: Optional[str]) -> Any:
    if encrypted_json is None:
        return None
    decrypted_str = decrypt_text(encrypted_json)
    try:
        return json.loads(decrypted_str)
    except Exception as e:
        print(f"JSON Decryption parsing error: {e}")
        return decrypted_str
