"""
AlphaFold Integration Module

Provides functionality to fetch predicted protein structures from AlphaFold database
or predict structures from FASTA sequences using AlphaFold API.

Supports:
- UniProt ID lookup (fetch pre-computed structures from AlphaFold DB)
- FASTA sequence prediction (using ESMFold API as AlphaFold2 alternative)
"""

import requests
import time
from pathlib import Path
from typing import Optional, Dict, Tuple
import re
from functools import wraps


class AlphaFoldError(Exception):
    """Custom exception for AlphaFold-related errors."""
    pass


# ====================================================
# RATE LIMITING AND RETRY LOGIC
# ====================================================
_last_request_time = 0
_min_request_interval = 1.0  # 1 second between requests

# ESMFold API limits
# Theoretical max is ~2000 residues, but we use conservative limit
# for better performance and reliability
MAX_ESMFOLD_LENGTH = 1024  # residues

# File size limits (prevent disk/memory exhaustion)
MAX_PDB_SIZE = 50 * 1024 * 1024  # 50 MB (typical PDB is <10 MB)

# API endpoints (configurable for version changes)
ESMFOLD_API_VERSION = "v1"
ESMFOLD_API_BASE = "https://api.esmatlas.com"


def get_esmfold_endpoint() -> str:
    """Get ESMFold API endpoint with current version."""
    return f"{ESMFOLD_API_BASE}/foldSequence/{ESMFOLD_API_VERSION}/pdb/"


def rate_limit(func):
    """
    Decorator to enforce rate limiting on API requests.
    Prevents API abuse by ensuring minimum time between requests.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        global _last_request_time
        now = time.time()
        elapsed = now - _last_request_time
        if elapsed < _min_request_interval:
            sleep_time = _min_request_interval - elapsed
            print(f"[RATE LIMIT] Waiting {sleep_time:.2f}s before next request...")
            time.sleep(sleep_time)
        _last_request_time = time.time()
        return func(*args, **kwargs)
    return wrapper


def retry_with_backoff(max_retries=3, base_delay=1.0):
    """
    Decorator to retry failed requests with exponential backoff.
    
    Args:
        max_retries: Maximum number of retry attempts
        base_delay: Base delay in seconds (doubles with each retry)
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except requests.exceptions.RequestException as e:
                    if attempt == max_retries - 1:
                        raise  # Re-raise on final attempt
                    
                    delay = base_delay * (2 ** attempt)
                    print(f"[RETRY] Attempt {attempt + 1}/{max_retries} failed: {e}")
                    print(f"   Retrying in {delay:.1f}s...")
                    time.sleep(delay)
            return None
        return wrapper
    return decorator


def validate_uniprot_id(uniprot_id: str) -> bool:
    """
    Validate UniProt ID format.
    
    Args:
        uniprot_id: UniProt accession ID
        
    Returns:
        True if valid format, False otherwise
    
    Examples:
        P12345 - Valid (standard format)
        A0A0C5B5G6 - Valid (10 characters)
        P12345-2 - Valid (isoform ID)
    """
    # UniProt IDs are typically 6-10 uppercase alphanumeric characters
    # Must start with a letter, examples: P12345, A0A0C5B5G6
    # Isoform IDs add hyphen and digit(s): P12345-2
    # Pattern: First character must be letter, rest alphanumeric, 6-10 total
    # Optional: -\d+ for isoforms
    uniprot_id = uniprot_id.strip()
    pattern = r'^[A-Z][A-Z0-9]{5,9}(-\d+)?$'
    return bool(re.match(pattern, uniprot_id))


def validate_fasta_sequence(sequence: str, strict: bool = True) -> bool:
    """
    Validate FASTA sequence format.
    
    Args:
        sequence: Protein sequence (amino acids)
        strict: If True, only allow standard 20 amino acids (default: True)
        
    Returns:
        True if valid, False otherwise
    
    Accepts (strict=True):
        - Standard 20 amino acids: ACDEFGHIKLMNPQRSTVWY
        
    Accepts (strict=False):
        - Standard 20 amino acids: ACDEFGHIKLMNPQRSTVWY
        - Ambiguous codes: B (Asx), Z (Glx), X (any)
        - Rare amino acids: U (Selenocysteine), O (Pyrrolysine)
    """
    # Remove whitespace and newlines
    seq = ''.join(sequence.split())
    
    if strict:
        # Only standard 20 amino acids
        valid_aa = set('ACDEFGHIKLMNPQRSTVWY')
    else:
        # Standard 20 + ambiguous (B, Z, X) + rare (U, O)
        valid_aa = set('ACDEFGHIKLMNPQRSTVWYBZXUO')
    
    return len(seq) > 0 and all(c.upper() in valid_aa for c in seq)


# Standard 20 amino acids for cleaning
STANDARD_AMINO_ACIDS = set('ACDEFGHIKLMNPQRSTVWY')


def clean_fasta_sequence(sequence: str, auto_clean: bool = True) -> Dict:
    """
    Clean and validate a FASTA sequence, removing invalid characters.
    
    This function helps users with sequences that may have been corrupted
    during copy-paste or contain non-standard characters.
    
    Args:
        sequence: Raw protein sequence (may contain invalid characters)
        auto_clean: If True, automatically remove invalid characters
        
    Returns:
        Dictionary with:
            - cleaned_sequence: The cleaned sequence (only valid amino acids)
            - original_length: Length of original sequence
            - cleaned_length: Length after cleaning
            - is_valid: Whether original sequence was already valid
            - removed_count: Number of characters removed
            - removed_chars: Dictionary of {character: count} for removed chars
            - removed_positions: List of (position, character) tuples
            - warnings: List of warning messages
            - can_predict: Whether cleaned sequence can be used for prediction
    """
    # Remove whitespace and newlines first
    raw_seq = ''.join(sequence.split()).upper()
    
    cleaned_chars = []
    removed_chars = {}
    removed_positions = []
    warnings = []
    
    for i, char in enumerate(raw_seq):
        if char in STANDARD_AMINO_ACIDS:
            cleaned_chars.append(char)
        else:
            removed_chars[char] = removed_chars.get(char, 0) + 1
            removed_positions.append((i + 1, char))  # 1-indexed positions
    
    cleaned_sequence = ''.join(cleaned_chars)
    original_length = len(raw_seq)
    cleaned_length = len(cleaned_sequence)
    removed_count = original_length - cleaned_length
    
    is_valid = (removed_count == 0)
    
    # Generate helpful warnings
    if removed_count > 0:
        # Categorize removed characters
        numbers_found = [c for c in removed_chars.keys() if c.isdigit()]
        non_standard_aa = [c for c in removed_chars.keys() if c in 'BJOUXZ']
        other_invalid = [c for c in removed_chars.keys() if c not in numbers_found and c not in non_standard_aa]
        
        if numbers_found:
            warnings.append(f"Found numbers in sequence: {', '.join(numbers_found)}. "
                          "Sequences should only contain amino acid letters.")
        
        if non_standard_aa:
            aa_names = {
                'B': 'B (Asx - Asp or Asn)',
                'J': 'J (not a valid amino acid)',
                'O': 'O (Pyrrolysine - rare)',
                'U': 'U (Selenocysteine - rare)',
                'X': 'X (unknown amino acid)',
                'Z': 'Z (Glx - Glu or Gln)'
            }
            warnings.append(f"Found non-standard amino acid codes: "
                          f"{', '.join(aa_names.get(c, c) for c in non_standard_aa)}. "
                          "ESMFold works best with standard 20 amino acids.")
        
        if other_invalid:
            warnings.append(f"Found other invalid characters: {', '.join(other_invalid)}")
        
        # Check if sequence looks corrupted (high ratio of invalid chars at end)
        if removed_count > 10 and len(removed_positions) > 0:
            # Check if most invalid chars are at the end (potential copy-paste corruption)
            last_valid_pos = max(i for i, c in enumerate(raw_seq) if c in STANDARD_AMINO_ACIDS) if cleaned_length > 0 else 0
            end_removed = sum(1 for pos, _ in removed_positions if pos > last_valid_pos)
            
            if end_removed > removed_count * 0.7:
                warnings.append("Sequence appears corrupted at the end. "
                              "This often happens during copy-paste. "
                              "Please verify the source sequence.")
    
    # Determine if prediction is possible
    can_predict = cleaned_length >= 10  # Minimum sensible length
    
    if cleaned_length < 10:
        warnings.append("Cleaned sequence is too short (< 10 residues) for structure prediction.")
    elif cleaned_length > MAX_ESMFOLD_LENGTH:
        warnings.append(f"Cleaned sequence ({cleaned_length} residues) exceeds ESMFold limit ({MAX_ESMFOLD_LENGTH}). "
                       "Consider using UniProt ID if available.")
    
    return {
        'cleaned_sequence': cleaned_sequence,
        'original_length': original_length,
        'cleaned_length': cleaned_length,
        'is_valid': is_valid,
        'removed_count': removed_count,
        'removed_chars': removed_chars,
        'removed_positions': removed_positions[:20],  # Limit to first 20 for display
        'warnings': warnings,
        'can_predict': can_predict
    }


@rate_limit
@retry_with_backoff(max_retries=3, base_delay=2.0)
def fetch_alphafold_structure(uniprot_id: str, output_file: Path) -> Dict:
    """
    Fetch pre-computed AlphaFold structure from AlphaFold database.
    
    Args:
        uniprot_id: UniProt accession ID (e.g., 'P12345')
        output_file: Path to save the PDB file
        
    Returns:
        Dictionary with metadata about the structure
        
    Raises:
        AlphaFoldError: If structure cannot be fetched
    """
    uniprot_id = uniprot_id.strip().upper()
    
    if not validate_uniprot_id(uniprot_id):
        raise AlphaFoldError(f"Invalid UniProt ID format: {uniprot_id}")
    
    print(f"[INFO] Fetching AlphaFold structure for UniProt ID: {uniprot_id}")
    
    try:
        # Step 1: Query AlphaFold API to get the latest version
        api_url = f"https://alphafold.ebi.ac.uk/api/prediction/{uniprot_id}"
        api_response = requests.get(api_url, timeout=10)
        
        if api_response.status_code == 404:
            raise AlphaFoldError(
                f"No AlphaFold structure found for UniProt ID: {uniprot_id}. "
                "This protein may not be in the AlphaFold database yet."
            )
        
        api_response.raise_for_status()
        api_data = api_response.json()
        
        # CRITICAL: Check if list is empty BEFORE accessing elements
        if not api_data or len(api_data) == 0:
            raise AlphaFoldError(
                f"No AlphaFold prediction data found for UniProt ID: {uniprot_id}"
            )
        
        # NOW safe to access api_data[0]
        latest_version = api_data[0].get('latestVersion')
        model_id = api_data[0].get('modelEntityId')
        
        # Validate required fields (fail fast instead of using defaults)
        if latest_version is None:
            raise AlphaFoldError(
                f"Could not determine AlphaFold model version for {uniprot_id}. "
                "API response missing 'latestVersion' field."
            )
        
        if model_id is None:
            # Fallback to standard format only if model_id is missing
            model_id = f'AF-{uniprot_id}-F1'
            print(f"[WARNING] Using fallback model ID: {model_id}")
        
        print(f"[INFO] Found AlphaFold model: {model_id} (version {latest_version})")
        
        # Step 2: Download the PDB file using the correct version
        # Format: https://alphafold.ebi.ac.uk/files/AF-{UNIPROT_ID}-F1-model_v{VERSION}.pdb
        url = f"https://alphafold.ebi.ac.uk/files/{model_id}-model_v{latest_version}.pdb"
        
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        # Validate file size before writing (prevent disk exhaustion)
        file_size = len(response.content)
        if file_size > MAX_PDB_SIZE:
            raise AlphaFoldError(
                f"Structure file too large ({file_size / 1024 / 1024:.1f} MB). "
                f"Maximum allowed: {MAX_PDB_SIZE / 1024 / 1024:.0f} MB. "
                "This may indicate a corrupted download or API error."
            )
        
        # Save PDB file atomically (prevent corruption on interruption)
        # Write to temp file first, then atomic rename
        temp_file = output_file.with_suffix('.tmp')
        try:
            temp_file.write_text(response.text)
            temp_file.replace(output_file)  # Atomic on most systems
        except Exception as e:
            # Cleanup temp file on failure
            if temp_file.exists():
                temp_file.unlink()
            raise AlphaFoldError(f"Failed to save structure file: {e}")
        
        # Parse confidence scores from pLDDT values in B-factor column
        plddt_scores = []
        failed_parses = 0
        
        for line in response.text.splitlines():
            if line.startswith('ATOM'):
                try:
                    plddt = float(line[60:66].strip())
                    plddt_scores.append(plddt)
                except (ValueError, IndexError):
                    failed_parses += 1
                    continue
        
        # Validate parsing results
        if not plddt_scores:
            raise AlphaFoldError(
                f"Could not parse pLDDT scores from AlphaFold PDB file for {uniprot_id}. "
                "File may be corrupted or in unexpected format."
            )
        
        if failed_parses > 0:
            print(f"[WARNING] Failed to parse {failed_parses} pLDDT scores from PDB file")
        
        avg_plddt = sum(plddt_scores) / len(plddt_scores)
        
        # Confidence interpretation
        # pLDDT > 90: Very high confidence
        # pLDDT 70-90: High confidence
        # pLDDT 50-70: Low confidence
        # pLDDT < 50: Very low confidence
        if avg_plddt > 90:
            confidence = "very_high"
        elif avg_plddt > 70:
            confidence = "high"
        elif avg_plddt > 50:
            confidence = "low"
        else:
            confidence = "very_low"
        
        print(f"[SUCCESS] AlphaFold structure downloaded successfully")
        print(f"   Model version: {latest_version}")
        print(f"   Average pLDDT score: {avg_plddt:.2f} ({confidence} confidence)")
        
        return {
            "source": "alphafold_db",
            "uniprot_id": uniprot_id,
            "model_version": latest_version,
            "avg_plddt": round(avg_plddt, 2),
            "confidence": confidence,
            "num_residues": len(plddt_scores),
            "url": url
        }
        
    except requests.exceptions.RequestException as e:
        raise AlphaFoldError(f"Failed to fetch AlphaFold structure: {str(e)}")


@rate_limit
@retry_with_backoff(max_retries=2, base_delay=5.0)
def predict_structure_esmfold(
    sequence: str, 
    output_file: Path, 
    timeout: int = 300,
    auto_clean: bool = True
) -> Dict:
    """
    Predict protein structure from FASTA sequence using ESMFold API.
    
    ESMFold is a fast alternative to AlphaFold2 that can predict structures
    in real-time without requiring MSA (multiple sequence alignment).
    
    Args:
        sequence: Protein amino acid sequence
        output_file: Path to save the predicted PDB file
        timeout: Maximum time to wait for prediction (seconds)
        auto_clean: If True, automatically clean invalid characters from sequence
        
    Returns:
        Dictionary with metadata about the prediction (includes cleaning_report if cleaned)
        
    Raises:
        AlphaFoldError: If prediction fails
    """
    # Use cleaning function for better error handling
    cleaning_result = clean_fasta_sequence(sequence)
    
    # Report cleaning results to user
    if not cleaning_result['is_valid']:
        print(f"\n[SEQUENCE CLEANING] Found {cleaning_result['removed_count']} invalid character(s)")
        
        # Show what was removed
        if cleaning_result['removed_chars']:
            char_summary = ", ".join(f"'{c}'×{n}" for c, n in cleaning_result['removed_chars'].items())
            print(f"   Removed characters: {char_summary}")
        
        # Show warnings
        for warning in cleaning_result['warnings']:
            print(f"   [!] {warning}")
        
        if auto_clean:
            print(f"   [OK] Auto-cleaning: Using cleaned sequence ({cleaning_result['cleaned_length']} residues)")
            sequence = cleaning_result['cleaned_sequence']
        else:
            # Build detailed error message
            error_details = []
            if cleaning_result['removed_chars']:
                error_details.append(f"Invalid characters: {cleaning_result['removed_chars']}")
            if cleaning_result['removed_positions'][:5]:
                pos_examples = ", ".join(f"pos {p}: '{c}'" for p, c in cleaning_result['removed_positions'][:5])
                error_details.append(f"Examples: {pos_examples}")
            
            raise AlphaFoldError(
                f"Invalid FASTA sequence. {' '.join(error_details)}. "
                "Enable auto_clean=True to automatically remove invalid characters."
            )
    else:
        print(f"[INFO] Sequence validated: {cleaning_result['original_length']} residues (all valid)")
        sequence = cleaning_result['cleaned_sequence']
    
    # Check if cleaned sequence can be used
    if not cleaning_result['can_predict']:
        raise AlphaFoldError(
            f"Cannot predict structure: {cleaning_result['warnings'][0] if cleaning_result['warnings'] else 'Sequence too short'}"
        )
    
    # ESMFold API theoretical max is ~2000, but we use conservative limit for reliability
    if len(sequence) > MAX_ESMFOLD_LENGTH:
        raise AlphaFoldError(
            f"Sequence too long ({len(sequence)} residues). "
            f"ESMFold API supports sequences up to {MAX_ESMFOLD_LENGTH} residues. "
            "For longer sequences, please use UniProt ID if available."
        )
    elif len(sequence) > 600:
        print(f"[WARNING] Long sequence ({len(sequence)} residues). Prediction may take 2-5 minutes.")
    elif len(sequence) > 300:
        print(f"[WARNING] Moderate sequence length ({len(sequence)} residues). Prediction may take 1-2 minutes.")
    
    print(f"[INFO] Predicting structure using ESMFold for {len(sequence)} residue sequence")
    
    # Adaptive timeout based on sequence length
    # Longer sequences can take significantly longer depending on API load.
    # Respect explicit caller timeout when larger.
    base_timeout = 90  # 1.5 minute base
    timeout_per_residue = 0.9  # seconds per residue
    calculated_timeout = base_timeout + (len(sequence) * timeout_per_residue)
    adaptive_timeout = int(min(max(calculated_timeout, max(timeout, 180)), 900))  # Between 3-15 minutes
    
    print(f"   Estimated time: {adaptive_timeout // 60:.0f}-{(adaptive_timeout // 60) + 1:.0f} minutes (timeout: {adaptive_timeout}s)")
    
    # ESMFold API endpoint (Meta AI) - use configurable version
    url = get_esmfold_endpoint()
    
    try:
        headers = {
            'Content-Type': 'text/plain',
        }
        
        response = requests.post(url, data=sequence, headers=headers, timeout=adaptive_timeout)
        response.raise_for_status()
        
        # Validate file size before writing (prevent disk exhaustion)
        file_size = len(response.content)
        if file_size > MAX_PDB_SIZE:
            raise AlphaFoldError(
                f"Predicted structure file too large ({file_size / 1024 / 1024:.1f} MB). "
                f"Maximum allowed: {MAX_PDB_SIZE / 1024 / 1024:.0f} MB. "
                "This may indicate an API error or corrupted prediction."
            )
        
        # Save PDB file atomically (prevent corruption on interruption)
        pdb_content = response.text
        temp_file = output_file.with_suffix('.tmp')
        try:
            temp_file.write_text(pdb_content)
            temp_file.replace(output_file)  # Atomic on most systems
        except Exception as e:
            # Cleanup temp file on failure
            if temp_file.exists():
                temp_file.unlink()
            raise AlphaFoldError(f"Failed to save prediction file: {e}")
        
        # Parse pLDDT scores from B-factor column
        plddt_scores = []
        failed_parses = 0
        
        for line in pdb_content.splitlines():
            if line.startswith('ATOM'):
                try:
                    plddt = float(line[60:66].strip())
                    plddt_scores.append(plddt)
                except (ValueError, IndexError):
                    failed_parses += 1
                    continue
        
        # Validate parsing results
        if not plddt_scores:
            raise AlphaFoldError(
                "Could not parse pLDDT scores from ESMFold prediction. "
                "Prediction may have failed or returned invalid PDB format."
            )
        
        if failed_parses > 0:
            print(f"[WARNING] Failed to parse {failed_parses} pLDDT scores from prediction")
        
        avg_plddt = sum(plddt_scores) / len(plddt_scores)
        
        if avg_plddt > 90:
            confidence = "very_high"
        elif avg_plddt > 70:
            confidence = "high"
        elif avg_plddt > 50:
            confidence = "low"
        else:
            confidence = "very_low"
        
        print(f"[SUCCESS] Structure prediction complete")
        print(f"   Average pLDDT score: {avg_plddt:.2f} ({confidence} confidence)")
        
        result = {
            "source": "esmfold",
            "sequence_length": len(sequence),
            "avg_plddt": round(avg_plddt, 2),
            "confidence": confidence,
            "num_residues": len(plddt_scores)
        }
        
        # Include cleaning report if sequence was cleaned
        if not cleaning_result['is_valid']:
            result['cleaning_report'] = {
                'original_length': cleaning_result['original_length'],
                'cleaned_length': cleaning_result['cleaned_length'],
                'removed_count': cleaning_result['removed_count'],
                'removed_chars': cleaning_result['removed_chars'],
                'warnings': cleaning_result['warnings']
            }
        
        return result
        
    except requests.exceptions.Timeout:
        raise AlphaFoldError(
            f"Structure prediction timed out after {adaptive_timeout} seconds. "
            f"Sequence length: {len(sequence)} residues. "
            "Try with a shorter sequence or use a UniProt ID if available."
        )
    except requests.exceptions.RequestException as e:
        raise AlphaFoldError(f"ESMFold prediction failed: {str(e)}")


def get_structure_from_uniprot_or_sequence(
    uniprot_id: Optional[str] = None,
    fasta_sequence: Optional[str] = None,
    output_file: Path = None
) -> Tuple[Path, Dict]:
    """
    Get protein structure either from UniProt ID or FASTA sequence.
    
    Priority:
    1. If UniProt ID provided, fetch from AlphaFold DB
    2. If FASTA sequence provided, predict using ESMFold
    
    Args:
        uniprot_id: UniProt accession ID (optional)
        fasta_sequence: Protein sequence (optional)
        output_file: Path to save the structure file
        
    Returns:
        Tuple of (output_file_path, metadata_dict)
        
    Raises:
        AlphaFoldError: If neither input is provided or if structure cannot be obtained
    """
    if not uniprot_id and not fasta_sequence:
        raise AlphaFoldError("Either UniProt ID or FASTA sequence must be provided")
    
    if output_file is None:
        raise AlphaFoldError("Output file path must be provided")
    
    # Try UniProt ID first (faster, pre-computed)
    if uniprot_id:
        try:
            metadata = fetch_alphafold_structure(uniprot_id, output_file)
            return output_file, metadata
        except AlphaFoldError as e:
            if fasta_sequence:
                print(f"[WARNING] UniProt lookup failed: {e}")
                print(f"   Falling back to sequence prediction...")
            else:
                raise
    
    # Fall back to sequence prediction
    if fasta_sequence:
        metadata = predict_structure_esmfold(fasta_sequence, output_file)
        return output_file, metadata
    
    raise AlphaFoldError("Could not obtain structure from provided inputs")


@rate_limit
@retry_with_backoff(max_retries=2, base_delay=1.0)
def fetch_uniprot_metadata(uniprot_id: str) -> Dict:
    """
    Fetch protein metadata from UniProt API.
    
    Args:
        uniprot_id: UniProt accession ID
        
    Returns:
        Dictionary with protein information
    """
    uniprot_id = uniprot_id.strip().upper()
    
    url = f"https://rest.uniprot.org/uniprotkb/{uniprot_id}.json"
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        # Extract useful metadata
        protein_name = data.get('proteinDescription', {}).get('recommendedName', {}).get('fullName', {}).get('value', 'Unknown')
        organism = data.get('organism', {}).get('scientificName', 'Unknown')
        sequence_length = data.get('sequence', {}).get('length', 0)
        
        return {
            "protein_name": protein_name,
            "organism": organism,
            "sequence_length": sequence_length,
            "uniprot_id": uniprot_id
        }
    except requests.exceptions.RequestException as e:
        # Network/API errors - return defaults with warning
        print(f"[WARNING] Could not fetch UniProt metadata: {e}")
        return {
            "protein_name": "Unknown",
            "organism": "Unknown",
            "sequence_length": 0,
            "uniprot_id": uniprot_id
        }
    except KeyError as e:
        # API response format changed - return defaults with warning
        print(f"[WARNING] UniProt API response format unexpected: {e}")
        return {
            "protein_name": "Unknown",
            "organism": "Unknown",
            "sequence_length": 0,
            "uniprot_id": uniprot_id
        }
    except Exception as e:
        # Unexpected error - log and re-raise (don't swallow critical errors)
        print(f"[ERROR] Unexpected error fetching UniProt metadata: {e}")
        raise
