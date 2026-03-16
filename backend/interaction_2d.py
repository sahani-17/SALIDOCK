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
from rdkit.Chem import rdDepictor
rdDepictor.SetPreferCoordGen(True)


# =============================================================================
# CONSTANTS — distance cutoffs (Angstroms), standard biochemistry values
# =============================================================================

HBOND_CUTOFF       = 3.5    # polar (N/O/S/F) to polar (N/O/S)
HYDROPHOBIC_CUTOFF = 4.5    # carbon to carbon
PI_STACK_CUTOFF    = 5.5    # aromatic ring centroid to aromatic ring centroid
PI_CATION_CUTOFF   = 5.0    # aromatic ring centroid to cationic atom
SALT_BRIDGE_CUTOFF = 4.0    # charged group to charged group
HALOGEN_CUTOFF     = 3.5    # halogen (Cl/Br/I) on ligand to N/O on protein

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

# SVG colour scheme — one colour per interaction type
COLORS = {
    # Interaction line colours — DS-inspired
    "hbond":        "#16A34A",   # green (Conventional H-Bond)
    "hydrophobic":  "#9CA3AF",   # light grey (van der Waals / Alkyl)
    "pistack":      "#7C3AED",   # purple (Pi-Pi)
    "pication":     "#D97706",   # amber (Pi-Cation)
    "saltbridge":   "#DC2626",   # red (Ionic)
    "halogen":      "#0891B2",   # cyan (Halogen)

    # Residue node background colours per interaction type
    "hbond_bg":       "#DCFCE7",  # light green
    "hydrophobic_bg": "#F3F4F6",  # light grey
    "pistack_bg":     "#EDE9FE",  # light purple
    "pication_bg":    "#FEF3C7",  # light amber
    "saltbridge_bg":  "#FEE2E2",  # light red
    "halogen_bg":     "#ECFEFF",  # light cyan

    # Atom colours (standard CPK)
    "N":  "#1D4ED8",
    "O":  "#B91C1C",
    "S":  "#92400E",
    "F":  "#065F46",
    "Cl": "#15803D",
    "Br": "#78350F",
    "P":  "#6B21A8",

    # Ligand structure
    "bond":    "#1a1a1a",
    "aromatic_inner": "#6B7280",  # grey dashed inner ring
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

def detect(
    protein_atoms: List[Dict],
    ligand_atoms:  List[Dict],
) -> List[Dict]:
    """
    Detect protein-ligand interactions using standard distance cutoffs.

    Detects six interaction types:
        hbond       — polar ligand atom ≤ 3.5 Å of polar protein atom
        hydrophobic — carbon ≤ 4.5 Å of carbon
        pistack     — ligand aromatic ring centroid ≤ 5.5 Å of protein aromatic ring centroid
        pication    — protein aromatic ring centroid ≤ 5.0 Å of cationic ligand atom (N+)
        saltbridge  — charged ligand atom ≤ 4.0 Å of oppositely charged protein atom
        halogen     — halogen on ligand (Cl/Br/I) ≤ 3.5 Å of N/O on protein

    Returns one interaction dict per (residue_label, interaction_type) pair.
    Each dict: {type, resname, resid, chain, label, dist}
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

    # ── H-bonds, hydrophobic, salt bridge, halogen ────────────────────────────
    for li, la in enumerate(ligand_atoms):
        for pa in protein_atoms:
            d     = _dist3d(la, pa)
            label = f"{pa['resname']}{pa['resid']}"
            l_el  = la["elem"]
            p_el  = pa["elem"]
            p_res = pa["resname"]

            # H-bond — both polar
            if (d <= HBOND_CUTOFF and
                    l_el in POLAR_ELEMENTS and
                    p_el in {"N", "O", "S"}):
                _update(label, "hbond", pa["resname"], pa["resid"], pa["chain"], d, li)

            # Hydrophobic — both carbon
            elif (d <= HYDROPHOBIC_CUTOFF and
                    l_el == CARBON and p_el == CARBON):
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

    # ── π-stacking and π-cation ───────────────────────────────────────────────
    # Group protein atoms by residue for ring centroid calculation
    residue_groups: Dict[tuple, list] = {}
    for pa in protein_atoms:
        if pa["resname"] in AROMATIC_RESIDUES:
            key = (pa["resname"], pa["resid"], pa["chain"])
            residue_groups.setdefault(key, []).append(pa)

    # Compute ligand aromatic ring centroids using RDKit ring information.
    # This is the CORRECT approach — use actual ring atom positions,
    # not the whole-ligand centroid which gives false positives.
    lig_ring_centroids = _get_ligand_ring_centroids(ligand_atoms)

    # Fallback: if no ring centroids found (acyclic ligand), use whole centroid
    if not lig_ring_centroids and ligand_atoms:
        cx = sum(a["x"] for a in ligand_atoms) / len(ligand_atoms)
        cy = sum(a["y"] for a in ligand_atoms) / len(ligand_atoms)
        cz = sum(a["z"] for a in ligand_atoms) / len(ligand_atoms)
        lig_ring_centroids = [(cx, cy, cz)]

    # Compute ligand cationic atom positions (N atoms that may be positively charged)
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

        label = f"{resname}{resid}"

        # π-stacking: ligand ring centroid ↔ protein ring centroid
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

        # π-cation: protein aromatic ring ↔ ligand cationic N
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

    # Sort: hbond → saltbridge → halogen → pistack → pication → hydrophobic
    type_order = {
        "hbond": 0, "saltbridge": 1, "halogen": 2,
        "pistack": 3, "pication": 4, "hydrophobic": 5
    }
    return sorted(
        best.values(),
        key=lambda x: (type_order.get(x["type"], 9), x["dist"])
    )


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
) -> str:
    """
    Generate a publication-quality SVG string of the 2D interaction diagram.

    Uses RDKit to:
      - Extract the ligand from the PDB
      - Compute a clean 2D coordinate layout using CoordGen
      - Draw bonds (single, double, aromatic) and atom labels

    Then draws:
      - Interaction lines to residue nodes arranged in a ring
      - H-bonds as green dashed lines with distance labels
      - Hydrophobic contacts as dark grey solid lines
      - π-stacking as purple dashed lines
      - Residue nodes coloured by interaction type
      - Legend panel
      - Binding affinity badge

    Returns a complete SVG string ready to be served as image/svg+xml.
    """

    # ── 2D ligand layout via RDKit ────────────────────────────────────────────
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

    rdDepictor.Compute2DCoords(lig_mol)
    conf = lig_mol.GetConformer()

    # Normalise 2D coordinates to a 320x320 canvas centred at (240, 290)
    xs = [conf.GetAtomPosition(i).x for i in range(lig_mol.GetNumAtoms())]
    ys = [conf.GetAtomPosition(i).y for i in range(lig_mol.GetNumAtoms())]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max_x - min_x or 1.0
    span_y = max_y - min_y or 1.0
    scale  = min(260 / span_x, 260 / span_y)
    cx_canvas, cy_canvas = 240, 290

    atom_pos = {}
    for i in range(lig_mol.GetNumAtoms()):
        p  = conf.GetAtomPosition(i)
        px = cx_canvas + (p.x - (min_x + max_x) / 2) * scale
        py = cy_canvas - (p.y - (min_y + max_y) / 2) * scale  # flip y for SVG
        atom_pos[i] = (px, py)

    lig_center = (cx_canvas, cy_canvas)

    # ── Place residue nodes in an elliptical ring ─────────────────────────────
    unique_labels = list(dict.fromkeys(i["label"] for i in interactions))
    n_nodes = len(unique_labels)
    node_pos = {}
    RX, RY = 205, 185  # ellipse radii — more horizontal space

    for idx, lbl in enumerate(unique_labels):
        angle = (2 * math.pi * idx / max(n_nodes, 1)) - math.pi / 2
        nx = lig_center[0] + RX * math.cos(angle)
        ny = lig_center[1] + RY * math.sin(angle)
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
    def _shorten(x1, y1, x2, y2, s=6, e=20):
        """Shorten line at both ends so it doesn't overlap nodes."""
        dx, dy = x2 - x1, y2 - y1
        ln = math.sqrt(dx*dx + dy*dy) or 1.0
        ux, uy = dx / ln, dy / ln
        return x1 + ux*s, y1 + uy*s, x2 - ux*e, y2 - uy*e

    for iact in interactions:
        lbl = iact["label"]
        if lbl not in node_pos:
            continue
        nx, ny   = node_pos[lbl]
        
        # Anchor line to the specific ligand atom involved in this interaction
        lig_idx = iact.get("lig_atom_idx", 0)
        if lig_idx in atom_pos:
            lx, ly = atom_pos[lig_idx]
        else:
            lx, ly = lig_center   # fallback only
            
        color    = COLORS.get(iact["type"], "#888888")
        x1, y1, x2, y2 = _shorten(lx, ly, nx, ny)

        if iact["type"] == "hbond":
            svg.append(
                f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                f'stroke="{color}" stroke-width="2.0" stroke-dasharray="6,3" opacity="0.85"/>'
            )
            mx, my = (lx + nx) / 2, (ly + ny) / 2
            dist_str = f"{iact['dist']}Å"
            svg.append(
                f'<rect x="{mx - 16:.1f}" y="{my - 9:.1f}" width="33" height="16" '
                f'rx="3" fill="#FFFFFF" opacity="0.92"/>'
            )
            svg.append(
                f'<text x="{mx:.1f}" y="{my:.1f}" text-anchor="middle" '
                f'dominant-baseline="central" font-size="9.5" '
                f'font-weight="700" fill="{color}">{dist_str}</text>'
            )

        elif iact["type"] == "saltbridge":
            svg.append(
                f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                f'stroke="{color}" stroke-width="2.2" opacity="0.85"/>'
            )
            mx, my = (lx + nx) / 2, (ly + ny) / 2
            dist_str = f"{iact['dist']}Å"
            svg.append(
                f'<rect x="{mx - 16:.1f}" y="{my - 9:.1f}" width="33" height="16" '
                f'rx="3" fill="#FFFFFF" opacity="0.92"/>'
            )
            svg.append(
                f'<text x="{mx:.1f}" y="{my:.1f}" text-anchor="middle" '
                f'dominant-baseline="central" font-size="9.5" '
                f'font-weight="700" fill="{color}">{dist_str}</text>'
            )

        elif iact["type"] == "halogen":
            svg.append(
                f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                f'stroke="{color}" stroke-width="1.8" stroke-dasharray="4,2" opacity="0.85"/>'
            )
            mx, my = (lx + nx) / 2, (ly + ny) / 2
            dist_str = f"{iact['dist']}Å"
            svg.append(
                f'<rect x="{mx - 16:.1f}" y="{my - 9:.1f}" width="33" height="16" '
                f'rx="3" fill="#FFFFFF" opacity="0.92"/>'
            )
            svg.append(
                f'<text x="{mx:.1f}" y="{my:.1f}" text-anchor="middle" '
                f'dominant-baseline="central" font-size="9.5" '
                f'font-weight="700" fill="{color}">{dist_str}</text>'
            )

        elif iact["type"] == "pistack":
            svg.append(
                f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                f'stroke="{color}" stroke-width="1.8" stroke-dasharray="5,3" opacity="0.75"/>'
            )

        elif iact["type"] == "pication":
            svg.append(
                f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                f'stroke="{color}" stroke-width="1.8" stroke-dasharray="4,3" opacity="0.75"/>'
            )

        else:  # hydrophobic
            svg.append(
                f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                f'stroke="{color}" stroke-width="1.5" opacity="0.55"/>'
            )

    # ── Ligand bonds ──────────────────────────────────────────────────────────
    # ── Collect aromatic ring centroids ──────────────────────────────────
    aromatic_ring_centroids = []
    aromatic_bond_pairs = set()

    try:
        ring_info = lig_mol.GetRingInfo()
        all_rings = [list(r) for r in ring_info.AtomRings()]

        for ring in all_rings:
            if len(ring) not in (5, 6):
                continue
            atoms_in_ring = [lig_mol.GetAtomWithIdx(i) for i in ring]
            # Check aromaticity — at least 4 of 6 atoms must be aromatic C or N
            aromatic_count = sum(
                1 for a in atoms_in_ring
                if a.GetIsAromatic() or a.GetSymbol() in ("C", "N")
            )
            if aromatic_count < len(ring) - 1:
                continue

            # Only include atoms that have 2D positions
            valid_ring = [i for i in ring if i in atom_pos]
            if len(valid_ring) < 3:
                continue

            rcx = sum(atom_pos[i][0] for i in valid_ring) / len(valid_ring)
            rcy = sum(atom_pos[i][1] for i in valid_ring) / len(valid_ring)

            # Compute inner radius from average bond length in ring
            bond_lens = []
            for k in range(len(valid_ring)):
                i1, i2 = valid_ring[k], valid_ring[(k+1) % len(valid_ring)]
                if i1 in atom_pos and i2 in atom_pos:
                    dx = atom_pos[i1][0] - atom_pos[i2][0]
                    dy = atom_pos[i1][1] - atom_pos[i2][1]
                    bond_lens.append(math.sqrt(dx*dx + dy*dy))
            avg_bond = sum(bond_lens) / len(bond_lens) if bond_lens else 20.0
            inner_r = avg_bond * 0.5

            aromatic_ring_centroids.append((rcx, rcy, inner_r, ring))

            # Track bond pairs for this aromatic ring
            for k in range(len(ring)):
                i1, i2 = ring[k], ring[(k+1) % len(ring)]
                aromatic_bond_pairs.add((min(i1,i2), max(i1,i2)))

    except Exception as e:
        print(f"[WARN] Aromatic ring detection failed: {e}")
        aromatic_ring_centroids = []
        aromatic_bond_pairs = set()

    # ── Draw bonds ────────────────────────────────────────────────────────
    for bond in lig_mol.GetBonds():
        i1 = bond.GetBeginAtomIdx()
        i2 = bond.GetEndAtomIdx()
        if i1 not in atom_pos or i2 not in atom_pos:
            continue
        x1, y1 = atom_pos[i1]
        x2, y2 = atom_pos[i2]
        pair = (min(i1,i2), max(i1,i2))

        if pair in aromatic_bond_pairs:
            # Aromatic bond: single solid line only (inner circle drawn separately)
            svg.append(
                f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                f'stroke="{COLORS["bond"]}" stroke-width="1.8"/>'
            )

        elif bond.GetBondTypeAsDouble() == 2.0:
            # Double bond: two parallel lines
            dx = x2 - x1; dy = y2 - y1
            ln = math.sqrt(dx*dx + dy*dy) or 1.0
            ox, oy = -dy / ln * 2.0, dx / ln * 2.0
            svg.append(
                f'<line x1="{x1+ox:.1f}" y1="{y1+oy:.1f}" '
                f'x2="{x2+ox:.1f}" y2="{y2+oy:.1f}" '
                f'stroke="{COLORS["bond"]}" stroke-width="1.5"/>'
            )
            svg.append(
                f'<line x1="{x1-ox:.1f}" y1="{y1-oy:.1f}" '
                f'x2="{x2-ox:.1f}" y2="{y2-oy:.1f}" '
                f'stroke="{COLORS["bond"]}" stroke-width="1.5"/>'
            )

        else:
            # Single bond
            svg.append(
                f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                f'stroke="{COLORS["bond"]}" stroke-width="1.8"/>'
            )

    # ── Draw aromatic inner dashed circles (DS style) ────────────────────
    # These are drawn AFTER bonds so they appear on top
    for (rcx, rcy, inner_r, ring) in aromatic_ring_centroids:
        svg.append(
            f'<circle cx="{rcx:.1f}" cy="{rcy:.1f}" r="{inner_r:.1f}" '
            f'fill="none" stroke="{COLORS["aromatic_inner"]}" '
            f'stroke-width="1.2" stroke-dasharray="3,2"/>'
        )

    # ── Ligand atom labels — heteroatoms only (skeletal formula convention) ──────
    # Carbon: no label, no circle — just the bond line endpoints
    # Hydrogen: completely hidden — removed from molecule above
    # All other elements (N, O, S, F, Cl, Br, P): white circle + element symbol
    SKIP_ELEMENTS = {"C", "H"}

    for i, atom in enumerate(lig_mol.GetAtoms()):
        if i not in atom_pos:
            continue
        sym = atom.GetSymbol()
        if sym in SKIP_ELEMENTS:
            continue   # skeletal formula — C and H are implicit

        x, y  = atom_pos[i]
        color = COLORS.get(sym, "#374151")

        # White filled circle with coloured border
        svg.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="10" '
            f'fill="#FFFFFF" stroke="{color}" stroke-width="1.5"/>'
        )
        # Element symbol centred in circle
        svg.append(
            f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="middle" '
            f'dominant-baseline="central" font-size="11" '
            f'font-weight="bold" fill="{color}">{sym}</text>'
        )

    # ── Residue nodes ─────────────────────────────────────────────────────────
    for lbl, (nx, ny) in node_pos.items():
        itype = next(
            (i["type"] for i in interactions if i["label"] == lbl),
            "hydrophobic"
        )
        border_color = COLORS.get(itype, "#9CA3AF")
        bg_color     = COLORS.get(f"{itype}_bg", "#F3F4F6")
        text_color   = border_color

        # Node width based on label length
        tw = max(len(lbl) * 7 + 20, 72)

        # Outer rect — stronger border, coloured background
        svg.append(
            f'<rect x="{nx - tw/2:.1f}" y="{ny - 16:.1f}" '
            f'width="{tw:.0f}" height="32" rx="6" '
            f'fill="{bg_color}" stroke="{border_color}" stroke-width="2.0"/>'
        )
        # Residue name — bold, coloured
        svg.append(
            f'<text x="{nx:.1f}" y="{ny - 3:.1f}" text-anchor="middle" '
            f'dominant-baseline="central" font-size="11" '
            f'font-weight="700" fill="{text_color}">{lbl}</text>'
        )
        # Interaction type sub-label — smaller, muted
        type_labels = {
            "hbond":       "H-Bond",
            "hydrophobic": "Hydrophobic",
            "pistack":     "π-Stack",
            "pication":    "π-Cation",
            "saltbridge":  "Salt Bridge",
            "halogen":     "Halogen",
        }
        sub = type_labels.get(itype, itype.capitalize())
        svg.append(
            f'<text x="{nx:.1f}" y="{ny + 10:.1f}" text-anchor="middle" '
            f'dominant-baseline="central" font-size="9" '
            f'fill="{border_color}" opacity="0.85">{sub}</text>'
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
        "hbond":       ("H-Bond",       COLORS["hbond"],       "6,3",  "2.0"),
        "saltbridge":  ("Salt Bridge",  COLORS["saltbridge"],  "none", "2.2"),
        "halogen":     ("Halogen Bond", COLORS["halogen"],     "4,2",  "1.8"),
        "pistack":     ("π-Stacking",   COLORS["pistack"],     "5,3",  "1.8"),
        "pication":    ("π-Cation",     COLORS["pication"],    "4,3",  "1.8"),
        "hydrophobic": ("Hydrophobic",  COLORS["hydrophobic"], "none", "1.5"),
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
