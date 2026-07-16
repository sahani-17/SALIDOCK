"""
install_puresnet_residues.py
Runs INSIDE Docker container during build.
Copies pre-downloaded residue files from /tmp/puresnet_residues/
into the puresnet package residues/ directory.
"""
import os
import shutil
import sys
import puresnet

# ── Resolve destination dir dynamically (no hard-coded Python version) ────
pkg_dir = os.path.dirname(puresnet.__file__)
res_dir = os.path.join(pkg_dir, "residues")
src_dir = "/tmp/puresnet_residues"

# Auto-detect nested directory (happens when cp -r creates a subdirectory)
# e.g. /tmp/puresnet_residues/puresnet_residues/ALA.cif  →  use the nested dir
nested = os.path.join(src_dir, "puresnet_residues")
if os.path.isdir(nested):
    print(f"[install] Detected nested dir — using: {nested}")
    src_dir = nested

os.makedirs(res_dir, exist_ok=True)

print(f"[install] puresnet package : {pkg_dir}")
print(f"[install] residues dir      : {res_dir}")
print(f"[install] source dir        : {src_dir}")

if not os.path.isdir(src_dir):
    print(f"ERROR: source dir not found: {src_dir}", file=sys.stderr)
    sys.exit(1)

all_files = os.listdir(src_dir)
if not all_files:
    print(f"ERROR: source dir is empty: {src_dir}", file=sys.stderr)
    sys.exit(1)

cif_count = 0
sdf_count = 0
errors = []

for fname in all_files:
    src = os.path.join(src_dir, fname)
    dst = os.path.join(res_dir, fname)
    try:
        shutil.copy2(src, dst)
        if fname.endswith(".cif"):
            cif_count += 1
        elif fname.endswith(".sdf"):
            sdf_count += 1
        print(f"  [OK] {fname}")
    except Exception as e:
        print(f"  [FAIL] {fname}: {e}", file=sys.stderr)
        errors.append(fname)

print(f"\n[install] CIF files installed : {cif_count}/20")
print(f"[install] SDF files installed : {sdf_count}/20")

if errors:
    print(f"[install] ERRORS ({len(errors)}): {errors}", file=sys.stderr)
    sys.exit(1)

# Use >= 20 so any extra files (e.g. from future upstream additions) don't fail the build
if cif_count < 20:
    print(f"ERROR: Expected >= 20 CIF files, got {cif_count}", file=sys.stderr)
    sys.exit(1)
if sdf_count < 20:
    print(f"ERROR: Expected >= 20 SDF files, got {sdf_count}", file=sys.stderr)
    sys.exit(1)

print("[install] Residue files installed successfully!")
