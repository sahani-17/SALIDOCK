"""
Protein-Ligand Interaction Analysis Module

Analyzes molecular interactions between protein and ligand structures
including hydrogen bonds, hydrophobic interactions, ionic interactions,
pi-stacking, halogen bonds, and cation-pi interactions.

Based on standard interaction detection criteria.
"""

from typing import List, Dict, Tuple, Optional
import numpy as np
from pathlib import Path
from Bio.PDB import PDBParser, NeighborSearch, Selection
from Bio.PDB.Atom import Atom
from Bio.PDB.Residue import Residue
import warnings
warnings.filterwarnings('ignore')

# RDKit for proper aromatic ring and charge detection
try:
    from rdkit import Chem
    from rdkit.Chem import AllChem, Descriptors
    RDKIT_AVAILABLE = True
except (ImportError, ModuleNotFoundError, AttributeError):
    RDKIT_AVAILABLE = False
    warnings.warn("RDKit not available. Aromatic and charge detection will use simplified methods.")


INTERACTION_PARAMS = {
    'hydrogen_bond': {
        'max_dist': 3.5,
        'max_sulfur_dist': 4.1,
        'max_acc_angle': 45,
        'max_don_angle': 45,
        'max_acc_plane_angle': 90,
        'max_don_plane_angle': 30
    },
    'hydrophobic': {
        'max_dist': 4.0
    },
    'halogen_bond': {
        'max_dist': 4.0,
        'max_angle': 30
    },
    'ionic': {
        'max_dist': 5.0
    },
    'cation_pi': {
        'max_dist': 6.0,
        'max_offset': 2.0
    },
    'pi_stacking': {
        'max_dist': 5.5,
        'max_offset': 2.0,
        'max_angle': 30
    }
}

# Atom type classifications
HYDROGEN_BOND_DONORS = ['N', 'O', 'S']
HYDROGEN_BOND_ACCEPTORS = ['N', 'O', 'S', 'F']
HYDROPHOBIC_ATOMS = ['C']
HALOGENS = ['F', 'Cl', 'Br', 'I']
POSITIVE_RESIDUES = ['ARG', 'LYS', 'HIS']
NEGATIVE_RESIDUES = ['ASP', 'GLU']
AROMATIC_RESIDUES = ['PHE', 'TRP', 'TYR', 'HIS']


def _get_element_safe(atom: Atom) -> Optional[str]:
    """
    Safely get element symbol from atom.
    
    BioPython's Atom.element can be None if not set in PDB file.
    This helper prevents AttributeError when calling .upper() on None.
    
    Args:
        atom: BioPython Atom object
    
    Returns:
        Uppercase element symbol, or None if not available
    """
    if atom.element is None:
        return None
    return atom.element.upper()


def calculate_angle(v1: np.ndarray, v2: np.ndarray) -> float:
    """
    Calculate angle between two vectors in degrees.
    
    Used for hydrogen bond geometry validation (donor-H-acceptor angles).
    """
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    
    # Handle zero-length vectors
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    cos_angle = np.dot(v1, v2) / (norm1 * norm2)
    cos_angle = np.clip(cos_angle, -1.0, 1.0)
    return np.degrees(np.arccos(cos_angle))


def _get_first_atom(residue: Residue) -> Optional[Atom]:
    """
    Safely get first atom from residue.
    
    Args:
        residue: BioPython Residue object
    
    Returns:
        First atom in residue, or None if residue is empty
    """
    atoms = list(residue.get_atoms())
    return atoms[0] if atoms else None


def _parse_ligand_with_rdkit(ligand_file: str, pose_number: int = 1) -> Optional[Chem.Mol]:
    """
    Parse ligand PDBQT file and convert to RDKit molecule.
    
    Args:
        ligand_file: Path to ligand PDBQT file
        pose_number: Which pose to parse (1-based)
    
    Returns:
        RDKit Mol object, or None if parsing fails
    """
    if not RDKIT_AVAILABLE:
        return None
    
    try:
        # Read PDBQT file and extract specific model
        parser = PDBParser(QUIET=True)
        structure = parser.get_structure('ligand', ligand_file)
        models = list(structure.get_models())
        
        if pose_number > len(models) or pose_number < 1:
            return None
        
        model = models[pose_number - 1]
        
        # Convert BioPython structure to PDB string
        from io import StringIO
        from Bio.PDB import PDBIO
        io = PDBIO()
        io.set_structure(model)
        pdb_string = StringIO()
        io.save(pdb_string)
        pdb_content = pdb_string.getvalue()
        
        # Parse with RDKit
        mol = Chem.MolFromPDBBlock(pdb_content, removeHs=False, sanitize=True)
        
        if mol is None:
            warnings.warn(f"Failed to parse ligand with RDKit for pose {pose_number}")
            return None
        
        # Add hydrogens and compute properties
        mol = Chem.AddHs(mol, addCoords=True)
        
        # Compute Gasteiger charges (may fail for some molecules)
        try:
            AllChem.ComputeGasteigerCharges(mol)
        except Exception:
            warnings.warn("Failed to compute Gasteiger charges, using formal charges only")
        
        return mol
        
    except Exception:
        return None


def _get_ligand_aromatic_rings(mol: Chem.Mol, ligand_atoms: List[Atom]) -> List[Tuple[np.ndarray, List[int]]]:
    """
    Get aromatic ring centers from RDKit molecule.
    
    Args:
        mol: RDKit Mol object
        ligand_atoms: List of BioPython Atom objects (for coordinate mapping)
    
    Returns:
        List of (ring_center, atom_indices) tuples
    """
    if mol is None:
        return []
    
    aromatic_rings = []
    
    try:
        # Get aromatic rings using SSSR (Smallest Set of Smallest Rings)
        ring_info = mol.GetRingInfo()
        atom_rings = ring_info.AtomRings()
        
        for ring in atom_rings:
            # Check if ring is aromatic
            is_aromatic = all(mol.GetAtomWithIdx(idx).GetIsAromatic() for idx in ring)
            
            if is_aromatic and len(ring) in [5, 6]:  # 5 or 6-membered aromatic rings
                # Get coordinates from BioPython atoms (more reliable than RDKit coords)
                ring_coords = []
                for idx in ring:
                    if idx < len(ligand_atoms):
                        ring_coords.append(ligand_atoms[idx].get_coord())
                
                if len(ring_coords) >= 3:
                    ring_center = np.mean(ring_coords, axis=0)
                    aromatic_rings.append((ring_center, list(ring)))
        
        return aromatic_rings
        
    except Exception:
        return []


def _get_ligand_charged_atoms(mol: Chem.Mol, ligand_atoms: List[Atom]) -> Dict[str, List[int]]:
    """
    Identify charged atoms in ligand using RDKit.
    
    Args:
        mol: RDKit Mol object
        ligand_atoms: List of BioPython Atom objects
    
    Returns:
        Dictionary with 'positive' and 'negative' keys containing atom indices
    """
    if mol is None:
        return {'positive': [], 'negative': []}
    
    positive_atoms = []
    negative_atoms = []
    
    try:
        for idx, atom in enumerate(mol.GetAtoms()):
            # Get formal charge
            formal_charge = atom.GetFormalCharge()
            
            # Also check Gasteiger partial charge for borderline cases
            try:
                partial_charge = float(atom.GetProp('_GasteigerCharge'))
            except:
                partial_charge = 0.0
            
            # Positive: formal charge +1 or higher, or N with 4 bonds (quaternary)
            if formal_charge > 0:
                positive_atoms.append(idx)
            elif atom.GetSymbol() == 'N' and atom.GetTotalDegree() == 4:
                # Quaternary nitrogen (likely protonated)
                positive_atoms.append(idx)
            elif partial_charge > 0.3:  # Significant positive partial charge
                positive_atoms.append(idx)
            
            # Negative: formal charge -1 or lower
            if formal_charge < 0:
                negative_atoms.append(idx)
            elif partial_charge < -0.3:  # Significant negative partial charge
                negative_atoms.append(idx)
        
        return {'positive': positive_atoms, 'negative': negative_atoms}
        
    except Exception:
        return {'positive': [], 'negative': []}


def get_residue_name(atom: Atom) -> str:
    """Get residue name and number for an atom."""
    residue = atom.get_parent()
    return f"{residue.get_resname()}{residue.get_id()[1]}"


def is_hydrogen_bond_donor(atom: Atom) -> bool:
    """Check if atom can be a hydrogen bond donor."""
    element = _get_element_safe(atom)
    return element is not None and element in HYDROGEN_BOND_DONORS


def is_hydrogen_bond_acceptor(atom: Atom) -> bool:
    """Check if atom can be a hydrogen bond acceptor."""
    element = _get_element_safe(atom)
    return element is not None and element in HYDROGEN_BOND_ACCEPTORS


def is_hydrophobic(atom: Atom) -> bool:
    """Check if atom is hydrophobic (carbon)."""
    element = _get_element_safe(atom)
    return element == 'C'


def is_halogen(atom: Atom) -> bool:
    """Check if atom is a halogen."""
    element = _get_element_safe(atom)
    return element is not None and element in HALOGENS


def is_aromatic_residue(residue: Residue) -> bool:
    """Check if residue is aromatic."""
    return residue.get_resname() in AROMATIC_RESIDUES


def is_positive_residue(residue: Residue) -> bool:
    """Check if residue is positively charged."""
    return residue.get_resname() in POSITIVE_RESIDUES


def is_negative_residue(residue: Residue) -> bool:
    """Check if residue is negatively charged."""
    return residue.get_resname() in NEGATIVE_RESIDUES


def get_aromatic_ring_center(residue: Residue) -> Optional[np.ndarray]:
    """Get center of aromatic ring for residue."""
    resname = residue.get_resname()
    
    # Define aromatic atoms for each residue type
    aromatic_atoms = {
        'PHE': ['CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ'],
        'TYR': ['CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ'],
        'TRP': ['CG', 'CD1', 'CD2', 'NE1', 'CE2', 'CE3', 'CZ2', 'CZ3', 'CH2'],
        'HIS': ['CG', 'ND1', 'CD2', 'CE1', 'NE2']
    }
    
    if resname not in aromatic_atoms:
        return None
    
    coords = []
    for atom_name in aromatic_atoms[resname]:
        if atom_name in residue:
            coords.append(residue[atom_name].get_coord())
    
    if len(coords) >= 3:
        return np.mean(coords, axis=0)
    return None


def detect_hydrogen_bonds(protein_atoms: List[Atom], ligand_atoms: List[Atom]) -> List[Dict]:
    """
    Detect hydrogen bonds between protein and ligand.
    
    Uses distance and angle criteria for accurate detection.
    Returns list of interactions with type, atoms, distance, and angle.
    """
    interactions = []
    params = INTERACTION_PARAMS['hydrogen_bond']
    
    for p_atom in protein_atoms:
        for l_atom in ligand_atoms:
            distance = p_atom - l_atom
            
            # Check distance criteria
            p_elem = _get_element_safe(p_atom)
            l_elem = _get_element_safe(l_atom)
            max_dist = params['max_sulfur_dist'] if p_elem == 'S' or l_elem == 'S' else params['max_dist']
            
            if distance > max_dist:
                continue
            
            # Check donor-acceptor pairs
            p_is_donor = is_hydrogen_bond_donor(p_atom)
            p_is_acceptor = is_hydrogen_bond_acceptor(p_atom)
            l_is_donor = is_hydrogen_bond_donor(l_atom)
            l_is_acceptor = is_hydrogen_bond_acceptor(l_atom)
            
            # Protein donor - Ligand acceptor
            if p_is_donor and l_is_acceptor:
                # Try to validate angle if we can find bonded hydrogens
                angle = _calculate_hbond_angle(p_atom, l_atom)
                
                # If angle validation fails (no H found or bad geometry), skip
                if angle is not None and angle > params['max_don_angle']:
                    continue
                
                interactions.append({
                    'type': 'hydrogen_bond',
                    'protein_residue': get_residue_name(p_atom),
                    'protein_atom': p_atom.get_name(),
                    'ligand_atom': l_atom.get_name(),
                    'distance': round(float(distance), 2),
                    'angle': round(float(angle), 1) if angle is not None else None,
                    'donor': 'protein',
                    'acceptor': 'ligand'
                })
            
            # Ligand donor - Protein acceptor
            elif l_is_donor and p_is_acceptor:
                # Try to validate angle
                angle = _calculate_hbond_angle(l_atom, p_atom)
                
                # If angle validation fails, skip
                if angle is not None and angle > params['max_don_angle']:
                    continue
                
                interactions.append({
                    'type': 'hydrogen_bond',
                    'protein_residue': get_residue_name(p_atom),
                    'protein_atom': p_atom.get_name(),
                    'ligand_atom': l_atom.get_name(),
                    'distance': round(float(distance), 2),
                    'angle': round(float(angle), 1) if angle is not None else None,
                    'donor': 'ligand',
                    'acceptor': 'protein'
                })
    
    return interactions


def _calculate_hbond_angle(donor_atom: Atom, acceptor_atom: Atom) -> Optional[float]:
    """
    Calculate hydrogen bond angle (Donor-H...Acceptor).
    
    Args:
        donor_atom: Donor atom (N, O, S)
        acceptor_atom: Acceptor atom
    
    Returns:
        Angle in degrees, or None if hydrogen not found
    """
    try:
        # Get parent residue to find bonded hydrogen
        residue = donor_atom.get_parent()
        
        # Get donor element for element-specific bond length check
        donor_elem = _get_element_safe(donor_atom)
        
        # Element-specific bond length thresholds (Å)
        bond_length_thresholds = {
            'N': 1.15,  # N-H typical: 1.01Å, threshold: 1.15Å
            'O': 1.10,  # O-H typical: 0.96Å, threshold: 1.10Å
            'S': 1.45,  # S-H typical: 1.34Å, threshold: 1.45Å
        }
        max_bond_length = bond_length_thresholds.get(donor_elem, 1.2)
        
        # Look for hydrogen atoms bonded to donor
        donor_name = donor_atom.get_name()
        hydrogen_atom = None
        
        # Common hydrogen naming patterns (ordered by specificity)
        h_patterns = []
        
        # Specific patterns based on donor atom name
        if len(donor_name) > 1:
            h_patterns.append(f"H{donor_name[1:]}")  # e.g., N1 -> HN1, OG -> HOG
        h_patterns.append(f"{donor_name}H")  # e.g., N -> NH, O -> OH
        
        # Generic patterns (less specific, checked last)
        h_patterns.extend(["H", "H1", "H2", "H3", "HN", "HO", "HS"])
        
        # Search for bonded hydrogen
        for h_name in h_patterns:
            try:
                if h_name in residue:
                    h_atom = residue[h_name]
                    # Check if this H is bonded to donor (element-specific distance)
                    bond_distance = donor_atom - h_atom
                    if bond_distance < max_bond_length:
                        hydrogen_atom = h_atom
                        break
            except:
                continue
        
        if hydrogen_atom is None:
            # No hydrogen found - can't validate angle
            return None
        
        # Calculate D-H...A angle
        # Vector from donor to hydrogen
        v_dh = hydrogen_atom.get_coord() - donor_atom.get_coord()
        # Vector from hydrogen to acceptor
        v_ha = acceptor_atom.get_coord() - hydrogen_atom.get_coord()
        
        # Angle between D-H and H-A vectors
        angle = calculate_angle(v_dh, v_ha)
        
        # H-bond angle should be close to 180° (linear)
        # Return deviation from linearity
        return abs(180.0 - angle)
        
    except Exception:
        # If angle calculation fails, return None (don't reject the H-bond)
        return None


def detect_hydrophobic_interactions(protein_atoms: List[Atom], ligand_atoms: List[Atom]) -> List[Dict]:
    """Detect hydrophobic interactions (alkyl-alkyl contacts)."""
    interactions = []
    max_dist = INTERACTION_PARAMS['hydrophobic']['max_dist']
    
    for p_atom in protein_atoms:
        if not is_hydrophobic(p_atom):
            continue
        
        for l_atom in ligand_atoms:
            if not is_hydrophobic(l_atom):
                continue
            
            distance = p_atom - l_atom
            
            if distance <= max_dist:
                interactions.append({
                    'type': 'hydrophobic',
                    'protein_residue': get_residue_name(p_atom),
                    'protein_atom': p_atom.get_name(),
                    'ligand_atom': l_atom.get_name(),
                    'distance': round(float(distance), 2)
                })
    
    return interactions


def detect_halogen_bonds(protein_atoms: List[Atom], ligand_atoms: List[Atom]) -> List[Dict]:
    """Detect halogen bonds."""
    interactions = []
    max_dist = INTERACTION_PARAMS['halogen_bond']['max_dist']
    
    for p_atom in protein_atoms:
        for l_atom in ligand_atoms:
            # Check if one is halogen and other is acceptor
            p_is_halogen = is_halogen(p_atom)
            l_is_halogen = is_halogen(l_atom)
            p_is_acceptor = is_hydrogen_bond_acceptor(p_atom)
            l_is_acceptor = is_hydrogen_bond_acceptor(l_atom)
            
            if not ((p_is_halogen and l_is_acceptor) or (l_is_halogen and p_is_acceptor)):
                continue
            
            distance = p_atom - l_atom
            
            if distance <= max_dist:
                interactions.append({
                    'type': 'halogen_bond',
                    'protein_residue': get_residue_name(p_atom),
                    'protein_atom': p_atom.get_name(),
                    'ligand_atom': l_atom.get_name(),
                    'distance': round(float(distance), 2)
                })
    
    return interactions


def detect_ionic_interactions(protein_residues: List[Residue], ligand_atoms: List[Atom], ligand_file: str = None, pose_number: int = 1) -> List[Dict]:
    """
    Detect ionic interactions (salt bridges).
    
    Uses RDKit for proper charge detection if available.
    Falls back to checking all ligand atoms otherwise.
    """
    interactions = []
    max_dist = INTERACTION_PARAMS['ionic']['max_dist']
    
    # Try RDKit-based detection first
    if RDKIT_AVAILABLE and ligand_file:
        mol = _parse_ligand_with_rdkit(ligand_file, pose_number)
        charged_atoms_dict = _get_ligand_charged_atoms(mol, ligand_atoms)
        ligand_positive_indices = charged_atoms_dict.get('positive', [])
        ligand_negative_indices = charged_atoms_dict.get('negative', [])
        
        if mol is not None:
            for residue in protein_residues:
                # Check if residue is charged
                if not (is_positive_residue(residue) or is_negative_residue(residue)):
                    continue
                
                # Get charged atoms in residue
                charged_atoms = []
                is_protein_positive = is_positive_residue(residue)
                
                if is_protein_positive:
                    # Positive residues - look for negative ligand atoms
                    if residue.get_resname() == 'ARG':
                        charged_atoms = [a for a in residue if a.get_name() in ['NH1', 'NH2', 'NE']]
                    elif residue.get_resname() == 'LYS':
                        charged_atoms = [a for a in residue if a.get_name() == 'NZ']
                    elif residue.get_resname() == 'HIS':
                        charged_atoms = [a for a in residue if a.get_name() in ['ND1', 'NE2']]
                    
                    # Check against negatively charged ligand atoms
                    target_ligand_indices = ligand_negative_indices
                else:
                    # Negative residues - look for positive ligand atoms
                    if residue.get_resname() in ['ASP', 'GLU']:
                        charged_atoms = [a for a in residue if a.get_name() in ['OD1', 'OD2', 'OE1', 'OE2']]
                    
                    # Check against positively charged ligand atoms
                    target_ligand_indices = ligand_positive_indices
                
                # Check distances only between oppositely charged atoms
                for p_atom in charged_atoms:
                    for l_idx in target_ligand_indices:
                        if l_idx < len(ligand_atoms):
                            l_atom = ligand_atoms[l_idx]
                            distance = p_atom - l_atom
                            
                            if distance <= max_dist:
                                interactions.append({
                                    'type': 'ionic',
                                    'protein_residue': get_residue_name(p_atom),
                                    'protein_atom': p_atom.get_name(),
                                    'ligand_atom': l_atom.get_name(),
                                    'distance': round(float(distance), 2)
                                })
            
            return interactions
    
    # Fallback: Simplified implementation (checks all ligand atoms)
    for residue in protein_residues:
        if not (is_positive_residue(residue) or is_negative_residue(residue)):
            continue
        
        charged_atoms = []
        if is_positive_residue(residue):
            if residue.get_resname() == 'ARG':
                charged_atoms = [a for a in residue if a.get_name() in ['NH1', 'NH2', 'NE']]
            elif residue.get_resname() == 'LYS':
                charged_atoms = [a for a in residue if a.get_name() == 'NZ']
            elif residue.get_resname() == 'HIS':
                charged_atoms = [a for a in residue if a.get_name() in ['ND1', 'NE2']]
        else:
            if residue.get_resname() in ['ASP', 'GLU']:
                charged_atoms = [a for a in residue if a.get_name() in ['OD1', 'OD2', 'OE1', 'OE2']]
        
        for p_atom in charged_atoms:
            for l_atom in ligand_atoms:
                distance = p_atom - l_atom
                
                if distance <= max_dist:
                    interactions.append({
                        'type': 'ionic',
                        'protein_residue': get_residue_name(p_atom),
                        'protein_atom': p_atom.get_name(),
                        'ligand_atom': l_atom.get_name(),
                        'distance': round(distance, 2)
                    })
    
    return interactions


def detect_pi_stacking(protein_residues: List[Residue], ligand_atoms: List[Atom], ligand_file: str = None, pose_number: int = 1) -> List[Dict]:
    """
    Detect pi-pi stacking interactions.
    
    Uses RDKit for proper aromatic ring detection if available.
    Falls back to simplified distance-based detection otherwise.
    """
    interactions = []
    params = INTERACTION_PARAMS['pi_stacking']
    
    # Try RDKit-based detection first
    if RDKIT_AVAILABLE and ligand_file:
        mol = _parse_ligand_with_rdkit(ligand_file, pose_number)
        ligand_aromatic_rings = _get_ligand_aromatic_rings(mol, ligand_atoms)
        
        if ligand_aromatic_rings:
            # Proper aromatic ring-to-ring detection
            for residue in protein_residues:
                if not is_aromatic_residue(residue):
                    continue
                
                protein_ring_center = get_aromatic_ring_center(residue)
                if protein_ring_center is None:
                    continue
                
                for ligand_ring_center, ring_atom_indices in ligand_aromatic_rings:
                    distance = np.linalg.norm(protein_ring_center - ligand_ring_center)
                    
                    if distance <= params['max_dist']:
                        first_atom = _get_first_atom(residue)
                        if first_atom is None:
                            continue
                        
                        # Get representative ligand atom from ring (with bounds check)
                        if ring_atom_indices and ring_atom_indices[0] < len(ligand_atoms):
                            ligand_atom_name = ligand_atoms[ring_atom_indices[0]].get_name()
                        else:
                            ligand_atom_name = 'aromatic_ring'
                        
                        interactions.append({
                            'type': 'pi_stacking',
                            'protein_residue': get_residue_name(first_atom),
                            'protein_atom': 'aromatic_ring',
                            'ligand_atom': ligand_atom_name,
                            'distance': round(float(distance), 2)
                        })
            
            return interactions
    
    # Fallback: Simplified implementation (distance to all ligand atoms)
    for residue in protein_residues:
        if not is_aromatic_residue(residue):
            continue
        
        ring_center = get_aromatic_ring_center(residue)
        if ring_center is None:
            continue
        
        for l_atom in ligand_atoms:
            distance = np.linalg.norm(ring_center - l_atom.get_coord())
            
            if distance <= params['max_dist']:
                first_atom = _get_first_atom(residue)
                if first_atom is None:
                    continue
                
                interactions.append({
                    'type': 'pi_stacking',
                    'protein_residue': get_residue_name(first_atom),
                    'protein_atom': 'aromatic_ring',
                    'ligand_atom': l_atom.get_name(),
                    'distance': round(float(distance), 2)
                })
    
    return interactions


def detect_cation_pi(protein_residues: List[Residue], ligand_atoms: List[Atom], ligand_file: str = None, pose_number: int = 1) -> List[Dict]:
    """
    Detect cation-pi interactions.
    
    Uses RDKit for proper cation detection if available.
    Falls back to simplified nitrogen-based detection otherwise.
    """
    interactions = []
    params = INTERACTION_PARAMS['cation_pi']
    
    # Try RDKit-based detection first
    if RDKIT_AVAILABLE and ligand_file:
        mol = _parse_ligand_with_rdkit(ligand_file, pose_number)
        charged_atoms = _get_ligand_charged_atoms(mol, ligand_atoms)
        ligand_cation_indices = charged_atoms.get('positive', [])
        
        if mol is not None:
            # Check protein aromatic - ligand cation
            for residue in protein_residues:
                if not is_aromatic_residue(residue):
                    continue
                
                ring_center = get_aromatic_ring_center(residue)
                if ring_center is None:
                    continue
                
                # Only check positively charged ligand atoms
                for cation_idx in ligand_cation_indices:
                    if cation_idx < len(ligand_atoms):
                        l_atom = ligand_atoms[cation_idx]
                        distance = np.linalg.norm(ring_center - l_atom.get_coord())
                        
                        if distance <= params['max_dist']:
                            first_atom = _get_first_atom(residue)
                            if first_atom is None:
                                continue
                            
                            interactions.append({
                                'type': 'cation_pi',
                                'protein_residue': get_residue_name(first_atom),
                                'protein_atom': 'aromatic_ring',
                                'ligand_atom': l_atom.get_name(),
                                'distance': round(float(distance), 2),
                                'cation': 'ligand'
                            })
            
            # Check protein cation - ligand aromatic (if ligand has aromatic rings)
            ligand_aromatic_rings = _get_ligand_aromatic_rings(mol, ligand_atoms)
            
            for residue in protein_residues:
                if not is_positive_residue(residue):
                    continue
                
                # Get cationic atoms
                cation_atoms = []
                if residue.get_resname() == 'ARG':
                    cation_atoms = [a for a in residue if a.get_name() in ['NH1', 'NH2']]
                elif residue.get_resname() == 'LYS':
                    cation_atoms = [a for a in residue if a.get_name() == 'NZ']
                
                for p_atom in cation_atoms:
                    for ligand_ring_center, ring_atom_indices in ligand_aromatic_rings:
                        distance = np.linalg.norm(p_atom.get_coord() - ligand_ring_center)
                        
                        if distance <= params['max_dist']:
                            # Get ligand atom name with bounds check
                            if ring_atom_indices and ring_atom_indices[0] < len(ligand_atoms):
                                ligand_atom_name = ligand_atoms[ring_atom_indices[0]].get_name()
                            else:
                                ligand_atom_name = 'aromatic_ring'
                            
                            interactions.append({
                                'type': 'cation_pi',
                                'protein_residue': get_residue_name(p_atom),
                                'protein_atom': p_atom.get_name(),
                                'ligand_atom': ligand_atom_name,
                                'distance': round(float(distance), 2),
                                'cation': 'protein'
                            })
            
            return interactions
    
    # Fallback: Simplified implementation (assumes all N are cationic)
    # Check protein aromatic - ligand cation
    for residue in protein_residues:
        if not is_aromatic_residue(residue):
            continue
        
        ring_center = get_aromatic_ring_center(residue)
        if ring_center is None:
            continue
        
        # Check distance to ligand atoms (simplified - should identify cationic centers)
        for l_atom in ligand_atoms:
            l_elem = _get_element_safe(l_atom)
            if l_elem != 'N':  # Simplified: assume N can be cationic
                continue
            
            distance = np.linalg.norm(ring_center - l_atom.get_coord())
            
            if distance <= params['max_dist']:
                # Safely get first atom for residue name
                first_atom = _get_first_atom(residue)
                if first_atom is None:
                    continue
                
                interactions.append({
                    'type': 'cation_pi',
                    'protein_residue': get_residue_name(first_atom),
                    'protein_atom': 'aromatic_ring',
                    'ligand_atom': l_atom.get_name(),
                    'distance': round(float(distance), 2),
                    'cation': 'ligand'
                })
    
    # Check protein cation - ligand aromatic (simplified)
    for residue in protein_residues:
        if not is_positive_residue(residue):
            continue
        
        # Get cationic atoms
        cation_atoms = []
        if residue.get_resname() == 'ARG':
            cation_atoms = [a for a in residue if a.get_name() in ['NH1', 'NH2']]
        elif residue.get_resname() == 'LYS':
            cation_atoms = [a for a in residue if a.get_name() == 'NZ']
        
        for p_atom in cation_atoms:
            for l_atom in ligand_atoms:
                distance = p_atom - l_atom
                
                if distance <= params['max_dist']:
                    interactions.append({
                        'type': 'cation_pi',
                        'protein_residue': get_residue_name(p_atom),
                        'protein_atom': p_atom.get_name(),
                        'ligand_atom': l_atom.get_name(),
                        'distance': round(float(distance), 2),
                        'cation': 'protein'
                    })
    
    return interactions


def analyze_interactions(protein_file: str, ligand_file: str, pose_number: int = 1) -> Dict:
    """
    Main function to analyze all protein-ligand interactions.
    
    Args:
        protein_file: Path to protein PDBQT file
        ligand_file: Path to ligand PDBQT file (docking output)
        pose_number: Which pose to analyze (1-based)
    
    Returns:
        Dictionary with interactions, summary, and contact residues
    
    Raises:
        FileNotFoundError: If protein or ligand file doesn't exist
        ValueError: If requested pose number doesn't exist
        Exception: For other parsing or analysis errors
    """
    # Validate file existence first
    protein_path = Path(protein_file)
    ligand_path = Path(ligand_file)
    
    if not protein_path.exists():
        raise FileNotFoundError(f"Protein file not found: {protein_file}")
    if not ligand_path.exists():
        raise FileNotFoundError(f"Ligand file not found: {ligand_file}")
    
    parser = PDBParser(QUIET=True)
    
    # Load protein structure
    try:
        protein_structure = parser.get_structure('protein', protein_file)
        protein_atoms = list(Selection.unfold_entities(protein_structure, 'A'))
        protein_residues = list(Selection.unfold_entities(protein_structure, 'R'))
    except Exception as e:
        raise Exception(f"Error parsing protein file: {str(e)}")
    
    # Load ligand structure (extract specific pose)
    try:
        ligand_structure = parser.get_structure('ligand', ligand_file)
        
        # Get the specific model (pose)
        models = list(ligand_structure.get_models())
        if len(models) == 0:
            raise Exception("No models found in ligand file")
        
        # Validate pose number
        if pose_number > len(models):
            raise ValueError(
                f"Requested pose {pose_number} but only {len(models)} pose(s) available in ligand file"
            )
        if pose_number < 1:
            raise ValueError(f"Pose number must be >= 1, got {pose_number}")
        
        ligand_model = models[pose_number - 1]
        ligand_atoms = list(Selection.unfold_entities(ligand_model, 'A'))
        
        if len(ligand_atoms) == 0:
            raise Exception("No atoms found in ligand model")
            
    except ValueError:
        # Re-raise ValueError (pose validation)
        raise
    except Exception as e:
        raise Exception(f"Error parsing ligand file: {str(e)}")
    
    # Detect all interaction types
    try:
        # Hydrogen bonds
        h_bonds = detect_hydrogen_bonds(protein_atoms, ligand_atoms)
        
        # Hydrophobic interactions
        hydrophobic = detect_hydrophobic_interactions(protein_atoms, ligand_atoms)
        
        # Halogen bonds
        halogen = detect_halogen_bonds(protein_atoms, ligand_atoms)
        
        # Ionic interactions (with RDKit charge detection if available)
        ionic = detect_ionic_interactions(protein_residues, ligand_atoms, ligand_file, pose_number)
        
        # Pi-stacking (with RDKit aromatic detection if available)
        pi_stack = detect_pi_stacking(protein_residues, ligand_atoms, ligand_file, pose_number)
        
        # Cation-pi (with RDKit charge detection if available)
        cation_pi = detect_cation_pi(protein_residues, ligand_atoms, ligand_file, pose_number)
        
        all_interactions = h_bonds + hydrophobic + halogen + ionic + pi_stack + cation_pi
        
    except Exception as e:
        raise Exception(f"Error detecting interactions: {str(e)}")
    
    # Create summary
    summary = {
        'hydrogen_bonds': len(h_bonds),
        'hydrophobic': len(hydrophobic),
        'halogen_bonds': len(halogen),
        'ionic': len(ionic),
        'pi_stacking': len(pi_stack),
        'cation_pi': len(cation_pi),
        'total': len(all_interactions)
    }
    
    # Get contact residues (residues with any interaction)
    contact_residues = set()
    for interaction in all_interactions:
        contact_residues.add(interaction['protein_residue'])
    
    return {
        'pose': pose_number,
        'interactions': all_interactions,
        'summary': summary,
        'contact_residues': sorted(list(contact_residues))
    }


def get_interaction_summary_all_poses(protein_file: str, ligand_file: str, num_poses: int = 9) -> List[Dict]:
    """
    Analyze interactions for all poses in a docking result.
    
    Args:
        protein_file: Path to protein PDBQT file
        ligand_file: Path to ligand PDBQT file with multiple poses
        num_poses: Number of poses to analyze
    
    Returns:
        List of interaction summaries, one per pose
    """
    # Validate num_poses
    if num_poses < 1:
        raise ValueError(f"num_poses must be >= 1, got {num_poses}")
    
    summaries = []
    
    for pose_num in range(1, num_poses + 1):
        try:
            result = analyze_interactions(protein_file, ligand_file, pose_num)
            summaries.append({
                'pose': pose_num,
                'summary': result['summary'],
                'num_contacts': len(result['contact_residues'])
            })
        except Exception as e:
            print(f"Error analyzing pose {pose_num}: {e}")
            continue
    
    return summaries
