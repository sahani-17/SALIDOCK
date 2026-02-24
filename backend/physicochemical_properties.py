"""
Physicochemical Properties Module

Provides amino acid property database and feature extraction for pocket characterization.
Uses standard biochemical classifications for research reproducibility.

References:
- Kyte-Doolittle hydrophobicity scale (1982)
- Standard amino acid properties (Lehninger Principles of Biochemistry)
"""

from typing import Dict, List, Tuple
import numpy as np


# Standard amino acid properties database
# Format: 3-letter code -> {hydrophobicity, charge, hbond_donors, hbond_acceptors}
AMINO_ACID_PROPERTIES = {
    # Nonpolar, aliphatic
    'ALA': {'hydrophobicity': 1.8, 'charge': 0, 'hbond_donors': 0, 'hbond_acceptors': 0, 'apolar': True},
    'VAL': {'hydrophobicity': 4.2, 'charge': 0, 'hbond_donors': 0, 'hbond_acceptors': 0, 'apolar': True},
    'LEU': {'hydrophobicity': 3.8, 'charge': 0, 'hbond_donors': 0, 'hbond_acceptors': 0, 'apolar': True},
    'ILE': {'hydrophobicity': 4.5, 'charge': 0, 'hbond_donors': 0, 'hbond_acceptors': 0, 'apolar': True},
    'MET': {'hydrophobicity': 1.9, 'charge': 0, 'hbond_donors': 0, 'hbond_acceptors': 0, 'apolar': True},
    'PRO': {'hydrophobicity': -1.6, 'charge': 0, 'hbond_donors': 0, 'hbond_acceptors': 0, 'apolar': True},
    
    # Aromatic
    'PHE': {'hydrophobicity': 2.8, 'charge': 0, 'hbond_donors': 0, 'hbond_acceptors': 0, 'apolar': True},
    'TRP': {'hydrophobicity': -0.9, 'charge': 0, 'hbond_donors': 1, 'hbond_acceptors': 0, 'apolar': False},
    'TYR': {'hydrophobicity': -1.3, 'charge': 0, 'hbond_donors': 1, 'hbond_acceptors': 1, 'apolar': False},
    
    # Polar, uncharged
    'SER': {'hydrophobicity': -0.8, 'charge': 0, 'hbond_donors': 1, 'hbond_acceptors': 1, 'apolar': False},
    'THR': {'hydrophobicity': -0.7, 'charge': 0, 'hbond_donors': 1, 'hbond_acceptors': 1, 'apolar': False},
    'CYS': {'hydrophobicity': 2.5, 'charge': 0, 'hbond_donors': 1, 'hbond_acceptors': 0, 'apolar': False},
    'ASN': {'hydrophobicity': -3.5, 'charge': 0, 'hbond_donors': 2, 'hbond_acceptors': 2, 'apolar': False},
    'GLN': {'hydrophobicity': -3.5, 'charge': 0, 'hbond_donors': 2, 'hbond_acceptors': 2, 'apolar': False},
    
    # Positively charged
    'LYS': {'hydrophobicity': -3.9, 'charge': +1, 'hbond_donors': 3, 'hbond_acceptors': 0, 'apolar': False},
    'ARG': {'hydrophobicity': -4.5, 'charge': +1, 'hbond_donors': 4, 'hbond_acceptors': 0, 'apolar': False},
    'HIS': {'hydrophobicity': -3.2, 'charge': +0.5, 'hbond_donors': 1, 'hbond_acceptors': 1, 'apolar': False},  # pH-dependent
    
    # Negatively charged
    'ASP': {'hydrophobicity': -3.5, 'charge': -1, 'hbond_donors': 0, 'hbond_acceptors': 2, 'apolar': False},
    'GLU': {'hydrophobicity': -3.5, 'charge': -1, 'hbond_donors': 0, 'hbond_acceptors': 2, 'apolar': False},
    
    # Special
    'GLY': {'hydrophobicity': -0.4, 'charge': 0, 'hbond_donors': 0, 'hbond_acceptors': 0, 'apolar': False},
}


def classify_residue(residue_code: str) -> Dict:
    """
    Get physicochemical properties for a residue.
    
    Args:
        residue_code: 3-letter amino acid code (e.g., 'ALA', 'GLY')
    
    Returns:
        Dictionary with properties: {hydrophobicity, charge, hbond_donors, hbond_acceptors, apolar}
        Returns default neutral properties if residue not recognized
    """
    residue_code = residue_code.upper().strip()
    
    if residue_code in AMINO_ACID_PROPERTIES:
        return AMINO_ACID_PROPERTIES[residue_code].copy()
    else:
        # Default for unknown residues (e.g., modified amino acids, ligands)
        return {
            'hydrophobicity': 0.0,
            'charge': 0,
            'hbond_donors': 0,
            'hbond_acceptors': 0,
            'apolar': False
        }


def compute_pocket_features(residue_ids: List[str]) -> np.ndarray:
    """
    Compute aggregated physicochemical feature vector for a pocket.
    
    Args:
        residue_ids: List of residue identifiers in format "RESNAME_RESNUM_CHAIN"
                     (e.g., ["ARG_8_A", "LEU_23_A", "GLY_45_B"])
    
    Returns:
        Feature vector as numpy array: [apolar_fraction, hbond_donors, hbond_acceptors, net_charge]
        
    Example:
        >>> residues = ["ARG_8_A", "LEU_23_A", "ASP_45_B"]
        >>> features = compute_pocket_features(residues)
        >>> # features = [0.33, 4.0, 2.0, 0.0]  # 1/3 apolar, 4 donors, 2 acceptors, net charge 0
    """
    if not residue_ids:
        return np.array([0.0, 0.0, 0.0, 0.0])
    
    apolar_count = 0
    total_hbond_donors = 0
    total_hbond_acceptors = 0
    total_charge = 0.0
    
    for res_id in residue_ids:
        # Extract residue name from "RESNAME_RESNUM_CHAIN" format
        parts = res_id.split('_')
        if len(parts) >= 1:
            res_name = parts[0]
            props = classify_residue(res_name)
            
            if props['apolar']:
                apolar_count += 1
            
            total_hbond_donors += props['hbond_donors']
            total_hbond_acceptors += props['hbond_acceptors']
            total_charge += props['charge']
    
    num_residues = len(residue_ids)
    
    # Feature vector
    apolar_fraction = apolar_count / num_residues if num_residues > 0 else 0.0
    avg_hbond_donors = total_hbond_donors / num_residues if num_residues > 0 else 0.0
    avg_hbond_acceptors = total_hbond_acceptors / num_residues if num_residues > 0 else 0.0
    avg_charge = total_charge / num_residues if num_residues > 0 else 0.0
    
    return np.array([
        apolar_fraction,
        avg_hbond_donors,
        avg_hbond_acceptors,
        avg_charge
    ])


def compute_physicochemical_similarity(residues1: List[str], residues2: List[str]) -> float:
    """
    Compute cosine similarity between physicochemical feature vectors of two residue sets.
    
    Args:
        residues1: List of residue IDs for first pocket
        residues2: List of residue IDs for second pocket
    
    Returns:
        Cosine similarity in range [0, 1] (normalized from [-1, 1])
        Returns 0.0 if either residue set is empty
    
    Example:
        >>> res1 = ["ARG_8_A", "LEU_23_A", "ASP_45_B"]
        >>> res2 = ["ARG_10_A", "ILE_25_A", "GLU_50_B"]
        >>> similarity = compute_physicochemical_similarity(res1, res2)
        >>> # High similarity expected (similar charge distribution, mix of polar/apolar)
    """
    if not residues1 or not residues2:
        return 0.0
    
    features1 = compute_pocket_features(residues1)
    features2 = compute_pocket_features(residues2)
    
    # Compute cosine similarity
    norm1 = np.linalg.norm(features1)
    norm2 = np.linalg.norm(features2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    cosine_sim = np.dot(features1, features2) / (norm1 * norm2)
    
    # Normalize from [-1, 1] to [0, 1]
    normalized_sim = (cosine_sim + 1.0) / 2.0
    
    return float(np.clip(normalized_sim, 0.0, 1.0))


def get_pocket_physicochemical_summary(residue_ids: List[str]) -> Dict:
    """
    Get human-readable summary of pocket physicochemical properties.
    
    Args:
        residue_ids: List of residue identifiers
    
    Returns:
        Dictionary with summary statistics
    """
    features = compute_pocket_features(residue_ids)
    
    return {
        'apolar_fraction': float(features[0]),
        'avg_hbond_donors': float(features[1]),
        'avg_hbond_acceptors': float(features[2]),
        'avg_charge': float(features[3]),
        'num_residues': len(residue_ids),
        'feature_vector': features.tolist()
    }
