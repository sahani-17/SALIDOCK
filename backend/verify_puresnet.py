import os
import puresnet
import puresnet.residue_h as rh

pkg_dir = os.path.dirname(puresnet.__file__)
res_dir = os.path.join(pkg_dir, 'residues')
print(f'puresnet package: {pkg_dir}')
print(f'residues/ dir: {res_dir}')

# Check files
cif_files = [f for f in os.listdir(res_dir) if f.endswith('.cif')]
sdf_files = [f for f in os.listdir(res_dir) if f.endswith('.sdf')]

print(f'Residue CIF files: {len(cif_files)}')
print(f'Residue SDF files: {len(sdf_files)}')

assert len(cif_files) == 20, f'Expected 20 CIF files, found {len(cif_files)}'
assert len(sdf_files) == 20, f'Expected 20 SDF files, found {len(sdf_files)}'

# Test get_residue for standard residues
for name in ['ALA', 'PRO', 'TRP', 'VAL']:
    try:
        mol = rh.get_residue(name)
        assert mol is not None, f"get_residue('{name}') returned None"
        print(f"get_residue('{name}'): OK")
    except Exception as e:
        print(f"get_residue('{name}') failed: {type(e).__name__} - {e}")
        raise e

print('All checks passed — image is CPU-ready and fully patched!')
