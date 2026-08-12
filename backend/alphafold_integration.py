"""
AlphaFold Integration Module

Provides functionality to fetch predicted protein structures from AlphaFold database
or predict structures from FASTA sequences using AlphaFold API.

Supports:
- UniProt ID lookup (fetch pre-computed structures from AlphaFold DB)
- FASTA sequence prediction (using ESMFold API as AlphaFold2 alternative)
"""

import re
import time
import statistics
from pathlib import Path
from typing import Optional, Dict, Tuple

import requests


class AlphaFoldError(Exception):
    """Custom exception for AlphaFold-related errors."""
    pass


# ESMFold API limits
# Theoretical max is ~2000 residues, but we use conservative limit
# for better performance and reliability
MAX_ESMFOLD_LENGTH = 1024  # residues

# File size limits (prevent disk/memory exhaustion)
MAX_PDB_SIZE = 50 * 1024 * 1024  # 50 MB (typical PDB is <10 MB)

# ESMFold API endpoint (Meta AI)
ESMFOLD_URL = "https://api.esmatlas.com/foldSequence/v1/pdb/"

# Standard 20 amino acids for cleaning
STANDARD_AMINO_ACIDS = set('ACDEFGHIKLMNPQRSTVWY')


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
    uniprot_id = uniprot_id.strip()
    pattern = r'^[A-Z][A-Z0-9]{5,9}(-\d+)?$'
    return bool(re.match(pattern, uniprot_id))


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
            - warnings: List of warning messages
            - can_predict: Whether cleaned sequence can be used for prediction
    """
    # Remove whitespace and newlines first
    raw_seq = ''.join(sequence.split()).upper()

    cleaned_chars = []
    removed_chars = {}

    for i, char in enumerate(raw_seq):
        if char in STANDARD_AMINO_ACIDS:
            cleaned_chars.append(char)
        else:
            removed_chars[char] = removed_chars.get(char, 0) + 1

    cleaned_sequence = ''.join(cleaned_chars)
    original_length = len(raw_seq)
    cleaned_length = len(cleaned_sequence)
    removed_count = original_length - cleaned_length

    is_valid = (removed_count == 0)

    warnings = []

    # Generate helpful warnings
    if removed_count > 0:
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
        'warnings': warnings,
        'can_predict': can_predict
    }


def _parse_plddt(pdb_text: str) -> Tuple[float, str]:
    """
    Parse pLDDT confidence scores from B-factor column of PDB text.

    Handles both AlphaFold (0-100 scale) and ESMFold (0.0-1.0 scale).

    Args:
        pdb_text: PDB file contents as string

    Returns:
        Tuple of (avg_plddt_0_100, confidence_tier)

    Raises:
        AlphaFoldError: If no pLDDT scores can be parsed
    """
    plddt_scores = []
    failed_parses = 0

    for line in pdb_text.splitlines():
        if line.startswith('ATOM'):
            try:
                plddt_scores.append(float(line[60:66].strip()))
            except (ValueError, IndexError):
                failed_parses += 1

    if not plddt_scores:
        raise AlphaFoldError(
            "Could not parse pLDDT scores from PDB file. "
            "File may be corrupted or in unexpected format."
        )

    if failed_parses > 0:
        print(f"[WARNING] Failed to parse {failed_parses} pLDDT scores from PDB file")

    avg = statistics.mean(plddt_scores)

    # ESMFold returns pLDDT as fractions (0.0–1.0); normalise to 0–100
    avg_display = avg * 100 if avg <= 1.0 else avg

    if avg_display > 90:
        confidence = "very_high"
    elif avg_display > 70:
        confidence = "high"
    elif avg_display > 50:
        confidence = "low"
    else:
        confidence = "very_low"

    return round(avg_display, 2), confidence


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

    # Rate limit: 1 second between requests
    time.sleep(1.0)

    for attempt in range(3):
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

            if not api_data:
                raise AlphaFoldError(
                    f"No AlphaFold prediction data found for UniProt ID: {uniprot_id}"
                )

            latest_version = api_data[0].get('latestVersion')
            model_id = api_data[0].get('modelEntityId')

            if latest_version is None:
                raise AlphaFoldError(
                    f"Could not determine AlphaFold model version for {uniprot_id}. "
                    "API response missing 'latestVersion' field."
                )

            if model_id is None:
                model_id = f'AF-{uniprot_id}-F1'
                print(f"[WARNING] Using fallback model ID: {model_id}")

            print(f"[INFO] Found AlphaFold model: {model_id} (version {latest_version})")

            # Step 2: Download the PDB file
            url = f"https://alphafold.ebi.ac.uk/files/{model_id}-model_v{latest_version}.pdb"
            response = requests.get(url, timeout=30)
            response.raise_for_status()

            # Validate file size before writing
            file_size = len(response.content)
            if file_size > MAX_PDB_SIZE:
                raise AlphaFoldError(
                    f"Structure file too large ({file_size / 1024 / 1024:.1f} MB). "
                    f"Maximum allowed: {MAX_PDB_SIZE / 1024 / 1024:.0f} MB."
                )

            # Save PDB file atomically
            temp_file = output_file.with_suffix('.tmp')
            try:
                temp_file.write_text(response.text)
                temp_file.replace(output_file)
            except Exception as e:
                if temp_file.exists():
                    temp_file.unlink()
                raise AlphaFoldError(f"Failed to save structure file: {e}")

            avg_plddt, confidence = _parse_plddt(response.text)

            print(f"[SUCCESS] AlphaFold structure downloaded successfully")
            print(f"   Model version: {latest_version}")
            print(f"   Average pLDDT score: {avg_plddt:.2f} ({confidence} confidence)")

            return {
                "source": "alphafold_db",
                "uniprot_id": uniprot_id,
                "model_version": latest_version,
                "avg_plddt": avg_plddt,
                "confidence": confidence,
                "num_residues": len([l for l in response.text.splitlines() if l.startswith('ATOM')]),
                "url": url
            }

        except requests.exceptions.RequestException as e:
            if attempt == 2:
                raise AlphaFoldError(f"Failed to fetch AlphaFold structure: {str(e)}")
            delay = 2.0 * (2 ** attempt)
            print(f"[RETRY] Attempt {attempt + 1}/3 failed: {e}. Retrying in {delay:.1f}s...")
            time.sleep(delay)

    raise AlphaFoldError("Failed to fetch AlphaFold structure after 3 attempts")


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

    if not cleaning_result['is_valid']:
        print(f"\n[SEQUENCE CLEANING] Found {cleaning_result['removed_count']} invalid character(s)")

        if cleaning_result['removed_chars']:
            char_summary = ", ".join(f"'{c}'×{n}" for c, n in cleaning_result['removed_chars'].items())
            print(f"   Removed characters: {char_summary}")

        for warning in cleaning_result['warnings']:
            print(f"   [!] {warning}")

        if auto_clean:
            print(f"   [OK] Auto-cleaning: Using cleaned sequence ({cleaning_result['cleaned_length']} residues)")
            sequence = cleaning_result['cleaned_sequence']
        else:
            error_details = []
            if cleaning_result['removed_chars']:
                error_details.append(f"Invalid characters: {cleaning_result['removed_chars']}")
            raise AlphaFoldError(
                f"Invalid FASTA sequence. {' '.join(error_details)}. "
                "Enable auto_clean=True to automatically remove invalid characters."
            )
    else:
        print(f"[INFO] Sequence validated: {cleaning_result['original_length']} residues (all valid)")
        sequence = cleaning_result['cleaned_sequence']

    if not cleaning_result['can_predict']:
        raise AlphaFoldError(
            f"Cannot predict structure: {cleaning_result['warnings'][0] if cleaning_result['warnings'] else 'Sequence too short'}"
        )

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
    adaptive_timeout = min(max(60 + len(sequence) * 0.5, 60), 600)
    print(f"   Estimated time: {adaptive_timeout // 60:.0f}-{(adaptive_timeout // 60) + 1:.0f} minutes (timeout: {adaptive_timeout}s)")

    # Rate limit: 1 second between requests
    time.sleep(1.0)

    for attempt in range(2):
        try:
            response = requests.post(
                ESMFOLD_URL,
                data=sequence,
                headers={'Content-Type': 'text/plain'},
                timeout=adaptive_timeout
            )

            if response.status_code == 400:
                raise AlphaFoldError(
                    "The ESMFold public API rejected the request (HTTP 400). "
                    "This may be due to API rate-limiting or a temporary issue at api.esmatlas.com. "
                    "Please try again in a few minutes, or use a UniProt ID instead."
                )
            if response.status_code in (502, 503):
                raise AlphaFoldError(
                    f"The ESMFold API is currently unavailable (HTTP {response.status_code}). "
                    "Please try again later or use a UniProt ID instead."
                )
            response.raise_for_status()

            file_size = len(response.content)
            if file_size > MAX_PDB_SIZE:
                raise AlphaFoldError(
                    f"Predicted structure file too large ({file_size / 1024 / 1024:.1f} MB). "
                    f"Maximum allowed: {MAX_PDB_SIZE / 1024 / 1024:.0f} MB."
                )

            # Save PDB file atomically
            pdb_content = response.text
            temp_file = output_file.with_suffix('.tmp')
            try:
                temp_file.write_text(pdb_content)
                temp_file.replace(output_file)
            except Exception as e:
                if temp_file.exists():
                    temp_file.unlink()
                raise AlphaFoldError(f"Failed to save prediction file: {e}")

            avg_plddt, confidence = _parse_plddt(pdb_content)

            print(f"[SUCCESS] Structure prediction complete")
            print(f"   Average pLDDT score: {avg_plddt:.1f}/100 ({confidence} confidence)")

            result = {
                "source": "esmfold",
                "sequence_length": len(sequence),
                "avg_plddt": avg_plddt,
                "confidence": confidence,
                "num_residues": len([l for l in pdb_content.splitlines() if l.startswith('ATOM')])
            }

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
                f"Structure prediction timed out after {adaptive_timeout:.0f} seconds. "
                f"Sequence length: {len(sequence)} residues. "
                "The ESMFold public API may be under high load. "
                "Try again in a few minutes, or use a UniProt ID if available."
            )
        except requests.exceptions.ConnectionError:
            raise AlphaFoldError(
                "Cannot reach the ESMFold API (api.esmatlas.com). "
                "The server may be temporarily offline. "
                "Please try again later, or use a UniProt ID to fetch from AlphaFold DB instead."
            )
        except AlphaFoldError:
            raise
        except requests.exceptions.RequestException as e:
            if attempt == 1:
                raise AlphaFoldError(f"ESMFold prediction failed: {str(e)}")
            delay = 5.0 * (2 ** attempt)
            print(f"[RETRY] Attempt {attempt + 1}/2 failed: {e}. Retrying in {delay:.1f}s...")
            time.sleep(delay)

    raise AlphaFoldError("ESMFold prediction failed after 2 attempts")


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

    # Rate limit: 1 second between requests
    time.sleep(1.0)

    for attempt in range(2):
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()

            data = response.json()

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
            if attempt == 1:
                print(f"[WARNING] Could not fetch UniProt metadata: {e}")
                return {"protein_name": "Unknown", "organism": "Unknown", "sequence_length": 0, "uniprot_id": uniprot_id}
            delay = 1.0 * (2 ** attempt)
            print(f"[RETRY] UniProt metadata attempt {attempt + 1}/2 failed: {e}. Retrying in {delay:.1f}s...")
            time.sleep(delay)
        except KeyError as e:
            print(f"[WARNING] UniProt API response format unexpected: {e}")
            return {"protein_name": "Unknown", "organism": "Unknown", "sequence_length": 0, "uniprot_id": uniprot_id}
        except Exception as e:
            print(f"[ERROR] Unexpected error fetching UniProt metadata: {e}")
            raise

    return {"protein_name": "Unknown", "organism": "Unknown", "sequence_length": 0, "uniprot_id": uniprot_id}
