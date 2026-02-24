# docking_runner.py - wrapper for molecular docking execution
import shutil, subprocess, os
from pathlib import Path
from typing import List, Dict, Tuple

VINA_BIN = os.environ.get('VINA_BIN', 'vina')

def run_vina(
    receptor_pdbqt: str,
    ligand_pdbqt: str,
    out_prefix: str,
    center: Tuple[float, float, float],
    size: Tuple[float, float, float],
    grid_spacing: float = 0.375,
    timeout: int = 600
) -> Tuple[str, Path]:
    """
    Run molecular docking.
    
    Args:
        receptor_pdbqt: Path to prepared receptor PDBQT file
        ligand_pdbqt: Path to prepared ligand PDBQT file
        out_prefix: Output file prefix
        center: Tuple of (x, y, z) coordinates for grid center
        size: Tuple of (x, y, z) dimensions for grid size
        grid_spacing: Grid spacing in Angstroms (default: 0.375). Smaller values increase accuracy but slow down docking.
        timeout: Maximum execution time in seconds
    
    Returns:
        Tuple of (log_file_path, output_pdbqt_path)
    
    Note:
        Exhaustiveness is fixed at 10 and num_modes is fixed at 9.
        Grid spacing default (0.375 Å) matches the docking engine's default.
    """
    receptor_pdbqt = str(receptor_pdbqt)
    ligand_pdbqt = str(ligand_pdbqt)
    out_pdbqt = f"{out_prefix}_out.pdbqt"
    
    # Validate grid parameters
    if len(center) != 3:
        raise ValueError(f"center must have 3 coordinates (x, y, z), got {len(center)}")
    if len(size) != 3:
        raise ValueError(f"size must have 3 dimensions (x, y, z), got {len(size)}")
    
    # Validate center and size are numeric
    try:
        center = tuple(float(c) for c in center)
        size = tuple(float(s) for s in size)
    except (ValueError, TypeError) as e:
        raise ValueError(f"center and size must contain numeric values: {e}")
    
    if any(s <= 0 for s in size):
        raise ValueError(f"All size dimensions must be positive, got {size}")
    
    # Validate grid spacing
    if grid_spacing <= 0:
        raise ValueError(f"Grid spacing must be positive, got {grid_spacing}")
    if grid_spacing > 2.0:
        raise ValueError(f"Grid spacing too large (>{2.0} Å), got {grid_spacing}. Use smaller values for better accuracy.")
    
    # Fixed docking parameters
    exhaustiveness = 10  # Fixed value, not user-configurable
    num_modes = 9  # Fixed value, not user-configurable
    
    # Check if Vina binary exists
    vina_path = shutil.which(VINA_BIN)
    if not vina_path:
        raise RuntimeError(f"Vina binary '{VINA_BIN}' not found in PATH. Please install the docking software or set VINA_BIN environment variable.")
    
    # Check if input files exist
    if not Path(receptor_pdbqt).exists():
        raise RuntimeError(f"Receptor file not found: {receptor_pdbqt}")
    if not Path(ligand_pdbqt).exists():
        raise RuntimeError(f"Ligand file not found: {ligand_pdbqt}")
    
    # Build Vina command (compatible with v1.2.x)
    cmd = [
        VINA_BIN,
        '--receptor', receptor_pdbqt,
        '--ligand', ligand_pdbqt,
        '--center_x', str(center[0]),
        '--center_y', str(center[1]),
        '--center_z', str(center[2]),
        '--size_x', str(size[0]),
        '--size_y', str(size[1]),
        '--size_z', str(size[2]),
        '--out', out_pdbqt,
        '--exhaustiveness', str(exhaustiveness),
        '--num_modes', str(num_modes),
        '--spacing', str(grid_spacing)
    ]
    
    # Log command for debugging
    print(f"Running Vina command: {' '.join(cmd)}")
    
    # Prepare log file
    log_file = f"{out_prefix}.log"
    
    # Run Vina with output redirected to log file (faster than capture_output)
    try:
        with open(log_file, 'w') as log_fh:
            proc = subprocess.run(
                cmd, 
                stdout=log_fh,  # Write directly to file instead of capturing
                stderr=subprocess.STDOUT,  # Merge stderr into stdout
                timeout=timeout
            )
    except subprocess.TimeoutExpired:
        # Clean up partial output files (best effort)
        try:
            if Path(out_pdbqt).exists():
                Path(out_pdbqt).unlink()
        except Exception as e:
            print(f"[WARNING] Failed to clean up partial output file: {e}")
        
        raise RuntimeError(
            f"Vina execution timed out after {timeout} seconds. "
            f"Consider increasing the timeout parameter or reducing exhaustiveness."
        )
    
    if proc.returncode != 0:
        # Clean up partial output files (best effort)
        try:
            if Path(out_pdbqt).exists():
                Path(out_pdbqt).unlink()
        except Exception as e:
            print(f"[WARNING] Failed to clean up partial output file: {e}")
        # Read log to show error
        with open(log_file, 'r') as f:
            output = f.read()
        raise RuntimeError(f"Vina failed with return code {proc.returncode}\nOutput:\n{output}")
    
    # Validate output file was created
    out_pdbqt_path = Path(out_pdbqt)
    if not out_pdbqt_path.exists():
        raise RuntimeError(
            f"Vina completed but output file not found: {out_pdbqt}\n"
            f"Check log file for details: {log_file}"
        )
    
    # Validate output file is not empty
    if out_pdbqt_path.stat().st_size == 0:
        raise RuntimeError(
            f"Vina output file is empty: {out_pdbqt}\n"
            f"Check log file for details: {log_file}"
        )
    
    return log_file, out_pdbqt_path


def run_vina_multi_cavity(
    receptor_pdbqt: str,
    ligand_pdbqt: str,
    out_prefix: str,
    cavities: List[Dict],
    grid_spacing: float = 0.375,
    timeout: int = 600
) -> List[Tuple[str, Path, int, Dict]]:
    """
    Run molecular docking for multiple cavities.
    
    Args:
        receptor_pdbqt: Path to prepared receptor PDBQT file
        ligand_pdbqt: Path to prepared ligand PDBQT file
        out_prefix: Output file prefix (will be appended with cavity ID)
        cavities: List of cavity dictionaries with 'cavity_id', 'center', 'size'
        grid_spacing: Grid spacing in Angstroms (default: 0.375). Smaller values increase accuracy but slow down docking.
        timeout: Maximum execution time per cavity in seconds
    
    Returns:
        List of tuples: (log_file, output_pdbqt, cavity_id, cavity_metadata)
    
    Note:
        Exhaustiveness is fixed at 10 and num_modes is fixed at 9.
        Grid spacing default (0.375 Å) matches the docking engine's default.
    
    Example:
        >>> cavities = [
        ...     {'cavity_id': 1, 'center': (10, 20, 15), 'size': (18, 20, 19), 'volume': 450},
        ...     {'cavity_id': 2, 'center': (5, 18, 12), 'size': (16, 18, 17), 'volume': 380}
        ... ]
        >>> results = run_vina_multi_cavity('protein.pdbqt', 'ligand.pdbqt', 'out', cavities)
        >>> len(results)
        2
    """
    results = []
    
    print(f"\n[INFO] Running multi-cavity docking for {len(cavities)} cavities...")
    
    for i, cavity in enumerate(cavities, 1):
        # Validate cavity data structure
        try:
            cavity_id = cavity['cavity_id']
            center = tuple(cavity['center'])
            size = tuple(cavity['size'])
        except KeyError as e:
            print(f"  [FAIL] Cavity {i}: Missing required key {e}")
            continue
        
        # Validate grid parameters
        try:
            # Check center has 3 elements and all are numeric
            if len(center) != 3:
                raise ValueError(f"Center must have 3 coordinates, got {len(center)}")
            center = tuple(float(c) for c in center)
            
            # Check size has 3 elements and all are numeric and positive
            if len(size) != 3:
                raise ValueError(f"Size must have 3 dimensions, got {len(size)}")
            size = tuple(float(s) for s in size)
            if any(s <= 0 for s in size):
                raise ValueError(f"All size dimensions must be positive, got {size}")
        except (ValueError, TypeError) as e:
            print(f"  [FAIL] Cavity {cavity_id}: Invalid grid parameters - {e}")
            continue
        
        print(f"\n[{i}/{len(cavities)}] Docking in Cavity {cavity_id}:")
        print(f"  Center: {center}")
        print(f"  Size: {size}")
        print(f"  Volume: {cavity.get('volume', 'N/A')} Å³")
        
        # Create cavity-specific output prefix
        cavity_out_prefix = f"{out_prefix}_cavity_{cavity_id}"
        
        try:
            # Run Vina for this cavity
            log_file, out_pdbqt = run_vina(
                receptor_pdbqt=receptor_pdbqt,
                ligand_pdbqt=ligand_pdbqt,
                out_prefix=cavity_out_prefix,
                center=center,
                size=size,
                grid_spacing=grid_spacing,
                timeout=timeout
            )
            
            print(f"  [OK] Docking complete for Cavity {cavity_id}")
            
            # Store result with cavity metadata
            results.append((log_file, out_pdbqt, cavity_id, cavity))
            
        except Exception as e:
            print(f"  [FAIL] Docking failed for Cavity {cavity_id}: {str(e)}")
            # Continue with other cavities even if one fails
            continue
    
    if not results:
        raise RuntimeError("All cavity docking runs failed")
    
    print(f"\n[SUCCESS] Completed docking for {len(results)}/{len(cavities)} cavities")
    
    return results

