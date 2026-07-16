#!/usr/bin/env python
"""
OCR Text Extraction Test Utility

This script allows testing the OCR extraction pipeline on a specific document (Image or PDF)
using the configured backend services (Gemini Vision OCR, PaddleOCR, EasyOCR, or PDF fallback).
It displays the extracted text, the OCR engine that was used, and the confidence score.

Usage:
    python test_ocr.py <path_to_document>

Example:
    python test_ocr.py "storage/patients/.../records/some_report.pdf"
"""

import sys
import os

# Adjust Python path so that backend imports work correctly when running from the root directory
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

def main():
    if len(sys.argv) < 2:
        print("Error: Missing file path.")
        print("\nUsage:")
        print("  python test_ocr.py <path_to_document>")
        print("\nExample:")
        print("  python test_ocr.py \"storage/patients/29b0f7f9-5497-46c4-9f58-74d2c0a7d7b3/records/f340db91-5692-46c7-9756-30f57a0711cf_NEHA_Hospital_Report_Kishore.pdf\"")
        sys.exit(1)

    file_path = sys.argv[1]

    # Verify if file exists
    if not os.path.exists(file_path):
        print(f"Error: File '{file_path}' does not exist.")
        sys.exit(1)

    # Convert to absolute path for reliability
    abs_file_path = os.path.abspath(file_path)
    print(f"Testing OCR on: {abs_file_path}")
    print("Initializing OCR pipeline (this might load/download OCR weights if using local engines for the first time)...")

    try:
        from backend.app.services.ocr import ocr_service
        from backend.app.core.config import settings

        # Log configuration status
        print(f"Gemini API Configured: {'YES' if settings.GEMINI_API_KEY else 'NO'}")
        print(f"Gemini OCR Enabled in settings: {settings.ENABLE_GEMINI_VISION_OCR}")
        print("-" * 50)
        
        # Run OCR
        raw_text, engine_used, confidence_score = ocr_service.run_ocr(abs_file_path)

        print("\n" + "=" * 50)
        print("                     OCR RESULTS")
        print("=" * 50)
        print(f"Engine Used:      {engine_used}")
        print(f"Confidence Score: {confidence_score:.4f}")
        print("-" * 50)
        print("Extracted Raw Text:")
        print("-" * 50)
        print(raw_text)
        print("=" * 50 + "\n")

    except ImportError as e:
        print(f"Import Error: Could not import backend modules. Make sure you are in the correct python environment.")
        print(f"Details: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred during OCR execution: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
