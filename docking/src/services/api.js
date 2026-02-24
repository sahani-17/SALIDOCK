const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = {
  // Session Management
  createSession: async () => {
    const response = await fetch(`${API_BASE_URL}/api/session/create`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to create session');
    return response.json();
  },

  getStatus: async (sessionId) => {
    const response = await fetch(`${API_BASE_URL}/api/status/${sessionId}`);
    if (!response.ok) throw new Error('Failed to get status');
    return response.json();
  },

  // File Upload
  uploadFile: async (sessionId, file, filetype) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/upload/${sessionId}/${filetype}`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('Failed to upload file');
    return response.json();
  },

  // Protein Analysis
  getChains: async (sessionId, filename) => {
    const response = await fetch(`${API_BASE_URL}/api/chains/${sessionId}/${filename}`);
    if (!response.ok) throw new Error('Failed to get chains');
    return response.json();
  },

  getHeteroatoms: async (sessionId, fileName) => {
    const response = await fetch(`${API_BASE_URL}/api/analyze/heteroatoms/${sessionId}?file_name=${encodeURIComponent(fileName)}`);
    if (!response.ok) throw new Error('Failed to get heteroatoms');
    return response.json();
  },

  // Preparation
  prepareProtein: async (sessionId, data) => {
    const params = new URLSearchParams({
      file_name: data.filename,
      keep_hetero_residues: data.heteroatoms_to_keep?.join(',') || '',
      keep_chains: data.chains_to_keep?.join(',') || '',
      fix_structure: data.fix_structure || false,
      validate_structure: data.validate_structure !== false
    });

    const response = await fetch(`${API_BASE_URL}/api/prepare/protein/${sessionId}?${params}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to prepare protein');
    return response.json();
  },

  prepareLigand: async (sessionId, data) => {
    const params = new URLSearchParams({
      file_name: data.filename
    });

    const response = await fetch(`${API_BASE_URL}/api/prepare/ligand/${sessionId}?${params}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to prepare ligand');
    return response.json();
  },

  // SMILES to 3D
  ligandFromSmiles: async (sessionId, smiles, ligandName = 'ligand') => {
    const params = new URLSearchParams({
      smiles: smiles,
      ligand_name: ligandName,
      optimize: 'true'
    });
    const response = await fetch(`${API_BASE_URL}/api/ligand/from-smiles/${sessionId}?${params}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to generate ligand from SMILES');
    return response.json();
  },

  // Cavity Detection
  detectCavities: async (sessionId, numCavities) => {
    const response = await fetch(`${API_BASE_URL}/api/cavities/detect/${sessionId}?top_n=${numCavities}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to detect cavities');
    return response.json();
  },

  // Protein Center
  getProteinCenter: async (sessionId) => {
    const response = await fetch(`${API_BASE_URL}/api/protein/center/${sessionId}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to get protein center');
    return response.json();
  },

  // Grid Calculation
  calculateGrid: async (sessionId, data) => {
    const params = new URLSearchParams({
      mode: data.mode || 'manual',
    });

    if (data.mode === 'cavity' && data.cavity_id !== undefined) {
      params.append('cavity_id', data.cavity_id);
    } else if (data.mode === 'manual') {
      params.append('center_x', data.center_x);
      params.append('center_y', data.center_y);
      params.append('center_z', data.center_z);
      params.append('size_x', data.size_x);
      params.append('size_y', data.size_y);
      params.append('size_z', data.size_z);
    }

    const response = await fetch(`${API_BASE_URL}/api/grid/calc/${sessionId}?${params}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to calculate grid');
    return response.json();
  },

  // Docking
  runDocking: async (sessionId, data) => {
    const params = new URLSearchParams();

    // Determine docking mode and set parameters
    if (data.cavity_indices && data.cavity_indices.length > 0) {
      params.append('docking_mode', 'cavity');
      params.append('cavity_ids', data.cavity_indices.join(','));
    } else if (data.center_x !== undefined) {
      params.append('docking_mode', 'manual');
      params.append('center_x', data.center_x);
      params.append('center_y', data.center_y);
      params.append('center_z', data.center_z);
      params.append('size_x', data.size_x);
      params.append('size_y', data.size_y);
      params.append('size_z', data.size_z);
    } else {
      // Default to cavity mode with all cavities
      params.append('docking_mode', 'cavity');
    }

    const response = await fetch(`${API_BASE_URL}/api/dock/run/${sessionId}?${params}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to run docking');
    return response.json();
  },

  // Results
  getResults: async (sessionId) => {
    const response = await fetch(`${API_BASE_URL}/api/results/list/${sessionId}`);
    if (!response.ok) throw new Error('Failed to get results');
    return response.json();
  },

  downloadComplex: async (sessionId, poseNumber) => {
    const response = await fetch(`${API_BASE_URL}/api/results/download/complex/${sessionId}/${poseNumber}`);
    if (!response.ok) throw new Error('Failed to download complex');
    return response.blob();
  },

  // AlphaFold Integration
  predictFromSequence: async (sessionId, fastaSequence) => {
    const params = new URLSearchParams({
      fasta_sequence: fastaSequence
    });
    const response = await fetch(`${API_BASE_URL}/api/alphafold/sequence/${sessionId}?${params}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to predict structure from sequence');
    return response.json();
  },

  getUniProtInfo: async (uniprotId) => {
    const response = await fetch(`${API_BASE_URL}/api/alphafold/uniprot/info/${uniprotId}`);
    if (!response.ok) throw new Error('Failed to get UniProt info');
    return response.json();
  },

  predictFromUniProt: async (sessionId, uniprotId) => {
    const params = new URLSearchParams({
      uniprot_id: uniprotId
    });
    const response = await fetch(`${API_BASE_URL}/api/alphafold/uniprot/${sessionId}?${params}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to fetch structure from UniProt');
    return response.json();
  },
};
