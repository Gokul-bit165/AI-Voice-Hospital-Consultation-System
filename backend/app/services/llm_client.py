import json
from typing import Any, Dict, Optional, Type
import google.generativeai as genai
from openai import OpenAI
from pydantic import BaseModel
from backend.app.core.config import settings

class LLMClient:
    def __init__(self):
        self.provider = settings.LLM_PROVIDER.lower()
        self._openai_client = None
        self._gemini_initialized = False

        if self.provider == "openai":
            if settings.OPENAI_API_KEY:
                self._openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
            else:
                print("Warning: OPENAI_API_KEY not configured. Falling back to Gemini.")
                self.provider = "gemini"
        
        if self.provider == "gemini":
            if settings.GEMINI_API_KEY:
                genai.configure(api_key=settings.GEMINI_API_KEY)
                self._gemini_initialized = True
            else:
                print("Warning: GEMINI_API_KEY not configured. LLM calls will fail.")

    def get_openai_client(self) -> OpenAI:
        if not self._openai_client:
            self._openai_client = OpenAI(api_key=settings.OPENAI_API_KEY or "missing-key")
        return self._openai_client

    def generate_text(self, prompt: str, system_instruction: Optional[str] = None, response_format_json: bool = False) -> str:
        """
        Generates text using the configured LLM provider.
        """
        if self.provider == "openai":
            client = self.get_openai_client()
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            
            kwargs = {}
            if response_format_json:
                kwargs["response_format"] = {"type": "json_object"}
                
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.2,
                **kwargs
            )
            return response.choices[0].message.content or ""
            
        elif self.provider == "gemini":
            if not self._gemini_initialized:
                raise ValueError("Gemini API not configured. Please set GEMINI_API_KEY.")
            
            # Using gemini-1.5-flash for speed and reliability
            model_name = "gemini-1.5-flash"
            
            generation_config = {"temperature": 0.2}
            if response_format_json:
                generation_config["response_mime_type"] = "application/json"
                
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_instruction
            )
            
            response = model.generate_content(
                prompt,
                generation_config=generation_config
            )
            return response.text or ""
            
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")

    def extract_structured(self, prompt: str, response_model: Type[BaseModel], system_instruction: Optional[str] = None) -> Any:
        """
        Forces LLM to output JSON and parses it using a Pydantic model.
        """
        json_schema_desc = response_model.model_json_schema()
        schema_prompt = f"\n\nYou MUST respond ONLY with a JSON object that matches this JSON schema:\n{json.dumps(json_schema_desc, indent=2)}\nDo not wrap the JSON in ```json ``` code blocks. Output raw JSON only."
        
        full_prompt = prompt + schema_prompt
        
        raw_output = self.generate_text(
            prompt=full_prompt,
            system_instruction=system_instruction,
            response_format_json=True
        )
        
        # Clean potential markdown wraps if LLM didn't respect instructions
        cleaned = raw_output.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        
        try:
            return response_model.model_validate_json(cleaned)
        except Exception as e:
            print(f"Error parsing LLM output to Pydantic: {e}\nRaw output: {cleaned}")
            # Try a recovery step: load with json, set defaults
            try:
                data = json.loads(cleaned)
                return response_model.model_validate(data)
            except Exception as e2:
                print(f"Critical schema parsing failure: {e2}")
                # Return empty instance
                return response_model.model_construct()

llm_client = LLMClient()
