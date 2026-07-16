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
        self.is_openrouter = False

        if self.provider == "openai":
            if settings.OPENAI_API_KEY:
                if settings.OPENAI_API_KEY.startswith("sk-or-"):
                    self.is_openrouter = True
                    self._openai_client = OpenAI(
                        base_url="https://openrouter.ai/api/v1",
                        api_key=settings.OPENAI_API_KEY
                    )
                    print("OpenRouter API key detected. Configured OpenAI client for OpenRouter.")
                else:
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
            if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.startswith("sk-or-"):
                self.is_openrouter = True
                self._openai_client = OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=settings.OPENAI_API_KEY
                )
            else:
                self._openai_client = OpenAI(api_key=settings.OPENAI_API_KEY or "missing-key")
        return self._openai_client

    def generate_text(self, prompt: str, system_instruction: Optional[str] = None, response_format_json: bool = False) -> str:
        """
        Generates text using the configured LLM provider.
        Supports dynamic API key rotation and same-model fallback.
        """
        from backend.app.core.api_keys import api_key_manager

        if self.provider == "openai":
            dyn_keys = api_key_manager.get_active_key_values("openai")
            dyn_or_keys = api_key_manager.get_active_key_values("openrouter")
            
            keys_to_try = []
            for k in dyn_keys:
                keys_to_try.append((k, k.startswith("sk-or-")))
            for k in dyn_or_keys:
                keys_to_try.append((k, True))
                
            if not keys_to_try and settings.OPENAI_API_KEY:
                keys_to_try.append((settings.OPENAI_API_KEY, settings.OPENAI_API_KEY.startswith("sk-or-")))

            if not keys_to_try:
                raise ValueError("No OpenAI/OpenRouter API keys configured.")

            last_exc = None
            for key, is_or in keys_to_try:
                try:
                    if is_or:
                        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=key)
                        model_name = "openai/gpt-4o-mini"
                    else:
                        client = OpenAI(api_key=key)
                        model_name = "gpt-4o-mini"

                    messages = []
                    if system_instruction:
                        messages.append({"role": "system", "content": system_instruction})
                    messages.append({"role": "user", "content": prompt})
                    
                    kwargs = {}
                    if response_format_json:
                        kwargs["response_format"] = {"type": "json_object"}
                    if is_or:
                        kwargs["max_tokens"] = 500

                    response = client.chat.completions.create(
                        model=model_name,
                        messages=messages,
                        temperature=0.2,
                        **kwargs
                    )
                    return response.choices[0].message.content or ""
                except Exception as e:
                    print(f"OpenAI key failed ({key[:10]}...): {e}")
                    api_key_manager.increment_fail_count("openai" if not is_or else "openrouter", key)
                    last_exc = e
            raise last_exc

        elif self.provider == "gemini":
            dyn_keys = api_key_manager.get_active_key_values("gemini")
            keys_to_try = list(dyn_keys)
            if not keys_to_try and settings.GEMINI_API_KEY:
                keys_to_try.append(settings.GEMINI_API_KEY)

            if not keys_to_try:
                raise ValueError("No Gemini API keys configured.")

            last_exc = None
            for key in keys_to_try:
                try:
                    genai.configure(api_key=key)
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
                except Exception as e:
                    print(f"Gemini key failed ({key[:10]}...): {e}")
                    api_key_manager.increment_fail_count("gemini", key)
                    last_exc = e
            raise last_exc
            
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
