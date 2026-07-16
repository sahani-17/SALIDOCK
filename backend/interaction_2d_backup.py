"""
interaction_2d.py
=================
Salidock 2D protein-ligand interaction diagram generator.

Three-stage pipeline:
  1. parse_pdb()     — extract atom coordinates from PDB file
  2. detect()        — distance-based interaction detection
  3. render_svg()    — generate publication-quality SVG string

Zero external dependencies beyond RDKit (already installed for ligand prep).
Standard library only for detection: math, pathlib.

Author: Salidock team
"""

import math
import pathlib
from typing import List, Dict, Tuple, Optional

# RDKit — already installed in Salidock's conda environment for ligand preparation
from rdkit import Chem
from rdkit.Chem import rdDepictor, AllChem
rdDepictor.SetPreferCoordGen(True)

import logging
_log = logging.getLogger(__name__)


# =============================================================================
# FIX 5 — TEMPLATE-GUIDED BOND ORDER ASSIGNMENT
# =============================================================================

def load_ligand_with_correct_bonds(complex_pdb_path: str, original_sdf_path: str):
    """
    Extract the ligand from the complex PDB and apply correct bond orders
    from the original SDF template.  Tries three strategies in order:

    Strategy 1 — Kekulized SDF template (handles halogenated aromatics).
      Load template with sanitize=False, partial-sanitise skipping valence
      check, Kekulize to resolve aromatic bonds, then AssignBondOrdersFromTemplate.

    Strategy 2 — SMILES round-trip (handles quaternary N, multi-pattern matches).
      When Strategy 1 fails with "More than one matching pattern" or a valence
      error after the wrong pattern is chosen, derive a canonical SMILES from the
      template and embed the docked 3D coordinates by atom-map matching.  This
      completely avoids AssignBondOrdersFromTemplate and its pattern-matching bugs.

    Strategy 3 — raw PDB parse (existing fallback).
      Returns None so the caller falls back to Chem.MolFromPDBFile.

    Returns an RDKit Mol with correct bond orders and docked 3D coordinates,
    or None if all strategies fail.
    """
    import tempfile, os

    # ── Extract ligand HETATM lines from complex PDB ─────────────────────────
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
        # ── Strategy 1: Kekulized template ───────────────────────────────────
        try:
            template = Chem.MolFromMolFile(
                original_sdf_path, sanitize=False, removeHs=False
            )
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

        # ── Strategy 2: SMILES round-trip ────────────────────────────────────
        # Derive a canonical SMILES from the template SDF (which has correct
        # chemistry) and build an RDKit mol from that.  Then copy the 3D
        # coordinates from the docked pose by matching heavy atoms by index.
        # This completely bypasses AssignBondOrdersFromTemplate and its pattern-
        # matching issues with quaternary nitrogen or ambiguous topologies.
        try:
            # Load template mol for SMILES — use standard sanitisation
            tmpl_raw = Chem.MolFromMolFile(original_sdf_path, sanitize=False, removeHs=True)
            if tmpl_raw is not None:
                Chem.SanitizeMol(
                    tmpl_raw,
                    Chem.SanitizeFlags.SANITIZE_ALL ^ Chem.SanitizeFlags.SANITIZE_PROPERTIES
                )
                # Get canonical SMILES — this encodes correct bond orders + charges
                smiles = Chem.MolToSmiles(tmpl_raw, canonical=True)
                if smiles:
                    smiles_mol = Chem.MolFromSmiles(smiles)
                    if smiles_mol is not None:
                        # Get docked heavy-atom 3D coordinates from PDB
                        raw_mol = Chem.MolFromPDBFile(tmp.name, removeHs=True, sanitize=False)
                        if raw_mol is not None and raw_mol.GetNumAtoms() == smiles_mol.GetNumAtoms():
                            # Copy conformer: assume atom order matches (both heavy-atom only)
                            from rdkit.Chem import AllChem as _AC
                            from rdkit.Geometry import rdGeometry
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

        # ── Strategy 3: raw fallback ─────────────────────────────────────────
        _log.warning(
            'All template strategies failed; falling back to raw PDB parse. '
            'Bond orders in 2D diagram may be approximate.'
        )
        return None

    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass



# =============================================================================
# CONSTANTS — distance cutoffs (Angstroms), standard biochemistry values
# =============================================================================

HBOND_CUTOFF       = 3.5    # heavy-atom donor-acceptor distance, standard H-bond convention
HYDROPHOBIC_CUTOFF = 4.0    # heavy carbon to carbon
PI_STACK_CUTOFF    = 5.5    # ring centroid-to-centroid, standard π-π range
PI_CATION_CUTOFF   = 6.0    # cation to ring centroid, standard range
SALT_BRIDGE_CUTOFF = 4.0    # standard for charged group centroid distance
HALOGEN_CUTOFF     = 3.5    # halogen (Cl/Br/I) on ligand to N/O on protein
PI_ALKYL_CUTOFF    = 4.5    # alkyl carbon to ring centroid, standard range

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

# SVG colour scheme — one colour per interaction type (Discovery Studio colors)
COLORS = {
    # Interaction line colours — DS-inspired
    "hbond":          "#00A859",   # green (Conventional H-Bond)
    "hydrophobic":    "#3F51B5",   # blue/indigo (Standard Hydrophobic)
    "pi-alkyl":       "#D81B60",   # pink (pi-Alkyl)
    "pistack":        "#7F3F98",   # purple (Pi-Pi / Pi-Sigma)
    "pication":       "#FE9A00",   # orange (Pi-Cation)
    "saltbridge":     "#E53935",   # red (Ionic / Salt Bridge)
    "halogen":        "#00B0FF",   # cyan (Halogen)
    "metal_acceptor": "#757575",   # gray (Metal-Acceptor)

    # Residue node background colours per interaction type
    "hbond_bg":          "#E8F8F0",  # light green
    "hydrophobic_bg":    "#E8EAF6",  # light blue/indigo
    "pi-alkyl_bg":       "#FCE4EC",  # light pink
    "pistack_bg":        "#F2EAF7",  # light purple
    "pication_bg":       "#FFF3E0",  # light orange
    "saltbridge_bg":     "#FFEBEE",  # light red
    "halogen_bg":        "#E1F5FE",  # light cyan
    "metal_acceptor_bg": "#E0E0E0",  # light gray

    # Atom colours (standard CPK)
    "N":  "#1D4ED8",
    "O":  "#B91C1C",
    "S":  "#92400E",
    "F":  "#065F46",
    "Cl": "#15803D",
    "Br": "#78350F",
    "P":  "#6B21A8",

    # Ligand structure (Discovery Studio gold/yellow style)
    "bond":    "#D4B000",
    "aromatic_inner": "#D4B000",  # gold/yellow dashed inner ring
}


# =============================================================================
# STAGE 1 — PDB PARSER
# =============================================================================

def parse_pdb(pdb_path: str, ligand_resname: str = None) -> Tuple[List[Dict], List[Dict]]:
    """
    Parse a protein-ligand complex PDB file.

    Reads ATOM records as protein atoms.
    Reads HETATM records matching ligand_resname as ligand atoms.

    If ligand_resname is None, auto-detects from LIGAND_RESNAMES set.

    Returns:
        (protein_atoms, ligand_atoms)

    Each atom dict has keys:
        aname, resname, resid, chain, elem, x, y, z
    """
    protein_atoms = []
    ligand_atoms  = []

    path = pathlib.Path(pdb_path)
    if not path.exists():
        raise FileNotFoundError(f"PDB file not found: {pdb_path}")

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

            # Determine element: prefer explicit column 77-78, fall back to atom name
            elem = line[76:78].strip() if len(line) >= 78 else ""
            if not elem or not elem.isalpha():
                # Guess from atom name: strip leading digits, take first alpha char
                clean = aname.lstrip("0123456789")
                elem  = clean[0].upper() if clean else "C"
            else:
                elem = elem.strip()[0].upper() if elem.strip() else "C"

            # Skip hydrogen atoms — not needed for interaction detection
            if elem == "H":
                continue

            atom = {
                "aname":   aname,
                "resname": resname,
                "resid":   resid,
                "chain":   chain,
                "elem":    elem,
                "x": x, "y": y, "z": z,
            }

            if rec == "HETATM":
                # Auto-detect ligand resname or match explicit
                if ligand_resname:
                    if resname == ligand_resname:
                        ligand_atoms.append(atom)
                else:
                    if resname in LIGAND_RESNAMES:
                        ligand_atoms.append(atom)
            elif rec == "ATOM":
                protein_atoms.append(atom)

    return protein_atoms, ligand_atoms


# =============================================================================
# STAGE 2 — INTERACTION DETECTOR
# =============================================================================

def parse_metals(pdb_path: str) -> List[Dict]:
    """Parse metal ions from PDB complex files."""
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
    """Identify aromatic ligand atoms by ring connectivity (pure Python)."""
    n = len(ligand_atoms)
    if n == 0:
        return set()
    BOND_CUTOFF = 1.9
    adj = [[] for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            a, b = ligand_atoms[i], ligand_atoms[j]
            d = math.sqrt(
                (a["x"] - b["x"]) ** 2 +
                (a["y"] - b["y"]) ** 2 +
                (a["z"] - b["z"]) ** 2
            )
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


def detect(
    protein_atoms: List[Dict],
    ligand_atoms:  List[Dict],
    pdb_path:      Optional[str] = None,
) -> List[Dict]:
    """
    Detect protein-ligand interactions using standard distance cutoffs.
    Splits hydrophobic contacts into 'Hydrophobic' and 'pi-Alkyl' categories,
    and supports custom metal-acceptor coordination detection.
    """
    # Keep only the best (shortest) distance per (label, type) pair
    best: Dict[tuple, Dict] = {}

    def _dist3d(a, b):
        return math.sqrt(
            (a["x"] - b["x"]) ** 2 +
            (a["y"] - b["y"]) ** 2 +
            (a["z"] - b["z"]) ** 2
        )

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

    # Find aromatic ligand atoms
    aromatic_lig_atoms = _get_aromatic_ligand_atoms(ligand_atoms)

    # ── H-bonds, hydrophobic / pi-alkyl, salt bridge, halogen ─────────────────
    for li, la in enumerate(ligand_atoms):
        for pa in protein_atoms:
            d     = _dist3d(la, pa)
            label = f"{pa['resname']} {pa['resid']}"
            l_el  = la["elem"]
            p_el  = pa["elem"]
            p_res = pa["resname"]

            # H-bond — both polar
            if (d <= HBOND_CUTOFF and
                    l_el in POLAR_ELEMENTS and
                    p_el in {"N", "O", "S"}):
                _update(label, "hbond", pa["resname"], pa["resid"], pa["chain"], d, li)

            # Hydrophobic / pi-alkyl
            elif (l_el == CARBON and p_el == CARBON):
                is_pi_alkyl = False
                if li in aromatic_lig_atoms:
                    is_pi_alkyl = True
                elif p_res in AROMATIC_RESIDUES and pa["aname"] in AROMATIC_RING_ATOMS.get(p_res, set()):
                    is_pi_alkyl = True
                
                if is_pi_alkyl and d <= PI_ALKYL_CUTOFF:
                    _update(label, "pi-alkyl", pa["resname"], pa["resid"], pa["chain"], d, li)
                elif not is_pi_alkyl and d <= HYDROPHOBIC_CUTOFF:
                    _update(label, "hydrophobic", pa["resname"], pa["resid"], pa["chain"], d, li)

            # Salt bridge — charged ligand N (positive) near neg-charged protein O
            if (d <= SALT_BRIDGE_CUTOFF and
                    l_el == "N" and
                    p_res in NEG_CHARGED_RESIDUES and
                    pa["aname"] in NEG_CHARGE_ATOMS.get(p_res, set())):
                _update(label, "saltbridge", pa["resname"], pa["resid"], pa["chain"], d, li)

            # Salt bridge — charged ligand O (negative) near pos-charged protein N
            if (d <= SALT_BRIDGE_CUTOFF and
                    l_el == "O" and
                    p_res in POS_CHARGED_RESIDUES and
                    pa["aname"] in POS_CHARGE_ATOMS.get(p_res, set())):
                _update(label, "saltbridge", pa["resname"], pa["resid"], pa["chain"], d, li)

            # Halogen bond — halogen on ligand (Cl/Br/I) to N/O on protein
            if (d <= HALOGEN_CUTOFF and
                    l_el.upper() in HALOGEN_ELEMENTS and
                    p_el in {"N", "O"}):
                _update(label, "halogen", pa["resname"], pa["resid"], pa["chain"], d, li)

    # ── Metal coordination (Metal-Acceptor) ──────────────────────────────────
    if pdb_path:
        metals = parse_metals(pdb_path)
        for metal in metals:
            metal_label = f"{metal['elem']} {metal['resid']}"
            # Distance from metal to ligand donors (O, N, S)
            for li, la in enumerate(ligand_atoms):
                if la["elem"] in {"O", "N", "S"}:
                    d = _dist3d(la, metal)
                    if d <= 3.0:
                        _update(metal_label, "metal_acceptor", metal["resname"], metal["resid"], metal["chain"], d, li)

    # ── π-stacking and π-cation ───────────────────────────────────────────────
    # Group protein atoms by residue for ring centroid calculation
    residue_groups: Dict[tuple, list] = {}
    for pa in protein_atoms:
        if pa["resname"] in AROMATIC_RESIDUES:
            key = (pa["resname"], pa["resid"], pa["chain"])
            residue_groups.setdefault(key, []).append(pa)

    lig_ring_centroids = _get_ligand_ring_centroids(ligand_atoms)

    if not lig_ring_centroids and ligand_atoms:
        cx = sum(a["x"] for a in ligand_atoms) / len(ligand_atoms)
        cy = sum(a["y"] for a in ligand_atoms) / len(ligand_atoms)
        cz = sum(a["z"] for a in ligand_atoms) / len(ligand_atoms)
        lig_ring_centroids = [(cx, cy, cz)]

    lig_cationic = [
        (a["x"], a["y"], a["z"])
        for a in ligand_atoms
        if a["elem"] == "N"
    ]

    for (resname, resid, chain), atoms in residue_groups.items():
        ring_atom_names = AROMATIC_RING_ATOMS.get(resname, set())
        ring_atoms = [a for a in atoms if a["aname"] in ring_atom_names]
        if not ring_atoms:
            continue

        # Protein ring centroid
        rcx = sum(a["x"] for a in ring_atoms) / len(ring_atoms)
        rcy = sum(a["y"] for a in ring_atoms) / len(ring_atoms)
        rcz = sum(a["z"] for a in ring_atoms) / len(ring_atoms)
        prot_centroid = (rcx, rcy, rcz)

        label = f"{resname} {resid}"

        # π-stacking
        for lig_c in lig_ring_centroids:
            d = math.sqrt(
                (lig_c[0] - rcx)**2 +
                (lig_c[1] - rcy)**2 +
                (lig_c[2] - rcz)**2
            )
            if d <= PI_STACK_CUTOFF:
                closest_idx = min(
                    range(len(ligand_atoms)),
                    key=lambda i: math.sqrt(
                        (ligand_atoms[i]["x"] - lig_c[0])**2 +
                        (ligand_atoms[i]["y"] - lig_c[1])**2 +
                        (ligand_atoms[i]["z"] - lig_c[2])**2
                    )
                ) if ligand_atoms else 0
                _update(label, "pistack", resname, resid, chain, d, closest_idx)

        # π-cation
        for lpos in lig_cationic:
            d = math.sqrt(
                (lpos[0] - rcx)**2 +
                (lpos[1] - rcy)**2 +
                (lpos[2] - rcz)**2
            )
            if d <= PI_CATION_CUTOFF:
                closest_idx = min(
                    range(len(ligand_atoms)),
                    key=lambda i: math.sqrt(
                        (ligand_atoms[i]["x"] - lpos[0])**2 +
                        (ligand_atoms[i]["y"] - lpos[1])**2 +
                        (ligand_atoms[i]["z"] - lpos[2])**2
                    )
                ) if ligand_atoms else 0
                _update(label, "pication", resname, resid, chain, d, closest_idx)

    # Sort priority order
    type_order = {
        "hbond": 0, "saltbridge": 1, "halogen": 2,
        "pistack": 3, "pication": 4, "pi-alkyl": 5,
        "hydrophobic": 6, "metal_acceptor": 7
    }
    sorted_vals = sorted(
        best.values(),
        key=lambda x: (type_order.get(x["type"], 9), x["dist"])
    )
    return sorted_vals


def _get_ligand_ring_centroids(ligand_atoms: List[Dict]) -> List[tuple]:
    """
    Identify aromatic ring atoms in the ligand by connectivity and
    return their 3D centroids.

    Strategy: build a simple adjacency graph from bond distances,
    find 5- and 6-membered rings, compute centroids.
    Pure Python — no RDKit needed here since we already have 3D coords.
    """
    n = len(ligand_atoms)
    if n == 0:
        return []

    # Build adjacency from bond distances (covalent bond < 1.9 Å)
    BOND_CUTOFF = 1.9
    adj = [[] for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            a, b = ligand_atoms[i], ligand_atoms[j]
            d = math.sqrt(
                (a["x"]-b["x"])**2 +
                (a["y"]-b["y"])**2 +
                (a["z"]-b["z"])**2
            )
            if d < BOND_CUTOFF:
                adj[i].append(j)
                adj[j].append(i)

    # Find all simple cycles of length 5 or 6 using DFS
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

    centroids = []
    seen_rings = set()

    for ring_size in (6, 5):
        for ring in find_cycles(ring_size):
            key = tuple(sorted(ring))
            if key in seen_rings:
                continue
            seen_rings.add(key)
            ring_atoms = [ligand_atoms[i] for i in ring]
            # Only include rings where most atoms are C or N (aromatic character)
            aromatic_elems = sum(1 for a in ring_atoms if a["elem"] in ("C", "N"))
            if aromatic_elems < ring_size - 1:
                continue
            cx = sum(a["x"] for a in ring_atoms) / len(ring_atoms)
            cy = sum(a["y"] for a in ring_atoms) / len(ring_atoms)
            cz = sum(a["z"] for a in ring_atoms) / len(ring_atoms)
            centroids.append((cx, cy, cz))

    return centroids


# =============================================================================
# STAGE 3 — SVG RENDERER
# =============================================================================

def render_svg(
    pdb_path:     str,
    interactions: List[Dict],
    affinity:     float = 0.0,
    ligand_resname: str = None,
    original_sdf_path: str = None,
) -> str:
    """
    Generate a publication-quality SVG string of the 2D interaction diagram.
    Decoupled drawing: ligand is drawn in a fixed 240x240 RDKit MolDraw2DSVG nested SVG,
    and residue circles are styled as circular nodes in a clean radial projection layout.
    """
    # ── 2D ligand layout via RDKit (try template first) ─────────────
    mol = None
    if original_sdf_path:
        mol = load_ligand_with_correct_bonds(str(pdb_path), original_sdf_path)

    if mol is None:
        # Fallback: direct PDB parse (may have valence issues with PDBQT-derived atoms)
        mol = Chem.MolFromPDBFile(str(pdb_path), removeHs=True, sanitize=False)

    if mol is None:
        return _error_svg("RDKit could not parse the PDB file.")

    try:
        Chem.SanitizeMol(mol)
    except Exception:
        pass  # non-fatal — continue with what we have

    # Extract ligand atoms only
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

    # Remove any remaining hydrogens from the 2D layout molecule
    try:
        from rdkit.Chem import AllChem
        lig_mol = Chem.RemoveHs(lig_mol)
        Chem.SanitizeMol(lig_mol)
    except Exception:
        pass  # non-fatal — continue with existing mol

    # 1. Generate 2D coordinates with CoordGen
    try:
        rdDepictor.Compute2DCoords(lig_mol)
    except Exception as e:
        _log.warning(f"Compute2DCoords failed: {e}")

    # 2. Call PrepareMolForDrawing to fix kekulization, overlaps, wedge bonds
    try:
        from rdkit.Chem.Draw import rdMolDraw2D
        rdMolDraw2D.PrepareMolForDrawing(lig_mol)
    except Exception as e:
        _log.warning(f"PrepareMolForDrawing failed: {e}")

    # 3. Draw the ligand inside a fixed 240x240 transparent nested SVG
    from rdkit.Chem.Draw import rdMolDraw2D
    drawer = rdMolDraw2D.MolDraw2DSVG(240, 240)
    opts = drawer.drawOptions()
    opts.clearBackground = False
    opts.bondLineWidth = 2.0

    drawer.DrawMolecule(lig_mol)
    drawer.FinishDrawing()

    lig_svg_text = drawer.GetDrawingText()

    # Strip XML header and replace outer <svg> with nested <svg> at (180, 170)
    import re
    lig_svg_text = re.sub(r'<\?xml[^>]*\?>', '', lig_svg_text)
    lig_svg_text = re.sub(
        r'<svg[^>]*>', 
        '<svg x="180" y="170" width="240" height="240" viewBox="0 0 240 240">', 
        lig_svg_text, 
        count=1
    )

    # Re-style black bonds/strokes to DS gold/yellow (#D4B000)
    lig_svg_text = lig_svg_text.replace("stroke:#000000;", "stroke:#D4B000;")
    lig_svg_text = lig_svg_text.replace("stroke:#000000'", "stroke:#D4B000'")
    lig_svg_text = lig_svg_text.replace("stroke='#000000'", "stroke='#D4B000'")
    lig_svg_text = lig_svg_text.replace('stroke="#000000"', 'stroke="#D4B000"')

    # 4. Map RDKit drawn atom coordinates to absolute diagram coordinates
    # Center of nested SVG is at (300, 290)
    cx_canvas, cy_canvas = 300.0, 290.0
    atom_pos = {}
    for idx in range(lig_mol.GetNumAtoms()):
        pt = drawer.GetDrawCoords(idx)
        atom_pos[idx] = (180.0 + pt.x, 170.0 + pt.y)

    lig_center = (cx_canvas, cy_canvas)

    # ── Collect aromatic ring centroids for halos and pi interaction anchoring ──
    aromatic_ring_centroids = []
    try:
        ring_info = lig_mol.GetRingInfo()
        all_rings = [list(r) for r in ring_info.AtomRings()]

        for ring in all_rings:
            if len(ring) not in (5, 6):
                continue
            atoms_in_ring = [lig_mol.GetAtomWithIdx(i) for i in ring]
            aromatic_count = sum(
                1 for a in atoms_in_ring
                if a.GetIsAromatic() or a.GetSymbol() in ("C", "N")
            )
            if aromatic_count < len(ring) - 1:
                continue

            valid_ring = [i for i in ring if i in atom_pos]
            if len(valid_ring) < 3:
                continue

            rcx = sum(atom_pos[i][0] for i in valid_ring) / len(valid_ring)
            rcy = sum(atom_pos[i][1] for i in valid_ring) / len(valid_ring)
            aromatic_ring_centroids.append((rcx, rcy, 0.0, ring))

    except Exception as e:
        _log.warning(f"Aromatic ring detection failed for halos: {e}")
        aromatic_ring_centroids = []

    # ── Place residue nodes in an elliptical ring ─────────────────────────────
    unique_labels = list(dict.fromkeys(i["label"] for i in interactions))
    n_nodes = len(unique_labels)
    
    # 1. Calculate target angle for each residue based on its target ligand atom coordinates
    residue_angles = {}
    for lbl in unique_labels:
        res_acts = [iact for iact in interactions if iact["label"] == lbl]
        xs = []
        ys = []
        for iact in res_acts:
            # For pi interactions, use the closest ring centroid to approximate the angle
            lig_idx = iact.get("lig_atom_idx", 0)
            if iact["type"] in ("pistack", "pication") and aromatic_ring_centroids:
                target_pos = atom_pos.get(lig_idx)
                if target_pos:
                    closest_centroid = min(
                        aromatic_ring_centroids,
                        key=lambda c: (c[0] - target_pos[0])**2 + (c[1] - target_pos[1])**2
                    )
                    xs.append(closest_centroid[0])
                    ys.append(closest_centroid[1])
            else:
                if lig_idx in atom_pos:
                    xs.append(atom_pos[lig_idx][0])
                    ys.append(atom_pos[lig_idx][1])
        if xs:
            avg_x = sum(xs) / len(xs)
            avg_y = sum(ys) / len(ys)
            angle = math.atan2(avg_y - cy_canvas, avg_x - cx_canvas)
        else:
            angle = 0.0
        residue_angles[lbl] = angle

    # 2. Sort labels by their target angles to maintain circular planar mapping (no crossings)
    sorted_labels = sorted(unique_labels, key=lambda l: residue_angles[l])
    
    # 3. Tight dynamic radii to prevent out-of-bounds nodes on both left and right
    base_R = 120 + min(n_nodes * 3.0, 50)
    RX = base_R * 1.15
    RY = base_R * 0.95
    
    node_pos = {}
    for idx, lbl in enumerate(sorted_labels):
        # Position evenly around the ellipse, maintaining sorted order
        angle = (2 * math.pi * idx / max(n_nodes, 1)) - math.pi / 2
        nx = cx_canvas + RX * math.cos(angle)
        ny = cy_canvas + RY * math.sin(angle)
        node_pos[lbl] = (nx, ny)

    # ── Build SVG ─────────────────────────────────────────────────────────────
    CW, CH = 900, 580
    LEG_X  = 620

    svg = []
    svg.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CW}" height="{CH}" '
        f'viewBox="0 0 {CW} {CH}" font-family="Arial, Helvetica, sans-serif">'
    )

    # Background
    svg.append(f'<rect width="{CW}" height="{CH}" fill="#FFFFFF" rx="12" '
               f'stroke="#E5E7EB" stroke-width="1.5"/>')

    # Title bar
    svg.append(f'<rect x="0" y="0" width="{CW}" height="44" rx="12" fill="#F8FAFC"/>')
    svg.append(f'<rect x="0" y="32" width="{CW}" height="12" fill="#F8FAFC"/>')
    svg.append(f'<line x1="0" y1="44" x2="{CW}" y2="44" stroke="#E5E7EB" stroke-width="1"/>')
    svg.append('<text x="22" y="28" font-size="15" font-weight="bold" fill="#111827">'
               'Protein–Ligand 2D Interaction Diagram</text>')
    svg.append(f'<text x="{CW - 20}" y="28" font-size="11" fill="#6B7280" '
               f'text-anchor="end">Salidock</text>')

    # ── Interaction lines (drawn FIRST — behind everything) ───────────────────
    def _shorten(x1, y1, x2, y2, s=6, e=24):
        """Shorten line at both ends so it doesn't overlap nodes."""
        dx, dy = x2 - x1, y2 - y1
        ln = math.sqrt(dx*dx + dy*dy) or 1.0
        ux, uy = dx / ln, dy / ln
        return x1 + ux*s, y1 + uy*s, x2 - ux*e, y2 - uy*e

    # ── Interaction lines (with decluttered shared-atom convergence fanning) ──
    # Group interactions by their mapped starting coordinate (lx, ly)
    from collections import defaultdict
    valid_interactions = [i for i in interactions if i["label"] in node_pos]
    
    # Calculate starting coordinate for each valid interaction
    coords_map = {}
    for iact in valid_interactions:
        lbl = iact["label"]
        nx, ny = node_pos[lbl]
        lig_idx = iact.get("lig_atom_idx", 0)
        lx, ly = lig_center
        if iact["type"] in ("pistack", "pication") and aromatic_ring_centroids:
            target_pos = atom_pos.get(lig_idx)
            if target_pos:
                closest_centroid = min(
                    aromatic_ring_centroids,
                    key=lambda c: (c[0] - target_pos[0])**2 + (c[1] - target_pos[1])**2
                )
                lx, ly = closest_centroid[0], closest_centroid[1]
            else:
                lx, ly = lig_center
        else:
            if lig_idx in atom_pos:
                lx, ly = atom_pos[lig_idx]
        coords_map[id(iact)] = (lx, ly)

    # Group by rounded coordinates
    coord_groups = defaultdict(list)
    for iact in valid_interactions:
        lx, ly = coords_map[id(iact)]
        key = (round(lx, 2), round(ly, 2))
        coord_groups[key].append(iact)

    # Calculate origin offset and curve factors
    interaction_origins = {}
    interaction_curves = {}
    
    for (gx, gy), group in coord_groups.items():
        n_items = len(group)
        if n_items >= 3:
            # Group by 3+ needs fanning and Bezier curves.
            # Calculate average direction of group residues to orient the fan
            xs_res = []
            ys_res = []
            for iact in group:
                nx, ny = node_pos[iact["label"]]
                xs_res.append(nx - gx)
                ys_res.append(ny - gy)
            
            avg_dx = sum(xs_res) / n_items if xs_res else 1.0
            avg_dy = sum(ys_res) / n_items if ys_res else 0.0
            avg_angle = math.atan2(avg_dy, avg_dx)
            
            for i, iact in enumerate(group):
                # Spread around the average angle
                angle = avg_angle + (i - (n_items - 1) / 2) * (math.pi / 6)
                interaction_origins[id(iact)] = (gx + 8.0 * math.cos(angle), gy + 8.0 * math.sin(angle))
                
                # Curve factor: ranges from -0.18 to 0.18 based on position in group
                if n_items > 1:
                    interaction_curves[id(iact)] = (i - (n_items - 1) / 2) * (0.36 / (n_items - 1))
                else:
                    interaction_curves[id(iact)] = 0.0
        else:
            for iact in group:
                interaction_origins[id(iact)] = coords_map[id(iact)]
                interaction_curves[id(iact)] = 0.0

    # Draw lines
    def _shorten(x1, y1, x2, y2, s=6, e=24):
        """Shorten line at both ends so it doesn't overlap nodes."""
        dx, dy = x2 - x1, y2 - y1
        ln = math.sqrt(dx*dx + dy*dy) or 1.0
        ux, uy = dx / ln, dy / ln
        return x1 + ux*s, y1 + uy*s, x2 - ux*e, y2 - uy*e

    for iact in valid_interactions:
        lbl = iact["label"]
        nx, ny = node_pos[lbl]
        ox, oy = interaction_origins[id(iact)]
        curve_factor = interaction_curves[id(iact)]
        color = COLORS.get(iact["type"], "#888888")
        
        x1, y1, x2, y2 = _shorten(ox, oy, nx, ny)
        
        if abs(curve_factor) > 0.01:
            # Draw quadratic Bezier curve
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            dx, dy = x2 - x1, y2 - y1
            perp_x, perp_y = -dy, dx
            norm = math.hypot(perp_x, perp_y) or 1
            cx = mx + (perp_x / norm) * curve_factor * norm * 0.8
            cy = my + (perp_y / norm) * curve_factor * norm * 0.8
            
            d_path = f'M {x1:.1f} {y1:.1f} Q {cx:.1f} {cy:.1f} {x2:.1f} {y2:.1f}'
            
            if iact["type"] == "hbond":
                svg.append(f'<path d="{d_path}" fill="none" stroke="{color}" stroke-width="2.2" stroke-dasharray="5,2.5" opacity="0.9"/>')
            elif iact["type"] == "halogen":
                svg.append(f'<path d="{d_path}" fill="none" stroke="{color}" stroke-width="2.0" stroke-dasharray="4,2" opacity="0.9"/>')
            elif iact["type"] == "pistack":
                svg.append(f'<path d="{d_path}" fill="none" stroke="{color}" stroke-width="2.0" stroke-dasharray="5,2.5" opacity="0.85"/>')
            elif iact["type"] == "pication":
                svg.append(f'<path d="{d_path}" fill="none" stroke="{color}" stroke-width="2.0" stroke-dasharray="4,2.5" opacity="0.85"/>')
            elif iact["type"] == "saltbridge":
                svg.append(f'<path d="{d_path}" fill="none" stroke="{color}" stroke-width="2.2" stroke-dasharray="4,2" opacity="0.9"/>')
            elif iact["type"] == "pi-alkyl":
                svg.append(f'<path d="{d_path}" fill="none" stroke="{color}" stroke-width="1.8" stroke-dasharray="5,2.5" opacity="0.85"/>')
            elif iact["type"] == "metal_acceptor":
                svg.append(f'<path d="{d_path}" fill="none" stroke="{color}" stroke-width="2.2" stroke-dasharray="3,3" opacity="0.9"/>')
            else: # hydrophobic
                svg.append(f'<path d="{d_path}" fill="none" stroke="{color}" stroke-width="1.8" opacity="0.85"/>')
        else:
            # Draw standard straight lines
            if iact["type"] == "hbond":
                svg.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="2.2" stroke-dasharray="5,2.5" opacity="0.9"/>')
            elif iact["type"] == "halogen":
                svg.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="2.0" stroke-dasharray="4,2" opacity="0.9"/>')
            elif iact["type"] == "pistack":
                svg.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="2.0" stroke-dasharray="5,2.5" opacity="0.85"/>')
            elif iact["type"] == "pication":
                svg.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="2.0" stroke-dasharray="4,2.5" opacity="0.85"/>')
            elif iact["type"] == "saltbridge":
                svg.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="2.2" stroke-dasharray="4,2" opacity="0.9"/>')
            elif iact["type"] == "pi-alkyl":
                svg.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="1.8" stroke-dasharray="5,2.5" opacity="0.85"/>')
            elif iact["type"] == "metal_acceptor":
                svg.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="2.2" stroke-dasharray="3,3" opacity="0.9"/>')
            else: # hydrophobic
                svg.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="1.8" opacity="0.85"/>')

    # ── Draw aromatic soft halos behind ligand bonds ────────────────
    for (rcx, rcy, inner_r, ring) in aromatic_ring_centroids:
        svg.append(
            f'<circle cx="{rcx:.1f}" cy="{rcy:.1f}" r="22" '
            f'fill="#7F3F98" opacity="0.08"/>'
        )

    # ── Draw RDKit nested ligand SVG ──────────────────────────────────────────
    svg.append(lig_svg_text)

    # ── Residue nodes (Discovery Studio circular styling) ─────────────────────
    # Neutral style colors for standard residues
    RESIDUE_NODE_FILL = "#E8F5E9"      # light neutral green (Discovery Studio convention)
    RESIDUE_NODE_STROKE = "#81C784"    # slightly darker green outline
    RESIDUE_TEXT_COLOR = "#1B5E20"

    for lbl, (nx, ny) in node_pos.items():
        res_acts = [i for i in interactions if i["label"] == lbl]
        is_metal_node = any(i["type"] == "metal_acceptor" for i in res_acts)
        
        if is_metal_node:
            border_color = "#757575"
            bg_color     = "#E0E0E0"
            text_color   = "#212121"
            sub_text_color = "#424242"
        else:
            border_color = RESIDUE_NODE_STROKE
            bg_color     = RESIDUE_NODE_FILL
            text_color   = RESIDUE_TEXT_COLOR
            sub_text_color = RESIDUE_TEXT_COLOR

        # Circular nodes (r=22)
        svg.append(
            f'<circle cx="{nx:.1f}" cy="{ny:.1f}" r="22" '
            f'fill="{bg_color}" stroke="{border_color}" stroke-width="1.8"/>'
        )
        
        # Split residue name and chain/number across two lines (e.g., KCX and A:490)
        parts = lbl.split(" ")
        if len(parts) == 2:
            res_name, res_num = parts[0], parts[1]
            res_chain = next((i["chain"] for i in interactions if i["label"] == lbl), "A")
            sub_lbl = f"{res_chain}:{res_num}"
            
            svg.append(
                f'<text x="{nx:.1f}" y="{ny - 5:.1f}" text-anchor="middle" '
                f'dominant-baseline="central" font-size="10.5" '
                f'font-weight="bold" fill="{text_color}">{res_name}</text>'
            )
            svg.append(
                f'<text x="{nx:.1f}" y="{ny + 6:.1f}" text-anchor="middle" '
                f'dominant-baseline="central" font-size="9" '
                f'font-weight="normal" fill="{sub_text_color}">{sub_lbl}</text>'
            )
        else:
            svg.append(
                f'<text x="{nx:.1f}" y="{ny:.1f}" text-anchor="middle" '
                f'dominant-baseline="central" font-size="11" '
                f'font-weight="bold" fill="{text_color}">{lbl}</text>'
            )

    # ── Legend panel ──────────────────────────────────────────────────────────
    present_types = list(dict.fromkeys(i["type"] for i in interactions))
    ph = len(present_types) * 28 + 54
    svg.append(
        f'<rect x="{LEG_X - 12}" y="58" width="268" height="{ph}" '
        f'rx="10" fill="#FAFAFA" stroke="#E5E7EB" stroke-width="1.2"/>'
    )
    svg.append(
        f'<text x="{LEG_X}" y="80" font-size="13" font-weight="bold" '
        f'fill="#111827">Interaction types</text>'
    )
    ly = 100
    legend_items = {
        "hbond":          ("H-Bond",         COLORS["hbond"],          "5,2.5", "2.0"),
        "saltbridge":     ("Salt Bridge",    COLORS["saltbridge"],     "4,2",   "2.2"),
        "halogen":        ("Halogen Bond",   COLORS["halogen"],        "4,2",   "1.8"),
        "pistack":        ("π-Stacking",     COLORS["pistack"],        "5,2.5", "1.8"),
        "pication":       ("π-Cation",       COLORS["pication"],       "4,2.5", "1.8"),
        "hydrophobic":    ("Hydrophobic",    COLORS["hydrophobic"],    "none",  "1.8"),
        "pi-alkyl":       ("π-Alkyl",        COLORS["pi-alkyl"],       "5,2.5", "1.8"),
        "metal_acceptor": ("Metal-Acceptor", COLORS["metal_acceptor"], "3,3",   "2.2"),
    }
    for itype in present_types:
        label, color, dash, width = legend_items.get(
            itype, (itype.capitalize(), "#888", "none", "1.5")
        )
        dash_attr = f'stroke-dasharray="{dash}"' if dash != "none" else ""
        count     = sum(1 for i in interactions if i["type"] == itype)
        svg.append(
            f'<line x1="{LEG_X}" y1="{ly}" x2="{LEG_X + 40}" y2="{ly}" '
            f'stroke="{color}" stroke-width="{width}" {dash_attr}/>'
        )
        svg.append(
            f'<text x="{LEG_X + 48}" y="{ly}" dominant-baseline="central" '
            f'font-size="11" fill="#374151">{label} '
            f'<tspan fill="#9CA3AF">({count})</tspan></text>'
        )
        ly += 28

    # ── Binding affinity badge ────────────────────────────────────────────────
    badge_y = 58 + ph + 18
    svg.append(
        f'<rect x="{LEG_X - 12}" y="{badge_y}" width="268" height="44" '
        f'rx="8" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="1"/>'
    )
    svg.append(
        f'<text x="{LEG_X}" y="{badge_y + 14}" font-size="11" fill="#1E40AF">'
        f'Binding affinity</text>'
    )
    svg.append(
        f'<text x="{LEG_X}" y="{badge_y + 30}" font-size="13" '
        f'font-weight="bold" fill="#1D4ED8">'
        f'{affinity:.3f} kcal/mol</text>'
    )

    # ── Summary line ──────────────────────────────────────────────────────────
    n_res = len(set(i["label"] for i in interactions))
    svg.append(
        f'<text x="{LEG_X - 12}" y="{badge_y + 62}" font-size="11" fill="#6B7280">'
        f'{len(interactions)} interactions · {n_res} residues</text>'
    )

    # ── Footer ────────────────────────────────────────────────────────────────
    svg.append(
        f'<text x="{CW // 2}" y="{CH - 10}" text-anchor="middle" '
        f'font-size="9" fill="#9CA3AF">'
        f'Generated by Salidock  ·  Distance-based detection  ·  RDKit CoordGen 2D layout</text>'
    )

    svg.append('</svg>')
    return "\n".join(svg)


# =============================================================================
# INTERNAL HELPERS
# =============================================================================

def _error_svg(message: str) -> str:
    """Returns a minimal error SVG when something goes wrong."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" '
        f'viewBox="0 0 600 200" font-family="Arial, sans-serif">'
        f'<rect width="600" height="200" fill="#FEF2F2" rx="8" stroke="#FECACA" stroke-width="1"/>'
        f'<text x="300" y="90" text-anchor="middle" font-size="14" '
        f'font-weight="bold" fill="#991B1B">Diagram generation failed</text>'
        f'<text x="300" y="115" text-anchor="middle" font-size="12" fill="#B91C1C">'
        f'{message}</text>'
        f'</svg>'
    )


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
