
import os
import sys
import shutil
import subprocess
import logging
from pathlib import Path
from rdkit import Chem
from rdkit.Chem.rdForceFieldHelpers import MMFFOptimizeMolecule

# Configure logging (only if not already configured by the application)
logger = logging.getLogger(__name__)

# Only configure if the root logger has no handlers (i.e., not configured by application)
if not logging.getLogger().hasHandlers():
    logging.basicConfig(
        level=logging.INFO,
        format='%(levelname)s: %(message)s'
    )


def check_tools():
    """Check availability of required tools."""
    tools = {}
    tools['rdkit'] = False
    tools['openbabel'] = shutil.which('obabel') is not None or shutil.which('obabel.exe') is not None
    tools['vina'] = shutil.which('vina') is not None or shutil.which('vina.exe') is not None
    
    try:
        from rdkit import Chem
        tools['rdkit'] = True
    except ImportError:
        pass
    
    return tools


def _run_command(cmd, cwd=None, timeout=300):
    """Run external command."""
    proc = subprocess.run(cmd, shell=False, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\\nSTDOUT:\\n{proc.stdout}\\nSTDERR:\\n{proc.stderr}")
    return proc.stdout


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
    
    # Check if obabel is available directly
    obabel_cmd = shutil.which('obabel') or shutil.which('obabel.exe')
    
    # If not found, try with conda environment activation
    if not obabel_cmd:
        # Try to find obabel in conda environment
        conda_env = os.environ.get('CONDA_DEFAULT_ENV', 'docking')
        # Both Windows and Linux use the same conda run command
        cmd = ['conda', 'run', '-n', conda_env, 'obabel', input_file, '-O', output_pdbqt]
    else:
        # obabel found directly
        cmd = [obabel_cmd, input_file, '-O', output_pdbqt]
    
    if is_receptor:
        # For receptors: rigid, add polar hydrogens, assign partial charges
        cmd.extend(['-xr'])  # -xr = rigid molecule (receptor)
    else:
        # For ligands: flexible, preserve all hydrogens
        cmd.extend(['-xh'])  # -xh = preserve hydrogens
    
    # Add partial charges (Gasteiger) and hydrogens at pH 7.4
    ph = 7.4  # Fixed value, not user-configurable
    cmd.extend(['-p', str(ph)])
    
    try:
        _run_command(cmd, timeout=120)
        logger.info(f"Converted to PDBQT using Open Babel: {output_pdbqt}")
    except Exception as e:
        raise RuntimeError(f"Open Babel conversion failed: {e}")


def detect_chains(input_pdb):
    """
    Detect all unique chain IDs in a PDB file.
    
    Args:
        input_pdb: Input PDB file path
        
    Returns:
        List of dicts with chain info: [{'id': 'A', 'atoms': 1523}, ...]
        
    Raises:
        FileNotFoundError: If input file doesn't exist
        ValueError: If file is empty or contains no valid ATOM/HETATM records
    """
    input_pdb = str(input_pdb)
    
    # Validate file exists
    if not os.path.exists(input_pdb):
        raise FileNotFoundError(f"PDB file not found: {input_pdb}")
    
    # Validate file is not empty
    if os.path.getsize(input_pdb) == 0:
        raise ValueError(f"PDB file is empty: {input_pdb}")
    
    chain_atoms = {}
    valid_records = 0
    
    with open(input_pdb, 'r') as f:
        for line in f:
            # Only consider ATOM records for valid protein chains
            if line.startswith('ATOM'):
                # Validate line length before accessing column 21
                if len(line) < 22:
                    continue
                
                # Chain ID is at column 21 (0-indexed: position 21)
                chain_id = line[21].strip().upper()
                
                # Ignore empty chains
                if not chain_id:
                    continue
                
                if chain_id not in chain_atoms:
                    chain_atoms[chain_id] = 0
                chain_atoms[chain_id] += 1
                valid_records += 1
    
    # Validate that we found at least some atoms
    if valid_records == 0:
        raise ValueError(f"No valid ATOM/HETATM records found in PDB file: {input_pdb}")
    
    # Convert to list of dicts, sorted by chain ID
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
                    chain_id = line[21].strip().upper() or ' '
                    stats['chains'].add(chain_id)
                
                if len(line) >= 26:
                    res_id = line[17:26].strip()  # Residue name + number
                    stats['residues'].add(res_id)
                    
            elif line.startswith('HETATM'):
                stats['total_atoms'] += 1
                
                if len(line) >= 20:
                    res_name = line[17:20].strip().upper()
                    
                    if res_name in WATER_RESIDUES:
                        stats['waters'] += 1
                    else:
                        stats['heteroatoms'] += 1
    
    # Convert sets to sorted lists
    stats['chains'] = sorted(list(stats['chains']))
    stats['residues'] = len(stats['residues'])
    
    return stats






def extract_sequence_from_pdb(pdb_file):
    """
    Extract protein sequence from PDB file.
    
    Useful for fetching complete structures from AlphaFold when
    the experimental structure has missing residues.
    
    Args:
        pdb_file: Path to PDB file
        
    Returns:
        str: Protein sequence in single-letter amino acid code
        
    Note:
        Only extracts sequence from ATOM records (not HETATM).
        Returns sequence from first chain if multiple chains present.
    """
    from Bio.PDB import PDBParser
    from Bio.SeqUtils import seq1
    
    try:
        parser = PDBParser(QUIET=True)
        structure = parser.get_structure('protein', pdb_file)
        
        # Get first model
        model = structure[0]
        
        # Get first chain
        chain = list(model.get_chains())[0]
        
        # Extract sequence
        sequence = []
        for residue in chain:
            if residue.id[0] == ' ':  # Standard amino acid (not HETATM)
                try:
                    # Convert 3-letter code to 1-letter
                    aa = seq1(residue.get_resname())
                    sequence.append(aa)
                except KeyError:
                    # Unknown residue, skip
                    continue
        
        return ''.join(sequence)
        
    except Exception as e:
        logger.warning(f"  Could not extract sequence from PDB: {e}")
        return None



def detect_heteroatoms_to_keep(input_pdb):
    """
    Detect and categorize heteroatoms (metal ions, cofactors, ligands, buffer agents).
    
    This function analyzes HETATM records in a PDB file and categorizes them into:
    - Metal ions (Zn, Mg, Ca, Fe, etc.)
    - Cofactors (NAD, FAD, HEM, ATP, etc.)
    - Small molecule ligands (potential drug-like molecules)
    - Buffer agents (SO4, GOL, etc.)
    - Other heteroatoms
    
    Args:
        input_pdb: Input PDB file path
        
    Returns:
        Dict with heteroatom analysis:
        {
            'metal_ions': ['ZN', 'MG', 'CA'],
            'cofactors': ['NAD', 'HEM'],
            'ligands': ['LIG', 'DRG'],
            'buffer_agents': ['SO4', 'GOL'],
            'other': ['UNK'],
            'all_heteroatoms': ['ZN', 'MG', 'NAD', 'HEM', 'LIG', 'SO4'],
            'counts': {'ZN': 2, 'MG': 1, 'NAD': 1, ...},
            'atom_counts': {'ZN': 1, 'NAD': 44, ...},
            'summary': "Found 2 metal ions, 2 cofactors, 1 ligand, 2 buffer agents"
        }
        
    Raises:
        FileNotFoundError: If input file doesn't exist
        ValueError: If file is empty
    """
    input_pdb = str(input_pdb)
    
    # Validate file exists
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
        # Nucleotide cofactors
        'NAD', 'NAP', 'FAD', 'FMN', 'ADP', 'ATP', 'GTP', 'CTP', 'UTP',
        'NAI', 'NDP', 'AMP', 'GMP', 'CMP', 'UMP',
        # Heme groups
        'HEM', 'HEC', 'HEA', 'HEB', 'HDD', 'HDN', 'HAS',
        # Coenzyme A
        'COA', 'ACO', 'COB', 'COC',
        # Vitamins and derivatives
        'B12', 'BCL', 'CHL', 'PLP', 'THM', 'RET', 'VIT',
        # Other important cofactors
        'SAM', 'SAH', 'PQQ', 'TPP', 'BIO', 'LIP',
        # Sugar phosphates
        'G6P', 'F6P', 'FBP', 'GAP', 'PEP',
        # Porphyrins
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
    heteroatom_atoms = {}  # Track number of atoms per heteroatom type
    
    with open(input_pdb, 'r') as f:
        for line in f:
            if line.startswith('HETATM'):
                if len(line) < 20:
                    continue
                
                res_name = line[17:20].strip().upper()
                
                # Skip water molecules
                if res_name in WATER_RESIDUES:
                    continue
                
                # Count occurrences
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
        elif num_atoms > 5:  # Likely a ligand (more than 5 atoms, not a metal/cofactor)
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
    
    Performs 5 operations in order:
    1. Alternate location resolution (auto on load — keeps highest occupancy)
    2. Nonstandard residue replacement (MSE→MET, CSE→CYS, etc.)
    3. Missing residue detection + addition
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
            - missing_residues_remaining (int): Gaps still present after fix (triggers AlphaFold if > 0)
        
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
        
        # ── Step 3: Missing residues ──
        logger.info("\n  Step 3/5: Detecting missing residues (backbone gaps)...")
        fixer.findMissingResidues()
        num_missing_res = len(fixer.missingResidues)
        
        if num_missing_res > 0:
            for (chain_idx, res_idx), res_names in fixer.missingResidues.items():
                chain = list(fixer.topology.chains())[chain_idx]
                logger.info(f"    Chain {chain.id}: {len(res_names)} missing residue(s) "
                           f"at position {res_idx}")
            logger.info(f"  Total: {num_missing_res} gap(s) detected")
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
        total_fixes = num_missing_res + num_missing_atoms + num_missing_terminals
        if total_fixes > 0:
            logger.info("\n  Applying fixes...")
            fixer.addMissingAtoms()
            logger.info(f"  ✓ Added all missing residues, atoms, and terminals")
        else:
            logger.info("  No missing atoms or residues — structure is complete")
        
        # Save fixed structure
        with open(output_pdb, 'w') as f:
            PDBFile.writeFile(fixer.topology, fixer.positions, f)
        logger.info(f"\n  Saved fixed structure: {Path(output_pdb).name}")
        
        # ── Step 5: Post-fix validation ──
        logger.info("\n  Step 5/5: Post-fix validation (re-checking for remaining gaps)...")
        fixer2 = PDBFixer(filename=output_pdb)
        fixer2.findMissingResidues()
        remaining = len(fixer2.missingResidues)
        
        if remaining > 0:
            logger.warning(f"  ⚠ {remaining} gap(s) still remain after PDBFixer")
            logger.info("  → AlphaFold fallback will be triggered")
        else:
            logger.info("  ✓ All gaps resolved — structure is fully complete")
        
        logger.info("=" * 50)
        
        report = {
            "success": True,
            "nonstandard_replaced": num_nonstandard,
            "missing_residues_found": num_missing_res,
            "missing_atoms_found": num_missing_atoms,
            "missing_terminals_found": num_missing_terminals,
            "missing_residues_remaining": remaining,
        }
        
        logger.info(f"  Report: {report}")
        return report
        
    except Exception as e:
        logger.error(f"  ERROR: PDBFixer failed: {e}")
        raise RuntimeError(f"Structure completion failed: {e}")



def _filter_pdb_residues(input_pdb, keep_hetero_residues=None, keep_chains=None):
    """
    Filter PDB file to remove water molecules and unwanted heteroatoms.
    
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
    import tempfile
    input_pdb = str(input_pdb)
    
    # Create filtered PDB in system temp directory instead of session directory
    with tempfile.NamedTemporaryFile(suffix='_filtered.pdb', delete=False) as tmp:
        output_pdb = tmp.name
    
    # Validate input file
    if not os.path.exists(input_pdb):
        raise FileNotFoundError(f"Input PDB file not found: {input_pdb}")
    
    if os.path.getsize(input_pdb) == 0:
        raise ValueError(f"Input PDB file is empty: {input_pdb}")
    
    # Water molecules - always removed
    WATER_RESIDUES = ['HOH', 'WAT', 'H2O']
    
    # Normalize keep lists
    keep_hetero_residues = keep_hetero_residues or []
    keep_hetero_residues = [res.strip().upper() for res in keep_hetero_residues]
    
    keep_chains = keep_chains or []
    keep_chains = [chain.strip().upper() if chain.strip() else ' ' for chain in keep_chains]
    filter_by_chain = len(keep_chains) > 0
    
    with open(input_pdb, 'r') as f:
        lines = f.readlines()
    
    # ── Pre-filter: discover actual chains in the PDB file ──
    # PDBFixer can reassign chain IDs (e.g., B→A), so we detect what's actually there
    if filter_by_chain:
        actual_chains = set()
        for line in lines:
            if line.startswith('ATOM') and len(line) >= 22:
                cid = line[21].strip().upper() if line[21].strip() else ' '
                actual_chains.add(cid)
        
        logger.info(f"  Chains in PDB file: {', '.join(sorted(actual_chains)) if actual_chains else 'none'}")
        logger.info(f"  Requested chains: {', '.join(keep_chains)}")
        
        # Check if requested chains exist in the file
        matching = set(keep_chains) & actual_chains
        if len(matching) == 0 and len(actual_chains) > 0:
            # PDBFixer likely reassigned chain IDs — fall back to keeping all chains
            logger.warning(f"  ⚠ Requested chains {keep_chains} not found in PDB (found: {sorted(actual_chains)})")
            logger.warning(f"  → PDBFixer may have reassigned chain IDs — keeping ALL chains")
            filter_by_chain = False
    
    filtered_lines = []
    removed_waters = 0
    removed_hetero = 0
    removed_chains = 0
    kept_hetero = set()
    kept_chains = set()
    malformed_lines = 0
    valid_atom_count = 0
    
    for line in lines:
        # Process ATOM records (standard protein residues)
        if line.startswith('ATOM'):
            if len(line) < 22:
                malformed_lines += 1
                continue
            
            # CRITICAL FIX: Exclude UNK (unknown) residues
            # UNK residues are marked as ATOM but should be treated as heteroatoms
            if len(line) >= 20:
                res_name = line[17:20].strip().upper()
                if res_name == 'UNK':
                    removed_hetero += 1
                    continue
            
            # Check chain filter
            if filter_by_chain:
                chain_id = line[21]
                chain_id = chain_id.strip().upper() if chain_id.strip() else ' '
                
                if chain_id not in keep_chains:
                    removed_chains += 1
                    continue
                
                kept_chains.add(chain_id)
            
            filtered_lines.append(line)
            valid_atom_count += 1
            continue
        
        # Process HETATM records
        if line.startswith('HETATM'):
            if len(line) < 22:
                malformed_lines += 1
                continue
            
            res_name = line[17:20].strip().upper()
            
            # CRITICAL: Always remove water molecules FIRST
            if res_name in WATER_RESIDUES:
                removed_waters += 1
                continue
            
            # Check chain filter for non-water heteroatoms
            if filter_by_chain:
                chain_id = line[21]
                chain_id = chain_id.strip().upper() if chain_id.strip() else ' '
                
                if chain_id not in keep_chains:
                    removed_chains += 1
                    continue
            
            # FIXED LOGIC: Remove ALL heteroatoms by default
            # Only keep if explicitly listed in keep_hetero_residues
            if len(keep_hetero_residues) == 0:
                # No keep list provided = remove ALL heteroatoms (including ligands)
                removed_hetero += 1
                continue
            elif res_name not in keep_hetero_residues:
                # Keep list provided but this residue not in it = remove
                removed_hetero += 1
                continue
            
            # If we reach here, this heteroatom should be kept
            kept_hetero.add(res_name)
            filtered_lines.append(line)
            valid_atom_count += 1
            continue
        
        # Keep all other lines (HEADER, CONECT, etc.)
        filtered_lines.append(line)
    
    # Validate we have some valid records
    if valid_atom_count == 0:
        # Last resort fallback: re-run without chain filtering
        if filter_by_chain:
            logger.warning(f"  ⚠ No atoms remain after chain filtering — retrying without chain filter")
            return _filter_pdb_residues(input_pdb, keep_hetero_residues, keep_chains=None)
        raise ValueError(f"No valid ATOM/HETATM records remain after filtering: {input_pdb}")
    
    with open(output_pdb, 'w') as f:
        f.writelines(filtered_lines)
    
    # Print summary
    logger.info(f"  Removed {removed_waters} water molecules")
    if removed_hetero > 0:
        logger.info(f"  Removed {removed_hetero} unwanted heteroatoms/ligands")
    if kept_hetero:
        logger.info(f"  Kept heteroatoms: {', '.join(sorted(kept_hetero))}")
    if filter_by_chain:
        logger.info(f"  Removed {removed_chains} atoms from unwanted chains")
        logger.info(f"  Kept chains: {', '.join(sorted(kept_chains))}")
    if malformed_lines > 0:
        logger.warning(f"  WARNING: Skipped {malformed_lines} malformed lines")
    
    return output_pdb


def _remove_waters_from_pdbqt(pdbqt_file):
    """
    Remove water molecules and UNK residues from PDBQT file as final cleanup step.
    
    This is needed because:
    1. OpenBabel might add waters during conversion
    2. OpenBabel creates UNK (unknown) residues for non-standard atoms
    3. Chain ID preservation might assign chain IDs to waters/UNK
    
    Args:
        pdbqt_file: PDBQT file to clean
    """
    WATER_RESIDUES = ['HOH', 'WAT', 'H2O']
    UNWANTED_RESIDUES = ['UNK']  # Unknown/non-standard residues created by OpenBabel
    
    # Read PDBQT file
    with open(pdbqt_file, 'r') as f:
        lines = f.readlines()
    
    # Filter out water molecules and UNK residues
    cleaned_lines = []
    waters_removed = 0
    unk_removed = 0
    
    for line in lines:
        if line.startswith('ATOM') or line.startswith('HETATM'):
            if len(line) >= 20:
                res_name = line[17:20].strip().upper()
                
                if res_name in WATER_RESIDUES:
                    waters_removed += 1
                    continue  # Skip this water line
                
                if res_name in UNWANTED_RESIDUES:
                    unk_removed += 1
                    continue  # Skip this UNK line
        
        cleaned_lines.append(line)
    
    # Write back cleaned PDBQT
    with open(pdbqt_file, 'w') as f:
        f.writelines(cleaned_lines)
    
    if waters_removed > 0:
        logger.info(f"  Removed {waters_removed} water molecules from PDBQT")
    if unk_removed > 0:
        logger.info(f"  Removed {unk_removed} UNK (unknown) residues from PDBQT")


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
    
    # ── Stage 1: PDBFixer — Comprehensive Structure Repair ──
    logger.info("\nStage 1: PDBFixer — Comprehensive Structure Repair")
    
    # Create fixed PDB in system temp directory instead of session directory
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='_fixed.pdb', delete=False) as tmp:
        fixed_pdb = tmp.name
    
    pdbfixer_report = None
    
    try:
        pdbfixer_report = complete_structure_pdbfixer(input_pdb, fixed_pdb)
        input_pdb = fixed_pdb  # Use fixed version going forward
        logger.info("  Using PDBFixer-repaired structure for preparation")
    except ImportError:
        logger.warning("  PDBFixer not available — skipping structure repair")
        logger.info("  → Continuing with original structure")
        pdbfixer_report = {"missing_residues_remaining": -1}  # Unknown
        # Clean up unused temp file
        if os.path.exists(fixed_pdb):
            try:
                os.remove(fixed_pdb)
            except (OSError, PermissionError):
                pass
    except RuntimeError as e:
        logger.error(f"  ERROR: PDBFixer failed: {e}")
        logger.info("  → Continuing with original structure")
        pdbfixer_report = {"missing_residues_remaining": -1}  # Unknown
        # Clean up unused temp file
        if os.path.exists(fixed_pdb):
            try:
                os.remove(fixed_pdb)
            except (OSError, PermissionError):
                pass
    
    # ── Stage 1.5: AlphaFold Fallback (ONLY if PDBFixer couldn't resolve gaps) ──
    if use_alphafold_if_incomplete and pdbfixer_report.get("missing_residues_remaining", 0) > 0:
        logger.info("\nStage 1.5: AlphaFold Fallback")
        logger.info("  PDBFixer could not resolve all gaps — attempting AlphaFold prediction")
        
        try:
            # Extract sequence from PDB
            sequence = extract_sequence_from_pdb(input_pdb)
            
            if sequence:
                logger.info(f"  Extracted sequence: {len(sequence)} residues")
                
                # Import AlphaFold integration
                import alphafold_integration
                
                # Create AlphaFold structure file in temp directory
                with tempfile.NamedTemporaryFile(suffix='_alphafold.pdb', delete=False) as tmp:
                    alphafold_pdb = tmp.name
                
                # Predict structure using ESMFold (faster than full AlphaFold)
                logger.info("  Fetching complete structure from ESMFold...")
                metadata = alphafold_integration.predict_structure_esmfold(
                    sequence, 
                    Path(alphafold_pdb),
                    timeout=300
                )
                
                # Use AlphaFold structure for preparation
                input_pdb = alphafold_pdb
                logger.info(f"  Using AlphaFold structure (confidence: {metadata['confidence']})")
                logger.info("  → This structure should have no missing residues")
                
            else:
                logger.warning("  Could not extract sequence from PDB")
                logger.info("  → Continuing with PDBFixer output")
                
        except Exception as e:
            logger.warning(f"  AlphaFold fallback failed: {e}")
            logger.info("  → Continuing with PDBFixer output")
    
    # ── Stage 2: Non-Protein Elements Elimination ──
    logger.info("\nStage 2: Non-Protein Elements Elimination")
    if remove_waters or keep_hetero_residues is not None or keep_chains is not None:
        if not remove_waters:
            logger.warning("  WARNING: Keeping water molecules (unusual for docking)")
            filtered_pdb = input_pdb
        else:
            filtered_pdb = _filter_pdb_residues(input_pdb, keep_hetero_residues, keep_chains)
    else:
        logger.info("  Keeping all residues (no filtering)")
        filtered_pdb = input_pdb
    
    # ── Stage 3: Protein Refinement → PDBQT ──
    logger.info("\nStage 3: Protein Refinement → PDBQT")
    logger.info("  OpenBabel will:")
    logger.info("    - Add hydrogens at pH 7.4")
    logger.info("    - Assign Gasteiger charges")
    logger.info("    - Map docking atom types")
    logger.info("    - Convert to PDBQT format")
    
    _convert_to_pdbqt_openbabel(filtered_pdb, output_pdbqt, is_receptor=True)
    
    # Preserve chain IDs from filtered PDB
    if keep_chains is not None and len(keep_chains) > 0:
        logger.info("  Preserving chain IDs in PDBQT file...")
        _preserve_chain_ids_in_pdbqt(filtered_pdb, output_pdbqt)
    
    # Remove waters and UNK residues from PDBQT
    if remove_waters:
        logger.info("  Final cleanup...")
        _remove_waters_from_pdbqt(output_pdbqt)
    # Save a copy of the filtered PDB as protein_prepared.pdb for visualization and centering
    prepared_pdb_path = str(Path(output_pdbqt).with_suffix('.pdb'))
    if os.path.exists(filtered_pdb):
        import shutil
        try:
            shutil.copy(filtered_pdb, prepared_pdb_path)
            logger.info(f"  Saved prepared PDB for visualization: {Path(prepared_pdb_path).name}")
        except Exception as e:
            logger.warning(f"  WARNING: Could not save prepared PDB: {e}")

    # Cleanup temp files
    if filtered_pdb != input_pdb and os.path.exists(filtered_pdb) and filtered_pdb != prepared_pdb_path:
        try:
            os.remove(filtered_pdb)
        except (OSError, PermissionError) as e:
            logger.warning(f"  WARNING: Could not remove temp file {filtered_pdb}: {e}")
    
    if input_pdb.endswith('_fixed.pdb') and os.path.exists(input_pdb):
        try:
            os.remove(input_pdb)
        except (OSError, PermissionError) as e:
            logger.warning(f"  WARNING: Could not remove temp file {input_pdb}: {e}")
    
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
    
    # Create temp file in system temp directory instead of session directory
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='_temp.pdb', delete=False) as tmp:
        temp_pdb = tmp.name
    
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

    import tempfile
    with tempfile.NamedTemporaryFile(suffix='_temp.pdb', delete=False) as tmp:
        temp_pdb = tmp.name
    
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
