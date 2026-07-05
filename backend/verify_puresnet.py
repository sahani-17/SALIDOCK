"""
verify_puresnet.py
Runs INSIDE Docker container at the END of the build as a self-test.
If this script fails, `docker build` fails — the broken image never ships.
"""
import os
import sys

# ── 0. Check env vars set by the Dockerfile ──────────────────────────────
force_cpu = os.environ.get("FORCE_CPU", "")
cuda_devs = os.environ.get("CUDA_VISIBLE_DEVICES", "NOT_SET")

print(f"[verify] FORCE_CPU             : {force_cpu!r}")
print(f"[verify] CUDA_VISIBLE_DEVICES  : {cuda_devs!r}")

if force_cpu != "1":
    print("WARNING: FORCE_CPU is not set to '1' — image may try to use GPU at runtime")

if cuda_devs == "NOT_SET":
    print("WARNING: CUDA_VISIBLE_DEVICES is not set — MinkowskiEngine may probe CUDA")

# ── 1. Import puresnet (guard so we get a clean error message) ────────────
try:
    import puresnet
except ImportError as e:
    print(f"[verify] FATAL: cannot import puresnet: {e}", file=sys.stderr)
    sys.exit(1)

pkg_dir = os.path.dirname(puresnet.__file__)
res_dir = os.path.join(pkg_dir, "residues")
print(f"[verify] puresnet package : {pkg_dir}")
print(f"[verify] residues dir     : {res_dir}")

# ── 2. Check residue files ────────────────────────────────────────────────
if not os.path.isdir(res_dir):
    print(f"[verify] FATAL: residues dir does not exist: {res_dir}", file=sys.stderr)
    sys.exit(1)

cif_files = [f for f in os.listdir(res_dir) if f.endswith(".cif")]
sdf_files = [f for f in os.listdir(res_dir) if f.endswith(".sdf")]

print(f"[verify] CIF files : {len(cif_files)}/20")
print(f"[verify] SDF files : {len(sdf_files)}/20")

if len(cif_files) < 20:
    print(f"[verify] FATAL: only {len(cif_files)} CIF files found", file=sys.stderr)
    sys.exit(1)
if len(sdf_files) < 20:
    print(f"[verify] FATAL: only {len(sdf_files)} SDF files found", file=sys.stderr)
    sys.exit(1)

# ── 3. Test get_residue() for a subset of amino acids ────────────────────
try:
    import puresnet.residue_h as rh
except ImportError as e:
    print(f"[verify] FATAL: cannot import puresnet.residue_h: {e}", file=sys.stderr)
    sys.exit(1)

test_residues = ["ALA", "PRO", "TRP", "VAL"]
failed_residues = []

for name in test_residues:
    try:
        mol = rh.get_residue(name)
        if mol is None:
            raise ValueError(f"get_residue('{name}') returned None")
        print(f"[verify] get_residue('{name}'): OK")
    except Exception as e:
        print(f"[verify] get_residue('{name}') FAILED: {type(e).__name__} — {e}", file=sys.stderr)
        failed_residues.append(name)

if failed_residues:
    print(f"[verify] FATAL: residue lookup failed for: {failed_residues}", file=sys.stderr)
    sys.exit(1)

# ── 4. Confirm model.py was patched ──────────────────────────────────────
import pathlib
model_py = pathlib.Path(pkg_dir) / "model.py"
model_src = model_py.read_text(encoding="utf-8")

if "map_location='cpu'" not in model_src:
    print("[verify] FATAL: model.py patch NOT applied — map_location='cpu' missing!", file=sys.stderr)
    sys.exit(1)

print("[verify] model.py patch      : OK  (map_location='cpu' present)")

# ── All checks passed ─────────────────────────────────────────────────────
print("\n[verify] ✅ All checks passed — image is CPU-ready and fully patched!")
