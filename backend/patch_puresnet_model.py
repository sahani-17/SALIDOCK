import re, pathlib

# 1. Patch model.py
model_py = pathlib.Path('/opt/conda/lib/python3.9/site-packages/puresnet/model.py')
src = model_py.read_text()

# Patch: ME.torch.load(model_path) -> ME.torch.load(model_path, map_location='cpu')
patched = re.sub(
    r"ME\.torch\.load\(model_path\)",
    "ME.torch.load(model_path, map_location='cpu')",
    src
)
if patched == src:
    patched = re.sub(
        r"torch\.load\(model_path\)",
        "torch.load(model_path, map_location='cpu')",
        src
    )

model_py.write_text(patched)
print('model.py patched OK')

# 2. Patch residue_h.py
residue_h_py = pathlib.Path('/opt/conda/lib/python3.9/site-packages/puresnet/residue_h.py')
src_h = residue_h_py.read_text()

# Patch ch_path=os.getcwd() -> ch_path=os.path.dirname(os.path.abspath(__file__))
patched_h = src_h.replace(
    "ch_path=os.getcwd()",
    "ch_path=os.path.dirname(os.path.abspath(__file__))"
)

# Patch URL _model.sdf -> _ideal.sdf
patched_h = patched_h.replace(
    "_model.sdf",
    "_ideal.sdf"
)

residue_h_py.write_text(patched_h)
print('residue_h.py patched OK')
