import chromadb
from typing import List, Dict, Any, Optional
import google.generativeai as genai
from openai import OpenAI
from backend.app.core.config import settings

class PluggableEmbeddingProvider:
    def __init__(self):
        self.provider = settings.LLM_PROVIDER.lower()
        self.openai_client = None
        self.is_openrouter = False
        
        if self.provider == "openai" and settings.OPENAI_API_KEY:
            if settings.OPENAI_API_KEY.startswith("sk-or-"):
                self.is_openrouter = True
                self.openai_client = OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=settings.OPENAI_API_KEY
                )
                print("OpenRouter API key detected. Configured OpenAI client for OpenRouter Embeddings.")
            else:
                self.openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
        elif self.provider == "gemini" and settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
            
        if self.provider == "openai" and self.openai_client:
            try:
                model_name = "openai/text-embedding-3-small" if self.is_openrouter else "text-embedding-3-small"
                response = self.openai_client.embeddings.create(
                    input=texts,
                    model=model_name
                )
                return [data.embedding for data in response.data]
            except Exception as e:
                print(f"OpenAI Embeddings error: {e}. Trying fallback...")
                
        if settings.GEMINI_API_KEY:
            try:
                # Use text-embedding-004
                response = genai.embed_content(
                    model="models/text-embedding-004",
                    content=texts
                )
                # Response is dictionary with 'embedding': [{'values': [...]}, ...]
                if "embedding" in response:
                    return [emb for emb in response["embedding"]]
                elif "embeddings" in response:
                    return [emb for emb in response["embeddings"]]
                else:
                    # Let's extract values if structured differently
                    return [emb["values"] for emb in response.get("embedding", [])]
            except Exception as e:
                print(f"Gemini Embeddings error: {e}")

        # Final Fallback mock embeddings (1536 float values) if no API key is available
        print("Warning: No Embedding API keys configured. Using mock embeddings.")
        mock_emb = [0.1] * 1536
        return [mock_emb for _ in texts]

class RAGService:
    def __init__(self):
        # Persistent chroma client
        self.chroma_client = chromadb.PersistentClient(path=settings.CHROMA_DIR)
        self.embedding_provider = PluggableEmbeddingProvider()

    def _get_collection_name(self, patient_id: str) -> str:
        """
        Deterministic, patient-isolated collection name.
        """
        # Collection names must be 3-63 chars, start/end with alphanumeric, no double periods
        # We replace dashes to ensure compliance with Chroma collection name regex
        clean_uuid = str(patient_id).replace("-", "")
        return f"patient_{clean_uuid}_collection"

    def get_or_create_patient_collection(self, patient_id: str):
        collection_name = self._get_collection_name(patient_id)
        return self.chroma_client.get_or_create_collection(
            name=collection_name
        )

    def add_patient_documents(self, patient_id: str, texts: List[str], metadatas: List[Dict[str, Any]], document_ids: List[str]):
        """
        Adds text chunks to a specific patient's isolated collection.
        """
        if not texts:
            return
            
        collection = self.get_or_create_patient_collection(patient_id)
        embeddings = self.embedding_provider.get_embeddings(texts)
        
        # Add to collection
        collection.add(
            ids=document_ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas
        )

    def query_patient_documents(self, patient_id: str, query: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """
        Queries only the specified patient's collection. No code path queries multiple collections.
        """
        collection_name = self._get_collection_name(patient_id)
        
        try:
            # Check if collection exists
            collection = self.chroma_client.get_collection(name=collection_name)
        except Exception:
            # Collection does not exist yet (no documents uploaded)
            return []
            
        query_embeddings = self.embedding_provider.get_embeddings([query])
        if not query_embeddings:
            return []
            
        results = collection.query(
            query_embeddings=query_embeddings,
            n_results=n_results
        )
        
        formatted_results = []
        if results and "documents" in results and results["documents"]:
            docs = results["documents"][0]
            metas = results["metadatas"][0] if "metadatas" in results and results["metadatas"] else [None] * len(docs)
            ids = results["ids"][0]
            distances = results["distances"][0] if "distances" in results and results["distances"] else [0.0] * len(docs)
            
            for doc, meta, doc_id, dist in zip(docs, metas, ids, distances):
                formatted_results.append({
                    "id": doc_id,
                    "document": doc,
                    "metadata": meta,
                    "distance": dist
                })
                
        return formatted_results

    def delete_patient_collection(self, patient_id: str):
        """
        Deletes the entire patient collection.
        """
        collection_name = self._get_collection_name(patient_id)
        try:
            self.chroma_client.delete_collection(name=collection_name)
        except Exception:
            pass # Collection did not exist

rag_service = RAGService()
