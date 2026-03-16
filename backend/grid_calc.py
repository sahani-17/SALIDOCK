"""
Grid Calculation Module - Auto-Blind and Manual Modes
Handles grid box parameter calculations for both auto cavity docking and manual coordinate-based active site docking modes.
Supports two docking modes:
1. Auto-Blind Mode: Use cavity-detected grid parameters
2. Manual Mode: User-defined grid center and size
"""

from typing import Tuple, Dict, List, Optional, Union
from pathlib import Path


def _validate_tuple_3d(
    value: Union[Tuple, List],
    name: str,
    allow_negative: bool = True,
    require_positive: bool = False
) -> Tuple[float, float, float]:
    """
    Validate and convert a 3D coordinate or size tuple.
    
    Args:
        value: Input tuple/list to validate
        name: Name of the parameter (for error messages)
        allow_negative: Whether negative values are allowed
        require_positive: Whether all values must be > 0
    
    Returns:
        Validated tuple of 3 floats
    
    Raises:
        ValueError: If validation fails
    """
    # Check if it's a sequence
    if not isinstance(value, (tuple, list)):
        raise ValueError(f"{name} must be a tuple or list, got {type(value).__name__}")
    
    # Check length
    if len(value) != 3:
        raise ValueError(f"{name} must have exactly 3 elements, got {len(value)}")
    
    # Check types and values
    validated = []
    for i, v in enumerate(value):
        if not isinstance(v, (int, float)):
            raise ValueError(f"{name}[{i}] must be numeric, got {type(v).__name__}: {v}")
        
        if require_positive and v <= 0:
            raise ValueError(f"{name}[{i}] must be positive, got {v}")
        
        if not allow_negative and v < 0:
            raise ValueError(f"{name}[{i}] cannot be negative, got {v}")
        
        validated.append(float(v))
    
    return tuple(validated)


def calculate_grid_from_cavity(cavity_data: Dict) -> Tuple[Tuple[float, float, float], Tuple[float, float, float]]:
    """
    Extract grid parameters from cavity metadata.
    
    Args:
        cavity_data: Cavity dictionary with 'center' and 'size' fields
    
    Returns:
        Tuple of (center, size):
        - center: (x, y, z) coordinates
        - size: (sx, sy, sz) dimensions in Angstroms
    
    Raises:
        ValueError: If cavity_data is missing required fields or has invalid values
        KeyError: If cavity_data is missing 'center' or 'size' keys
    
    Example:
        >>> cavity = {'center': (10.5, 20.3, 15.8), 'size': (18.0, 20.0, 19.0)}
        >>> center, size = calculate_grid_from_cavity(cavity)
        >>> center
        (10.5, 20.3, 15.8)
    """
    # Validate required keys
    if 'center' not in cavity_data:
        raise KeyError("cavity_data missing required key 'center'")
    if 'size' not in cavity_data:
        raise KeyError("cavity_data missing required key 'size'")
    
    # Validate and convert center and size
    center = _validate_tuple_3d(cavity_data['center'], 'cavity center')
    size = _validate_tuple_3d(cavity_data['size'], 'cavity size', require_positive=True)
    
    return center, size


def calculate_manual_grid(
    center: Tuple[float, float, float],
    size: Tuple[float, float, float]
) -> Tuple[Tuple[float, float, float], Tuple[float, float, float]]:
    """
    Calculate grid parameters for manual mode (user-defined).
    
    Args:
        center: Grid center coordinates (x, y, z)
        size: Grid dimensions (sx, sy, sz) in Angstroms
    
    Returns:
        Tuple of (center, size) with rounded values
    
    Raises:
        ValueError: If center or size values are invalid
    """
    # Validate inputs using helper function
    center_validated = _validate_tuple_3d(center, 'center')
    size_validated = _validate_tuple_3d(size, 'size', require_positive=True)
    
    # Round to 3 decimal places
    center_rounded = tuple(round(c, 3) for c in center_validated)
    size_rounded = tuple(round(s, 3) for s in size_validated)
    
    return center_rounded, size_rounded


def validate_grid_size(size: Tuple[float, float, float]) -> Dict:
    """
    Validate grid dimensions and return warnings.
    
    Args:
        size: Grid dimensions (sx, sy, sz) in Angstroms
    
    Returns:
        Dictionary with validation results:
        {
            'valid': bool,
            'warnings': List[str],
            'volume': float,  # in Å³ (cubic Angstroms)
            'recommendations': List[str]
        }
    
    Raises:
        ValueError: If size tuple is invalid
    
    Example:
        >>> result = validate_grid_size((10.0, 10.0, 10.0))
        >>> result['warnings']
        ['Grid dimension X (10.0 Å) is smaller than recommended minimum (15 Å)', ...]
    """
    # Validate input
    size_validated = _validate_tuple_3d(size, 'size', require_positive=True)
    
    warnings = []
    recommendations = []
    valid = True
    
    sx, sy, sz = size_validated
    
    # Check minimum size (15 Å recommended)
    if sx < 15.0:
        warnings.append(f"Grid dimension X ({sx} Å) is smaller than recommended minimum (15 Å)")
        recommendations.append("Consider increasing X dimension to at least 15 Å")
        valid = False
    
    if sy < 15.0:
        warnings.append(f"Grid dimension Y ({sy} Å) is smaller than recommended minimum (15 Å)")
        recommendations.append("Consider increasing Y dimension to at least 15 Å")
        valid = False
    
    if sz < 15.0:
        warnings.append(f"Grid dimension Z ({sz} Å) is smaller than recommended minimum (15 Å)")
        recommendations.append("Consider increasing Z dimension to at least 15 Å")
        valid = False
    
    # Check maximum size (40 Å recommended)
    if sx > 40.0:
        warnings.append(f"Grid dimension X ({sx} Å) is larger than recommended maximum (40 Å)")
        recommendations.append("Large grids increase computation time without improving accuracy")
        valid = False
    
    if sy > 40.0:
        warnings.append(f"Grid dimension Y ({sy} Å) is larger than recommended maximum (40 Å)")
        recommendations.append("Large grids increase computation time without improving accuracy")
        valid = False
    
    if sz > 40.0:
        warnings.append(f"Grid dimension Z ({sz} Å) is larger than recommended maximum (40 Å)")
        recommendations.append("Large grids increase computation time without improving accuracy")
        valid = False
    
    # Calculate volume
    volume = sx * sy * sz
    
    # Check if grid is excessively large
    if volume > 64000:  # 40^3
        warnings.append(f"Grid volume ({volume:.0f} Å³) is excessively large")
        recommendations.append("Consider reducing grid dimensions for faster docking")
        valid = False  # Consistent with dimension checks
    
    # Check if grid is too small
    if volume < 3375:  # 15^3
        warnings.append(f"Grid volume ({volume:.0f} ų) is very small")
        recommendations.append("Small grids may miss binding poses")
        valid = False
    
    return {
        'valid': valid,
        'warnings': warnings,
        'recommendations': recommendations,
        'volume': round(volume, 2)
    }


def validate_grid_center(
    center: Tuple[float, float, float],
    protein_pdbqt_path: str,
    max_distance: float = 50.0
) -> Dict:
    """
    Validate that grid center is reasonable relative to protein.
    
    Args:
        center: Grid center coordinates (x, y, z)
        protein_pdbqt_path: Path to protein PDBQT file
        max_distance: Maximum allowed distance from protein center (Angstroms)
    
    Returns:
        Dictionary with validation results:
        {
            'valid': bool,
            'warnings': List[str],
            'distance_from_protein': Optional[float]  # None if validation failed
        }
    
    Raises:
        ValueError: If center tuple is invalid
    """
    # Validate center coordinates
    center_validated = _validate_tuple_3d(center, 'center')
    
    warnings = []
    valid = True
    
    # Parse protein coordinates to get center
    try:
        protein_path = Path(protein_pdbqt_path)
        
        # Check if file exists
        if not protein_path.exists():
            warnings.append(f"Protein file not found: {protein_pdbqt_path}")
            return {'valid': False, 'warnings': warnings, 'distance_from_protein': None}
        lines = protein_path.read_text().splitlines()
        coords = []
        
        for line in lines:
            if line.startswith('ATOM') or line.startswith('HETATM'):
                try:
                    x = float(line[30:38].strip())
                    y = float(line[38:46].strip())
                    z = float(line[46:54].strip())
                    coords.append((x, y, z))
                except (ValueError, IndexError):
                    continue
        
        if not coords:
            warnings.append("Could not parse protein coordinates for validation")
            return {'valid': False, 'warnings': warnings, 'distance_from_protein': None}
        
        # Calculate protein center
        xs, ys, zs = zip(*coords)
        protein_center = (
            (min(xs) + max(xs)) / 2.0,
            (min(ys) + max(ys)) / 2.0,
            (min(zs) + max(zs)) / 2.0
        )
        
        # Calculate distance from grid center to protein center
        distance = (
            (center_validated[0] - protein_center[0]) ** 2 +
            (center_validated[1] - protein_center[1]) ** 2 +
            (center_validated[2] - protein_center[2]) ** 2
        ) ** 0.5
        
        # Check if center is too far from protein
        if distance > max_distance:
            warnings.append(
                f"Grid center is {distance:.1f} Å from protein center (max: {max_distance} Å)"
            )
            warnings.append("Grid may not overlap with protein structure")
            valid = False
        
        return {
            'valid': valid,
            'warnings': warnings,
            'distance_from_protein': round(distance, 2)
        }
    
    except Exception as e:
        warnings.append(f"Could not validate grid center: {str(e)}")
        return {'valid': False, 'warnings': warnings, 'distance_from_protein': None}


def get_grid_info(
    center: Tuple[float, float, float],
    size: Tuple[float, float, float]
) -> Dict:
    """
    Get comprehensive grid information for display.
    
    Args:
        center: Grid center coordinates
        size: Grid dimensions
    
    Returns:
        Dictionary with grid information
    
    Raises:
        ValueError: If center or size tuples are invalid
    """
    # Validate inputs
    center_validated = _validate_tuple_3d(center, 'center')
    size_validated = _validate_tuple_3d(size, 'size', require_positive=True)
    volume = size_validated[0] * size_validated[1] * size_validated[2]
    
    # Calculate grid bounds
    bounds = {
        'x_min': round(center_validated[0] - size_validated[0] / 2, 3),
        'x_max': round(center_validated[0] + size_validated[0] / 2, 3),
        'y_min': round(center_validated[1] - size_validated[1] / 2, 3),
        'y_max': round(center_validated[1] + size_validated[1] / 2, 3),
        'z_min': round(center_validated[2] - size_validated[2] / 2, 3),
        'z_max': round(center_validated[2] + size_validated[2] / 2, 3)
    }
    
    return {
        'center': center_validated,
        'size': size_validated,
        'volume': round(volume, 2),
        'bounds': bounds
    }
