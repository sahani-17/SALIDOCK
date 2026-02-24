"""
Enhanced Similarity Metrics for Consensus Pocket Detection

Implements comprehensive similarity metrics for comparing pockets from different tools:
1. Centroid proximity with Gaussian decay
2. Spatial overlap using voxel Jaccard similarity
3. Physicochemical similarity (already imported from physicochemical_properties)
4. Score agreement metric

These functions are used in the weighted consensus scoring framework.
"""

import numpy as np
from typing import Dict, List, Tuple
import math


def calculate_centroid_proximity_gaussian(cavity1: Dict, cavity2: Dict, sigma: float = 8.0) -> float:
    """
    Calculate centroid proximity using RELAXED Gaussian decay similarity.
    
    Formula: S_centroid = exp(-(d / sigma)²)
    
    REVISED (LIBERAL): sigma = 8.0 Å to account for methodological differences:
    - fpocket centroid → geometric cavity interior
    - P2Rank centroid → surface ligandability maximum
    
    Args:
        cavity1: First cavity dictionary with 'center' key
        cavity2: Second cavity dictionary with 'center' key
        sigma: Gaussian width parameter in Angstroms (default: 8.0 Å, was 4.0 Å)
               Relaxed to accommodate surface vs interior centroid differences
    
    Returns:
        Similarity score in range [0, 1]
        - 1.0 for identical centers
        - ~0.6 at 8 Å distance (acceptable biological agreement)
        - ~0.1 at 16 Å distance
    
    Scientific Rationale:
        fpocket and P2Rank define pocket centers differently, so exact centroid
        overlap is not expected. Relaxed threshold captures functional equivalence.
    
    Example:
        >>> cav1 = {'center': (0, 0, 0)}
        >>> cav2 = {'center': (8, 0, 0)}  # 8 Å away
        >>> similarity = calculate_centroid_proximity_gaussian(cav1, cav2)
        >>> # similarity ≈ 0.606 (exp(-1)) - acceptable agreement
    """
    c1 = np.array(cavity1['center'])
    c2 = np.array(cavity2['center'])
    
    distance = np.linalg.norm(c1 - c2)
    
    # Relaxed Gaussian decay: exp(-(d/8.0)²)
    similarity = math.exp(-(distance / sigma) ** 2)
    
    return float(similarity)


def calculate_spatial_overlap_voxelized(
    cavity1: Dict, 
    cavity2: Dict,
    voxel_size: float = 1.0
) -> float:
    """
    Calculate true voxel-based Jaccard similarity for spatial overlap.
    
    Uses actual 3D points from both pockets to compute voxelized overlap.
    This is more accurate than bounding box approximation.
    
    Formula: J_spatial = |V_fp ∩ V_pr| / |V_fp ∪ V_pr|
    
    Args:
        cavity1: First cavity dictionary with 'points_3d' key
        cavity2: Second cavity dictionary with 'points_3d' key
        voxel_size: Voxel grid resolution in Angstroms (default: 1.0)
    
    Returns:
        Jaccard similarity in range [0, 1]
        - 1.0 for perfect overlap
        - 0.0 for no overlap
    
    Performance:
        ~100-500ms for typical binding sites (50-200 points)
    """
    # Get 3D points from both cavities
    points1 = cavity1.get('points_3d', [])
    points2 = cavity2.get('points_3d', [])
    
    if not points1 or not points2:
        return 0.0
    
    # Convert to numpy arrays
    points1 = np.array(points1)
    points2 = np.array(points2)
    
    # Voxelize points: round to nearest voxel grid
    voxels1 = set(map(tuple, np.round(points1 / voxel_size).astype(int)))
    voxels2 = set(map(tuple, np.round(points2 / voxel_size).astype(int)))
    
    # Calculate Jaccard similarity
    intersection = len(voxels1 & voxels2)
    union = len(voxels1 | voxels2)
    
    if union == 0:
        return 0.0
    
    jaccard = intersection / union
    return float(jaccard)


def calculate_score_agreement(cavity1: Dict, cavity2: Dict) -> float:
    """
    Calculate agreement between normalized scores from both tools.
    
    Formula: S_score = 1 - |score_fp - score_pr|
    
    Args:
        cavity1: First cavity with 'normalized_score' key (fpocket druggability)
        cavity2: Second cavity with 'normalized_score' key (P2Rank probability)
    
    Returns:
        Agreement score in range [0, 1]
        - 1.0 for identical scores
        - 0.0 for maximally different scores (0 vs 1)
    
    Example:
        >>> cav1 = {'normalized_score': 0.85}  # fpocket druggability
        >>> cav2 = {'normalized_score': 0.90}  # P2Rank probability
        >>> agreement = calculate_score_agreement(cav1, cav2)
        >>> # agreement = 0.95 (1 - |0.85 - 0.90|)
    """
    score1 = cavity1.get('normalized_score', 0.0)
    score2 = cavity2.get('normalized_score', 0.0)
    
    # Ensure scores are in [0, 1] range
    score1 = np.clip(score1, 0.0, 1.0)
    score2 = np.clip(score2, 0.0, 1.0)
    
    # Agreement = 1 - absolute difference
    agreement = 1.0 - abs(score1 - score2)
    
    return float(agreement)


def compute_consensus_score(
    centroid_proximity: float,
    surface_proximity: float,
    spatial_overlap: float,
    residue_jaccard: float,
    physicochemical_similarity: float,
    score_agreement: float,
    weights: tuple = (0.15, 0.20, 0.10, 0.30, 0.15, 0.10)
) -> float:
    """
    Compute weighted consensus score from all similarity metrics.
    
    REVISED (LIBERAL) Formula:
        S_consensus = 0.15×S_centroid + 0.20×S_surface + 0.10×J_spatial + 
                      0.30×J_res + 0.15×S_physchem + 0.10×S_score
    
    REVISED Weights (residue-focused, surface-aware):
        - 0.15 (15%) - Centroid proximity (relaxed Gaussian @ 8Å)
        - 0.20 (20%) - Surface proximity (NEW - critical for non-overlapping pockets)
        - 0.10 (10%) - Spatial overlap (REDUCED - often zero, now optional)
        - 0.30 (30%) - Residue overlap (INCREASED - PRIMARY biological criterion)
        - 0.15 (15%) - Physicochemical similarity
        - 0.10 (10%) - Score agreement
    
    Scientific Rationale:
        Residue overlap and surface proximity are more biologically meaningful
        than voxel overlap when comparing geometry-based vs ML-based methods.
    
    Args:
        centroid_proximity: S_centroid from relaxed Gaussian (8Å)
        surface_proximity: S_surface from surface-to-surface distance (NEW)
        spatial_overlap: J_spatial from voxel Jaccard (optional, often 0)
        residue_jaccard: J_res from residue Jaccard (PRIMARY)
        physicochemical_similarity: S_physchem from cosine similarity
        score_agreement: S_score from score difference
        weights: Tuple of 6 weights (must sum to 1.0)
    
    Returns:
        Weighted consensus score in range [0, 1]
    
    Raises:
        ValueError: If weights don't sum to 1.0
    """
    # Validate weights
    if not math.isclose(sum(weights), 1.0, abs_tol=1e-6):
        raise ValueError(f"Weights must sum to 1.0, got {sum(weights)}")
    
    # Compute weighted sum
    consensus_score = (
        weights[0] * centroid_proximity +
        weights[1] * surface_proximity +
        weights[2] * spatial_overlap +
        weights[3] * residue_jaccard +
        weights[4] * physicochemical_similarity +
        weights[5] * score_agreement
    )
    
    return float(np.clip(consensus_score, 0.0, 1.0))


def compute_all_similarity_metrics(cavity1: Dict, cavity2: Dict) -> Dict[str, float]:
    """
    Compute all similarity metrics between two cavities.
    
    REVISED: Now includes surface-to-surface distance metric.
    
    Convenience function that calculates all 6 metrics at once.
    
    Args:
        cavity1: First cavity dictionary (fpocket)
        cavity2: Second cavity dictionary (P2Rank)
    
    Returns:
        Dictionary with all metrics:
        {
            'centroid_proximity': float,      # Relaxed Gaussian @ 8Å
            'surface_proximity': float,       # NEW - surface-to-surface
            'surface_distance': float,        # NEW - raw distance in Å
            'spatial_overlap': float,         # Voxel Jaccard (optional)
            'residue_jaccard': float,         # PRIMARY criterion
            'physicochemical_similarity': float,
            'score_agreement': float,
            'consensus_score': float          # Weighted combination (6 metrics)
        }
    """
    from consensus_cavity_detection import calculate_residue_jaccard
    from physicochemical_properties import compute_physicochemical_similarity
    from surface_distance import (
        calculate_surface_to_surface_distance,
        calculate_surface_proximity_similarity
    )
    
    # Calculate all metrics
    centroid_prox = calculate_centroid_proximity_gaussian(cavity1, cavity2)
    
    # NEW: Surface-to-surface distance
    surface_dist = calculate_surface_to_surface_distance(cavity1, cavity2)
    surface_prox = calculate_surface_proximity_similarity(cavity1, cavity2)
    
    spatial_overlap = calculate_spatial_overlap_voxelized(cavity1, cavity2)
    residue_jacc = calculate_residue_jaccard(cavity1, cavity2)
    physchem_sim = compute_physicochemical_similarity(
        cavity1.get('residues', []),
        cavity2.get('residues', [])
    )
    score_agree = calculate_score_agreement(cavity1, cavity2)
    
    # Compute weighted consensus score (NOW WITH 6 METRICS)
    consensus = compute_consensus_score(
        centroid_prox,
        surface_prox,      # NEW
        spatial_overlap,
        residue_jacc,
        physchem_sim,
        score_agree
    )
    
    return {
        'centroid_proximity': centroid_prox,
        'surface_proximity': surface_prox,        # NEW
        'surface_distance': surface_dist,         # NEW (raw Å)
        'spatial_overlap': spatial_overlap,
        'residue_jaccard': residue_jacc,
        'physicochemical_similarity': physchem_sim,
        'score_agreement': score_agree,
        'consensus_score': consensus
    }
