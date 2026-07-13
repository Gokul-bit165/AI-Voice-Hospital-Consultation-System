import os
from typing import List
from pydantic import BaseModel
from backend.app.core.config import settings
from backend.app.core.prompts import load_prompt_template
from backend.app.services.llm_client import llm_client
from backend.app.schemas.schemas import MedicineSchema, PrescriptionBase

# ReportLab imports
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.barcode.qr import QrCodeWidget

class DictatedPrescriptionOutput(BaseModel):
    medicines: List[MedicineSchema] = []

class PrescriptionService:
    def parse_dictation(self, dictation: str) -> List[MedicineSchema]:
        """
        Parses free-form spoken prescription dictation into a structured list of medicines.
        """
        if not dictation or len(dictation.strip()) < 5:
            return []
            
        template = load_prompt_template("prescription_extraction.txt")
        formatted_prompt = template.format(dictation=dictation)
        
        system_instruction = (
            "You are an expert pharmacology transcription system. "
            "Convert prescription dictation into a structured JSON list of medicines. "
            "Strictly transcribe only. Do not invent dosage instructions."
        )
        
        extracted: DictatedPrescriptionOutput = llm_client.extract_structured(
            prompt=formatted_prompt,
            response_model=DictatedPrescriptionOutput,
            system_instruction=system_instruction
        )
        
        return extracted.medicines

    def generate_prescription_pdf(
        self, 
        patient_id: str, 
        visit_id: str, 
        patient_data: dict, 
        doctor_data: dict, 
        medicines: List[dict],
        visit_date: str
    ) -> str:
        """
        Generates a clean, professional, minimal black-and-white A4 printable prescription PDF.
        Includes hospital logo info, doctor credentials, patient details, medicine grid, signature line, and native QR code.
        """
        patient_folder = os.path.join(settings.STORAGE_DIR, "patients", str(patient_id), "prescriptions")
        os.makedirs(patient_folder, exist_ok=True)
        pdf_filename = f"{visit_id}_prescription.pdf"
        pdf_path = os.path.join(patient_folder, pdf_filename)

        doc = SimpleDocTemplate(
            pdf_path,
            pagesize=A4,
            leftMargin=40,
            rightMargin=40,
            topMargin=40,
            bottomMargin=40
        )

        styles = getSampleStyleSheet()
        
        # Define styles
        title_style = ParagraphStyle(
            'HospitalTitle',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=22,
            leading=26,
            textColor=colors.black
        )
        subtitle_style = ParagraphStyle(
            'HospitalSubtitle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=14,
            textColor=colors.gray
        )
        section_heading = ParagraphStyle(
            'SectionHeading',
            parent=styles['Heading3'],
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=16,
            textColor=colors.black
        )
        body_style = ParagraphStyle(
            'Body',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=14
        )
        body_bold = ParagraphStyle(
            'BodyBold',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=14
        )
        medicines_header_style = ParagraphStyle(
            'MedHeader',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=12,
            textColor=colors.white
        )

        story = []

        # Header Table: Logo/Hospital Name Left, Doctor Details Right
        header_left = [
            Paragraph("METRO HEALTH CENTRE", title_style),
            Paragraph("123 Care Street, Medical District, Cityville", subtitle_style),
            Paragraph("Phone: +1 (555) 019-2834 | contact@metrohealth.com", subtitle_style),
        ]
        
        header_right = [
            Paragraph(f"<b>Dr. {doctor_data.get('full_name', 'Doctor')}</b>", body_bold),
            Paragraph(f"{doctor_data.get('specialization', 'General Physician')}", body_style),
            Paragraph(f"License: {doctor_data.get('license_number', 'N/A')}", subtitle_style),
            Paragraph(f"Phone: {doctor_data.get('phone', 'N/A')}", subtitle_style),
        ]

        header_table_data = [
            [header_left, header_right]
        ]
        
        header_table = Table(header_table_data, colWidths=[300, 215])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ]))
        story.append(header_table)

        # Draw a divider line
        divider = Table([[""]], colWidths=[515])
        divider.setStyle(TableStyle([
            ('LINEBELOW', (0,0), (-1,-1), 1, colors.black),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('TOPPADDING', (0,0), (-1,-1), 5),
        ]))
        story.append(divider)
        story.append(Spacer(1, 10))

        # Metadata Table: Patient Details Left, Visit Details Right
        patient_info = [
            Paragraph(f"<b>Patient:</b> {patient_data.get('full_name', 'N/A')}", body_style),
            Paragraph(f"<b>Age / Gender:</b> {patient_data.get('age', 'N/A')} / {patient_data.get('gender', 'N/A')}", body_style),
            Paragraph(f"<b>Phone:</b> {patient_data.get('phone', 'N/A')}", body_style),
            Paragraph(f"<b>Blood Group:</b> {patient_data.get('blood_group', 'N/A')}", body_style),
            Paragraph(f"<b>Allergies:</b> {', '.join(patient_data.get('allergies', [])) or 'None Known'}", body_style),
        ]

        visit_info = [
            Paragraph(f"<b>Prescription Date:</b> {visit_date}", body_style),
            Paragraph(f"<b>Visit ID:</b> {visit_id}", body_style),
        ]

        meta_table_data = [
            [patient_info, visit_info]
        ]
        meta_table = Table(meta_table_data, colWidths=[300, 215])
        meta_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8F9FA")),
            ('PADDING', (0,0), (-1,-1), 8),
            ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 20))

        # Medicine Section Header
        story.append(Paragraph("Rx (Prescription Details)", section_heading))
        story.append(Spacer(1, 8))

        # Medicine Grid
        # Headers: S.No, Medicine Name, Strength, Dosage/Frequency, Duration, Instructions
        med_headers = [
            Paragraph("S.No", medicines_header_style),
            Paragraph("Medicine", medicines_header_style),
            Paragraph("Strength", medicines_header_style),
            Paragraph("Frequency", medicines_header_style),
            Paragraph("Duration", medicines_header_style),
            Paragraph("Instructions / Warnings", medicines_header_style),
        ]
        
        med_table_data = [med_headers]
        
        for idx, med in enumerate(medicines, 1):
            name = med.get('name', 'N/A')
            strength = med.get('strength', 'N/A') or 'N/A'
            freq = med.get('frequency', 'N/A') or 'N/A'
            duration = med.get('duration', 'N/A') or 'N/A'
            
            instr = med.get('instructions', '') or ''
            warn = med.get('warnings', '') or ''
            instructions_combined = f"{instr}. {warn}".strip(". ")
            if not instructions_combined:
                instructions_combined = "As directed by physician"

            med_table_data.append([
                Paragraph(str(idx), body_style),
                Paragraph(f"<b>{name}</b>", body_style),
                Paragraph(strength, body_style),
                Paragraph(freq, body_style),
                Paragraph(duration, body_style),
                Paragraph(instructions_combined, body_style),
            ])

        med_table = Table(med_table_data, colWidths=[35, 120, 70, 80, 60, 150])
        med_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1A202C")), # Dark slate/black header
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F9FA")]),
        ]))
        story.append(med_table)
        story.append(Spacer(1, 40))

        # Bottom section: Signature block on right, Native QR code on left
        # Generate QR code containing the visit ID
        qr_code = QrCodeWidget(value=str(visit_id), width=65, height=65)
        qr_drawing = Drawing(65, 65)
        qr_drawing.add(qr_code)

        bottom_left = [
            Paragraph("<b>Scan to verify visit authenticity</b>", subtitle_style),
            Spacer(1, 5),
            qr_drawing
        ]

        bottom_right = [
            Spacer(1, 20),
            Table([[""]], colWidths=[150], style=TableStyle([('LINEBELOW', (0,0), (-1,-1), 1, colors.black)])),
            Spacer(1, 5),
            Paragraph("Prescribing Doctor's Signature", body_bold),
            Paragraph(f"Dr. {doctor_data.get('full_name', 'Doctor')}", subtitle_style),
        ]

        bottom_table_data = [
            [bottom_left, bottom_right]
        ]
        bottom_table = Table(bottom_table_data, colWidths=[250, 265])
        bottom_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
            ('ALIGN', (1,0), (1,0), 'RIGHT'),
        ]))
        story.append(bottom_table)

        # Build PDF
        doc.build(story)
        
        # Return path relative to settings.STORAGE_DIR to save cleanly in the db
        relative_path = os.path.relpath(pdf_path, settings.STORAGE_DIR)
        # Convert path separators to forward slashes for cross-platform compliance
        return relative_path.replace("\\", "/")

prescription_service = PrescriptionService()
