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
            # Support both older PaddleOCR (using use_gpu) and newer versions (using device)
            try:
                self.paddle_ocr = POCR(use_angle_cls=True, lang='ch', device='gpu')
            except Exception:
                try:
                    self.paddle_ocr = POCR(use_angle_cls=True, lang='ch', use_gpu=True)
                except Exception:
                    # Fallback to CPU if GPU initialization fails
                    try:
                        self.paddle_ocr = POCR(use_angle_cls=True, lang='ch', device='cpu')
                    except Exception:
                        try:
                            self.paddle_ocr = POCR(use_angle_cls=True, lang='ch', use_gpu=False)
                        except Exception as e4:
                            raise RuntimeError(
                                "PaddleOCR requires 'paddlepaddle' (for CPU) or 'paddlepaddle-gpu' (for GPU) "
                                "package to be installed in your environment."
                            ) from e4
            
            self._paddle_initialized = True
            print("PaddleOCR successfully initialized.")
        except Exception as e:
            print(f"Failed to load PaddleOCR: {e}. Will try fallback.")

    def _init_easyocr(self):
        if self._easyocr_initialized:
            return
        try:
            import easyocr
            # Try GPU first
            try:
                self.easy_ocr_reader = easyocr.Reader(['en'], gpu=True)
                print("EasyOCR successfully initialized with GPU support.")
            except Exception as e:
                print(f"Failed to load EasyOCR with GPU support: {e}. Trying CPU fallback...")
                self.easy_ocr_reader = easyocr.Reader(['en'], gpu=False)
                print("EasyOCR successfully initialized in CPU mode.")
            self._easyocr_initialized = True
        except Exception as e:
            print(f"Failed to load EasyOCR: {e}. Will try fallback.")

    def _run_local_ocr_on_image(self, file_path: str) -> Tuple[str, str, float]:
        """
        Runs PaddleOCR or EasyOCR on an image file.
        """
        # Try PaddleOCR
        try:
            self._init_paddle()
            if self.paddle_ocr:
                try:
                    result = self.paddle_ocr.ocr(file_path, cls=True)
                except Exception as e:
                    print(f"PaddleOCR GPU/default inference failed: {e}. Retrying with CPU configuration...")
                    from paddleocr import PaddleOCR as POCR
                    try:
                        self.paddle_ocr = POCR(use_angle_cls=True, lang='ch', device='cpu')
                    except Exception:
                        self.paddle_ocr = POCR(use_angle_cls=True, lang='ch', use_gpu=False)
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
            if self.easy_ocr_reader:
                try:
                    result = self.easy_ocr_reader.readtext(file_path)
                except Exception as e:
                    print(f"EasyOCR GPU/default inference failed: {e}. Retrying on CPU...")
                    import easyocr
                    self.easy_ocr_reader = easyocr.Reader(['en'], gpu=False)
                    result = self.easy_ocr_reader.readtext(file_path)
                    
                if result:
                    txts = [line[1] for line in result]
                    scores = [line[2] for line in result]
                    raw_text = "\n".join(txts)
                    avg_score = sum(scores) / len(scores) if scores else 1.0
                    return raw_text, "EasyOCR", avg_score
        except Exception as e:
            print(f"EasyOCR processing failed: {e}")

        return "", "None", 0.0

    def run_ocr(self, file_path: str) -> Tuple[str, str, float]:
        """
        Runs the OCR pipeline:
        1. If Gemini Vision OCR flag is on, tries Gemini first (highly accurate, supports handwritten notes).
        2. For images: Tries PaddleOCR, then EasyOCR as fallback.
        3. For PDFs: Tries local pypdf text extraction. If it's a scanned PDF, extracts embedded images and runs local OCR on them.
        4. Returns (raw_text, engine_used, confidence_score)
        """
        # If Gemini Vision is enabled and key is configured, use it as primary/option
        if settings.ENABLE_GEMINI_VISION_OCR and settings.GEMINI_API_KEY:
            try:
                raw_text = self._run_gemini_vision_ocr(file_path)
                if raw_text and len(raw_text.strip()) > 10:
                    engine = "GeminiVision" if not file_path.lower().endswith('.pdf') else "GeminiVisionPDF"
                    return raw_text, engine, 0.98
            except Exception as e:
                print(f"Gemini Vision OCR failed: {e}. Proceeding to local OCR...")

        # If it is a PDF:
        if file_path.lower().endswith('.pdf'):
            # 1. Try local digital text extraction via pypdf
            try:
                import pypdf
                reader = pypdf.PdfReader(file_path)
                text_list = []
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        text_list.append(text)
                raw_text = "\n".join(text_list).strip()
                if len(raw_text) > 10:
                    return raw_text, "pypdf", 1.0
            except Exception as e:
                print(f"Local pypdf text extraction failed: {e}")

            # 2. If no digital text extracted, it could be a scanned PDF.
            # Try to extract embedded images from the PDF and run local OCR on them.
            try:
                import pypdf
                reader = pypdf.PdfReader(file_path)
                temp_files = []
                extracted_texts = []
                engines = []
                scores = []

                for page_idx, page in enumerate(reader.pages):
                    for img_idx, img_obj in enumerate(page.images):
                        temp_name = f"temp_ocr_p{page_idx}_i{img_idx}_{os.path.basename(file_path)}.jpg"
                        temp_path = os.path.join(settings.STORAGE_DIR, temp_name)
                        
                        # Save image bytes
                        with open(temp_path, "wb") as f:
                            f.write(img_obj.data)
                        temp_files.append(temp_path)

                        # Run local OCR on the extracted image
                        img_text, engine, score = self._run_local_ocr_on_image(temp_path)
                        if img_text.strip():
                            extracted_texts.append(img_text)
                            engines.append(engine)
                            scores.append(score)

                # Clean up temp files
                for temp_file in temp_files:
                    try:
                        if os.path.exists(temp_file):
                            os.remove(temp_file)
                    except Exception as ce:
                        print(f"Failed to remove temp file {temp_file}: {ce}")

                if extracted_texts:
                    combined_text = "\n\n".join(extracted_texts)
                    # Unique engines used
                    used_engine = f"ScannedPDF-{'/'.join(list(set(engines)))}"
                    avg_score = sum(scores) / len(scores) if scores else 1.0
                    return combined_text, used_engine, avg_score

            except Exception as e:
                print(f"Scanned PDF local OCR extraction failed: {e}")

        # If it is an image:
        elif file_path.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff', '.bmp')):
            raw_text, engine, score = self._run_local_ocr_on_image(file_path)
            if engine != "None":
                return raw_text, engine, score

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
