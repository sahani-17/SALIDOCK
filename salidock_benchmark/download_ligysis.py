import os
import urllib.request
import pickle
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

def download_file(url, output_path):
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    with urllib.request.urlopen(req) as response, open(output_path, 'wb') as out_file:
        out_file.write(response.read())

def download_pdb(pdb_id, output_dir):
    pdb_path = output_dir / f"{pdb_id}.pdb"
    if pdb_path.exists() and pdb_path.stat().st_size > 1000:
        return pdb_id, True
        
    url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req) as response:
            content = response.read()
            if len(content) > 1000:
                with open(pdb_path, 'wb') as f:
                    f.write(content)
                return pdb_id, True
            else:
                return pdb_id, False
    except Exception:
        return pdb_id, False

def main():
    print("=" * 80)
    print("            LIGYSIS-2024 BENCHMARK PARALLEL DATASET DOWNLOADER             ")
    print("=" * 80)
    
    benchmark_dir = Path(__file__).resolve().parent
    opt_dir = benchmark_dir / "optuna"
    opt_dir.mkdir(exist_ok=True)
    
    pdb_dir = benchmark_dir / "pdb"
    pdb_dir.mkdir(exist_ok=True)
    
    # URLs for metadata
    chains_url = "https://zenodo.org/api/records/13121414/files/LIGYSIS_3448_chains.pkl/content"
    centroids_url = "https://zenodo.org/api/records/13121414/files/PDB_orig_centroids_ALL_CLUST.pkl/content"
    
    chains_path = opt_dir / "LIGYSIS_3448_chains.pkl"
    centroids_path = opt_dir / "PDB_orig_centroids_ALL_CLUST.pkl"
    
    # 1. Download metadata files
    if not chains_path.exists():
        print("Downloading LIGYSIS chains list from Zenodo...")
        downloadfile = download_file(chains_url, chains_path)
    if not centroids_path.exists():
        print("Downloading LIGYSIS true centroids dictionary from Zenodo...")
        downloadfile = download_file(centroids_url, centroids_path)
        
    # Load chains
    with open(chains_path, 'rb') as f:
        chains = pickle.load(f)
        
    pdb_ids = sorted(list(set(c.split('_')[0] for c in chains)))
    print(f"Parsed {len(chains)} target chains, mapping to {len(pdb_ids)} unique PDB structures.")
    
    # 2. Download PDB structures in parallel
    print(f"Downloading PDB files to {pdb_dir} in parallel (20 threads)...")
    success_count = 0
    fail_count = 0
    failed_ids = []
    
    # Use thread pool to download in parallel
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(download_pdb, pdb_id, pdb_dir): pdb_id for pdb_id in pdb_ids}
        
        for i, future in enumerate(as_completed(futures), 1):
            pdb_id, success = future.result()
            if success:
                success_count += 1
            else:
                fail_count += 1
                failed_ids.append(pdb_id)
                
            if i % 100 == 0 or i == len(pdb_ids):
                print(f"Progress: {i}/{len(pdb_ids)} files checked. Success: {success_count}, Failed/Missing: {fail_count}")
                
    print("\n" + "=" * 60)
    print("         LIGYSIS DATASET DOWNLOAD COMPLETED         ")
    print("-" * 60)
    print(f"Total Unique PDB Files downloaded successfully: {success_count}")
    print(f"Failed downloads: {fail_count}")
    if failed_ids:
        print(f"Failed PDB IDs: {', '.join(failed_ids)}")
    print("=" * 60)

if __name__ == '__main__':
    main()
