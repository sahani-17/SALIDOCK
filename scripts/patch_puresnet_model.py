"""
patch_puresnet_model.py
Runs INSIDE the Docker container during build.

Fixes:
  1. Dynamically discovers the puresnet site-packages path — no hard-coded
     Python version (was wrong: 3.9 instead of 3.10 inside sparseconv env).
  2. Patches model.py  → torch.load(..., map_location='cpu')
  3. Patches residue_h.py → use package dir for CIF/SDF lookup + _ideal.sdf
"""
import re
import pathlib
import puresnet

# ── Dynamically resolve paths ─────────────────────────────────────────────
pkg_dir = pathlib.Path(puresnet.__file__).parent
print(f"[patch] puresnet package dir: {pkg_dir}")

# ── 1. Patch model.py ─────────────────────────────────────────────────────
model_py = pkg_dir / "model.py"
if not model_py.exists():
    raise FileNotFoundError(f"model.py not found at: {model_py}")

src = model_py.read_text(encoding="utf-8")
original = src

# Broad regex: matches torch.load(model_path) with any optional whitespace,
# whether called as ME.torch.load or plain torch.load
src = re.sub(
    r"(ME\.torch\.load|torch\.load)\(\s*model_path\s*\)",
    r"\1(model_path, map_location='cpu')",
    src,
)

# Fallback literal replace in case the call is already assigned a variable
if src == original:
    src = src.replace(
        "torch.load(model_path)",
        "torch.load(model_path, map_location='cpu')",
    )

if src == original:
    raise RuntimeError(
        "patch_puresnet_model.py: Could not find torch.load(model_path) in model.py!\n"
        "Please inspect the file manually and update the regex."
    )

model_py.write_text(src, encoding="utf-8")
print("[patch] model.py patched OK  → map_location='cpu' added")

# ── 2. Patch residue_h.py ─────────────────────────────────────────────────
residue_h_py = pkg_dir / "residue_h.py"
if not residue_h_py.exists():
    raise FileNotFoundError(f"residue_h.py not found at: {residue_h_py}")

src_h = residue_h_py.read_text(encoding="utf-8")
original_h = src_h

# Fix 2a: ch_path should point to the package dir, not the process cwd
src_h = src_h.replace(
    "ch_path=os.getcwd()",
    "ch_path=os.path.dirname(os.path.abspath(__file__))",
)

# Fix 2b: upstream code downloads *_model.sdf but the RCSB URL is *_ideal.sdf
src_h = src_h.replace("_model.sdf", "_ideal.sdf")

if src_h == original_h:
    print("[patch] WARNING: residue_h.py — no changes made (may already be patched)")
else:
    residue_h_py.write_text(src_h, encoding="utf-8")
    print("[patch] residue_h.py patched OK  → ch_path + _ideal.sdf fixed")

print("[patch] All patches applied successfully.")
