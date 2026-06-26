import React, { useState, useEffect, useRef } from 'react';
import { Download } from 'lucide-react';

const Interaction2DViewer = ({ sessionId, poseNumber, totalPoses }) => {
  const [svgContent, setSvgContent]         = useState("");        // SVG string for primary pose
  const [compareSvg, setCompareSvg]         = useState("");        // SVG string for compare pose
  const [loading, setLoading]               = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError]                   = useState(null);
  const [isCompareMode, setIsCompareMode]   = useState(false);     // toggle compare panel
  const [comparePose, setComparePose]       = useState(null);      // which pose to compare against

  // Pan + zoom state for PRIMARY viewer
  const [scale, setScale]   = useState(1);
  const [panX, setPanX]     = useState(0);
  const [panY, setPanY]     = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart]   = useState({ x: 0, y: 0 });

  // Pan + zoom state for COMPARE viewer (separate — each panel independent)
  const [scaleB, setScaleB] = useState(1);
  const [panXB, setPanXB]   = useState(0);
  const [panYB, setPanYB]   = useState(0);
  const [isDraggingB, setIsDraggingB] = useState(false);
  const [dragStartB, setDragStartB]   = useState({ x: 0, y: 0 });

  const containerRef  = useRef(null);
  const containerBRef = useRef(null);

  // Fetch primary SVG whenever poseNumber changes
  useEffect(() => {
    if (!sessionId || !poseNumber) return;
    setLoading(true);
    setError(null);
    // Reset pan/zoom when pose changes
    setScale(1); setPanX(0); setPanY(0);

    fetch(`https://salidock-backend.jollydune-d4ca90c7.eastus.azurecontainerapps.io/api/interactions/2d/${sessionId}/${poseNumber}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(svg => setSvgContent(svg))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId, poseNumber]);

  // Fetch compare SVG whenever comparePose changes and compare mode is on
  useEffect(() => {
    if (!isCompareMode || !comparePose || !sessionId) return;
    setCompareLoading(true);
    setScaleB(1); setPanXB(0); setPanYB(0);

    fetch(`http://localhost:8000/api/interactions/2d/${sessionId}/${comparePose}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(svg => setCompareSvg(svg))
      .catch(err => console.error("Compare fetch failed:", err))
      .finally(() => setCompareLoading(false));
  }, [sessionId, comparePose, isCompareMode]);


  // ── PRIMARY panel handlers ──────────────────────────────────────────────────

  const handleMouseDown = (e) => {
    // Only trigger on left mouse button
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPanX(e.clientX - dragStart.x);
    setPanY(e.clientY - dragStart.y);
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta  = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(scale * delta, 0.3), 5);
    setScale(newScale);
  };

  const resetView = () => {
    setScale(1); setPanX(0); setPanY(0);
  };


  // ── COMPARE panel handlers (identical, uses B state) ──────────────────────

  const handleMouseDownB = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDraggingB(true);
    setDragStartB({ x: e.clientX - panXB, y: e.clientY - panYB });
  };
  const handleMouseMoveB = (e) => {
    if (!isDraggingB) return;
    setPanXB(e.clientX - dragStartB.x);
    setPanYB(e.clientY - dragStartB.y);
  };
  const handleMouseUpB   = () => setIsDraggingB(false);
  const handleMouseLeaveB= () => setIsDraggingB(false);
  const handleWheelB = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScaleB(Math.min(Math.max(scaleB * delta, 0.3), 5));
  };
  const resetViewB = () => {
    setScaleB(1); setPanXB(0); setPanYB(0);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  });

  useEffect(() => {
    const el = containerBRef.current;
    if (!el || !isCompareMode) return;
    el.addEventListener("wheel", handleWheelB, { passive: false });
    return () => el.removeEventListener("wheel", handleWheelB);
  });

  // Extract residue labels from an SVG string using regex
  // Residue labels look like: GLU56, PHE99, HIS104, VAL28 etc.
  // They appear as text content in the SVG between <text> tags
  const extractResidues = (svgString) => {
    if (!svgString) return new Set();
    const matches = svgString.match(/>[A-Z]{2,3}\d+</g) || [];
    return new Set(matches.map(m => m.slice(1, -1)));
  };

  // Compute shared and unique residues whenever both SVGs are available
  const residuesA   = extractResidues(svgContent);
  const residuesB   = extractResidues(compareSvg);
  const sharedRes   = [...residuesA].filter(r => residuesB.has(r));
  const uniqueToA   = [...residuesA].filter(r => !residuesB.has(r));
  const uniqueToB   = [...residuesB].filter(r => !residuesA.has(r));

  const handleDownload = (svgString, filename) => {
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleCompare = () => {
    if (isCompareMode) {
      // Turning off — reset compare state
      setIsCompareMode(false);
      setComparePose(null);
      setCompareSvg("");
    } else {
      // Turning on — default compare pose to the next pose, or pose 1 if current is 1
      const defaultCompare = poseNumber === 1 ? 2 : 1;
      setIsCompareMode(true);
      setComparePose(defaultCompare);
    }
  };


  return (
    <div className="flex flex-col h-full w-full bg-white rounded-lg overflow-hidden border border-primary/10" style={{ height: '600px' }}>
      {/* ── TOOLBAR ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">

        {/* Left: download + reset view */}
        <div className="flex items-center gap-2">
          {/* Download primary SVG */}
          <button
            onClick={() => handleDownload(svgContent, `pose_${poseNumber}_interactions.svg`)}
            disabled={!svgContent}
            className="p-1.5 text-slate-600 hover:text-primary hover:bg-slate-200 rounded transition-colors disabled:opacity-40"
            title="Download SVG"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Reset pan/zoom */}
          <button
            onClick={resetView}
            className="p-1.5 rounded hover:bg-gray-200 transition-colors text-xs text-gray-600 font-medium border border-transparent hover:border-gray-300"
            title="Reset view"
          >
            Reset
          </button>
        </div>

        {/* Right: compare controls */}
        <div className="flex items-center gap-2">

          {/* Compare toggle button */}
          <button
            onClick={handleToggleCompare}
            disabled={!svgContent || (totalPoses !== undefined && totalPoses < 2)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              isCompareMode
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
            }`}
          >
            {isCompareMode ? "Exit Compare" : "Compare Poses"}
          </button>

          {/* Second pose dropdown — only shown when compare mode is on */}
          {isCompareMode && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">vs</span>
              <select
                value={comparePose || ""}
                onChange={e => setComparePose(Number(e.target.value))}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {/* Generate options for all poses except the current one */}
                {Array.from({ length: totalPoses || 9 }, (_, i) => i + 1)
                  .filter(p => p !== poseNumber)
                  .map(p => (
                    <option key={p} value={p}>Pose {p}</option>
                  ))
                }
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── COMPARE: shared residues badge strip ───────────────────── */}
      {/* Only shown when compare mode is on AND both SVGs are loaded */}
      {isCompareMode && svgContent && compareSvg && (
        <div className="flex items-start gap-3 px-3 py-2 bg-purple-50 border-b border-purple-100 text-xs flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-purple-700">Shared:</span>
            {sharedRes.length > 0
              ? sharedRes.map(r => (
                  <span key={r} className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-mono">
                    {r}
                  </span>
                ))
              : <span className="text-gray-400 italic">none</span>
            }
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-blue-700">Pose {poseNumber} only:</span>
            {uniqueToA.length > 0
              ? uniqueToA.map(r => (
                  <span key={r} className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">
                    {r}
                  </span>
                ))
              : <span className="text-gray-400 italic">none</span>
            }
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-green-700">Pose {comparePose} only:</span>
            {uniqueToB.length > 0
              ? uniqueToB.map(r => (
                  <span key={r} className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-mono">
                    {r}
                  </span>
                ))
              : <span className="text-gray-400 italic">none</span>
            }
          </div>
        </div>
      )}

      {/* ── VIEWER AREA ─────────────────────────────────────────────── */}
      {/* In compare mode: two panels side by side. Normal: one panel full width. */}
      <div className={`flex flex-1 overflow-hidden ${isCompareMode ? "divide-x divide-gray-200" : ""}`}>

        {/* PRIMARY panel — always shown */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">

          {/* Panel label — only shown in compare mode */}
          {isCompareMode && (
            <div className="px-3 py-1 bg-blue-50 border-b border-blue-100 text-xs font-semibold text-blue-700 flex-shrink-0">
              Pose {poseNumber}
            </div>
          )}

          {/* The actual draggable SVG container */}
          <div
            ref={containerRef}
            className="flex-1 overflow-hidden relative"
            style={{ cursor: isDragging ? "grabbing" : "grab", backgroundColor: "#ffffff" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-medium text-sm">
                Generating 2D Diagram...
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center text-red-500 font-medium text-sm text-center px-4">
                {error}
              </div>
            )}
            {svgContent && !loading && (
              <div
                style={{
                  transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
                  transformOrigin: "center center",
                  transition: isDragging ? "none" : "transform 0.1s ease-out",
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  // IMPORTANT: pointer-events none on the inner div so drag
                  // events reach the outer container, not the SVG text elements
                  pointerEvents: "none",
                }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            )}
          </div>
        </div>

        {/* COMPARE panel — only shown in compare mode */}
        {isCompareMode && (
          <div className="flex flex-col flex-1 overflow-hidden min-w-0">

            {/* Panel label */}
            <div className="px-3 py-1 bg-green-50 border-b border-green-100 text-xs font-semibold text-green-700 flex-shrink-0 flex items-center justify-between">
              <span>Pose {comparePose}</span>
              {/* Download compare SVG */}
              <button
                onClick={() => handleDownload(compareSvg, `pose_${comparePose}_interactions.svg`)}
                disabled={!compareSvg}
                className="p-1 rounded text-slate-600 hover:text-primary hover:bg-green-100 disabled:opacity-40 transition-colors"
                title="Download compare SVG"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>

            <div
              ref={containerBRef}
              className="flex-1 overflow-hidden relative"
              style={{ cursor: isDraggingB ? "grabbing" : "grab", backgroundColor: "#ffffff" }}
              onMouseDown={handleMouseDownB}
              onMouseMove={handleMouseMoveB}
              onMouseUp={handleMouseUpB}
              onMouseLeave={handleMouseLeaveB}
            >
              {compareLoading && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-medium text-sm">
                  Generating 2D Diagram...
                </div>
              )}
              {compareSvg && !compareLoading && (
                <div
                  style={{
                    transform: `translate(${panXB}px, ${panYB}px) scale(${scaleB})`,
                    transformOrigin: "center center",
                    transition: isDraggingB ? "none" : "transform 0.1s ease-out",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                  }}
                  dangerouslySetInnerHTML={{ __html: compareSvg }}
                />
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Interaction2DViewer;

