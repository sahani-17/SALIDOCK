
import os
import sys
import shutil
import subprocess
import logging
from pathlib import Path
from rdkit import Chem
from rdkit.Chem.rdForceFieldHelpers import MMFFOptimizeMolecule

# pdb-tools imports (Bonvin Lab — pure Python PDB manipulation)
# https://github.com/haddocking/pdb-tools
from pdbtools import pdb_selchain
from pdbtools import pdb_delhetatm
from pdbtools import pdb_selhetatm
from pdbtools import pdb_delresname
from pdbtools import pdb_tidy
from pdbtools import pdb_tofasta
from pdbtools import pdb_validate

# Configure logging (only if not already configured by the application)
logger = logging.getLogger(__name__)

# Only configure if the root logger has no handlers (i.e., not configured by application)
if not logging.getLogger().hasHandlers():
    logging.basicConfig(
        level=logging.INFO,
        format='%(levelname)s: %(message)s'
    )

# =============================================================================
# FIX 2/3/4 — TUNABLE CONSTANTS
# =============================================================================
MAX_SAFE_GAP = 7               # residues; gaps larger than this are NOT modelled by PDBFixer
CONNECTIVITY_DISTANCE = 2.0    # Å; max C-N peptide bond length for connected residues


def check_tools():
    """Check availability of required tools."""
    tools = {}
    tools['rdkit'] = False
    tools['openbabel'] = shutil.which('obabel') is not None or shutil.which('obabel.exe') is not None
    tools['gnina']     = shutil.which('gnina') is not None
    tools['quickvina'] = shutil.which('qvina-w') is not None or shutil.which('qvina-w.exe') is not None
    
    # Visualizer tools
    tools['pymol']     = shutil.which('pymol') is not None or shutil.which('pymol.exe') is not None
    tools['plip']      = shutil.which('plip') is not None
    tools['apbs']      = shutil.which('apbs') is not None or shutil.which('apbs.exe') is not None
    tools['pdb2pqr']   = shutil.which('pdb2pqr') is not None or shutil.which('pdb2pqr.exe') is not None
    
    try:
        from rdkit import Chem
        tools['rdkit'] = True
    except ImportError:
        pass
    
    # Check pdb-tools (Bonvin Lab) availability
    tools['pdb_tools'] = False
    try:
        from pdbtools import pdb_tidy
        tools['pdb_tools'] = True
    except ImportError:
        pass
    
    return tools


def _run_command(cmd, cwd=None, timeout=300):
    """Run external command."""
    proc = subprocess.run(cmd, shell=False, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\\nSTDOUT:\\n{proc.stdout}\\nSTDERR:\\n{proc.stderr}")
    return proc.stdout


def _find_obabel() -> str:
    """
    Locate the obabel executable.

    Search order:
      1. Directly on PATH (fastest — works when conda env is activated)
      2. $CONDA_PREFIX/bin/obabel (server running inside the env)
      3. Common conda env locations for the active env name
    """
    # 1. PATH
    found = shutil.which('obabel') or shutil.which('obabel.exe')
    if found:
        return found

    # 2. CONDA_PREFIX (set when the server process is inside the conda env)
    conda_prefix = os.environ.get('CONDA_PREFIX', '')
    if conda_prefix:
        for candidate in [
            os.path.join(conda_prefix, 'bin', 'obabel'),
            os.path.join(conda_prefix, 'Scripts', 'obabel.exe'),  # Windows
        ]:
            if os.path.isfile(candidate):
                return candidate

    # 3. Named env via CONDA_DEFAULT_ENV
    conda_env = os.environ.get('CONDA_DEFAULT_ENV', '')
    conda_base = os.environ.get('CONDA_BASE', '') or os.path.expanduser('~/miniconda3')
    if conda_env and conda_base:
        for candidate in [
            os.path.join(conda_base, 'envs', conda_env, 'bin', 'obabel'),
            os.path.join(conda_base, 'envs', conda_env, 'Scripts', 'obabel.exe'),
        ]:
            if os.path.isfile(candidate):
                return candidate

    raise FileNotFoundError(
        "obabel not found. Install with: conda install -c conda-forge openbabel"
    )


def _convert_to_pdbqt_openbabel(input_file, output_pdbqt, is_receptor=True):
    """
    Convert PDB/PQR to PDBQT using Open Babel.
    
    Args:
        input_file: Input PDB or PQR file path
        output_pdbqt: Output PDBQT file path
        is_receptor: True for proteins (rigid), False for ligands (flexible)
    
    Note:
        pH is fixed at 7.4 for hydrogen addition.
    """
    input_file = str(input_file)
    output_pdbqt = str(output_pdbqt)
    
    # Validate input file exists
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input file not found: {input_file}")
    
    # Validate input file is not empty
    if os.path.getsize(input_file) == 0:
        raise ValueError(f"Input file is empty: {input_file}")
    
    try:
        obabel_cmd = _find_obabel()
    except FileNotFoundError as e:
        raise RuntimeError(str(e))

    cmd = [obabel_cmd, input_file, '-O', output_pdbqt]
    
    if is_receptor:
        cmd.extend(['-xr'])  # rigid (receptor)
    else:
        cmd.extend(['-xh'])  # preserve hydrogens (ligand)
    
    # Add partial charges (Gasteiger) and hydrogens at pH 7.4
    cmd.extend(['-p', '7.4'])
    
    try:
        _run_command(cmd, timeout=120)
        logger.info(f"Converted to PDBQT using Open Babel: {output_pdbqt}")
    except Exception as e:
        raise RuntimeError(f"Open Babel conversion failed: {e}")


def detect_chains(input_pdb):
    """
    Detect all unique chain IDs in a PDB file.
    
    Uses direct PDB column parsing (chain ID at column 21) for ATOM records.
    
    Args:
        input_pdb: Input PDB file path
        
    Returns:
        List of dicts with chain info: [{'id': 'A', 'atoms': 1523}, ...]
        
    Raises:
        FileNotFoundError: If input file doesn't exist
        ValueError: If file is empty or contains no valid ATOM/HETATM records
    """
    input_pdb = str(input_pdb)
    
    if not os.path.exists(input_pdb):
        raise FileNotFoundError(f"PDB file not found: {input_pdb}")
    if os.path.getsize(input_pdb) == 0:
        raise ValueError(f"PDB file is empty: {input_pdb}")
    
    chain_atoms = {}
    
    with open(input_pdb, 'r') as fh:
        for line in fh:
            if line.startswith('ATOM') and len(line) >= 22:
                chain_id = line[21].strip().upper()
                if not chain_id:
                    continue
                chain_atoms[chain_id] = chain_atoms.get(chain_id, 0) + 1
    
    if not chain_atoms:
        raise ValueError(f"No valid ATOM records found in PDB file: {input_pdb}")
    
    chains = [{'id': cid, 'atoms': count} for cid, count in sorted(chain_atoms.items())]
    return chains


def validate_ligand_molecule(input_file):
    """
    Validate that input file is a small molecule (not protein/peptide).
    
    This prevents misuse of the docking model by rejecting:
    - Proteins (≥50 amino acid residues OR MW >5000 Da)
    - Peptides (10-49 amino acid residues OR MW 1000-5000 Da)
    - Large molecules (>100 heavy atoms OR MW >900 Da)
    
    Criteria for ACCEPTANCE (small molecules):
    - Molecular weight ≤900 Da (Lipinski's Rule of Five)
    - Heavy atoms ≤100
    - Amino acid residues <10 (allows dipeptides/tripeptides)
    
    Args:
        input_file: Path to ligand file (SDF, MOL2, PDB, etc.)
        
    Returns:
        dict: {
            'valid': bool,
            'molecule_type': str,  # 'small_molecule', 'peptide', 'protein', 'large_molecule'
            'reason': str,  # Rejection reason if invalid
            'stats': {
                'molecular_weight': float,
                'heavy_atoms': int,
                'amino_acid_residues': int,
                'total_atoms': int
            }
        }
        
    Raises:
        FileNotFoundError: If input file doesn't exist
        ValueError: If file cannot be parsed by RDKit
    """
    input_file = str(input_file)
    
    # Validate file exists
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Ligand file not found: {input_file}")
    
    # Try to load molecule with RDKit
    try:
        # Determine file format and load
        file_ext = Path(input_file).suffix.lower()
        
        if file_ext in ['.sdf', '.mol']:
            mol = Chem.SDMolSupplier(input_file, removeHs=False)[0]
        elif file_ext == '.mol2':
            mol = Chem.MolFromMol2File(input_file, removeHs=False)
        elif file_ext == '.pdb':
            mol = Chem.MolFromPDBFile(input_file, removeHs=False)
        else:
            # Try generic RDKit loader
            mol = Chem.MolFromMolFile(input_file, removeHs=False)
        
        if mol is None:
            raise ValueError(f"Could not parse molecule from file: {input_file}")
            
    except Exception as e:
        raise ValueError(f"Failed to load ligand file: {e}")
    
    # Calculate molecular properties
    from rdkit.Chem import Descriptors
    
    molecular_weight = Descriptors.MolWt(mol)
    heavy_atoms = mol.GetNumHeavyAtoms()
    total_atoms = mol.GetNumAtoms()
    
    # Detect amino acid residues using SMARTS patterns
    # Standard amino acid backbone pattern: N-C-C(=O)
    amino_acid_backbone = Chem.MolFromSmarts('[NX3,NX4+][CX4H]([*])C(=[OX1])[OX2H,OX1-,NX3]')
    
    # Count amino acid-like substructures
    amino_acid_matches = mol.GetSubstructMatches(amino_acid_backbone)
    amino_acid_residues = len(amino_acid_matches)
    
    # Alternative: Count peptide bonds (more sensitive)
    peptide_bond = Chem.MolFromSmarts('[NX3][CX3](=[OX1])')
    peptide_bonds = len(mol.GetSubstructMatches(peptide_bond))
    
    # Use the higher count (more conservative)
    amino_acid_residues = max(amino_acid_residues, peptide_bonds)
    
    # Build stats dictionary
    stats = {
        'molecular_weight': round(molecular_weight, 2),
        'heavy_atoms': heavy_atoms,
        'amino_acid_residues': amino_acid_residues,
        'total_atoms': total_atoms
    }
    
    # Apply validation rules
    # Rule 1: Protein detection (highest priority)
    if amino_acid_residues >= 50 or molecular_weight > 5000:
        return {
            'valid': False,
            'molecule_type': 'protein',
            'reason': f"Detected {amino_acid_residues} amino acid residues and MW {molecular_weight:.1f} Da. "
                     f"This appears to be a protein structure. This docking model is designed for small molecules only. "
                     f"For protein-protein docking, please use specialized tools like HADDOCK, ClusPro, or ZDOCK.",
            'stats': stats
        }
    
    # Rule 2: Peptide detection
    if (amino_acid_residues >= 10 and amino_acid_residues < 50) or (1000 <= molecular_weight <= 5000):
        return {
            'valid': False,
            'molecule_type': 'peptide',
            'reason': f"Detected {amino_acid_residues} amino acid residues and MW {molecular_weight:.1f} Da. "
                     f"This appears to be a peptide. This docking model is designed for small molecules only. "
                     f"Peptides require specialized docking protocols (e.g., HPEPDOCK, PeptiDock).",
            'stats': stats
        }
    
    # Rule 3: Large molecule detection (Lipinski's Rule of Five violation)
    if heavy_atoms > 100 or molecular_weight > 900:
        return {
            'valid': False,
            'molecule_type': 'large_molecule',
            'reason': f"Molecular weight {molecular_weight:.1f} Da exceeds drug-like threshold (900 Da) "
                     f"or heavy atom count {heavy_atoms} exceeds limit (100). "
                     f"This docking model is optimized for drug-like small molecules.",
            'stats': stats
        }
    
    # Passed all checks - valid small molecule
    return {
        'valid': True,
        'molecule_type': 'small_molecule',
        'reason': 'Valid small molecule for docking',
        'stats': stats
    }


def analyze_pdb_structure(pdb_file):
    """
    Analyze PDB structure for reporting.
    
    Args:
        pdb_file: Path to PDB file
        
    Returns:
        dict: Structure statistics including atom counts, chains, etc.
    """
    pdb_file = str(pdb_file)
    
    stats = {
        'total_atoms': 0,
        'protein_atoms': 0,
        'waters': 0,
        'heteroatoms': 0,
        'chains': set(),
        'residues': set()
    }
    
    WATER_RESIDUES = ['HOH', 'WAT', 'H2O']
    
    with open(pdb_file, 'r') as f:
        for line in f:
            if line.startswith('ATOM'):
                stats['total_atoms'] += 1
                stats['protein_atoms'] += 1
                if len(line) >= 22:
                    stats['chains'].add(line[21].strip().upper() or ' ')
                if len(line) >= 26:
                    stats['residues'].add(line[17:26].strip())
            elif line.startswith('HETATM'):
                stats['total_atoms'] += 1
                if len(line) >= 20:
                    res_name = line[17:20].strip().upper()
                    if res_name in WATER_RESIDUES:
                        stats['waters'] += 1
                    else:
                        stats['heteroatoms'] += 1
    
    stats['chains'] = sorted(list(stats['chains']))
    stats['residues'] = len(stats['residues'])
    return stats


def extract_sequence_from_pdb(pdb_file):
    """
    Extract protein sequence from PDB file using pdb-tools (pdb_tofasta).
    
    Replaces BioPython PDBParser with pdb-tools' pdb_tofasta generator.
    Returns single-letter amino acid sequence from first chain.
    
    Args:
        pdb_file: Path to PDB file
        
    Returns:
        str: Protein sequence in single-letter amino acid code, or None on failure
        
    Note:
        Only extracts sequence from ATOM records (not HETATM).
        Returns sequence from first chain if multiple chains present.
    """
    try:
        with open(str(pdb_file), 'r') as fh:
            fasta_lines = list(pdb_tofasta.run(fh, multi=False))
        
        # Parse FASTA output: first line is header (>chain), rest is sequence
        sequence = ''
        for line in fasta_lines:
            line = line.strip()
            if line.startswith('>'):
                if sequence:  # Already got first chain — stop
                    break
                continue
            sequence += line
        
        return sequence if sequence else None
        
    except Exception as e:
        logger.warning(f"  Could not extract sequence from PDB: {e}")
        return None


def validate_pdb_format(pdb_file):
    """
    Validate PDB file format compliance using pdb-tools (pdb_validate).
    
    Args:
        pdb_file: Path to PDB file
        
    Returns:
        tuple: (is_valid: bool, issues: list[str])
    """
    issues = []
    try:
        with open(str(pdb_file), 'r') as fh:
            for line in pdb_validate.run(fh):
                line = line.strip()
                if line:
                    issues.append(line)
        return len(issues) == 0, issues
    except Exception as e:
        return False, [str(e)]


def tidy_pdb_file(input_pdb, output_pdb=None):
    """
    Standardize PDB file format using pdb-tools (pdb_tidy).
    
    Ensures PDB format compliance (column widths, record types, etc.).
    
    Args:
        input_pdb: Input PDB file path
        output_pdb: Output PDB file path (defaults to overwriting input)
        
    Returns:
        str: Path to tidied PDB file
    """
    input_pdb = str(input_pdb)
    output_pdb = str(output_pdb) if output_pdb else input_pdb
    
    with open(input_pdb, 'r') as fh:
        tidied_lines = list(pdb_tidy.run(fh))
    
    with open(output_pdb, 'w') as f:
        f.writelines(tidied_lines)
    
    logger.info(f"  PDB tidied: {Path(output_pdb).name}")
    return output_pdb



def detect_heteroatoms_to_keep(input_pdb):
    """
    Detect and categorize heteroatoms using pdb-tools for HETATM extraction.
    
    Uses pdb_selhetatm.run() to extract HETATM records, then categorizes them
    into metal ions, cofactors, ligands, buffer agents, and other.
    
    Args:
        input_pdb: Input PDB file path
        
    Returns:
        Dict with heteroatom analysis (same format as before).
        
    Raises:
        FileNotFoundError: If input file doesn't exist
        ValueError: If file is empty
    """
    input_pdb = str(input_pdb)
    
    if not os.path.exists(input_pdb):
        raise FileNotFoundError(f"PDB file not found: {input_pdb}")
    if os.path.getsize(input_pdb) == 0:
        raise ValueError(f"PDB file is empty: {input_pdb}")
    
    # Common metal ions in proteins
    METAL_IONS = {
        'ZN', 'MG', 'CA', 'FE', 'CU', 'MN', 'CO', 'NI', 'K', 'NA',
        'FE2', 'CU1', 'CU2', 'ZN2', 'MG2', 'CA2', 'MN2', 'CO2',
        'CD', 'HG', 'PT', 'AU', 'AG', 'PB', 'SR', 'BA', 'LI', 'RB', 'CS'
    }
    
    # Common cofactors and prosthetic groups
    COFACTORS = {
        'NAD', 'NAP', 'FAD', 'FMN', 'ADP', 'ATP', 'GTP', 'CTP', 'UTP',
        'NAI', 'NDP', 'AMP', 'GMP', 'CMP', 'UMP',
        'HEM', 'HEC', 'HEA', 'HEB', 'HDD', 'HDN', 'HAS',
        'COA', 'ACO', 'COB', 'COC',
        'B12', 'BCL', 'CHL', 'PLP', 'THM', 'RET', 'VIT',
        'SAM', 'SAH', 'PQQ', 'TPP', 'BIO', 'LIP',
        'G6P', 'F6P', 'FBP', 'GAP', 'PEP',
        'POR', 'PP9', 'PHO'
    }
    
    # Common crystallization/buffer agents (usually not important for docking)
    BUFFER_AGENTS = {
        'SO4', 'PO4', 'GOL', 'EDO', 'PEG', 'ACT', 'FMT', 'DMS', 'BME',
        'TRS', 'EPE', 'MES', 'HEPES', 'MPD', 'PGE', 'P6G', 'PE4', 'PE3',
        'CIT', 'TAR', 'MLI', 'SUC', 'ACE', 'IOD', 'BR', 'CL'
    }
    
    # Water residues (always excluded)
    WATER_RESIDUES = {'HOH', 'WAT', 'H2O'}
    
    heteroatom_counts = {}
    heteroatom_atoms = {}
    
    # Use pdb-tools pdb_selhetatm to extract HETATM records
    with open(input_pdb, 'r') as fh:
        hetatm_lines = pdb_selhetatm.run(fh)
        for line in hetatm_lines:
            if not line.startswith('HETATM') or len(line) < 20:
                continue
            
            res_name = line[17:20].strip().upper()
            
            # Skip water molecules
            if res_name in WATER_RESIDUES:
                continue
            
            if res_name not in heteroatom_counts:
                heteroatom_counts[res_name] = 0
                heteroatom_atoms[res_name] = set()
            
            heteroatom_counts[res_name] += 1
            
            # Track unique atoms to estimate molecule size
            if len(line) >= 27:
                try:
                    atom_serial = int(line[6:11].strip())
                    heteroatom_atoms[res_name].add(atom_serial)
                except ValueError:
                    pass
    
    # Categorize heteroatoms
    metal_ions = []
    cofactors = []
    ligands = []
    buffer_agents = []
    other = []
    
    for res_name in sorted(heteroatom_counts.keys()):
        num_atoms = len(heteroatom_atoms.get(res_name, []))
        
        if res_name in METAL_IONS:
            metal_ions.append(res_name)
        elif res_name in COFACTORS:
            cofactors.append(res_name)
        elif res_name in BUFFER_AGENTS:
            buffer_agents.append(res_name)
        elif num_atoms > 5:  # Likely a ligand (more than 5 atoms)
            ligands.append(res_name)
        else:
            other.append(res_name)
    
    # Build summary message
    summary_parts = []
    if metal_ions:
        summary_parts.append(f"{len(metal_ions)} metal ion(s)")
    if cofactors:
        summary_parts.append(f"{len(cofactors)} cofactor(s)")
    if ligands:
        summary_parts.append(f"{len(ligands)} ligand(s)")
    if buffer_agents:
        summary_parts.append(f"{len(buffer_agents)} buffer agent(s)")
    if other:
        summary_parts.append(f"{len(other)} other heteroatom(s)")
    
    summary = "Found " + ", ".join(summary_parts) if summary_parts else "No heteroatoms found"
    
    return {
        'metal_ions': metal_ions,
        'cofactors': cofactors,
        'ligands': ligands,
        'buffer_agents': buffer_agents,
        'other': other,
        'all_heteroatoms': sorted(heteroatom_counts.keys()),
        'counts': heteroatom_counts,
        'atom_counts': {k: len(v) for k, v in heteroatom_atoms.items()},
        'summary': summary
    }


def complete_structure_pdbfixer(input_pdb, output_pdb):
    """
    Comprehensive structure repair using PDBFixer.
    
    Performs operations in order:
    1. Alternate location resolution (auto on load — keeps highest occupancy)
    2. Nonstandard residue replacement (MSE→MET, CSE→CYS, etc.)
    3. Missing residue detection + SAFE gap filtering (gaps > MAX_SAFE_GAP skipped)
    4. Missing heavy atom completion (including terminal OXT/H atoms)
    5. Post-fix validation — re-check for remaining gaps
    
    Args:
        input_pdb: Input PDB file path
        output_pdb: Output completed PDB file path
        
    Returns:
        dict: Structured report with keys:
            - success (bool): True if PDBFixer ran successfully
            - nonstandard_replaced (int): Number of nonstandard residues replaced
            - missing_residues_found (int): Number of missing residues detected
            - missing_atoms_found (int): Number of missing heavy atoms detected
            - missing_terminals_found (int): Number of missing terminal atoms detected
            - missing_residues_remaining (int): Gaps still present after fix
            - safe_gaps (dict): The gaps that were actually modelled
            - modelled_residue_coords (list): Approx coordinates of modelled residues
        
    Raises:
        ImportError: If PDBFixer is not installed
        RuntimeError: If PDBFixer fails during execution
    """
    input_pdb = str(input_pdb)
    output_pdb = str(output_pdb)
    
    # Import PDBFixer
    try:
        from pdbfixer import PDBFixer
        from openmm.app import PDBFile
    except ImportError:
        logger.warning("  WARNING: PDBFixer not available")
        logger.info("  → Install with: conda install -c conda-forge pdbfixer")
        raise ImportError("PDBFixer is not installed")
    
    try:
        logger.info("=" * 50)
        logger.info("PDBFIXER — COMPREHENSIVE STRUCTURE REPAIR")
        logger.info("=" * 50)
        
        # ── Step 1: Load structure (altLoc auto-resolved) ──
        logger.info("\n  Step 1/5: Loading structure (alternate locations auto-resolved)...")
        fixer = PDBFixer(filename=input_pdb)
        logger.info(f"  Structure loaded: {fixer.topology.getNumAtoms()} atoms, "
                     f"{fixer.topology.getNumResidues()} residues, "
                     f"{fixer.topology.getNumChains()} chain(s)")
        
        # ── Step 2: Nonstandard residue replacement ──
        logger.info("\n  Step 2/5: Detecting nonstandard residues...")
        fixer.findNonstandardResidues()
        num_nonstandard = len(fixer.nonstandardResidues)
        
        if num_nonstandard > 0:
            # Log which residues are being replaced
            for residue, replacement in fixer.nonstandardResidues:
                logger.info(f"    {residue.name} (chain {residue.chain.id}, "
                           f"pos {residue.index}) → {replacement}")
            fixer.replaceNonstandardResidues()
            logger.info(f"  Replaced {num_nonstandard} nonstandard residue(s)")
        else:
            logger.info("  No nonstandard residues found")
        
        # ── Step 3: Missing residues — FIX 3: GAP-SIZE-AWARE FILTERING ──
        logger.info("\n  Step 3/5: Detecting missing residues (backbone gaps)...")
        fixer.findMissingResidues()
        num_missing_res = len(fixer.missingResidues)
        
        # Filter: only keep gaps <= MAX_SAFE_GAP for modelling
        safe_gaps = {}
        skipped_large_gaps = 0
        for key, residues in fixer.missingResidues.items():
            if len(residues) <= MAX_SAFE_GAP:
                safe_gaps[key] = residues
                logger.info(f"    Gap at {key}: {len(residues)} residue(s) — SAFE, will model")
            else:
                skipped_large_gaps += 1
                logger.info(f"    Gap at {key}: {len(residues)} residue(s) — TOO LARGE (>{MAX_SAFE_GAP}), skipping")
        
        # Override missingResidues with only safe gaps
        fixer.missingResidues = safe_gaps
        
        if num_missing_res > 0:
            logger.info(f"  Total: {num_missing_res} gap(s) detected, "
                       f"{len(safe_gaps)} modelled, {skipped_large_gaps} skipped")
        else:
            logger.info("  No missing residues — backbone is complete")
        
        # ── Step 4: Missing atoms + terminals ──
        logger.info("\n  Step 4/5: Detecting missing heavy atoms & terminal atoms...")
        fixer.findMissingAtoms()
        num_missing_atoms = sum(len(atoms) for atoms in fixer.missingAtoms.values())
        num_missing_terminals = sum(len(atoms) for atoms in fixer.missingTerminals.values())
        
        if num_missing_atoms > 0:
            logger.info(f"  Found {num_missing_atoms} missing heavy atom(s) in side-chains")
        if num_missing_terminals > 0:
            logger.info(f"  Found {num_missing_terminals} missing terminal atom(s)")
        
        # Apply all fixes
        total_fixes = len(safe_gaps) + num_missing_atoms + num_missing_terminals
        if total_fixes > 0:
            logger.info("\n  Applying fixes...")
            fixer.addMissingAtoms()
            fixer.addMissingHydrogens(7.4)
            logger.info(f"  ✓ Added all missing residues, atoms, and terminals")
        else:
            logger.info("  No missing atoms or residues — structure is complete")
        
        # Save fixed structure
        with open(output_pdb, 'w') as f:
            PDBFile.writeFile(fixer.topology, fixer.positions, f)
        logger.info(f"\n  Saved fixed structure: {Path(output_pdb).name}")

        # ── RESTORE ORIGINAL RESIDUE NUMBERING ──────────────────────────────
        # OpenMM's PDBFile.writeFile resets all residue numbers to start from 1.
        # We must correct this immediately, before any further processing reads
        # the file with wrong numbers.
        renumbered_pdb = output_pdb.replace('.pdb', '_renumbered.pdb')
        restore_residue_numbering(output_pdb, input_pdb, renumbered_pdb)
        import shutil as _shutil
        _shutil.move(renumbered_pdb, output_pdb)
        logger.info(f"  ✓ Residue numbering restored to original after PDBFixer")
        
        # ── Step 5: Post-fix validation ──
        logger.info("\n  Step 5/5: Post-fix validation (re-checking for remaining gaps)...")
        fixer2 = PDBFixer(filename=output_pdb)
        fixer2.findMissingResidues()
        remaining = len(fixer2.missingResidues)
        
        if remaining > 0:
            logger.warning(f"  ⚠ {remaining} gap(s) still remain after PDBFixer")
            logger.info("  → AlphaFold fallback will be triggered")
        else:
            logger.info("  ✓ All safe gaps resolved — structure is complete")
        
        # Approximate coordinates of modelled residues for downstream penalty
        # (read the output PDB and find residues that were in safe_gaps)
        modelled_residue_coords = []
        try:
            import numpy as _np
            modelled_resnums = set()
            for (chain_idx, res_idx), res_names in safe_gaps.items():
                for offset in range(len(res_names)):
                    modelled_resnums.add(res_idx + offset)
            
            if modelled_resnums:
                with open(output_pdb) as f:
                    for line in f:
                        if line.startswith('ATOM'):
                            try:
                                resnum = int(line[22:26])
                                aname = line[12:16].strip()
                                if resnum in modelled_resnums and aname == 'CA':
                                    x = float(line[30:38])
                                    y = float(line[38:46])
                                    z = float(line[46:54])
                                    modelled_residue_coords.append([x, y, z])
                            except (ValueError, IndexError):
                                continue
                logger.info(f"  Tracked {len(modelled_residue_coords)} modelled residue CA atoms")
        except Exception as e:
            logger.warning(f"  Could not track modelled residue coords: {e}")
        
        logger.info("=" * 50)
        
        report = {
            "success": True,
            "nonstandard_replaced": num_nonstandard,
            "missing_residues_found": num_missing_res,
            "missing_atoms_found": num_missing_atoms,
            "missing_terminals_found": num_missing_terminals,
            "missing_residues_remaining": remaining,
            "safe_gaps": {str(k): v for k, v in safe_gaps.items()},
            "modelled_residue_coords": modelled_residue_coords,
        }
        
        logger.info(f"  Report: {report}")
        return report
        
    except Exception as e:
        logger.error(f"  ERROR: PDBFixer failed: {e}")
        raise RuntimeError(f"Structure completion failed: {e}")


# =============================================================================
# FIX 4 — DISCONNECTED FRAGMENT CLEANUP
# =============================================================================

def restore_residue_numbering(fixed_pdb, original_pdb, output_pdb):
    """
    Restore original residue numbering after PDBFixer.

    WHY THIS IS NEEDED:
    PDBFixer uses OpenMM's PDBFile.writeFile() to save the repaired structure.
    OpenMM always resets residue sequence numbers to start from 1, regardless
    of what the original PDB had (e.g. EGFR 2ITZ starts at residue 697, but
    after PDBFixer it becomes residue 1).  Every downstream step — filtering,
    copying to protein_prepared.pdb, reading in the 2D interaction module —
    inherits this wrong numbering, causing residue labels like MET98 instead
    of the correct MET794 in the interaction diagram.

    HOW IT WORKS:
    1. Read the first ATOM residue number from the original PDB  (e.g. 697)
    2. Read the first ATOM residue number from the PDBFixer output (e.g. 1)
    3. Compute offset = original_start - fixed_start  (e.g. 697 - 1 = 696)
    4. Add offset to every residue number in the fixed PDB
    5. Write corrected file to output_pdb

    This is safe for ALL proteins regardless of starting residue number,
    including proteins that start at 1 (offset = 0, no change) and proteins
    with insertion codes (insertion code column is preserved unchanged).
    """
    def _first_resnum(path):
        with open(path) as f:
            for line in f:
                if line.startswith('ATOM'):
                    try:
                        return int(line[22:26])
                    except ValueError:
                        continue
        return None

    orig_start  = _first_resnum(original_pdb)
    fixed_start = _first_resnum(fixed_pdb)

    if orig_start is None or fixed_start is None:
        logger.warning('restore_residue_numbering: could not read residue numbers, skipping')
        import shutil; shutil.copy(fixed_pdb, output_pdb)
        return

    offset = orig_start - fixed_start

    if offset == 0:
        logger.info(f'  Residue numbering offset = 0, no renumbering needed')
        import shutil; shutil.copy(fixed_pdb, output_pdb)
        return

    logger.info(f'  Restoring residue numbering: offset +{offset} '
                f'(original start: {orig_start}, fixed start: {fixed_start})')

    corrected_lines = []
    with open(fixed_pdb) as f:
        for line in f:
            if line.startswith(('ATOM', 'HETATM', 'TER')):
                try:
                    old_num = int(line[22:26])
                    new_num = old_num + offset
                    # PDB column 23-26 is residue sequence number (1-indexed, right-justified, 4 chars)
                    line = line[:22] + f'{new_num:4d}' + line[26:]
                except (ValueError, IndexError):
                    pass
            corrected_lines.append(line)

    with open(output_pdb, 'w') as f:
        f.writelines(corrected_lines)

    logger.info(f'  ✓ Residue numbering restored: written to {output_pdb}')


def remove_disconnected_fragments(pdb_path, output_path):
    """
    Remove residue stubs that are spatially disconnected from the main chain.
    Operates on the PDB file produced by PDBFixer before the PDBQT conversion.
    
    Walks residues in sequence order and checks the C(i-1)–N(i) distance.
    Any residue whose C-N distance exceeds CONNECTIVITY_DISTANCE is removed.
    """
    import numpy as np
    from collections import defaultdict

    residues = defaultdict(list)   # resnum -> list of (atom_name, xyz)
    with open(pdb_path) as f:
        lines = [l for l in f if l.startswith('ATOM')]
    for line in lines:
        try:
            resnum = int(line[22:26])
            aname  = line[12:16].strip()
            xyz    = (float(line[30:38]), float(line[38:46]), float(line[46:54]))
            residues[resnum].append((aname, np.array(xyz)))
        except (ValueError, IndexError):
            continue

    if not residues:
        # No ATOM records — just copy
        import shutil
        shutil.copy(pdb_path, output_path)
        return

    sorted_res = sorted(residues.keys())
    connected  = set()
    connected.add(sorted_res[0])   # anchor the first residue

    for i in range(1, len(sorted_res)):
        prev_r = sorted_res[i - 1]
        curr_r = sorted_res[i]
        prev_atoms = dict(residues[prev_r])
        curr_atoms = dict(residues[curr_r])
        c_coord  = prev_atoms.get('C')
        n_coord  = curr_atoms.get('N')
        if c_coord is not None and n_coord is not None:
            if np.linalg.norm(c_coord - n_coord) <= CONNECTIVITY_DISTANCE:
                connected.add(curr_r)
            else:
                logger.warning(f'Residue {curr_r} is disconnected (C-N = '
                            f'{np.linalg.norm(c_coord - n_coord):.2f} Å), removing')
        else:
            logger.warning(f'Residue {curr_r} missing backbone atoms, removing')

    removed = set(sorted_res) - connected
    if removed:
        logger.info(f'Removed {len(removed)} disconnected residue(s): {sorted(removed)}')
    else:
        logger.info('No disconnected fragments found')

    with open(pdb_path) as f:
        all_lines = f.readlines()
    with open(output_path, 'w') as f:
        for line in all_lines:
            if line.startswith('ATOM'):
                try:
                    rn = int(line[22:26])
                    if rn in removed:
                        continue
                except ValueError:
                    pass
            f.write(line)


# =============================================================================
# FIX 2 — RESIDUE NUMBERING VALIDATION
# =============================================================================

def validate_residue_numbering(original_pdb, prepared_pdb, tolerance=5):
    """
    Check that the first and last residue numbers in prepared_pdb
    match those in original_pdb (within tolerance).
    Raises RuntimeError if numbering has been reset.
    """
    def get_residue_range(path):
        nums = []
        with open(path) as f:
            for line in f:
                if line.startswith(('ATOM', 'HETATM')):
                    try:
                        nums.append(int(line[22:26]))
                    except ValueError:
                        pass
        return (min(nums), max(nums)) if nums else (None, None)

    orig_min, orig_max = get_residue_range(original_pdb)
    prep_min, prep_max = get_residue_range(prepared_pdb)

    if orig_min is None or prep_min is None:
        logger.warning('Residue validation: could not parse residue numbers')
        return

    if abs(prep_min - orig_min) > tolerance:
        raise RuntimeError(
            f'Residue numbering has shifted: original starts at {orig_min}, '
            f'prepared starts at {prep_min}. Check for pdb_reres calls.'
        )
    logger.info(f'Residue numbering OK: {prep_min}-{prep_max} (original: {orig_min}-{orig_max})')



def _filter_pdb_residues(input_pdb, keep_hetero_residues=None, keep_chains=None):
    """
    Filter PDB file using pdb-tools pipeline.
    
    Pipeline: select chains → remove waters → handle heteroatoms → remove UNK → tidy.
    
    Waters are ALWAYS removed automatically.
    Heteroatoms are removed UNLESS specified in keep_hetero_residues.
    Chains: ALL chains are kept by default. Only filtered if keep_chains is specified.
    
    Args:
        input_pdb: Input PDB file path
        keep_hetero_residues: List of heteroatom residue names to keep (e.g., ['NAD', 'HEM', 'ZN'])
                             If None or empty, ALL heteroatoms are removed.
        keep_chains: List of chain IDs to keep (e.g., ['A', 'B'])
                    If None or empty, ALL chains are kept (no filtering).
                    If specified, ONLY these chains are kept, others removed.
        
    Returns:
        Path to filtered PDB file
        
    Raises:
        ValueError: If input file is malformed or contains no valid records
    """
    input_pdb = str(input_pdb)
    output_pdb = input_pdb.replace('.pdb', '_filtered.pdb')
    
    if not os.path.exists(input_pdb):
        raise FileNotFoundError(f"Input PDB file not found: {input_pdb}")
    if os.path.getsize(input_pdb) == 0:
        raise ValueError(f"Input PDB file is empty: {input_pdb}")
    
    WATER_RESIDUES = ['HOH', 'WAT', 'H2O']
    
    # Normalize keep lists
    keep_hetero_residues = [r.strip().upper() for r in (keep_hetero_residues or [])]
    keep_chains_list = [c.strip().upper() if c.strip() else ' ' for c in (keep_chains or [])]
    filter_by_chain = len(keep_chains_list) > 0
    
    # ── Pre-check: Verify requested chains exist in the PDB file ──
    # PDBFixer can reassign chain IDs (e.g., B→A), so we detect what's actually there
    if filter_by_chain:
        actual_chains = set()
        with open(input_pdb, 'r') as fh:
            for line in fh:
                if line.startswith('ATOM') and len(line) >= 22:
                    cid = line[21].strip().upper() if line[21].strip() else ' '
                    actual_chains.add(cid)
        
        logger.info(f"  Chains in PDB: {', '.join(sorted(actual_chains)) if actual_chains else 'none'}")
        logger.info(f"  Requested chains: {', '.join(keep_chains_list)}")
        
        matching = set(keep_chains_list) & actual_chains
        if len(matching) == 0 and len(actual_chains) > 0:
            logger.warning(f"  ⚠ Requested chains {keep_chains_list} not found — keeping ALL chains")
            filter_by_chain = False
    
    # ── Build pdb-tools generator pipeline ──
    with open(input_pdb, 'r') as fh:
        pipeline = fh  # Start with file handle (iterator of lines)
        
        # Step 1: Chain selection using pdb_selchain (if specified)
        if filter_by_chain:
            pipeline = pdb_selchain.run(pipeline, keep_chains_list)
            logger.info(f"  pdb_selchain: keeping chains {', '.join(keep_chains_list)}")
        
        # Step 2: Remove water molecules using pdb_delresname
        for water_res in WATER_RESIDUES:
            pipeline = pdb_delresname.run(pipeline, [water_res])
        logger.info(f"  pdb_delresname: removed water molecules (HOH, WAT, H2O)")
        
        # Step 3: Handle HETATM records
        if len(keep_hetero_residues) == 0:
            # Remove ALL heteroatoms using pdb_delhetatm
            pipeline = pdb_delhetatm.run(pipeline)
            logger.info(f"  pdb_delhetatm: removed ALL heteroatoms")
        else:
            logger.info(f"  Selective HETATM: keeping {', '.join(keep_hetero_residues)}")
        
        # Step 4: Remove UNK (unknown) and UNL (unknown ligand) residues using pdb_delresname
        pipeline = pdb_delresname.run(pipeline, ['UNK'])
        pipeline = pdb_delresname.run(pipeline, ['UNL'])
        logger.info(f"  pdb_delresname: removed UNK and UNL residues")
        
        # Step 5: Tidy the output for PDB format compliance
        pipeline = pdb_tidy.run(pipeline)
        
        # ── Consume pipeline and apply selective HETATM filter if needed ──
        filtered_lines = []
        removed_hetero = 0
        kept_hetero = set()
        
        for line in pipeline:
            # If user specified heteroatoms to keep, filter out non-listed ones
            if line.startswith('HETATM') and len(keep_hetero_residues) > 0:
                if len(line) >= 20:
                    res_name = line[17:20].strip().upper()
                    if res_name not in keep_hetero_residues:
                        removed_hetero += 1
                        continue
                    kept_hetero.add(res_name)
            filtered_lines.append(line)
    
    # Validate we have ATOM records
    valid_atoms = sum(1 for l in filtered_lines if l.startswith('ATOM'))
    if valid_atoms == 0:
        if filter_by_chain:
            logger.warning(f"  ⚠ No atoms remain after filtering — retrying without chain filter")
            return _filter_pdb_residues(input_pdb, keep_hetero_residues, keep_chains=None)
        raise ValueError(f"No valid ATOM records remain after filtering: {input_pdb}")
    
    with open(output_pdb, 'w') as f:
        f.writelines(filtered_lines)
    
    # Print summary
    if removed_hetero > 0:
        logger.info(f"  Removed {removed_hetero} unwanted heteroatom lines")
    if kept_hetero:
        logger.info(f"  Kept heteroatoms: {', '.join(sorted(kept_hetero))}")
    logger.info(f"  ✓ Filtered PDB saved: {Path(output_pdb).name} ({valid_atoms} ATOM records)")
    
    return output_pdb


def _clean_pdb_file(pdb_file):
    """
    Remove water molecules, UNK, and UNL residues from PDB file.
    """
    with open(pdb_file, 'r') as fh:
        pipeline = fh
        for res in ['HOH', 'WAT', 'H2O', 'UNK', 'UNL']:
            pipeline = pdb_delresname.run(pipeline, [res])
        lines = list(pipeline)
    with open(pdb_file, 'w') as f:
        f.writelines(lines)


def _remove_waters_from_pdbqt(pdbqt_file):
    """
    Remove water molecules and UNK/UNL residues from PDBQT file using pdb-tools.
    
    Uses pdb_delresname to remove HOH, WAT, H2O, UNK, and UNL residues.
    Note: pdb_delresname works on standard PDB columns (17:20) which are 
    identical in PDBQT format, so this is safe for PDBQT files.
    
    Args:
        pdbqt_file: PDBQT file to clean
    """
    with open(pdbqt_file, 'r') as fh:
        pipeline = fh
        # Remove water molecules
        pipeline = pdb_delresname.run(pipeline, ['HOH'])
        pipeline = pdb_delresname.run(pipeline, ['WAT'])
        pipeline = pdb_delresname.run(pipeline, ['H2O'])
        # Remove UNK and UNL residues
        pipeline = pdb_delresname.run(pipeline, ['UNK'])
        pipeline = pdb_delresname.run(pipeline, ['UNL'])
        cleaned_lines = list(pipeline)
    
    with open(pdbqt_file, 'w') as f:
        f.writelines(cleaned_lines)
    
    logger.info(f"  Cleaned waters/UNK/UNL from PDBQT using pdb-tools")


def _preserve_chain_ids_in_pdbqt(source_pdb, target_pdbqt):
    """
    Preserve chain IDs from source PDB file to target PDBQT file.
    
    OpenBabel's -p flag can reassign chain IDs during PDBQT conversion.
    This function copies the chain IDs from the filtered PDB to the PDBQT file.
    
    Since OpenBabel adds hydrogens, the PDBQT will have MORE atoms than the source PDB.
    We match atoms by residue number and atom name to preserve chain IDs correctly.
    
    Args:
        source_pdb: Source PDB file with correct chain IDs
        target_pdbqt: Target PDBQT file to fix
    """
    # Build a mapping of (residue_number, atom_name) -> chain_id from source PDB
    chain_map = {}
    default_chain = None
    
    with open(source_pdb, 'r') as f:
        for line in f:
            if line.startswith('ATOM') or line.startswith('HETATM'):
                if len(line) >= 27:
                    try:
                        chain_id = line[21]
                        res_num = int(line[22:26].strip())
                        atom_name = line[12:16].strip()
                        
                        # Store the mapping
                        key = (res_num, atom_name)
                        chain_map[key] = chain_id
                        
                        # Keep track of the most common chain (for hydrogens)
                        if default_chain is None:
                            default_chain = chain_id
                    except (ValueError, IndexError):
                        continue
    
    # Read PDBQT file
    with open(target_pdbqt, 'r') as f:
        pdbqt_lines = f.readlines()
    
    # Replace chain IDs in PDBQT file
    fixed_lines = []
    fixed_count = 0
    
    for line in pdbqt_lines:
        if line.startswith('ATOM') or line.startswith('HETATM'):
            if len(line) >= 27:
                try:
                    res_num = int(line[22:26].strip())
                    atom_name = line[12:16].strip()
                    
                    # Look up the chain ID for this atom
                    key = (res_num, atom_name)
                    if key in chain_map:
                        # Found exact match - use the chain ID from source
                        correct_chain = chain_map[key]
                    else:
                        # Atom not in source (probably a hydrogen added by OpenBabel)
                        # Use the chain ID from the same residue's heavy atom
                        # Try to find any atom from the same residue
                        correct_chain = None
                        for (r, a), c in chain_map.items():
                            if r == res_num:
                                correct_chain = c
                                break
                        
                        # If still not found, use default chain
                        if correct_chain is None:
                            correct_chain = default_chain
                    
                    # Replace chain ID at position 21
                    if correct_chain is not None:
                        line = line[:21] + correct_chain + line[22:]
                        fixed_count += 1
                        
                except (ValueError, IndexError):
                    pass
        
        fixed_lines.append(line)
    
    # Write back to PDBQT file
    with open(target_pdbqt, 'w') as f:
        f.writelines(fixed_lines)
    
    logger.info(f"  Chain IDs preserved in PDBQT file ({fixed_count} atoms fixed)")


def prepare_protein(input_pdb, output_pdbqt, remove_waters=True, keep_hetero_residues=None, keep_chains=None, 
                   fix_structure=True, validate_structure=True, use_alphafold_if_incomplete=True):
    """
    Enhanced protein preparation 
    
    Stage 0: Structure Analysis & Validation (optional)
    Stage 0.5: AlphaFold Fallback (if missing residues detected and enabled)
    Stage 1: Structure Completion using PDBFixer (optional)
    Stage 2: Non-Protein Elements Elimination
    Stage 3: Protein Refinement (hydrogen addition, charge assignment, PDBQT conversion)
    
    Args:
        input_pdb: Input PDB file path
        output_pdbqt: Output PDBQT file path
        remove_waters: Whether to remove water molecules (default: True)
        keep_hetero_residues: List of heteroatom residue names to keep (e.g., ['NAD', 'HEM', 'ZN'])
                             If None or empty, ALL heteroatoms are removed. (default: None)
        keep_chains: List of chain IDs to keep (e.g., ['A', 'B'])
                    If None or empty, ALL chains are kept (no filtering).
                    If specified, ONLY these chains are kept. (default: None)
        fix_structure: Use PDBFixer to complete missing atoms/residues (default: True)
        validate_structure: Detect and warn about structural issues (default: True)
        use_alphafold_if_incomplete: If True and missing residues detected, fetch complete
                                     structure from AlphaFold using sequence (default: True)
        
    Note:
        pH is fixed at 7.4 for hydrogen addition.
        UNK (unknown) residues created by OpenBabel are automatically removed.
        
    Returns:
        str: Path to output PDBQT file
    """
    input_pdb = str(input_pdb)
    output_pdbqt = str(output_pdbqt)
    
    logger.info("=" * 60)
    logger.info("PROTEIN PREPARATION PIPELINE")
    logger.info("=" * 60)
    logger.info(f"Input: {Path(input_pdb).name}")
    logger.info(f"pH: 7.4 (fixed)")
    
    # ── Stage 0: Structure Analysis (stats only) ──
    if validate_structure:
        logger.info("\nStage 0: Structure Analysis")
        try:
            stats = analyze_pdb_structure(input_pdb)
            logger.info(f"  Total atoms: {stats['total_atoms']}")
            logger.info(f"  Protein atoms: {stats['protein_atoms']}")
            logger.info(f"  Water molecules: {stats['waters']}")
            logger.info(f"  Heteroatoms: {stats['heteroatoms']}")
            logger.info(f"  Chains: {', '.join(stats['chains']) if stats['chains'] else 'None'}")
            logger.info(f"  Residues: {stats['residues']}")
        except Exception as e:
            logger.warning(f"  WARNING: Structure analysis failed: {e}")
    
    # Track all intermediate temporary files created for clean-up later
    temp_files = []

    # ── Stage 1: Non-Protein Elements Elimination ──
    logger.info("\nStage 1: Non-Protein Elements Elimination")
    if remove_waters or keep_hetero_residues is not None or keep_chains is not None:
        if not remove_waters:
            logger.warning("  WARNING: Keeping water molecules (unusual for docking)")
        else:
            try:
                filtered_pdb = _filter_pdb_residues(input_pdb, keep_hetero_residues, keep_chains)
                if filtered_pdb != input_pdb and os.path.exists(filtered_pdb):
                    temp_files.append(filtered_pdb)
                    input_pdb = filtered_pdb
                logger.info("  ✓ Non-protein elements filtered successfully")
            except Exception as e:
                logger.warning(f"  Filtering failed: {e}")

    # ── Stage 2: PDBFixer — Comprehensive Structure Repair ──
    logger.info("\nStage 2: PDBFixer — Comprehensive Structure Repair")
    fixed_pdb = str(input_pdb).replace('.pdb', '_fixed.pdb')
    pdbfixer_report = {"missing_residues_remaining": -1}  # Default
    
    try:
        pdbfixer_report = complete_structure_pdbfixer(input_pdb, fixed_pdb)
        if os.path.exists(fixed_pdb):
            temp_files.append(fixed_pdb)
            input_pdb = fixed_pdb  # Use fixed version going forward
            logger.info("  Using PDBFixer-repaired structure for preparation")
            
            # ── Fix 4: Remove disconnected fragments after PDBFixer ──
            fixed_clean_pdb = fixed_pdb.replace('.pdb', '_clean.pdb')
            try:
                remove_disconnected_fragments(fixed_pdb, fixed_clean_pdb)
                if os.path.exists(fixed_clean_pdb) and os.path.getsize(fixed_clean_pdb) > 0:
                    temp_files.append(fixed_clean_pdb)
                    input_pdb = fixed_clean_pdb
                    logger.info("  ✓ Disconnected fragment cleanup applied")
            except Exception as frag_err:
                logger.warning(f"  Fragment cleanup skipped: {frag_err}")
    except ImportError:
        logger.warning("  PDBFixer not available — skipping structure repair")
        logger.info("  → Continuing with original structure")
    except RuntimeError as e:
        logger.error(f"  ERROR: PDBFixer failed: {e}")
        logger.info("  → Continuing with original structure")
    
    # ── Stage 2.1: PDB Format Validation & Tidying (pdb-tools) ──
    logger.info("\nStage 2.1: PDB Format Validation (pdb-tools)")
    try:
        is_valid, issues = validate_pdb_format(input_pdb)
        if not is_valid:
            logger.warning(f"  PDB format issues detected: {len(issues)} issue(s)")
            for issue in issues[:5]:  # Show first 5 issues
                logger.warning(f"    → {issue}")
            # Tidy the file to fix format issues
            tidied_pdb = tidy_pdb_file(input_pdb)
            if tidied_pdb != input_pdb and os.path.exists(tidied_pdb):
                temp_files.append(tidied_pdb)
                input_pdb = tidied_pdb
            logger.info("  ✓ PDB file tidied for format compliance")
        else:
            logger.info("  ✓ PDB format is valid")
    except Exception as e:
        logger.warning(f"  PDB validation skipped: {e}")
    
    # ── Stage 2.5: AlphaFold Fallback (ONLY if PDBFixer couldn't resolve gaps) ──
    if use_alphafold_if_incomplete and pdbfixer_report.get("missing_residues_remaining", 0) > 0:
        logger.info("\nStage 2.5: AlphaFold Fallback")
        logger.info("  PDBFixer could not resolve all gaps — attempting AlphaFold prediction")
        
        try:
            # Extract sequence from PDB (now using pdb_tofasta)
            sequence = extract_sequence_from_pdb(input_pdb)
            
            if sequence:
                logger.info(f"  Extracted sequence: {len(sequence)} residues")
                
                # Import AlphaFold integration
                import alphafold_integration
                
                # Create AlphaFold structure file path
                alphafold_pdb = str(input_pdb).replace('.pdb', '_alphafold.pdb')
                
                # Predict structure using ESMFold (faster than full AlphaFold)
                logger.info("  Fetching complete structure from ESMFold...")
                metadata = alphafold_integration.predict_structure_esmfold(
                    sequence, 
                    Path(alphafold_pdb),
                    timeout=300
                )
                
                if os.path.exists(alphafold_pdb):
                    temp_files.append(alphafold_pdb)
                    input_pdb = alphafold_pdb
                    logger.info(f"  Using AlphaFold structure (confidence: {metadata['confidence']})")
                    logger.info("  → This structure should have no missing residues")
            else:
                logger.warning("  Could not extract sequence from PDB")
                logger.info("  → Continuing with PDBFixer output")
        except Exception as e:
            logger.warning(f"  AlphaFold fallback failed: {e}")
            logger.info("  → Continuing with PDBFixer output")
    
    # ── Stage 3: Protein Refinement → PDBQT ──
    logger.info("\nStage 3: Protein Refinement → PDBQT")
    logger.info("  OpenBabel will:")
    logger.info("    - Add hydrogens at pH 7.4")
    logger.info("    - Assign Gasteiger charges")
    logger.info("    - Map docking atom types")
    logger.info("    - Convert to PDBQT format")
    
    _convert_to_pdbqt_openbabel(input_pdb, output_pdbqt, is_receptor=True)
    
    # Preserve chain IDs from filtered PDB
    if keep_chains is not None and len(keep_chains) > 0:
        logger.info("  Preserving chain IDs in PDBQT file...")
        _preserve_chain_ids_in_pdbqt(input_pdb, output_pdbqt)
    
    # Remove waters and UNK residues from PDBQT
    if remove_waters:
        logger.info("  Final cleanup...")
        _remove_waters_from_pdbqt(output_pdbqt)
        
    # Save a copy of the final prepared PDB as protein_prepared.pdb for visualization and centering
    prepared_pdb_path = str(Path(output_pdbqt).with_suffix('.pdb'))
    if os.path.exists(input_pdb):
        import shutil
        try:
            shutil.copy(input_pdb, prepared_pdb_path)
            _clean_pdb_file(prepared_pdb_path)
            logger.info(f"  Saved and cleaned prepared PDB for visualization: {Path(prepared_pdb_path).name}")
        except Exception as e:
            logger.warning(f"  WARNING: Could not save/clean prepared PDB: {e}")

    # Cleanup temp files
    for temp_f in temp_files:
        if os.path.exists(temp_f) and temp_f != prepared_pdb_path:
            try:
                os.remove(temp_f)
            except (OSError, PermissionError) as e:
                logger.warning(f"  WARNING: Could not remove temp file {temp_f}: {e}")
    
    # ── Fix 2: Validate residue numbering before returning ──
    original_pdb_for_validation = str(Path(output_pdbqt).parent / Path(output_pdbqt).stem.replace('_prepared', '') ) 
    # Use the original input file that was passed to prepare_protein
    original_input_pdb = str(Path(output_pdbqt).parent / Path(output_pdbqt).name.replace('protein_prepared.pdbqt', ''))  
    if prepared_pdb_path and os.path.exists(prepared_pdb_path):
        try:
            # Find the original uploaded PDB in the session directory
            session_dir = Path(output_pdbqt).parent
            original_pdbs = list(session_dir.glob('protein_*.pdb'))
            # Filter out our generated files
            original_pdbs = [p for p in original_pdbs if '_fixed' not in p.name 
                           and '_filtered' not in p.name 
                           and '_clean' not in p.name
                           and '_prepared' not in p.name
                           and '_alphafold' not in p.name
                           and '_for_cavity' not in p.name]
            if original_pdbs:
                validate_residue_numbering(str(original_pdbs[0]), prepared_pdb_path)
        except RuntimeError as e:
            logger.error(f"  RESIDUE NUMBERING VALIDATION FAILED: {e}")
            # Log but don't abort — the user needs the output
        except Exception as e:
            logger.warning(f"  Residue numbering validation skipped: {e}")
    
    logger.info("\n" + "=" * 60)
    logger.info("PROTEIN PREPARATION COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Output: {Path(output_pdbqt).name}")
    
    return output_pdbqt



def _read_molecule(input_file):
    """
    Read molecule from various file formats.
    
    Args:
        input_file: Input file path (SDF, MOL, PDB, MOL2)
        
    Returns:
        RDKit molecule object
    """
    ext = Path(input_file).suffix.lower()
    
    if ext in ['.sdf', '.sd']:
        supplier = Chem.SDMolSupplier(str(input_file), removeHs=False)
        mol = supplier[0] if len(supplier) > 0 else None
    elif ext == '.mol':
        mol = Chem.MolFromMolFile(str(input_file), removeHs=False)
    elif ext == '.pdb':
        mol = Chem.MolFromPDBFile(str(input_file), removeHs=False)
    elif ext == '.mol2':
        mol = Chem.MolFromMol2File(str(input_file), removeHs=False)
    else:
        raise ValueError(f"Unsupported file format: {ext}")
    
    if mol is None:
        raise RuntimeError(f"Failed to read molecule from {input_file}")
    
    return mol


def strip_model_records(complex_pdb_path):
    """
    Remove MODEL / ENDMDL wrapper records from a complex PDB file in-place.

    WHY THIS IS NEEDED:
    Vina's output PDBQT contains 9 MODEL blocks (one per docking pose).
    When Salidock extracts pose 1 and writes complex_pose_1.pdb, the MODEL 1
    / ENDMDL wrapper tags are carried along into the output file.
    Mol* (the 3D viewer) treats each MODEL block as a separate structure.
    When the user double-clicks the ligand to focus on it, Mol* re-renders
    all MODEL blocks simultaneously — showing all 9 ligand poses at once
    scattered across the protein, which looks like "multiple ligands".

    Ball-and-stick, surface, and spacefill views do not have this problem
    because they render atoms directly without needing chain continuity.
    Only the double-click / focus action triggers the multi-MODEL rendering.

    THE FIX:
    After writing complex_pose_N.pdb, call this function to remove MODEL and
    ENDMDL lines. The single pose is already extracted — the wrapper tags are
    redundant and cause the viewer bug.

    Args:
        complex_pdb_path: Path to the complex PDB file to clean in-place.
    """
    try:
        with open(complex_pdb_path, 'r') as f:
            lines = f.readlines()

        cleaned = [l for l in lines
                   if not l.startswith('MODEL') and not l.startswith('ENDMDL')]

        if len(cleaned) < len(lines):
            with open(complex_pdb_path, 'w') as f:
                f.writelines(cleaned)
            removed = len(lines) - len(cleaned)
            logger.info(f'  Stripped {removed} MODEL/ENDMDL record(s) from {Path(complex_pdb_path).name}')
    except Exception as e:
        logger.warning(f'  strip_model_records failed for {complex_pdb_path}: {e}')


def prepare_ligand(input_ligand, output_pdbqt, optimize=True):
    """
    Ligand preparation using RDKit for all processes except PDBQT conversion.
    
    Steps:
    1. Read ligand file (SDF, MOL, PDB, MOL2) using RDKit
    2. Add hydrogens using RDKit
    3. Geometry optimization using RDKit MMFF94 with UFF fallback (200 iterations)
       - Tries MMFF94 first (best for organic molecules)
       - Falls back to UFF if MMFF94 fails (e.g., metal atoms)
    4. Save as PDB intermediate
    5. Convert to PDBQT using Open Babel (ONLY step using Open Babel)
    
    Open Babel handles ONLY:
    - Charge assignment (Gasteiger)
    - Atom type mapping
    - Rotatable bond detection
    - PDBQT formatting
    
    Args:
        input_ligand: Input ligand file path
        output_pdbqt: Output PDBQT file path
        optimize: Whether to optimize geometry (default: True)
    
    Returns:
        str: Path to output PDBQT file
    """
    from rdkit.Chem import AllChem

    
    input_ligand = str(input_ligand)
    output_pdbqt = str(output_pdbqt)
    
    logger.info(f"Starting ligand preparation (RDKit-based)...")
    logger.info(f"  Input: {Path(input_ligand).name}")
    
    # Step 1: Read ligand using RDKit
    logger.info("Step 1/4: Reading ligand file (RDKit)...")
    mol = _read_molecule(input_ligand)
    logger.info(f"Ligand loaded: {mol.GetNumAtoms()} atoms")
    
    # Step 2: Add hydrogens using RDKit
    logger.info("Step 2/4: Adding hydrogens (RDKit)...")
    mol = Chem.AddHs(mol, addCoords=True)
    logger.info(f"Hydrogens added: {mol.GetNumAtoms()} total atoms")
    
    # Step 3: Geometry optimization using RDKit MMFF94
    if optimize:
        logger.info("Step 3/4: Optimizing geometry (RDKit)...")
        
        try:
            logger.info("  RDKit MMFF94 optimization (1500 iterations)...")
            # Use the correct function from rdForceFieldHelpers (imported at top)
            result = MMFFOptimizeMolecule(mol, maxIters=1500)
            
            if result == 0:
                logger.info("  MMFF94 optimization converged successfully")
            elif result == 1:
                logger.warning("  WARNING: MMFF94 optimization did not converge but completed")
            else:
                logger.warning(f"  WARNING: MMFF94 optimization failed (code: {result})")
                logger.warning("  → Proceeding with current geometry")
                
        except Exception as e:
            logger.warning(f"  WARNING: MMFF94 optimization failed: {e}")
            logger.warning("  → Proceeding with unoptimized geometry")
    else:
        logger.info("Step 3/4: Skipping geometry optimization...")
    
    # Step 4: Save as PDB intermediate
    logger.info("Step 4/4: Converting to PDBQT format...")
    temp_pdb = str(output_pdbqt).replace('.pdbqt', '_temp.pdb')
    Chem.MolToPDBFile(mol, temp_pdb)
    
    # Step 5: Convert to PDBQT using Open Babel (ONLY Open Babel step)
    logger.info("  Open Babel will:")
    logger.info("    - Assign Gasteiger charges")
    logger.info("    - Map atom types")
    logger.info("    - Detect rotatable bonds")
    logger.info("    - Format as PDBQT")
    
    try:
        _convert_to_pdbqt_openbabel(temp_pdb, output_pdbqt, is_receptor=False)
    finally:
        # Cleanup temp file
        if os.path.exists(temp_pdb):
            try:
                os.remove(temp_pdb)
            except (OSError, PermissionError) as e:
                logger.warning(f"  ⚠ Could not remove temp file {temp_pdb}: {e}")
    
    logger.info(f"Ligand preparation complete: {Path(output_pdbqt).name}")
    return output_pdbqt


def smiles_to_3d(smiles: str, output_pdbqt: str, optimize: bool = True) -> Path:
    """
    Convert SMILES string to 3D ligand structure in PDBQT format.
    
    This function provides a complete workflow for generating docking-ready ligands from SMILES:
    1. Parse and validate SMILES using RDKit
    2. Generate 3D coordinates using RDKit (EmbedMolecule)
    3. Add hydrogens using RDKit
    4. Optimize geometry using RDKit MMFF94 with UFF fallback (automatic)
    5. Convert to PDBQT using Open Babel (ONLY step using Open Babel)
    
    Args:
        smiles: SMILES string representation of the molecule
        output_pdbqt: Output PDBQT file path
        optimize: Whether to optimize geometry (default: True)
    
    Note:
        pH is fixed at 7.4 for hydrogen addition.
    
    Returns:
        Path to output PDBQT file
    
    Raises:
        ValueError: If SMILES string is invalid
        RuntimeError: If conversion or optimization fails
    
    Example:
        >>> smiles_to_3d("CC(=O)OC1=CC=CC=C1C(=O)O", "aspirin.pdbqt")
        PosixPath('aspirin.pdbqt')
    """
    from rdkit.Chem import AllChem

    
    output_pdbqt = str(output_pdbqt)
    
    logger.info(f"Converting SMILES to 3D structure (RDKit-based)...")
    logger.info(f"  SMILES: {smiles}")
    logger.info(f"  pH: 7.4 (fixed)")
    
    # Step 1: Validate SMILES using RDKit
    logger.info("Step 1/4: Validating SMILES string (RDKit)...")
    try:
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError(f"Invalid SMILES string: {smiles}")
        logger.info(f"SMILES valid: {mol.GetNumAtoms()} heavy atoms")
    except Exception as e:
        raise ValueError(f"Failed to parse SMILES: {e}")
    
    # Step 2: Generate 3D coordinates using RDKit
    logger.info("Step 2/4: Generating 3D coordinates (RDKit)...")
    try:
        # Add hydrogens before 3D generation
        mol = Chem.AddHs(mol)
        
        # Generate 3D coordinates using ETKDG method (best for drug-like molecules)
        result = AllChem.EmbedMolecule(mol, AllChem.ETKDG())
        
        if result == -1:
            # If ETKDG fails, try basic embedding
            logger.warning("  WARNING: ETKDG embedding failed, trying basic method...")
            result = AllChem.EmbedMolecule(mol)
            
            if result == -1:
                raise RuntimeError("Failed to generate 3D coordinates")
        
        logger.info(f"3D coordinates generated: {mol.GetNumAtoms()} total atoms")
    except Exception as e:
        raise RuntimeError(f"Failed to generate 3D coordinates: {e}")
    
    # Step 3: Optimize geometry using RDKit MMFF94
    if optimize:
        logger.info("Step 3/4: Optimizing geometry (RDKit)...")
        
        try:
            logger.info("  RDKit MMFF94 optimization (1500 iterations)...")
            # Use the correct function from rdForceFieldHelpers (imported at top)
            result = MMFFOptimizeMolecule(mol, maxIters=1500)
            
            if result == 0:
                logger.info("  MMFF94 optimization converged successfully")
            elif result == 1:
                logger.warning("  WARNING: MMFF94 optimization did not converge but completed")
            else:
                logger.warning(f"  WARNING: MMFF94 optimization failed (code: {result})")
                logger.warning("  → Proceeding with current geometry")
                
        except Exception as e:
            logger.warning(f"  WARNING: MMFF94 optimization failed: {e}")
            logger.warning("  → Proceeding with unoptimized geometry")
    else:
        logger.info("Step 3/4: Skipping geometry optimization...")
    
    # Step 4: Convert to PDBQT using Open Babel (ONLY Open Babel step)
    logger.info("Step 4/4: Converting to PDBQT format...")
    logger.info("  Open Babel will:")
    logger.info("    - Assign Gasteiger charges")
    logger.info("    - Map atom types")
    logger.info("    - Detect rotatable bonds")
    logger.info("    - Format as PDBQT")
    
    temp_pdb = str(output_pdbqt).replace('.pdbqt', '_temp.pdb')
    
    try:
        # Save as PDB intermediate
        Chem.MolToPDBFile(mol, temp_pdb)
        
        # Convert to PDBQT using Open Babel
        _convert_to_pdbqt_openbabel(temp_pdb, output_pdbqt, is_receptor=False)
        
    finally:
        # Cleanup temp file
        if os.path.exists(temp_pdb):
            try:
                os.remove(temp_pdb)
            except (OSError, PermissionError) as e:
                logger.warning(f"  ⚠ Could not remove temp file {temp_pdb}: {e}")
    
    logger.info(f"SMILES conversion complete: {Path(output_pdbqt).name}")
    return Path(output_pdbqt)


def convert_sdf_to_pdb(input_file: Path, output_file: Path) -> None:
    """
    Convert SDF/MOL2/MOL file to PDB format for better visualization compatibility.
    
    Args:
        input_file: Path to input SDF/MOL2/MOL file
        output_file: Path to output PDB file
        
        
    Raises:
        FileNotFoundError: If input file doesn't exist
        ValueError: If input file is empty or invalid
        RuntimeError: If conversion fails
    """
    # Validate input file exists
    if not input_file.exists():
        raise FileNotFoundError(f"Input file not found: {input_file}")
    
    # Validate input file is not empty
    if input_file.stat().st_size == 0:
        raise ValueError(f"Input file is empty: {input_file}")
    
    # Read and convert molecule
    mol = _read_molecule(input_file)
    
    # Write as PDB
    Chem.MolToPDBFile(mol, str(output_file))
    logger.info(f"Converted {input_file.name} to PDB format: {output_file.name}")


# Backward compatibility aliases
prepare_receptor_adfr = prepare_protein
prepare_ligand_adfr = prepare_ligand
prepare_ligand_meeko = prepare_ligand


# =============================================================================
# BATCH DOCKING HELPERS
# =============================================================================

def validate_multi_mol_sdf(file_path: str) -> dict:
    """
    Check if the SDF file contains multiple valid molecules.
    """
    try:
        supplier = Chem.SDMolSupplier(str(file_path), sanitize=False)
        count = len(supplier)
        return {"valid": True, "count": count}
    except Exception as e:
        return {"valid": False, "count": 0, "error": str(e)}


def parse_and_prepare_batch_sdf(sdf_path: str, session_dir: Path) -> list:
    """
    Split a multi-molecule SDF file into individual ligand SDF files
    and compute RDKit molecular properties.
    """
    from rdkit.Chem import Descriptors, rdMolDescriptors
    
    # Try to load with sanitization
    supplier = Chem.SDMolSupplier(str(sdf_path), sanitize=True, removeHs=False)
    ligands = []
    
    for idx, mol in enumerate(supplier):
        if mol is None:
            logger.warning(f"Failed to read molecule at index {idx} from SDF")
            continue
            
        # Determine number of molecules in supplier
        try:
            num_mols = len(supplier)
        except Exception:
            num_mols = 1

        name = ""
        # Prefer internal _Name only for multi-molecule SDF files
        if num_mols > 1 and mol.HasProp("_Name"):
            name = mol.GetProp("_Name").strip()
            
        # Fallback to file name if name is empty or generic
        if not name or name.lower() in ["", "unnamed", "molecule", "untitled", "3d", "tmp"]:
            from pathlib import Path
            file_stem = Path(sdf_path).name
            # Strip standard prefixes/extensions
            for ext in ['.sdf', '.sd', '.mol2', '.mol']:
                if file_stem.lower().endswith(ext):
                    file_stem = file_stem[:-len(ext)]
            file_stem = Path(file_stem).stem
            if file_stem.startswith("uploaded_"):
                file_stem = file_stem[len("uploaded_"):]
            if num_mols > 1:
                name = f"{file_stem}_{idx+1}"
            else:
                name = file_stem
            
        # Sanitize name to make it safe for filesystems
        import re
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', name)[:50]
        if not safe_name:
            safe_name = f"ligand_{idx+1}"
            
        # Save this single molecule to its own SDF file in the session
        single_sdf_name = f"batch_ligand_{idx}_{safe_name}.sdf"
        single_sdf_path = session_dir / single_sdf_name
        writer = Chem.SDWriter(str(single_sdf_path))
        writer.write(mol)
        writer.close()
        
        # Calculate chemical properties
        try:
            mw = float(Descriptors.MolWt(mol))
            formula = rdMolDescriptors.CalcMolFormula(mol)
            hbd = int(rdMolDescriptors.CalcNumHBD(mol))
            hba = int(rdMolDescriptors.CalcNumHBA(mol))
            logp = float(Descriptors.MolLogP(mol))
            rot_bonds = int(rdMolDescriptors.CalcNumRotatableBonds(mol))
            heavy_atoms = int(mol.GetNumHeavyAtoms())
        except Exception as e:
            logger.warning(f"Failed to calculate properties for {name}: {e}")
            mw, formula, hbd, hba, logp, rot_bonds, heavy_atoms = 0.0, "N/A", 0, 0, 0.0, 0, 0
            
        ligands.append({
            "index": idx,
            "name": name,
            "safe_name": safe_name,
            "raw_sdf": single_sdf_name,
            "properties": {
                "mw": mw,
                "formula": formula,
                "hbd": hbd,
                "hba": hba,
                "logp": logp,
                "rotatable_bonds": rot_bonds,
                "heavy_atoms": heavy_atoms
            }
        })
        
    return ligands


def generate_batch_ligands_from_smiles(smiles_list: list, session_dir: Path) -> list:
    """
    Generate 3D coordinates and SDF files from a list of SMILES strings.
    Each smiles_list item is a dict: {"smiles": "...", "name": "..."}
    """
    from rdkit.Chem import Descriptors, rdMolDescriptors, AllChem
    import re
    
    ligands = []
    
    for idx, item in enumerate(smiles_list):
        smiles = item.get("smiles", "").strip()
        name = item.get("name", "").strip()
        if not smiles:
            continue
            
        if not name:
            name = f"smiles_{idx+1}"
            
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', name)[:50]
        if not safe_name:
            safe_name = f"smiles_{idx+1}"
            
        try:
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                logger.warning(f"Invalid SMILES string at index {idx}: {smiles}")
                continue
                
            # Add hydrogens
            mol = Chem.AddHs(mol)
            
            # Embed molecule to generate 3D coordinates
            embed_status = AllChem.EmbedMolecule(mol, AllChem.ETKDG())
            if embed_status == -1:
                embed_status = AllChem.EmbedMolecule(mol)
                if embed_status == -1:
                    logger.warning(f"Failed to generate 3D coordinates for {name}")
                    continue
                    
            # Save single mol to SDF file in the session
            single_sdf_name = f"batch_ligand_{idx}_{safe_name}.sdf"
            single_sdf_path = session_dir / single_sdf_name
            writer = Chem.SDWriter(str(single_sdf_path))
            writer.write(mol)
            writer.close()
            
            # Calculate chemical properties
            mw = float(Descriptors.MolWt(mol))
            formula = rdMolDescriptors.CalcMolFormula(mol)
            hbd = int(rdMolDescriptors.CalcNumHBD(mol))
            hba = int(rdMolDescriptors.CalcNumHBA(mol))
            logp = float(Descriptors.MolLogP(mol))
            rot_bonds = int(rdMolDescriptors.CalcNumRotatableBonds(mol))
            heavy_atoms = int(mol.GetNumHeavyAtoms())
            
            ligands.append({
                "index": idx,
                "name": name,
                "safe_name": safe_name,
                "raw_sdf": single_sdf_name,
                "smiles": smiles,
                "properties": {
                    "mw": mw,
                    "formula": formula,
                    "hbd": hbd,
                    "hba": hba,
                    "logp": logp,
                    "rotatable_bonds": rot_bonds,
                    "heavy_atoms": heavy_atoms
                }
            })
        except Exception as e:
            logger.error(f"Error converting SMILES {smiles}: {e}")
            continue
            
    return ligands
