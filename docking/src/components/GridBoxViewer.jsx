import React, { useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';

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
 * Custom Mol* spec for SaliDock GridBoxViewer:
 * - No left panel actions (no Download Structure, Open Files, Remote States)
 * - Keeps right panel (Structure Tools, Quick Styles, Components, Measurements)
 * - Keeps sequence viewer and viewport controls
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
  animations: [
    AnimateCameraSpin,
    AnimateCameraRock,
    AnimateStructureSpin,
  ],
  customParamEditors: [
    [CreateVolumeStreamingBehavior, VolumeStreamingCustomControls],
  ],
});

function GridBoxViewer({ sessionId, gridCenter, gridSize }) {
  const viewerRef = useRef(null);
  const pluginRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [proteinLoaded, setProteinLoaded] = useState(false);

  // Initialize Mol* plugin and load protein
  useEffect(() => {
    if (!viewerRef.current || !sessionId) return;
    let mounted = true;

    const initViewer = async () => {
      try {
        // Dispose previous plugin
        if (pluginRef.current) {
          pluginRef.current.dispose();
          pluginRef.current = null;
        }

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

        // White background
        PluginCommands.Canvas3D.SetSettings(plugin, {
          settings: (props) => {
            props.renderer.backgroundColor = Color(0xffffff);
          },
        });

        pluginRef.current = plugin;

        // Load protein from backend
        const API_BASE_URL =
          import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

        const response = await fetch(
          `${API_BASE_URL}/api/results/download/protein/${sessionId}`
        );

        if (!response.ok) {
          throw new Error('Failed to load protein structure');
        }

        const pdbData = await response.text();

        // Load into Mol*
        const dataObj = await plugin.builders.data.rawData({
          data: pdbData,
          label: 'Protein',
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
            representationPreset: 'polymer-and-ligand',
          }
        );

        // Auto-spin
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

        if (mounted) {
          setLoading(false);
          setProteinLoaded(true);
        }
      } catch (err) {
        console.error('GridBoxViewer init error:', err);
        if (mounted) {
          setError('Failed to load protein structure');
          setLoading(false);
        }
      }
    };

    initViewer();

    return () => {
      mounted = false;
      if (pluginRef.current) {
        pluginRef.current.dispose();
        pluginRef.current = null;
      }
    };
  }, [sessionId]);

  if (error) {
    return (
      <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Hide Mol* log panel via CSS */}
      <style>{`
        .msp-log { display: none !important; }
        .msp-layout-expanded { position: relative !important; }
      `}</style>

      <div
        className="relative w-full bg-gray-50"
        style={{ height: '500px', minHeight: '500px' }}
      >
        {/* Mol* Viewer — curated controls */}
        <div
          ref={viewerRef}
          className="w-full h-full rounded-lg border-2 border-gray-200 bg-white"
          style={{ width: '100%', height: '100%' }}
        />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* Grid Box Info Overlay */}
        {proteinLoaded && gridCenter && gridSize && (
          <div className="absolute bottom-4 left-4 bg-white/90 rounded-lg shadow-lg px-4 py-2 border border-gray-200 z-10">
            <p className="text-xs font-semibold text-gray-700 mb-1">
              <Eye className="w-3 h-3 inline mr-1" />
              Grid Box
            </p>
            <p className="text-xs text-gray-600">
              Center: ({gridCenter.x?.toFixed(1)}, {gridCenter.y?.toFixed(1)},{' '}
              {gridCenter.z?.toFixed(1)})
            </p>
            <p className="text-xs text-gray-600">
              Size: {gridSize.x?.toFixed(0)} × {gridSize.y?.toFixed(0)} ×{' '}
              {gridSize.z?.toFixed(0)} Å
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default GridBoxViewer;
