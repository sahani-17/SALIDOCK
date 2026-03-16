import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Eye, AlertTriangle } from 'lucide-react';

// Mol* imports
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { Color } from 'molstar/lib/mol-util/color';
import { PluginBehaviors } from 'molstar/lib/mol-plugin/behavior';
import { StructureFocusRepresentation } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-focus-representation';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { Vec3, Vec4 } from 'molstar/lib/mol-math/linear-algebra';
import 'molstar/lib/mol-plugin-ui/skin/light.scss';

/**
 * Minimal Mol* spec for GridBoxViewer:
 * NO panels, NO sequence viewer — clean viewport only.
 */
const GridBoxViewerSpec = () => ({
  actions: [],
  behaviors: [
    PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
    PluginSpec.Behavior(PluginBehaviors.Representation.SelectLoci),
    PluginSpec.Behavior(PluginBehaviors.Representation.DefaultLociLabelProvider),
    PluginSpec.Behavior(PluginBehaviors.Camera.FocusLoci),
    PluginSpec.Behavior(PluginBehaviors.Camera.CameraAxisHelper),
    PluginSpec.Behavior(PluginBehaviors.Camera.CameraControls),
    PluginSpec.Behavior(StructureFocusRepresentation),
  ],
  animations: [],
  customParamEditors: [],
});

// Edge definitions for a box wireframe
// Each edge has two vertex indices and a color key (for axis coloring)
const BOX_EDGES = [
  // X-axis edges (Red): edges parallel to X
  { a: 0, b: 1, axis: 'x' }, { a: 3, b: 2, axis: 'x' },
  { a: 4, b: 5, axis: 'x' }, { a: 7, b: 6, axis: 'x' },
  // Y-axis edges (Green): edges parallel to Y
  { a: 0, b: 3, axis: 'y' }, { a: 1, b: 2, axis: 'y' },
  { a: 4, b: 7, axis: 'y' }, { a: 5, b: 6, axis: 'y' },
  // Z-axis edges (Blue): edges parallel to Z
  { a: 0, b: 4, axis: 'z' }, { a: 1, b: 5, axis: 'z' },
  { a: 2, b: 6, axis: 'z' }, { a: 3, b: 7, axis: 'z' },
];

// Face definitions: 6 faces, each with 4 vertex indices and an axis color
const BOX_FACES = [
  { verts: [0, 4, 7, 3], axis: 'x' }, { verts: [1, 2, 6, 5], axis: 'x' }, // X-faces
  { verts: [0, 1, 5, 4], axis: 'y' }, { verts: [3, 7, 6, 2], axis: 'y' }, // Y-faces
  { verts: [0, 3, 2, 1], axis: 'z' }, { verts: [4, 5, 6, 7], axis: 'z' }, // Z-faces
];

const AXIS_COLORS = { x: 'rgba(220, 38, 38, ', y: 'rgba(22, 163, 74, ', z: 'rgba(37, 99, 235, ' };
const AXIS_STROKE = { x: '#DC2626', y: '#16A34A', z: '#2563EB' };

/**
 * Compute 8 box corners from center + size.
 * Returns array of Vec3.
 */
function getBoxCorners(center, size) {
  const cx = center.x, cy = center.y, cz = center.z;
  const hx = size.x / 2, hy = size.y / 2, hz = size.z / 2;
  return [
    Vec3.create(cx - hx, cy - hy, cz - hz), // 0: ---
    Vec3.create(cx + hx, cy - hy, cz - hz), // 1: +--
    Vec3.create(cx + hx, cy + hy, cz - hz), // 2: ++-
    Vec3.create(cx - hx, cy + hy, cz - hz), // 3: -+-
    Vec3.create(cx - hx, cy - hy, cz + hz), // 4: --+
    Vec3.create(cx + hx, cy - hy, cz + hz), // 5: +-+
    Vec3.create(cx + hx, cy + hy, cz + hz), // 6: +++
    Vec3.create(cx - hx, cy + hy, cz + hz), // 7: -++
  ];
}

/**
 * Project a Vec3 world point to 2D canvas coordinates using Mol* camera.
 * Mol* cameraProject output:
 *   out[0] = x in viewport pixels (from viewport.x)
 *   out[1] = y in viewport pixels (OpenGL: y=0 is bottom, y increases up)
 *   out[2] = depth 0..1
 *   out[3] = 1/w (clip space)
 * We need to flip Y for canvas (y=0 is top) and scale to overlay canvas size.
 */
function projectPoint(camera, point, canvasW, canvasH) {
  const out = Vec4.create(0, 0, 0, 0);
  camera.project(out, point);
  const vp = camera.viewport;
  // Map from Mol* viewport coords to our overlay canvas coords
  // X: scale from viewport width to canvas width
  const sx = canvasW / (vp.width || 1);
  // Y: flip (GL is bottom-up, canvas is top-down) and scale
  const sy = canvasH / (vp.height || 1);
  return {
    x: (out[0] - vp.x) * sx,
    y: canvasH - (out[1] - vp.y) * sy,  // flip Y
    behind: out[3] <= 0,                  // behind camera if 1/w <= 0
  };
}

/**
 * Draw the grid box wireframe + semi-transparent faces on the overlay canvas.
 */
function drawGridBox(ctx, camera, corners3D, canvasW, canvasH) {
  // Project all 8 corners to 2D
  const pts = corners3D.map(c => projectPoint(camera, c, canvasW, canvasH));

  // Check if any point is valid
  const allBehind = pts.every(p => p.behind);
  if (allBehind) return;

  ctx.clearRect(0, 0, canvasW, canvasH);

  // Draw semi-transparent faces
  for (const face of BOX_FACES) {
    const fPts = face.verts.map(i => pts[i]);
    if (fPts.some(p => p.behind)) continue;

    ctx.beginPath();
    ctx.moveTo(fPts[0].x, fPts[0].y);
    for (let i = 1; i < fPts.length; i++) ctx.lineTo(fPts[i].x, fPts[i].y);
    ctx.closePath();
    ctx.fillStyle = AXIS_COLORS[face.axis] + '0.08)';
    ctx.fill();
  }

  // Draw 12 wireframe edges with axis coloring
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const edge of BOX_EDGES) {
    const p1 = pts[edge.a], p2 = pts[edge.b];
    if (p1.behind || p2.behind) continue;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = AXIS_STROKE[edge.axis];
    ctx.stroke();
  }

  // Draw corner dots
  ctx.fillStyle = '#333';
  for (const p of pts) {
    if (p.behind) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function GridBoxViewer({ sessionId, gridCenter, gridSize }) {
  const viewerRef = useRef(null);
  const pluginRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const cornersRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [proteinLoaded, setProteinLoaded] = useState(false);
  const [boxError, setBoxError] = useState(null);

  // Stable serialized values to prevent infinite re-renders (Bug 6 fix)
  const centerKey = gridCenter ? `${gridCenter.x},${gridCenter.y},${gridCenter.z}` : '';
  const sizeKey = gridSize ? `${gridSize.x},${gridSize.y},${gridSize.z}` : '';

  // Initialize Mol* and load protein
  useEffect(() => {
    if (!viewerRef.current || !sessionId) return;
    let mounted = true;

    const initViewer = async () => {
      try {
        if (pluginRef.current) { pluginRef.current.dispose(); pluginRef.current = null; }

        const plugin = await createPluginUI({
          target: viewerRef.current,
          render: renderReact18,
          spec: {
            ...GridBoxViewerSpec(),
            layout: {
              initial: {
                isExpanded: false,
                showControls: false,
                controlsDisplay: 'reactive',
                regionState: {
                  top: 'hidden',
                  bottom: 'hidden',
                  left: 'hidden',
                  right: 'hidden',
                },
              },
            },
            components: { remoteState: 'none' },
          },
        });
        if (!mounted) { plugin.dispose(); return; }

        PluginCommands.Canvas3D.SetSettings(plugin, {
          settings: (props) => { props.renderer.backgroundColor = Color(0xffffff); },
        });

        pluginRef.current = plugin;

        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
        const response = await fetch(`${API_BASE_URL}/api/results/download/protein/${sessionId}`);
        if (!response.ok) throw new Error('Failed to load protein structure');
        const pdbData = await response.text();

        const dataObj = await plugin.builders.data.rawData({ data: pdbData, label: 'Protein' });
        const trajectory = await plugin.builders.structure.parseTrajectory(dataObj, 'pdb');
        await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
          structure: { name: 'model', params: {} },
          showUnitcell: false,
          representationPreset: 'polymer-and-ligand',
        });

        if (mounted) { setLoading(false); setProteinLoaded(true); }
      } catch (err) {
        console.error('GridBoxViewer init error:', err);
        if (mounted) { setError('Failed to load protein structure: ' + err.message); setLoading(false); }
      }
    };

    initViewer();
    return () => { mounted = false; if (pluginRef.current) { pluginRef.current.dispose(); pluginRef.current = null; } };
  }, [sessionId]);

  // Compute box corners when center/size change (uses serialized keys to avoid obj-ref loops)
  useEffect(() => {
    if (!gridCenter || !gridSize) { cornersRef.current = null; return; }
    if (gridSize.x <= 0 || gridSize.y <= 0 || gridSize.z <= 0) {
      setBoxError('Grid size must be positive');
      cornersRef.current = null;
      return;
    }
    setBoxError(null);
    cornersRef.current = getBoxCorners(gridCenter, gridSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, sizeKey]);

  // Draw overlay: subscribe to Mol* render loop
  const renderOverlay = useCallback(() => {
    const plugin = pluginRef.current;
    const canvas = canvasRef.current;
    const corners = cornersRef.current;
    if (!plugin || !canvas || !corners || !plugin.canvas3d) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const camera = plugin.canvas3d.camera;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;

    // Match canvas resolution to container
    const w = rect.width, h = rect.height;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.scale(dpr, dpr);
    }

    drawGridBox(ctx, camera, corners, w, h);
    animFrameRef.current = requestAnimationFrame(renderOverlay);
  }, []);

  // Start/stop render loop when protein is loaded
  useEffect(() => {
    if (!proteinLoaded || !cornersRef.current) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }
    // Start render loop
    animFrameRef.current = requestAnimationFrame(renderOverlay);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [proteinLoaded, centerKey, sizeKey, renderOverlay]);

  if (error) {
    return (
      <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" id="gridbox-viewer-container">
      {/* Scoped CSS — only hide Mol* chrome inside THIS viewer (Bug 4 fix) */}
      <style>{`
        #gridbox-viewer-container .msp-log { display: none !important; }
        #gridbox-viewer-container .msp-layout-expanded { position: relative !important; }
        #gridbox-viewer-container .msp-layout-standard .msp-layout-top,
        #gridbox-viewer-container .msp-layout-standard .msp-layout-bottom { display: none !important; }
        #gridbox-viewer-container .msp-viewport-controls { display: none !important; }
        #gridbox-viewer-container .msp-viewport-controls-buttons { display: none !important; }
        #gridbox-viewer-container .msp-selection-viewport-controls { display: none !important; }
      `}</style>

      <div className="relative w-full bg-gray-50" style={{ height: '500px', minHeight: '500px' }}>
        {/* Mol* viewer */}
        <div ref={viewerRef} className="w-full h-full rounded-lg border-2 border-gray-200 bg-white" style={{ width: '100%', height: '100%' }} />

        {/* Canvas overlay for grid box — positioned exactly on top of Mol* */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{ width: '100%', height: '100%', zIndex: 5 }}
        />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg z-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* Box error feedback (Bug 8 fix) */}
        {boxError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 z-10">
            <p className="text-xs text-red-600"><AlertTriangle className="w-3 h-3 inline mr-1" />{boxError}</p>
          </div>
        )}

        {/* Grid Box Info Overlay */}
        {proteinLoaded && gridCenter && gridSize && (
          <div className="absolute bottom-4 left-4 bg-white/90 rounded-lg shadow-lg px-4 py-2.5 border border-gray-200 z-10">
            <p className="text-xs font-semibold text-gray-700 mb-1">
              <Eye className="w-3 h-3 inline mr-1" />
              Grid Box
            </p>
            <p className="text-xs text-gray-600">
              Center: ({gridCenter.x?.toFixed(1)}, {gridCenter.y?.toFixed(1)}, {gridCenter.z?.toFixed(1)})
            </p>
            <p className="text-xs text-gray-600">
              Size: {gridSize.x?.toFixed(0)} × {gridSize.y?.toFixed(0)} × {gridSize.z?.toFixed(0)} Å
            </p>
            <div className="flex gap-3 mt-1.5 text-[10px]">
              <span className="inline-flex items-center gap-1 font-semibold"><span className="w-3 h-2 rounded-sm opacity-70" style={{background:'#DC2626'}} /> X</span>
              <span className="inline-flex items-center gap-1 font-semibold"><span className="w-3 h-2 rounded-sm opacity-70" style={{background:'#16A34A'}} /> Y</span>
              <span className="inline-flex items-center gap-1 font-semibold"><span className="w-3 h-2 rounded-sm opacity-70" style={{background:'#2563EB'}} /> Z</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GridBoxViewer;
