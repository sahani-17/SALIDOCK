import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../services/api';

/**
 * Shared hook for docking workflow logic.
 * Used by Docking, Active, and Cavity pages.
 * Encapsulates: session init, protein/ligand upload, SMILES, AlphaFold, protein preparation.
 */
export function useDockingWorkflow({ isBlind = false } = {}) {
    // Session state
    const [sessionId, setSessionId] = useState(null);

    // Upload state
    const [inputMode, setInputMode] = useState('upload'); // upload, smiles, alphafold
    const [proteinFile, setProteinFile] = useState(null);
    const [ligandFile, setLigandFile] = useState(null);
    const [smilesInput, setSmilesInput] = useState('');
    const [smilesString, setSmilesString] = useState('');
    const [ligandName, setLigandName] = useState('ligand');
    const [ligandInputMethod, setLigandInputMethod] = useState('file'); // file, smiles
    const [uploadProgress, setUploadProgress] = useState({ protein: false, ligand: false });
    const [savedProteinFilename, setSavedProteinFilename] = useState(null);
    const [savedLigandFilename, setSavedLigandFilename] = useState(null);

    // AlphaFold state
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

    // Loading states
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    // Error state
    const [error, setError] = useState(null);

    // Initialize session on mount
    useEffect(() => {
        const initSession = async () => {
            try {
                const response = await api.createSession();
                setSessionId(response.session_id);
            } catch (_err) {
                setError('Failed to create session');
            }
        };
        initSession();
    }, []);

    // Handle protein file upload
    const handleProteinUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setProteinFile(file);
        setLoading(true);
        setLoadingMessage('Uploading protein...');

        try {
            const uploadResponse = await api.uploadFile(sessionId, file, 'protein');
            setUploadProgress(prev => ({ ...prev, protein: true }));

            // Save the filename from backend
            const savedFilename = uploadResponse.saved_as;
            setSavedProteinFilename(savedFilename);

            // Get chains using the saved filename from backend if not blind
            let chainsCount = 0;
            if (!isBlind) {
                const chainsData = await api.getChains(sessionId, savedFilename);
                setChains(chainsData.chains || []);
                chainsCount = chainsData.chains?.length || 0;
            } else {
                setChains([]);
            }

            // Get heteroatoms
            const heteroData = await api.getHeteroatoms(sessionId, savedFilename);
            setHeteroatoms(heteroData.all_heteroatoms || []);

            setShowProteinPrep(true);
            if (isBlind) {
                toast.success('Protein uploaded successfully');
            } else {
                toast.success(`Protein uploaded — ${chainsCount} chains found`);
            }
        } catch (err) {
            setError('Failed to upload protein: ' + (err.message || err));
            toast.error('Protein upload failed');
            console.error('Upload error:', err);
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    // Handle ligand file upload
    const handleLigandUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLigandFile(file);
        setLoading(true);
        setLoadingMessage('Uploading ligand...');

        try {
            const uploadResponse = await api.uploadFile(sessionId, file, 'ligand');
            const savedFilename = uploadResponse.saved_as;
            setSavedLigandFilename(savedFilename);
            setUploadProgress(prev => ({ ...prev, ligand: true }));

            // Auto-prepare ligand immediately after upload
            setLoadingMessage('Preparing ligand...');
            await api.prepareLigand(sessionId, {
                filename: savedFilename
            });
            toast.success('Ligand uploaded & prepared');
        } catch (err) {
            setError('Failed to upload/prepare ligand: ' + (err.message || err));
            toast.error('Ligand upload failed');
            console.error('Upload error:', err);
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    // Handle SMILES input
    const handleSmilesSubmit = async () => {
        const preferredSmiles = ligandInputMethod === 'smiles' ? smilesString : smilesInput;
        const fallbackSmiles = ligandInputMethod === 'smiles' ? smilesInput : smilesString;
        const smiles = (preferredSmiles || fallbackSmiles || '').trim();
        if (!smiles) return;

        setLoading(true);
        setLoadingMessage('Generating 3D structure from SMILES...');

        try {
            const response = await api.ligandFromSmiles(sessionId, smiles, ligandName);
            setSavedLigandFilename(response.filename);
            setUploadProgress(prev => ({ ...prev, ligand: true }));
            toast.success('Ligand generated from SMILES');
        } catch (_err) {
            setError('Failed to generate ligand from SMILES');
            toast.error('SMILES conversion failed');
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    // Handle AlphaFold sequence prediction
    const handleSequencePrediction = async () => {
        if (!fastaSequence.trim()) return;

        setLoading(true);
        setLoadingMessage('Predicting structure from sequence...');

        try {
            const response = await api.predictFromSequence(sessionId, fastaSequence);
            setSavedProteinFilename(response.filename);
            setUploadProgress(prev => ({ ...prev, protein: true }));

            // Get chains if not blind
            if (!isBlind) {
                const chainsData = await api.getChains(sessionId, response.filename);
                setChains(chainsData.chains || []);
            } else {
                setChains([]);
            }

            // Get heteroatoms
            const heteroData = await api.getHeteroatoms(sessionId, response.filename);
            setHeteroatoms(heteroData.all_heteroatoms || []);

            setShowProteinPrep(true);
            toast.success('Structure predicted from sequence');
        } catch (_err) {
            setError('Failed to predict structure from sequence');
            toast.error('Sequence prediction failed');
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    // Handle UniProt fetch
    const handleUniProtFetch = async () => {
        if (!uniprotId.trim()) return;

        setLoading(true);
        setLoadingMessage('Fetching structure from UniProt...');

        try {
            // First get UniProt info
            const info = await api.getUniProtInfo(uniprotId);
            setUniprotInfo(info.protein_info);

            // Then fetch the structure
            const response = await api.predictFromUniProt(sessionId, uniprotId);
            setSavedProteinFilename(response.filename);
            setUploadProgress(prev => ({ ...prev, protein: true }));

            // Get chains if not blind
            if (!isBlind) {
                const chainsData = await api.getChains(sessionId, response.filename);
                setChains(chainsData.chains || []);
            } else {
                setChains([]);
            }

            // Get heteroatoms
            const heteroData = await api.getHeteroatoms(sessionId, response.filename);
            setHeteroatoms(heteroData.all_heteroatoms || []);

            setShowProteinPrep(true);
            toast.success('Structure fetched from UniProt');
        } catch (_err) {
            setError('Failed to fetch structure from UniProt');
            toast.error('UniProt fetch failed');
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    // Handle protein preparation
    const handleProteinPreparation = async () => {
        setLoading(true);
        setLoadingMessage('Preparing protein...');

        try {
            await api.prepareProtein(sessionId, {
                filename: savedProteinFilename,
                chains_to_keep: selectedChains,
                heteroatoms_to_keep: selectedHeteroatoms,
            });
            setProteinPrepared(true);
            toast.success('Protein prepared successfully');
        } catch (_err) {
            setError('Failed to prepare protein');
            toast.error('Protein preparation failed');
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    };

    return {
        // Session
        sessionId,

        // Input mode
        inputMode, setInputMode,

        // Protein upload
        proteinFile, handleProteinUpload,

        // Ligand upload
        ligandFile, handleLigandUpload,

        // SMILES
        smilesInput, setSmilesInput,
        smilesString, setSmilesString,
        ligandName, setLigandName,
        ligandInputMethod, setLigandInputMethod,
        handleSmilesSubmit,

        // AlphaFold
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

        // Upload progress
        uploadProgress,
        savedProteinFilename,
        savedLigandFilename,

        // Loading & error
        loading, setLoading,
        loadingMessage, setLoadingMessage,
        error, setError,
    };
}
