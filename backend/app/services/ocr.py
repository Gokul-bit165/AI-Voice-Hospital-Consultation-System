import os
from typing import Tuple
from PIL import Image
import google.generativeai as genai
from backend.app.core.config import settings

class OCRService:
    def __init__(self):
        self.paddle_ocr = None
        self.easy_ocr_reader = None
        
        # We will attempt to lazy load paddleocr and easyocr so the app starts even if they aren't fully installed
        self._paddle_initialized = False
        self._easyocr_initialized = False

    def _init_paddle(self):
        if self._paddle_initialized:
            return
        try:
            from paddleocr import PaddleOCR as POCR
            # use_gpu=True if we are running in GPU-enabled environment
            self.paddle_ocr = POCR(use_angle_cls=True, lang='en', use_gpu=True)
            self._paddle_initialized = True
            print("PaddleOCR successfully initialized with GPU support.")
        except Exception as e:
            print(f"Failed to load PaddleOCR: {e}. Will try fallback.")

    def _init_easyocr(self):
        if self._easyocr_initialized:
            return
        try:
            import easyocr
            # gpu=True since we are in GPU conda env
            self.easy_ocr_reader = easyocr.Reader(['en'], gpu=True)
            self._easyocr_initialized = True
            print("EasyOCR successfully initialized with GPU support.")
        except Exception as e:
            print(f"Failed to load EasyOCR: {e}. Will try fallback.")

    def run_ocr(self, file_path: str) -> Tuple[str, str, float]:
        """
        Runs the OCR pipeline:
        1. If Gemini Vision OCR flag is on, tries Gemini first (highly accurate, supports handwritten notes).
        2. Tries PaddleOCR.
        3. Tries EasyOCR as fallback.
        4. Returns (raw_text, engine_used, confidence_score)
        """
        # If Gemini Vision is enabled and key is configured, use it as primary/option
        if settings.ENABLE_GEMINI_VISION_OCR and settings.GEMINI_API_KEY:
            try:
                raw_text = self._run_gemini_vision_ocr(file_path)
                if raw_text and len(raw_text.strip()) > 10:
                    return raw_text, "GeminiVision", 0.98
            except Exception as e:
                print(f"Gemini Vision OCR failed: {e}. Proceeding to local OCR engines...")

        # Try PaddleOCR
        try:
            self._init_paddle()
            if self.paddle_ocr and file_path.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff', '.bmp')):
                result = self.paddle_ocr.ocr(file_path, cls=True)
                if result and result[0]:
                    txts = [line[1][0] for line in result[0]]
                    scores = [line[1][1] for line in result[0]]
                    raw_text = "\n".join(txts)
                    avg_score = sum(scores) / len(scores) if scores else 1.0
                    return raw_text, "PaddleOCR", avg_score
        except Exception as e:
            print(f"PaddleOCR processing failed: {e}. Trying EasyOCR...")

        # Try EasyOCR
        try:
            self._init_easyocr()
            if self.easy_ocr_reader and file_path.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff', '.bmp')):
                result = self.easy_ocr_reader.readtext(file_path)
                if result:
                    txts = [line[1] for line in result]
                    scores = [line[2] for line in result]
                    raw_text = "\n".join(txts)
                    avg_score = sum(scores) / len(scores) if scores else 1.0
                    return raw_text, "EasyOCR", avg_score
        except Exception as e:
            print(f"EasyOCR processing failed: {e}")

        # Final Fallback to PDF parsing if local OCR failed and it is a PDF
        if file_path.lower().endswith('.pdf'):
            try:
                # If Gemini is configured, upload and read PDF (since Gemini supports PDFs natively)
                if settings.GEMINI_API_KEY:
                    raw_text = self._run_gemini_vision_ocr(file_path, mime_type="application/pdf")
                    return raw_text, "GeminiVisionPDF", 0.95
            except Exception as e:
                print(f"Gemini PDF OCR failed: {e}")

        return "Error: Could not perform OCR on this file. Please verify file format and api keys.", "None", 0.0

    def _run_gemini_vision_ocr(self, file_path: str, mime_type: str = None) -> str:
        """
        Use Google Gemini API to transcribe an image or PDF.
        """
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not configured.")

        # Determine MIME type if not provided
        if not mime_type:
            ext = os.path.splitext(file_path)[1].lower()
            if ext == ".pdf":
                mime_type = "application/pdf"
            elif ext in (".jpg", ".jpeg"):
                mime_type = "image/jpeg"
            elif ext == ".png":
                mime_type = "image/png"
            else:
                mime_type = "image/jpeg"

        # Upload using the Files API (recommended for stability and size support)
        uploaded_file = genai.upload_file(path=file_path, mime_type=mime_type)
        
        try:
            # Instruct Gemini to extract all texts
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content([
                "Perform high-fidelity Optical Character Recognition (OCR) on this medical document. "
                "Transcribe all text exactly as written, preserving structure, headers, columns, and hand-written annotations. "
                "If it contains tables, transcribe them as clean markdown tables. Do not add summaries or interpretation.",
                uploaded_file
            ])
            text = response.text or ""
            return text.strip()
        finally:
            # Clean up online copy
            try:
                uploaded_file.delete()
            except Exception:
                pass

ocr_service = OCRService()
