import os
import json
from datetime import datetime
from supabase import create_client, Client
import logging

logger = logging.getLogger(__name__)


class SupabaseManager:
    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_KEY")
        self.storage_bucket = "docking-results"

        if not self.url or not self.key:
            raise ValueError(
                "❌ Missing SUPABASE_URL or SUPABASE_KEY environment variables"
            )

        self.client: Client = create_client(self.url, self.key)
        logger.info(f"✅ Connected to Supabase: {self.url}")

    # ========== SESSION MANAGEMENT ==========

    def create_session(self, session_id: str, protein_name: str = None, ligand_name: str = None) -> dict:
        """Create or store session metadata"""
        response = self.client.table("docking_sessions").insert({
            "id": session_id,
            "protein_name": protein_name,
            "ligand_name": ligand_name,
            "status": "active",
            "created_at": datetime.utcnow().isoformat(),
        }).execute()

        logger.info(f"✅ Session created: {session_id}")
        return response.data[0] if response.data else {"id": session_id}

    def get_session(self, session_id: str) -> dict:
        """Retrieve session metadata"""
        response = self.client.table("docking_sessions").select("*").eq(
            "id", session_id
        ).execute()

        if response.data:
            return response.data[0]
        return None

    def update_session_status(self, session_id: str, status: str):
        """Update session status"""
        self.client.table("docking_sessions").update({
            "status": status,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", session_id).execute()
        logger.info(f"✅ Session {session_id} status: {status}")

    # ========== FILE STORAGE (Supabase Storage) ==========

    def upload_result_file(self, session_id: str, filename: str, file_content: bytes) -> str:
        """Upload result file to Supabase Storage"""
        storage_path = f"{session_id}/{filename}"

        try:
            self.client.storage.from_(self.storage_bucket).upload(
                path=storage_path,
                file=file_content,
                file_options={"content-type": "application/octet-stream", "upsert": "true"}
            )
            logger.info(f"✅ Uploaded to Supabase: {storage_path}")
            return storage_path
        except Exception as e:
            logger.error(f"Failed to upload {storage_path}: {str(e)}")
            raise

    def download_result_file(self, session_id: str, filename: str) -> bytes:
        """Download result file from Supabase Storage"""
        storage_path = f"{session_id}/{filename}"

        try:
            response = self.client.storage.from_(self.storage_bucket).download(
                path=storage_path
            )
            logger.info(f"✅ Downloaded from Supabase: {storage_path}")
            return response
        except Exception as e:
            logger.error(f"Failed to download {storage_path}: {str(e)}")
            raise

    def get_file_url(self, session_id: str, filename: str) -> str:
        """Get public URL for result file"""
        storage_path = f"{session_id}/{filename}"

        try:
            url = self.client.storage.from_(self.storage_bucket).get_public_url(
                path=storage_path
            )
            return url
        except Exception as e:
            logger.error(f"Failed to get URL for {storage_path}: {str(e)}")
            raise

    def list_result_files(self, session_id: str, subpath: str = "") -> list:
        """List files for a session or a session subfolder."""
        path = f"{session_id}/{subpath}".strip("/")
        try:
            files = self.client.storage.from_(self.storage_bucket).list(
                path=path
            )
            return files if files else []
        except Exception as e:
            logger.error(f"Failed to list files for {path}: {str(e)}")
            return []

    def delete_session_files(self, session_id: str):
        """Delete all files for a session"""
        try:
            files = self.client.storage.from_(self.storage_bucket).list(
                path=session_id
            )

            if files:
                file_paths = [f"{session_id}/{f['name']}" for f in files]
                self.client.storage.from_(self.storage_bucket).remove(
                    paths=file_paths
                )
            logger.info(f"✅ Deleted all files for session: {session_id}")
        except Exception as e:
            logger.error(f"Failed to delete files for {session_id}: {str(e)}")

    # ========== DOCKING RESULTS (Database) ==========

    def save_docking_result(self, session_id: str, docking_data: dict) -> str:
        """Save docking results to database"""
        try:
            response = self.client.table("docking_results").insert({
                "session_id": session_id,
                "best_affinity": docking_data.get("best_affinity"),
                "num_poses": docking_data.get("num_poses"),
                "cavity_count": docking_data.get("cavity_count"),
                "results_file_path": docking_data.get("results_file_path"),
                "docking_mode": docking_data.get("docking_mode"),
                "report_json": docking_data.get("report_json"),
                "created_at": datetime.utcnow().isoformat(),
            }).execute()

            result_id = response.data[0]["id"] if response.data else None
            logger.info(f"✅ Docking result saved: {result_id}")
            return result_id
        except Exception as e:
            logger.error(f"Failed to save docking result: {str(e)}")
            raise

    def get_docking_results(self, session_id: str) -> list:
        """Retrieve all docking results for session"""
        try:
            response = self.client.table("docking_results").select("*").eq(
                "session_id", session_id
            ).execute()

            return response.data if response.data else []
        except Exception as e:
            logger.error(f"Failed to get docking results: {str(e)}")
            return []

    def get_best_result(self, session_id: str) -> dict:
        """Get best docking result by affinity"""
        try:
            response = self.client.table("docking_results").select("*").eq(
                "session_id", session_id
            ).order("best_affinity").limit(1).execute()

            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Failed to get best result: {str(e)}")
            return None

    # ========== CLOUD-ONLY INTERMEDIATE FILE STORAGE ==========

    def upload_intermediate_file(self, session_id: str, file_subpath: str, file_content: bytes) -> str:
        """Upload intermediate docking file (cavity detection, grid params, etc) to Supabase Storage
        
        Used in CLOUD_ONLY_MODE to store intermediate results that would normally go to local disk.
        Files are stored under session_id/intermediate/ namespace.
        
        Args:
            session_id: Unique session identifier
            file_subpath: Relative path within session (e.g., 'cavities.json', 'grid/params.json')
            file_content: Binary content to upload
            
        Returns:
            Cloud storage path
        """
        storage_path = f"{session_id}/intermediate/{file_subpath}"
        
        try:
            self.client.storage.from_(self.storage_bucket).upload(
                path=storage_path,
                file=file_content,
                file_options={"content-type": "application/octet-stream", "upsert": "true"}
            )
            logger.info(f"✅ Uploaded intermediate file to Supabase: {storage_path}")
            return storage_path
        except Exception as e:
            logger.error(f"Failed to upload intermediate file {storage_path}: {str(e)}")
            raise

    def download_intermediate_file(self, session_id: str, file_subpath: str) -> bytes:
        """Download intermediate docking file from Supabase Storage
        
        Used in CLOUD_ONLY_MODE to retrieve intermediate results for continued processing.
        
        Args:
            session_id: Unique session identifier
            file_subpath: Relative path within session (e.g., 'cavities.json')
            
        Returns:
            Binary content of the file
        """
        storage_path = f"{session_id}/intermediate/{file_subpath}"
        
        try:
            response = self.client.storage.from_(self.storage_bucket).download(
                path=storage_path
            )
            logger.info(f"✅ Downloaded intermediate file from Supabase: {storage_path}")
            return response
        except Exception as e:
            logger.error(f"Failed to download intermediate file {storage_path}: {str(e)}")
            raise

    def list_intermediate_files(self, session_id: str) -> list:
        """List all intermediate files for a session"""
        path = f"{session_id}/intermediate"
        try:
            files = self.client.storage.from_(self.storage_bucket).list(path=path)
            return files if files else []
        except Exception as e:
            logger.error(f"Failed to list intermediate files for {session_id}: {str(e)}")
            return []

    # ========== UTILITY METHODS ==========

    def cleanup_old_sessions(self, hours: int = 24):
        """Delete sessions older than specified hours (both DB and Storage)"""
        try:
            from datetime import timedelta

            cutoff_time = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

            # Delete from database
            response = self.client.table("docking_sessions").delete().lt(
                "created_at", cutoff_time
            ).execute()

            logger.info(f"✅ Cleaned up expired sessions: {len(response.data) if response.data else 0}")
            
            # In cloud-only mode, storage cleanup handled by bucket lifecycle rules
            # or scheduled separately - database cleanup is sufficient here
        except Exception as e:
            logger.error(f"Failed to cleanup sessions: {str(e)}")


# Global instance
try:
    supabase_mgr = SupabaseManager()
except ValueError as e:
    logger.warning(str(e))
    supabase_mgr = None
