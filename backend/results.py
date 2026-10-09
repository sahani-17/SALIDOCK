# results.py - parsing of Vina output and PDBQT pose extraction
from pathlib import Path
from typing import List, Dict, Tuple
import math
import re
import warnings



def _validate_file_exists(file_path: str, file_description: str = "File") -> Path:
    """Helper function to validate file existence."""
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"{file_description} not found: {file_path}")
    return p

def parse_vina_output(out_pdbqt_path: str) -> List[Dict]:
    """
    Parse Vina output PDBQT file to extract binding results.
    
    Args:
        out_pdbqt_path: Path to Vina output PDBQT file
    
    Returns:
        List of dicts with: mode, affinity, rmsd_lb, rmsd_ub
    
    Raises:
        FileNotFoundError: If PDBQT file doesn't exist
        ValueError: If no VINA RESULT remarks found
    """
    p = _validate_file_exists(out_pdbqt_path, "PDBQT file")
    
    text = p.read_text()
    results = []
    
    # Parse each MODEL section
    for line in text.splitlines():
        # Look for REMARK lines with Vina results
        # Format: REMARK VINA RESULT:    -7.5      0.000      0.000
        if line.startswith('REMARK VINA RESULT:'):
            parts = line.split()
            # Validate format: REMARK VINA RESULT: <affinity> <rmsd_lb> <rmsd_ub>
            if len(parts) >= 6 and parts[1] == 'VINA' and parts[2] == 'RESULT:':
                try:
                    affinity = float(parts[3])
                    rmsd_lb = float(parts[4])
                    rmsd_ub = float(parts[5])
                    
                    # Validate affinity sign (should be negative for favorable binding)
                    if affinity > 0:
                        warnings.warn(
                            f"Positive affinity {affinity} kcal/mol detected (unfavorable binding). "
                            "This may indicate a parsing error or very poor binding."
                        )
                    
                    results.append({
                        'mode': len(results) + 1,
                        'affinity': affinity,
                        'rmsd_lb': rmsd_lb,
                        'rmsd_ub': rmsd_ub
                    })
                except (ValueError, IndexError) as e:
                    warnings.warn(f"Failed to parse REMARK line: {line.strip()} - {e}")
                    continue
            else:
                warnings.warn(f"Invalid REMARK format: {line.strip()}")
    
    # If no REMARK lines found, raise error instead of returning fake data
    if not results:
        raise ValueError(
            f"No VINA RESULT remarks found in PDBQT file: {out_pdbqt_path}. "
            "File may be corrupted or not a valid Vina output."
        )
    
    return results


def parse_vina_output_with_cavity(pdbqt_path: str, cavity_id: int, cavity_metadata: Dict) -> List[Dict]:
    """
    Parse Vina output and add cavity metadata to each pose.
    
    Args:
        pdbqt_path: Path to Vina output PDBQT file
        cavity_id: Cavity ID for this docking run
        cavity_metadata: Full cavity dictionary with metadata
    
    Returns:
        List of pose dictionaries with cavity information added:
        [
            {
                'mode': 1,
                'affinity': -9.2,
                'rmsd_lb': 0.0,
                'rmsd_ub': 0.0,
                'cavity_id': 2,
                'cavity_rank': 2,
                'cavity_volume': 380.5,
                'cavity_center': (5.2, 18.1, 12.3),
                'cavity_size': (16.0, 18.0, 17.0)
            },
            ...
        ]
    """
    # Parse standard Vina output
    poses = parse_vina_output(pdbqt_path)
    
    # Validate cavity metadata has required keys
    required_keys = ['rank', 'volume', 'center', 'size']
    for key in required_keys:
        if key not in cavity_metadata:
            warnings.warn(f"Missing cavity metadata key '{key}' for cavity {cavity_id}")
    
    # Add cavity metadata to each pose
    for pose in poses:
        pose['cavity_id'] = cavity_id
        pose['cavity_rank'] = cavity_metadata.get('rank', 0)
        pose['cavity_volume'] = cavity_metadata.get('volume', 0.0)
        pose['cavity_druggability'] = cavity_metadata.get('cnn_score', cavity_metadata.get('druggability_score', 0.0))
        pose['cavity_center'] = cavity_metadata.get('center', (0, 0, 0))
        pose['cavity_size'] = cavity_metadata.get('size', (0, 0, 0))
    
    return poses


def extract_pose_from_pdbqt(out_pdbqt_path: str, mode: int = 1) -> str:
    """
    Extract a specific pose from multi-model PDBQT file.
    
    Args:
        out_pdbqt_path: Path to Vina output PDBQT file
        mode: Pose number to extract (1-based indexing)
    
    Returns:
        String containing the extracted pose in PDBQT format
    
    Raises:
        FileNotFoundError: If PDBQT file doesn't exist
        ValueError: If mode is invalid or out of range
    """
    p = _validate_file_exists(out_pdbqt_path, "PDBQT file")
    
    # Validate mode parameter
    if mode < 1:
        raise ValueError(f"Mode must be >= 1, got {mode}")
    
    text = p.read_text()
    
    # Extract all MODEL...ENDMDL blocks using robust regex
    # Pattern matches: MODEL (whitespace) digits ... ENDMDL
    model_pattern = re.compile(
        r'MODEL\s+\d+.*?ENDMDL',
        re.DOTALL | re.MULTILINE
    )
    models = model_pattern.findall(text)
    
    if not models:
        # Single model file (no MODEL/ENDMDL markers)
        # Check if this is actually a valid PDBQT with ATOM/HETATM records
        if not any(line.startswith(('ATOM', 'HETATM')) for line in text.splitlines()):
            raise ValueError(f"No valid molecular data found in {out_pdbqt_path}")
        
        if mode == 1:
            return text
        else:
            raise ValueError(
                f"Single model file, cannot extract mode {mode}. Only mode 1 available."
            )
    
    # Validate mode number against available models
    if mode > len(models):
        raise ValueError(
            f"Requested mode {mode} but only {len(models)} model(s) available in file"
        )
    
    return models[mode - 1]



