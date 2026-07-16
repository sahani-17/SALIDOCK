"""
Pre-download PUResNet residue files to backend/puresnet_residues/
on the HOST machine, so Docker COPY can embed them without needing
network access during the build.

Run from: /mnt/d/SALIDOCK with docking_env active
"""
import os
import sys
import time
import urllib.request
from pathlib import Path

AMINO_ACIDS = [
    'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
    'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL'
]

OUT_DIR = Path('/mnt/d/SALIDOCK/backend/puresnet_residues')
OUT_DIR.mkdir(parents=True, exist_ok=True)

print(f"Downloading residue files to: {OUT_DIR}")
print(f"Files needed: {len(AMINO_ACIDS) * 2} (20 CIF + 20 SDF)\n")

failed = []
for name in AMINO_ACIDS:
    for ext, url_suffix in [('cif', f'{name}.cif'), ('sdf', f'{name}_ideal.sdf')]:
        dest = OUT_DIR / f"{name}.{ext}"
        if dest.exists() and dest.stat().st_size > 100:
            print(f"  SKIP  {name}.{ext}  (already exists)")
            continue
        url = f"https://files.rcsb.org/ligands/download/{url_suffix}"
        for attempt in range(3):
            try:
                urllib.request.urlretrieve(url, dest)
                size = dest.stat().st_size
                print(f"  OK    {name}.{ext}  ({size} bytes)")
                break
            except Exception as e:
                if attempt < 2:
                    print(f"  RETRY {name}.{ext} (attempt {attempt+2}/3)...")
                    time.sleep(2)
                else:
                    print(f"  FAIL  {name}.{ext}: {e}")
                    failed.append(f"{name}.{ext}")

print(f"\n{'='*50}")
cif_count = len(list(OUT_DIR.glob('*.cif')))
sdf_count = len(list(OUT_DIR.glob('*.sdf')))
print(f"CIF files: {cif_count}/20")
print(f"SDF files: {sdf_count}/20")
if failed:
    print(f"FAILED: {failed}")
    sys.exit(1)
else:
    print("All residue files downloaded successfully!")
    print(f"\nNext: docker build -f backend/puresnet_cpu.Dockerfile -t salidock-puresnet-cpu:latest .")
