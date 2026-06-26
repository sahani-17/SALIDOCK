import sys
import torch
import numpy as np
from pathlib import Path

# Add VN-EGNN repo to path
sys.path.insert(0, "/home/sahani/.salidock/vnegnn")

from src.models.vnegnn.vnegnn import VNEGNN
from src.utils.graph import sample_fibonacci_grid
from src.datasets.utils import res_to_one_hot, cat_features, pad_to_equal_dim
from torch_geometric.nn import radius_graph

# 1. Load model and hparams
ckpt_path = "/home/sahani/.salidock/vnegnn/best_model.ckpt"
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

state = torch.load(ckpt_path, map_location=device, weights_only=False)
hparams = state["hyper_parameters"]

model = VNEGNN(
    input_features=hparams['input_features'],
    node_features=hparams['node_features'],
    edge_features=hparams['edge_features'],
    hidden_features=hparams['hidden_features'],
    out_features=hparams['out_features'],
    num_layers=hparams['num_layers'],
    act=hparams['act'],
    dropout=hparams['dropout'],
    node_aggr=hparams['node_aggr'],
    cord_aggr=hparams['cord_aggr'],
    residual=hparams['residual'],
    norm_coords=hparams['norm_coords'],
    norm_coors_scale_init=hparams['norm_coors_scale_init'],
    norm_feats=hparams['norm_feats'],
    initialization_gain=hparams['initialization_gain'],
    weight_share=hparams['weight_share'],
)

# Load state_dict (removing 'model.' prefix)
raw_sd = state["state_dict"]
new_sd = {}
for k, v in raw_sd.items():
    if k.startswith("model."):
        new_sd[k[6:]] = v
    else:
        new_sd[k] = v
model.load_state_dict(new_sd)
model = model.to(device).eval()
print("Model loaded successfully!")

# 2. Parse PDB
pdb_path = Path("/home/sahani/.salidock/vnegnn/examples/1odi.pdb")
THREE_TO_ONE = {
    'ALA':'A', 'VAL':'V', 'PHE':'F', 'PRO':'P', 'MET':'M', 'ILE':'I', 'LEU':'L', 'ASP':'D', 'GLU':'E', 'LYS':'K',
    'ARG':'R', 'SER':'S', 'THR':'T', 'TYR':'Y', 'HIS':'H', 'CYS':'C', 'ASN':'N', 'GLN':'Q', 'TRP':'W', 'GLY':'G'
}

coords = []
res_names = []
chains = []
for line in pdb_path.read_text().splitlines():
    if not line.startswith("ATOM"):
        continue
    if line[12:16].strip() != "CA":
        continue
    try:
        x = float(line[30:38])
        y = float(line[38:46])
        z = float(line[46:54])
        coords.append([x, y, z])
        rname = line[17:20].strip()
        res_names.append(rname)
        chain = line[21:22].strip()
        if not chain:
            chain = "A"
        chains.append(chain)
    except (ValueError, IndexError):
        continue

coords = np.array(coords, dtype=np.float32)
print(f"Extracted {len(coords)} CA atoms.")

# 3. Compute ESM embeddings
import esm
esm_model, esm_alphabet = esm.pretrained.load_model_and_alphabet("esm2_t33_650M_UR50D")
esm_batch_converter = esm_alphabet.get_batch_converter()
esm_model = esm_model.to(device).eval()

unique_chains = []
for c in chains:
    if c not in unique_chains:
        unique_chains.append(c)

chain_embeddings = []
for c in unique_chains:
    chain_res = [res_names[i] for i in range(len(res_names)) if chains[i] == c]
    chain_seq = "".join([THREE_TO_ONE.get(r, 'X') for r in chain_res])
    
    data = [(c, chain_seq)]
    _, _, chain_tokens = esm_batch_converter(data)
    chain_tokens = chain_tokens.to(device)
    chain_lens = (chain_tokens != esm_alphabet.padding_idx).sum(1)
    
    with torch.no_grad():
        chain_results = esm_model(chain_tokens, repr_layers=[33], return_contacts=False)
    
    chain_repr = chain_results["representations"][33]
    chain_emb = chain_repr[0, 1 : chain_lens[0] - 1].cpu()
    chain_embeddings.append(chain_emb)

esm_features = torch.cat(chain_embeddings, dim=0)
print(f"ESM features shape: {esm_features.shape}")

# 4. Construct input graph features
x_atom_onehot = res_to_one_hot(res_names)
x_atom = cat_features(x_atom_onehot, esm_features)
print(f"x_atom shape: {x_atom.shape}")

number_of_global_nodes = hparams.get('number_of_global_nodes', 8)
x_global_node = esm_features.mean(dim=0, keepdim=True).repeat(number_of_global_nodes, 1)

x_atom, x_global_node = pad_to_equal_dim(x_atom, x_global_node)

pos_atom = torch.from_numpy(coords)
centroid = pos_atom.mean(dim=0)
radius = torch.max(torch.norm(pos_atom - centroid, dim=1))

pos_global_node = sample_fibonacci_grid(
    centroid=centroid,
    radius=radius,
    num_points=number_of_global_nodes,
    random_rotations=False
)

# Scaling positions as model expects
scaling_factor = float(hparams.get('scaling_factor', 5.0))
pos_atom_scaled = pos_atom.to(device) / scaling_factor
pos_global_node_scaled = pos_global_node.to(device) / scaling_factor

# Build edges
edge_index_atom_atom = radius_graph(
    pos_atom.to(device),
    r=6.5,
    max_num_neighbors=10
)

# Bipartite edges between atoms and global nodes
num_atoms = len(pos_atom)
src_atom = torch.arange(num_atoms, device=device).repeat_interleave(number_of_global_nodes)
dst_global_node = torch.arange(number_of_global_nodes, device=device).repeat(num_atoms)

edge_index_atom_global_node = torch.stack([src_atom, dst_global_node], dim=0)
edge_index_global_node_atom = torch.stack([dst_global_node, src_atom], dim=0)

# Move tensors to device
x_atom = x_atom.to(device)
x_global_node = x_global_node.to(device)

# 5. Run inference
with torch.no_grad():
    res_x_atom, res_pos_global_node, res_x_global_node, confidence_out = model(
        x_atom,
        pos_atom_scaled,
        x_global_node,
        pos_global_node_scaled,
        edge_index_atom_atom,
        edge_index_atom_global_node,
        edge_index_global_node_atom
    )

res_pos_global_node = res_pos_global_node * scaling_factor
confidence = torch.sigmoid(confidence_out).cpu().numpy()
positions = res_pos_global_node.cpu().numpy()

print("Confidence scores:")
for idx, (p, c) in enumerate(zip(positions, confidence)):
    print(f"  Node {idx+1}: coords={p}, confidence={c[0]:.4f}")
