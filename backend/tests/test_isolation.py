import uuid
import unittest
from backend.app.services.rag import rag_service

class TestPatientDataIsolation(unittest.TestCase):
    def setUp(self):
        # Deterministic IDs for Patient A and Patient B
        self.patient_a_id = str(uuid.uuid4())
        self.patient_b_id = str(uuid.uuid4())
        
        # Test documents
        self.patient_a_texts = [
            "Patient John Doe has severe cardiac arrhythmia, diagnosed in June 2026.",
            "Prescribed Metoprolol 50mg daily for chest discomfort."
        ]
        self.patient_b_texts = [
            "Patient Jane Smith is recovering from left knee arthroscopy.",
            "Allergic to Sulfa Drugs and Ibuprofen."
        ]

    def tearDown(self):
        # Clean up collections
        rag_service.delete_patient_collection(self.patient_a_id)
        rag_service.delete_patient_collection(self.patient_b_id)

    def test_isolation(self):
        # 1. Populate Patient A's collection
        rag_service.add_patient_documents(
            patient_id=self.patient_a_id,
            texts=self.patient_a_texts,
            metadatas=[{"patient": "A"}, {"patient": "A"}],
            document_ids=[f"doc_a_1", f"doc_a_2"]
        )

        # 2. Populate Patient B's collection
        rag_service.add_patient_documents(
            patient_id=self.patient_b_id,
            texts=self.patient_b_texts,
            metadatas=[{"patient": "B"}, {"patient": "B"}],
            document_ids=[f"doc_b_1", f"doc_b_2"]
        )

        # 3. Query Patient A's collection for Patient A's disease
        results_a = rag_service.query_patient_documents(
            patient_id=self.patient_a_id,
            query="cardiac arrhythmia metoprolol",
            n_results=5
        )
        
        self.assertGreater(len(results_a), 0, "Querying A for A details should return results")
        all_docs_text = " ".join([res["document"] for res in results_a])
        self.assertIn("John Doe", all_docs_text, "Should contain Patient A info (John Doe)")
        self.assertIn("Metoprolol", all_docs_text, "Should contain Patient A info (Metoprolol)")
        for res in results_a:
            self.assertEqual(res["metadata"]["patient"], "A", "Results from A's collection must belong to A")

        # 4. CRITICAL: Query Patient B's collection for Patient A's details
        # It must return ZERO results related to Patient A
        results_b_for_a = rag_service.query_patient_documents(
            patient_id=self.patient_b_id,
            query="cardiac arrhythmia metoprolol",
            n_results=5
        )
        
        # The query will return matching items inside B's collection (which are knee surgery files)
        # but it must NOT contain John Doe / Metoprolol text.
        for res in results_b_for_a:
            self.assertEqual(res["metadata"]["patient"], "B", "Results from B's collection must belong to B")
            self.assertNotIn("John Doe", res["document"], "Cross-patient leak! Found Patient A info in Patient B's query")
            self.assertNotIn("Metoprolol", res["document"], "Cross-patient leak! Found Patient A info in Patient B's query")

        # 5. Query Patient A's collection for Patient B's allergy
        results_a_for_b = rag_service.query_patient_documents(
            patient_id=self.patient_a_id,
            query="Sulfa Drugs Ibuprofen knee",
            n_results=5
        )
        
        for res in results_a_for_b:
            self.assertEqual(res["metadata"]["patient"], "A", "Results from A's collection must belong to A")
            self.assertNotIn("Jane Smith", res["document"], "Cross-patient leak! Found Patient B info in Patient A's query")
            self.assertNotIn("knee", res["document"], "Cross-patient leak! Found Patient B info in Patient A's query")

        print("SUCCESS: Patient data isolation test passed. Zero cross-patient leaks detected.")

if __name__ == "__main__":
    unittest.main()
