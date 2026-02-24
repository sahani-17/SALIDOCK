# Dependencies Imported
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import shutil
import os
import re
import logging
import json
from pathlib import Path
import tools, docking_runner, grid_calc, results, alphafold_integration, cavity_detection

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent
WORK_DIR = BASE_DIR / "Database"
WORK_DIR.mkdir(exist_ok=True)

# User-facing results directory (SwissDock-style organized output)
RESULTS_DIR = BASE_DIR / "results"
RESULTS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Docking Tool API - Session Based")

# CORS configuration - FIXED: Use environment variable instead of wildcard
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://localhost:8501").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,  # FIXED: Use actual origins, not wildcard
    allow_methods=["GET", "POST", "DELETE"],  # FIXED: Specific methods only
    allow_headers=["*"],
    allow_credentials=True,
)

# Security helper functions
def validate_session_id(session_id: str) -> str:
    """
    Validate session ID is a valid UUID to prevent path traversal.
    
    Raises:
        HTTPException: If session ID is not a valid UUID
    """
    try:
        uuid.UUID(session_id)
        return session_id
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID format")

def validate_filename(filename: str) -> str:
    """
    Validate filename to prevent path traversal attacks.
    
    Raises:
        HTTPException: If filename contains suspicious patterns
    """
    # Check for path traversal BEFORE normalization
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename: path traversal detected")
    
    # Get just the filename (removes any path components as safety net)
    safe_name = os.path.basename(filename)
    
    # Validate characters (alphanumeric, underscore, hyphen, dot only)
    if not re.match(r'^[a-zA-Z0-9_.-]+$', safe_name):
        raise HTTPException(status_code=400, detail="Invalid filename: illegal characters")
    
    # Prevent empty filename
    if not safe_name or safe_name == '.':
        raise HTTPException(status_code=400, detail="Invalid filename: empty")
    
    # Prevent hidden files
    if safe_name.startswith('.'):
        raise HTTPException(status_code=400, detail="Invalid filename: hidden files not allowed")
    
    return safe_name

def json_error(message: str, suggestion: str = None, log_details: str = None) -> JSONResponse:
    """
    Return sanitized error response without exposing internal details.
    
    Args:
        message: User-friendly error message
        suggestion: Optional suggestion for user
        log_details: Internal details to log (not sent to client)
    """
    # Log full details server-side
    if log_details:
        logger.error(f"Error: {message} | Details: {log_details}")
    else:
        logger.error(f"Error: {message}")
    
    # Return sanitized message to client
    payload = {
        "error": "server_error",
        "message": message
    }
    if suggestion:
        payload["suggestion"] = suggestion
    
    return JSONResponse(status_code=500, content=payload)

# Input validation helpers
RESERVED_NAMES = {'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'LPT1', 'LPT2'}

def validate_residue_name(name: str) -> str:
    """
    Validate residue name format (e.g., NAD, HEM, ZN).
    
    Raises:
        HTTPException: If residue name is invalid
    """
    name = name.strip().upper()
    if not re.match(r'^[A-Z0-9]{1,3}$', name):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid residue name: {name}. Must be 1-3 alphanumeric characters."
        )
    return name

def sanitize_ligand_name(name: str) -> str:
    """
    Sanitize ligand name for safe filename usage.
    
    Returns:
        Safe filename string
    """
    # Remove dangerous characters
    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', name)
    
    # Limit length
    safe_name = safe_name[:50]
    
    # Check reserved names (Windows)
    if safe_name.upper() in RESERVED_NAMES:
        safe_name = f"ligand_{safe_name}"
    
    # Ensure not empty
    if not safe_name:
        safe_name = "ligand"
    
    return safe_name

def validate_docking_params(exhaustiveness: int, num_modes: int):
    """
    Validate docking parameters are within acceptable ranges.
    
    Raises:
        HTTPException: If parameters are out of bounds
    """
    if not 1 <= exhaustiveness <= 100:
        raise HTTPException(
            status_code=400,
            detail=f"exhaustiveness must be between 1 and 100 (got {exhaustiveness})"
        )
    
    if not 1 <= num_modes <= 100:
        raise HTTPException(
            status_code=400,
            detail=f"num_modes must be between 1 and 100 (got {num_modes})"
        )

def validate_pose_number(pose_number: int, session_dir: Path) -> int:
    """
    Validate pose number is within valid range.
    
    Args:
        pose_number: Pose number to validate
        session_dir: Session directory path
    
    Returns:
        Validated pose number
        
    Raises:
        HTTPException: If pose number is invalid
    """
    if pose_number < 1:
        raise HTTPException(
            status_code=400,
            detail=f"Pose number must be >= 1 (got {pose_number})"
        )
    
    # Check against actual number of poses
    out_pdbqt = session_dir / "docking_out_out.pdbqt"
    if out_pdbqt.exists():
        try:
            parsed = results.parse_vina_output(str(out_pdbqt))
            max_poses = len(parsed)
            
            if pose_number > max_poses:
                raise HTTPException(
                    status_code=400,
                    detail=f"Pose {pose_number} not found. Available poses: 1-{max_poses}"
                )
        except Exception:
            # If parsing fails, just check basic range
            if pose_number > 100:  # Reasonable upper limit
                raise HTTPException(
                    status_code=400,
                    detail=f"Pose number too large: {pose_number}"
                )
    
    return pose_number

# File upload security constants
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
MAX_TEXT_FILE_SIZE = 10 * 1024 * 1024  # 10 MB for text files

ALLOWED_CONTENT_TYPES = {
    'protein': ['chemical/x-pdb', 'text/plain', 'application/octet-stream'],
    'ligand': ['chemical/x-mdl-sdfile', 'chemical/x-mol2', 'text/plain', 'application/octet-stream'],
}

ALLOWED_EXTENSIONS = {
    'protein': ['.pdb', '.ent'],
    'ligand': ['.sdf', '.mol', '.mol2', '.pdb'],
}

def validate_file_upload(filename: str, filetype: str, content_type: str = None):
    """
    Validate file upload parameters.
    
    Args:
        filename: Name of the uploaded file
        filetype: Type of file ('protein' or 'ligand')
        content_type: MIME type of the file (optional)
    
    Raises:
        HTTPException: If validation fails
    """
    # Validate filetype
    if filetype not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid filetype: {filetype}. Must be 'protein' or 'ligand'"
        )
    
    # Validate extension
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS[filetype]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file extension for {filetype}: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS[filetype])}"
        )
    
    # Validate content type (if provided)
    if content_type and content_type not in ALLOWED_CONTENT_TYPES[filetype]:
        logger.warning(f"Unexpected content type: {content_type} for {filetype}")

# Resource management
import time

SESSION_EXPIRY_HOURS = 24

def cleanup_old_sessions():
    """
    Delete sessions older than SESSION_EXPIRY_HOURS.
    
    This prevents disk space exhaustion from abandoned sessions.
    """
    now = time.time()
    expiry_time = SESSION_EXPIRY_HOURS * 3600
    cleaned_count = 0
    
    try:
        for session_dir in WORK_DIR.iterdir():
            if not session_dir.is_dir():
                continue
            
            # Check age
            age = now - session_dir.stat().st_mtime
            if age > expiry_time:
                try:
                    shutil.rmtree(session_dir)
                    logger.info(f"Cleaned up expired session: {session_dir.name}")
                    cleaned_count += 1
                except Exception as e:
                    logger.error(f"Failed to cleanup session {session_dir.name}: {e}")
        
        if cleaned_count > 0:
            logger.info(f"Session cleanup complete: {cleaned_count} sessions removed")
    except Exception as e:
        logger.error(f"Session cleanup failed: {e}")

def check_disk_space(required_mb: int = 100):
    """
    Check if sufficient disk space is available.
    
    Args:
        required_mb: Minimum required space in MB
    
    Raises:
        HTTPException: If insufficient disk space
    """
    try:
        stat = shutil.disk_usage(WORK_DIR)
        available_mb = stat.free // (1024 * 1024)
        
        if available_mb < required_mb:
            raise HTTPException(
                status_code=507,
                detail=f"Insufficient disk space (available: {available_mb} MB, required: {required_mb} MB)"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Could not check disk space: {e}")

# Startup event: cleanup old sessions
@app.on_event("startup")
async def startup_cleanup():
    """Run cleanup on application startup."""
    logger.info("Running startup session cleanup...")
    cleanup_old_sessions()

@app.get("/api/tools/check")
async def check_tools():
    """Check availability of required external tools."""
    try:
        status = tools.check_tools()
        return {"status": "ok", "tools": status}
    except Exception as e:
        logger.error(f"Tool check failed", exc_info=True)
        return json_error(
            "Failed to check tools",
            suggestion="Ensure all required tools are installed",
            log_details=str(e)
        )

# Helper to get session directory with validation
def get_session_dir(session_id: str) -> Path:
    """
    Get session directory with security validation.
    
    Raises:
        HTTPException: If session ID is invalid or session not found
    """
    # Validate session ID format
    session_id = validate_session_id(session_id)
    
    session_dir = WORK_DIR / session_id
    
    # Ensure resolved path is within WORK_DIR (prevent path traversal)
    try:
        if not session_dir.resolve().is_relative_to(WORK_DIR.resolve()):
            raise HTTPException(status_code=403, detail="Access denied")
    except ValueError:
        # is_relative_to can raise ValueError on Windows with different drives
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    
    return session_dir

# Helper to create protein-ligand complex
def create_protein_ligand_complex(
    protein_pdbqt: Path,
    ligand_pdbqt: Path,
    pose_number: int = 1,
    include_remarks: bool = True
) -> str:
    """
    Create a protein-ligand complex in PDB format by merging protein and ligand structures.
    
    This function addresses the issue where docking output PDBQT files contain only
    ligand coordinates. It combines the prepared protein with a specific ligand pose for
    complete complex visualization.
    
    Args:
        protein_pdbqt: Path to prepared protein PDBQT file
        ligand_pdbqt: Path to docking output PDBQT file (contains multiple poses)
        pose_number: Which ligand pose to extract (1-based index)
        include_remarks: Include metadata in REMARK lines
    
    Returns:
        Combined PDB format string with protein and ligand
    
    Algorithm:
        1. Read prepared protein PDBQT
        2. Extract specific ligand pose from docking output
        3. Convert both to clean PDB format (remove docking-specific columns)
        4. Merge with TER separator
        5. Add metadata in REMARK lines
    
    Note:
        Vina outputs ligand atoms as ATOM records with residue name 'UNL',
        not as HETATM records. We convert them to HETATM for proper visualization.
    """
    if not protein_pdbqt.exists():
        raise FileNotFoundError(f"Protein file not found: {protein_pdbqt}")
    if not ligand_pdbqt.exists():
        raise FileNotFoundError(f"Ligand file not found: {ligand_pdbqt}")
    
    pdb_lines = []
    
    # Add header remarks if requested
    if include_remarks:
        pdb_lines.append("REMARK   Protein-Ligand Complex")
        pdb_lines.append(f"REMARK   Protein: {protein_pdbqt.name}")
        pdb_lines.append(f"REMARK   Ligand Pose: {pose_number}")
        
        # Try to get affinity score from ligand file
        try:
            parsed_results = results.parse_vina_output(str(ligand_pdbqt))
            if parsed_results and len(parsed_results) >= pose_number:
                affinity = parsed_results[pose_number - 1]['affinity']
                pdb_lines.append(f"REMARK   Binding Affinity: {affinity} kcal/mol")
        except:
            pass  # Skip if can't parse affinity
        
        pdb_lines.append("REMARK")
    
    # Process protein structure
    protein_content = protein_pdbqt.read_text()
    protein_atom_count = 0
    for line in protein_content.splitlines():
        if line.startswith(('ATOM', 'HETATM')):
            # Convert PDBQT to PDB: keep only first 66 characters
            # This removes docking-specific charge and atom type columns
            pdb_line = line[:66].rstrip()  # Trim and remove trailing whitespace
            pdb_lines.append(pdb_line)
            protein_atom_count += 1
        elif line.startswith('REMARK'):
            if include_remarks:
                pdb_lines.append(line)
    
    print(f"[DEBUG] Protein atoms: {protein_atom_count} from {protein_pdbqt}")
    
    # Add TER to separate protein from ligand
    pdb_lines.append("TER")
    
    # Extract and process ligand pose
    print(f"[DEBUG] Extracting ligand pose {pose_number} from {ligand_pdbqt}")
    ligand_pose = results.extract_pose_from_pdbqt(str(ligand_pdbqt), pose_number)
    print(f"[DEBUG] Ligand pose extracted: {len(ligand_pose)} chars, first 200: {ligand_pose[:200]}")
    
    ligand_atom_count = 0
    for line in ligand_pose.splitlines():
        if line.startswith('ATOM') or line.startswith('HETATM'):
            # Convert PDBQT to PDB: keep only first 66 characters
            pdb_line = line[:66].rstrip()
            
            # ALL atoms from the ligand docking output must be HETATM.
            # Vina/OpenBabel may assign various residue names (UNL, LIG, MOL, etc.)
            # so we convert unconditionally — every atom here IS a ligand atom.
            if pdb_line.startswith('ATOM'):
                pdb_line = 'HETATM' + pdb_line[6:]
            
            pdb_lines.append(pdb_line)
            ligand_atom_count += 1
        elif line.startswith('REMARK'):
            if include_remarks:
                pdb_lines.append(line)
    
    print(f"[DEBUG] Ligand atoms added: {ligand_atom_count}")
    print(f"[DEBUG] Total PDB lines: {len(pdb_lines)}")
    
    # Add END record
    pdb_lines.append("END")
    
    return '\n'.join(pdb_lines)

@app.post("/api/session/create")
async def create_session():
    """Create a new docking session."""
    # Check disk space before creating session
    check_disk_space(required_mb=100)
    
    session_id = str(uuid.uuid4())
    session_dir = WORK_DIR / session_id
    session_dir.mkdir(exist_ok=True)
    
    logger.info(f"Created new session: {session_id}")
    return {"status": "ok", "session_id": session_id}

@app.get("/api/status/{session_id}")
async def get_session_status(session_id: str):
    """Get current workflow status of a session."""
    try:
        session_dir = get_session_dir(session_id)
        
        # Check for uploaded files (glob pattern for original uploads)
        protein_uploaded = len(list(session_dir.glob("protein_*"))) > 0
        ligand_uploaded = len(list(session_dir.glob("ligand_*"))) > 0
        
        status = {
            "session_id": session_id,
            "protein_uploaded": protein_uploaded,
            "ligand_uploaded": ligand_uploaded,
            "protein_prepared": (session_dir / "protein_prepared.pdbqt").exists(),
            "ligand_prepared": (session_dir / "ligand_prepared.pdbqt").exists(),
            "grid_calculated": (session_dir / "grid_params.json").exists(),
            "docking_complete": (session_dir / "docking_out_out.pdbqt").exists(),
        }
        
        return {"status": "ok", "workflow": status}
    except HTTPException:
        raise
    except Exception as e:
        return json_error(str(e))

@app.post("/api/upload/{session_id}/{filetype}")
async def upload_file(session_id: str, filetype: str, file: UploadFile = File(...)):
    """Upload protein or ligand file to session."""
    try:
        # Validate filetype
        if filetype not in ["protein", "ligand"]:
            raise HTTPException(status_code=400, detail="Invalid filetype. Must be 'protein' or 'ligand'")
        
        # Check disk space before upload
        check_disk_space(required_mb=100)
        
        # Validate filename
        safe_filename = validate_filename(file.filename)
        validate_file_upload(safe_filename, filetype, file.content_type)
        
        session_dir = get_session_dir(session_id)
        dest = session_dir / f"{filetype}_{safe_filename}"
        
        # Read with size limit (chunked)
        total_size = 0
        with dest.open("wb") as fh:
            while chunk := await file.read(8192):  # 8KB chunks
                total_size += len(chunk)
                if total_size > MAX_FILE_SIZE:
                    dest.unlink()  # Delete partial file
                    raise HTTPException(status_code=413, detail=f"File too large (max {MAX_FILE_SIZE // 1024 // 1024} MB)")
                fh.write(chunk)
        
        logger.info(f"Uploaded {safe_filename} ({total_size} bytes) to session {session_id}")
        return {"filename": safe_filename, "saved_as": str(dest.name), "size": total_size}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload failed", exc_info=True)
        return json_error(
            "File upload failed",
            suggestion="Please check the file format and try again",
            log_details=str(e)
        )


from pydantic import BaseModel

class PrepareRequest(BaseModel):
    file_name: str

@app.get("/api/chains/{session_id}/{filename}")
async def get_chains(session_id: str, filename: str):
    """
    Detect all unique chain IDs in an uploaded protein file.
    
    Args:
        session_id: Session ID
        filename: Name of the uploaded protein file (e.g., 'protein_1abc.pdb')
    
    Returns:
        List of chain information: [{'id': 'A', 'atoms': 1523}, ...]
    """
    try:
        session_dir = get_session_dir(session_id)
        
        # Validate filename to prevent path traversal
        filename = validate_filename(filename)
        protein_file = session_dir / filename
        
        # Validate resolved path is within session directory
        if not protein_file.resolve().is_relative_to(session_dir.resolve()):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not protein_file.exists():
            raise HTTPException(status_code=404, detail=f"File {filename} not found in session")
        
        chains = tools.detect_chains(protein_file)
        return {"status": "ok", "chains": chains}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chain detection failed", exc_info=True)
        return json_error(
            "Chain detection failed",
            suggestion="Please check the protein file format",
            log_details=str(e)
        )

@app.get("/api/analyze/heteroatoms/{session_id}")
async def analyze_heteroatoms(session_id: str, file_name: str):
    """
    Analyze heteroatoms in a PDB file and suggest which ones to keep.
    
    This endpoint helps users make informed decisions about which heteroatoms
    (metal ions, cofactors, ligands) should be preserved during protein preparation.
    
    Args:
        session_id: Session ID
        file_name: Name of the uploaded protein file
    
    Returns:
        {
            "status": "ok",
            "metal_ions": ["ZN", "MG"],
            "cofactors": ["NAD", "HEM"],
            "ligands": ["LIG"],
            "buffer_agents": ["SO4", "GOL"],
            "other": ["UNK"],
            "all_heteroatoms": ["ZN", "MG", "NAD", "HEM", "LIG", "SO4", "UNK"],
            "recommended_keep": ["ZN", "MG", "NAD", "HEM"],
            "counts": {"ZN": 2, "MG": 1, "NAD": 1, ...},
            "atom_counts": {"ZN": 1, "NAD": 44, ...},
            "summary": "Found 2 metal ions, 2 cofactors, 1 ligand, 2 buffer agents",
            "recommendation_text": "We recommend keeping: ZN, MG, NAD, HEM (metal ions and cofactors)"
        }
    """
    try:
        session_dir = get_session_dir(session_id)
        
        # Validate filename to prevent path traversal
        file_name = validate_filename(file_name)
        inp = session_dir / file_name
        
        # Validate resolved path is within session directory
        if not inp.resolve().is_relative_to(session_dir.resolve()):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not inp.exists():
            raise HTTPException(status_code=404, detail=f"File {file_name} not found in session")
        
        # Analyze heteroatoms
        analysis = tools.detect_heteroatoms_to_keep(inp)
        

        # Add detailed breakdown
        details = []
        if analysis['metal_ions']:
            details.append(f"Metal ions ({len(analysis['metal_ions'])}): {', '.join(analysis['metal_ions'])}")
        if analysis['cofactors']:
            details.append(f"Cofactors ({len(analysis['cofactors'])}): {', '.join(analysis['cofactors'])}")
        if analysis['ligands']:
            details.append(f"Ligands ({len(analysis['ligands'])}): {', '.join(analysis['ligands'])}")
        if analysis['buffer_agents']:
            details.append(f"Buffer agents ({len(analysis['buffer_agents'])}): {', '.join(analysis['buffer_agents'])}")
        if analysis['other']:
            details.append(f"Other ({len(analysis['other'])}): {', '.join(analysis['other'])}")
        
        return {
            "status": "ok",
            "metal_ions": analysis['metal_ions'],
            "cofactors": analysis['cofactors'],
            "ligands": analysis['ligands'],
            "buffer_agents": analysis['buffer_agents'],
            "other": analysis['other'],
            "all_heteroatoms": analysis['all_heteroatoms'],
            "counts": analysis['counts'],
            "atom_counts": analysis['atom_counts'],
            "summary": analysis['summary'],
            "details": details
        }
        
    except HTTPException:
        raise
    except FileNotFoundError as e:
        return json_error(
            "Required file not found",
            suggestion="Please check the filename and try again",
            log_details=str(e)
        )
    except ValueError as e:
        return json_error(
            "Invalid PDB file",
            suggestion="Please check the PDB file format",
            log_details=str(e)
        )
    except Exception as e:
        logger.error(f"Heteroatom analysis failed", exc_info=True)
        return json_error(
            "Heteroatom analysis failed",
            suggestion="Please check the protein file format",
            log_details=str(e)
        )

@app.post("/api/prepare/protein/{session_id}")
async def prepare_protein(
    session_id: str, 
    file_name: str, 
    keep_hetero_residues: str | None = None,
    keep_chains: str | None = None,
    fix_structure: bool = False,
    validate_structure: bool = True
):
    """
    Enhanced protein preparation workflow.
    
    Stage 0: Structure Analysis & Validation (optional)
    Stage 0.5: Structure Completion using MODELLER (optional)
    Stage 1: Non-Protein Elements Elimination
    Stage 2: Protein Refinement
    
    Args:
        session_id: Session ID
        file_name: Name of the uploaded protein file
        keep_hetero_residues: Comma-separated heteroatom residue names (e.g., "NAD,HEM,ZN")
                             If None or empty, ALL heteroatoms are removed.
        keep_chains: Comma-separated chain IDs (e.g., "A,B")
                    If None or empty, ALL chains are kept.
        fix_structure: Use MODELLER to complete missing atoms/residues (default: False)
        validate_structure: Detect and warn about structural issues (default: True)
    
    Note:
        pH is fixed at 7.4 for hydrogen addition.
    """
    try:
        session_dir = get_session_dir(session_id)
        
        # Validate filename to prevent path traversal
        file_name = validate_filename(file_name)
        inp = session_dir / file_name
        
        # Validate resolved path is within session directory
        if not inp.resolve().is_relative_to(session_dir.resolve()):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not inp.exists():
            raise HTTPException(status_code=404, detail=f"File {file_name} not found in session")
        
        # Parse comma-separated strings to lists with validation
        hetero_list = None
        if keep_hetero_residues:
            try:
                hetero_list = [validate_residue_name(x) for x in keep_hetero_residues.split(',') if x.strip()]
            except HTTPException as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid hetero residue name: {e.detail}"
                )
        
        chains_list = None
        if keep_chains:
            chains_list = [x.strip().upper() for x in keep_chains.split(',') if x.strip()]
        
        out_pdbqt = session_dir / "protein_prepared.pdbqt"
        # Enhanced preparation with validation and optional structure completion
        tools.prepare_receptor_adfr(
            inp, 
            out_pdbqt,
            remove_waters=True,
            keep_hetero_residues=hetero_list, 
            keep_chains=chains_list,
            fix_structure=fix_structure,
            validate_structure=validate_structure
        )
        
        return {
            "status": "ok", 
            "protein_pdbqt": str(out_pdbqt.name), 
            "ph": 7.4,  # Fixed value
            "kept_hetero_residues": hetero_list or [],
            "kept_chains": chains_list or []
        }
    except HTTPException:
        raise
    except FileNotFoundError as e:
        return json_error(
            "Required file not found",
            suggestion="Please check the filename and try again",
            log_details=str(e)
        )
    except ValueError as e:
        return json_error(
            "Invalid input parameters",
            suggestion="Please check your input values",
            log_details=str(e)
        )
    except Exception as e:
        logger.error(f"Protein preparation failed", exc_info=True)
        return json_error(
            "Protein preparation failed",
            suggestion="Please check the protein file format",
            log_details=str(e)
        )

@app.post("/api/prepare/ligand/{session_id}")
async def prepare_ligand(session_id: str, file_name: str):
    """
    Prepare ligand using RDKit + Open Babel (geometry optimization, charge assignment, PDBQT formatting).
    
    This endpoint validates that the input is a small molecule (not protein/peptide) before preparation.
    """
    try:
        session_dir = get_session_dir(session_id)
        
        # Validate filename to prevent path traversal
        file_name = validate_filename(file_name)
        inp = session_dir / file_name
        
        # Validate resolved path is within session directory
        if not inp.resolve().is_relative_to(session_dir.resolve()):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not inp.exists():
            raise HTTPException(status_code=404, detail=f"File {file_name} not found in session")
        
        # VALIDATION: Check if ligand is a small molecule (not protein/peptide)
        logger.info(f"Validating ligand: {file_name}")
        try:
            validation = tools.validate_ligand_molecule(inp)
            
            if not validation['valid']:
                # Ligand validation failed - reject with detailed error
                logger.warning(f"Ligand validation failed: {validation['molecule_type']}")
                logger.warning(f"  Stats: MW={validation['stats']['molecular_weight']} Da, "
                             f"Heavy atoms={validation['stats']['heavy_atoms']}, "
                             f"Amino acids={validation['stats']['amino_acid_residues']}")
                
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "invalid_ligand_type",
                        "molecule_type": validation['molecule_type'],
                        "reason": validation['reason'],
                        "stats": validation['stats'],
                        "message": f"Ligand validation failed: {validation['reason']}"
                    }
                )
            
            # Validation passed - log success
            logger.info(f"Ligand validation passed: {validation['molecule_type']}")
            logger.info(f"  MW: {validation['stats']['molecular_weight']:.2f} Da, "
                       f"Heavy atoms: {validation['stats']['heavy_atoms']}, "
                       f"Amino acids: {validation['stats']['amino_acid_residues']}")
            
        except (FileNotFoundError, ValueError) as e:
            # Validation function failed (file parsing error)
            logger.error(f"Ligand validation error: {e}")
            raise HTTPException(
                status_code=400,
                detail=f"Could not validate ligand file: {str(e)}"
            )
        
        # Proceed with ligand preparation
        out_pdbqt = session_dir / "ligand_prepared.pdbqt"
        tools.prepare_ligand_adfr(inp, out_pdbqt)
        
        return {
            "status": "ok",
            "ligand_pdbqt": str(out_pdbqt.name),
            "validation": {
                "molecule_type": validation['molecule_type'],
                "stats": validation['stats']
            }
        }
    except HTTPException:
        raise
    except FileNotFoundError as e:
        return json_error(
            "Required file not found",
            suggestion="Please check the filename and try again",
            log_details=str(e)
        )
    except Exception as e:
        logger.error(f"Ligand preparation failed", exc_info=True)
        return json_error(
            "Ligand preparation failed",
            suggestion="Please check the ligand file format",
            log_details=str(e)
        )

@app.post("/api/convert/ligand")
async def convert_ligand(request: PrepareRequest):
    """Convert SDF/MOL2 ligand to PDB format for visualization."""
    try:
        inp = WORK_DIR / request.file_name
        if not inp.exists():
            raise HTTPException(status_code=404, detail=f"File {request.file_name} not found")
        
        # Convert to PDB
        out_pdb = WORK_DIR / f"{inp.stem}_converted.pdb"
        tools.convert_sdf_to_pdb(inp, out_pdb)
        
        # Read and return PDB content
        pdb_content = out_pdb.read_text()
        
        return {
            "status": "ok", 
            "pdb_content": pdb_content,
            "original_format": inp.suffix,
            "converted_file": str(out_pdb.name)
        }
    except Exception as e:
        return json_error(str(e))

@app.post("/api/ligand/from-smiles/{session_id}")
async def create_ligand_from_smiles(
    session_id: str,
    smiles: str,
    ligand_name: str = "ligand",
    optimize: bool = True
):
    """
    Generate a 3D ligand structure from SMILES string.
    
    This endpoint converts a SMILES string to a docking-ready PDBQT file:
    1. Validates SMILES string
    2. Generates 3D coordinates
    3. Adds hydrogens at pH 7.4 (fixed)
    4. Optimizes geometry
    5. Assigns charges
    6. Outputs PDBQT format
    
    Args:
        session_id: Session ID
        smiles: SMILES string representation of the molecule
        ligand_name: Name for the ligand (default: "ligand")
        optimize: Whether to optimize geometry (default: True)
    
    Note:
        pH is fixed at 7.4 for hydrogen addition.
    
    Returns:
        {
            "status": "ok",
            "ligand_file": "ligand_aspirin.pdbqt",
            "smiles": "CC(=O)OC1=CC=CC=C1C(=O)O",
            "ligand_name": "aspirin",
            "ph": 7.4,
            "message": "Ligand generated from SMILES and prepared successfully"
        }
    
    Example:
        POST /api/ligand/from-smiles/abc123
        {
            "smiles": "CC(=O)OC1=CC=CC=C1C(=O)O",
            "ligand_name": "aspirin"
        }
    """
    try:
        session_dir = get_session_dir(session_id)
        
        # Validate SMILES string
        if not smiles or not smiles.strip():
            raise HTTPException(status_code=400, detail="SMILES string cannot be empty")
        
        smiles = smiles.strip()
        
        # Sanitize ligand name
        import re
        ligand_name = re.sub(r'[^a-zA-Z0-9_-]', '_', ligand_name)
        
        # Generate output filename
        output_pdbqt = session_dir / f"ligand_{ligand_name}.pdbqt"
        prepared_pdbqt = session_dir / "ligand_prepared.pdbqt"
        
        # Convert SMILES to 3D structure (pH fixed at 7.4)
        tools.smiles_to_3d(
            smiles=smiles,
            output_pdbqt=str(output_pdbqt),
            optimize=optimize
        )
        
        # Copy to standard ligand_prepared.pdbqt for workflow compatibility
        shutil.copy(output_pdbqt, prepared_pdbqt)
        
        # Save SMILES metadata
        import json
        metadata_file = session_dir / "ligand_metadata.json"
        metadata = {
            "source": "smiles",
            "smiles": smiles,
            "ligand_name": ligand_name,
            "ph": 7.4,  # Fixed value
            "optimized": optimize,
            "file": str(output_pdbqt.name)
        }
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return {
            "status": "ok",
            "ligand_file": str(output_pdbqt.name),
            "ligand_prepared": str(prepared_pdbqt.name),
            "smiles": smiles,
            "ligand_name": ligand_name,
            "ph": 7.4,  # Fixed value
            "optimized": optimize,
            "message": f"Ligand '{ligand_name}' generated from SMILES and prepared successfully"
        }
    
    except ValueError as e:
        # SMILES validation error
        raise HTTPException(status_code=400, detail=f"Invalid SMILES string: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in SMILES conversion: {error_details}")
        return json_error(str(e))

# ====================================================
# RESULTS DOWNLOAD ENDPOINTS (User-facing results)
# ====================================================

@app.get("/api/results/download/complex/{session_id}/{pose_number}")
async def download_complex_from_results(session_id: str, pose_number: int):
    """Generate and download protein-ligand complex PDB for a specific pose."""
    try:
        session_dir = get_session_dir(session_id)
        
        # Validate pose number
        if pose_number < 1:
            raise HTTPException(status_code=400, detail="Pose number must be >= 1")
        
        protein_pdbqt = session_dir / "protein_prepared.pdbqt"
        if not protein_pdbqt.exists():
            raise HTTPException(status_code=404, detail="Prepared protein not found. Please run protein preparation first.")
        
        # Try to read pose info from the docking report to find the correct source file
        # For multi-cavity docking, each pose may come from a different PDBQT file
        import json
        docking_report = RESULTS_DIR / session_id / "reports" / "docking_report.json"
        
        ligand_pdbqt = None
        mode_in_file = pose_number  # Default: pose_number = mode index in file
        
        if docking_report.exists():
            try:
                with open(docking_report, 'r') as f:
                    report_data = json.load(f)
                poses = report_data.get("poses", [])
                if pose_number <= len(poses):
                    pose_info = poses[pose_number - 1]
                    # Use per-cavity pdbqt_file if available (multi-cavity docking)
                    if 'pdbqt_file' in pose_info:
                        pdbqt_path = Path(pose_info['pdbqt_file'])
                        if pdbqt_path.exists():
                            ligand_pdbqt = pdbqt_path
                            mode_in_file = pose_info.get('mode', 1)
            except Exception as e:
                logger.warning(f"Could not read docking report: {e}")
        
        # Fallback to main docking output if report not available
        if ligand_pdbqt is None:
            ligand_pdbqt = session_dir / "docking_out_out.pdbqt"
        
        if not ligand_pdbqt.exists():
            raise HTTPException(status_code=404, detail="Docking results not found. Please run docking first.")
        
        # Generate complex on-the-fly
        complex_pdb = create_protein_ligand_complex(
            protein_pdbqt=protein_pdbqt,
            ligand_pdbqt=ligand_pdbqt,
            pose_number=mode_in_file,
            include_remarks=True
        )
        
        return PlainTextResponse(
            complex_pdb,
            media_type="chemical/x-pdb",
            headers={"Content-Disposition": f"attachment; filename=complex_pose_{pose_number}.pdb"}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating complex: {str(e)}")
        return json_error(str(e))


@app.get("/api/results/download/report/{session_id}/{report_name}")
async def download_report(session_id: str, report_name: str):
    """Download report file (CSV, JSON, or TXT)."""
    from fastapi.responses import FileResponse
    
    try:
        validate_session_id(session_id)
        
        # Validate report name (prevent path traversal)
        allowed_reports = ["docking_summary.csv", "docking_report.json", "parameters.txt"]
        if report_name not in allowed_reports:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid report name. Allowed: {', '.join(allowed_reports)}"
            )
        
        report_file = RESULTS_DIR / session_id / "reports" / report_name
        
        if not report_file.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Report {report_name} not found. Please run docking first."
            )
        
        # Determine media type
        media_type = "text/plain"
        if report_name.endswith(".csv"):
            media_type = "text/csv"
        elif report_name.endswith(".json"):
            media_type = "application/json"
        
        return FileResponse(
            report_file,
            filename=report_name,
            media_type=media_type
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading report: {str(e)}")
        return json_error(str(e))


@app.get("/api/results/download/protein/{session_id}")
async def download_prepared_protein(session_id: str):
    """Download prepared protein PDB file for visualization."""
    from fastapi.responses import PlainTextResponse
    
    try:
        validate_session_id(session_id)
        session_dir = get_session_dir(session_id)
        
        # Look for protein PDB file in order of preference
        protein_pdb = None
        
        # Priority 1: Prepared protein for cavity detection (from AlphaFold)
        if (session_dir / "protein_for_cavity_detection.pdb").exists():
            protein_pdb = session_dir / "protein_for_cavity_detection.pdb"
        # Priority 2: Standard prepared protein
        elif (session_dir / "protein_prepared.pdb").exists():
            protein_pdb = session_dir / "protein_prepared.pdb"
        # Priority 3: Any file starting with "protein_" and ending with ".pdb"
        else:
            protein_files = list(session_dir.glob("protein_*.pdb"))
            if protein_files:
                protein_pdb = protein_files[0]
        
        if not protein_pdb or not protein_pdb.exists():
            raise HTTPException(
                status_code=404, 
                detail="Protein PDB file not found. Please upload and prepare a protein first."
            )
        
        # Read and return PDB content
        pdb_content = protein_pdb.read_text()
        
        return PlainTextResponse(
            content=pdb_content,
            media_type="chemical/x-pdb"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading protein: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/results/list/{session_id}")
async def list_results(session_id: str):
    """List all available results for a session."""
    try:
        validate_session_id(session_id)
        
        session_results_dir = RESULTS_DIR / session_id
        
        if not session_results_dir.exists():
            return {
                "status": "no_results",
                "message": "No results available. Please run docking first."
            }
        
        # List complexes
        complexes_dir = session_results_dir / "complexes"
        complexes = []
        if complexes_dir.exists():
            for f in sorted(complexes_dir.glob("*.pdb")):
                complexes.append({
                    "name": f.name,
                    "size": f.stat().st_size,
                    "download_url": f"/api/results/download/complex/{session_id}/{f.stem.split('_')[-1]}"
                })
        
        # List reports
        reports_dir = session_results_dir / "reports"
        reports = []
        if reports_dir.exists():
            for f in sorted(reports_dir.glob("*")):
                reports.append({
                    "name": f.name,
                    "size": f.stat().st_size,
                    "download_url": f"/api/results/download/report/{session_id}/{f.name}"
                })
        
        # Check for README
        readme_exists = (session_results_dir / "README.txt").exists()
        
        # Parse docking_report.json if it exists
        poses = []
        docking_params = {}
        docking_report = reports_dir / "docking_report.json"
        if docking_report.exists():
            try:
                import json
                with open(docking_report, 'r') as f:
                    report_data = json.load(f)
                    poses = report_data.get("poses", [])
                    docking_params = report_data.get("docking_parameters", {})
            except Exception as e:
                logger.error(f"Failed to parse docking_report.json: {str(e)}")
        
        return {
            "status": "ok",
            "session_id": session_id,
            "complexes": complexes,
            "reports": reports,
            "readme_available": readme_exists,
            "total_files": len(complexes) + len(reports) + (1 if readme_exists else 0),
            "poses": poses,
            "docking_parameters": docking_params
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing results: {str(e)}")
        return json_error(str(e))


# Custom preparation endpoint removed - use standard endpoints instead
# The simplified Open Babel approach doesn't need complex custom options

@app.post("/api/protein/center/{session_id}")
async def get_protein_center(session_id: str):
    """
    Calculate the geometric center of the protein from PDB file.
    Returns centerX, centerY, centerZ coordinates for docking grid.
    
    Args:
        session_id: The session identifier
        
    Returns:
        JSON with centerX, centerY, centerZ coordinates
        
    Example:
        POST /api/protein/center/abc123
        Response: {"centerX": 10.5, "centerY": -5.2, "centerZ": 3.8}
    """
    try:
        session_dir = get_session_dir(session_id)
        
        # Look for protein PDB file - search for any protein file in order of preference
        protein_pdb = None
        
        # Priority 1: Prepared protein for cavity detection (from AlphaFold)
        if (session_dir / "protein_for_cavity_detection.pdb").exists():
            protein_pdb = session_dir / "protein_for_cavity_detection.pdb"
        # Priority 2: Standard prepared protein
        elif (session_dir / "protein_prepared.pdb").exists():
            protein_pdb = session_dir / "protein_prepared.pdb"
        # Priority 3: Any file starting with "protein_" and ending with ".pdb"
        else:
            protein_files = list(session_dir.glob("protein_*.pdb"))
            if protein_files:
                protein_pdb = protein_files[0]  # Use the first match
        
        if not protein_pdb or not protein_pdb.exists():
            raise HTTPException(
                status_code=404, 
                detail="Protein PDB file not found. Please upload a protein first."
            )
        
        # Parse PDB and calculate geometric center
        x_coords, y_coords, z_coords = [], [], []
        
        with open(protein_pdb, 'r') as f:
            for line in f:
                if line.startswith(('ATOM', 'HETATM')):
                    try:
                        # PDB format: columns 31-38 (x), 39-46 (y), 47-54 (z)
                        x = float(line[30:38].strip())
                        y = float(line[38:46].strip())
                        z = float(line[46:54].strip())
                        x_coords.append(x)
                        y_coords.append(y)
                        z_coords.append(z)
                    except (ValueError, IndexError):
                        continue
        
        if not x_coords:
            raise HTTPException(
                status_code=400,
                detail="No valid atomic coordinates found in PDB file"
            )
        
        # Calculate geometric center
        centerX = round(sum(x_coords) / len(x_coords), 3)
        centerY = round(sum(y_coords) / len(y_coords), 3)
        centerZ = round(sum(z_coords) / len(z_coords), 3)
        
        logger.info(f"Calculated protein center for session {session_id}: ({centerX}, {centerY}, {centerZ})")
        
        return {
            "status": "ok",
            "centerX": centerX,
            "centerY": centerY,
            "centerZ": centerZ,
            "message": f"Protein center calculated from {len(x_coords)} atoms"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating protein center: {str(e)}")
        return json_error(
            "Failed to calculate protein center",
            suggestion="Ensure the protein file is in valid PDB format",
            log_details=str(e)
        )


@app.post("/api/cavities/detect/{session_id}")
async def detect_cavities_endpoint(
    session_id: str, 
    top_n: int = 5, 
    min_alpha_sphere: int = 3,
    detection_method: str = "consensus",
    use_voxelization: bool = False
):
    """
    Detect binding cavities using specified method.
    
    Args:
        session_id: Session ID
        top_n: Number of top cavities to return (default: 5, max: 10)
        min_alpha_sphere: Minimum number of alpha spheres for fpocket (default: 3)
        detection_method: Detection method - "fpocket", "p2rank", or "consensus" (default: "consensus")
        use_voxelization: Enable volume overlap calculation for consensus (slower, default: False)
    
    Returns:
        For fpocket/p2rank only:
        {
            "status": "ok",
            "method": "fpocket",
            "cavities": [...],
            "total_detected": 5
        }
        
        For consensus:
        {
            "status": "ok",
            "method": "consensus",
            "cavities": [
                {
                    "cavity_id": 1,
                    "center": [x, y, z],
                    "size": [sx, sy, sz],
                    "volume": 450.2,
                    "druggability_score": 0.85,
                    "p2rank_score": 0.92,
                    "confidence": "high",
                    "detected_by": ["fpocket", "p2rank"],
                    "match_criteria": ["center_distance_4A", "residue_jaccard_35"],
                    "center_distance": 3.2,
                    "residue_jaccard": 0.42,
                    "rank": 1
                },
                ...
            ],
            "total_detected": 3,
            "detection_stats": {
                "fpocket_total": 5,
                "p2rank_total": 4,
                "consensus_total": 3,
                "high_confidence": 2,
                "medium_confidence": 1,
                "low_confidence": 0,
                "fpocket_unique": 2,
                "p2rank_unique": 1
            }
        }
        
        Note:
            When consensus mode finds zero matching cavities, the system automatically
            falls back to P2Rank-only predictions. The response will include a "fallback"
            field indicating this occurred.
    """
    try:
        import p2rank_integration
        import consensus_cavity_detection
        from concurrent.futures import ThreadPoolExecutor
        
        session_dir = get_session_dir(session_id)
        protein_pdbqt = session_dir / "protein_prepared.pdbqt"
        
        if not protein_pdbqt.exists():
            raise HTTPException(status_code=404, detail="Prepared protein not found. Please prepare protein first.")
        
        # Convert PDBQT to PDB (both fpocket and P2RANK require PDB format)
        protein_pdb = session_dir / "protein_for_cavity_detection.pdb"
        
        # Simple PDBQT to PDB conversion (remove charge and atom type columns)
        pdb_lines = []
        for line in protein_pdbqt.read_text().splitlines():
            if line.startswith(('ATOM', 'HETATM')):
                # Keep only standard PDB columns (first 66 characters)
                pdb_lines.append(line[:66])
            elif line.startswith(('TER', 'END')):
                pdb_lines.append(line)
        
        protein_pdb.write_text('\n'.join(pdb_lines))
        
        # Limit top_n
        top_n = min(max(1, top_n), 10)
        
        # Validate detection method
        if detection_method not in ["fpocket", "p2rank", "consensus"]:
            raise HTTPException(status_code=400, detail=f"Invalid detection_method: {detection_method}. Must be 'fpocket', 'p2rank', or 'consensus'")
        
        # Execute detection based on method
        if detection_method == "fpocket":
            # Fpocket only
            cavities = cavity_detection.detect_cavities(
                str(protein_pdb),
                output_dir=session_dir,
                min_alpha_sphere=min_alpha_sphere,
                max_cavities=top_n
            )
            
            # Save cavity metadata to standard location
            cavity_file = session_dir / "cavities.json"
            cavity_detection.save_cavity_metadata(cavities, cavity_file)
            
            return {
                "status": "ok",
                "method": "fpocket",
                "cavities": cavities,
                "total_detected": len(cavities)
            }
        
        elif detection_method == "p2rank":
            # P2RANK only
            try:
                cavities = p2rank_integration.detect_cavities_p2rank(
                    str(protein_pdb),
                    output_dir=session_dir,
                    top_n=top_n,
                    use_cache=True
                )
                
                # Save cavity metadata to standard location
                cavity_file = session_dir / "cavities.json"
                p2rank_integration.save_p2rank_metadata(cavities, cavity_file)
                
                return {
                    "status": "ok",
                    "method": "p2rank",
                    "cavities": cavities,
                    "total_detected": len(cavities)
                }
            
            except p2rank_integration.P2RANKNotInstalledError as e:
                raise HTTPException(status_code=503, detail=f"P2RANK not installed: {str(e)}")
            except p2rank_integration.P2RANKError as e:
                raise HTTPException(status_code=500, detail=f"P2RANK error: {str(e)}")
        
        elif detection_method == "consensus":
            # Consensus with three-tier hierarchical fallback
            # Tier 1: Consensus (fpocket ∩ P2Rank) - High confidence
            # Tier 2: P2Rank only - Medium-high confidence
            # Tier 3: fpocket + PRANK rescoring - Medium confidence, maximum coverage
            print("[INFO] Running consensus cavity detection with three-tier fallback...")
            
            try:
                # Use new three-tier fallback function
                result = consensus_cavity_detection.detect_cavities_with_fallback(
                    protein_pdb_path=str(protein_pdb),
                    output_dir=session_dir,
                    top_n=top_n,
                    timeout=300
                )
                
                cavities = result['cavities']
                detection_tier = result['detection_tier']
                method = result['method']
                stats = result.get('stats', {})
                warning = result.get('warning')
                
                # Save cavity metadata
                cavity_file = session_dir / "cavities.json"
                cavity_file.write_text(json.dumps(cavities, indent=2))
                
                # Build response based on tier
                response = {
                    "status": "ok",
                    "method": method,
                    "cavities": cavities,
                    "total_detected": len(cavities),
                    "detection_tier": detection_tier,
                    "detection_stats": stats
                }
                
                # Add tier-specific information
                if detection_tier == 1:
                    print(f"[SUCCESS] Tier 1 (Consensus) detected {len(cavities)} cavities")
                    response["tier_info"] = {
                        "tier": 1,
                        "name": "Consensus",
                        "confidence": "High",
                        "description": "Cavities detected by both fpocket and P2Rank"
                    }
                elif detection_tier == 2:
                    print(f"[SUCCESS] Tier 2 (P2Rank) detected {len(cavities)} cavities")
                    response["tier_info"] = {
                        "tier": 2,
                        "name": "P2Rank Only",
                        "confidence": "Medium-High",
                        "description": "Consensus failed, using P2Rank predictions"
                    }
                    response["warning"] = warning
                elif detection_tier == 3:
                    print(f"[SUCCESS] Tier 3 (fpocket+PRANK) detected {len(cavities)} cavities")
                    response["tier_info"] = {
                        "tier": 3,
                        "name": "fpocket + PRANK Rescoring",
                        "confidence": "Medium",
                        "description": "Consensus and P2Rank failed, using PRANK-rescored fpocket predictions"
                    }
                    response["warning"] = warning
                else:
                    # Tier 0: All methods failed
                    print("[ERROR] All three tiers failed to detect cavities")
                    response["tier_info"] = {
                        "tier": 0,
                        "name": "No Detection",
                        "confidence": "None",
                        "description": "All cavity detection methods failed"
                    }
                    response["warning"] = warning
                
                return response
                
            except Exception as e:
                import traceback
                traceback.print_exc()
                raise HTTPException(
                    status_code=500,
                    detail=f"Cavity detection with fallback failed: {str(e)}"
                )
    
    except cavity_detection.CavityDetectionError as e:
        raise HTTPException(status_code=500, detail=f"Cavity detection error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        return json_error(str(e))



@app.post("/api/grid/calc/{session_id}")
async def calc_grid(
    session_id: str,
    mode: str = "cavity",  # "cavity" or "manual"
    cavity_id: int = None,  # Required if mode="cavity"
    center_x: float = None,  # Required if mode="manual"
    center_y: float = None,
    center_z: float = None,
    size_x: float = None,  # Required if mode="manual"
    size_y: float = None,
    size_z: float = None
):
    """
    Calculate grid box for docking.
    
    Modes:
        - cavity: Use cavity-detected grid parameters (requires cavity_id)
        - manual: Use user-defined grid parameters (requires center and size)
    
    Args:
        session_id: Session ID
        mode: Grid calculation mode ("cavity" or "manual")
        cavity_id: Cavity ID to use (required for cavity mode)
        center_x, center_y, center_z: Grid center coordinates (required for manual mode)
        size_x, size_y, size_z: Grid dimensions in Angstroms (required for manual mode)
    
    Returns:
        {
            "status": "ok",
            "mode": "cavity" or "manual",
            "center": [x, y, z],
            "size": [sx, sy, sz],
            "cavity_id": 1 (if cavity mode),
            "validation": {...} (if manual mode)
        }
    """
    try:
        session_dir = get_session_dir(session_id)
        protein = session_dir / "protein_prepared.pdbqt"
        
        if not protein.exists():
            raise HTTPException(status_code=404, detail="Prepared protein not found. Please prepare protein first.")
        
        if mode == "cavity":
            # Cavity mode: Load cavity data and extract grid parameters
            if cavity_id is None:
                raise HTTPException(status_code=400, detail="cavity_id is required for cavity mode")
            
            cavity_file = session_dir / "cavities.json"
            if not cavity_file.exists():
                raise HTTPException(
                    status_code=404,
                    detail="No cavities detected. Please run cavity detection first."
                )
            
            # Load cavity metadata
            cavities = cavity_detection.load_cavity_metadata(cavity_file)
            
            # Find the requested cavity
            cavity = next((c for c in cavities if c['cavity_id'] == cavity_id), None)
            if cavity is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Cavity {cavity_id} not found. Available cavities: {[c['cavity_id'] for c in cavities]}"
                )
            
            # Extract grid parameters from cavity
            center, size = grid_calc.calculate_grid_from_cavity(cavity)
            
            # Save grid parameters
            import json
            grid_file = session_dir / "grid_params.json"
            with open(grid_file, 'w') as f:
                json.dump({
                    'mode': 'cavity',
                    'cavity_id': cavity_id,
                    'center': center,
                    'size': size
                }, f)
            
            return {
                "status": "ok",
                "mode": "cavity",
                "cavity_id": cavity_id,
                "center": list(center),
                "size": list(size),
                "cavity_volume": cavity.get('volume', 0.0),
                "cavity_rank": cavity.get('rank', 0)
            }
        
        elif mode == "manual":
            # Manual mode: Use user-provided grid parameters
            if center_x is None or center_y is None or center_z is None:
                raise HTTPException(
                    status_code=400,
                    detail="center_x, center_y, center_z are required for manual mode"
                )
            
            if size_x is None or size_y is None or size_z is None:
                raise HTTPException(
                    status_code=400,
                    detail="size_x, size_y, size_z are required for manual mode"
                )
            
            center = (center_x, center_y, center_z)
            size = (size_x, size_y, size_z)
            
            # Calculate and validate grid
            center, size = grid_calc.calculate_manual_grid(
                center,
                size
            )
            
            # Validate grid size
            size_validation = grid_calc.validate_grid_size(size)
            
            # Validate grid center
            center_validation = grid_calc.validate_grid_center(center, str(protein))
            
            # Save grid parameters
            import json
            grid_file = session_dir / "grid_params.json"
            with open(grid_file, 'w') as f:
                json.dump({
                    'mode': 'manual',
                    'center': center,
                    'size': size
                }, f)
            
            return {
                "status": "ok",
                "mode": "manual",
                "center": list(center),
                "size": list(size),
                "validation": {
                    "size": size_validation,
                    "center": center_validation
                }
            }
        
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid mode: {mode}. Must be 'cavity' or 'manual'"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        return json_error(str(e))


@app.post("/api/dock/run/{session_id}")
async def run_docking(
    session_id: str,
    docking_mode: str = "cavity",  # "cavity" or "manual"
    cavity_ids: str = None  # Comma-separated cavity IDs, or None for all
):
    """
    Run molecular docking.
    
    Modes:
        - cavity: Dock in detected cavities (default)
        - manual: Dock with user-defined grid
    
    Args:
        session_id: Session ID
        docking_mode: "cavity" or "manual"
        cavity_ids: Comma-separated cavity IDs (e.g., "1,2,3") or None for all cavities
    
    Note:
        exhaustiveness is fixed at 10 and num_modes is fixed at 9.
    
    Returns:
        Cavity mode: All poses from all cavities, ranked by affinity
        Manual mode: Poses from single docking run
    """
    try:
        # Fixed parameters
        exhaustiveness = 10
        num_modes = 9
        
        # Validate docking parameters (still validate even though fixed)
        validate_docking_params(exhaustiveness, num_modes)
        
        session_dir = get_session_dir(session_id)
        receptor = session_dir / "protein_prepared.pdbqt"
        ligand = session_dir / "ligand_prepared.pdbqt"
        
        if not receptor.exists():
            raise HTTPException(status_code=404, detail="Prepared protein not found")
        if not ligand.exists():
            raise HTTPException(status_code=404, detail="Prepared ligand not found")
        
        if docking_mode == "cavity":
            # Cavity mode: Multi-cavity docking
            cavity_file = session_dir / "cavities.json"
            if not cavity_file.exists():
                raise HTTPException(
                    status_code=404,
                    detail="No cavities detected. Please run cavity detection first."
                )
            
            # Load cavity metadata
            cavities = cavity_detection.load_cavity_metadata(cavity_file)
            
            # Filter by cavity_ids if specified
            if cavity_ids:
                try:
                    requested_ids = [int(id.strip()) for id in cavity_ids.split(',')]
                    cavities = [c for c in cavities if c['cavity_id'] in requested_ids]
                    
                    if not cavities:
                        raise HTTPException(
                            status_code=404,
                            detail=f"None of the requested cavities found: {requested_ids}"
                        )
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid cavity_ids format: {cavity_ids}. Use comma-separated integers."
                    )
            
            print(f"\n[INFO] Running cavity-based docking for {len(cavities)} cavities")
            
            # Run multi-cavity docking
            out_prefix = str(session_dir / "docking_out")
            
            cavity_results = docking_runner.run_vina_multi_cavity(
                receptor_pdbqt=str(receptor),
                ligand_pdbqt=str(ligand),
                out_prefix=out_prefix,
                cavities=cavities
                # exhaustiveness and num_modes are fixed at 10 and 9 in run_vina_multi_cavity
            )
            
            # Aggregate results from all cavities
            all_poses = results.aggregate_multi_cavity_results(cavity_results)
            
            # Get best pose per cavity
            best_per_cavity = results.get_best_pose_per_cavity(all_poses)
            
            # Save aggregated results to main output file for compatibility
            # (Use the best cavity's output as the main output)
            if all_poses:
                best_cavity_id = all_poses[0]['cavity_id']
                best_cavity_pdbqt = session_dir / f"docking_out_cavity_{best_cavity_id}_out.pdbqt"
                main_output = session_dir / "docking_out_out.pdbqt"
                
                # Copy best cavity result to main output
                if best_cavity_pdbqt.exists():
                    shutil.copy(best_cavity_pdbqt, main_output)
            
            # Export results to user-facing folder
            try:
                docking_params = {
                    "mode": "cavity",
                    "exhaustiveness": 10,  # Fixed value
                    "num_modes": 9,  # Fixed value
                    "cavities_docked": [c['cavity_id'] for c in cavities]
                }
                export_results_to_user_folder(session_id, all_poses, docking_params)
                logger.info(f"Results exported to results/{session_id}/")
            except Exception as e:
                logger.error(f"Failed to export results: {str(e)}")
                # Don't fail the whole request if export fails
            
            return {
                "status": "ok",
                "docking_mode": "cavity",
                "cavities_docked": [c['cavity_id'] for c in cavities],
                "total_poses": len(all_poses),
                "results": all_poses,
                "best_per_cavity": best_per_cavity,
                "summary": {
                    "best_affinity": all_poses[0]['affinity'] if all_poses else None,
                    "best_cavity": all_poses[0]['cavity_id'] if all_poses else None,
                    "num_cavities": len(cavities),
                    "total_poses": len(all_poses)
                }
            }
        
        elif docking_mode == "manual":
            # Manual mode: Single docking with user-defined grid
            grid_file = session_dir / "grid_params.json"
            
            if not grid_file.exists():
                raise HTTPException(
                    status_code=404,
                    detail="Grid parameters not found. Please calculate grid first."
                )
            
            # Load grid parameters
            import json
            try:
                with open(grid_file, 'r') as f:
                    grid_params = json.load(f)
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=500,
                    detail="Grid parameters file is corrupted. Please recalculate grid."
                )
            except Exception as e:
                logger.error(f"Failed to load grid parameters: {e}")
                raise HTTPException(status_code=500, detail="Failed to load grid parameters")
            
            # Verify it's manual mode
            if grid_params.get('mode') != 'manual':
                raise HTTPException(
                    status_code=400,
                    detail=f"Grid was calculated in {grid_params.get('mode')} mode. "
                           "Please recalculate grid in manual mode."
                )
            
            center = tuple(grid_params['center'])
            size = tuple(grid_params['size'])
            
            out_prefix = str(session_dir / "docking_out")
            log, out_pdbqt = docking_runner.run_vina(
                str(receptor),
                str(ligand),
                out_prefix,
                center=center,
                size=size
                # exhaustiveness and num_modes are fixed at 10 and 9 in run_vina
            )
            
            # Parse results
            parsed = results.parse_vina_output(str(out_pdbqt))
            
            # Export results to user-facing folder
            try:
                docking_params = {
                    "mode": "manual",
                    "exhaustiveness": 10,  # Fixed value
                    "num_modes": 9,  # Fixed value
                    "grid_center": list(center),
                    "grid_size": list(size)
                }
                export_results_to_user_folder(session_id, parsed, docking_params)
                logger.info(f"Results exported to results/{session_id}/")
            except Exception as e:
                logger.error(f"Failed to export results: {str(e)}")
                # Don't fail the whole request if export fails
            
            return {
                "status": "ok",
                "docking_mode": "manual",
                "log": str(log),
                "out": str(out_pdbqt.name),
                "results": parsed,
                "grid_center": list(center),
                "grid_size": list(size)
            }
        
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid docking_mode: {docking_mode}. Must be 'cavity' or 'manual'"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in docking: {error_details}")
        return json_error(str(e))


@app.get("/api/file/{session_id}/{filename}")
async def get_file(session_id: str, filename: str):
    """Download a file from session directory."""
    try:
        session_dir = get_session_dir(session_id)
        
        # Validate filename to prevent path traversal
        filename = validate_filename(filename)
        fpath = session_dir / filename
        
        # Validate resolved path is within session directory
        if not fpath.resolve().is_relative_to(session_dir.resolve()):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not fpath.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # Check file size before reading
        file_size = fpath.stat().st_size
        if file_size > MAX_TEXT_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large to display (max {MAX_TEXT_FILE_SIZE // 1024 // 1024} MB)"
            )
        
        # Read file with error handling
        try:
            content = fpath.read_text()
            return PlainTextResponse(content)
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File is not text")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to read file", exc_info=True)
        return json_error(
            "Failed to read file",
            suggestion="Please check the file exists and is accessible",
            log_details=str(e)
        )

@app.get("/api/structure/{session_id}/{filetype}")
async def get_structure(session_id: str, filetype: str):
    """
    Serve structure files for Mol* visualization.
    
    Supported filetypes:
    - protein_original: Original uploaded protein file
    - protein_prepared: Prepared protein PDBQT
    - ligand_prepared: Prepared ligand PDBQT
    - docking_result: Docking output with all poses
    - complex: Protein-ligand complex (best pose) in PDB format
    """
    try:
        session_dir = get_session_dir(session_id)
        
        # Map filetype to actual file
        if filetype == "protein_original":
            # Find original protein upload (glob pattern)
            protein_files = list(session_dir.glob("protein_*.pdb")) + list(session_dir.glob("protein_*.ent"))
            if not protein_files:
                raise HTTPException(status_code=404, detail="Original protein file not found")
            fpath = protein_files[0]
        elif filetype == "protein_prepared":
            fpath = session_dir / "protein_prepared.pdbqt"
        elif filetype == "ligand_prepared":
            fpath = session_dir / "ligand_prepared.pdbqt"
        elif filetype == "docking_result":
            fpath = session_dir / "docking_out_out.pdbqt"
        elif filetype == "complex":
            # Generate protein-ligand complex for best pose (mode 1)
            protein_pdbqt = session_dir / "protein_prepared.pdbqt"
            ligand_pdbqt = session_dir / "docking_out_out.pdbqt"
            
            if not protein_pdbqt.exists():
                raise HTTPException(status_code=404, detail="Prepared protein not found")
            if not ligand_pdbqt.exists():
                raise HTTPException(status_code=404, detail="Docking results not found")
            
            complex_pdb = create_protein_ligand_complex(
                protein_pdbqt=protein_pdbqt,
                ligand_pdbqt=ligand_pdbqt,
                pose_number=1,
                include_remarks=True
            )
            
            return PlainTextResponse(
                complex_pdb,
                media_type="chemical/x-pdb",
                headers={"Content-Disposition": "inline; filename=complex.pdb"}
            )
        else:
            raise HTTPException(status_code=400, detail=f"Invalid filetype: {filetype}")
        
        if not fpath.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {filetype}")
        
        # Return with appropriate MIME type
        from fastapi.responses import FileResponse
        return FileResponse(
            fpath,
            media_type="chemical/x-pdb",
            headers={"Content-Disposition": f"inline; filename={fpath.name}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        return json_error(str(e))

@app.get("/api/structure/pdb/{session_id}/{filename}")
async def get_pdb_structure(session_id: str, filename: str):
    """
    Convert PDBQT to clean PDB format for Mol* visualization.
    Removes docking-specific columns (charge, atom type).
    """
    try:
        session_dir = get_session_dir(session_id)
        
        # Validate filename to prevent path traversal
        filename = validate_filename(filename)
        pdbqt_file = session_dir / filename
        
        # Validate resolved path is within session directory
        if not pdbqt_file.resolve().is_relative_to(session_dir.resolve()):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not pdbqt_file.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {filename}")
        
        # Convert PDBQT to PDB (remove extra columns)
        pdb_lines = []
        for line in pdbqt_file.read_text().splitlines():
            if line.startswith(('ATOM', 'HETATM')):
                # Keep only standard PDB columns (first 66 characters)
                # This removes the charge and atom type columns added by the docking software
                pdb_lines.append(line[:66])
            elif line.startswith(('MODEL', 'ENDMDL', 'TER', 'END', 'CONECT')):
                pdb_lines.append(line)
            elif line.startswith('REMARK'):
                pdb_lines.append(line)
        
        pdb_content = '\n'.join(pdb_lines)
        
        return PlainTextResponse(
            pdb_content,
            media_type="chemical/x-pdb",
            headers={"Content-Disposition": f"inline; filename={filename.replace('.pdbqt', '.pdb')}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        return json_error(str(e))

@app.get("/api/pose/{session_id}/{mode}")
async def get_pose(session_id: str, mode: int = 1):
    
    """Extract a specific pose from docking results."""
    try:
        session_dir = get_session_dir(session_id)
        mode = validate_pose_number(mode, session_dir)
        
        out_pdbqt = session_dir / "docking_out_out.pdbqt"
        if not out_pdbqt.exists():
            raise HTTPException(status_code=404, detail="Docking output not found")
        
        pose = results.extract_pose_from_pdbqt(str(out_pdbqt), int(mode))
        return PlainTextResponse(pose)
    except Exception as e:
        return json_error(str(e))

@app.get("/api/pose/pdb/{session_id}/{mode}")
async def get_pose_pdb(session_id: str, mode: int = 1):
    """
    Extract a specific pose in clean PDB format for Mol* visualization.
    Removes docking-specific columns (charge, atom type) from PDBQT.
    
    Args:
        session_id: Session ID
        mode: Pose number (1-based, e.g., 1 for best pose)
    """
    try:
        session_dir = get_session_dir(session_id)
        mode = validate_pose_number(mode, session_dir)
        out_pdbqt = session_dir / "docking_out_out.pdbqt"
        if not out_pdbqt.exists():
            raise HTTPException(status_code=404, detail="Docking output not found")
        
        # Extract the specific pose (PDBQT format)
        pose_pdbqt = results.extract_pose_from_pdbqt(str(out_pdbqt), int(mode))
        
        # Convert PDBQT to clean PDB format
        pdb_lines = []
        for line in pose_pdbqt.splitlines():
            if line.startswith(('ATOM', 'HETATM')):
                # Keep only standard PDB columns (first 66 characters)
                # This removes the charge and atom type columns added by the docking software
                pdb_lines.append(line[:66])
            elif line.startswith(('MODEL', 'ENDMDL', 'TER', 'END', 'CONECT')):
                pdb_lines.append(line)
            elif line.startswith('REMARK'):
                pdb_lines.append(line)
        
        pdb_content = '\n'.join(pdb_lines)
        
        return PlainTextResponse(
            pdb_content,
            media_type="chemical/x-pdb",
            headers={"Content-Disposition": f"inline; filename=pose_{mode}.pdb"}
        )
    except Exception as e:
        return json_error(str(e))

@app.get("/api/complex/pdb/{session_id}/{mode}")
async def get_complex_pdb(session_id: str, mode: int = 1):
    """
    Get protein-ligand complex in PDB format for visualization.
    
    This endpoint solves the issue where docking output PDBQT files contain only
    ligand coordinates. It merges the prepared protein structure with the selected
    ligand pose into a single PDB file for complete complex visualization.
    
    Args:
        session_id: Session ID
        mode: Ligand pose number (1-based, e.g., 1 for best pose)
    
    Returns:
        Combined protein-ligand complex in clean PDB format
    
    Example:
        GET /api/complex/pdb/{session_id}/1
        Returns the protein with the best-scoring ligand pose
    """
    try:
        session_dir = get_session_dir(session_id)
        mode = validate_pose_number(mode, session_dir)
        protein_pdbqt = session_dir / "protein_prepared.pdbqt"
        ligand_pdbqt = session_dir / "docking_out_out.pdbqt"
        
        if not protein_pdbqt.exists():
            raise HTTPException(status_code=404, detail="Prepared protein not found")
        if not ligand_pdbqt.exists():
            raise HTTPException(status_code=404, detail="Docking results not found")
        
        # Create the complex using helper function
        complex_pdb = create_protein_ligand_complex(
            protein_pdbqt=protein_pdbqt,
            ligand_pdbqt=ligand_pdbqt,
            pose_number=mode,
            include_remarks=True
        )
        
        return PlainTextResponse(
            complex_pdb,
            media_type="chemical/x-pdb",
            headers={"Content-Disposition": f"inline; filename=complex_pose_{mode}.pdb"}
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error creating complex: {error_details}")
        return json_error(str(e))

@app.get("/api/pose/download/{session_id}/{mode}")
async def download_pose(session_id: str, mode: int = 1):
    """
    Download a specific pose as a PDBQT file.
    
    Args:
        session_id: Session ID
        mode: Pose number (1-based, e.g., 1 for best pose, 2 for second best, etc.)
    """
    try:
        session_dir = get_session_dir(session_id)
        mode = validate_pose_number(mode, session_dir)
        out_pdbqt = session_dir / "docking_out_out.pdbqt"
        if not out_pdbqt.exists():
            raise HTTPException(status_code=404, detail="Docking output not found")
        
        # Extract the specific pose
        pose_content = results.extract_pose_from_pdbqt(str(out_pdbqt), int(mode))
        
        # Return as downloadable file
        from fastapi.responses import Response
        return Response(
            content=pose_content,
            media_type="chemical/x-pdbqt",
            headers={
                "Content-Disposition": f"attachment; filename=pose_{mode}.pdbqt"
            }
        )
    except Exception as e:
        return json_error(str(e))

@app.get("/api/poses/download/{session_id}")
async def download_top_poses(session_id: str, top_n: int = 5):
    """
    Download top N poses as a ZIP file containing individual PDBQT files.
    
    Args:
        session_id: Session ID
        top_n: Number of top poses to download (default: 5, max: 20)
    """
    try:
        import zipfile
        import io
        
        session_dir = get_session_dir(session_id)
        out_pdbqt = session_dir / "docking_out_out.pdbqt"
        if not out_pdbqt.exists():
            raise HTTPException(status_code=404, detail="Docking output not found")
        
        # Limit to reasonable number
        top_n = min(max(1, top_n), 20)
        
        # Parse results to get affinity scores
        parsed_results = results.parse_vina_output(str(out_pdbqt))
        available_poses = len(parsed_results)
        
        if available_poses == 0:
            raise HTTPException(status_code=404, detail="No poses found in docking results")
        
        # Adjust top_n if fewer poses available
        top_n = min(top_n, available_poses)
        
        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add README with binding affinities
            readme_content = f"Top {top_n} Binding Poses\n"
            readme_content += "=" * 50 + "\n\n"
            for i in range(top_n):
                pose_data = parsed_results[i]
                readme_content += f"Pose {i+1}:\n"
                readme_content += f"  Affinity: {pose_data['affinity']} kcal/mol\n"
                readme_content += f"  RMSD (lower bound): {pose_data['rmsd_lb']} Å\n"
                readme_content += f"  RMSD (upper bound): {pose_data['rmsd_ub']} Å\n\n"
            
            zip_file.writestr("README.txt", readme_content)
            
            # Extract and add each pose
            for i in range(1, top_n + 1):
                pose_content = results.extract_pose_from_pdbqt(str(out_pdbqt), i)
                pose_data = parsed_results[i-1]
                
                # Filename includes affinity for easy identification
                filename = f"pose_{i}_affinity_{pose_data['affinity']:.2f}.pdbqt"
                zip_file.writestr(filename, pose_content)
        
        # Prepare ZIP for download
        zip_buffer.seek(0)
        
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename=top_{top_n}_poses.zip"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        return json_error(str(e))

@app.get("/api/results/{session_id}")
async def get_results(session_id: str):
    """Get all docking results with cavity metadata if available."""
    try:
        session_dir = get_session_dir(session_id)
        out_pdbqt = session_dir / "docking_out_out.pdbqt"
        if not out_pdbqt.exists():
            raise HTTPException(status_code=404, detail="No docking results found")
        
        # Check if cavity-based docking was performed
        cavity_file = session_dir / "cavities.json"
        
        if cavity_file.exists():
            # Load cavity metadata
            cavities = cavity_detection.load_cavity_metadata(cavity_file)
            
            # Check if cavity-specific output files exist
            cavity_results = []
            for cavity in cavities:
                cavity_id = cavity['cavity_id']
                cavity_pdbqt = session_dir / f"docking_out_cavity_{cavity_id}_out.pdbqt"
                
                if cavity_pdbqt.exists():
                    # Parse results with cavity metadata
                    poses = results.parse_vina_output_with_cavity(
                        str(cavity_pdbqt),
                        cavity_id,
                        cavity
                    )
                    cavity_results.extend(poses)
            
            # If we found cavity-specific results, return them
            if cavity_results:
                # Sort by affinity (best first)
                cavity_results.sort(key=lambda x: x['affinity'])
                return {"status": "ok", "results": cavity_results}
        
        # Fall back to standard parsing without cavity metadata
        parsed = results.parse_vina_output(str(out_pdbqt))
        return {"status": "ok", "results": parsed}
    except Exception as e:
        return json_error(str(e))

# ====================================================
# RESULT EXPORT FUNCTIONS (SwissDock-style organization)
# ====================================================

def export_results_to_user_folder(session_id: str, docking_results: list, docking_params: dict):
    """
    Export validated results to user-facing results folder.
    
    Creates SwissDock-style organized output:
    - results/session_id/complexes/*.pdb
    - results/session_id/interactions/*.json
    - results/session_id/reports/*.csv, *.json, *.txt
    - results/session_id/README.txt
    
    Args:
        session_id: Session identifier
        docking_results: List of docking result dictionaries
        docking_params: Docking parameters used
    """
    import csv
    import json
    from datetime import datetime
    
    # Create results directory structure
    session_results_dir = RESULTS_DIR / session_id
    session_results_dir.mkdir(parents=True, exist_ok=True)
    
    complexes_dir = session_results_dir / "complexes"
    interactions_dir = session_results_dir / "interactions"
    reports_dir = session_results_dir / "reports"
    
    complexes_dir.mkdir(exist_ok=True)
    interactions_dir.mkdir(exist_ok=True)
    reports_dir.mkdir(exist_ok=True)
    
    # Copy validated complexes
    session_dir = WORK_DIR / session_id
    protein_pdbqt = session_dir / "protein_prepared.pdbqt"
    fallback_ligand_pdbqt = session_dir / "docking_out_out.pdbqt"
    
    for i, result in enumerate(docking_results, 1):
        try:
            # Use per-cavity pdbqt_file and mode if available (multi-cavity docking)
            if 'pdbqt_file' in result:
                ligand_pdbqt = Path(result['pdbqt_file'])
                mode_in_file = result.get('mode', 1)
            else:
                ligand_pdbqt = fallback_ligand_pdbqt
                mode_in_file = i
            
            # Generate complex using the correct source file and mode
            complex_pdb = create_protein_ligand_complex(
                protein_pdbqt=protein_pdbqt,
                ligand_pdbqt=ligand_pdbqt,
                pose_number=mode_in_file,
                include_remarks=True
            )
            
            # Simple validation: check if complex has content
            if complex_pdb and len(complex_pdb) > 100:
                dest_file = complexes_dir / f"complex_pose_{i}.pdb"
                dest_file.write_text(complex_pdb)
                logger.info(f"Exported complex_pose_{i}.pdb to results")
        except Exception as e:
            logger.error(f"Failed to export complex for pose {i}: {str(e)}")
    
    # Copy interaction analysis files
    for i in range(1, len(docking_results) + 1):
        interaction_file = session_dir / f"interactions_pose_{i}.json"
        if interaction_file.exists():
            dest_file = interactions_dir / f"interactions_pose_{i}.json"
            shutil.copy(interaction_file, dest_file)
            logger.info(f"Exported interactions_pose_{i}.json to results")
    
    # Generate reports
    generate_docking_summary_csv(docking_results, reports_dir)
    generate_docking_report_json(session_id, docking_results, docking_params, reports_dir)
    generate_parameters_file(docking_params, reports_dir)
    
    # Create README
    create_user_readme(session_results_dir, len(docking_results))
    
    logger.info(f"Results exported to {session_results_dir}")


def generate_docking_summary_csv(docking_results: list, output_dir: Path):
    """Generate CSV summary of docking results."""
    import csv
    
    csv_file = output_dir / "docking_summary.csv"
    
    with open(csv_file, 'w', newline='') as f:
        fieldnames = ['Pose', 'Affinity (kcal/mol)', 'RMSD l.b.', 'RMSD u.b.', 'Cavity ID', 'Complex File', 'Interactions File']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        
        for i, result in enumerate(docking_results, 1):
            writer.writerow({
                'Pose': i,
                'Affinity (kcal/mol)': result.get('affinity', 'N/A'),
                'RMSD l.b.': result.get('rmsd_lb', 'N/A'),
                'RMSD u.b.': result.get('rmsd_ub', 'N/A'),
                'Cavity ID': result.get('cavity_id', 'N/A'),
                'Complex File': f'complexes/complex_pose_{i}.pdb',
                'Interactions File': f'interactions/interactions_pose_{i}.json'
            })
    
    logger.info(f"Generated docking_summary.csv")


def generate_docking_report_json(session_id: str, docking_results: list, docking_params: dict, output_dir: Path):
    """Generate detailed JSON report."""
    import json
    from datetime import datetime
    
    report = {
        "session_id": session_id,
        "timestamp": datetime.now().isoformat(),
        "docking_parameters": docking_params,
        "results_summary": {
            "total_poses": len(docking_results),
            "best_affinity": min([r.get('affinity', 0) for r in docking_results]) if docking_results else None,
            "worst_affinity": max([r.get('affinity', 0) for r in docking_results]) if docking_results else None
        },
        "poses": docking_results
    }
    
    json_file = output_dir / "docking_report.json"
    with open(json_file, 'w') as f:
        json.dump(report, f, indent=2)
    
    logger.info(f"Generated docking_report.json")


def generate_parameters_file(docking_params: dict, output_dir: Path):
    """Generate parameters file (SwissDock-style)."""
    params_file = output_dir / "parameters.txt"
    
    content = "Docking Parameters\n"
    content += "==================\n\n"
    
    for key, value in docking_params.items():
        content += f"{key}: {value}\n"
    
    params_file.write_text(content)
    logger.info(f"Generated parameters.txt")


def create_user_readme(results_dir: Path, num_poses: int):
    """Create README for user guidance."""
    readme = results_dir / "README.txt"
    
    content = f"""Molecular Docking Results
=========================

This folder contains your docking results organized in a SwissDock-style structure.

Directory Structure:
--------------------

complexes/
    Validated protein-ligand complex structures in PDB format.
    Compatible with PyMOL, Chimera, UCSF ChimeraX, and Discovery Studio.
    Files: complex_pose_1.pdb, complex_pose_2.pdb, ... (Total: {num_poses} poses)

interactions/
    Detailed interaction analysis for each pose in JSON format.
    Contains hydrogen bonds, hydrophobic contacts, salt bridges, π-stacking, etc.
    Files: interactions_pose_1.json, interactions_pose_2.json, ...

reports/
    - docking_summary.csv: Quick overview of all poses (Excel-compatible)
    - docking_report.json: Complete docking metadata and parameters
    - parameters.txt: Docking parameters used

Usage Guide:
------------

1. Review Results:
   - Open docking_summary.csv in Excel/LibreOffice for quick overview
   - Poses are ranked by binding affinity (lower = better binding)

2. Visualize Structures:
   - Open complexes/*.pdb in PyMOL, Chimera, or Discovery Studio
   - Protein is shown as ATOM records
   - Ligand is shown as HETATM records (resname: UNL)

3. Analyze Interactions:
   - Read interactions/*.json for detailed binding analysis
   - Identify key residues and interaction types
   - Validate biological relevance

Best Practices:
---------------

- Focus on top 3-5 poses with best affinity
- Check interaction diversity (not just affinity)
- Validate with experimental data when available
- Consider structural stability and druggability

For questions or issues, refer to the main documentation.

Generated by Molecular Docking Platform
"""
    
    readme.write_text(content)
    logger.info(f"Generated README.txt")


# ====================================================
# DOCKING ENDPOINT
# ====================================================

@app.get("/api/protein/metadata/{session_id}")
async def get_protein_metadata(session_id: str):
    """Get protein structure metadata (chains, residues, atoms)."""
    try:
        session_dir = get_session_dir(session_id)
        protein_file = session_dir / "protein_prepared.pdbqt"
        
        if not protein_file.exists():
            raise HTTPException(status_code=404, detail="Prepared protein not found")
        
        # Parse PDBQT to extract metadata
        chains = set()
        num_atoms = 0
        residues = set()
        residue_names = set()
        
        for line in protein_file.read_text().splitlines():
            if line.startswith('ATOM') or line.startswith('HETATM'):
                try:
                    chain = line[21] if len(line) > 21 else ' '
                    chains.add(chain)
                    
                    res_name = line[17:20].strip() if len(line) > 20 else ''
                    res_num = line[22:26].strip() if len(line) > 26 else ''
                    if res_name and res_num:
                        residues.add(f"{res_name}_{res_num}_{chain}")
                        residue_names.add(res_name)
                    
                    num_atoms += 1
                except (ValueError, IndexError):
                    continue
        
        return {
            "status": "ok",
            "metadata": {
                "chains": sorted([c for c in chains if c.strip()]),
                "num_chains": len([c for c in chains if c.strip()]),
                "num_residues": len(residues),
                "num_atoms": num_atoms,
                "residue_types": sorted(residue_names)
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        return json_error(str(e))

@app.delete("/api/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a session and all associated files."""
    try:
        session_dir = get_session_dir(session_id)
        shutil.rmtree(session_dir)
        return {"status": "ok", "message": f"Session {session_id} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        return json_error(str(e))

@app.delete("/api/clear")
async def clear_work_dir():
    """Clear all files in work directory."""
    try:
        for item in WORK_DIR.iterdir():
            if item.is_file():
                item.unlink()
        return {"status": "ok", "message": "Work directory cleared"}
    except Exception as e:
        return json_error(str(e))

@app.get("/api/interactions/{session_id}/{pose_number}")
async def get_interactions(session_id: str, pose_number: int = 1):
    """
    Analyze protein-ligand interactions for a specific pose.
    
    Args:
        session_id: Session ID
        pose_number: Pose number to analyze (1-based)
    
    Returns:
        Detailed interaction analysis including all interaction types
    """
    try:
        import interaction_analysis
        
        session_dir = get_session_dir(session_id)
        protein_file = session_dir / "protein_prepared.pdbqt"
        ligand_file = session_dir / "docking_out_out.pdbqt"
        
        if not protein_file.exists():
            raise HTTPException(status_code=404, detail="Prepared protein not found")
        if not ligand_file.exists():
            raise HTTPException(status_code=404, detail="Docking results not found")
        
        # Analyze interactions
        result = interaction_analysis.analyze_interactions(
            str(protein_file),
            str(ligand_file),
            pose_number
        )
        
        # Check if there was an error in the analysis
        if 'error' in result:
            # Return the result with error info but don't raise exception
            return {"status": "error", "message": result['error'], **result}
        
        return {"status": "ok", **result}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in interaction analysis: {error_details}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(e),
                "details": error_details
            }
        )

@app.get("/api/interactions/summary/{session_id}")
async def get_interactions_summary(session_id: str, num_poses: int = 9):
    """
    Get interaction summary for all poses.
    
    Args:
        session_id: Session ID
        num_poses: Number of poses to analyze (default: 9)
    
    Returns:
        Summary of interactions for each pose
    """
    try:
        import interaction_analysis
        
        session_dir = get_session_dir(session_id)
        protein_file = session_dir / "protein_prepared.pdbqt"
        ligand_file = session_dir / "docking_out_out.pdbqt"
        
        if not protein_file.exists():
            raise HTTPException(status_code=404, detail="Prepared protein not found")
        if not ligand_file.exists():
            raise HTTPException(status_code=404, detail="Docking results not found")
        
        # Get summaries for all poses
        summaries = interaction_analysis.get_interaction_summary_all_poses(
            str(protein_file),
            str(ligand_file),
            num_poses
        )
        
        return {"status": "ok", "summaries": summaries}
    except HTTPException:
        raise
    except Exception as e:
        return json_error(str(e))

@app.post("/api/alphafold/uniprot/{session_id}")
async def fetch_alphafold_from_uniprot(session_id: str, uniprot_id: str):
    """
    Fetch AlphaFold predicted structure from UniProt ID.
    
    Args:
        session_id: Session ID
        uniprot_id: UniProt accession ID (e.g., 'P12345')
    
    Returns:
        Structure file metadata and confidence scores
    """
    try:
        session_dir = get_session_dir(session_id)
        
        # Output file path
        output_file = session_dir / f"protein_alphafold_{uniprot_id}.pdb"
        
        # Fetch structure from AlphaFold DB
        _, metadata = alphafold_integration.get_structure_from_uniprot_or_sequence(
            uniprot_id=uniprot_id,
            output_file=output_file
        )
        
        # Get additional UniProt metadata
        uniprot_metadata = alphafold_integration.fetch_uniprot_metadata(uniprot_id)
        
        return {
            "status": "ok",
            "filename": output_file.name,
            "structure_metadata": metadata,
            "protein_info": uniprot_metadata
        }
    except alphafold_integration.AlphaFoldError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        return json_error(str(e))

@app.post("/api/alphafold/sequence/{session_id}")
async def predict_structure_from_sequence(session_id: str, fasta_sequence: str):
    """
    Predict protein structure from FASTA sequence using ESMFold.
    
    Args:
        session_id: Session ID
        fasta_sequence: Protein amino acid sequence
    
    Returns:
        Predicted structure file metadata and confidence scores
    """
    try:
        session_dir = get_session_dir(session_id)
        
        # Generate filename based on sequence hash
        import hashlib
        seq_hash = hashlib.md5(fasta_sequence.encode()).hexdigest()[:8]
        output_file = session_dir / f"protein_predicted_{seq_hash}.pdb"
        
        # Predict structure using ESMFold
        _, metadata = alphafold_integration.get_structure_from_uniprot_or_sequence(
            fasta_sequence=fasta_sequence,
            output_file=output_file
        )
        
        return {
            "status": "ok",
            "filename": output_file.name,
            "structure_metadata": metadata
        }
    except alphafold_integration.AlphaFoldError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        return json_error(str(e))

@app.get("/api/alphafold/uniprot/info/{uniprot_id}")
async def get_uniprot_info(uniprot_id: str):
    """
    Get protein information from UniProt database.
    
    Args:
        uniprot_id: UniProt accession ID
    
    Returns:
        Protein metadata (name, organism, sequence length, etc.)
    """
    try:
        metadata = alphafold_integration.fetch_uniprot_metadata(uniprot_id)
        return {"status": "ok", "protein_info": metadata}
    except Exception as e:
        return json_error(str(e))



