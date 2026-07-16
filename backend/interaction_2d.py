"""
interaction_2d.py
==================
SaliDock 2D protein-ligand interaction diagram renderer.

Rebuilt to integrate the new fanning origin, angle-sorted relaxation layout,
one-line-per-residue grouping, and Discovery Studio style visual node coloring,
while maintaining full compatibility with the existing PDB parsing and distance-based
interaction detection backend logic.

Public API:
-----------
    parse_pdb(...)
    detect(...)
    render_svg(...)
"""

from __future__ import annotations

import math
import re
import pathlib
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple

from rdkit import Chem
from rdkit.Chem import rdDepictor, AllChem
from rdkit.Chem.Draw import rdMolDraw2D
rdDepictor.SetPreferCoordGen(True)

import logging
_log = logging.getLogger(__name__)

try:
    from rdkit.Chem import rdCoordGen
    _HAS_COORDGEN = True
except ImportError:
    _HAS_COORDGEN = False


# =============================================================================
# CONSTANTS & CONFIGURATION
# =============================================================================

# Literature-grounded per-type distance cutoffs (Angstrom).
HBOND_CUTOFF            = 3.5    # heavy-atom donor-acceptor (Baker & Hubbard 1984)
HYDROPHOBIC_CUTOFF      = 3.6    # C-C non-aromatic hydrophobic contact
PI_STACK_CUTOFF         = 5.5    # ring centroid-to-centroid (Hunter & Sanders 1990)
PI_CATION_CUTOFF        = 6.0    # cation-to-ring centroid
SALT_BRIDGE_CUTOFF      = 4.0    # strict ionic pair: full charge transfer geometry
ATTRACTIVE_CHARGE_CUTOFF= 5.5   # weaker long-range electrostatic (Barlow & Thornton 1983)
HALOGEN_CUTOFF          = 3.5    # halogen-bond donor to acceptor
PI_ALKYL_CUTOFF         = 4.2    # ring centroid to sp3 C
VDW_CUTOFF              = 4.5    # context shell — any heavy atom pair within this range
UNFAVORABLE_CUTOFF      = 4.5    # same-sign charged proximity
PI_SIGMA_CUTOFF         = 4.5    # ring centroid to sp3 C above ring plane
PI_SULFUR_CUTOFF        = 6.0    # ring centroid to MET SD / CYS SG
# C–H···O/N bond geometric criteria (Desiraju & Steiner 1999)
CH_BOND_CUTOFF_HA       = 3.8    # H···acceptor heavy-atom distance
CH_BOND_CUTOFF_CA       = 4.0    # C···acceptor distance
CH_BOND_ANGLE_MIN       = 120.0  # C–H···A angle (degrees)

# van der Waals radii for common elements (Angstrom)
VDW_RADII = {
    "C": 1.70, "N": 1.55, "O": 1.52, "S": 1.80, "P": 1.80,
    "F": 1.47, "CL": 1.75, "BR": 1.85, "I": 1.98, "H": 1.20,
    "ZN": 1.39, "FE": 1.56, "MG": 1.73, "CA": 1.97, "MN": 1.61,
}

DISTANCE_CUTOFFS = {
    "metal_acceptor":    3.0,
    "hbond":             HBOND_CUTOFF,
    "ch_bond":           CH_BOND_CUTOFF_CA,
    "saltbridge":        SALT_BRIDGE_CUTOFF,
    "attractive_charge": ATTRACTIVE_CHARGE_CUTOFF,
    "unfavorable":       UNFAVORABLE_CUTOFF,
    "pi_stacking":       PI_STACK_CUTOFF,
    "pi_tshaped":        PI_STACK_CUTOFF,
    "pi_cation":         PI_CATION_CUTOFF,
    "pi_alkyl":          PI_ALKYL_CUTOFF,
    "pi_sigma":          PI_SIGMA_CUTOFF,
    "pi_sulfur":         PI_SULFUR_CUTOFF,
    "alkyl":             HYDROPHOBIC_CUTOFF,
    "halogen":           HALOGEN_CUTOFF,
    "van_der_waals":     VDW_CUTOFF,
}

POLAR_ELEMENTS   = {"N", "O", "S", "F"}
CARBON           = "C"
HALOGEN_ELEMENTS = {"CL", "BR", "I"}   # uppercase — we capitalise element on parse

# Residues with aromatic rings — used for π-stacking and π-cation detection
AROMATIC_RESIDUES = {"PHE", "TYR", "TRP", "HIS"}

# Exact atom names forming the aromatic ring per residue (standard PDB naming)
AROMATIC_RING_ATOMS = {
    "PHE": {"CG", "CD1", "CD2", "CE1", "CE2", "CZ"},
    "TYR": {"CG", "CD1", "CD2", "CE1", "CE2", "CZ"},
    "TRP": {"CG", "CD1", "CD2", "NE1", "CE2", "CE3", "CZ2", "CZ3", "CH2"},
    "HIS": {"CG", "ND1", "CD2", "CE1", "NE2"},
}

# Negatively charged residues — Asp and Glu (carboxylate oxygens)
NEG_CHARGED_RESIDUES = {"ASP", "GLU"}
# Positively charged residues — Lys (NZ), Arg (NH1/NH2/NE), His (ND1/NE2)
POS_CHARGED_RESIDUES = {"LYS", "ARG", "HIS"}

# Atom names that carry the charge in each residue
NEG_CHARGE_ATOMS = {
    "ASP": {"OD1", "OD2"},
    "GLU": {"OE1", "OE2"},
}
POS_CHARGE_ATOMS = {
    "LYS": {"NZ"},
    "ARG": {"NH1", "NH2", "NE"},
    "HIS": {"ND1", "NE2"},
}

# Ligand residue names Salidock uses in its output PDB files
LIGAND_RESNAMES = {"UNL", "UNK", "LIG"}

# Normalise loosely-named incoming interaction types onto a canonical set.
TYPE_ALIASES = {
    "hbond": "hbond", "hydrogenbond": "hbond", "h-bond": "hbond",
    "hbond_donor": "hbond", "hbond_acceptor": "hbond",
    "ch_bond": "ch_bond", "c_h_bond": "ch_bond", "carbon_hydrogen": "ch_bond",
    "saltbridge": "saltbridge", "salt_bridge": "saltbridge", "ionic": "saltbridge",
    "attractive_charge": "attractive_charge", "attractive charge": "attractive_charge",
    "electrostatic": "attractive_charge",
    "unfavorable": "unfavorable", "clash": "unfavorable",
    "pistacking": "pi_stacking", "pi_stacking": "pi_stacking", "pi-pi": "pi_stacking",
    "pistack": "pi_stacking",
    "pi_tshaped": "pi_tshaped", "pi_t_shaped": "pi_tshaped",
    "picat": "pi_cation", "pi_cation": "pi_cation", "pi-cation": "pi_cation",
    "pication": "pi_cation", "cation_pi": "pi_cation",
    "pialkyl": "pi_alkyl", "pi_alkyl": "pi_alkyl", "pi-alkyl": "pi_alkyl",
    "pi_sigma": "pi_sigma", "pisigma": "pi_sigma",
    "pi_sulfur": "pi_sulfur", "pisulfur": "pi_sulfur",
    "alkyl": "alkyl",
    "hydrophobic": "alkyl", "hydrophobic_contact": "alkyl",
    "van_der_waals": "van_der_waals", "vdw": "van_der_waals",
    "halogen": "halogen", "halogenbond": "halogen", "halogen_bond": "halogen",
    "metal_acceptor": "metal_acceptor", "metal": "metal_acceptor",
}

# Highest priority first: determines which interaction "wins" the node color
# when a residue forms more than one type of contact with the ligand.
# Scientific basis: stronger/more specific interactions take precedence.
TYPE_PRIORITY = [
    "metal_acceptor",   # coordination bond — highest energy
    "unfavorable",      # same-sign clash — shown prominently as warning
    "hbond",            # directional H-bond (2–7 kcal/mol)
    "ch_bond",          # weak C-H hydrogen bond (0.5–1.5 kcal/mol)
    "saltbridge",       # full ionic pair ≤4.0 Å (5–10 kcal/mol)
    "attractive_charge",# long-range electrostatic 4.0–5.5 Å
    "pi_stacking",      # face-to-face π-π (2–3 kcal/mol)
    "pi_tshaped",       # edge-to-face π-π (1–2 kcal/mol)
    "pi_cation",        # cation-π (2–5 kcal/mol)
    "pi_sigma",         # CH-π / σ-π (0.5–1.5 kcal/mol)
    "pi_sulfur",        # S-π (1–2 kcal/mol)
    "pi_alkyl",         # alkyl-π
    "halogen",          # halogen bond (1–3 kcal/mol)
    "alkyl",            # hydrophobic C-C
    "van_der_waals",    # context shell (weakest — no line drawn)
]

TYPE_LABELS = {
    "metal_acceptor":    "Metal-Acceptor",
    "unfavorable":       "Unfavorable",
    "hbond":             "Hydrogen Bond",
    "ch_bond":           "C-H Bond",
    "saltbridge":        "Salt Bridge",
    "attractive_charge": "Attractive Charge",
    "pi_stacking":       "Pi-Pi Stacked",
    "pi_tshaped":        "Pi-Pi T-shaped",
    "pi_cation":         "Pi-Cation",
    "pi_sigma":          "Pi-Sigma",
    "pi_sulfur":         "Pi-Sulfur",
    "pi_alkyl":          "Pi-Alkyl",
    "alkyl":             "Alkyl",
    "van_der_waals":     "Van der Waals",
    "halogen":           "Halogen Bond",
}

# node fill / stroke / text — Discovery-Studio-style palette
NODE_COLORS = {
    "metal_acceptor":    {"fill": "#E0E0E0", "stroke": "#757575", "text": "#212121"},
    "unfavorable":       {"fill": "#EF5350", "stroke": "#C62828", "text": "#FFFFFF"},
    "hbond":             {"fill": "#2FB35A", "stroke": "#1D8A3F", "text": "#0B3B18"},
    "ch_bond":           {"fill": "#87CEEB", "stroke": "#4682B4", "text": "#1A3A5C"},
    "saltbridge":        {"fill": "#F57C00", "stroke": "#E65100", "text": "#3E2800"},
    "attractive_charge": {"fill": "#FF8C00", "stroke": "#B85C00", "text": "#4A2000"},
    "pi_stacking":       {"fill": "#9B59B6", "stroke": "#6C3483", "text": "#33163E"},
    "pi_tshaped":        {"fill": "#7E57C2", "stroke": "#512DA8", "text": "#FFFFFF"},
    "pi_cation":         {"fill": "#F39C12", "stroke": "#B7770D", "text": "#4A2E00"},
    "pi_sigma":          {"fill": "#AB47BC", "stroke": "#7B1FA2", "text": "#FFFFFF"},
    "pi_sulfur":         {"fill": "#C0CA33", "stroke": "#9E9D24", "text": "#33331A"},
    "pi_alkyl":          {"fill": "#F48FB1", "stroke": "#C2185B", "text": "#5C0A28"},
    "alkyl":             {"fill": "#CE93D8", "stroke": "#7B1FA2", "text": "#3A0F4C"},
    "van_der_waals":     {"fill": "#B0BEC5", "stroke": "#607D8B", "text": "#263238"},
    "halogen":           {"fill": "#26C6DA", "stroke": "#00838F", "text": "#053238"},
}

LINE_STYLE = 'stroke="#9AA0A6" stroke-width="1.3" stroke-dasharray="5,3" fill="none"'

# Canvas layout parameters
CANVAS_W = 1100
CANVAS_H = 900
LIGAND_BOX = 400                 # nested RDKit drawer canvas size (px)
LIGAND_CENTER = (420.0, 430.0)   # center of the ligand depiction on the main canvas
LIGAND_BOX_OFFSET = (
    LIGAND_CENTER[0] - LIGAND_BOX / 2.0,
    LIGAND_CENTER[1] - LIGAND_BOX / 2.0,
)
ELLIPSE_RX = 310.0               # residue node ellipse radii
ELLIPSE_RY = 275.0
MIN_ANGLE_SEP = 0.30             # radians, minimum angular gap between nodes
CLUSTER_OFFSET_RADIUS = 6.0      # px, fan-out radius for shared-atom origins
CLUSTER_THRESHOLD = 3            # min interactions at one atom before fanning
NODE_RADIUS = 24.0
LINE_SHORTEN_START = 3.0         # px pulled back from ligand-side anchor
LINE_SHORTEN_END = 28.0          # px pulled back from node center

LEGEND_X = 740
LEGEND_Y0 = 76
LEGEND_ROW_H = 26
FONT_FAMILY = "'Helvetica Neue', Helvetica, Arial, sans-serif"


# --------------------------------------------------------------------------
# Data structures
# --------------------------------------------------------------------------

@dataclass
class ResidueGroup:
    key: str
    resname: str
    resid: int
    chain: str
    label: str
    interactions: list = field(default_factory=list)
    primary_type: str = "van_der_waals"
    min_dist: float = 999.0
    target_x: float = 0.0
    target_y: float = 0.0
    origin_x: float = 0.0
    origin_y: float = 0.0
    node_x: float = 0.0
    node_y: float = 0.0
    angle: float = 0.0
    orig_x: float = 0.0
    orig_y: float = 0.0
    fx: float = 0.0
    fy: float = 0.0
    dummy_atom_idx: int = -1
    target_atoms: list[int] = field(default_factory=list)
    # Van der Waals context-shell nodes are shown without a connecting line
    # (matches Discovery Studio convention: context shell = node only)
    draw_line: bool = True
    all_types: set = field(default_factory=set)


# --------------------------------------------------------------------------
# FIX 5 — TEMPLATE-GUIDED BOND ORDER ASSIGNMENT
# --------------------------------------------------------------------------

def load_template_molecule(path: str) -> Optional[Chem.Mol]:
    import os
    if not path or not os.path.exists(path):
        return None
    
    # Try SDF first
    try:
        mol = Chem.MolFromMolFile(path, sanitize=False, removeHs=False)
        if mol is not None:
            return mol
    except:
        pass
        
    # Try PDB
    try:
        mol = Chem.MolFromPDBFile(path, removeHs=False, sanitize=False)
        if mol is not None:
            return mol
    except:
        pass
        
    # Try Mol2
    try:
        mol = Chem.MolFromMol2File(path, sanitize=False, removeHs=False)
        if mol is not None:
            return mol
    except:
        pass
        
    # Try parsing as SMILES (if it is a small text file containing SMILES)
    try:
        with open(path, 'r') as f:
            content = f.read().strip().split()[0]
        mol = Chem.MolFromSmiles(content)
        if mol is not None:
            return mol
    except:
        pass
        
    return None

def load_ligand_with_correct_bonds(complex_pdb_path: str, original_sdf_path: str):
    import tempfile, os
    ligand_lines = []
    with open(complex_pdb_path) as f:
        for line in f:
            rec = line[:6].strip()
            if rec == 'HETATM':
                resname = line[17:20].strip()
                if resname not in ('HOH', 'WAT', 'H2O'):
                    ligand_lines.append(line)
    if not ligand_lines:
        _log.warning('No ligand HETATM records found in complex PDB')
        return None

    tmp = tempfile.NamedTemporaryFile(suffix='.pdb', delete=False, mode='w')
    tmp.writelines(ligand_lines)
    tmp.write('END\n')
    tmp.close()

    try:
        # ── Strategy 1: Kekulized template ──
        try:
            template = load_template_molecule(original_sdf_path)
            if template is not None:
                Chem.SanitizeMol(
                    template,
                    Chem.SanitizeFlags.SANITIZE_ALL ^ Chem.SanitizeFlags.SANITIZE_PROPERTIES
                )
                Chem.Kekulize(template, clearAromaticFlags=True)
                template = Chem.RemoveHs(template, sanitize=False)
                raw_mol = Chem.MolFromPDBFile(tmp.name, removeHs=True, sanitize=False)
                if raw_mol is not None:
                    mol_with_bonds = AllChem.AssignBondOrdersFromTemplate(template, raw_mol)
                    Chem.SanitizeMol(mol_with_bonds)
                    _log.info('Bond orders assigned via Strategy 1 (Kekulized template)')
                    return mol_with_bonds
        except Exception as e1:
            _log.debug(f'Strategy 1 failed ({e1}), trying Strategy 2')

        # ── Strategy 2: SMILES round-trip ──
        try:
            tmpl_raw = load_template_molecule(original_sdf_path)
            if tmpl_raw is not None:
                Chem.SanitizeMol(
                    tmpl_raw,
                    Chem.SanitizeFlags.SANITIZE_ALL ^ Chem.SanitizeFlags.SANITIZE_PROPERTIES
                )
                smiles = Chem.MolToSmiles(tmpl_raw, canonical=True)
                if smiles:
                    smiles_mol = Chem.MolFromSmiles(smiles)
                    if smiles_mol is not None:
                        raw_mol = Chem.MolFromPDBFile(tmp.name, removeHs=True, sanitize=False)
                        if raw_mol is not None and raw_mol.GetNumAtoms() == smiles_mol.GetNumAtoms():
                            conf = raw_mol.GetConformer()
                            new_conf = Chem.Conformer(smiles_mol.GetNumAtoms())
                            for i in range(smiles_mol.GetNumAtoms()):
                                pos = conf.GetAtomPosition(i)
                                new_conf.SetAtomPosition(i, pos)
                            smiles_mol = Chem.RWMol(smiles_mol)
                            smiles_mol.AddConformer(new_conf, assignId=True)
                            smiles_mol = smiles_mol.GetMol()
                            _log.info('Bond orders assigned via Strategy 2 (SMILES round-trip)')
                            return smiles_mol
        except Exception as e2:
            _log.debug(f'Strategy 2 failed ({e2}), falling back to raw PDB parse')
            
        # ── Strategy 3: Raw PDB parse fallback ──
        try:
            raw_mol = Chem.MolFromPDBFile(tmp.name, removeHs=True, sanitize=False)
            if raw_mol is not None:
                _log.info('Template match failed; parsed raw ligand PDB directly.')
                return raw_mol
        except Exception as e_raw:
            _log.warning(f'Raw PDB parse of ligand failed: {e_raw}')

        # ── Strategy 4: Load SDF directly (no docked 3D coords, but correct bond orders) ──
        # When RDKit cannot parse the ligand from the PDB file at all (e.g. connectivity
        # issues, unusual atom types), fall back to loading the template SDF/MOL directly.
        # The 2D interaction diagram depiction will still be chemically correct.
        try:
            sdf_mol = load_template_molecule(original_sdf_path)
            if sdf_mol is not None:
                try:
                    Chem.SanitizeMol(sdf_mol)
                except Exception:
                    pass
                sdf_mol = Chem.RemoveHs(sdf_mol)
                # Generate a 2D layout so the ligand can be depicted
                rdDepictor.Compute2DCoords(sdf_mol)
                _log.info('Strategy 4: loaded ligand from SDF directly (no docked 3D coords).')
                return sdf_mol
        except Exception as e4:
            _log.warning(f'Strategy 4 (SDF direct load) failed: {e4}')

        return None
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


# --------------------------------------------------------------------------
# STAGE 1 — PDB PARSER
# --------------------------------------------------------------------------

def parse_pdb(
    pdb_path: str,
    ligand_resname: str = None,
    return_h: bool = False,
) -> Tuple[List[Dict], List[Dict]]:
    """
    Parse a PDB file into protein heavy atoms and ligand heavy atoms.

    If return_h=True, returns a 3-tuple (protein_atoms, ligand_atoms, h_atoms)
    where h_atoms contains all protein H atoms with their bonded-C pre-resolved.
    All existing callers use the default (return_h=False) and receive a 2-tuple.
    """
    protein_atoms = []
    ligand_atoms  = []
    h_atoms       = []   # protein H atoms — only populated when return_h=True
    path = pathlib.Path(pdb_path)
    if not path.exists():
        raise FileNotFoundError(f"PDB file not found: {pdb_path}")

    raw_protein_h: List[Dict] = []   # temp store before bonded-C resolution

    with open(path, "r") as f:
        for line in f:
            rec = line[:6].strip()
            if rec not in ("ATOM", "HETATM"):
                continue

            try:
                aname   = line[12:16].strip()
                resname = line[17:20].strip()
                chain   = line[21].strip() if len(line) > 21 else "A"
                resid   = int(line[22:26].strip())
                x       = float(line[30:38])
                y       = float(line[38:46])
                z       = float(line[46:54])
            except (ValueError, IndexError):
                continue

            elem = line[76:78].strip() if len(line) >= 78 else ""
            if not elem or not elem.isalpha():
                clean = aname.lstrip("0123456789")
                elem  = clean[0].upper() if clean else "C"
            else:
                elem = elem.strip()[0].upper() if elem.strip() else "C"

            atom = {
                "aname":   aname,
                "resname": resname,
                "resid":   resid,
                "chain":   chain,
                "elem":    elem,
                "x": x, "y": y, "z": z,
            }

            if elem == "H":
                if return_h and rec == "ATOM":   # only protein H atoms
                    raw_protein_h.append(atom)
                continue  # always skip from heavy-atom lists

            if rec == "HETATM":
                if ligand_resname:
                    if resname == ligand_resname:
                        ligand_atoms.append(atom)
                else:
                    if resname in LIGAND_RESNAMES:
                        ligand_atoms.append(atom)
            elif rec == "ATOM":
                protein_atoms.append(atom)

    if return_h:
        # Resolve each H atom to its bonded C (nearest heavy protein atom ≤1.15 Å)
        for ha in raw_protein_h:
            best_c = None
            best_d = 1.15
            for pa in protein_atoms:
                if pa["elem"] != "C":
                    continue
                dd = math.sqrt(
                    (ha["x"] - pa["x"]) ** 2 +
                    (ha["y"] - pa["y"]) ** 2 +
                    (ha["z"] - pa["z"]) ** 2
                )
                if dd < best_d:
                    best_d = dd
                    best_c = pa
            if best_c is not None:
                h_atoms.append({**ha, "bonded_c": best_c})
        return protein_atoms, ligand_atoms, h_atoms

    return protein_atoms, ligand_atoms


# --------------------------------------------------------------------------
# STAGE 2 — DETECTOR HELPERS & DETECT()
# --------------------------------------------------------------------------

def parse_metals(pdb_path: str) -> List[Dict]:
    metals = []
    METAL_RESNAMES = {"NI", "MG", "ZN", "FE", "MN", "CA", "CU"}
    try:
        with open(pdb_path, "r") as f:
            for line in f:
                rec = line[:6].strip()
                if rec not in ("ATOM", "HETATM"):
                    continue
                resname = line[17:20].strip().upper()
                if resname in METAL_RESNAMES or (len(line) >= 78 and line[76:78].strip().upper() in METAL_RESNAMES):
                    aname = line[12:16].strip()
                    chain = line[21].strip() if len(line) > 21 else "A"
                    try:
                        resid = int(line[22:26].strip())
                        x     = float(line[30:38])
                        y     = float(line[38:46])
                        z     = float(line[46:54])
                        elem  = line[76:78].strip().upper() if len(line) >= 78 else resname
                        if not elem or not elem.isalpha():
                            elem = resname
                        elem = elem[0] + elem[1:].lower() if len(elem) > 1 else elem.upper()
                        metals.append({
                            "aname": aname,
                            "resname": resname,
                            "resid": resid,
                            "chain": chain,
                            "elem": elem,
                            "x": x, "y": y, "z": z,
                            "is_metal": True
                        })
                    except Exception:
                        continue
    except Exception as e:
        _log.warning(f"Error parsing metals: {e}")
    return metals


def _get_aromatic_ligand_atoms(ligand_atoms: List[Dict]) -> set:
    n = len(ligand_atoms)
    if n == 0:
        return set()
    BOND_CUTOFF = 1.9
    adj = [[] for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            a, b = ligand_atoms[i], ligand_atoms[j]
            d = math.sqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2 + (a["z"] - b["z"]) ** 2)
            if d < BOND_CUTOFF:
                adj[i].append(j)
                adj[j].append(i)

    def find_cycles(target_len):
        cycles = []
        visited_sets = set()
        for start in range(n):
            stack = [(start, [start])]
            while stack:
                node, path = stack.pop()
                if len(path) == target_len:
                    if start in adj[node]:
                        ring = tuple(sorted(path))
                        if ring not in visited_sets:
                            visited_sets.add(ring)
                            cycles.append(path)
                    continue
                if len(path) >= target_len:
                    continue
                for nb in adj[node]:
                    if nb == start and len(path) >= 3:
                        ring = tuple(sorted(path))
                        if ring not in visited_sets:
                            visited_sets.add(ring)
                            cycles.append(path)
                    elif nb not in path:
                        stack.append((nb, path + [nb]))
        return cycles

    aromatic_atoms = set()
    seen_rings = set()
    for ring_size in (6, 5):
        for ring in find_cycles(ring_size):
            key = tuple(sorted(ring))
            if key in seen_rings:
                continue
            seen_rings.add(key)
            ring_atoms = [ligand_atoms[i] for i in ring]
            aromatic_elems = sum(1 for a in ring_atoms if a["elem"] in ("C", "N"))
            if aromatic_elems >= ring_size - 1:
                for idx in ring:
                    aromatic_atoms.add(idx)
    return aromatic_atoms


def _get_ligand_ring_centroids(ligand_atoms: List[Dict]) -> List[tuple]:
    """
    Returns a list of 6-tuples: (cx, cy, cz, nx, ny, nz)
    where (cx,cy,cz) is the ring centroid and (nx,ny,nz) is the unit ring-plane normal.
    """
    n = len(ligand_atoms)
    if n == 0:
        return []
    BOND_CUTOFF = 1.9
    adj = [[] for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            a, b = ligand_atoms[i], ligand_atoms[j]
            d = math.sqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2 + (a["z"] - b["z"]) ** 2)
            if d < BOND_CUTOFF:
                adj[i].append(j)
                adj[j].append(i)

    def find_cycles(target_len):
        cycles = []
        visited_sets = set()
        for start in range(n):
            stack = [(start, [start])]
            while stack:
                node, path = stack.pop()
                if len(path) == target_len:
                    if start in adj[node]:
                        ring = tuple(sorted(path))
                        if ring not in visited_sets:
                            visited_sets.add(ring)
                            cycles.append(path)
                    continue
                if len(path) >= target_len:
                    continue
                for nb in adj[node]:
                    if nb == start and len(path) >= 3:
                        ring = tuple(sorted(path))
                        if ring not in visited_sets:
                            visited_sets.add(ring)
                            cycles.append(path)
                    elif nb not in path:
                        stack.append((nb, path + [nb]))
        return cycles

    def _ring_normal_from_atoms(ring_atom_list):
        """Compute unit normal for a ring via Newell's method (robust across ring sizes)."""
        nx = ny = nz = 0.0
        m = len(ring_atom_list)
        for k in range(m):
            a = ring_atom_list[k]
            b = ring_atom_list[(k + 1) % m]
            nx += (a["y"] - b["y"]) * (a["z"] + b["z"])
            ny += (a["z"] - b["z"]) * (a["x"] + b["x"])
            nz += (a["x"] - b["x"]) * (a["y"] + b["y"])
        mag = math.sqrt(nx * nx + ny * ny + nz * nz)
        if mag < 1e-8:
            return (0.0, 0.0, 1.0)  # degenerate fallback
        return (nx / mag, ny / mag, nz / mag)

    ring_data = []
    seen_rings = set()
    for ring_size in (6, 5):
        for ring in find_cycles(ring_size):
            key = tuple(sorted(ring))
            if key in seen_rings:
                continue
            seen_rings.add(key)
            ring_atoms = [ligand_atoms[i] for i in ring]
            aromatic_elems = sum(1 for a in ring_atoms if a["elem"] in ("C", "N"))
            if aromatic_elems >= ring_size - 1:
                cx = sum(a["x"] for a in ring_atoms) / len(ring_atoms)
                cy = sum(a["y"] for a in ring_atoms) / len(ring_atoms)
                cz = sum(a["z"] for a in ring_atoms) / len(ring_atoms)
                nx, ny, nz = _ring_normal_from_atoms(ring_atoms)
                ring_data.append((cx, cy, cz, nx, ny, nz))
    return ring_data


def detect(
    protein_atoms: List[Dict],
    ligand_atoms:  List[Dict],
    pdb_path:      Optional[str] = None,
    h_atoms:       Optional[List[Dict]] = None,
) -> List[Dict]:
    best: Dict[tuple, Dict] = {}

    def _dist3d(a, b):
        return math.sqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2 + (a["z"] - b["z"]) ** 2)

    def _update(label, itype, resname, resid, chain, dist, lig_atom_idx):
        key = (label, itype)
        if key not in best or dist < best[key]["dist"]:
            best[key] = {
                "type":    itype,
                "resname": resname,
                "resid":   resid,
                "chain":   chain,
                "label":   label,
                "dist":    round(dist, 2),
                "lig_atom_idx": lig_atom_idx,
            }

    aromatic_lig_atoms = _get_aromatic_ligand_atoms(ligand_atoms)

    # ── Salt bridge, H-bonds, alkyl / pi-alkyl, unfavorable, halogen, vdW ──
    for li, la in enumerate(ligand_atoms):
        for pa in protein_atoms:
            d     = _dist3d(la, pa)
            label = f"{pa['resname']} {pa['resid']}"
            l_el  = la["elem"]
            p_el  = pa["elem"]
            p_res = pa["resname"]
            p_aname = pa["aname"]

            is_salt = False

            # ── Strict ionic pair (salt bridge) ≤4.0 Å ──────────────────────
            # Full charge-transfer geometry: guanidinium/ammonium N close to
            # carboxylate O, or anionic O close to protonated N.
            if d <= SALT_BRIDGE_CUTOFF:
                if l_el == "N" and p_res in NEG_CHARGED_RESIDUES and p_aname in NEG_CHARGE_ATOMS.get(p_res, set()):
                    _update(label, "saltbridge", pa["resname"], pa["resid"], pa["chain"], d, li)
                    is_salt = True
                elif l_el == "O" and p_res in POS_CHARGED_RESIDUES and p_aname in POS_CHARGE_ATOMS.get(p_res, set()):
                    _update(label, "saltbridge", pa["resname"], pa["resid"], pa["chain"], d, li)
                    is_salt = True

            # ── Attractive charge (long-range electrostatic) 4.0–5.5 Å ─────
            # Barlow & Thornton (1983): ion pairs up to 6 Å are energetically
            # significant; 4–5.5 Å range captures the second shell.
            elif d <= ATTRACTIVE_CHARGE_CUTOFF:
                if l_el == "N" and p_res in NEG_CHARGED_RESIDUES and p_aname in NEG_CHARGE_ATOMS.get(p_res, set()):
                    _update(label, "attractive_charge", pa["resname"], pa["resid"], pa["chain"], d, li)
                    is_salt = True  # still suppress H-bond for this charged pair
                elif l_el == "O" and p_res in POS_CHARGED_RESIDUES and p_aname in POS_CHARGE_ATOMS.get(p_res, set()):
                    _update(label, "attractive_charge", pa["resname"], pa["resid"], pa["chain"], d, li)
                    is_salt = True

            # H-bond (skip if salt-bridge already fired for this charged pair)
            if (not is_salt and d <= HBOND_CUTOFF and l_el in POLAR_ELEMENTS and p_el in {"N", "O", "S"}):
                _update(label, "hbond", pa["resname"], pa["resid"], pa["chain"], d, li)

            # Unfavorable (same-sign charged proximity)
            if d <= UNFAVORABLE_CUTOFF:
                if l_el == "N" and p_res in POS_CHARGED_RESIDUES and p_aname in POS_CHARGE_ATOMS.get(p_res, set()):
                    _update(label, "unfavorable", pa["resname"], pa["resid"], pa["chain"], d, li)
                elif l_el == "O" and p_res in NEG_CHARGED_RESIDUES and p_aname in NEG_CHARGE_ATOMS.get(p_res, set()):
                    _update(label, "unfavorable", pa["resname"], pa["resid"], pa["chain"], d, li)

            # Alkyl / pi-alkyl
            if l_el == CARBON and p_el == CARBON:
                is_pi_alkyl = False
                if li in aromatic_lig_atoms:
                    is_pi_alkyl = True
                elif p_res in AROMATIC_RESIDUES and p_aname in AROMATIC_RING_ATOMS.get(p_res, set()):
                    is_pi_alkyl = True
                
                if is_pi_alkyl and d <= PI_ALKYL_CUTOFF:
                    _update(label, "pi-alkyl", pa["resname"], pa["resid"], pa["chain"], d, li)
                elif not is_pi_alkyl and d <= HYDROPHOBIC_CUTOFF:
                    _update(label, "alkyl", pa["resname"], pa["resid"], pa["chain"], d, li)

            # Halogen bond
            if d <= HALOGEN_CUTOFF and l_el.upper() in HALOGEN_ELEMENTS and p_el in {"N", "O"}:
                _update(label, "halogen", pa["resname"], pa["resid"], pa["chain"], d, li)

            # Van der Waals catch-all (lowest priority — any heavy-atom pair within vdW sum + 0.5)
            if l_el != "H" and p_el != "H":
                vdw_sum = VDW_RADII.get(l_el, 1.70) + VDW_RADII.get(p_el, 1.70) + 0.5
                if d <= min(vdw_sum, VDW_CUTOFF):
                    _update(label, "van_der_waals", pa["resname"], pa["resid"], pa["chain"], d, li)

    # ── Metal coordination ──
    if pdb_path:
        metals = parse_metals(pdb_path)
        for metal in metals:
            metal_label = f"{metal['elem']} {metal['resid']}"
            for li, la in enumerate(ligand_atoms):
                if la["elem"] in {"O", "N", "S"}:
                    d = _dist3d(la, metal)
                    if d <= 3.0:
                        _update(metal_label, "metal_acceptor", metal["resname"], metal["resid"], metal["chain"], d, li)

    # ── Ring normal helper ──
    def _ring_normal(ring_atoms_list):
        """Compute unit normal vector for a ring from its atom positions."""
        n_atoms = len(ring_atoms_list)
        if n_atoms < 3:
            return None
        # Use first three non-collinear atoms
        p0 = (ring_atoms_list[0]["x"], ring_atoms_list[0]["y"], ring_atoms_list[0]["z"])
        p1 = (ring_atoms_list[1]["x"], ring_atoms_list[1]["y"], ring_atoms_list[1]["z"])
        p2 = (ring_atoms_list[2]["x"], ring_atoms_list[2]["y"], ring_atoms_list[2]["z"])
        v1 = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
        v2 = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
        nx = v1[1] * v2[2] - v1[2] * v2[1]
        ny = v1[2] * v2[0] - v1[0] * v2[2]
        nz = v1[0] * v2[1] - v1[1] * v2[0]
        mag = math.sqrt(nx * nx + ny * ny + nz * nz)
        if mag < 1e-8:
            return None
        return (nx / mag, ny / mag, nz / mag)

    # ── Ligand ring data (centroids + normals) ──
    lig_ring_data = _get_ligand_ring_centroids(ligand_atoms)
    # lig_ring_data: list of (cx, cy, cz, nx, ny, nz)
    if not lig_ring_data and ligand_atoms:
        # No aromatic rings found — use molecular centroid with an arbitrary normal
        cx = sum(a["x"] for a in ligand_atoms) / len(ligand_atoms)
        cy = sum(a["y"] for a in ligand_atoms) / len(ligand_atoms)
        cz = sum(a["z"] for a in ligand_atoms) / len(ligand_atoms)
        lig_ring_data = [(cx, cy, cz, 0.0, 0.0, 1.0)]

    # Convenience: centroid-only list reused in pi-cation (N atoms near ring centroid)
    lig_ring_centroids = [(rd[0], rd[1], rd[2]) for rd in lig_ring_data]

    lig_cationic = [
        (a["x"], a["y"], a["z"])
        for a in ligand_atoms
        if a["elem"] == "N"
    ]

    # ── π-stacking (parallel vs T-shaped), π-cation, π-sulfur, π-sigma ──
    residue_groups: Dict[tuple, list] = {}
    for pa in protein_atoms:
        if pa["resname"] in AROMATIC_RESIDUES:
            key = (pa["resname"], pa["resid"], pa["chain"])
            residue_groups.setdefault(key, []).append(pa)

    for (resname, resid, chain), atoms in residue_groups.items():
        ring_atom_names = AROMATIC_RING_ATOMS.get(resname, set())
        ring_atoms = [a for a in atoms if a["aname"] in ring_atom_names]
        if not ring_atoms:
            continue

        rcx = sum(a["x"] for a in ring_atoms) / len(ring_atoms)
        rcy = sum(a["y"] for a in ring_atoms) / len(ring_atoms)
        rcz = sum(a["z"] for a in ring_atoms) / len(ring_atoms)
        res_normal = _ring_normal(ring_atoms)

        label = f"{resname} {resid}"

        # π-stacking: parallel (0–30°) vs T-shaped (70–90°) via ring-normal dot product
        for lig_rd in lig_ring_data:
            lig_c = lig_rd[:3]
            lig_n = lig_rd[3:6]  # ligand ring normal
            d = math.sqrt((lig_c[0] - rcx)**2 + (lig_c[1] - rcy)**2 + (lig_c[2] - rcz)**2)
            if d <= PI_STACK_CUTOFF:
                closest_idx = min(
                    range(len(ligand_atoms)),
                    key=lambda i: math.sqrt((ligand_atoms[i]["x"] - lig_c[0])**2 + (ligand_atoms[i]["y"] - lig_c[1])**2 + (ligand_atoms[i]["z"] - lig_c[2])**2)
                ) if ligand_atoms else 0

                stack_type = "pistack"  # default: parallel stacked
                if res_normal is not None:
                    # Angle between the two ring normals
                    # dot product = cos(angle between normals)
                    # parallel stacking → normals nearly parallel → |dot| ≈ 1 (angle 0–30°)
                    # T-shaped → normals nearly perpendicular → |dot| ≈ 0 (angle 70–90°)
                    dot = abs(sum(a * b for a, b in zip(lig_n, res_normal)))
                    if dot < 0.5:    # angle > 60° → T-shaped / edge-to-face
                        stack_type = "pi_tshaped"
                    # else: dot >= 0.5 → parallel / tilted-parallel → keep "pistack"
                _update(label, stack_type, resname, resid, chain, d, closest_idx)

        # π-cation
        for lpos in lig_cationic:
            d = math.sqrt((lpos[0] - rcx)**2 + (lpos[1] - rcy)**2 + (lpos[2] - rcz)**2)
            if d <= PI_CATION_CUTOFF:
                closest_idx = min(
                    range(len(ligand_atoms)),
                    key=lambda i: math.sqrt((ligand_atoms[i]["x"] - lpos[0])**2 + (ligand_atoms[i]["y"] - lpos[1])**2 + (ligand_atoms[i]["z"] - lpos[2])**2)
                ) if ligand_atoms else 0
                _update(label, "pication", resname, resid, chain, d, closest_idx)

    # ── π-sulfur (ring centroid to MET SD / CYS SG) ──
    sulfur_atoms = {
        "MET": {"SD"},
        "CYS": {"SG"},
    }
    for pa in protein_atoms:
        if pa["resname"] in sulfur_atoms and pa["aname"] in sulfur_atoms[pa["resname"]]:
            for lig_c in lig_ring_centroids:
                d = math.sqrt((lig_c[0] - pa["x"])**2 + (lig_c[1] - pa["y"])**2 + (lig_c[2] - pa["z"])**2)
                if d <= PI_SULFUR_CUTOFF:
                    label = f"{pa['resname']} {pa['resid']}"
                    closest_idx = min(
                        range(len(ligand_atoms)),
                        key=lambda i: math.sqrt((ligand_atoms[i]["x"] - lig_c[0])**2 + (ligand_atoms[i]["y"] - lig_c[1])**2 + (ligand_atoms[i]["z"] - lig_c[2])**2)
                    ) if ligand_atoms else 0
                    _update(label, "pi_sulfur", pa["resname"], pa["resid"], pa["chain"], d, closest_idx)

    # ── π-sigma (ring centroid near sp3 C, perpendicular to ring plane) ──
    # A π-sigma interaction requires the sp3 C-H bond to point roughly along
    # the ring normal — i.e. the centroid→C vector has a large component
    # along the ring normal (dot product > 0.5, meaning angle < 60°).
    for pa in protein_atoms:
        if pa["elem"] == CARBON:
            # Skip aromatic carbons (those would be pi-alkyl/pi-stacking)
            is_aromatic_prot = (
                pa["resname"] in AROMATIC_RESIDUES
                and pa["aname"] in AROMATIC_RING_ATOMS.get(pa["resname"], set())
            )
            if is_aromatic_prot:
                continue
            for lig_rd in lig_ring_data:
                lig_c = lig_rd[:3]
                lig_n = lig_rd[3:6]  # ligand ring normal
                dx = pa["x"] - lig_c[0]
                dy = pa["y"] - lig_c[1]
                dz = pa["z"] - lig_c[2]
                d = math.sqrt(dx * dx + dy * dy + dz * dz)
                if d <= PI_SIGMA_CUTOFF:
                    # Perpendicularity check: dot(centroid→C unit vector, ring normal)
                    # High dot product means C is above/below the ring plane → π-sigma
                    dot = abs(dx * lig_n[0] + dy * lig_n[1] + dz * lig_n[2]) / (d + 1e-9)
                    if dot > 0.5:  # angle between C-ring_axis and ring normal < 60°
                        label = f"{pa['resname']} {pa['resid']}"
                        closest_idx = min(
                            range(len(ligand_atoms)),
                            key=lambda i: math.sqrt((ligand_atoms[i]["x"] - lig_c[0])**2 + (ligand_atoms[i]["y"] - lig_c[1])**2 + (ligand_atoms[i]["z"] - lig_c[2])**2)
                        ) if ligand_atoms else 0
                        _update(label, "pi_sigma", pa["resname"], pa["resid"], pa["chain"], d, closest_idx)

    # ── C–H···O/N hydrogen bond ───────────────────────────────────────────────
    # Criteria: Desiraju & Steiner (1999) "The Weak Hydrogen Bond"
    # C must be sp3 (non-aromatic), H···acceptor ≤3.8 Å,
    # C···acceptor ≤4.0 Å, C–H···A angle ≥120°.
    if h_atoms:
        for ha in h_atoms:
            bonded_c = ha.get("bonded_c")
            if bonded_c is None:
                continue
            # Only sp3 C: skip aromatic ring carbons
            if (bonded_c["resname"] in AROMATIC_RESIDUES
                    and bonded_c["aname"] in AROMATIC_RING_ATOMS.get(bonded_c["resname"], set())):
                continue
            for li, la in enumerate(ligand_atoms):
                if la["elem"] not in {"N", "O"}:  # only electronegative acceptors
                    continue
                # H···acceptor distance
                d_ha = math.sqrt(
                    (ha["x"] - la["x"]) ** 2 +
                    (ha["y"] - la["y"]) ** 2 +
                    (ha["z"] - la["z"]) ** 2
                )
                if d_ha > CH_BOND_CUTOFF_HA:
                    continue
                # C···acceptor distance
                d_ca = math.sqrt(
                    (bonded_c["x"] - la["x"]) ** 2 +
                    (bonded_c["y"] - la["y"]) ** 2 +
                    (bonded_c["z"] - la["z"]) ** 2
                )
                if d_ca > CH_BOND_CUTOFF_CA:
                    continue
                # C–H···A angle using law of cosines
                # vectors: C→H and H→A
                ch_x = ha["x"] - bonded_c["x"]
                ch_y = ha["y"] - bonded_c["y"]
                ch_z = ha["z"] - bonded_c["z"]
                ha_x = la["x"] - ha["x"]
                ha_y = la["y"] - ha["y"]
                ha_z = la["z"] - ha["z"]
                mag_ch = math.sqrt(ch_x**2 + ch_y**2 + ch_z**2)
                mag_ha = math.sqrt(ha_x**2 + ha_y**2 + ha_z**2)
                if mag_ch < 1e-9 or mag_ha < 1e-9:
                    continue
                cos_angle = (ch_x * ha_x + ch_y * ha_y + ch_z * ha_z) / (mag_ch * mag_ha)
                angle_deg = math.degrees(math.acos(max(-1.0, min(1.0, cos_angle))))
                if angle_deg >= CH_BOND_ANGLE_MIN:
                    label = f"{bonded_c['resname']} {bonded_c['resid']}"
                    _update(label, "ch_bond", bonded_c["resname"], bonded_c["resid"],
                            bonded_c["chain"], d_ca, li)

    type_order = {
        "metal_acceptor": 0,  "unfavorable": 1,
        "hbond": 2,           "ch_bond": 3,
        "saltbridge": 4,      "attractive_charge": 5,
        "halogen": 6,         "pistack": 7,    "pi_tshaped": 8,
        "pication": 9,        "pi_sigma": 10,  "pi_sulfur": 11,
        "pi-alkyl": 12,       "alkyl": 13,     "van_der_waals": 14,
    }
    sorted_vals = sorted(
        best.values(),
        key=lambda x: (type_order.get(x["type"], 99), x["dist"])
    )
    return sorted_vals


# --------------------------------------------------------------------------
# Small geometry helpers for rendering
# --------------------------------------------------------------------------

def _normalize_type(raw_type: str) -> str:
    key = (raw_type or "").strip().lower().replace(" ", "_").replace("-", "_")
    return TYPE_ALIASES.get(key, "van_der_waals")


def _priority_rank(t: str) -> int:
    try:
        return TYPE_PRIORITY.index(t)
    except ValueError:
        return len(TYPE_PRIORITY)


def _shorten(x1, y1, x2, y2, d1=LINE_SHORTEN_START, d2=LINE_SHORTEN_END):
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length < (d1 + d2 + 1e-6):
        mx, my = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        return mx, my, mx, my
    ux, uy = dx / length, dy / length
    nx1, ny1 = x1 + ux * d1, y1 + uy * d1
    nx2, ny2 = x2 - ux * d2, y2 - uy * d2
    return nx1, ny1, nx2, ny2


def _angle_of(cx, cy, x, y) -> float:
    return math.atan2(y - cy, x - cx) % (2 * math.pi)


def _get_residue_score(g: ResidueGroup) -> tuple:
    scores = []
    for it in g.interactions:
        itype = _normalize_type(it.get("type", ""))
        cutoff = DISTANCE_CUTOFFS.get(itype, 5.0)
        norm_dist = (it.get("dist") or 0.0) / cutoff
        rank = _priority_rank(itype)
        scores.append((norm_dist, rank))
    best_score = min(scores, key=lambda s: (s[0], s[1]))
    return (best_score[0], best_score[1], g.min_dist)


def _get_node_radius(n_res: int) -> float:
    val = 23.0 - 0.4 * (n_res - 12)
    return max(15.0, min(23.0, val))


def _esc(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# --------------------------------------------------------------------------
# Ligand depiction (RDKit)
# --------------------------------------------------------------------------

def _depict_ligand(molblock: str, ligand_center: Tuple[float, float]):
    mol = Chem.MolFromMolBlock(molblock, sanitize=True)
    if mol is None:
        mol = Chem.MolFromMolBlock(molblock, sanitize=False)
        if mol is None:
            raise ValueError("Could not parse ligand mol block with RDKit.")
        try:
            Chem.SanitizeMol(mol, sanitizeOps=Chem.SANITIZE_ALL ^ Chem.SANITIZE_KEKULIZE)
        except Exception:
            pass

    if _HAS_COORDGEN:
        try:
            rdCoordGen.AddCoords(mol)
        except Exception:
            from rdkit.Chem import AllChem
            AllChem.Compute2DCoords(mol)
    else:
        from rdkit.Chem import AllChem
        AllChem.Compute2DCoords(mol)

    # Detect aromatic rings for circle overlay drawing
    aromatic_rings = []
    for ring in mol.GetRingInfo().AtomRings():
        if all(mol.GetAtomWithIdx(idx).GetIsAromatic() for idx in ring):
            aromatic_rings.append(ring)

    # Render a copy of the molecule with aromatic bonds set to single order
    draw_mol = Chem.Mol(mol)
    for bond in draw_mol.GetBonds():
        if bond.GetIsAromatic() or bond.GetBondType() == Chem.BondType.AROMATIC:
            bond.SetBondType(Chem.BondType.SINGLE)

    drawer = rdMolDraw2D.MolDraw2DSVG(LIGAND_BOX, LIGAND_BOX)
    opts = drawer.drawOptions()
    opts.bondLineWidth = 1.8
    opts.padding = 0.10
    opts.addStereoAnnotation = False
    opts.clearBackground = True

    # Use standard DrawMolecule on the single-bonded copy
    drawer.DrawMolecule(draw_mol)
    drawer.FinishDrawing()
    raw_svg = drawer.GetDrawingText()

    # Recolor pure black strokes to standard gray (keeps CPK heteroatoms colored)
    raw_svg = re.sub(r"stroke:#000000", "stroke:#7F7F7F", raw_svg)
    raw_svg = re.sub(r"stroke: #000000", "stroke: #7F7F7F", raw_svg)

    ox = ligand_center[0] - LIGAND_BOX / 2.0
    oy = ligand_center[1] - LIGAND_BOX / 2.0
    atom_pos = {}
    for atom in mol.GetAtoms():
        idx = atom.GetIdx()
        pt = drawer.GetDrawCoords(idx)
        atom_pos[idx] = (ox + pt.x, oy + pt.y)

    inner = raw_svg
    inner = re.sub(r"<\?xml[^>]*\?>", "", inner)
    inner = re.sub(r"<!DOCTYPE[^>]*>", "", inner)
    match = re.search(r"<svg[^>]*>(.*)</svg>", inner, flags=re.DOTALL)
    inner_body = match.group(1) if match else inner

    # Strip background rects (handles self-closing and paired tags across RDKit versions)
    inner_body = re.sub(
        r"<rect\\b[^>]*style='[^']*opacity:1\\.0[^']*'[^>]*>\\s*</rect>",
        "", inner_body, flags=re.IGNORECASE | re.DOTALL)
    inner_body = re.sub(r"<rect\\b[^>]*/>", "", inner_body, flags=re.IGNORECASE)

    # Build circle elements for aromatic rings
    circle_elements = []
    for ring in aromatic_rings:
        pts = []
        for idx in ring:
            pts.append(drawer.GetDrawCoords(idx))
        cx_ring = sum(p.x for p in pts) / len(pts)
        cy_ring = sum(p.y for p in pts) / len(pts)
        
        avg_r = sum(math.hypot(p.x - cx_ring, p.y - cy_ring) for p in pts) / len(pts)
        circle_r = avg_r * 0.62
        
        circle_elements.append(
            f'<circle cx="{cx_ring:.2f}" cy="{cy_ring:.2f}" r="{circle_r:.2f}" '
            f'stroke="#7F7F7F" stroke-width="1.3" stroke-dasharray="3,2" fill="none"/>'
        )

    nested_svg = (
        f'<svg x="{ox:.2f}" y="{oy:.2f}" width="{LIGAND_BOX}" height="{LIGAND_BOX}" '
        f'viewBox="0 0 {LIGAND_BOX} {LIGAND_BOX}" overflow="visible">'
        f"{inner_body}"
        f"{''.join(circle_elements)}"
        f"</svg>"
    )
    return nested_svg, atom_pos


# --------------------------------------------------------------------------
# Interaction processing / layout
# --------------------------------------------------------------------------

def _filter_by_distance(interactions: list) -> list:
    kept = []
    for it in interactions:
        itype = _normalize_type(it.get("type", ""))
        dist = it.get("dist")
        cutoff = DISTANCE_CUTOFFS.get(itype, 5.0)
        if dist is None or dist <= cutoff:
            kept.append({**it, "_type": itype})
    return kept


def get_coordinate_transformer(conf_pts, draw_pts):
    n = len(conf_pts)
    if n < 2:
        return lambda cx, cy: (cx, cy)
    
    sum_cx = sum(p.x for p in conf_pts)
    sum_dx = sum(p.x for p in draw_pts)
    sum_cx2 = sum(p.x**2 for p in conf_pts)
    sum_cx_dx = sum(conf_pts[i].x * draw_pts[i].x for i in range(n))
    
    denom_x = n * sum_cx2 - sum_cx**2
    if abs(denom_x) > 1e-5:
        sx = (n * sum_cx_dx - sum_cx * sum_dx) / denom_x
        tx = (sum_dx - sx * sum_cx) / n
    else:
        sx, tx = 1.0, 0.0
        
    sum_cy = sum(p.y for p in conf_pts)
    sum_dy = sum(p.y for p in draw_pts)
    sum_cy2 = sum(p.y**2 for p in conf_pts)
    sum_cy_dy = sum(conf_pts[i].y * draw_pts[i].y for i in range(n))
    
    denom_y = n * sum_cy2 - sum_cy**2
    if abs(denom_y) > 1e-5:
        sy = (n * sum_cy_dy - sum_cy * sum_dy) / denom_y
        ty = (sum_dy - sy * sum_cy) / n
    else:
        sy, ty = 1.0, 0.0
        
    return lambda cx, cy: (sx * cx + tx, sy * cy + ty)


def _relax_overlapping_nodes(
    groups: list[ResidueGroup],
    node_radius: float,
    ligand_centroid: Tuple[float, float] = None,
    ligand_radius: float = 0.0,
):
    padding = 6.0
    max_step = 6.0
    n = len(groups)
    if n < 2:
        return

    lig_exclusion_r = ligand_radius + node_radius + 12.0 if ligand_centroid else 0.0

    # Store original RDKit positions
    for g in groups:
        g.orig_x = g.node_x
        g.orig_y = g.node_y

    for _ in range(150):
        any_overlap = False
        # Initialize forces
        for g in groups:
            g.fx = 0.0
            g.fy = 0.0

        # Repulsive forces between overlapping nodes
        for i in range(n):
            g1 = groups[i]
            for j in range(i + 1, n):
                g2 = groups[j]
                dx = g1.node_x - g2.node_x
                dy = g1.node_y - g2.node_y
                dist = math.hypot(dx, dy) or 0.1
                min_dist = node_radius * 2.0 + padding
                if dist < min_dist:
                    any_overlap = True
                    overlap = min_dist - dist
                    push = 0.35 * overlap
                    fx = (dx / dist) * push
                    fy = (dy / dist) * push
                    g1.fx += fx
                    g1.fy += fy
                    g2.fx -= fx
                    g2.fy -= fy

        # Ligand exclusion zone: push nodes away from ligand centroid
        if ligand_centroid:
            lcx, lcy = ligand_centroid
            for g in groups:
                dx = g.node_x - lcx
                dy = g.node_y - lcy
                dist_to_lig = math.hypot(dx, dy) or 0.1
                if dist_to_lig < lig_exclusion_r:
                    any_overlap = True
                    overlap = lig_exclusion_r - dist_to_lig
                    push = 0.40 * overlap
                    g.fx += (dx / dist_to_lig) * push
                    g.fy += (dy / dist_to_lig) * push

        if not any_overlap:
            break

        # Restoring forces to keep them close to their original RDKit positions
        for g in groups:
            g.fx += -0.15 * (g.node_x - g.orig_x)
            g.fy += -0.15 * (g.node_y - g.orig_y)

        # Apply steps
        for g in groups:
            step = math.hypot(g.fx, g.fy)
            if step > max_step:
                g.fx = (g.fx / step) * max_step
                g.fy = (g.fy / step) * max_step
            g.node_x += g.fx
            g.node_y += g.fy


def _group_by_residue_raw(interactions: list) -> list[ResidueGroup]:
    groups: dict = {}
    for it in interactions:
        resname = it.get("resname", "UNK")
        resid = it.get("resid", 0)
        chain = it.get("chain", "")
        key = f"{chain}:{resname}{resid}"
        if key not in groups:
            groups[key] = ResidueGroup(
                key=key,
                resname=resname,
                resid=resid,
                chain=chain,
                label=it.get("label") or f"{resname} {resid}",
            )
        g = groups[key]
        g.interactions.append(it)
        if it.get("_type"):
            g.all_types.add(it["_type"])
        if it.get("dist") is not None:
            g.min_dist = min(g.min_dist, it["dist"])

    for g in groups.values():
        g.primary_type = min(
            {it["_type"] for it in g.interactions}, key=_priority_rank
        )
        # Van der Waals context shell: show node but suppress the connecting dashed line
        # Scientific basis: vdW contacts are weak, non-directional; the node marks
        # the residue as nearby without implying a specific binding geometry.
        if g.primary_type == "van_der_waals":
            g.draw_line = False
    return list(groups.values())


# --------------------------------------------------------------------------
# SVG drawing
# --------------------------------------------------------------------------

def _draw_line(g: ResidueGroup, node_radius: float) -> str:
    x1, y1, x2, y2 = _shorten(g.origin_x, g.origin_y, g.node_x, g.node_y, d2=node_radius + 8.0)
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" {LINE_STYLE}/>'


def _draw_node(g: ResidueGroup, node_radius: float) -> str:
    colors = NODE_COLORS.get(g.primary_type, NODE_COLORS["van_der_waals"])
    label_top = f"{g.resname}"
    label_bot = f"{g.chain}:{g.resid}"
    
    font_size_top = 10.0 if node_radius >= 20 else (8.5 if node_radius >= 17 else 7.5)
    font_size_bot = 8.5  if node_radius >= 20 else (7.5 if node_radius >= 17 else 6.5)
    y_offset_top = 2 if node_radius >= 20 else 1
    y_offset_bot = 9 if node_radius >= 20 else 7
    
    return f'''
    <g>
      <circle cx="{g.node_x:.1f}" cy="{g.node_y:.1f}" r="{node_radius:.1f}"
              fill="{colors['fill']}" stroke="{colors['stroke']}" stroke-width="1.6"/>
      <text x="{g.node_x:.1f}" y="{g.node_y - y_offset_top:.1f}" fill="{colors['text']}"
            font-family="{FONT_FAMILY}" font-size="{font_size_top:.1f}" font-weight="700"
            text-anchor="middle">{_esc(label_top)}</text>
      <text x="{g.node_x:.1f}" y="{g.node_y + y_offset_bot:.1f}" fill="{colors['text']}"
            font-family="{FONT_FAMILY}" font-size="{font_size_bot:.1f}"
            text-anchor="middle">{_esc(label_bot)}</text>
    </g>'''


def _draw_legend_bottom(
    present_types: set,
    y_start: float,
    x_start: float,
    available_width: float,
    binding_affinity: Optional[float] = None,
) -> Tuple[str, float]:
    """Draw a horizontal legend at the bottom of the diagram. Returns (svg_str, total_height_used)."""
    active_types = [t for t in TYPE_PRIORITY if t in present_types]
    if not active_types:
        return "", 0.0

    swatch_w = 160.0  # width per swatch item
    cols = max(1, int(available_width / swatch_w))
    row_h = 26.0
    y = y_start + 20.0
    items = []

    for idx, t in enumerate(active_types):
        col = idx % cols
        row = idx // cols
        sx = x_start + col * swatch_w
        sy = y + row * row_h
        colors = NODE_COLORS[t]
        items.append(
            f'<circle cx="{sx + 8:.1f}" cy="{sy:.1f}" r="6" fill="{colors["fill"]}" '
            f'stroke="{colors["stroke"]}" stroke-width="1.2"/>'
            f'<text x="{sx + 20:.1f}" y="{sy + 4:.1f}" font-family="{FONT_FAMILY}" '
            f'font-size="11" fill="#333">{_esc(TYPE_LABELS[t])}</text>'
        )

    n_rows = (len(active_types) + cols - 1) // cols
    legend_h = n_rows * row_h + 20.0

    # Affinity panel inline
    aff_svg = ""
    if binding_affinity is not None:
        try:
            aff_val = float(binding_affinity)
            aff_str = f"{aff_val:.3f}"
        except (ValueError, TypeError):
            aff_str = str(binding_affinity)
        aff_y = y + n_rows * row_h + 8.0
        aff_svg = (
            f'<text x="{x_start:.1f}" y="{aff_y:.1f}" font-family="{FONT_FAMILY}" '
            f'font-size="12" fill="#555">Binding Affinity: '
            f'{_esc(aff_str)} kcal/mol</text>'
        )
        legend_h += 22.0

    items_joined = "\n".join(items)
    svg = f'<g>{items_joined}\n{aff_svg}</g>'
    return svg, legend_h


def _error_svg(message: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CANVAS_W}" height="200" '
        f'viewBox="0 0 {CANVAS_W} 200">'
        f'<rect width="100%" height="100%" fill="#FFF5F5"/>'
        f'<text x="30" y="60" font-family="{FONT_FAMILY}" font-size="16" '
        f'fill="#B92B2B" font-weight="700">Interaction diagram could not be rendered</text>'
        f'<text x="30" y="90" font-family="{FONT_FAMILY}" font-size="13" '
        f'fill="#7A1F1F">{_esc(message)}</text>'
        f"</svg>"
    )


# --------------------------------------------------------------------------
# Core rendering engine
# --------------------------------------------------------------------------

def render_svg_new(
    interactions: list,
    molblock: str,
    binding_affinity: Optional[float] = None,
    title: str = "2D Interaction Diagram",
) -> str:
    try:
        filtered = _filter_by_distance(interactions or [])
        
        # 1. Residue cap & significance ranking
        unique_residues = list({(it["chain"], it["resname"], it["resid"]) for it in filtered})
        n_res = len(unique_residues)
        if n_res > 18:
            res_scores = {}
            for r_key in unique_residues:
                chain, resname, resid = r_key
                r_acts = [it for it in filtered if it["chain"] == chain and it["resname"] == resname and it["resid"] == resid]
                scores = []
                min_dist = 999.0
                for it in r_acts:
                    itype = it["_type"]
                    cutoff = DISTANCE_CUTOFFS.get(itype, 5.0)
                    norm_dist = (it.get("dist") or 0.0) / cutoff
                    rank = _priority_rank(itype)
                    scores.append((norm_dist, rank))
                    if it.get("dist") is not None:
                        min_dist = min(min_dist, it["dist"])
                best_score = min(scores, key=lambda s: (s[0], s[1]))
                res_scores[r_key] = (best_score[0], best_score[1], min_dist)
                
            sorted_keys = sorted(unique_residues, key=lambda k: res_scores[k])
            kept_keys = set(sorted_keys[:18])
            filtered = [it for it in filtered if (it["chain"], it["resname"], it["resid"]) in kept_keys]
            n_res = len(kept_keys)

        # 2. Parse ligand molecule
        mol = Chem.MolFromMolBlock(molblock, sanitize=True)
        if mol is None:
            mol = Chem.MolFromMolBlock(molblock, sanitize=False)
            if mol is None:
                raise ValueError("Could not parse ligand mol block with RDKit.")
            try:
                Chem.SanitizeMol(mol, sanitizeOps=Chem.SANITIZE_ALL ^ Chem.SANITIZE_KEKULIZE)
            except Exception:
                pass

        # 3. Raw residue grouping
        groups = _group_by_residue_raw(filtered)

        # 4. Construct augmented molecule with dummy atoms and zero-order bonds
        em = Chem.RWMol(mol)
        for idx, g in enumerate(groups):
            lig_indices = [it["lig_atom_idx"] for it in g.interactions if it.get("lig_atom_idx") is not None]
            if not lig_indices:
                lig_indices = [0]
            
            target_atoms = []
            if g.primary_type in ("pi_stacking", "pi_cation"):
                found_ring = False
                ring_info = mol.GetRingInfo()
                for ring in ring_info.AtomRings():
                    if any(li in ring for li in lig_indices):
                        if all(mol.GetAtomWithIdx(a_idx).GetIsAromatic() for a_idx in ring):
                            target_atoms = list(ring)
                            found_ring = True
                            break
                if not found_ring:
                    target_atoms = [lig_indices[0]]
            else:
                directional = [it for it in g.interactions if it["_type"] in ("hbond", "saltbridge", "halogen", "metal_acceptor")]
                if directional:
                    best_it = min(directional, key=lambda it: it.get("dist", 99))
                    target_atoms = [best_it["lig_atom_idx"]]
                else:
                    target_atoms = [lig_indices[0]]
            
            dummy_idx = em.AddAtom(Chem.Atom(0))
            g.dummy_atom_idx = dummy_idx
            g.target_atoms = target_atoms
            
            for ta in target_atoms:
                em.AddBond(ta, dummy_idx, Chem.BondType.ZERO)

        # 5. Coordinate generation in one pass
        try:
            if _HAS_COORDGEN:
                rdCoordGen.AddCoords(em)
            else:
                AllChem.Compute2DCoords(em)
        except Exception as e:
            _log.warning(f"CoordGen failed: {e}. Falling back to AllChem.")
            try:
                AllChem.Compute2DCoords(em)
            except Exception as e2:
                _log.error(f"AllChem 2D coordinates also failed: {e2}")

        augmented_conf = em.GetConformer()

        # 6. Copy ligand coordinates back and depict original ligand
        lig_conf = Chem.Conformer(mol.GetNumAtoms())
        for i in range(mol.GetNumAtoms()):
            pos = augmented_conf.GetAtomPosition(i)
            lig_conf.SetAtomPosition(i, pos)
        mol.RemoveAllConformers()  # drop the original 3D docking-pose conformer —
                                    # otherwise it stays as conformer id 0 and
                                    # DrawMolecule's default confId=-1 silently
                                    # draws THAT instead of the CoordGen layout below
        mol.AddConformer(lig_conf, assignId=True)

        aromatic_rings = []
        for ring in mol.GetRingInfo().AtomRings():
            if all(mol.GetAtomWithIdx(idx).GetIsAromatic() for idx in ring):
                aromatic_rings.append(ring)
        
        draw_mol = Chem.Mol(mol)
        for bond in draw_mol.GetBonds():
            if bond.GetIsAromatic() or bond.GetBondType() == Chem.BondType.AROMATIC:
                bond.SetBondType(Chem.BondType.SINGLE)

        drawer = rdMolDraw2D.MolDraw2DSVG(LIGAND_BOX, LIGAND_BOX)
        opts = drawer.drawOptions()
        opts.bondLineWidth = 1.8
        opts.padding = 0.10
        opts.addStereoAnnotation = False
        opts.clearBackground = True

        drawer.DrawMolecule(draw_mol)
        drawer.FinishDrawing()
        raw_svg = drawer.GetDrawingText()

        raw_svg = re.sub(r"stroke:#000000", "stroke:#7F7F7F", raw_svg)
        raw_svg = re.sub(r"stroke: #000000", "stroke: #7F7F7F", raw_svg)
        
        inner = raw_svg
        inner = re.sub(r"<\?xml[^>]*\?>", "", inner)
        inner = re.sub(r"<!DOCTYPE[^>]*>", "", inner)
        match = re.search(r"<svg[^>]*>(.*)</svg>", inner, flags=re.DOTALL)
        inner_body = match.group(1) if match else inner

        inner_body = re.sub(
            r"<rect[^>]*\b(class=['\"]background['\"]|fill=['\"]#FFFFFF['\"]|style=['\"][^'\"]*(fill:#FFFFFF|opacity:1\.0)[^'\"]*['\"])[^>]*/?>(\s*</rect>)?",
            "", inner_body, flags=re.IGNORECASE | re.DOTALL
        )

        circle_elements = []
        for ring in aromatic_rings:
            pts = []
            for idx in ring:
                pts.append(drawer.GetDrawCoords(idx))
            cx_ring = sum(p.x for p in pts) / len(pts)
            cy_ring = sum(p.y for p in pts) / len(pts)
            
            avg_r = sum(math.hypot(p.x - cx_ring, p.y - cy_ring) for p in pts) / len(pts)
            circle_r = avg_r * 0.62
            
            circle_elements.append(
                f'<circle cx="{cx_ring:.2f}" cy="{cy_ring:.2f}" r="{circle_r:.2f}" '
                f'stroke="#7F7F7F" stroke-width="1.3" stroke-dasharray="3,2" fill="none"/>'
            )

        nested_ligand_svg = (
            f'<svg x="0.0" y="0.0" width="{LIGAND_BOX}" height="{LIGAND_BOX}" '
            f'viewBox="0 0 {LIGAND_BOX} {LIGAND_BOX}" overflow="visible">'
            f"{inner_body}"
            f"{''.join(circle_elements)}"
            f"</svg>"
        )

        # 7. Coordinate transformation
        conf_pts = [lig_conf.GetAtomPosition(i) for i in range(mol.GetNumAtoms())]
        draw_pts = [drawer.GetDrawCoords(i) for i in range(mol.GetNumAtoms())]
        transform = get_coordinate_transformer(conf_pts, draw_pts)

        for g in groups:
            dummy_pos = augmented_conf.GetAtomPosition(g.dummy_atom_idx)
            g.node_x, g.node_y = transform(dummy_pos.x, dummy_pos.y)
            
            if len(g.target_atoms) > 1:
                centroid_x = sum(augmented_conf.GetAtomPosition(ta).x for ta in g.target_atoms) / len(g.target_atoms)
                centroid_y = sum(augmented_conf.GetAtomPosition(ta).y for ta in g.target_atoms) / len(g.target_atoms)
                g.origin_x, g.origin_y = transform(centroid_x, centroid_y)
            else:
                target_pos = augmented_conf.GetAtomPosition(g.target_atoms[0])
                g.origin_x, g.origin_y = transform(target_pos.x, target_pos.y)

        # 8. Ligand bounding circle for exclusion zone
        lig_cx = sum(pt.x for pt in draw_pts) / max(len(draw_pts), 1)
        lig_cy = sum(pt.y for pt in draw_pts) / max(len(draw_pts), 1)
        lig_max_r = max((math.hypot(pt.x - lig_cx, pt.y - lig_cy) for pt in draw_pts), default=0.0)

        node_radius = _get_node_radius(len(groups))
        _relax_overlapping_nodes(
            groups, node_radius,
            ligand_centroid=(lig_cx, lig_cy),
            ligand_radius=lig_max_r + 10.0,
        )

        # 9. Bounding box & Dynamic viewBox
        n_res = len(groups)
        all_x = []
        all_y = []
        for pt in draw_pts:
            all_x.append(pt.x)
            all_y.append(pt.y)
        for g in groups:
            all_x.extend([g.node_x - node_radius, g.node_x + node_radius])
            all_y.extend([g.node_y - node_radius, g.node_y + node_radius])

        min_x = min(all_x) if all_x else 0.0
        max_x = max(all_x) if all_x else 340.0
        min_y = min(all_y) if all_y else 0.0
        max_y = max(all_y) if all_y else 340.0

        present_types = set()
        for g in groups:
            present_types.update(g.all_types)

        k_pad = 7.0
        extra_pad = k_pad * max(0, n_res - 8)
        padding_left = 60.0 + extra_pad
        padding_right = 60.0 + extra_pad
        padding_top = 90.0 + extra_pad
        padding_bottom = 60.0 + extra_pad

        view_min_x = min_x - padding_left
        view_min_y = min_y - padding_top
        base_view_w = (max_x + padding_right) - view_min_x
        base_view_h = (max_y + padding_bottom) - view_min_y

        # Legend at bottom — compute its height first
        legend_svg, legend_h = _draw_legend_bottom(
            present_types,
            y_start=max_y + padding_bottom,
            x_start=view_min_x + 24,
            available_width=base_view_w - 48,
            binding_affinity=binding_affinity,
        )

        view_h = base_view_h + legend_h + 40
        view_w = base_view_w

        view_box_str = f"{view_min_x:.1f} {view_min_y:.1f} {view_w:.1f} {view_h:.1f}"

        title_svg = f'''
  <text x="{view_min_x + 24:.1f}" y="{view_min_y + 34:.1f}" font-size="17" font-weight="700" fill="#1A1A1A">{_esc(title)}</text>
  <line x1="{view_min_x + 24:.1f}" y1="{view_min_y + 46:.1f}" x2="{view_min_x + view_w - 24:.1f}" y2="{view_min_y + 46:.1f}" stroke="#EEEEEE" stroke-width="1"/>
'''

        # VdW context-shell nodes (draw_line=False) appear without a connecting line —
        # this matches DS convention: nearby residues are shown but not "pointed at".
        lines_svg = "".join(_draw_line(g, node_radius) for g in groups if g.draw_line)
        nodes_svg = "".join(_draw_node(g, node_radius) for g in groups)

        footer_y = view_min_y + view_h - 14
        footer_svg = f'''
  <text x="{view_min_x + 24:.1f}" y="{footer_y:.1f}" font-size="10.5" fill="#9AA0A6">
    Generated by SaliDock &#8226; distance cutoffs applied per interaction type &#8226; {n_res} residues shown
  </text>
'''

        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{view_w:.0f}" height="{view_h:.0f}"
     viewBox="{view_box_str}" font-family="{FONT_FAMILY}">
  <rect x="{view_min_x:.1f}" y="{view_min_y:.1f}" width="{view_w:.1f}" height="{view_h:.1f}" fill="#FFFFFF"/>
  {title_svg}

  <!-- ligand depiction -->
  {nested_ligand_svg}

  <!-- interaction lines -->
  <g>{lines_svg}</g>

  <!-- residue nodes -->
  <g>{nodes_svg}</g>

  <!-- legend (bottom) -->
  {legend_svg}

  {footer_svg}
</svg>'''
        return svg
    except Exception as exc:
        return _error_svg(f"Layout/Render failed: {exc}")


# --------------------------------------------------------------------------
# Adapter wrapper for the old pipeline interface
# --------------------------------------------------------------------------

def render_svg(
    pdb_path:     str,
    interactions: List[Dict],
    affinity:     float = 0.0,
    ligand_resname: str = None,
    original_sdf_path: str = None,
) -> str:
    """
    Adapter wrapper that maps the old render_svg signature onto the new
    RDKit-molblock-based rendering engine.
    """
    import tempfile, os as _os

    mol = None
    is_ligand_only = False
    if original_sdf_path:
        mol = load_ligand_with_correct_bonds(str(pdb_path), original_sdf_path)
        if mol is not None:
            is_ligand_only = True

    if mol is None:
        # Fallback: extract only ligand (HETATM) atoms into a temp file so RDKit
        # never has to parse the huge protein structure — it reliably fails on those.
        _lig_lines = []
        try:
            with open(str(pdb_path)) as _f:
                for _line in _f:
                    _rec = _line[:6].strip()
                    if _rec == 'HETATM':
                        _resname = _line[17:20].strip()
                        if _resname not in ('HOH', 'WAT', 'H2O'):
                            _lig_lines.append(_line)
        except Exception as _e:
            _log.warning(f'Could not extract ligand lines from complex PDB: {_e}')

        if _lig_lines:
            _tmp = tempfile.NamedTemporaryFile(suffix='.pdb', delete=False, mode='w')
            _tmp.writelines(_lig_lines)
            _tmp.write('END\n')
            _tmp.close()
            try:
                mol = Chem.MolFromPDBFile(_tmp.name, removeHs=True, sanitize=False)
                if mol is not None:
                    is_ligand_only = True
                    _log.info('Parsed ligand-only PDB as fallback for render_svg')
            except Exception as _e2:
                _log.warning(f'Ligand-only PDB parse failed: {_e2}')
            finally:
                try:
                    _os.unlink(_tmp.name)
                except Exception:
                    pass

        # Last-resort fallback: load the original SDF directly so we always
        # produce a diagram even if the docked-pose PDB cannot be parsed by RDKit.
        if mol is None and original_sdf_path:
            try:
                _sdf_mol = load_template_molecule(original_sdf_path)
                if _sdf_mol is not None:
                    try:
                        Chem.SanitizeMol(_sdf_mol)
                    except Exception:
                        pass
                    _sdf_mol = Chem.RemoveHs(_sdf_mol)
                    rdDepictor.Compute2DCoords(_sdf_mol)
                    mol = _sdf_mol
                    is_ligand_only = True
                    _log.warning(
                        'render_svg: PDB parse failed — using SDF template directly for 2D layout.'
                    )
            except Exception as _esdf:
                _log.warning(f'render_svg SDF fallback failed: {_esdf}')

        if mol is None:
            return _error_svg("RDKit could not parse the PDB file.")

    try:
        Chem.SanitizeMol(mol)
    except Exception:
        pass

    if is_ligand_only:
        lig_indices = list(range(mol.GetNumAtoms()))
    else:
        auto_resnames = {ligand_resname} if ligand_resname else LIGAND_RESNAMES
        lig_indices = [
            a.GetIdx() for a in mol.GetAtoms()
            if a.GetPDBResidueInfo() and
               a.GetPDBResidueInfo().GetResidueName().strip() in auto_resnames
        ]
        if not lig_indices:
            return _error_svg(f"No ligand atoms found for resnames: {auto_resnames}")

    em = Chem.RWMol(mol)
    for idx in sorted(
        [i for i in range(mol.GetNumAtoms()) if i not in lig_indices],
        reverse=True
    ):
        em.RemoveAtom(idx)

    lig_mol = em.GetMol()
    try:
        Chem.SanitizeMol(lig_mol)
    except Exception:
        pass

    try:
        lig_mol = Chem.RemoveHs(lig_mol)
        Chem.SanitizeMol(lig_mol)
    except Exception:
        pass

    molblock = Chem.MolToMolBlock(lig_mol)
    return render_svg_new(interactions, molblock, binding_affinity=affinity)


def extract_affinity_from_pdb(pdb_path: str) -> float:
    """
    Read the binding affinity from Salidock's PDB REMARK line.
    Salidock writes: REMARK   Binding Affinity: -5.814 kcal/mol

    Returns the float value, or 0.0 if not found.
    """
    try:
        with open(pdb_path, "r") as f:
            for line in f:
                if "Binding Affinity" in line and ":" in line:
                    value_str = line.split(":")[-1].strip()
                    # Remove " kcal/mol" suffix if present
                    value_str = value_str.replace("kcal/mol", "").strip()
                    return float(value_str)
    except (ValueError, FileNotFoundError):
        pass
    return 0.0


__all__ = ["parse_pdb", "detect", "render_svg", "extract_affinity_from_pdb"]
