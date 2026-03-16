import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Loader2 } from 'lucide-react';

import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { Color } from 'molstar/lib/mol-util/color';
import { PluginBehaviors } from 'molstar/lib/mol-plugin/behavior';
import { StructureFocusRepresentation } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-focus-representation';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { PluginConfig } from 'molstar/lib/mol-plugin/config';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import 'molstar/lib/mol-plugin-ui/skin/light.scss';

/**
 * Custom Mol* spec for SaliDock
 */
const SaliDockPluginSpec = () => ({
  actions: [
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
  animations: [],
  customParamEditors: [],
});

/**
 * Paint SaliDock watermark directly onto a canvas 2D context.
 */
function paintWatermark(ctx, width, height) {
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

  const infoText = `${width}×${height}px`;
  ctx.font = `${Math.max(14, fontSize * 0.4)}px Arial`;
  ctx.fillStyle = 'rgba(100, 100, 100, 0.6)';
  ctx.fillText(infoText, padding, height - padding);
}

/**
 * MolecularViewer — a clean Mol* viewer that exposes methods via ref.
 *
 * Exposed ref methods:
 *   getPlugin()            — returns the raw Mol* plugin instance
 *   setShowSequence(bool)  — toggle sequence panel
 */
const MolecularViewer = forwardRef(function MolecularViewer({ pdbData, poseNumber }, ref) {
  const viewerRef = useRef(null);
  const pluginRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Track poseNumber safely for async operations
  const poseNumberRef = useRef(poseNumber);
  useEffect(() => {
    poseNumberRef.current = poseNumber;
  }, [poseNumber]);

  // Load PDB data into Mol*
  const loadStructureInternal = useCallback(async (plugin, data) => {
    setLoading(true);
    setError(null);
    try {
      await plugin.clear();

      const dataObj = await plugin.builders.data.rawData({
        data,
        label: `Pose ${poseNumberRef.current || '?'}`,
      });

      const trajectory = await plugin.builders.structure.parseTrajectory(dataObj, 'pdb');

      await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
        structure: { name: 'model', params: {} },
        showUnitcell: false,
        representationPreset: 'polymer-and-ligand',
      });

      plugin.managers.camera.reset();
    } catch (err) {
      console.error('Error loading structure:', err);
      setError('Failed to load molecular structure');
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Expose API to parent via ref ──────────────────────────────────
  useImperativeHandle(ref, () => ({
    getPlugin: () => pluginRef.current,

    setShowSequence: (show) => {
      const plugin = pluginRef.current;
      if (!plugin) return;
      try {
        plugin.layout.setProps({
          regionState: {
            ...plugin.layout.state.regionState,
            top: show ? 'full' : 'hidden',
          },
        });
        // setProps doesn't fire updated event, so we trigger it manually
        plugin.layout.events.updated.next(void 0);
      } catch (err) {
        console.error('Error toggling sequence:', err);
      }
    },
  }));

  // Initialize Mol* plugin
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
                regionState: {
                  left: 'hidden',
                  right: 'hidden',
                  top: 'hidden',
                  bottom: 'hidden',
                },
              },
            },
            components: { remoteState: 'none' },
            config: [
              [PluginConfig.Viewport.ShowSelectionMode, false],
            ],
          },
        });

        if (!mounted) { plugin.dispose(); return; }

        // White background
        PluginCommands.Canvas3D.SetSettings(plugin, {
          settings: (props) => {
            props.renderer.backgroundColor = Color(0xffffff);
          },
        });

        // Watermark on screenshots
        const screenshotHelper = plugin.helpers.viewportScreenshot;
        if (screenshotHelper) {
          const originalDraw = screenshotHelper.draw.bind(screenshotHelper);
          screenshotHelper.draw = async (ctx) => {
            await originalDraw(ctx);
            const canvas = screenshotHelper.canvas;
            const canvasCtx = canvas.getContext('2d');
            if (canvasCtx) paintWatermark(canvasCtx, canvas.width, canvas.height);
          };
        }

        pluginRef.current = plugin;

        if (pdbData) {
          await loadStructureInternal(plugin, pdbData);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error initializing Mol* viewer:', err);
        if (mounted) { setError('Failed to initialize molecular viewer'); setLoading(false); }
      }
    };

    initPlugin();

    return () => {
      mounted = false;
      if (pluginRef.current) { pluginRef.current.dispose(); pluginRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when pdbData changes
  useEffect(() => {
    if (!pluginRef.current || !pdbData) return;
    loadStructureInternal(pluginRef.current, pdbData);
  }, [pdbData, loadStructureInternal]);

  if (error) {
    return (
      <div className="w-full h-96 bg-card border border-primary/10 rounded-lg flex items-center justify-center">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative" id="molecular-viewer-container">
      {/* Hide specific Mol* UI elements via CSS */}
      <style>{`
        #molecular-viewer-container .msp-log { display: none !important; }
        #molecular-viewer-container .msp-layout-expanded { position: relative !important; }
        #molecular-viewer-container .msp-viewport-controls-buttons [title="Selection Mode"] { display: none !important; }
        #molecular-viewer-container .msp-viewport-controls-buttons [title="Toggle Expanded Viewport"] { display: none !important; }
        #molecular-viewer-container .msp-viewport-controls-buttons [title="Toggle Controls Panel"] { display: none !important; }
        #molecular-viewer-container .msp-viewport-controls-buttons [title="Reset Camera"] { display: none !important; }
        #molecular-viewer-container .msp-viewport-controls-buttons [title="Focus Camera On Selection"] { display: none !important; }
        #molecular-viewer-container .msp-selection-viewport-controls { display: none !important; }
      `}</style>

      <div
        className="relative w-full bg-background rounded-lg border border-primary/10"
        style={{ minHeight: '600px' }}
      >
        {/* Mol* Viewer Canvas */}
        <div
          ref={viewerRef}
          className="w-full bg-white"
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '8px',
            height: '600px',
          }}
        />

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/60 backdrop-blur-sm z-20 rounded-lg">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-2" />
            <p className="text-sm font-medium text-foreground">Processing Structure...</p>
          </div>
        )}
      </div>
    </div>
  );
});

export default MolecularViewer;
