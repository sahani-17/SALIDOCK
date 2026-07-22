export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Centralized fetch wrapper. Unwraps backend error payloads (`detail`, `message`,
 * `error`) so callers receive the *real* reason instead of a generic string.
 * Throws an Error whose `.message` is the backend-provided message.
 */
async function request(path, { method = 'GET', body, fallback = 'Request failed' } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { method, body });
  } catch (networkErr) {
    throw new Error(`Network error: ${networkErr.message || 'could not reach server'}`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const ct = response.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const payload = await response.json();
        detail =
          payload?.detail ||
          payload?.message ||
          payload?.error ||
          (typeof payload === 'string' ? payload : '');
        if (!detail && Array.isArray(payload?.detail)) {
          detail = payload.detail.map((d) => d?.msg || JSON.stringify(d)).join('; ');
        }
      } else {
        detail = (await response.text()).slice(0, 300);
      }
    } catch {
      /* ignore parse errors */
    }
    const msg = detail ? `${fallback}: ${detail}` : `${fallback} (${response.status})`;
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }

  return response;
}

async function json(path, opts) {
  const r = await request(path, opts);
  return r.json();
}

export const api = {
  // Session Management
  createSession: () => json('/api/session/create', { method: 'POST', fallback: 'Failed to create session' }),

  getStatus: (sessionId) => json(`/api/status/${sessionId}`, { fallback: 'Failed to get status' }),

  // File Upload
  uploadFile: (sessionId, file, filetype) => {
    const formData = new FormData();
    formData.append('file', file);
    return json(`/api/upload/${sessionId}/${filetype}`, {
      method: 'POST',
      body: formData,
      fallback: 'Failed to upload file',
    });
  },

  // Protein Analysis
  getChains: (sessionId, filename) =>
    json(`/api/chains/${sessionId}/${filename}`, { fallback: 'Failed to get chains' }),

  getHeteroatoms: (sessionId, fileName) =>
    json(`/api/analyze/heteroatoms/${sessionId}?file_name=${encodeURIComponent(fileName)}`, {
      fallback: 'Failed to get heteroatoms',
    }),

  // Preparation
  prepareProtein: (sessionId, data) => {
    const params = new URLSearchParams({
      file_name: data.filename,
      keep_hetero_residues: data.heteroatoms_to_keep?.join(',') || '',
      keep_chains: data.chains_to_keep?.join(',') || '',
      fix_structure: data.fix_structure || false,
      validate_structure: data.validate_structure !== false,
    });
    return json(`/api/prepare/protein/${sessionId}?${params}`, {
      method: 'POST',
      fallback: 'Failed to prepare protein',
    });
  },

  prepareLigand: (sessionId, data) => {
    const params = new URLSearchParams({ file_name: data.filename });
    return json(`/api/prepare/ligand/${sessionId}?${params}`, {
      method: 'POST',
      fallback: 'Failed to prepare ligand',
    });
  },

  // SMILES to 3D
  ligandFromSmiles: (sessionId, smiles, ligandName = 'ligand') => {
    const params = new URLSearchParams({
      smiles,
      ligand_name: ligandName,
      optimize: 'true',
    });
    return json(`/api/ligand/from-smiles/${sessionId}?${params}`, {
      method: 'POST',
      fallback: 'Failed to generate ligand from SMILES',
    });
  },

  // Cavity Detection
  detectCavities: (sessionId) =>
    json(`/api/cavities/detect/${sessionId}`, { method: 'POST', fallback: 'Failed to detect cavities' }),

  // Protein Center
  getProteinCenter: (sessionId) =>
    json(`/api/protein/center/${sessionId}`, { method: 'POST', fallback: 'Failed to get protein center' }),

  // Grid Calculation
  calculateGrid: (sessionId, data) => {
    const params = new URLSearchParams({ mode: data.mode || 'manual' });
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
    return json(`/api/grid/calc/${sessionId}?${params}`, {
      method: 'POST',
      fallback: 'Failed to calculate grid',
    });
  },

  // Docking
  runDocking: (sessionId, data) => {
    const params = new URLSearchParams();
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
      params.append('docking_mode', 'cavity');
    }
    return json(`/api/dock/run/${sessionId}?${params}`, {
      method: 'POST',
      fallback: 'Failed to run docking',
    });
  },

  // Results
  getResults: (sessionId) =>
    json(`/api/results/list/${sessionId}`, { fallback: 'Failed to get results' }),

  downloadComplex: async (sessionId, poseNumber) => {
    const r = await request(`/api/results/download/complex/${sessionId}/${poseNumber}`, {
      fallback: 'Failed to download complex',
    });
    return r.blob();
  },

  // AlphaFold Integration
  predictFromSequence: (sessionId, fastaSequence) => {
    const params = new URLSearchParams({ fasta_sequence: fastaSequence });
    return json(`/api/alphafold/sequence/${sessionId}?${params}`, {
      method: 'POST',
      fallback: 'Failed to predict structure from sequence',
    });
  },

  getUniProtInfo: (uniprotId) =>
    json(`/api/alphafold/uniprot/info/${uniprotId}`, { fallback: 'Failed to get UniProt info' }),

  predictFromUniProt: (sessionId, uniprotId) => {
    const params = new URLSearchParams({ uniprot_id: uniprotId });
    return json(`/api/alphafold/uniprot/${sessionId}?${params}`, {
      method: 'POST',
      fallback: 'Failed to fetch structure from UniProt',
    });
  },

  // Batch Docking API calls
  uploadBatchLigands: (sessionId, files) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    return json(`/api/batch/upload/ligands/${sessionId}`, {
      method: 'POST',
      body: formData,
      fallback: 'Failed to upload batch ligands',
    });
  },

  uploadBatchSmiles: (sessionId, ligands) => {
    return json(`/api/batch/smiles/ligands/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ligands }),
      fallback: 'Failed to generate ligands from SMILES list',
    });
  },

  prepareBatchLigands: (sessionId) =>
    json(`/api/batch/prepare/ligands/${sessionId}`, {
      method: 'POST',
      fallback: 'Failed to start batch ligand preparation',
    }),

  getBatchPrepareStatus: (sessionId) =>
    json(`/api/batch/prepare/status/${sessionId}`, {
      fallback: 'Failed to get batch preparation status',
    }),

  runBatchDocking: (sessionId, data) => {
    const params = new URLSearchParams({ docking_mode: data.dockingMode || 'cavity' });
    if (data.dockingMode === 'cavity') {
      params.append('cavity_id', data.cavityId || 1);
    } else if (data.dockingMode === 'manual') {
      params.append('center_x', data.center_x);
      params.append('center_y', data.center_y);
      params.append('center_z', data.center_z);
      params.append('size_x', data.size_x);
      params.append('size_y', data.size_y);
      params.append('size_z', data.size_z);
    }
    return json(`/api/batch/dock/run/${sessionId}?${params}`, {
      method: 'POST',
      fallback: 'Failed to run batch docking',
    });
  },

  getBatchDockStatus: (sessionId) =>
    json(`/api/batch/status/${sessionId}`, {
      fallback: 'Failed to get batch docking status',
    }),

  getBatchResults: (sessionId) =>
    json(`/api/batch/results/list/${sessionId}`, {
      fallback: 'Failed to get batch results',
    }),

  downloadBatchComplex: async (sessionId, ligandIdx, poseNumber) => {
    const r = await request(`/api/batch/results/download/complex/${sessionId}/${ligandIdx}/${poseNumber}`, {
      fallback: 'Failed to download batch complex structure',
    });
    return r.blob();
  },

  downloadBatchZipUrl: (sessionId) => `${API_BASE_URL}/api/batch/results/download/zip/${sessionId}`,
};
