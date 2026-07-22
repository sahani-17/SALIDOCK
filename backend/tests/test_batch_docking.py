import os
import tempfile
from pathlib import Path
import pytest
from rdkit import Chem
import sys

# Ensure backend root is in import path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import tools

def test_validate_multi_mol_sdf():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create a mock SDF with 2 simple molecules
        sdf_path = Path(tmpdir) / "test.sdf"
        
        mol1 = Chem.MolFromSmiles("CCO")
        mol2 = Chem.MolFromSmiles("CCC")
        
        writer = Chem.SDWriter(str(sdf_path))
        writer.write(mol1)
        writer.write(mol2)
        writer.close()
        
        res = tools.validate_multi_mol_sdf(str(sdf_path))
        assert res["valid"] is True
        assert res["count"] == 2

def test_parse_and_prepare_batch_sdf():
    with tempfile.TemporaryDirectory() as tmpdir:
        sdf_path = Path(tmpdir) / "test.sdf"
        session_dir = Path(tmpdir)
        
        mol1 = Chem.MolFromSmiles("CCO")
        mol1.SetProp("_Name", "Ethanol")
        mol2 = Chem.MolFromSmiles("CCC")
        mol2.SetProp("_Name", "Propane")
        
        writer = Chem.SDWriter(str(sdf_path))
        writer.write(mol1)
        writer.write(mol2)
        writer.close()
        
        ligands = tools.parse_and_prepare_batch_sdf(str(sdf_path), session_dir)
        assert len(ligands) == 2
        assert ligands[0]["name"] == "Ethanol"
        assert ligands[1]["name"] == "Propane"
        assert (session_dir / ligands[0]["raw_sdf"]).exists()
        assert (session_dir / ligands[1]["raw_sdf"]).exists()
        assert ligands[0]["properties"]["mw"] > 0
        assert ligands[0]["properties"]["formula"] == "C2H6O"

def test_generate_batch_ligands_from_smiles():
    with tempfile.TemporaryDirectory() as tmpdir:
        session_dir = Path(tmpdir)
        smiles_list = [
            {"smiles": "CCO", "name": "Ethanol"},
            {"smiles": "CCC", "name": "Propane"}
        ]
        
        ligands = tools.generate_batch_ligands_from_smiles(smiles_list, session_dir)
        assert len(ligands) == 2
        assert ligands[0]["name"] == "Ethanol"
        assert ligands[1]["name"] == "Propane"
        assert (session_dir / ligands[0]["raw_sdf"]).exists()
        assert (session_dir / ligands[1]["raw_sdf"]).exists()
        assert ligands[0]["properties"]["mw"] > 0
