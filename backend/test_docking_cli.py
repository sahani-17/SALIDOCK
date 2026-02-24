"""
Command-Line Testing Script for Molecular Docking Backend

This script allows you to test the complete docking workflow without Streamlit.
All operations are done via direct API calls to the FastAPI backend.

Features:
    - AlphaFold Integration: Predict structures from FASTA sequences or UniProt IDs
    - Normal Workflow: Use existing PDB/structure files
    - Advanced protein preparation options
    - Interactive grid configuration
    - Comprehensive interaction analysis

Usage:
    python test_docking_cli.py

Requirements:
    - FastAPI backend running on http://localhost:8000
    - Run: uvicorn app:app --reload
"""

import requests
import json
import time
import argparse
import sys
from pathlib import Path

API_BASE_URL = "http://localhost:8000"

def parse_arguments():
    """Parse command-line arguments for automated docking."""
    parser = argparse.ArgumentParser(
        description='Molecular Docking Backend - Interactive CLI with Windows Path Support',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Interactive mode:
    python test_docking_cli.py
  
  Automated mode with Windows paths:
    python test_docking_cli.py --protein "D:\\path\\to\\protein.pdb" --ligand "D:\\path\\to\\ligand.sdf"
    python test_docking_cli.py -p protein.pdb -l ligand.mol2 --mode cavity
    python test_docking_cli.py -p protein.pdb --smiles "CC(=O)OC1=CC=CC=C1C(=O)O" --name aspirin
        """
    )
    
    # File inputs
    parser.add_argument('-p', '--protein', type=str, 
                       help='Path to protein file (PDB/ENT). Supports Windows paths.')
    parser.add_argument('-l', '--ligand', type=str,
                       help='Path to ligand file (SDF/MOL/MOL2/PDB). Supports Windows paths.')
    parser.add_argument('-s', '--smiles', type=str,
                       help='SMILES string for ligand generation (alternative to --ligand)')
    parser.add_argument('-n', '--name', type=str, default='ligand',
                       help='Ligand name when using SMILES (default: ligand)')
    
    # Docking mode
    parser.add_argument('-m', '--mode', type=str, choices=['cavity', 'manual'], default='cavity',
                       help='Docking mode: cavity (auto-detect) or manual (default: cavity)')
    
    
    # Cavity detection options
    parser.add_argument('--top-n', type=int, default=5,
                       help='Number of cavities to detect (default: 5)')
    parser.add_argument('--cavity-ids', type=str,
                       help='Comma-separated cavity IDs to dock (e.g., "1,2,3" or "all")')
    
    # Manual mode options
    parser.add_argument('--center', type=str,
                       help='Grid center coordinates for manual mode (e.g., "10.5,20.3,15.7")')
    parser.add_argument('--size', type=str, default='20,20,20',
                       help='Grid size for manual mode (default: "20,20,20")')
    
    # Protein preparation options
    parser.add_argument('--chains', type=str,
                       help='Comma-separated chain IDs to keep (e.g., "A,B")')
    parser.add_argument('--hetero', type=str,
                       help='Comma-separated heteroatom residues to keep (e.g., "NAD,HEM,ZN")')
    
    # Analysis options
    parser.add_argument('--analyze-poses', type=str, default='1',
                       help='Poses to analyze (e.g., "1,2,3" or "all", default: "1")')
    
    # Output options
    parser.add_argument('-o', '--output', type=str, default='./results',
                       help='Output directory for results (default: ./results)')
    
    return parser.parse_args()

def print_section(title):
    """Print a formatted section header."""
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def create_session():
    """Create a new docking session."""
    response = requests.post(f"{API_BASE_URL}/api/session/create")
    response.raise_for_status()
    data = response.json()
    session_id = data['session_id']
    print(f"✓ Created session: {session_id}")
    return session_id

def upload_file(session_id, file_path, filetype):
    """Upload protein or ligand file."""
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    with open(file_path, 'rb') as f:
        files = {'file': (file_path.name, f)}
        response = requests.post(
            f"{API_BASE_URL}/api/upload/{session_id}/{filetype}",
            files=files
        )
        response.raise_for_status()
    
    print(f"✓ Uploaded {filetype}: {file_path.name}")

def prepare_protein(session_id, filename, fix_structure=True, use_alphafold_if_incomplete=True):
    """Prepare protein structure.
    
    Args:
        session_id: Session ID
        filename: Protein filename
        fix_structure: Use PDBFixer to complete missing atoms (default: True, automatic)
        use_alphafold_if_incomplete: Use AlphaFold if missing residues detected (default: True, automatic)
    """
    params = {'file_name': filename}
    
    if fix_structure:
        params['fix_structure'] = 'true'
    
    if use_alphafold_if_incomplete:
        params['use_alphafold_if_incomplete'] = 'true'
    
    response = requests.post(
        f"{API_BASE_URL}/api/prepare/protein/{session_id}",
        params=params
    )
    response.raise_for_status()
    print(f"✓ Prepared protein (pH=7.4 fixed)")
    print("  - PDBFixer: enabled (automatic)")
    print("  - AlphaFold fallback: enabled (automatic)")

def prepare_ligand(session_id, filename):
    """Prepare ligand structure with validation."""
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/prepare/ligand/{session_id}",
            params={'file_name': filename}
        )
        
        # Check if validation failed (HTTP 400)
        if response.status_code == 400:
            error_data = response.json()
            detail = error_data.get('detail', {})
            
            if isinstance(detail, dict) and detail.get('error') == 'invalid_ligand_type':
                # Validation rejection
                print(f"✗ Ligand validation FAILED: {detail['molecule_type'].upper()}")
                print(f"  Reason: {detail['reason'][:100]}...")
                print(f"\n  Molecule Statistics:")
                stats = detail.get('stats', {})
                print(f"    - Molecular Weight: {stats.get('molecular_weight', 0)} Da")
                print(f"    - Heavy Atoms: {stats.get('heavy_atoms', 0)}")
                print(f"    - Amino Acid Residues: {stats.get('amino_acid_residues', 0)}")
                print(f"\n  This docking model is designed for small molecules only.")
                raise ValueError(f"Ligand validation failed: {detail['molecule_type']}")
            else:
                # Other 400 error
                print(f"✗ Ligand preparation failed: {detail}")
                raise ValueError(str(detail))
        
        response.raise_for_status()
        data = response.json()
        
        # Display validation success
        validation = data.get('validation', {})
        if validation:
            print(f"✓ Ligand validation PASSED: {validation['molecule_type'].upper()}")
            stats = validation.get('stats', {})
            print(f"  MW: {stats.get('molecular_weight', 0):.2f} Da, "
                  f"Heavy atoms: {stats.get('heavy_atoms', 0)}, "
                  f"Amino acids: {stats.get('amino_acid_residues', 0)}")
        
        print(f"✓ Prepared ligand")
        return data
        
    except requests.exceptions.HTTPError as e:
        print(f"✗ HTTP Error: {e}")
        raise
    except ValueError as e:
        # Re-raise validation errors
        raise
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        raise


def create_ligand_from_smiles(session_id, smiles, ligand_name="ligand", optimize=True):
    """Generate ligand from SMILES string.
    
    Note: pH is fixed at 7.4 in the backend.
    """
    response = requests.post(
        f"{API_BASE_URL}/api/ligand/from-smiles/{session_id}",
        params={
            'smiles': smiles,
            'ligand_name': ligand_name,
            'optimize': optimize
        }
    )
    response.raise_for_status()
    data = response.json()
    print(f"✓ Generated ligand from SMILES: {ligand_name}")
    print(f"  SMILES: {smiles}")
    print(f"  File: {data['ligand_file']}")
    print(f"  pH: 7.4 (fixed)")
    return data

def calculate_grid(session_id, mode='auto', center=None, size=(22.5, 22.5, 22.5)):
    """Calculate docking grid."""
    params = {
        'mode': mode,
        'size_x': size[0],
        'size_y': size[1],
        'size_z': size[2]
    }
    
    if mode == 'manual' and center:
        params.update({
            'center_x': center[0],
            'center_y': center[1],
            'center_z': center[2]
        })
    
    response = requests.post(
        f"{API_BASE_URL}/api/grid/calc/{session_id}",
        params=params
    )
    response.raise_for_status()
    data = response.json()
    
    print(f"✓ Grid calculated:")
    print(f"  Center: {data['center']}")
    print(f"  Size: {data['size']}")
    return data

def run_docking(session_id):
    """Run AutoDock Vina docking.
    
    Note:
        Exhaustiveness is fixed at 10 and num_modes is fixed at 9 in the backend.
    """
    print(f"⏳ Running docking (exhaustiveness=10 fixed, modes=9 fixed)...")
    print("   This may take several minutes...")
    
    response = requests.post(
        f"{API_BASE_URL}/api/dock/run/{session_id}"
    )
    response.raise_for_status()
    data = response.json()
    
    print(f"✓ Docking complete!")
    return data

def get_results(session_id):
    """Get docking results."""
    response = requests.get(f"{API_BASE_URL}/api/results/{session_id}")
    response.raise_for_status()
    data = response.json()
    
    results = data['results']
    print(f"\n{'Mode':<6} {'Affinity':<12} {'RMSD l.b.':<12} {'RMSD u.b.':<12}")
    print("-" * 50)
    for r in results:
        print(f"{r['mode']:<6} {r['affinity']:<12.2f} {r['rmsd_lb']:<12.2f} {r['rmsd_ub']:<12.2f}")
    
    return results


def detect_cavities_cli(session_id, top_n=5):
    """Detect and display cavities using consensus detection with automatic 3-tier fallback.
    
    Args:
        session_id: Session ID
        top_n: Number of cavities to detect
        
    Note:
        The backend uses consensus detection (P2RANK + Fpocket) with automatic fallback:
        - Tier 1: Consensus (both tools agree) - High confidence
        - Tier 2: P2Rank only - Medium-high confidence  
        - Tier 3: Fpocket + PRANK - Medium confidence
    """
    try:
        print(f"\n[INFO] Detecting binding cavities using Consensus (P2RANK + Fpocket)...")
        print("   Running P2RANK and Fpocket in parallel...")
        print("   Automatic 3-tier fallback enabled...")
        print("   This may take 30-90 seconds...")
        
        response = requests.post(
            f"{API_BASE_URL}/api/cavities/detect/{session_id}",
            params={'top_n': top_n}
        )
        
        if response.status_code != 200:
            print(f"[ERROR] Cavity detection failed (HTTP {response.status_code})")
            print(f"Response: {response.text[:500]}")
            return None
        
        data = response.json()
        
        if data.get('status') != 'ok':
            print(f"[ERROR] Cavity detection error: {data.get('message', 'Unknown error')}")
            return None
        
        cavities = data['cavities']
        total = data['total_detected']
        method = data.get('method', 'consensus')
        detection_tier = data.get('detection_tier', 0)
        tier_info = data.get('tier_info', {})
        
        
        # Display tier information
        if tier_info:
            print(f"\n{'='*80}")
            print(f"  DETECTION TIER: {tier_info.get('tier', 0)} - {tier_info.get('name', 'Unknown')}")
            print(f"  CONFIDENCE LEVEL: {tier_info.get('confidence', 'Unknown')}")
            print(f"  {tier_info.get('description', '')}")
            print(f"{'='*80}")
        
        # Display consensus results
        stats = data.get('detection_stats', {})
        print(f"\n[SUCCESS] Tier {detection_tier} (Consensus) cavity detection complete")
        print(f"  Fpocket detected: {stats.get('fpocket_total', 0)} cavities")
        print(f"  P2RANK detected: {stats.get('p2rank_total', 0)} cavities")
        print(f"  Consensus (both): {stats.get('total_consensus', 0)} cavities")
        print(f"    - High confidence: {stats.get('high_confidence', 0)}")
        print(f"    - Medium confidence: {stats.get('medium_confidence', 0)}")
        if stats.get('low_confidence', 0) > 0:
            print(f"    - Low confidence: {stats.get('low_confidence', 0)} (exploratory)")
        
        # Display consensus cavities table
        print("\nConsensus Cavities:")
        print("=" * 150)
        print(f"{'Rank':<6} {'ID':<4} {'Tier':<6} {'Confidence':<12} {'Consensus':<10} {'Spatial':<8} {'Residue':<8} "
              f"{'PhysChem':<9} {'Score':<8} {'Center(x,y,z)':<25} {'Criteria':<30}")
        print("=" * 150)
        
        for cavity in cavities:
            center_str = f"({cavity['center'][0]:.1f}, {cavity['center'][1]:.1f}, {cavity['center'][2]:.1f})"
            
            # Get tier for this cavity
            cav_tier = cavity.get('detection_tier', detection_tier)
            tier_display = f"T{cav_tier}"
            
            # Get new enhanced metrics (with fallbacks for backward compatibility)
            consensus_score = cavity.get('consensus_score', 0.0)
            spatial_overlap = cavity.get('spatial_overlap', 0.0)
            residue_jacc = cavity.get('residue_jaccard', 0.0)
            physchem_sim = cavity.get('physicochemical_similarity', 0.0)
            score_agree = cavity.get('score_agreement', 0.0)
            
            criteria_str = ", ".join(cavity.get('match_criteria', []))[:28]
            
            # Color-code confidence (using symbols)
            conf_symbol = {
                'high': '★★★',
                'medium': '★★☆',
                'low': '★☆☆'
            }.get(cavity.get('confidence', 'medium'), '★★☆')
            
            conf_display = f"{cavity.get('confidence', 'medium')} {conf_symbol}"
            
            print(f"{cavity['rank']:<6} {cavity['cavity_id']:<4} {tier_display:<6} "
                  f"{conf_display:<12} {consensus_score:<10.3f} {spatial_overlap:<8.3f} {residue_jacc:<8.3f} "
                  f"{physchem_sim:<9.3f} {score_agree:<8.3f} {center_str:<25} {criteria_str:<30}")
        
        # Display detailed metrics for top consensus pocket
        if cavities:
            print("\n" + "=" * 150)
            print("Top Consensus Pocket - Detailed Metrics:")
            print("=" * 150)
            top_cavity = cavities[0]
            print(f"  Cavity ID: {top_cavity['cavity_id']}")
            print(f"  Detection Tier: {top_cavity.get('detection_tier', detection_tier)}")
            print(f"  Confidence: {top_cavity.get('confidence', 'N/A').upper()}")
            print(f"  Center: ({top_cavity['center'][0]:.2f}, {top_cavity['center'][1]:.2f}, {top_cavity['center'][2]:.2f})")
            print(f"\n  Comprehensive Similarity Metrics:")
            print(f"    Consensus Score:              {top_cavity.get('consensus_score', 0.0):.3f}  (weighted combination)")
            print(f"    Centroid Proximity:           {top_cavity.get('centroid_proximity', 0.0):.3f}  (Gaussian decay)")
            print(f"    Spatial Overlap (voxel):      {top_cavity.get('spatial_overlap', 0.0):.3f}  (Jaccard @ 1.0 Å)")
            print(f"    Residue Overlap (Jaccard):    {top_cavity.get('residue_jaccard', 0.0):.3f}")
            print(f"    Physicochemical Similarity:   {top_cavity.get('physicochemical_similarity', 0.0):.3f}  (cosine)")
            print(f"    Score Agreement:              {top_cavity.get('score_agreement', 0.0):.3f}")
            print(f"\n  Legacy Metrics (backward compatibility):")
            print(f"    Center Distance:              {top_cavity.get('center_distance', 0.0):.2f} Å")
            print(f"    Coverage (small pocket):      {top_cavity.get('coverage_small', 0.0):.3f}")
            print(f"\n  Tool-Specific Data:")
            fpocket_data = top_cavity.get('fpocket_data', {})
            p2rank_data = top_cavity.get('p2rank_data', {})
            print(f"    Fpocket Volume:               {fpocket_data.get('volume', 0.0):.1f} Ų")
            print(f"    Fpocket Druggability:         {fpocket_data.get('druggability_score', 0.0):.3f}")
            print(f"    P2Rank Score:                 {p2rank_data.get('score', 0.0):.3f}")
            print(f"    Residues:                     {top_cavity.get('num_residues', 0)}")
        
        else:
            # Single method display (fpocket or p2rank)
            print(f"\n[SUCCESS] Detected {total} cavities using {method.upper()}")
            print("\nTop Cavities:")
            print("=" * 100)
            
            if method == "fpocket":
                print(f"{'Rank':<6} {'ID':<4} {'Volume(Ų)':<12} {'Druggability':<14} {'Center(x,y,z)':<30} {'Size(x,y,z)':<25}")
                print("=" * 100)
                
                for cavity in cavities:
                    center_str = f"({cavity['center'][0]:.1f}, {cavity['center'][1]:.1f}, {cavity['center'][2]:.1f})"
                    size_str = f"({cavity['size'][0]:.1f}, {cavity['size'][1]:.1f}, {cavity['size'][2]:.1f})"
                    
                    print(f"{cavity['rank']:<6} {cavity['cavity_id']:<4} {cavity.get('volume', 0):<12.1f} "
                          f"{cavity.get('druggability_score', 0):<14.2f} {center_str:<30} {size_str:<25}")
            
            elif method == "p2rank":
                print(f"{'Rank':<6} {'ID':<4} {'Score':<10} {'Residues':<10} {'Center(x,y,z)':<30} {'Size(x,y,z)':<25}")
                print("=" * 100)
                
                for cavity in cavities:
                    center_str = f"({cavity['center'][0]:.1f}, {cavity['center'][1]:.1f}, {cavity['center'][2]:.1f})"
                    size_str = f"({cavity['size'][0]:.1f}, {cavity['size'][1]:.1f}, {cavity['size'][2]:.1f})"
                    
                    print(f"{cavity['rank']:<6} {cavity['cavity_id']:<4} {cavity.get('score', 0):<10.3f} "
                          f"{cavity.get('num_residues', 0):<10} {center_str:<30} {size_str:<25}")
        
        return cavities
        
    except requests.exceptions.ConnectionError:
        print("[ERROR] Cannot connect to backend. Is FastAPI running?")
        return None
    except Exception as e:
        print(f"[ERROR] Cavity detection failed: {e}")
        import traceback
        traceback.print_exc()
        return None



def select_cavities_for_docking(cavities):
    """Interactive cavity selection for docking."""
    if not cavities:
        return None
    
    print("\n" + "=" * 60)
    print("Select cavities for docking:")
    print("  - Enter cavity IDs (e.g., '1,2,3')")
    print("  - Enter 'all' to dock in all cavities")
    print("  - Enter 'top3' to dock in top 3 cavities")
    print("=" * 60)
    
    while True:
        selection = input("\nYour selection: ").strip().lower()
        
        if selection == 'all':
            selected_ids = [c['cavity_id'] for c in cavities]
            print(f"✓ Selected all {len(selected_ids)} cavities")
            return selected_ids
        
        elif selection.startswith('top'):
            try:
                n = int(selection.replace('top', ''))
                selected_ids = [c['cavity_id'] for c in cavities[:n]]
                print(f"✓ Selected top {len(selected_ids)} cavities")
                return selected_ids
            except ValueError:
                print("[ERROR] Invalid format. Use 'top3', 'top5', etc.")
                continue
        
        else:
            try:
                selected_ids = [int(id.strip()) for id in selection.split(',')]
                
                # Validate IDs
                available_ids = [c['cavity_id'] for c in cavities]
                invalid_ids = [id for id in selected_ids if id not in available_ids]
                
                if invalid_ids:
                    print(f"[ERROR] Invalid cavity IDs: {invalid_ids}")
                    print(f"Available IDs: {available_ids}")
                    continue
                
                print(f"✓ Selected {len(selected_ids)} cavities: {selected_ids}")
                return selected_ids
                
            except ValueError:
                print("[ERROR] Invalid format. Use comma-separated numbers (e.g., '1,2,3')")
                continue


def run_cavity_docking(session_id, cavity_ids):
    """Run cavity-based docking.
    
    Note:
        Exhaustiveness is fixed at 10 and num_modes is fixed at 9 in the backend.
    """
    try:
        print(f"\n[INFO] Running cavity-based docking...")
        print(f"   Cavities: {cavity_ids}")
        print(f"   Exhaustiveness: 10 (fixed)")
        print(f"   Modes per cavity: 9 (fixed)")
        print("   This may take several minutes...")
        
        # Convert cavity_ids list to comma-separated string
        cavity_ids_str = ','.join(map(str, cavity_ids))
        
        response = requests.post(
            f"{API_BASE_URL}/api/dock/run/{session_id}",
            params={
                'docking_mode': 'cavity',
                'cavity_ids': cavity_ids_str
            }
        )
        
        if response.status_code != 200:
            print(f"[ERROR] Docking failed (HTTP {response.status_code})")
            print(f"Response: {response.text[:500]}")
            return None
        
        data = response.json()
        
        if data.get('status') != 'ok':
            print(f"[ERROR] Docking error: {data.get('message', 'Unknown error')}")
            return None
        
        print(f"\n[SUCCESS] Cavity docking complete!")
        
        # Display summary
        summary = data.get('summary', {})
        print(f"\nSummary:")
        print(f"  Cavities docked: {summary.get('num_cavities', 0)}")
        print(f"  Total poses: {summary.get('total_poses', 0)}")
        print(f"  Best affinity: {summary.get('best_affinity', 'N/A')} kcal/mol")
        print(f"  Best cavity: {summary.get('best_cavity', 'N/A')}")
        
        # Display results table
        results = data.get('results', [])
        if results:
            print(f"\nTop 10 Poses (All Cavities):")
            print("=" * 110)
            print(f"{'Rank':<6} {'Mode':<6} {'Cavity':<8} {'Affinity':<12} {'RMSD':<12} {'Volume':<10} {'Druggability':<14}")
            print("=" * 110)
            
            for pose in results[:10]:
                rmsd_str = f"{pose['rmsd_lb']:.1f}/{pose['rmsd_ub']:.1f}"
                print(f"{pose['global_rank']:<6} {pose['mode']:<6} {pose['cavity_id']:<8} "
                      f"{pose['affinity']:<12.2f} {rmsd_str:<12} "
                      f"{pose['cavity_volume']:<10.1f} {pose['cavity_druggability']:<14.2f}")
        
        # Display best per cavity
        best_per_cavity = data.get('best_per_cavity', [])
        if best_per_cavity:
            print(f"\nBest Pose Per Cavity:")
            print("=" * 110)
            print(f"{'Cavity':<8} {'Rank':<6} {'Affinity':<12} {'RMSD':<12} {'Volume':<10} {'Druggability':<14}")
            print("=" * 110)
            
            for pose in best_per_cavity:
                rmsd_str = f"{pose['rmsd_lb']:.1f}/{pose['rmsd_ub']:.1f}"
                print(f"{pose['cavity_id']:<8} {pose['cavity_rank']:<6} "
                      f"{pose['affinity']:<12.2f} {rmsd_str:<12} "
                      f"{pose['cavity_volume']:<10.1f} {pose['cavity_druggability']:<14.2f}")
        
        return data
        
    except requests.exceptions.ConnectionError:
        print("[ERROR] Cannot connect to backend")
        return None
    except Exception as e:
        print(f"[ERROR] Docking failed: {e}")
        import traceback
        traceback.print_exc()
        return None




def analyze_interactions(session_id, pose_number=1):
    """Analyze protein-ligand interactions for a pose."""
    try:
        response = requests.get(f"{API_BASE_URL}/api/interactions/{session_id}/{pose_number}")
        
        # Check if response is successful
        if response.status_code != 200:
            print(f"⚠ API Error (HTTP {response.status_code})")
            print(f"Response: {response.text[:500]}")  # Show first 500 chars
            return None
        
        # Try to parse JSON
        try:
            data = response.json()
        except ValueError as e:
            print(f"⚠ Failed to parse JSON response")
            print(f"Response text: {response.text[:500]}")
            return None
        
        if data.get('status') == 'error':
            print(f"⚠ Error analyzing pose {pose_number}: {data.get('message')}")
            return None
        
        summary = data['summary']
        print(f"\nInteraction Summary for Pose {pose_number}:")
        print(f"  Hydrogen Bonds: {summary['hydrogen_bonds']}")
        print(f"  Hydrophobic: {summary['hydrophobic']}")
        print(f"  Ionic: {summary['ionic']}")
        print(f"  Pi-Stacking: {summary['pi_stacking']}")
        print(f"  Halogen Bonds: {summary['halogen_bonds']}")
        print(f"  Cation-Pi: {summary['cation_pi']}")
        print(f"  Total: {summary['total']}")
        print(f"\nContact Residues: {', '.join(data['contact_residues'][:10])}")
        if len(data['contact_residues']) > 10:
            print(f"  ... and {len(data['contact_residues']) - 10} more")
        
        return data
    except requests.exceptions.ConnectionError:
        print("⚠ Cannot connect to backend. Is FastAPI running?")
        print("   Start it with: uvicorn app:app --reload")
        return None
    except Exception as e:
        print(f"⚠ Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def analyze_heteroatoms_cli(session_id, filename):
    """
    Analyze and categorize heteroatoms in a protein file.
    
    This function helps you understand which heteroatoms (metal ions, cofactors, 
    ligands, buffer agents) are present in the protein structure.
    
    Args:
        session_id: Session ID
        filename: Protein filename
        
    Returns:
        Dict with analysis results including categorized heteroatoms
    """
    print(f"\n[INFO] Analyzing heteroatoms in {filename}...")
    
    response = requests.get(
        f"{API_BASE_URL}/api/analyze/heteroatoms/{session_id}",
        params={'file_name': filename}
    )
    
    if response.status_code != 200:
        print(f"[ERROR] Analysis failed (HTTP {response.status_code})")
        print(f"Response: {response.text[:500]}")
        return None
    
    data = response.json()
    
    if data.get('status') != 'ok':
        print(f"[ERROR] Analysis error: {data.get('message', 'Unknown error')}")
        return None
    
    # Display summary
    print(f"\n{'='*80}")
    print(f"HETEROATOM ANALYSIS RESULTS")
    print(f"{'='*80}")
    print(f"\n{data['summary']}\n")
    
    # Display categorized breakdown
    if data.get('details'):
        print("Detailed Breakdown:")
        for detail in data['details']:
            print(f"  • {detail}")
    
    # Display counts table
    if data.get('counts'):
        print(f"\n{'='*80}")
        print("HETEROATOM COUNTS")
        print(f"{'='*80}")
        print(f"{'Residue':<10} {'Atoms':<10} {'Count':<10} {'Category':<20}")
        print("-" * 50)
        
        for res_name in sorted(data['counts'].keys()):
            count = data['counts'][res_name]
            atom_count = data['atom_counts'].get(res_name, 0)
            
            # Determine category
            if res_name in data['metal_ions']:
                category = "Metal Ion"
            elif res_name in data['cofactors']:
                category = "Cofactor"
            elif res_name in data['ligands']:
                category = "Ligand"
            elif res_name in data['buffer_agents']:
                category = "Buffer Agent"
            else:
                category = "Other"
            
            print(f"{res_name:<10} {atom_count:<10} {count:<10} {category:<20}")
    
    print(f"\n{'='*80}")
    print("USAGE EXAMPLE")
    print(f"{'='*80}")
    print(f"prepare_protein_advanced(")
    print(f"    session_id='{session_id}',")
    print(f"    filename='{filename}',")
    print(f"    keep_hetero=['ZN', 'MG', 'NAD']  # Specify which to keep")
    print(f")")
    print(f"{'='*80}\n")
    
    return data

def prepare_protein_advanced(session_id, filename, keep_chains=None, keep_hetero=None, 
                           fix_structure=True, use_alphafold_if_incomplete=True):
    """Prepare protein with advanced options.
    
    Args:
        session_id: Session ID
        filename: Protein filename
        keep_chains: List of chain IDs to keep (e.g., ['A', 'B'])
        keep_hetero: List of heteroatom residues to keep (e.g., ['NAD', 'HEM'])
        fix_structure: Use PDBFixer to complete missing atoms (default: True, automatic)
        use_alphafold_if_incomplete: Use AlphaFold if missing residues detected (default: True, automatic)
    
    Note: pH is fixed at 7.4 in the backend.
    """
    params = {'file_name': filename}
    
    if keep_chains:
        params['keep_chains'] = ','.join(keep_chains)
    
    if keep_hetero:
        params['keep_hetero_residues'] = ','.join(keep_hetero)
    
    if fix_structure:
        params['fix_structure'] = 'true'
    
    if use_alphafold_if_incomplete:
        params['use_alphafold_if_incomplete'] = 'true'
    
    response = requests.post(
        f"{API_BASE_URL}/api/prepare/protein/{session_id}",
        params=params
    )
    response.raise_for_status()
    
    print(f"✓ Prepared protein:")
    print(f"  pH: 7.4 (fixed)")
    if keep_chains:
        print(f"  Kept chains: {', '.join(keep_chains)}")
    if keep_hetero:
        print(f"  Kept heteroatoms: {', '.join(keep_hetero)}")
    print(f"  PDBFixer: enabled (automatic)")
    print(f"  AlphaFold fallback: enabled (automatic)")

def download_results(session_id, output_dir="."):
    """Download result files."""
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True)
    
    # Download all poses
    response = requests.get(f"{API_BASE_URL}/api/file/{session_id}/docking_out_out.pdbqt")
    if response.status_code == 200:
        output_file = output_dir / f"docking_results_{session_id[:8]}.pdbqt"
        output_file.write_text(response.text)
        print(f"✓ Downloaded: {output_file}")

def test_complex_visualization(session_id, output_dir="./results"):
    """Test protein-ligand complex visualization."""
    print("\n[INFO] Testing protein-ligand complex visualization...")
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True)
    
    try:
        # Test 1: Get complex for best pose
        print("\n  Testing complex endpoint for best pose...")
        response = requests.get(f"{API_BASE_URL}/api/complex/pdb/{session_id}/1")
        
        if response.status_code == 200:
            complex_pdb = response.text
            
            # Analyze structure
            lines = complex_pdb.split('\n')
            protein_atoms = sum(1 for line in lines if line.startswith('ATOM'))
            ligand_atoms = sum(1 for line in lines if line.startswith('HETATM'))
            has_ter = any('TER' in line for line in lines)
            has_affinity = any('Binding Affinity' in line for line in lines)
            
            print(f"  ✓ Complex retrieved successfully")
            print(f"    - Protein atoms: {protein_atoms}")
            print(f"    - Ligand atoms: {ligand_atoms}")
            print(f"    - Has TER separator: {has_ter}")
            print(f"    - Has affinity metadata: {has_affinity}")
            
            if protein_atoms > 0 and ligand_atoms > 0:
                print(f"  ✓ SUCCESS: Complex contains both protein and ligand!")
                
                # Save to file
                output_file = output_dir / f"complex_pose1_{session_id[:8]}.pdb"
                output_file.write_text(complex_pdb)
                print(f"  ✓ Saved complex to: {output_file}")
                print(f"    You can visualize this in PyMOL, Chimera, or NGL Viewer")
                
                return True
            else:
                print(f"  ⚠ WARNING: Complex may be incomplete")
                return False
        else:
            print(f"  ✗ Failed to get complex: HTTP {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ✗ Error testing complex: {str(e)}")
        return False


def predict_structure_alphafold(session_id):
    """Interactive AlphaFold structure prediction."""
    print("\nAlphaFold Structure Prediction")
    print("-" * 50)
    print("Choose input method:")
    print("  1. FASTA sequence (ESMFold prediction)")
    print("  2. UniProt ID (AlphaFold database)")
    
    choice = input("\nEnter choice (1 or 2): ").strip()
    
    if choice == "1":
        return predict_from_sequence(session_id)
    elif choice == "2":
        return predict_from_uniprot(session_id)
    else:
        print("Invalid choice. Using FASTA sequence input.")
        return predict_from_sequence(session_id)

def predict_from_sequence(session_id):
    """Predict structure from FASTA sequence."""
    print("\nEnter your protein sequence (amino acids):")
    print("  - Valid amino acids: ACDEFGHIKLMNPQRSTVWY")
    print("  - Maximum length: 400 residues")
    print("  - Paste multi-line sequences (press Enter twice when done)")
    print()
    
    # Read multi-line input
    lines = []
    print("Paste sequence (press Enter on empty line when done):")
    while True:
        line = input()
        if line.strip() == "":
            break
        lines.append(line.strip())
    
    fasta_sequence = "".join(lines)
    
    if not fasta_sequence:
        print("[ERROR] No sequence provided.")
        return None
    
    print(f"\n[INFO] Sequence length: {len(fasta_sequence)} residues")
    print("[INFO] Predicting structure (this may take 30-60 seconds)...")
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/alphafold/sequence/{session_id}",
            params={'fasta_sequence': fasta_sequence}
        )
        response.raise_for_status()
        data = response.json()
        
        filename = data['filename']
        metadata = data['structure_metadata']
        
        print(f"✓ Structure predicted successfully!")
        print(f"  File: {filename}")
        print(f"  Confidence: {metadata['confidence'].upper()}")
        print(f"  pLDDT score: {metadata['avg_plddt']}")
        print(f"  Residues: {metadata['num_residues']}")
        
        return filename
        
    except requests.exceptions.HTTPError as e:
        print(f"[ERROR] Prediction failed: {e}")
        if e.response.status_code == 400:
            print(f"Details: {e.response.json().get('detail', 'Unknown error')}")
        return None
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
        return None

def predict_from_uniprot(session_id):
    """Fetch structure from UniProt ID."""
    print("\nEnter UniProt accession ID:")
    print("  Examples: P12345, A0A0C5B5G6, Q9Y6K9")
    print("  Format: 6-10 uppercase alphanumeric, starting with letter")
    
    uniprot_id = input("\nUniProt ID: ").strip().upper()
    
    if not uniprot_id:
        print("[ERROR] No UniProt ID provided.")
        return None
    
    print(f"\n[INFO] Fetching structure for {uniprot_id}...")
    
    try:
        # Get protein info first
        info_response = requests.get(f"{API_BASE_URL}/api/alphafold/uniprot/info/{uniprot_id}")
        if info_response.status_code == 200:
            info_data = info_response.json()
            protein_info = info_data.get('protein_info', {})
            print(f"\nProtein: {protein_info.get('protein_name', 'Unknown')}")
            print(f"Organism: {protein_info.get('organism', 'Unknown')}")
            print(f"Length: {protein_info.get('sequence_length', 0)} residues")
        
        # Fetch structure
        response = requests.post(
            f"{API_BASE_URL}/api/alphafold/uniprot/{session_id}",
            params={'uniprot_id': uniprot_id}
        )
        response.raise_for_status()
        data = response.json()
        
        filename = data['filename']
        metadata = data['structure_metadata']
        
        print(f"\n✓ Structure fetched successfully!")
        print(f"  File: {filename}")
        print(f"  Confidence: {metadata['confidence'].upper()}")
        print(f"  pLDDT score: {metadata['avg_plddt']}")
        print(f"  Residues: {metadata['num_residues']}")
        
        return filename
        
    except requests.exceptions.HTTPError as e:
        print(f"[ERROR] Fetch failed: {e}")
        if e.response.status_code == 400:
            detail = e.response.json().get('detail', 'Unknown error')
            print(f"Details: {detail}")
            print("\nPossible reasons:")
            print("  - Protein not in AlphaFold database")
            print("  - Invalid UniProt ID format")
        return None
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
        return None

def workflow_alphafold():
    """Complete AlphaFold-based docking workflow."""
    print_section("AlphaFold Workflow: Predict → Prepare → Dock")
    
    try:
        # Step 1: Create session
        print_section("Step 1: Create Session")
        session_id = create_session()
        
        # Step 2: Predict protein structure
        print_section("Step 2: Predict Protein Structure")
        protein_filename = predict_structure_alphafold(session_id)
        
        if not protein_filename:
            print("\n[ERROR] Structure prediction failed. Exiting.")
            return
        
        # Step 3: Ligand input (File or SMILES)
        print_section("Step 3: Upload Ligand")
        print("\nLigand Input Options:")
        print("  1. Upload ligand file (SDF/MOL/MOL2/PDB)")
        print("  2. Generate from SMILES string")
        
        ligand_choice = input("\nChoose option (1 or 2, default 1): ").strip()
        
        use_smiles = (ligand_choice == '2')
        ligand_filename = None
        
        if use_smiles:
            # SMILES input
            print("\nEnter SMILES string:")
            print("  Examples:")
            print("    Aspirin: CC(=O)OC1=CC=CC=C1C(=O)O")
            print("    Caffeine: CN1C=NC2=C1C(=O)N(C(=O)N2C)C")
            print("    Ibuprofen: CC(C)CC1=CC=C(C=C1)C(C)C(=O)O")
            
            smiles_string = input("\nSMILES: ").strip()
            
            if not smiles_string:
                print("No SMILES provided. Exiting.")
                return
            
            ligand_name = input("Ligand name (default: ligand): ").strip() or "ligand"
            
            # Generate ligand from SMILES
            create_ligand_from_smiles(session_id, smiles_string, ligand_name)
            ligand_filename = None  # Not needed for SMILES workflow
        else:
            # File input
            ligand_file = input("\nLigand file path (SDF/MOL/MOL2/PDB): ").strip()
            
            if not ligand_file:
                print("No ligand file provided. Exiting.")
                return
            
            upload_file(session_id, ligand_file, 'ligand')
            ligand_filename = f"ligand_{Path(ligand_file).name}"
        
        # Continue with normal workflow
        run_docking_workflow(session_id, protein_filename, ligand_filename)
        
    except Exception as e:
        print(f"\n[ERROR] {str(e)}")
        import traceback
        traceback.print_exc()

def workflow_automated(args):
    """Automated docking workflow using command-line arguments."""
    print_section("Automated Workflow: Command-Line Mode")
    
    try:
        # Validate inputs
        if not args.protein:
            print("[ERROR] Protein file is required. Use --protein or -p")
            print("Run with --help for usage information")
            return
        
        if not args.ligand and not args.smiles:
            print("[ERROR] Either ligand file (--ligand) or SMILES string (--smiles) is required")
            print("Run with --help for usage information")
            return
        
        if args.ligand and args.smiles:
            print("[ERROR] Cannot use both --ligand and --smiles. Choose one.")
            return
        
        if args.mode == 'manual' and not args.center:
            print("[ERROR] Manual mode requires --center coordinates")
            print("Example: --center \"10.5,20.3,15.7\"")
            return
        
        # Convert Windows paths to Path objects
        protein_path = Path(args.protein)
        ligand_path = Path(args.ligand) if args.ligand else None
        
        # Validate file existence
        if not protein_path.exists():
            print(f"[ERROR] Protein file not found: {protein_path}")
            return
        
        if ligand_path and not ligand_path.exists():
            print(f"[ERROR] Ligand file not found: {ligand_path}")
            return
        
        print(f"\n[INFO] Protein: {protein_path}")
        if args.ligand:
            print(f"[INFO] Ligand: {ligand_path}")
        else:
            print(f"[INFO] Ligand: SMILES - {args.smiles}")
        print(f"[INFO] Mode: {args.mode}")
        print(f"[INFO] Output: {args.output}")
        
        # Step 1: Create session
        print_section("Step 1: Create Session")
        session_id = create_session()
        
        # Step 2: Upload protein
        print_section("Step 2: Upload Protein")
        upload_file(session_id, str(protein_path), 'protein')
        protein_filename = f"protein_{protein_path.name}"
        
        # Step 3: Ligand preparation
        ligand_filename = None
        if args.smiles:
            print_section("Step 3: Generate Ligand from SMILES")
            create_ligand_from_smiles(session_id, args.smiles, args.name)
        else:
            print_section("Step 3: Upload Ligand")
            upload_file(session_id, str(ligand_path), 'ligand')
            ligand_filename = f"ligand_{ligand_path.name}"
        
        # Step 4: Protein Preparation
        print_section("Step 4: Protein Preparation")
        
        keep_chains = [c.strip() for c in args.chains.split(',')] if args.chains else None
        keep_hetero = [h.strip().upper() for h in args.hetero.split(',')] if args.hetero else None
        
        print("\nAutomatic structure completion enabled:")
        print("  ✓ PDBFixer: enabled (automatic)")
        print("  ✓ AlphaFold fallback: enabled (automatic)")
        
        prepare_protein_advanced(session_id, protein_filename,
                                keep_chains=keep_chains, keep_hetero=keep_hetero,
                                fix_structure=True, use_alphafold_if_incomplete=True)
        
        # Step 5: Ligand Preparation
        print_section("Step 5: Ligand Preparation")
        if ligand_filename is None:
            print("✓ Ligand already prepared (from SMILES)")
        else:
            prepare_ligand(session_id, ligand_filename)
        
        # Step 6: Docking
        if args.mode == 'cavity':
            # Cavity mode
            print_section("Step 6: Cavity Detection")
            
            cavities = detect_cavities_cli(session_id, top_n=args.top_n)
            
            if not cavities:
                print("\n[ERROR] Cavity detection failed. Cannot proceed.")
                return
            
            # Determine cavity IDs
            if args.cavity_ids:
                if args.cavity_ids.lower() == 'all':
                    cavity_ids = [c['cavity_id'] for c in cavities]
                else:
                    cavity_ids = [int(id.strip()) for id in args.cavity_ids.split(',')]
                print(f"\n[INFO] Selected cavities: {cavity_ids}")
            else:
                # Default: top 3 cavities
                cavity_ids = [c['cavity_id'] for c in cavities[:3]]
                print(f"\n[INFO] Auto-selected top 3 cavities: {cavity_ids}")
            
            # Run cavity docking
            print_section("Step 7: Run Cavity Docking")
            docking_data = run_cavity_docking(session_id, cavity_ids)
            
            if not docking_data:
                print("\n[ERROR] Cavity docking failed.")
                return
        
        else:
            # Manual mode
            print_section("Step 6: Manual Grid Configuration")
            
            # Parse center coordinates
            center_coords = [float(x.strip()) for x in args.center.split(',')]
            if len(center_coords) != 3:
                print("[ERROR] Center must have exactly 3 coordinates (x,y,z)")
                return
            
            center_x, center_y, center_z = center_coords
            
            # Parse size
            size_coords = [float(x.strip()) for x in args.size.split(',')]
            if len(size_coords) != 3:
                print("[ERROR] Size must have exactly 3 values (x,y,z)")
                return
            
            size_x, size_y, size_z = size_coords
            
            print(f"\n[INFO] Grid center: ({center_x}, {center_y}, {center_z})")
            print(f"[INFO] Grid size: ({size_x}, {size_y}, {size_z})")
            
            # Calculate grid
            response = requests.post(
                f"{API_BASE_URL}/api/grid/calc/{session_id}",
                params={
                    'mode': 'manual',
                    'center_x': center_x,
                    'center_y': center_y,
                    'center_z': center_z,
                    'size_x': size_x,
                    'size_y': size_y,
                    'size_z': size_z
                }
            )
            response.raise_for_status()
            grid_data = response.json()
            
            print(f"✓ Grid configured")
            
            # Run manual docking
            print_section("Step 7: Run Manual Docking")
            
            print(f"\n⏳ Running docking...")
            print("   This may take several minutes...")
            
            response = requests.post(
                f"{API_BASE_URL}/api/dock/run/{session_id}",
                params={
                    'exhaustiveness': 10,
                    'num_modes': 9,
                    'docking_mode': 'manual'
                }
            )
            response.raise_for_status()
            docking_data = response.json()
            
            print(f"✓ Docking complete!")
            
            # Display results
            print_section("Docking Results")
            results = get_results(session_id)
        
        # Step 8: Interaction Analysis
        print_section("Step 8: Interaction Analysis")
        
        if args.analyze_poses.lower() == 'all':
            poses_to_analyze = range(1, 10)  # Analyze all 9 modes
        else:
            poses_to_analyze = [int(x.strip()) for x in args.analyze_poses.split(',')]
        
        for pose_num in poses_to_analyze:
            print(f"\n--- Pose {pose_num} ---")
            analyze_interactions(session_id, pose_number=pose_num)
        
        # Step 9: Download Results
        print_section("Step 9: Download Results")
        download_results(session_id, output_dir=args.output)
        
        # Step 10: Complex Visualization
        print_section("Step 10: Complex Visualization")
        test_complex_visualization(session_id, output_dir=args.output)
        
        # Summary
        print_section("✓ Automated Docking Complete!")
        print(f"\nSession ID: {session_id}")
        print(f"Results saved to: {args.output}/")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()

def workflow_normal():
    """Normal docking workflow with uploaded structures."""
    print_section("Normal Workflow: Upload → Prepare → Dock")
    
    # Get input files from user
    print("\nEnter file paths:")
    protein_file = input("Protein file (PDB/ENT): ").strip()
    
    if not protein_file:
        print("\nNo protein file provided. Exiting.")
        return
    
    # Ligand input: File or SMILES
    print("\nLigand Input Options:")
    print("  1. Upload ligand file (SDF/MOL/MOL2/PDB)")
    print("  2. Generate from SMILES string")
    
    ligand_choice = input("\nChoose option (1 or 2, default 1): ").strip()
    
    use_smiles = (ligand_choice == '2')
    ligand_file = None
    smiles_string = None
    ligand_name = None
    
    if use_smiles:
        # SMILES input
        print("\nEnter SMILES string:")
        print("  Examples:")
        print("    Aspirin: CC(=O)OC1=CC=CC=C1C(=O)O")
        print("    Caffeine: CN1C=NC2=C1C(=O)N(C(=O)N2C)C")
        print("    Ibuprofen: CC(C)CC1=CC=C(C=C1)C(C)C(=O)O")
        
        smiles_string = input("\nSMILES: ").strip()
        
        if not smiles_string:
            print("No SMILES provided. Exiting.")
            return
        
        ligand_name = input("Ligand name (default: ligand): ").strip() or "ligand"
    else:
        # File input
        ligand_file = input("Ligand file (SDF/MOL/MOL2/PDB): ").strip()
        
        if not ligand_file:
            print("No ligand file provided. Exiting.")
            return
    
    try:
        # Step 1: Create session
        print_section("Step 1: Create Session")
        session_id = create_session()
        
        # Step 2: Upload protein
        print_section("Step 2: Upload Protein")
        upload_file(session_id, protein_file, 'protein')
        protein_filename = f"protein_{Path(protein_file).name}"
        
        # Step 3: Ligand preparation (file or SMILES)
        if use_smiles:
            print_section("Step 3: Generate Ligand from SMILES")
            create_ligand_from_smiles(session_id, smiles_string, ligand_name)
            ligand_filename = None  # Not needed for SMILES workflow
        else:
            print_section("Step 3: Upload Ligand")
            upload_file(session_id, ligand_file, 'ligand')
            ligand_filename = f"ligand_{Path(ligand_file).name}"
        
        # Continue with normal workflow
        run_docking_workflow(session_id, protein_filename, ligand_filename)
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()

def run_docking_workflow(session_id, protein_filename, ligand_filename):
    """Run the common docking workflow (preparation → grid → docking → analysis)."""
    
    # Step: Advanced Protein Preparation
    print_section("Protein Preparation (Advanced)")
    
    # Ask user for advanced options
    print("\\nAdvanced Options (press Enter to use defaults):")
    
    # Chain selection
    keep_chains = None
    chain_input = input("Keep specific chains? (e.g., A,B or press Enter for all): ").strip()
    if chain_input:
        keep_chains = [c.strip() for c in chain_input.split(',')]
    
    # Heteroatom selection
    keep_hetero = None
    hetero_input = input("Keep heteroatoms? (e.g., NAD,HEM,ZN or press Enter to remove all): ").strip()
    if hetero_input:
        keep_hetero = [h.strip().upper() for h in hetero_input.split(',')]
    
    # Structure completion options - AUTOMATIC (no user input needed)
    fix_structure = True  # Automatic
    use_alphafold = True  # Automatic
    
    print("\nAutomatic structure completion enabled:")
    print("  ✓ PDBFixer: enabled (automatic)")
    print("  ✓ AlphaFold fallback: enabled (automatic)")
    
    # Prepare with advanced options
    prepare_protein_advanced(session_id, protein_filename, 
                            keep_chains=keep_chains, keep_hetero=keep_hetero,
                            fix_structure=fix_structure, 
                            use_alphafold_if_incomplete=use_alphafold)
    
    # Step: Ligand Preparation
    print_section("Ligand Preparation")
    
    # Skip preparation if ligand was generated from SMILES (already prepared)
    if ligand_filename is None:
        print("✓ Ligand already prepared (from SMILES)")
    else:
        prepare_ligand(session_id, ligand_filename)
    
    # Step: Docking Mode Selection
    print_section("Docking Mode Selection")
    
    print("\nChoose docking mode:")
    print("  1. Auto Cavity Docking (Recommended)")
    print("     - Automatically detects binding pockets")
    print("     - Docks in multiple cavities")
    print("     - Scientifically sound approach")
    print()
    print("  2. Manual Active-Site Docking (Expert Mode)")
    print("     - User defines grid center and size")
    print("     - For known binding sites")
    print("     - Full control over docking parameters")
    
    docking_choice = input("\nChoose mode (1 or 2, default 1): ").strip()
    
    if docking_choice == '2':
        # Manual Mode: User-defined grid
        print_section("Manual Grid Configuration")
        
        print("\nEnter grid center coordinates:")
        center_x = float(input("  X: "))
        center_y = float(input("  Y: "))
        center_z = float(input("  Z: "))
        
        size_input = input("\nGrid size (default 20,20,20): ").strip()
        if size_input:
            # Strip parentheses and whitespace to handle formats like "(30, 30, 30)"
            size_input = size_input.strip('()').strip()
            size_x, size_y, size_z = [float(x.strip()) for x in size_input.split(',')]
        else:
            size_x, size_y, size_z = 20.0, 20.0, 20.0
        
        # Calculate grid (manual mode)
        print("\n[INFO] Calculating grid parameters...")
        response = requests.post(
            f"{API_BASE_URL}/api/grid/calc/{session_id}",
            params={
                'mode': 'manual',
                'center_x': center_x,
                'center_y': center_y,
                'center_z': center_z,
                'size_x': size_x,
                'size_y': size_y,
                'size_z': size_z
            }
        )
        response.raise_for_status()
        grid_data = response.json()
        
        print(f"✓ Grid configured:")
        print(f"  Center: {grid_data['center']}")
        print(f"  Size: {grid_data['size']}")
        
        # Display validation warnings
        validation = grid_data.get('validation', {})
        size_val = validation.get('size', {})
        if size_val.get('warnings'):
            print("\n⚠ Warnings:")
            for warning in size_val['warnings']:
                print(f"  - {warning}")
        
        # Run docking (manual mode) - Fixed parameters
        print_section("Run Docking (Manual Mode)")
        
        # Fixed parameters (backend enforces these)
        exhaustiveness = 10  # Fixed in backend
        num_modes = 9  # Fixed in backend
        
        print(f"\nDocking parameters (fixed in backend):")
        print(f"  Exhaustiveness: {exhaustiveness}")
        print(f"  Number of modes: {num_modes}")
        
        print(f"\n⏳ Running docking...")
        print("   This may take several minutes...")
        
        response = requests.post(
            f"{API_BASE_URL}/api/dock/run/{session_id}",
            params={
                'exhaustiveness': exhaustiveness,
                'num_modes': num_modes,
                'docking_mode': 'manual'
            }
        )
        response.raise_for_status()
        docking_data = response.json()
        
        print(f"✓ Docking complete!")
        
        # Display results
        print_section("Docking Results (Manual Mode)")
        results = get_results(session_id)
    
    else:
        # Cavity Mode: Auto-detect cavities using Consensus (automatic 3-tier fallback)
        print_section("Cavity Detection")
        
        print("\nUsing Consensus Detection (P2RANK + Fpocket)")
        print("  → Automatic 3-tier fallback system")
        print("  → Tier 1: Consensus (both tools agree) - High confidence")
        print("  → Tier 2: P2Rank only - Medium-high confidence")
        print("  → Tier 3: Fpocket + PRANK - Medium confidence")
        
        top_n_input = input("\nNumber of cavities to detect (default 5): ").strip()
        top_n = int(top_n_input) if top_n_input else 5
        
        cavities = detect_cavities_cli(session_id, top_n=top_n)
        
        if not cavities:
            print("\n[ERROR] Cavity detection failed. Cannot proceed with cavity docking.")
            print("Please try manual mode instead.")
            return
        
        # Cavity selection
        cavity_ids = select_cavities_for_docking(cavities)
        
        
        if not cavity_ids:
            print("\n[ERROR] No cavities selected. Exiting.")
            return
        
        # Docking configuration - Fixed parameters
        print_section("Docking Configuration")
        
        # Fixed parameters (backend enforces these)
        
        print("\nDocking parameters are fixed in the backend:")
        print(f"  Exhaustiveness: 10 (fixed)")
        print(f"  Number of modes per cavity: 9 (fixed)")
        
        # Run cavity docking
        print_section("Run Docking (Cavity Mode)")
        docking_data = run_cavity_docking(session_id, cavity_ids)
        
        if not docking_data:
            print("\n[ERROR] Cavity docking failed.")
            return
    

    # Step: Interaction Analysis
    print_section("Interaction Analysis")
    
    # Ask which poses to analyze
    analyze_input = input(f"\nAnalyze which poses? (e.g., 1,2,3 or 'all' for all 9 poses, default 1): ").strip()
    
    if analyze_input.lower() == 'all':
        poses_to_analyze = range(1, 10)  # 9 modes + 1
    elif analyze_input:
        poses_to_analyze = [int(x.strip()) for x in analyze_input.split(',')]
    else:
        poses_to_analyze = [1]
    
    for pose_num in poses_to_analyze:
        print(f"\n--- Pose {pose_num} ---")
        analyze_interactions(session_id, pose_number=pose_num)
    
    # Step: Download Results
    print_section("Download Results")
    download_results(session_id, output_dir="./results")
    
    # Step: Test Complex Visualization
    print_section("Complex Visualization Test")
    test_complex_visualization(session_id, output_dir="./results")
    
    
    # Summary
    print_section("✓ Complete!")
    print(f"\nSession ID: {session_id}")
    # Results summary already displayed in cavity/manual mode sections above

    print(f"\nResults saved to: ./results/")

def main():
    """Main menu for docking workflows."""
    # Check if command-line arguments were provided
    if len(sys.argv) > 1:
        # Automated mode with command-line arguments
        args = parse_arguments()
        workflow_automated(args)
    else:
        # Interactive mode
        print_section("Molecular Docking Backend - Interactive CLI")
        
        print("\nChoose your workflow:")
        print("  1. AlphaFold Workflow (Predict structure from sequence/UniProt ID)")
        print("  2. Normal Workflow (Use existing PDB/structure files)")
        print("  3. Exit")
        
        choice = input("\nEnter choice (1, 2, or 3): ").strip()
        
        if choice == "1":
            workflow_alphafold()
        elif choice == "2":
            workflow_normal()
        elif choice == "3":
            print("\nExiting...")
            return
        else:
            print("\nInvalid choice. Please run again and select 1, 2, or 3.")


if __name__ == "__main__":
    main()

