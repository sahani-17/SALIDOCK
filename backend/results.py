# results.py - parsing of Vina output and PDBQT pose extraction
from pathlib import Path
from typing import List, Dict, Tuple
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
        pose['cavity_druggability'] = cavity_metadata.get('druggability_score', 0.0)
        pose['cavity_center'] = cavity_metadata.get('center', (0, 0, 0))
        pose['cavity_size'] = cavity_metadata.get('size', (0, 0, 0))
    
    return poses


def aggregate_multi_cavity_results(
    cavity_results: List[Tuple[str, Path, int, Dict]]
) -> List[Dict]:
    """
    Aggregate and rank results from multiple cavity docking runs.
    
    Args:
        cavity_results: List of tuples from run_vina_multi_cavity:
                       (log_file, output_pdbqt, cavity_id, cavity_metadata)
    
    Returns:
        All poses from all cavities, sorted by affinity (best first):
        [
            {
                'mode': 1,
                'affinity': -9.2,
                'rmsd_lb': 0.0,
                'rmsd_ub': 0.0,
                'cavity_id': 2,
                'cavity_rank': 2,
                'cavity_volume': 380.5,
                'pdbqt_file': 'path/to/cavity_2_out.pdbqt',
                'log_file': 'path/to/cavity_2.log'
            },
            ...
        ]
    """
    all_poses = []
    
    for log_file, output_pdbqt, cavity_id, cavity_metadata in cavity_results:
        # Parse poses for this cavity
        poses = parse_vina_output_with_cavity(
            str(output_pdbqt),
            cavity_id,
            cavity_metadata
        )
        
        # Add file paths to each pose
        for pose in poses:
            pose['pdbqt_file'] = str(output_pdbqt)
            pose['log_file'] = str(log_file)
        
        all_poses.extend(poses)
    
    # Filter out poses with invalid affinities (None, NaN, inf)
    valid_poses = []
    for pose in all_poses:
        affinity = pose.get('affinity')
        # Check for None, NaN, or infinity
        if affinity is None:
            warnings.warn(f"Skipping pose with None affinity from cavity {pose.get('cavity_id')}")
            continue
        if isinstance(affinity, float) and (affinity != affinity or abs(affinity) == float('inf')):
            warnings.warn(f"Skipping pose with invalid affinity {affinity} from cavity {pose.get('cavity_id')}")
            continue
        valid_poses.append(pose)
    
    if not valid_poses:
        raise ValueError("No poses with valid affinity values found in results")
    
    # Sort all poses by affinity (most negative = best binding)
    valid_poses.sort(key=lambda p: p['affinity'])
    
    # Add global rank
    for rank, pose in enumerate(valid_poses, 1):
        pose['global_rank'] = rank
    
    return valid_poses


def get_best_pose_per_cavity(aggregated_results: List[Dict]) -> List[Dict]:
    """
    Get the best pose from each cavity.
    
    Args:
        aggregated_results: Output from aggregate_multi_cavity_results
    
    Returns:
        List of best poses, one per cavity, sorted by affinity
    """
    cavity_best = {}
    
    for pose in aggregated_results:
        cavity_id = pose['cavity_id']
        
        # Keep only the best pose per cavity (lowest affinity)
        if cavity_id not in cavity_best or pose['affinity'] < cavity_best[cavity_id]['affinity']:
            cavity_best[cavity_id] = pose
    
    # Convert to list and sort by affinity
    best_poses = list(cavity_best.values())
    best_poses.sort(key=lambda p: p['affinity'])
    
    return best_poses


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



