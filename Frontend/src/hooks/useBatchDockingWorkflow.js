import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../services/api';

/**
 * Custom state hook for orchestrating the separate Batch Docking workflow.
 * Manages protein uploads/fetching/prep, multi-ligand uploads/generation/prep,
 * and polling.
 */
export function useBatchDockingWorkflow() {
    // Session state
    const [sessionId, setSessionId] = useState(null);

    // Input configuration
    const [proteinInputMethod, setProteinInputMethod] = useState('file'); // file, fasta, uniprot
    const [ligandInputMethod, setLigandInputMethod] = useState('file'); // file, smiles

    // Files state
    const [proteinFile, setProteinFile] = useState(null);
    const [ligandFiles, setLigandFiles] = useState([]);
    const [smilesInput, setSmilesInput] = useState('');
    
    const [uploadProgress, setUploadProgress] = useState({ protein: false, ligands: false });
    const [savedProteinFilename, setSavedProteinFilename] = useState(null);
    const [batchLigands, setBatchLigands] = useState([]); // List of batch ligands metadata from backend

    // AlphaFold integration state
    const [alphafoldMode, setAlphafoldMode] = useState('sequence'); // sequence, uniprot
    const [fastaSequence, setFastaSequence] = useState('');
    const [uniprotId, setUniprotId] = useState('');
    const [uniprotInfo, setUniprotInfo] = useState(null);

    // Protein preparation state
    const [chains, setChains] = useState([]);
    const [selectedChains, setSelectedChains] = useState([]);
    const [heteroatoms, setHeteroatoms] = useState([]);
    const [selectedHeteroatoms, setSelectedHeteroatoms] = useState([]);
    const [showProteinPrep, setShowProteinPrep] = useState(false);
    const [proteinPrepared, setProteinPrepared] = useState(false);

    // Batch ligand preparation state
    const [ligandPrepStatus, setLigandPrepStatus] = useState(null);

    // General loading & error indicators
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState(null);

    // Initialize session on mount
    useEffect(() => {
        const initSession = async () => {
            try {
                const response = await api.createSession();
                setSessionId(response.session_id);
            } catch (err) {
                setError(err?.message || 'Failed to create session');
            }
        };
        initSession();
    }, []);

    // Handle protein receptor upload
    const handleProteinUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setProteinFile(file);
        setLoading(true);
        setLoadingMessage('Uploading protein receptor...');

        try {
            const uploadResponse = await api.uploadFile(sessionId, file, 'protein');
            setUploadProgress(prev => ({ ...prev, protein: true }));
            const savedFilename = uploadResponse.saved_as;
            setSavedProteinFilename(savedFilename);

            // Fetch protein chains
            const chainsData = await api.getChains(sessionId, savedFilename);
            setChains(chainsData.chains || []);

            // Fetch heteroatoms to keep
            const heteroData = await api.getHeteroatoms(sessionId, savedFilename);
            setHeteroatoms(heteroData.all_heteroatoms || []);

            setShowProteinPrep(true);
            toast.success(`Protein receptor uploaded — ${chainsData.chains?.length || 0} chain(s) found`);
        } catch (err) {
            setError('Failed to upload protein receptor: ' + (err.message || err));
            toast.error('Receptor upload failed');
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    // Handle protein preparation
    const handleProteinPreparation = async () => {
        setLoading(true);
        setLoadingMessage('Preparing protein structure...');

        try {
            await api.prepareProtein(sessionId, {
                filename: savedProteinFilename,
                chains_to_keep: selectedChains,
                heteroatoms_to_keep: selectedHeteroatoms,
            });
            setProteinPrepared(true);
            toast.success('Protein prepared successfully');
        } catch (err) {
            setError(err?.message || 'Failed to prepare protein');
            toast.error('Protein preparation failed');
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    // Handle structure prediction from sequence (ESMFold fallback)
    const handleSequencePrediction = async () => {
        if (!fastaSequence.trim()) return;

        setLoading(true);
        setLoadingMessage('Predicting structure from sequence via ESMFold...');

        try {
            const response = await api.predictFromSequence(sessionId, fastaSequence);
            setSavedProteinFilename(response.filename);
            setUploadProgress(prev => ({ ...prev, protein: true }));

            const chainsData = await api.getChains(sessionId, response.filename);
            setChains(chainsData.chains || []);

            const heteroData = await api.getHeteroatoms(sessionId, response.filename);
            setHeteroatoms(heteroData.all_heteroatoms || []);

            setShowProteinPrep(true);
            toast.success('Structure predicted from sequence');
        } catch (err) {
            setError(err?.message || 'Failed to predict structure from sequence');
            toast.error('Sequence structure prediction failed');
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    // Handle UniProt structure fetching
    const handleUniProtFetch = async () => {
        if (!uniprotId.trim()) return;

        setLoading(true);
        setLoadingMessage('Fetching structure from UniProt database...');

        try {
            const info = await api.getUniProtInfo(uniprotId);
            setUniprotInfo(info.protein_info);

            const response = await api.predictFromUniProt(sessionId, uniprotId);
            setSavedProteinFilename(response.filename);
            setUploadProgress(prev => ({ ...prev, protein: true }));

            const chainsData = await api.getChains(sessionId, response.filename);
            setChains(chainsData.chains || []);

            const heteroData = await api.getHeteroatoms(sessionId, response.filename);
            setHeteroatoms(heteroData.all_heteroatoms || []);

            setShowProteinPrep(true);
            toast.success('Structure fetched successfully from UniProt');
        } catch (err) {
            setError(err?.message || 'Failed to fetch structure from UniProt');
            toast.error('UniProt structure fetching failed');
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    // Handle multiple ligand files upload (ZIP / Multi-mol SDF / Multiple single SDFs)
    const handleBatchLigandsUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setLigandFiles(files);
        setLoading(true);
        setLoadingMessage('Uploading batch ligands...');

        try {
            const response = await api.uploadBatchLigands(sessionId, files);
            setBatchLigands(response.ligands || []);
            setUploadProgress(prev => ({ ...prev, ligands: true }));
            toast.success(`Successfully uploaded and parsed ${response.total_ligands} ligand(s)`);
        } catch (err) {
            setError('Failed to upload batch ligands: ' + (err.message || err));
            toast.error('Batch upload failed');
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    // Handle parsing of multiple SMILES strings in a list
    const handleBatchSmilesSubmit = async () => {
        if (!smilesInput.trim()) return;

        setLoading(true);
        setLoadingMessage('Generating 3D structures from SMILES strings...');

        const lines = smilesInput.split('\n');
        const parsedLigands = [];
        lines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            
            // Find the first separator: tab, comma, semicolon, or space
            let delimiter = null;
            if (trimmed.includes('\t')) {
                delimiter = '\t';
            } else if (trimmed.includes(',')) {
                delimiter = ',';
            } else if (trimmed.includes(';')) {
                delimiter = ';';
            } else {
                const spaceIdx = trimmed.indexOf(' ');
                if (spaceIdx > 0) {
                    delimiter = ' ';
                }
            }

            let smiles = trimmed;
            let name = `smiles_${idx + 1}`;

            if (delimiter) {
                const sepIdx = trimmed.indexOf(delimiter);
                smiles = trimmed.substring(0, sepIdx).trim();
                name = trimmed.substring(sepIdx + 1).trim() || `smiles_${idx + 1}`;
            }

            parsedLigands.push({ smiles, name });
        });

        if (parsedLigands.length === 0) {
            toast.error('No valid SMILES strings entered');
            setLoading(false);
            return;
        }

        try {
            const response = await api.uploadBatchSmiles(sessionId, parsedLigands);
            setBatchLigands(response.ligands || []);
            setUploadProgress(prev => ({ ...prev, ligands: true }));
            toast.success(`Successfully generated ${response.total_ligands} ligand(s)`);
        } catch (err) {
            setError(err?.message || 'Failed to convert SMILES list');
            toast.error('SMILES list conversion failed');
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    // Run optimization & PDBQT formatting for all ligands
    const handlePrepareBatchLigands = async () => {
        setLoading(true);
        setLoadingMessage('Starting batch ligand preparation (RDKit MMFF94)...');
        try {
            await api.prepareBatchLigands(sessionId);
            pollPrepStatus();
        } catch (err) {
            setError(err?.message || 'Failed to prepare batch ligands');
            toast.error('Preparation failed to start');
            setLoading(false);
        }
    };

    // Poll the preparation background task
    const pollPrepStatus = () => {
        const interval = setInterval(async () => {
            try {
                const status = await api.getBatchPrepareStatus(sessionId);
                setLigandPrepStatus(status);
                
                if (status.status === 'completed' || status.status === 'completed_with_errors') {
                    clearInterval(interval);
                    setLoading(false);
                    setLoadingMessage('');
                    if (status.status === 'completed') {
                        toast.success('All ligands optimized and prepared successfully!');
                    } else {
                        toast.warning(`Ligands prepared with some failures (${status.failed} failed)`);
                    }
                } else {
                    setLoadingMessage(`Optimizing ligands: ${status.completed} / ${status.total} done...`);
                }
            } catch (err) {
                console.error('Failed to poll preparation status:', err);
            }
        }, 1500);
    };

    return {
        sessionId,
        
        // Input Config
        proteinInputMethod, setProteinInputMethod,
        ligandInputMethod, setLigandInputMethod,

        // Protein Upload/Prediction
        proteinFile, handleProteinUpload,
        savedProteinFilename,
        alphafoldMode, setAlphafoldMode,
        fastaSequence, setFastaSequence,
        uniprotId, setUniprotId,
        uniprotInfo,
        handleSequencePrediction,
        handleUniProtFetch,

        // Protein preparation
        chains, selectedChains, setSelectedChains,
        heteroatoms, selectedHeteroatoms, setSelectedHeteroatoms,
        showProteinPrep,
        proteinPrepared,
        handleProteinPreparation,

        // Batch Ligands Upload/Generation/Prep
        ligandFiles, handleBatchLigandsUpload,
        smilesInput, setSmilesInput,
        batchLigands,
        handleBatchSmilesSubmit,
        handlePrepareBatchLigands,
        ligandPrepStatus,

        // Loading & errors
        uploadProgress,
        loading, setLoading,
        loadingMessage, setLoadingMessage,
        error, setError,
    };
}
