import os
import urllib.request
import puresnet

AMINO_ACIDS = [
    'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
    'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL'
]

pkg_dir = os.path.dirname(puresnet.__file__)
res_dir = os.path.join(pkg_dir, 'residues')
os.makedirs(res_dir, exist_ok=True)

print(f"Downloading residue library into: {res_dir}")

downloaded_cif = 0
downloaded_sdf = 0

for name in AMINO_ACIDS:
    cif_url = f"https://files.rcsb.org/ligands/download/{name}.cif"
    sdf_url = f"https://files.rcsb.org/ligands/download/{name}_ideal.sdf"
    
    cif_path = os.path.join(res_dir, f"{name}.cif")
    sdf_path = os.path.join(res_dir, f"{name}.sdf")
    
    # Download CIF
    try:
        urllib.request.urlretrieve(cif_url, cif_path)
        downloaded_cif += 1
        print(f"  Downloaded {name}.cif")
    except Exception as e:
        print(f"  ERROR downloading {name}.cif: {e}")
        
    # Download SDF
    try:
        urllib.request.urlretrieve(sdf_url, sdf_path)
        downloaded_sdf += 1
        print(f"  Downloaded {name}.sdf")
    except Exception as e:
        print(f"  ERROR downloading {name}.sdf: {e}")

print(f"\nDownload complete: {downloaded_cif}/20 CIF files, {downloaded_sdf}/20 SDF files.")
assert downloaded_cif == 20, "Failed to download all CIF files!"
assert downloaded_sdf == 20, "Failed to download all SDF files!"
