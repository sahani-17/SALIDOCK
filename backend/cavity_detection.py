"""
Cavity Detection Module - fpocket Integration

Detects binding cavities/pockets on protein surfaces using fpocket.
Provides cavity metadata (center, size, volume, druggability) for docking.

References:
- fpocket: https://github.com/Discngine/fpocket
- Cavity-guided docking workflow
"""

import subprocess
import shutil
import re
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import json
import numpy as np

# Import physicochemical properties module
from physicochemical_properties import compute_pocket_features, get_pocket_physicochemical_summary


class CavityDetectionError(Exception):
    """Custom exception for cavity detection errors."""
    pass


def check_fpocket_installed() -> bool:
    """
    Check if fpocket is installed and accessible.
    
    Returns:
        True if fpocket is available, False otherwise
    """
    if shutil.which('fpocket') is None:
        return False
    
    # Optional: Check version
    try:
        result = subprocess.run(
            ['fpocket', '--version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        version_info = result.stdout.strip() or result.stderr.strip()
        if version_info:
            print(f"[INFO] Found fpocket: {version_info}")
    except Exception:
        pass  # Version check is optional
    
    return True


def detect_cavities(
    protein_pdb_path: str,
    output_dir: Optional[Path] = None,
    min_alpha_sphere: int = 3,
    max_cavities: int = 10,
    margin: float = 5.0,
    min_grid_size: float = 15.0,
    max_grid_size: float = 40.0,
    timeout: int = 120,
    use_cache: bool = True
) -> List[Dict]:
    """
    Detect binding cavities using fpocket.
    
    Args:
        protein_pdb_path: Path to protein PDB file
        output_dir: Directory for fpocket output (default: same as input)
        min_alpha_sphere: Minimum number of alpha spheres (default: 3)
        max_cavities: Maximum number of cavities to return (default: 10)
        margin: Additional margin for grid size in Angstroms (default: 5.0)
        min_grid_size: Minimum grid dimension in Angstroms (default: 15.0)
        max_grid_size: Maximum cavity dimension before adding margin (default: 40.0).
                       This caps the bounding box size, not the final grid size.
        timeout: fpocket execution timeout in seconds (default: 120)
        use_cache: Skip fpocket if output already exists (default: True)
    
    Returns:
        List of cavity dictionaries sorted by rank:
        [
            {
                'cavity_id': 1,
                'center': (x, y, z),
                'size': (sx, sy, sz),  # with 5Å margin
                'volume': 450.2,
                'druggability_score': 0.85,
                'rank': 1,
                'num_alpha_spheres': 25
            },
            ...
        ]
    
    Raises:
        CavityDetectionError: If fpocket fails or no cavities found
    """
    # Check fpocket installation
    if not check_fpocket_installed():
        raise CavityDetectionError(
            "fpocket not found. Please install via: conda install -c bioconda fpocket"
        )
    
    protein_path = Path(protein_pdb_path)
    if not protein_path.exists():
        raise CavityDetectionError(f"Protein file not found: {protein_pdb_path}")
    
    # Set output directory
    if output_dir is None:
        output_dir = protein_path.parent
    else:
        output_dir = Path(output_dir)
        output_dir.mkdir(exist_ok=True)
    
    print(f"[INFO] Running fpocket on {protein_path.name}...")
    
    # Check if fpocket output already exists (caching)
    fpocket_output_dir = output_dir / f"{protein_path.stem}_out"
    
    if use_cache and fpocket_output_dir.exists():
        print(f"[INFO] Using cached fpocket results from {fpocket_output_dir}")
    else:
        # Run fpocket
        try:
            # fpocket -f protein.pdb -m <min_alpha_sphere>
            cmd = [
                'fpocket',
                '-f', str(protein_path),
                '-m', str(min_alpha_sphere)
            ]
            
            result = subprocess.run(
                cmd,
                cwd=str(output_dir),
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            if result.returncode != 0:
                raise CavityDetectionError(
                    f"fpocket failed with return code {result.returncode}\n"
                    f"Error: {result.stderr}"
                )
            
            print(f"[INFO] fpocket completed successfully")
            
        except subprocess.TimeoutExpired:
            raise CavityDetectionError(f"fpocket timed out after {timeout} seconds")
        except Exception as e:
            raise CavityDetectionError(f"fpocket execution failed: {str(e)}")
    
    # Parse fpocket output (use try-except to avoid race condition)
    try:
        # Check directory exists atomically within try block
        if not fpocket_output_dir.exists():
            raise CavityDetectionError(
                f"fpocket output directory not found: {fpocket_output_dir}"
            )
        # Parse cavity information
        cavities = parse_fpocket_output(fpocket_output_dir, protein_path.stem, margin, min_grid_size, max_grid_size)
    except CavityDetectionError:
        # Re-raise our custom errors
        raise
    except FileNotFoundError as e:
        raise CavityDetectionError(
            f"fpocket output file not found: {str(e)}"
        )
    except Exception as e:
        raise CavityDetectionError(f"Failed to parse fpocket output: {str(e)}")
    
    if not cavities:
        raise CavityDetectionError("No cavities detected by fpocket")
    
    # Rank cavities
    ranked_cavities = rank_cavities(cavities)
    
    # Limit to max_cavities
    ranked_cavities = ranked_cavities[:max_cavities]
    
    print(f"[SUCCESS] Detected {len(ranked_cavities)} cavities")
    for cavity in ranked_cavities[:5]:  # Show top 5
        print(f"  Cavity {cavity['cavity_id']}: "
              f"Volume={cavity['volume']:.1f} Å³, "
              f"Druggability={cavity['druggability_score']:.2f}, "
              f"Center={cavity['center']}")
    
    return ranked_cavities


def parse_fpocket_output(
    fpocket_dir: Path,
    protein_stem: str,
    margin: float = 5.0,
    min_grid_size: float = 15.0,
    max_grid_size: float = 40.0
) -> List[Dict]:
    """
    Parse fpocket output files to extract cavity metadata.
    
    Args:
        fpocket_dir: Path to fpocket output directory (protein_out)
        protein_stem: Protein filename stem (without extension)
        margin: Additional margin for grid size in Angstroms (default: 5.0)
        min_grid_size: Minimum grid dimension in Angstroms (default: 15.0)
        max_grid_size: Maximum base grid dimension before margin (default: 40.0)
    
    Returns:
        List of cavity dictionaries (unsorted)
    """
    cavities = []
    
    # Parse info file for volume and druggability
    info_file = fpocket_dir / f"{protein_stem}_info.txt"
    cavity_info = {}
    
    if info_file.exists():
        cavity_info = parse_info_file(info_file)
    else:
        print(f"[WARNING] Info file not found: {info_file}")
        print(f"[WARNING] Volume and druggability scores will be unavailable")
    
    # Parse pocket PDB files for coordinates
    pockets_dir = fpocket_dir / "pockets"
    
    if not pockets_dir.exists():
        print(f"[WARNING] Pockets directory not found: {pockets_dir}. fpocket may not have detected any cavities.")
        return cavities
    
    # Find all pocket PDB files (pocket1_atm.pdb, pocket2_atm.pdb, ...)
    pocket_files = sorted(pockets_dir.glob("pocket*_atm.pdb"))
    
    for pocket_file in pocket_files:
        # Extract cavity ID from filename (e.g., "pocket1_atm.pdb" -> 1)
        # More robust pattern to handle potential fpocket variations
        match = re.search(r'pocket[_\s]?(\d+)[_\s]?atm\.pdb', pocket_file.name, re.IGNORECASE)
        if not match:
            continue
        
        cavity_id = int(match.group(1))
        
        # Parse pocket coordinates AND residues
        coords, residues = parse_pocket_coordinates(pocket_file)
        
        if not coords:
            print(f"[WARNING] Skipping cavity {cavity_id}: no valid coordinates found in {pocket_file.name}")
            continue
        
        # Calculate cavity center and size
        center, size = calculate_cavity_grid(coords, margin, min_grid_size, max_grid_size)
        
        # Get volume and druggability from info file
        info = cavity_info.get(cavity_id, {})
        
        # Compute physicochemical features
        physicochemical_features = compute_pocket_features(residues)
        
        # Normalize druggability score (already in [0,1] range)
        normalized_score = info.get('druggability_score', 0.0)
        
        cavity = {
            'cavity_id': cavity_id,
            'center': center,
            'size': size,
            'volume': info.get('volume', 0.0),
            'druggability_score': info.get('druggability_score', 0.0),
            'num_alpha_spheres': info.get('num_alpha_spheres', len(coords)),
            'residues': residues,  # Residue list
            'num_residues': len(residues),  # Residue count
            'rank': 0,  # Will be set by rank_cavities()
            
            # Enhanced fields for consensus matching
            'points_3d': coords,  # Alpha sphere coordinates
            'physicochemical_features': physicochemical_features.tolist(),  # Feature vector
            'normalized_score': normalized_score,  # Score in [0,1]
            'tool_origin': 'fpocket'  # Tool identifier
        }
        
        cavities.append(cavity)
    
    return cavities


def parse_info_file(info_file: Path) -> Dict[int, Dict]:
    """
    Parse fpocket info file to extract volume and druggability scores.
    
    Args:
        info_file: Path to protein_info.txt
    
    Returns:
        Dictionary mapping cavity_id to metadata:
        {
            1: {'volume': 450.2, 'druggability_score': 0.85, 'num_alpha_spheres': 25},
            2: {'volume': 380.5, 'druggability_score': 0.72, 'num_alpha_spheres': 20},
            ...
        }
    """
    cavity_info = {}
    
    try:
        content = info_file.read_text()
        
        # Parse pocket sections
        # Format:
        # Pocket 1 :
        #   Score:                   0.85
        #   Druggability Score:      0.72
        #   Number of Alpha Spheres: 25
        #   Total SASA:              450.2
        #   ...
        
        try:
            pocket_sections = re.split(r'Pocket\s+(\d+)\s*:', content)
            
            if len(pocket_sections) < 2:
                print(f"[WARNING] No pocket sections found in info file")
                return cavity_info
        except Exception as e:
            print(f"[WARNING] Failed to split pocket sections: {e}")
            return cavity_info
        
        for i in range(1, len(pocket_sections), 2):
            try:
                cavity_id = int(pocket_sections[i])
                section = pocket_sections[i + 1]
            except (ValueError, IndexError) as e:
                print(f"[WARNING] Failed to parse pocket section {i}: {e}")
                continue
            
            # Extract metrics
            volume = 0.0
            druggability_score = 0.0
            num_alpha_spheres = 0
            
            # Volume (actual cavity volume)
            volume_match = re.search(r'Volume\s*:\s*([\d.]+)', section)
            if not volume_match:
                # Fallback: try 'Pocket volume'
                volume_match = re.search(r'Pocket volume\s*:\s*([\d.]+)', section)
            if volume_match:
                volume = float(volume_match.group(1))
            
            # Druggability Score
            drug_match = re.search(r'Druggability Score\s*:\s*([\d.]+)', section)
            if drug_match:
                druggability_score = float(drug_match.group(1))
                # Validate and clamp to 0-1 range
                if druggability_score < 0.0 or druggability_score > 1.0:
                    print(f"[WARNING] Cavity {cavity_id}: druggability score {druggability_score} out of range [0,1], clamping")
                    druggability_score = max(0.0, min(1.0, druggability_score))
            
            # Number of Alpha Spheres
            spheres_match = re.search(r'Number of Alpha Spheres\s*:\s*(\d+)', section)
            if spheres_match:
                num_alpha_spheres = int(spheres_match.group(1))
            
            cavity_info[cavity_id] = {
                'volume': volume,
                'druggability_score': druggability_score,
                'num_alpha_spheres': num_alpha_spheres
            }
    
    except Exception as e:
        print(f"[WARNING] Failed to parse info file: {e}")
    
    return cavity_info


def parse_pocket_coordinates(pocket_file: Path) -> Tuple[List[Tuple[float, float, float]], List[str]]:
    """
    Parse pocket PDB file to extract alpha sphere coordinates AND residues.
    
    Args:
        pocket_file: Path to pocket*_atm.pdb file
    
    Returns:
        Tuple of (coordinates, residue_ids)
        - coordinates: List of (x, y, z) tuples
        - residue_ids: List of residue identifiers in format "RESNAME_RESNUM_CHAIN"
    """
    coords = []
    residues = set()  # Use set to avoid duplicates
    
    # Check if file exists
    if not pocket_file.exists():
        print(f"[WARNING] Pocket file not found: {pocket_file}")
        return coords, []
    
    try:
        for line in pocket_file.read_text().splitlines():
            if line.startswith('ATOM') or line.startswith('HETATM'):
                try:
                    # Extract coordinates
                    x = float(line[30:38].strip())
                    y = float(line[38:46].strip())
                    z = float(line[46:54].strip())
                    coords.append((x, y, z))
                    
                    # Extract residue information (PDB format)
                    res_name = line[17:20].strip()
                    chain = line[21:22].strip()
                    res_num = line[22:26].strip()
                    
                    # Normalize format to match P2RANK: "RESNAME_RESNUM_CHAIN"
                    residue_id = f"{res_name}_{res_num}_{chain}" if chain else f"{res_name}_{res_num}"
                    residues.add(residue_id)
                    
                except (ValueError, IndexError):
                    continue
    except Exception as e:
        print(f"[WARNING] Failed to parse pocket file {pocket_file.name}: {e}")
    
    return coords, sorted(list(residues))


def calculate_cavity_grid(
    coords: List[Tuple[float, float, float]],
    margin: float = 5.0,
    min_size: float = 15.0,
    max_base_size: float = 40.0
) -> Tuple[Tuple[float, float, float], Tuple[float, float, float]]:
    """
    Calculate grid center and size from cavity coordinates.
    
    Args:
        coords: List of (x, y, z) coordinates
        margin: Additional margin to add to grid size (Angstroms, default: 5.0)
        min_size: Minimum grid dimension after margin (Angstroms, default: 15.0)
        max_base_size: Maximum base dimension before margin (Angstroms, default: 40.0)
    
    Returns:
        Tuple of (center, size):
        - center: (cx, cy, cz) - grid center coordinates
        - size: (sx, sy, sz) - grid dimensions with margin
    """
    if not coords:
        raise ValueError("No coordinates provided")
    
    xs, ys, zs = zip(*coords)
    
    # Calculate bounding box
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    min_z, max_z = min(zs), max(zs)
    
    # Calculate center
    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0
    center_z = (min_z + max_z) / 2.0
    
    # Calculate base size (without margin)
    base_size_x = max_x - min_x
    base_size_y = max_y - min_y
    base_size_z = max_z - min_z
    
    # Cap base size at max_base_size per dimension (before margin)
    base_size_x = min(base_size_x, max_base_size)
    base_size_y = min(base_size_y, max_base_size)
    base_size_z = min(base_size_z, max_base_size)
    
    # Add margin
    size_x = base_size_x + 2 * margin
    size_y = base_size_y + 2 * margin
    size_z = base_size_z + 2 * margin
    
    # Ensure minimum size of min_size per dimension (after margin)
    size_x = max(size_x, min_size)
    size_y = max(size_y, min_size)
    size_z = max(size_z, min_size)
    
    center = (round(center_x, 3), round(center_y, 3), round(center_z, 3))
    size = (round(size_x, 3), round(size_y, 3), round(size_z, 3))
    
    return center, size


def rank_cavities(cavities: List[Dict]) -> List[Dict]:
    """
    Rank cavities by volume (primary) and druggability score (secondary).
    
    Args:
        cavities: List of cavity dictionaries
    
    Returns:
        Sorted list with rank field updated
    """
    # Sort by volume (descending), then druggability (descending)
    sorted_cavities = sorted(
        cavities,
        key=lambda c: (c['volume'], c['druggability_score']),
        reverse=True
    )
    
    # Assign ranks
    for rank, cavity in enumerate(sorted_cavities, 1):
        cavity['rank'] = rank
    
    return sorted_cavities


def save_cavity_metadata(cavities: List[Dict], output_file: Path) -> None:
    """
    Save cavity metadata to JSON file.
    
    Args:
        cavities: List of cavity dictionaries
        output_file: Path to output JSON file
    """
    output_file.write_text(json.dumps(cavities, indent=2))
    print(f"[INFO] Cavity metadata saved to {output_file}")


def load_cavity_metadata(metadata_file: Path) -> List[Dict]:
    """
    Load cavity metadata from JSON file.
    
    Args:
        metadata_file: Path to cavity metadata JSON file
    
    Returns:
        List of cavity dictionaries
    """
    if not metadata_file.exists():
        raise FileNotFoundError(f"Cavity metadata file not found: {metadata_file}")
    
    return json.loads(metadata_file.read_text())
