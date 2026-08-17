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

    def upload_result_file(self, session_id: str, filename: str, file_content: bytes, subdir: str = "") -> str:
        """Upload result file to Supabase Storage. Use subdir='intermediate' for intermediate files."""
        storage_path = f"{session_id}/{subdir}/{filename}".replace('//', '/').strip('/')

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

    def download_result_file(self, session_id: str, filename: str, subdir: str = "") -> bytes:
        """Download result file from Supabase Storage. Use subdir='intermediate' for intermediate files."""
        storage_path = f"{session_id}/{subdir}/{filename}".replace('//', '/').strip('/')

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
        """Delete all files and subdirectories for a session in Supabase Storage"""
        try:
            # List root files in session_id
            files = self.client.storage.from_(self.storage_bucket).list(path=session_id)
            file_paths = []
            if files:
                for f in files:
                    file_paths.append(f"{session_id}/{f['name']}")
                
                # Check for intermediate subfolder
                try:
                    sub_files = self.client.storage.from_(self.storage_bucket).list(path=f"{session_id}/intermediate")
                    if sub_files:
                        for sf in sub_files:
                            file_paths.append(f"{session_id}/intermediate/{sf['name']}")
                except Exception:
                    pass

                if file_paths:
                    self.client.storage.from_(self.storage_bucket).remove(paths=file_paths)
                    logger.info(f"✅ Deleted {len(file_paths)} storage files for session: {session_id}")
        except Exception as e:
            logger.warning(f"Note on storage deletion for {session_id}: {str(e)}")

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
        """Upload intermediate docking file to Supabase Storage (intermediate/ namespace)."""
        return self.upload_result_file(session_id, file_subpath, file_content, subdir="intermediate")

    def download_intermediate_file(self, session_id: str, file_subpath: str) -> bytes:
        """Download intermediate docking file from Supabase Storage."""
        return self.download_result_file(session_id, file_subpath, subdir="intermediate")

    def list_intermediate_files(self, session_id: str) -> list:
        """List all intermediate files for a session."""
        return self.list_result_files(session_id, subpath="intermediate")


    # ========== 24-HOUR EXPIRATION & CLEANUP ==========

    def cleanup_old_sessions(self, hours: int = 24) -> dict:
        """
        Delete all sessions, docking results, and storage files older than specified hours (24h default).
        """
        stats = {"sessions_deleted": 0, "results_deleted": 0, "storage_cleaned": 0}
        try:
            from datetime import timedelta

            cutoff_dt = datetime.utcnow() - timedelta(hours=hours)
            cutoff_time = cutoff_dt.isoformat()

            logger.info(f"🧹 [Supabase 24h Purge] Starting cleanup (cutoff: {cutoff_time})...")

            # 1. Collect expired session IDs from docking_sessions
            sessions_to_clean = set()
            try:
                resp = self.client.table("docking_sessions").select("id").lt(
                    "created_at", cutoff_time
                ).execute()
                if resp.data:
                    for row in resp.data:
                        sessions_to_clean.add(row["id"])
            except Exception as e:
                logger.warning(f"Could not fetch expired docking_sessions: {e}")

            # 2. Also collect session IDs from docking_results older than cutoff
            try:
                resp_res = self.client.table("docking_results").select("session_id").lt(
                    "created_at", cutoff_time
                ).execute()
                if resp_res.data:
                    for row in resp_res.data:
                        if row.get("session_id"):
                            sessions_to_clean.add(row["session_id"])
            except Exception as e:
                logger.warning(f"Could not fetch expired docking_results: {e}")

            # 3. For each expired session, clean up Supabase Storage files
            for s_id in sessions_to_clean:
                try:
                    self.delete_session_files(s_id)
                    stats["storage_cleaned"] += 1
                except Exception as err:
                    logger.warning(f"Storage clean skipped for {s_id}: {err}")

            # 4. Delete docking_results rows older than 24h
            try:
                del_res = self.client.table("docking_results").delete().lt(
                    "created_at", cutoff_time
                ).execute()
                stats["results_deleted"] = len(del_res.data) if del_res.data else 0
            except Exception as e:
                logger.warning(f"Error deleting expired docking_results: {e}")

            # 5. Delete docking_sessions rows older than 24h
            try:
                del_sess = self.client.table("docking_sessions").delete().lt(
                    "created_at", cutoff_time
                ).execute()
                stats["sessions_deleted"] = len(del_sess.data) if del_sess.data else 0
            except Exception as e:
                logger.warning(f"Error deleting expired docking_sessions: {e}")

            logger.info(
                f"✅ [Supabase 24h Purge] Complete: {stats['sessions_deleted']} sessions, "
                f"{stats['results_deleted']} results, {stats['storage_cleaned']} storage session folders cleaned."
            )
            return stats
        except Exception as e:
            logger.error(f"Failed to run Supabase 24h cleanup: {str(e)}")
            return stats


# Global instance
try:
    supabase_mgr = SupabaseManager()
except ValueError as e:
    logger.warning(str(e))
    supabase_mgr = None
