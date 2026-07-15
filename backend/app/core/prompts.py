import os
from functools import lru_cache
from backend.app.core.config import settings

@lru_cache(maxsize=16)
def load_prompt_template(filename: str) -> str:
    """
    Loads a prompt template from the backend/app/prompt_templates/ directory.
    """
    # Try looking in absolute workspace paths
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    template_path = os.path.join(base_dir, "prompt_templates", filename)
    
    if not os.path.exists(template_path):
        # Fallback if executing from a different cwd
        template_path = os.path.join("c:/Users/gokul/hospital-voiceAI/backend/app/prompt_templates", filename)
        
    try:
        with open(template_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        print(f"Error loading prompt template {filename}: {e}")
        # Return a simple fallback prompt if the file couldn't be loaded
        return ""
