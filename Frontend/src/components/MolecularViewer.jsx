import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { AnimatedCircularProgressBar } from './ui/animated-circular-progress-bar';

import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { Color } from 'molstar/lib/mol-util/color';
import { PluginBehaviors } from 'molstar/lib/mol-plugin/behavior';
import { StructureFocusRepresentation } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-focus-representation';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { PluginConfig } from 'molstar/lib/mol-plugin/config';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import 'molstar/lib/mol-plugin-ui/skin/light.scss';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StructureSelection, QueryContext } from 'molstar/lib/mol-model/structure/query';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';

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
 * Helper to build a comprehensive, robust selection expression for standard protein residues.
 */
function getProteinExpression() {
  const standardProteinResidues = [
    'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
    'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL',
    'MSE', 'SEC', 'PYL', 'DA', 'DC', 'DG', 'DT', 'A', 'C', 'G', 'U'
  ];

  return MS.struct.modifier.union([
    MS.struct.generator.atomGroups({
      'entity-test': MS.core.rel.eq([MS.ammp('entityType'), 'polymer'])
    }),
    MS.struct.generator.atomGroups({
      'residue-test': MS.core.logic.or(
        standardProteinResidues.map(name => MS.core.rel.eq([MS.ammp('label_comp_id'), name]))
      )
    })
  ]);
}

/**
 * Helper to build a comprehensive, robust selection expression for the ligand.
 * Standard PDB files created by Vina/Gnina/QuickVina may use UNL, LIG, MOL, UNK,
 * or custom residue names, and Mol* may classify them as 'non-polymer' or 'unknown'
 * or 'macromol'.
 */
function getLigandExpression() {
  const customLigandNames = [
    'UNL', 'LIG', 'MOL', 'UNK', 'DRG', '001', '1', 'LIG1', 'LIGAND', 'BTN'
  ];

  return MS.struct.generator.atomGroups({
    'residue-test': MS.core.logic.or(
      customLigandNames.map(name => MS.core.rel.eq([MS.ammp('label_comp_id'), name]))
    )
  });
}

/**
 * MolecularViewer — a clean Mol* viewer that exposes methods via ref.
 *
 * Exposed ref methods:
 *   getPlugin()            — returns the raw Mol* plugin instance
 *   setShowSequence(bool)  — toggle sequence panel
 */
const MolecularViewer = forwardRef(function MolecularViewer({
  pdbData,
  poseNumber,
  proteinRepr = 'cartoon',
  ligandRepr = 'ball-and-stick',
  colorScheme = 'element-symbol',
  showPocketResidues = false,
  showPocketLabels = false,
  showPocketSurface = true,
  showInteractions = false,
  spin = false,
  showProtein = true,
  minimal = false,
}, ref) {
  const viewerRef = useRef(null);
  const pluginRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Track poseNumber and pdbData safely for async operations
  const poseNumberRef = useRef(poseNumber);
  useEffect(() => {
    poseNumberRef.current = poseNumber;
  }, [poseNumber]);

  const pdbDataRef = useRef(pdbData);
  useEffect(() => {
    pdbDataRef.current = pdbData;
  }, [pdbData]);

  // Helper function to delete component by tag or label across state data tree
  const deleteCompByTag = useCallback(async (plugin, structureRef, tag) => {
    if (!plugin || !plugin.state?.data) return;
    const state = plugin.state.data;
    const update = plugin.build();
    let deleted = false;

    const labelMap = {
      'pocket-residues-component': 'Cavity Residues',
      'pocket-labels-component': 'Residue Labels',
      'pocket-surface-component': 'Cavity Surface',
      'interactions-component': 'Interactions',
      'protein-component': 'Receptor',
      'ligand-component': 'Ligand'
    };
    const targetLabel = labelMap[tag];

    state.cells.forEach((cell, ref) => {
      if (!cell || !cell.transform) return;
      const tags = cell.transform.tags;
      const paramsTags = cell.transform.params?.tags;
      const label = cell.transform.params?.label;

      const hasTag = (tList) => {
        if (!tList) return false;
        if (Array.isArray(tList)) return tList.includes(tag);
        if (tList instanceof Set) return tList.has(tag);
        if (typeof tList === 'string') return tList === tag;
        return false;
      };

      if (
        ref === tag ||
        hasTag(tags) ||
        hasTag(paramsTags) ||
        (targetLabel && label === targetLabel)
      ) {
        update.delete(ref);
        deleted = true;
      }
    });

    if (deleted) {
      await update.commit();
    }
  }, []);

  // Helper function to clear representations under a component node
  const clearNodeChildren = useCallback(async (plugin, nodeRef) => {
    if (!plugin || !plugin.state?.data) return;
    const children = plugin.state.data.tree.children.get(nodeRef);
    if (children && children.size > 0) {
      const update = plugin.build();
      children.forEach(childRef => {
        update.delete(childRef);
      });
      await update.commit();
    }
  }, []);

  // Apply visual representation settings dynamically to Mol*
  const applySettings = useCallback(async () => {
    const plugin = pluginRef.current;
    if (!plugin) return;
    const structureRef = plugin.managers.structure.hierarchy.current.structures[0];
    if (!structureRef || !structureRef.cell) return;

    try {
      const ligandExpression = getLigandExpression();

      const surroundingExpression = MS.struct.modifier.includeSurroundings({
        0: ligandExpression,
        radius: 5.0,
        'as-whole-residues': true
      });

      const proteinExpression = getProteinExpression();

      const pocketResExpression = MS.struct.modifier.exceptBy({
        0: surroundingExpression,
        by: ligandExpression
      });

      // --- Receptor (Protein) ---
      if (proteinRepr === 'hide' || !showProtein) {
        await deleteCompByTag(plugin, structureRef, 'protein-component');
      } else {
        const proteinComp = await plugin.builders.structure.tryCreateComponentFromExpression(
          structureRef.cell,
          proteinExpression,
          'protein-component',
          { label: 'Receptor', tags: ['protein-component'] }
        );
        if (proteinComp) {
          await clearNodeChildren(plugin, proteinComp.ref);

          // Default: color by chain so multi-chain proteins are immediately
          // distinguishable. Mol*'s built-in 'chain-id' theme already uses a
          // curated palette that works on dark backgrounds.
          let colorTheme = 'chain-id';  // <-- curated default
          if (colorScheme === 'element-symbol') {
            colorTheme = 'element-symbol';
          } else if (colorScheme === 'secondary-structure') {
            colorTheme = 'secondary-structure';
          } else if (colorScheme === 'hydrophobicity') {
            colorTheme = 'hydrophobicity';
          } else if (colorScheme === 'chain-id') {
            colorTheme = 'chain-id';
          } else if (colorScheme === 'entity-id') {
            colorTheme = 'entity-id';
          } else if (colorScheme === 'residue-name') {
            colorTheme = 'residue-name';
          } else if (colorScheme === 'sequence-id' || colorScheme === 'rainbow' || colorScheme === 'polymer-index') {
            colorTheme = 'sequence-id';
          } else if (colorScheme === 'uniform') {
            colorTheme = 'uniform';
          } else if (colorScheme === 'default') {
            colorTheme = 'chain-id';   // 'default' → chain-id on dark bg
          }

          let type = 'cartoon';
          if (proteinRepr === 'spacefill') type = 'spacefill';
          if (proteinRepr === 'ball-and-stick') type = 'ball-and-stick';
          if (proteinRepr === 'molecular-surface' || proteinRepr === 'gaussian-surface') type = 'gaussian-surface';
          if (proteinRepr === 'putty') type = 'putty';
          if (proteinRepr === 'ribbon') type = 'ribbon';

          await plugin.builders.structure.representation.addRepresentation(
            proteinComp,
            {
              type: type,
              color: colorTheme,
              colorParams: colorTheme === 'uniform' ? { value: Color(0x3b82f6) } : {}
            }
          );
        }
      }

      // --- Ligand ---
      const ligandComp = await plugin.builders.structure.tryCreateComponentFromExpression(
        structureRef.cell,
        ligandExpression,
        'ligand-component',
        { label: 'Ligand', tags: ['ligand-component'] }
      );
      if (ligandComp) {
        await clearNodeChildren(plugin, ligandComp.ref);

        let type = 'ball-and-stick';
        if (ligandRepr === 'spacefill') type = 'spacefill';
        if (ligandRepr === 'molecular-surface') type = 'gaussian-surface';

        try {
          await plugin.builders.structure.representation.addRepresentation(
            ligandComp,
            {
              type: type,
              color: 'element-symbol',
              colorParams: {
                carbonColor: { name: 'uniform', params: { value: Color(0x404040) } },
              },
              typeParams: {
                sizeFactor: type === 'spacefill' ? 1.0 : 0.26,
                sizeAspectRatio: 0.42,
              }
            }
          );
        } catch (repErr) {
          console.warn('[MolecularViewer] Custom carbon color failed, using standard element-symbol:', repErr);
          await plugin.builders.structure.representation.addRepresentation(
            ligandComp,
            {
              type: type,
              color: 'element-symbol',
              typeParams: {
                sizeFactor: type === 'spacefill' ? 1.0 : 0.26,
                sizeAspectRatio: 0.42,
              }
            }
          );
        }
      }

      // --- Pocket Residues ---
      if (!showPocketResidues) {
        await deleteCompByTag(plugin, structureRef, 'pocket-residues-component');
        await deleteCompByTag(plugin, structureRef, 'pocket-labels-component');
      } else {
        const pocketResComp = await plugin.builders.structure.tryCreateComponentFromExpression(
          structureRef.cell,
          pocketResExpression,
          'pocket-residues-component',
          { label: 'Cavity Residues', tags: ['pocket-residues-component'] }
        );
        if (pocketResComp) {
          await clearNodeChildren(plugin, pocketResComp.ref);
          await plugin.builders.structure.representation.addRepresentation(
            pocketResComp,
            {
              type: 'ball-and-stick',
              color: 'element-symbol',
              colorParams: {
                carbonColor: { name: 'uniform', params: { value: Color(0x90a4ae) } },
              },
              typeParams: {
                sizeFactor: 0.18,
                sizeAspectRatio: 0.5,
              }
            }
          );
        }

        // --- Pocket Labels ---
        if (!showPocketLabels) {
          await deleteCompByTag(plugin, structureRef, 'pocket-labels-component');
        } else {
          const pocketLabelsComp = await plugin.builders.structure.tryCreateComponentFromExpression(
            structureRef.cell,
            pocketResExpression,
            'pocket-labels-component',
            { label: 'Residue Labels', tags: ['pocket-labels-component'] }
          );
          if (pocketLabelsComp) {
            await clearNodeChildren(plugin, pocketLabelsComp.ref);
            await plugin.builders.structure.representation.addRepresentation(
              pocketLabelsComp,
              {
                type: 'label',
                color: 'uniform',
                colorParams: {
                  value: Color(0xffffff),
                },
                typeParams: {
                  level: 'residue',
                  sizeFactor: 1.3,
                  background: true,
                  backgroundColor: Color(0x0f172a),
                  backgroundOpacity: 0.75,
                  borderWidth: 0,
                }
              }
            );
          }
        }
      }

      // --- Pocket Surface ---
      if (!showPocketSurface) {
        await deleteCompByTag(plugin, structureRef, 'pocket-surface-component');
      } else {
        const pocketSurfComp = await plugin.builders.structure.tryCreateComponentFromExpression(
          structureRef.cell,
          pocketResExpression,
          'pocket-surface-component',
          { label: 'Cavity Surface', tags: ['pocket-surface-component'] }
        );
        if (pocketSurfComp) {
          await clearNodeChildren(plugin, pocketSurfComp.ref);

          let colorTheme = 'element-symbol';
          if (colorScheme === 'hydrophobicity') {
            colorTheme = 'hydrophobicity';
          }

          await plugin.builders.structure.representation.addRepresentation(
            pocketSurfComp,
            {
              type: 'gaussian-surface',
              color: colorTheme,
              typeParams: {
                alpha: 0.35,
                quality: 'high',
                smoothness: 1.5,
              }
            }
          );
        }
      }

      // --- Interactions ---
      if (!showInteractions) {
        await deleteCompByTag(plugin, structureRef, 'interactions-component');
      } else {
        try {
          if (structureRef.cell.obj?.data) {
            await plugin.managers.customStructureProperties.compute(structureRef.cell.obj.data, { owner: plugin });
          }
        } catch (propErr) {
          console.warn("Could not compute custom interaction properties:", propErr);
        }

        const interactionsComp = await plugin.builders.structure.tryCreateComponentFromExpression(
          structureRef.cell,
          surroundingExpression,
          'interactions-component',
          { label: 'Interactions', tags: ['interactions-component'] }
        );
        if (interactionsComp) {
          await clearNodeChildren(plugin, interactionsComp.ref);
          await plugin.builders.structure.representation.addRepresentation(
            interactionsComp,
            {
              type: 'interactions',
              typeParams: {
                includeParent: true,
              }
            }
          );
        }
      }

      if (plugin.canvas3d) {
        plugin.canvas3d.setProps({
          trackball: {
            animate: spin
              ? { name: 'spin', params: { speed: 0.8 } }
              : { name: 'off', params: {} }
          }
        });
      }

    } catch (err) {
      console.error("Error applying molecular visualization settings:", err);
    }
  }, [
    proteinRepr,
    ligandRepr,
    colorScheme,
    showPocketResidues,
    showPocketLabels,
    showPocketSurface,
    showInteractions,
    spin,
    showProtein,
    deleteCompByTag,
    clearNodeChildren
  ]);

  // Load PDB data into Mol*
  const loadStructureInternal = useCallback(async (plugin, data) => {
    if (!data || typeof data !== 'string') return;
    const cleanData = data.replace(/^\uFEFF/, '');
    if (cleanData.length < 50) return;

    setLoading(true);
    setError(null);
    try {
      await plugin.clear();

      const dataObj = await plugin.builders.data.rawData({
        data: cleanData,
        label: `Pose ${poseNumberRef.current || '?'}`,
      });

      const trajectory = await plugin.builders.structure.parseTrajectory(dataObj, 'pdb');

      await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
        structure: { name: 'model', params: {} },
        showUnitcell: false,
        representationPreset: 'empty',
      });

      const structureRef = plugin.managers.structure.hierarchy.current.structures[0];
      const structure = structureRef?.cell?.obj?.data;

      // Apply initial representations
      try {
        await applySettings();
      } catch (appErr) {
        console.warn('[MolecularViewer] Error applying representations inside loadStructureInternal:', appErr);
      }

      if (minimal) {
        plugin.managers.camera.reset();
      } else if (structureRef && structure) {
        // Focus camera on the ligand loci
        try {
          const ligandExpression = getLigandExpression();
          const query = compile(ligandExpression);
          const result = query(new QueryContext(structure));
          const loci = StructureSelection.toLociWithCurrentUnits(result);

          if (loci && loci.elements && loci.elements.length > 0) {
            plugin.managers.camera.focusLoci(loci);
          } else {
            plugin.managers.camera.reset();
          }
        } catch (camErr) {
          plugin.managers.camera.reset();
        }
      } else {
        plugin.managers.camera.reset();
      }

      setTimeout(() => {
        try {
          plugin.canvas3D?.requestResize();
        } catch (e) {}
      }, 150);
    } catch (err) {
      console.error('Error loading structure:', err);
      setError('Failed to load molecular structure');
    } finally {
      setLoading(false);
    }
  }, [minimal, applySettings]);

  const handleResetCamera = useCallback(() => {
    pluginRef.current?.managers.camera.reset();
  }, []);

  const handleDownloadUltraHD = useCallback(async () => {
    const plugin = pluginRef.current;
    if (!plugin) return;
    try {
      plugin.helpers.viewportScreenshot.behaviors.values.next({
        ...plugin.helpers.viewportScreenshot.behaviors.values.value,
        resolution: {
          name: 'ultra-hd',
          params: {}
        },
        transparent: false
      });
      await plugin.helpers.viewportScreenshot.download('salidock_pose_ultrahd.png');
    } catch (err) {
      console.error('Failed to export UltraHD image:', err);
    }
  }, []);

  // Apply Settings whenever they change and PDB data is loaded
  useEffect(() => {
    if (!loading && pdbData) {
      applySettings();
    }
  }, [applySettings, loading, pdbData]);

  // ─── Expose API to parent via ref ──────────────────────────────────
  useImperativeHandle(ref, () => ({
    getPlugin: () => pluginRef.current,

    zoomToCavity: () => {
      const plugin = pluginRef.current;
      if (!plugin) return;
      const structureRef = plugin.managers.structure.hierarchy.current.structures[0];
      const structure = structureRef?.cell?.obj?.data;
      if (structure) {
        const ligandExpression = getLigandExpression();
        const surroundingExpression = MS.struct.modifier.includeSurroundings({
          0: ligandExpression,
          radius: 5.0,
          'as-whole-residues': true
        });
        const query = compile(surroundingExpression);
        const result = query(new QueryContext(structure));
        const loci = StructureSelection.toLociWithCurrentUnits(result);
        if (loci && loci.elements && loci.elements.length > 0) {
          plugin.managers.camera.focusLoci(loci);
        }
      }
    },

    resetCamera: () => {
      pluginRef.current?.managers.camera.reset();
    },

    /**
     * Fly the Mol* camera to an XYZ coordinate (cavity centre).
     * @param {number} x  - Å coordinate
     * @param {number} y
     * @param {number} z
     * @param {number} [radius=12]  - field-of-view radius in Å
     */
    focusOnPoint: (x, y, z, radius = 12) => {
      const plugin = pluginRef.current;
      if (!plugin?.canvas3d) return;
      try {
        const centre = Vec3.create(x, y, z);
        plugin.canvas3d.camera.setState(
          {
            target: centre,
            radius,
          },
          // 500 ms smooth fly-to transition
          500,
        );
      } catch (err) {
        console.warn('[MolecularViewer] focusOnPoint failed:', err);
        // Graceful fallback — don't crash
      }
    },

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
    let plugin = null;

    // Create a dedicated inner container div to prevent React 19 double-mount/createRoot issues
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    viewerRef.current.appendChild(container);

    const initPlugin = async () => {
      try {
        const defaultSpec = DefaultPluginUISpec();
        plugin = await createPluginUI({
          target: container,
          render: renderReact18,
          spec: {
            ...defaultSpec,
            actions: [
              ...(defaultSpec.actions || []),
              ...SaliDockPluginSpec().actions,
            ],
            behaviors: [
              ...(defaultSpec.behaviors || []),
              ...SaliDockPluginSpec().behaviors,
            ],
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
              ...(defaultSpec.config || []),
              [PluginConfig.Viewport.ShowSelectionMode, false],
            ],
          },
        });

        if (!mounted) {
          plugin.dispose();
          return;
        }

        // ── Canvas3D settings ─────────────────────────────────────────────
        // White background matching the reference image (PyMOL/PLIP style).
        // Fog is disabled so nothing dissolves during rotation — instead we
        // rely on SSAO and silhouette outlines for depth perception.
        PluginCommands.Canvas3D.SetSettings(plugin, {
          settings: (props) => {
            // Crisp white background for canvas (PyMOL / publication style)
            props.renderer.backgroundColor = Color(0xffffff);

            // Disable fog / depth cueing entirely (prevents structure fading)
            if ('fog' in props.renderer) {
              props.renderer.fog = false;
            }

            // Ensure transparent atoms still render correctly
            if (props.renderer.transparentBackground !== undefined) {
              props.renderer.transparentBackground = false;
            }

            // Screen-Space Ambient Occlusion: crevice shadows
            // Slightly less intense on white background
            if (props.postprocessing?.occlusion) {
              props.postprocessing.occlusion.name = 'on';
              props.postprocessing.occlusion.params.intensity = 1.2;
              props.postprocessing.occlusion.params.radius = 5.0;
              props.postprocessing.occlusion.params.samples = 32;
            }

            // Turn off silhouette outlines on white background
            if (props.postprocessing?.outline) {
              props.postprocessing.outline.name = 'off';
            }

            // Turn off shadows
            if (props.postprocessing?.shadow) {
              props.postprocessing.shadow.name = 'off';
            }
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

        const dataToLoad = pdbDataRef.current || pdbData;
        if (dataToLoad) {
          await loadStructureInternal(plugin, dataToLoad);
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
      if (plugin) {
        plugin.dispose();
      }
      if (pluginRef.current) {
        pluginRef.current.dispose();
        pluginRef.current = null;
      }
      if (container && viewerRef.current && viewerRef.current.contains(container)) {
        viewerRef.current.removeChild(container);
      }
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
    <div
      className={`relative ${minimal ? 'w-full h-full' : ''}`}
      id="molecular-viewer-container"
      data-minimal={minimal ? 'true' : 'false'}
      style={minimal ? { height: '100%', width: '100%' } : {}}
    >
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
        #molecular-viewer-container .msp-viewport-controls { display: none !important; }
        #molecular-viewer-container button[title="Select Animation"],
        #molecular-viewer-container .msp-btn[title="Select Animation"],
        button[title="Select Animation"],
        .msp-btn[title="Select Animation"] { display: none !important; }
        #molecular-viewer-container[data-minimal="true"] .msp-viewport-controls,
        #molecular-viewer-container[data-minimal="true"] .msp-viewport-controls-buttons { display: none !important; }
      `}</style>

      <div
        className={`relative w-full bg-background rounded-lg border border-primary/10 ${minimal ? 'h-full border-none rounded-none' : ''}`}
        style={minimal ? { height: '100%', width: '100%' } : { minHeight: '600px' }}
      >
        {/* Mol* Viewer Canvas — background matches canvas3D backgroundColor (#ffffff) */}
        <div
          ref={viewerRef}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '8px',
            width: '100%',
            height: minimal ? '100%' : '600px',
            backgroundColor: '#ffffff',
          }}
        />

        {/* Floating Reset Zoom Button */}
        {!minimal && (
          <button
            onClick={handleResetCamera}
            className="absolute top-4 right-16 z-10 p-2.5 rounded-full bg-card/90 hover:bg-card text-muted-foreground hover:text-primary shadow-elevated border border-border/80 backdrop-blur-sm transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
            title="Reset Zoom"
          >
            <RefreshCw size={18} />
          </button>
        )}

        {/* Floating Download UltraHD Button */}
        {!minimal && (
          <button
            onClick={handleDownloadUltraHD}
            className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-card/90 hover:bg-card text-muted-foreground hover:text-primary shadow-elevated border border-border/80 backdrop-blur-sm transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
            title="Download UltraHD Image"
          >
            <Camera size={18} />
          </button>
        )}

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm z-20 rounded-lg bg-card/85 gap-2">
            <AnimatedCircularProgressBar label="Structure" size={70} strokeWidth={6} />
            <p className="text-xs font-semibold text-foreground">Processing 3D Structure...</p>
          </div>
        )}
      </div>
    </div>
  );
});

export default MolecularViewer;
