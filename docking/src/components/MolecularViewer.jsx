import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

// Mol* imports
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { Color } from 'molstar/lib/mol-util/color';
import { PluginBehaviors } from 'molstar/lib/mol-plugin/behavior';
import { StructureFocusRepresentation } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-focus-representation';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import { AnimateCameraSpin } from 'molstar/lib/mol-plugin-state/animation/built-in/camera-spin';
import { AnimateCameraRock } from 'molstar/lib/mol-plugin-state/animation/built-in/camera-rock';
import { AnimateStructureSpin } from 'molstar/lib/mol-plugin-state/animation/built-in/spin-structure';
import { CreateVolumeStreamingBehavior } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { VolumeStreamingCustomControls } from 'molstar/lib/mol-plugin-ui/custom/volume';
import 'molstar/lib/mol-plugin-ui/skin/light.scss';

/**
 * Custom Mol* spec for SaliDock:
 * - No left panel actions (no Download Structure, Open Files, Remote States, etc.)
 * - Keeps right panel (Structure Tools, Quick Styles, Components, Measurements)
 * - Keeps sequence viewer, viewport controls
 * - Hides log panel via CSS
 */
const SaliDockPluginSpec = () => ({
  actions: [
    // Keep only structure/representation manipulation actions (for right panel)
    // Remove: DownloadStructure, DownloadDensity, DownloadFile, OpenFiles, LoadTrajectory
    PluginSpec.Action(StateTransforms.Representation.StructureRepresentation3D),
    PluginSpec.Action(StateTransforms.Representation.StructureSelectionsDistance3D),
    PluginSpec.Action(StateTransforms.Representation.StructureSelectionsAngle3D),
    PluginSpec.Action(StateTransforms.Representation.StructureSelectionsDihedral3D),
    PluginSpec.Action(StateTransforms.Representation.StructureSelectionsLabel3D),
    PluginSpec.Action(StateTransforms.Representation.StructureSelectionsOrientation3D),
    PluginSpec.Action(StateTransforms.Representation.ExplodeStructureRepresentation3D),
    PluginSpec.Action(StateTransforms.Representation.SpinStructureRepresentation3D),
    PluginSpec.Action(StateTransforms.Representation.OverpaintStructureRepresentation3DFromScript),
    PluginSpec.Action(StateTransforms.Representation.TransparencyStructureRepresentation3DFromScript),
    PluginSpec.Action(StateTransforms.Representation.ThemeStrengthRepresentation3D),
  ],
  behaviors: [
    PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
    PluginSpec.Behavior(PluginBehaviors.Representation.SelectLoci),
    PluginSpec.Behavior(PluginBehaviors.Representation.DefaultLociLabelProvider),
    PluginSpec.Behavior(PluginBehaviors.Representation.FocusLoci),
    PluginSpec.Behavior(PluginBehaviors.Camera.FocusLoci),
    PluginSpec.Behavior(PluginBehaviors.Camera.CameraAxisHelper),
    PluginSpec.Behavior(PluginBehaviors.Camera.CameraControls),
    PluginSpec.Behavior(StructureFocusRepresentation),
    PluginSpec.Behavior(PluginBehaviors.CustomProps.StructureInfo),
    PluginSpec.Behavior(PluginBehaviors.CustomProps.AccessibleSurfaceArea),
    PluginSpec.Behavior(PluginBehaviors.CustomProps.Interactions),
    PluginSpec.Behavior(PluginBehaviors.CustomProps.SecondaryStructure),
    PluginSpec.Behavior(PluginBehaviors.CustomProps.ValenceModel),
  ],
  animations: [
    AnimateCameraSpin,
    AnimateCameraRock,
    AnimateStructureSpin,
  ],
  customParamEditors: [
    [CreateVolumeStreamingBehavior, VolumeStreamingCustomControls],
  ],
});

/**
 * Paint SaliDock watermark directly onto a canvas 2D context.
 * Called after Mol*'s draw() renders the screenshot to the internal canvas.
 */
function paintWatermark(ctx, width, height) {
  // SaliDock watermark — bottom-right, scaled for any resolution
  const watermarkText = 'SaliDock';
  const fontSize = Math.max(24, height * 0.035);
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 3;

  const textMetrics = ctx.measureText(watermarkText);
  const padding = Math.max(20, height * 0.02);
  const textX = width - textMetrics.width - padding;
  const textY = height - padding;

  ctx.strokeText(watermarkText, textX, textY);
  ctx.fillText(watermarkText, textX, textY);

  // Resolution info — bottom-left
  const infoText = `${width}×${height}px`;
  ctx.font = `${Math.max(14, fontSize * 0.4)}px Arial`;
  ctx.fillStyle = 'rgba(100, 100, 100, 0.6)';
  ctx.fillText(infoText, padding, height - padding);
}

function MolecularViewer({ pdbData, poseNumber }) {
  const viewerRef = useRef(null);
  const pluginRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Initialize the Mol* plugin once
  useEffect(() => {
    if (!viewerRef.current) return;
    let mounted = true;

    const initPlugin = async () => {
      try {
        const plugin = await createPluginUI({
          target: viewerRef.current,
          render: renderReact18,
          spec: {
            ...SaliDockPluginSpec(),
            layout: {
              initial: {
                isExpanded: false,
                showControls: true,
                controlsDisplay: 'reactive',
              },
            },
            components: {
              remoteState: 'none',
            },
          },
        });

        if (!mounted) {
          plugin.dispose();
          return;
        }

        // Set white background
        PluginCommands.Canvas3D.SetSettings(plugin, {
          settings: (props) => {
            props.renderer.backgroundColor = Color(0xffffff);
          },
        });

        // Monkey-patch Mol*'s screenshot draw() method so ALL outputs
        // (download, clipboard, preview) get the SaliDock watermark.
        // draw() renders to this.canvas, which is then used for blob/dataUri.
        const screenshotHelper = plugin.helpers.viewportScreenshot;
        if (screenshotHelper) {
          const originalDraw = screenshotHelper.draw.bind(screenshotHelper);
          screenshotHelper.draw = async (ctx) => {
            await originalDraw(ctx);
            // Paint watermark onto the internal canvas after rendering
            const canvas = screenshotHelper.canvas;
            const canvasCtx = canvas.getContext('2d');
            if (canvasCtx) {
              paintWatermark(canvasCtx, canvas.width, canvas.height);
            }
          };
        }

        pluginRef.current = plugin;

        // If pdbData is already available, load it
        if (pdbData) {
          await loadStructure(plugin, pdbData);
        }
      } catch (err) {
        console.error('Error initializing Mol* viewer:', err);
        if (mounted) setError('Failed to initialize molecular viewer');
      }
    };

    initPlugin();

    return () => {
      mounted = false;
      if (pluginRef.current) {
        pluginRef.current.dispose();
        pluginRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load new structure when pdbData changes
  useEffect(() => {
    if (!pluginRef.current || !pdbData) return;
    loadStructure(pluginRef.current, pdbData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdbData]);

  // Load a PDB string into the Mol* plugin
  const loadStructure = async (plugin, data) => {
    setLoading(true);
    setError(null);

    try {
      await plugin.clear();

      const dataObj = await plugin.builders.data.rawData({
        data,
        label: `Pose ${poseNumber || '?'}`,
      });

      const trajectory = await plugin.builders.structure.parseTrajectory(
        dataObj,
        'pdb'
      );

      await plugin.builders.structure.hierarchy.applyPreset(
        trajectory,
        'default',
        {
          structure: { name: 'model', params: {} },
          showUnitcell: false,
          // 'polymer-and-ligand' preset: protein as cartoon, ligands as ball-and-stick
          representationPreset: 'polymer-and-ligand',
        }
      );

      // Start auto-spin
      if (plugin.canvas3d) {
        PluginCommands.Canvas3D.SetSettings(plugin, {
          settings: {
            trackball: {
              ...plugin.canvas3d.props.trackball,
              animate: {
                name: 'spin',
                params: { speed: 0.5 },
              },
            },
          },
        });
      }
    } catch (err) {
      console.error('Error loading structure:', err);
      setError('Failed to load molecular structure');
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Hide log panel and left panel home button via CSS */}
      <style>{`
        .msp-log { display: none !important; }
        .msp-layout-expanded { position: relative !important; }
      `}</style>

      <div
        className="relative w-full bg-gray-50"
        style={{ height: '600px', minHeight: '600px' }}
      >
        {/* Mol* Viewer Container */}
        <div
          ref={viewerRef}
          className="w-full h-full rounded-lg border-2 border-gray-200 bg-white"
          style={{
            width: '100%',
            height: '100%',
            minHeight: '600px',
            position: 'relative',
            overflow: 'hidden',
          }}
        />

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20 rounded-lg">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          </div>
        )}


        {/* Pose Info Overlay */}
        <div className="absolute bottom-4 left-4 bg-white/90 rounded-lg shadow-lg px-4 py-2 border border-gray-200 z-10">
          <p className="text-sm font-medium text-gray-900">
            Pose {poseNumber || 'N/A'}
          </p>
          <p className="text-xs text-gray-600">Protein-Ligand Complex</p>
        </div>
      </div>
    </div>
  );
}

export default MolecularViewer;
