"""
Surface-to-Surface Distance Metric

NEW METRIC for liberal consensus matching.

Computes minimum distance between any fpocket point and any P2Rank point.
This captures nearby but non-overlapping pockets, which is critical because:
- fpocket points = alpha sphere centers (cavity interior)
- P2Rank points = SAS surface points (cavity surface)

These point sets may not overlap even when describing the same functional pocket.
"""

import numpy as np
from typing import Dict
import math


def calculate_surface_to_surface_distance(cavity1: Dict, cavity2: Dict) -> float:
    """
    Calculate minimum distance between any point in cavity1 and any point in cavity2.
    
    This is the PRIMARY metric for detecting proximal pockets that may not
    have overlapping voxels due to methodological differences.
    
    Args:
        cavity1: First cavity dictionary with 'points_3d' key
        cavity2: Second cavity dictionary with 'points_3d' key
    
    Returns:
        Minimum distance in Angstroms
        Returns infinity if either cavity has no points
    
    Example:
        >>> cav1 = {'points_3d': [(0, 0, 0), (1, 0, 0)]}
        >>> cav2 = {'points_3d': [(5, 0, 0), (6, 0, 0)]}
        >>> dist = calculate_surface_to_surface_distance(cav1, cav2)
        >>> # dist = 4.0 Å (distance from (1,0,0) to (5,0,0))
    """
    points1 = cavity1.get('points_3d', [])
    points2 = cavity2.get('points_3d', [])
    
    if not points1 or not points2:
        return float('inf')
    
    # Convert to numpy arrays
    points1 = np.array(points1)
    points2 = np.array(points2)
    
    # Compute pairwise distances (vectorized for efficiency)
    # Shape: (N1, N2)
    distances = np.linalg.norm(
        points1[:, np.newaxis, :] - points2[np.newaxis, :, :],
        axis=2
    )
    
    # Return minimum distance
    min_distance = float(distances.min())
    
    return min_distance


def calculate_surface_proximity_similarity(cavity1: Dict, cavity2: Dict, sigma: float = 6.0) -> float:
    """
    Convert surface-to-surface distance to similarity score using Gaussian decay.
    
    Formula: S_surface = exp(-(D_surface / 6.0 Å)²)
    
    Args:
        cavity1: First cavity dictionary with 'points_3d' key
        cavity2: Second cavity dictionary with 'points_3d' key
        sigma: Gaussian width parameter (default: 6.0 Å)
    
    Returns:
        Similarity score in range [0, 1]
        - 1.0 for touching/overlapping pockets (D_surface = 0)
        - ~0.6 for D_surface = 6 Å
        - ~0.1 for D_surface = 12 Å
    
    Interpretation:
        - D_surface ≤ 6 Å: Strong proximity (likely same pocket)
        - D_surface ≤ 8 Å: Acceptable proximity (biologically plausible)
        - D_surface > 10 Å: Likely different pockets
    """
    distance = calculate_surface_to_surface_distance(cavity1, cavity2)
    
    if distance == float('inf'):
        return 0.0
    
    # Gaussian decay
    similarity = math.exp(-(distance / sigma) ** 2)
    
    return float(similarity)
