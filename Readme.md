# InfoGenix - Molecular Docking Platform

A comprehensive web-based molecular docking platform for drug discovery and protein-ligand interaction analysis. Built with FastAPI backend and React frontend.

## Features

- **Automated Structure Preparation**: Protein and ligand preparation with PDBFixer and AlphaFold fallback
- **Dual Docking Modes**: 
  - Auto Cavity Mode: Automatic binding site detection using Fpocket
  - Manual Mode: Expert grid configuration for custom docking
- **Molecular Docking**: AutoDock Vina integration with multi-cavity support
- **Interaction Analysis**: Hydrogen bonds, hydrophobic, ionic, and pi-stacking interactions
- **Results Visualization**: Interactive charts and detailed binding pose analysis

## Prerequisites

- **Python**: 3.8 or higher
- **Node.js**: 16 or higher
- **Conda**: Anaconda or Miniconda (recommended for chemical dependencies)
- **Git**: For cloning the repository

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Deepan-CodeBuster/info_genix.git
cd info_genix
```

### 2. Backend Setup

#### Create Conda Environment

```bash
# Create a new conda environment
conda create -n info_genix python=3.10
conda activate info_genix
```

#### Install Conda Dependencies

```bash
# Install chemistry and docking tools via conda
conda install -c conda-forge openbabel
conda install -c conda-forge pdbfixer
conda install -c conda-forge fpocket
conda install -c conda-forge vina
```

#### Install Python Requirements

```bash
cd backend
pip install -r requirements.txt
```

**requirements.txt:**
```txt
# FastAPI backend
fastapi
uvicorn
pydantic
python-multipart

# Chemistry & molecular modeling
rdkit
gemmi
pdbfixer

# Scientific computing
numpy
biopython

# HTTP requests for AlphaFold API
requests
```

#### Optional: Install P2RANK (For Consensus Cavity Detection)

P2RANK is optional but recommended for enhanced cavity detection accuracy.

**Linux/Mac:**
```bash
# Download P2RANK
wget https://github.com/rdk/p2rank/releases/download/2.4.2/p2rank_2.4.2.tar.gz

# Extract to /opt
sudo tar -xzf p2rank_2.4.2.tar.gz -C /opt/

# Verify installation
/opt/p2rank_2.4.2/prank --version

# Test prediction
/opt/p2rank_2.4.2/prank predict -f test.pdb -o output/
```

**Windows:**
```powershell
# Download from: https://github.com/rdk/p2rank/releases/download/2.4.2/p2rank_2.4.2.zip
# Extract to C:\Program Files\p2rank_2.4.2\
# Update backend/p2rank_integration.py path accordingly
```

> **Note**: The code uses absolute path `/opt/p2rank_2.4.2/prank` (not PATH). Update `backend/p2rank_integration.py` if installing to a different location.

### 3. Frontend Setup

```bash
cd ../frontend
npm install
```

## Running the Application

### Start Backend Server

```bash
# Activate conda environment
conda activate info_genix

# Navigate to backend directory
cd backend

# Start FastAPI server
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

The backend API will be available at: `http://localhost:8000`

API Documentation: `http://localhost:8000/docs`

### Start Frontend Development Server

Open a **new terminal** and run:

```bash
# Navigate to frontend directory
cd frontend

# Start Vite development server
npm run dev
```

The frontend will be available at: `http://localhost:5173`

## Usage

1. **Upload Files**: Upload protein (PDB/CIF) and ligand (SDF/MOL2/SMILES)
2. **Structure Preparation**: Configure protein chains and heteroatoms (auto ligand prep)
3. **Docking Mode**: Choose Auto Cavity or Manual grid input
4. **Cavity Detection** (Auto mode only): Select binding sites
5. **Molecular Docking**: Run AutoDock Vina simulation
6. **Results & Analysis**: View binding poses, interactions, and download results

## Project Structure

```
info_genix/
├── backend/
│   ├── app.py                      # FastAPI main application
│   ├── requirements.txt            # Python dependencies
│   ├── alphafold_integration.py    # AlphaFold API integration
│   ├── cavity_detection.py         # Fpocket cavity detection
│   ├── docking_runner.py           # AutoDock Vina wrapper
│   ├── interaction_analysis.py     # Protein-ligand interactions
│   ├── results.py                  # Results parsing
│   ├── Database/                   # Uploaded files storage
│   └── results/                    # Docking results storage
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Main application component
│   │   ├── components/
│   │   │   ├── layout/             # Header, Sidebar components
│   │   │   └── steps/              # Workflow step components
│   │   └── services/
│   │       └── api.js              # API service layer
│   ├── package.json
│   └── vite.config.js
├── proteins/                       # Sample protein/ligand files
└── Readme.md
```

## API Endpoints

### Session Management
- `POST /api/session/create` - Create new session

### File Upload
- `POST /api/upload/protein/{session_id}` - Upload protein
- `POST /api/upload/ligand/{session_id}` - Upload ligand
- `POST /api/upload/smiles/{session_id}` - Submit SMILES string

### Preparation
- `POST /api/prepare/protein/{session_id}` - Prepare protein structure
- `POST /api/prepare/ligand/{session_id}` - Prepare ligand

### Analysis
- `POST /api/analyze/heteroatoms/{session_id}` - Analyze heteroatoms

### Cavity Detection
- `POST /api/cavity/detect/{session_id}` - Detect binding cavities

### Docking
- `POST /api/grid/calc/{session_id}` - Calculate docking grid
- `POST /api/docking/run/{session_id}` - Run docking simulation

### Results
- `GET /api/results/{session_id}` - Get docking results
- `GET /api/results/interactions/{session_id}/{pose_num}` - Get interactions

## Configuration

### Backend Configuration

Edit `backend/app.py` to configure:
- **Port**: Default `8000`
- **CORS Origins**: Add allowed frontend URLs
- **Upload Size Limits**: Adjust `max_file_size`

### Frontend Configuration

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:8000
```

## Troubleshooting

### Backend Issues

**ImportError: rdkit module not found**
```bash
conda install -c conda-forge rdkit
```

**Vina not found**
```bash
conda install -c conda-forge vina
# Verify: vina --version
```

**P2RANK timeout**
- P2RANK is optional; fpocket will be used as fallback
- Increase timeout in `backend/p2rank_integration.py` if needed

### Frontend Issues

**CORS errors**
- Ensure backend CORS is configured for `http://localhost:5173`
- Check `backend/app.py` CORS middleware

**API connection refused**
- Verify backend is running on `http://localhost:8000`
- Check firewall settings

## Development

### Backend Development

```bash
# Run with auto-reload
uvicorn app:app --reload

# Run tests
pytest
```

### Frontend Development

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Technologies Used

### Backend
- **FastAPI**: Modern Python web framework
- **RDKit**: Chemistry toolkit
- **Biopython**: Biological computation
- **AutoDock Vina**: Molecular docking
- **Fpocket**: Cavity detection
- **PDBFixer**: Structure preparation

### Frontend
- **React 19**: UI framework
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **Recharts**: Data visualization
- **Axios**: HTTP client
- **Lucide React**: Icons

