# Molecular Docking Frontend

A clean, clinical-design frontend for molecular docking workflows.

## Features

- **Upload Input Files**: Multiple input modes (Upload Files, SMILES, Generate, AlphaFold)
- **Protein & Ligand Preparation**: Interactive chain and heteroatom selection
- **Docking Modes**: Auto cavity detection or manual active-site docking
- **Results & Analysis**: Comprehensive results display with downloadable poses

## Pages

### `/` - Landing Page
Beautiful animated landing page with DNA helix visualization

### `/docking` - Main Docking Workflow
Complete workflow from file upload to docking execution:
- Upload protein and ligand files
- Select chains and heteroatoms to keep
- Choose between auto or manual docking mode
- Configure cavity detection or grid parameters
- Run docking simulation

### `/results` - Results Display
Comprehensive results analysis:
- Best binding pose summary
- All binding poses table with sortable columns
- Download individual poses or top 5 complexes
- Summary statistics

## Design

Clean, clinical light mode aesthetic:
- Primary background: `#F8FAFC` (off-white)
- White cards with subtle borders
- Blue accent colors
- Clear hierarchy and spacing

## Tech Stack

- **React** 19.2.0
- **React Router** 7.13.0
- **Tailwind CSS** 4.1.18
- **Lucide React** (icons)
- **Vite** (build tool)

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
# Create .env file
VITE_API_BASE_URL=http://localhost:8000
```

3. Start development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## API Integration

The frontend connects to the backend API at `http://localhost:8000` by default. Make sure the backend is running before using the frontend.

## Project Structure

```
src/
├── pages/
│   ├── Landing.jsx      # Landing page with DNA animation
│   ├── Docking.jsx      # Main docking workflow
│   └── Results.jsx      # Results display
├── services/
│   └── api.js          # API service layer
├── App.jsx             # Main app component with routing
├── main.jsx            # Entry point
└── index.css           # Global styles
```

## Usage Flow

1. **Start**: Navigate to `/docking`
2. **Upload**: Select protein and ligand files
3. **Prepare**: Choose chains and heteroatoms
4. **Configure**: Select docking mode (auto/manual)
5. **Run**: Execute docking simulation
6. **Analyze**: View results at `/results`

## License

MIT
