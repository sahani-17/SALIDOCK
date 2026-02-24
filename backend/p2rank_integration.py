"""
Consensus Cavity Detection Module

Matches cavities detected by P2RANK and Fpocket using research-backed criteria.
Implements tiered confidence system based on:
- DCC (Distance to Closest ligand atom) = 4.0 Å standard
- Asymmetric coverage rules
- Residue overlap (Jaccard similarity)

References:
- P2RANK: Krivák, R., & Hoksza, D. (2018). Journal of cheminformatics, 10(1), 39.
- Fpocket: Le Guilloux, V., Schmidtke, P., & Tuffery, P. (2009). BMC bioinformatics, 10(1), 168.
- Benchmark datasets: COACH420, HOLO4K, CHEN11
"""

import subprocess
import shutil
import csv
import json
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import numpy as np

# Import physicochemical properties module
from physicochemical_properties import compute_pocket_features, get_pocket_physicochemical_summary


# ============================================================================
# P2RANK CONFIGURATION - AUTOMATIC DETECTION
# ============================================================================
# 
# This module automatically detects P2Rank from multiple sources:
# 1. Environment variable: P2RANK_HOME
# 2. PATH (via symlink or conda)
# 3. Common installation directories
#
# No manual configuration needed for standard installations!
#
# Manual override (optional):
# Set environment variable before starting backend:
#   export P2RANK_HOME=/path/to/p2rank_2.4.2
# ============================================================================

import os

def _find_p2rank_installation():
    """
    Universal P2Rank detection - works across different installations.
    
    Returns:
        Tuple of (executable_path, home_directory) or (None, None)
    """
    # Method 1: Check environment variable
    env_home = os.environ.get('P2RANK_HOME')
    if env_home:
        env_exec = os.path.join(env_home, 'prank')
        if Path(env_exec).exists():
            print(f"[INFO] Found P2Rank via P2RANK_HOME: {env_exec}")
            return env_exec, env_home
    
    # Method 2: Check if 'prank' is in PATH (symlink or conda installation)
    prank_in_path = shutil.which('prank')
    if prank_in_path:
        # Try to find the home directory by following symlink
        prank_path = Path(prank_in_path)
        if prank_path.is_symlink():
            real_path = prank_path.resolve()
            home_dir = str(real_path.parent)
        else:
            home_dir = str(prank_path.parent)
        
        print(f"[INFO] Found P2Rank in PATH: {prank_in_path}")
        return str(prank_in_path), home_dir
    
    # Method 3: Check common installation directories
    common_locations = [
        "/opt/p2rank_2.4.2",
        "/usr/local/p2rank_2.4.2",
        "/opt/p2rank",
        "/usr/local/p2rank",
        os.path.expanduser("~/p2rank_2.4.2"),
        os.path.expanduser("~/p2rank"),
    ]
    
    for location in common_locations:
        prank_exec = os.path.join(location, 'prank')
        if Path(prank_exec).exists():
            print(f"[INFO] Found P2Rank at: {prank_exec}")
            return prank_exec, location
    
    # Not found
    print("[WARNING] P2Rank not found. Checked:")
    print("  - Environment variable: P2RANK_HOME")
    print("  - System PATH")
    print("  - Common directories: /opt, /usr/local, ~/")
    return None, None

# Auto-detect P2Rank installation
P2RANK_EXECUTABLE, P2RANK_HOME = _find_p2rank_installation()


class P2RANKError(Exception):
    """Base exception for P2RANK errors"""
    pass


class P2RANKNotInstalledError(P2RANKError):
    """Raised when P2RANK is not installed"""
    pass


class P2RANKExecutionError(P2RANKError):
    """Raised when P2RANK execution fails"""
    pass


def check_p2rank_installed() -> bool:
    """
    Check if P2RANK is installed and accessible.
    
    Returns:
        True if P2RANK is available, False otherwise
    """
    # Check if auto-detection found P2Rank
    if P2RANK_EXECUTABLE is None or P2RANK_HOME is None:
        print("[WARNING] P2RANK not found by auto-detection")
        print("  Install P2Rank: https://github.com/rdk/p2rank/releases")
        print("  Or set environment variable: export P2RANK_HOME=/path/to/p2rank_2.4.2")
        return False
    
    # Check if P2RANK executable exists
    p2rank_path = Path(P2RANK_EXECUTABLE)
    
    # For relative paths (in PATH), just check if command exists
    if not p2rank_path.is_absolute():
        # It's in PATH, verify it works
        pass
    else:
        # Absolute path, check if file exists
        if not p2rank_path.exists():
            print(f"[WARNING] P2RANK not found at {P2RANK_EXECUTABLE}")
            return False
    
    # Check if P2RANK actually works
    try:
        # Determine working directory
        cwd = P2RANK_HOME if P2RANK_HOME and Path(P2RANK_HOME).exists() else None
        
        result = subprocess.run(
            [P2RANK_EXECUTABLE, '--version'],
            capture_output=True,
            text=True,
            timeout=30,  # Increased for WSL/Java startup
            cwd=cwd  # Run from P2RANK home directory if available
        )
        
        # Check for Java classpath errors
        combined_output = result.stdout + result.stderr
        if 'ClassNotFoundException' in combined_output or 'Could not find or load main class' in combined_output:
            print("[WARNING] P2RANK found but has Java classpath issues")
            print(f"  Try running from P2RANK home: cd {P2RANK_HOME} && ./prank --version")
            return False
        
        # Check if command succeeded
        if result.returncode == 0:
            version_info = result.stdout.strip() or result.stderr.strip()
            if version_info:
                print(f"[INFO] P2RANK ready: {version_info}")
            return True
        else:
            print(f"[WARNING] P2RANK command failed with code {result.returncode}")
            return False
            
    except FileNotFoundError:
        print(f"[WARNING] P2RANK executable not found: {P2RANK_EXECUTABLE}")
        return False
    except Exception as e:
        print(f"[WARNING] P2RANK check failed: {e}")
        return False


def detect_cavities_p2rank(
    protein_pdb_path: str,
    output_dir: Optional[Path] = None,
    top_n: int = 10,
    use_cache: bool = True,
    timeout: int = 300
) -> List[Dict]:
    """
    Detect binding cavities using P2RANK.
    
    Args:
        protein_pdb_path: Path to protein PDB file
        output_dir: Directory for P2RANK output (default: same as input)
        top_n: Maximum number of cavities to return (default: 10)
        use_cache: Skip P2RANK if output already exists (default: True)
        timeout: P2RANK execution timeout in seconds (default: 300)
    
    Returns:
        List of cavity dictionaries sorted by P2RANK score:
        [
            {
                'cavity_id': 1,
                'center': (x, y, z),
                'size': (sx, sy, sz),
                'score': 0.85,  # P2RANK probability score
                'rank': 1,
                'residues': ['ALA_42_A', 'GLY_43_A', ...],
                'num_residues': 15,
                'method': 'p2rank'
            },
            ...
        ]
    
    Raises:
        P2RANKNotInstalledError: If P2RANK is not installed
        P2RANKExecutionError: If P2RANK execution fails
    """
    # Check P2RANK installation
    if not check_p2rank_installed():
        raise P2RANKNotInstalledError(
            "P2RANK not found. Please install P2RANK:\n"
            "1. Download: wget https://github.com/rdk/p2rank/releases/download/2.4.2/p2rank_2.4.2.tar.gz\n"
            "2. Extract: tar -xzf p2rank_2.4.2.tar.gz\n"
            "3. Add to PATH: ln -s /path/to/p2rank_2.4.2/prank /usr/local/bin/prank\n"
            "4. Verify: prank --version"
        )
    
    protein_path = Path(protein_pdb_path)
    if not protein_path.exists():
        raise P2RANKError(f"Protein file not found: {protein_pdb_path}")
    
    # Set output directory
    if output_dir is None:
        output_dir = protein_path.parent
    else:
        output_dir = Path(output_dir)
        output_dir.mkdir(exist_ok=True)
    
    print(f"[INFO] Running P2RANK on {protein_path.name}...")
    
    # P2RANK output structure
    # P2RANK creates CSV files directly in the output directory:
    # - <output_dir>/<filename>_predictions.csv
    # - <output_dir>/<filename>_residues.csv
    # For protein.pdb, it creates:
    # - protein.pdb_predictions.csv (NOT protein_predictions.csv)
    # - protein.pdb_residues.csv
    predictions_csv = output_dir / f"{protein_path.name}_predictions.csv"
    residues_csv = output_dir / f"{protein_path.name}_residues.csv"
    
    # Check if P2RANK output already exists (caching)
    if use_cache and predictions_csv.exists() and residues_csv.exists():
        print(f"[INFO] Using cached P2RANK results from {output_dir}")
    else:
        # Run P2RANK
        try:
            # P2RANK command with absolute path
            # IMPORTANT: Run from P2RANK_HOME to resolve Java classpath correctly
            cmd = [
                P2RANK_EXECUTABLE,
                'predict',
                '-f', str(protein_path.absolute()),  # Use absolute path for input
                '-o', str(output_dir.absolute())     # Use absolute path for output
            ]
            
            print(f"[INFO] Executing: {' '.join(cmd)}")
            print(f"[INFO] Working directory: {P2RANK_HOME}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=P2RANK_HOME  # CRITICAL: Run from P2RANK home to fix classpath
            )
            
            if result.returncode != 0:
                raise P2RANKExecutionError(
                    f"P2RANK failed with return code {result.returncode}\n"
                    f"Error: {result.stderr}\n"
                    f"Output: {result.stdout}"
                )
            
            print(f"[INFO] P2RANK completed successfully")
            
        except subprocess.TimeoutExpired:
            raise P2RANKExecutionError(f"P2RANK timed out after {timeout} seconds")
        except Exception as e:
            raise P2RANKExecutionError(f"P2RANK execution failed: {str(e)}")
    
    # Parse P2RANK output
    try:
        if not predictions_csv.exists():
            raise P2RANKError(
                f"P2RANK predictions file not found: {predictions_csv}\n"
                f"Expected file: {predictions_csv.name} in {output_dir}"
            )
        
        # Parse predictions and residues
        cavities = parse_p2rank_output(
            predictions_csv=predictions_csv,
            residues_csv=residues_csv,
            protein_pdb_path=protein_path
        )
        
    except P2RANKError:
        raise
    except Exception as e:
        raise P2RANKError(f"Failed to parse P2RANK output: {str(e)}")
    
    if not cavities:
        print("[WARNING] P2RANK did not detect any cavities")
        return []
    
    # Limit to top_n cavities
    cavities = cavities[:top_n]
    
    print(f"[SUCCESS] P2RANK detected {len(cavities)} cavities")
    for cavity in cavities[:5]:  # Show top 5
        print(f"  Pocket {cavity['cavity_id']}: "
              f"Score={cavity['score']:.3f}, "
              f"Residues={cavity['num_residues']}, "
              f"Center={cavity['center']}")
    
    return cavities


def parse_p2rank_output(
    predictions_csv: Path,
    residues_csv: Path,
    protein_pdb_path: Path
) -> List[Dict]:
    """
    Parse P2RANK output files to extract cavity metadata.
    
    Args:
        predictions_csv: Path to P2RANK predictions.csv file
        residues_csv: Path to P2RANK residues.csv file
        protein_pdb_path: Path to original protein PDB file
    
    Returns:
        List of cavity dictionaries sorted by P2RANK score (descending)
    """
    cavities = []
    
    # Parse predictions.csv for scores and rankings
    predictions = parse_p2rank_predictions(predictions_csv)
    
    # Parse residues.csv for pocket residue lists
    pocket_residues = parse_p2rank_residues(residues_csv)
    
    # Load protein PDB to get residue coordinates
    residue_coords = extract_residue_coordinates(protein_pdb_path)
    
    # Combine data
    for pred in predictions:
        pocket_id = pred['pocket_id']
        
        # Get residues for this pocket
        residues = pocket_residues.get(pocket_id, [])
        
        if not residues:
            print(f"[WARNING] No residues found for pocket {pocket_id}, skipping")
            continue
        
        # Calculate cavity center and size from residue coordinates
        try:
            center, size = calculate_cavity_grid_from_residues(
                residues, 
                residue_coords
            )
        except Exception as e:
            print(f"[WARNING] Failed to calculate grid for pocket {pocket_id}: {e}")
            continue
        
        # Extract 3D points (use residue CA coordinates as proxy for SAS points)
        points_3d = [residue_coords[res_id] for res_id in residues if res_id in residue_coords]
        
        # Compute physicochemical features
        physicochemical_features = compute_pocket_features(residues)
        
        # P2Rank score is already normalized probability in [0,1]
        normalized_score = pred['score']
        
        cavity = {
            'cavity_id': pocket_id,
            'center': center,
            'size': size,
            'score': pred['score'],
            'rank': pred['rank'],
            'residues': residues,
            'num_residues': len(residues),
            'method': 'p2rank',
            
            # Enhanced fields for consensus matching
            'points_3d': points_3d,  # Residue CA coordinates (proxy for SAS points)
            'physicochemical_features': physicochemical_features.tolist(),  # Feature vector
            'normalized_score': normalized_score,  # Score in [0,1]
            'tool_origin': 'p2rank'  # Tool identifier
        }
        
        cavities.append(cavity)
    
    return cavities


def parse_p2rank_predictions(predictions_csv: Path) -> List[Dict]:
    """
    Parse P2RANK predictions.csv file.
    
    CSV format:
        name,rank,score,probability,sas_points,surf_atoms,center_x,center_y,center_z,...
    
    Returns:
        List of prediction dictionaries sorted by rank
    """
    predictions = []
    
    try:
        with open(predictions_csv, 'r') as f:
            # Read and strip whitespace from headers
            reader = csv.DictReader(f)
            # Strip whitespace from fieldnames
            reader.fieldnames = [name.strip() for name in reader.fieldnames]
            
            for row in reader:
                try:
                    # Strip whitespace from values as well
                    row = {k: v.strip() if isinstance(v, str) else v for k, v in row.items()}
                    
                    pocket_id = int(row['rank'])
                    score = float(row['score'])
                    probability = float(row.get('probability', score))
                    
                    # P2RANK provides center coordinates in the CSV
                    center_x = float(row.get('center_x', 0))
                    center_y = float(row.get('center_y', 0))
                    center_z = float(row.get('center_z', 0))
                    
                    predictions.append({
                        'pocket_id': pocket_id,
                        'rank': pocket_id,
                        'score': probability,  # Use probability as primary score
                        'center_from_csv': (center_x, center_y, center_z)
                    })
                    
                except (KeyError, ValueError) as e:
                    # Silently skip invalid rows (e.g., header rows, malformed data)
                    continue
        
        # Sort by score (descending)
        predictions.sort(key=lambda x: x['score'], reverse=True)
        
        # Re-rank after sorting
        for rank, pred in enumerate(predictions, 1):
            pred['rank'] = rank
        
    except Exception as e:
        raise P2RANKError(f"Failed to parse predictions.csv: {e}")
    
    return predictions


def parse_p2rank_residues(residues_csv: Path) -> Dict[int, List[str]]:
    """
    Parse P2RANK residues.csv file.
    
    CSV format (actual P2RANK 2.4.2 output):
        chain, residue_label, residue_name, score, zscore, probability, pocket
        A,    8, ARG,  0.9227,   0.1349,   0.1210, 1
    
    Returns:
        Dictionary mapping pocket_id to list of residue identifiers:
        {
            1: ['ARG_8_A', 'LEU_23_A', ...],
            2: ['SER_100_B', ...],
            ...
        }
    """
    pocket_residues = {}
    
    try:
        with open(residues_csv, 'r') as f:
            reader = csv.DictReader(f)
            # Strip whitespace from fieldnames
            reader.fieldnames = [name.strip() for name in reader.fieldnames]
            
            for row in reader:
                try:
                    # Strip whitespace from values
                    row = {k: v.strip() if isinstance(v, str) else v for k, v in row.items()}
                    
                    # P2RANK uses 'pocket' column (not 'pocket_rank')
                    # pocket=0 means not in any pocket, pocket=1 means pocket 1, etc.
                    pocket_id = int(row['pocket'])
                    
                    # Skip residues not in any pocket
                    if pocket_id == 0:
                        continue
                    
                    chain = row.get('chain', '').strip()
                    residue_name = row.get('residue_name', '').strip()
                    residue_label = row.get('residue_label', '').strip()  # This is just the residue number
                    
                    # Create residue identifier: RESNAME_RESNUM_CHAIN
                    residue_id = f"{residue_name}_{residue_label}_{chain}" if chain else f"{residue_name}_{residue_label}"
                    
                    if pocket_id not in pocket_residues:
                        pocket_residues[pocket_id] = []
                    
                    pocket_residues[pocket_id].append(residue_id)
                    
                except (KeyError, ValueError) as e:
                    # Silently skip invalid rows (e.g., header rows, malformed data)
                    continue
        
    except Exception as e:
        raise P2RANKError(f"Failed to parse residues.csv: {e}")
    
    return pocket_residues


def extract_residue_coordinates(protein_pdb_path: Path) -> Dict[str, Tuple[float, float, float]]:
    """
    Extract residue coordinates from PDB file.
    
    Returns:
        Dictionary mapping residue identifiers to CA atom coordinates:
        {
            'ALA_42_A': (x, y, z),
            'GLY_43_A': (x, y, z),
            ...
        }
    """
    residue_coords = {}
    
    try:
        with open(protein_pdb_path, 'r') as f:
            for line in f:
                if line.startswith('ATOM'):
                    try:
                        atom_name = line[12:16].strip()
                        
                        # Only use CA (alpha carbon) atoms for residue position
                        if atom_name != 'CA':
                            continue
                        
                        res_name = line[17:20].strip()
                        chain = line[21:22].strip()
                        res_num = line[22:26].strip()
                        
                        x = float(line[30:38].strip())
                        y = float(line[38:46].strip())
                        z = float(line[46:54].strip())
                        
                        residue_id = f"{res_name}_{res_num}_{chain}" if chain else f"{res_name}_{res_num}"
                        residue_coords[residue_id] = (x, y, z)
                        
                    except (ValueError, IndexError):
                        continue
    
    except Exception as e:
        raise P2RANKError(f"Failed to extract residue coordinates: {e}")
    
    return residue_coords


def calculate_cavity_grid_from_residues(
    residues: List[str],
    residue_coords: Dict[str, Tuple[float, float, float]],
    margin: float = 5.0,
    min_size: float = 15.0,
    max_size: float = 50.0
) -> Tuple[Tuple[float, float, float], Tuple[float, float, float]]:
    """
    Calculate cavity center and grid size from residue coordinates.
    
    Args:
        residues: List of residue identifiers
        residue_coords: Dictionary mapping residue IDs to coordinates
        margin: Additional margin for grid size (Angstroms, default: 5.0)
        min_size: Minimum grid dimension (Angstroms, default: 15.0)
        max_size: Maximum grid dimension (Angstroms, default: 50.0)
    
    Returns:
        Tuple of (center, size):
        - center: (cx, cy, cz) - grid center coordinates
        - size: (sx, sy, sz) - grid dimensions with margin
    """
    # Get coordinates for residues in this pocket
    coords = []
    for res_id in residues:
        if res_id in residue_coords:
            coords.append(residue_coords[res_id])
    
    if not coords:
        raise ValueError(f"No coordinates found for residues: {residues[:5]}...")
    
    coords_array = np.array(coords)
    
    # Calculate bounding box
    min_coords = coords_array.min(axis=0)
    max_coords = coords_array.max(axis=0)
    
    # Calculate center
    center = ((min_coords + max_coords) / 2.0).tolist()
    center = tuple(round(c, 3) for c in center)
    
    # Calculate size with margin
    base_size = max_coords - min_coords
    size_with_margin = base_size + 2 * margin
    
    # Apply min/max constraints
    size = np.clip(size_with_margin, min_size, max_size).tolist()
    size = tuple(round(s, 3) for s in size)
    
    return center, size


def save_p2rank_metadata(cavities: List[Dict], output_file: Path) -> None:
    """
    Save P2RANK cavity metadata to JSON file.
    
    Args:
        cavities: List of cavity dictionaries
        output_file: Path to output JSON file
    """
    output_file.write_text(json.dumps(cavities, indent=2))
    print(f"[INFO] P2RANK cavity metadata saved to {output_file}")


def load_p2rank_metadata(metadata_file: Path) -> List[Dict]:
    """
    Load P2RANK cavity metadata from JSON file.
    
    Args:
        metadata_file: Path to P2RANK metadata JSON file
    
    Returns:
        List of cavity dictionaries
    """
    if not metadata_file.exists():
        raise FileNotFoundError(f"P2RANK metadata file not found: {metadata_file}")
    
    return json.loads(metadata_file.read_text())


# ============================================================================
# TIER 3 FALLBACK: fpocket + PRANK RESCORING
# ============================================================================

def run_fpocket_rescore(
    protein_pdb_path: str,
    fpocket_output_dir: Path,
    output_dir: Optional[Path] = None,
    top_n: int = 10,
    timeout: int = 180
) -> List[Dict]:
    """
    Run P2Rank's fpocket-rescore command to rescore fpocket predictions.
    
    This is Tier 3 fallback: uses PRANK (P2Rank's scoring algorithm) to
    re-rank fpocket cavities based on ligandability, improving accuracy.
    
    Research: PRANK rescoring improves fpocket recall to 60% (benchmark study).
    
    Args:
        protein_pdb_path: Path to protein PDB file
        fpocket_output_dir: Directory containing fpocket output
        output_dir: Directory for PRANK output (default: same as fpocket)
        top_n: Maximum number of cavities to return (default: 10)
        timeout: Execution timeout in seconds (default: 180)
    
    Returns:
        List of PRANK-rescored cavity dictionaries:
        [
            {
                'cavity_id': 1,
                'center': (x, y, z),
                'size': (sx, sy, sz),
                'prank_score': 0.85,  # PRANK ligandability score
                'fpocket_score': 0.72,  # Original fpocket druggability
                'rank': 1,  # Re-ranked by PRANK
                'residues': [...],
                'method': 'fpocket_prank',
                'detection_tier': 3
            },
            ...
        ]
    
    Raises:
        P2RANKNotInstalledError: If P2RANK is not installed
        P2RANKExecutionError: If PRANK rescoring fails
    """
    # Check P2RANK installation
    if not check_p2rank_installed():
        raise P2RANKNotInstalledError(
            "P2RANK not found. PRANK rescoring requires P2RANK installation.\\n"
            "Install P2RANK: https://github.com/rdk/p2rank/releases"
        )
    
    protein_path = Path(protein_pdb_path)
    if not protein_path.exists():
        raise P2RANKError(f"Protein file not found: {protein_pdb_path}")
    
    fpocket_dir = Path(fpocket_output_dir)
    if not fpocket_dir.exists():
        raise P2RANKError(f"fpocket output directory not found: {fpocket_output_dir}")
    
    # Set output directory
    if output_dir is None:
        output_dir = fpocket_dir.parent / "prank_rescore"
    else:
        output_dir = Path(output_dir)
    
    output_dir.mkdir(exist_ok=True)
    
    print(f"[INFO] Running PRANK rescoring on fpocket results...")
    print(f"  fpocket output: {fpocket_dir}")
    print(f"  PRANK output: {output_dir}")
    
    try:
        # P2Rank's fpocket-rescore command
        # Syntax: prank rescore <fpocket_dir> -o <output_dir>
        cmd = [
            P2RANK_EXECUTABLE,
            'rescore',
            str(fpocket_dir.absolute()),
            '-o', str(output_dir.absolute())
        ]
        
        print(f"[INFO] Executing: {' '.join(cmd)}")
        print(f"[INFO] Working directory: {P2RANK_HOME}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=P2RANK_HOME  # Run from P2RANK home
        )
        
        if result.returncode != 0:
            raise P2RANKExecutionError(
                f"PRANK rescoring failed with return code {result.returncode}\\n"
                f"Error: {result.stderr}\\n"
                f"Output: {result.stdout}"
            )
        
        print(f"[INFO] PRANK rescoring completed successfully")
        
    except subprocess.TimeoutExpired:
        raise P2RANKExecutionError(f"PRANK rescoring timed out after {timeout} seconds")
    except Exception as e:
        raise P2RANKExecutionError(f"PRANK rescoring failed: {str(e)}")
    
    # Parse PRANK rescored output
    try:
        cavities = parse_prank_rescored_output(
            prank_output_dir=output_dir,
            fpocket_output_dir=fpocket_dir,
            protein_pdb_path=protein_path
        )
    except Exception as e:
        raise P2RANKError(f"Failed to parse PRANK rescored output: {str(e)}")
    
    if not cavities:
        print("[WARNING] PRANK rescoring produced no cavities")
        return []
    
    # Limit to top_n cavities
    cavities = cavities[:top_n]
    
    print(f"[SUCCESS] PRANK rescored {len(cavities)} fpocket cavities")
    for cavity in cavities[:5]:  # Show top 5
        print(f"  Cavity {cavity['cavity_id']}: "
              f"PRANK={cavity['prank_score']:.3f}, "
              f"fpocket={cavity.get('fpocket_score', 0):.3f}, "
              f"Center={cavity['center']}")
    
    return cavities


def parse_prank_rescored_output(
    prank_output_dir: Path,
    fpocket_output_dir: Path,
    protein_pdb_path: Path
) -> List[Dict]:
    """
    Parse PRANK-rescored fpocket output.
    
    PRANK rescoring produces a CSV file with re-ranked pockets based on
    ligandability scores. This function combines PRANK scores with original
    fpocket metadata.
    
    Args:
        prank_output_dir: Directory containing PRANK output
        fpocket_output_dir: Directory containing original fpocket output
        protein_pdb_path: Path to original protein PDB file
    
    Returns:
        List of cavity dictionaries sorted by PRANK score (descending)
    """
    # Import fpocket parsing functions
    from cavity_detection import parse_fpocket_output
    
    # Parse original fpocket output to get cavity metadata
    fpocket_cavities = parse_fpocket_output(
        fpocket_dir=fpocket_output_dir,
        protein_stem=protein_pdb_path.stem
    )
    
    # Create mapping: cavity_id -> fpocket_cavity
    fpocket_map = {cav['cavity_id']: cav for cav in fpocket_cavities}
    
    # Look for PRANK rescoring CSV file
    # PRANK typically creates: <output_dir>/<protein>_rescored.csv
    prank_csv_candidates = [
        prank_output_dir / f"{protein_pdb_path.stem}_rescored.csv",
        prank_output_dir / f"{protein_pdb_path.name}_rescored.csv",
        prank_output_dir / "rescored.csv"
    ]
    
    prank_csv = None
    for candidate in prank_csv_candidates:
        if candidate.exists():
            prank_csv = candidate
            break
    
    if not prank_csv:
        # Fallback: use original fpocket cavities with warning
        print("[WARNING] PRANK rescoring CSV not found, using original fpocket scores")
        for cav in fpocket_cavities:
            cav['method'] = 'fpocket_prank'
            cav['detection_tier'] = 3
            cav['prank_score'] = cav.get('druggability_score', 0.0)
            cav['fpocket_score'] = cav.get('druggability_score', 0.0)
        return fpocket_cavities
    
    # Parse PRANK rescoring CSV
    rescored_cavities = []
    
    try:
        with open(prank_csv, 'r') as f:
            reader = csv.DictReader(f)
            reader.fieldnames = [name.strip() for name in reader.fieldnames]
            
            for row in reader:
                try:
                    row = {k: v.strip() if isinstance(v, str) else v for k, v in row.items()}
                    
                    # Extract cavity ID and PRANK score
                    # PRANK CSV format may vary, try common field names
                    cavity_id = None
                    prank_score = None
                    
                    # Try different field name variations
                    for id_field in ['pocket_id', 'cavity_id', 'rank', 'id']:
                        if id_field in row:
                            cavity_id = int(row[id_field])
                            break
                    
                    for score_field in ['prank_score', 'score', 'probability', 'ligandability']:
                        if score_field in row:
                            prank_score = float(row[score_field])
                            break
                    
                    if cavity_id is None or prank_score is None:
                        continue
                    
                    # Get original fpocket cavity data
                    if cavity_id not in fpocket_map:
                        print(f"[WARNING] Cavity {cavity_id} in PRANK output but not in fpocket")
                        continue
                    
                    fpocket_cav = fpocket_map[cavity_id].copy()
                    
                    # Add PRANK rescoring metadata
                    fpocket_cav['prank_score'] = prank_score
                    fpocket_cav['fpocket_score'] = fpocket_cav.get('druggability_score', 0.0)
                    fpocket_cav['method'] = 'fpocket_prank'
                    fpocket_cav['detection_tier'] = 3
                    
                    rescored_cavities.append(fpocket_cav)
                    
                except (KeyError, ValueError) as e:
                    continue
        
        # Sort by PRANK score (descending)
        rescored_cavities.sort(key=lambda x: x['prank_score'], reverse=True)
        
        # Re-rank
        for rank, cav in enumerate(rescored_cavities, 1):
            cav['rank'] = rank
        
    except Exception as e:
        raise P2RANKError(f"Failed to parse PRANK rescoring CSV: {e}")
    
    return rescored_cavities
