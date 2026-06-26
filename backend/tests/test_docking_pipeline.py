"""
tests/test_docking_pipeline.py
-------------------------------
Unit tests for the SALIDOCK docking pipeline module.

All tests are pure (no binary execution, no file I/O beyond temp dirs) —
they mock subprocess calls so the full test suite runs in any environment,
including CI without GNINA or QuickVina-W installed.

Run with:
    cd d:\\SALIDOCK2\\backend
    python -m pytest tests/test_docking_pipeline.py -v
"""
from __future__ import annotations

import sys
import os
import textwrap
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure the backend directory is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from docking import (
    CavityMetadata,
    ConfidenceTier,
    DockingError,
    DockingResult,
    EngineChoice,
    ErrorCode,
    run_docking,
    select_engine,
)
from docking.engines.gnina     import _box_side_from_volume, _parse_sdf_property
from docking.engines.quickvina import _compute_blind_box, _parse_top_vina_score
import numpy as np


# ===========================================================================
# Router tests
# ===========================================================================

class TestSelectEngine:
    """Tests for the pure routing function."""

    def test_high_tier_small_volume_with_coords_routes_gnina(self):
        meta = CavityMetadata(
            tier=ConfidenceTier.HIGH,
            volume_angstrom3=450.0,
            center_x=10.0, center_y=20.0, center_z=5.0,
        )
        engine, reason = select_engine(meta)
        assert engine == EngineChoice.GNINA
        assert "GNINA" in reason
        assert "HIGH" in reason

    def test_medium_tier_small_volume_with_coords_routes_gnina(self):
        meta = CavityMetadata(
            tier=ConfidenceTier.MEDIUM,
            volume_angstrom3=750.0,
            center_x=1.0, center_y=2.0, center_z=3.0,
        )
        engine, reason = select_engine(meta)
        assert engine == EngineChoice.GNINA
        assert "MEDIUM" in reason

    def test_low_tier_routes_quickvina(self):
        meta = CavityMetadata(
            tier=ConfidenceTier.LOW,
            volume_angstrom3=200.0,
            center_x=10.0, center_y=10.0, center_z=10.0,
        )
        engine, reason = select_engine(meta)
        assert engine == EngineChoice.QUICKVINA
        assert "LOW" in reason

    def test_missing_coordinates_routes_quickvina(self):
        meta = CavityMetadata(
            tier=ConfidenceTier.HIGH,
            volume_angstrom3=300.0,
            # center_x/y/z intentionally not set
        )
        engine, reason = select_engine(meta)
        assert engine == EngineChoice.QUICKVINA
        assert "coordinates" in reason.lower()

    def test_partial_coordinates_routes_quickvina(self):
        # Only x is set — has_coordinates must return False
        meta = CavityMetadata(
            tier=ConfidenceTier.HIGH,
            volume_angstrom3=300.0,
            center_x=10.0,
        )
        engine, _ = select_engine(meta)
        assert engine == EngineChoice.QUICKVINA

    def test_volume_above_threshold_routes_quickvina(self):
        meta = CavityMetadata(
            tier=ConfidenceTier.HIGH,
            volume_angstrom3=2500.0,
            center_x=1.0, center_y=1.0, center_z=1.0,
        )
        engine, reason = select_engine(meta)
        assert engine == EngineChoice.QUICKVINA
        assert "2500" in reason or "2000" in reason

    def test_volume_exactly_at_threshold_routes_gnina(self):
        # ≤ 2000 → GNINA (boundary is exclusive on the QuickVina side)
        meta = CavityMetadata(
            tier=ConfidenceTier.HIGH,
            volume_angstrom3=2000.0,
            center_x=1.0, center_y=1.0, center_z=1.0,
        )
        engine, _ = select_engine(meta)
        assert engine == EngineChoice.GNINA

    def test_reason_string_is_non_empty(self):
        for tier in ConfidenceTier:
            meta = CavityMetadata(
                tier=tier,
                volume_angstrom3=500.0,
                center_x=0.0, center_y=0.0, center_z=0.0,
            )
            _, reason = select_engine(meta)
            assert isinstance(reason, str) and len(reason) > 10


# ===========================================================================
# Box-size helper tests
# ===========================================================================

class TestGninaBoxSize:
    def test_typical_volume(self):
        # 500 Å³ → cube root ≈ 7.94 Å → clamp(7.94, 12, 28) = 12 → 12 + 8 = 20
        side = _box_side_from_volume(500.0)
        assert 15.0 <= side <= 36.0   # Always in sensible range

    def test_tiny_volume_hits_minimum(self):
        side = _box_side_from_volume(1.0)
        # BOX_MIN (12) + 2*BOX_PADDING (8) = 20
        assert side == pytest.approx(20.0, abs=0.01)

    def test_huge_volume_hits_maximum(self):
        side = _box_side_from_volume(999_999.0)
        # BOX_MAX (28) + 2*BOX_PADDING (8) = 36
        assert side == pytest.approx(36.0, abs=0.01)

    def test_boundary_volume(self):
        # Exactly 1000 Å³ → cube root ≈ 10 → clamp(10, 12, 28) = 12 → 20
        side = _box_side_from_volume(1000.0)
        assert side == pytest.approx(20.0, abs=0.01)


class TestSdfPropertyParser:
    def _make_sdf(self, **props) -> str:
        block = "header\n\n\n  0  0  0  0  0  0  0  0999 V2000\nM  END\n"
        for key, val in props.items():
            block += f"> <{key}>\n{val}\n\n"
        block += "$$$$\n"
        return block

    def test_parse_minimized_affinity(self):
        sdf = self._make_sdf(minimizedAffinity="-7.5")
        assert _parse_sdf_property(sdf, "minimizedAffinity") == pytest.approx(-7.5)

    def test_parse_cnn_score(self):
        sdf = self._make_sdf(CNNscore="0.85")
        assert _parse_sdf_property(sdf, "CNNscore") == pytest.approx(0.85)

    def test_parse_cnn_affinity(self):
        sdf = self._make_sdf(CNNaffinity="-8.2")
        assert _parse_sdf_property(sdf, "CNNaffinity") == pytest.approx(-8.2)

    def test_missing_property_returns_none(self):
        sdf = self._make_sdf(minimizedAffinity="-7.5")
        assert _parse_sdf_property(sdf, "CNNscore") is None

    def test_scientific_notation(self):
        sdf = self._make_sdf(minimizedAffinity="-7.5e0")
        assert _parse_sdf_property(sdf, "minimizedAffinity") == pytest.approx(-7.5)


# ===========================================================================
# QuickVina helper tests
# ===========================================================================

class TestQuickVinaHelpers:
    def test_blind_box_centre_is_midpoint(self):
        coords = np.array([[0, 0, 0], [10, 10, 10]], dtype=float)
        center, size = _compute_blind_box(coords, padding=0.0)
        assert center == pytest.approx((5.0, 5.0, 5.0), abs=0.01)
        # size = max(10 - 0 + 2*0, 20) = max(10, 20) = 20 (floor applies)
        assert size   == pytest.approx((20.0, 20.0, 20.0), abs=0.01)

    def test_blind_box_minimum_size(self):
        # Degenerate single-atom receptor → bounding box collapses, must hit min
        coords = np.array([[5.0, 5.0, 5.0]], dtype=float)
        center, size = _compute_blind_box(coords, padding=0.0)
        assert all(s >= 20.0 for s in size)

    def test_blind_box_padding_applied(self):
        coords = np.array([[0, 0, 0], [10, 10, 10]], dtype=float)
        center, size = _compute_blind_box(coords, padding=5.0)
        # Each dimension: 10 + 2*5 = 20
        assert size == pytest.approx((20.0, 20.0, 20.0), abs=0.01)

    def test_parse_top_vina_score_standard(self):
        log_text = (
            "-----+------------+----------+----------\n"
            "REMARK VINA RESULT:   -7.500      0.000      0.000\n"
            "REMARK VINA RESULT:   -6.900      0.100      0.100\n"
        )
        score = _parse_top_vina_score(log_text)
        assert score == pytest.approx(-7.5)

    def test_parse_top_vina_score_missing_returns_none(self):
        assert _parse_top_vina_score("no scores here") is None


# ===========================================================================
# Integration tests (mocked subprocess)
# ===========================================================================

# Minimal valid GNINA SDF output (one pose)
_GNINA_SDF = textwrap.dedent("""\
    SaliDock_top_pose
         GNINA

      4  3  0  0  0  0  0  0  0  0999 V2000
        1.0000    2.0000    3.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
        4.0000    5.0000    6.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
        7.0000    8.0000    9.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
       10.0000   11.0000   12.0000 S   0  0  0  0  0  0  0  0  0  0  0  0
      1  2  1  0
      2  3  2  0
      3  4  1  0
    M  END
    > <minimizedAffinity>
    -7.500

    > <CNNscore>
    0.850

    > <CNNaffinity>
    -8.200

    $$$$
""")

# Minimal valid QuickVina-W PDBQT output (one pose)
_QVINA_PDBQT = textwrap.dedent("""\
    MODEL 1
    REMARK VINA RESULT:   -6.900      0.000      0.000
    ATOM      1  C   LIG A   1       1.000   2.000   3.000  1.00  0.00           C
    ENDMDL
""")


def _make_valid_pdbqt(path: Path, content: str = "ATOM      1  CA  ALA A   1       1.000   2.000   3.000  1.00  0.00           C\n") -> None:
    path.write_text(content)


class TestRunDockingGninaSuccess:
    """run_docking returns DockingResult when GNINA succeeds."""

    def test_gnina_success_returns_docking_result(self):
        meta = CavityMetadata(
            tier=ConfidenceTier.HIGH,
            volume_angstrom3=450.0,
            center_x=10.0, center_y=20.0, center_z=5.0,
        )
        with tempfile.TemporaryDirectory() as tmp:
            rec = Path(tmp) / "receptor.pdbqt"
            lig = Path(tmp) / "ligand.pdbqt"
            _make_valid_pdbqt(rec)
            _make_valid_pdbqt(lig)

            # Mock: shutil.which finds gnina; subprocess writes SDF; no error
            with (
                patch("docking.engines.gnina.shutil.which", return_value="/usr/local/bin/gnina"),
                patch("docking.engines.gnina.subprocess.run") as mock_run,
            ):
                # subprocess.run writes the SDF to out_sdf path
                def fake_run(cmd, **kwargs):
                    # Find the --out argument and write the mock SDF there
                    out_path = cmd[cmd.index("--out") + 1]
                    Path(out_path).write_text(_GNINA_SDF)
                    result = MagicMock()
                    result.returncode = 0
                    result.stderr = ""
                    return result

                mock_run.side_effect = fake_run

                result = run_docking(str(rec), str(lig), meta)

        assert isinstance(result, DockingResult)
        assert result.engine_used    == EngineChoice.GNINA
        assert result.vina_affinity  == pytest.approx(-7.5)
        assert result.cnn_score      == pytest.approx(0.85)
        assert result.cnn_affinity   == pytest.approx(-8.2)
        assert "$$$$" in result.top_pose_sdf
        assert "GNINA" in result.routing_reason


class TestRunDockingQuickVinaSuccess:
    """run_docking returns DockingResult when QuickVina-W succeeds."""

    def test_quickvina_blind_success(self):
        meta = CavityMetadata(
            tier=ConfidenceTier.LOW,
            volume_angstrom3=300.0,
        )
        with tempfile.TemporaryDirectory() as tmp:
            rec = Path(tmp) / "receptor.pdbqt"
            lig = Path(tmp) / "ligand.pdbqt"
            _make_valid_pdbqt(rec)
            _make_valid_pdbqt(lig)

            with (
                patch("docking.engines.quickvina.shutil.which", return_value="/usr/local/bin/qvina-w"),
                patch("docking.engines.quickvina.subprocess.run") as mock_run,
                # obabel not available → use minimal-SDF fallback
                patch("docking.engines.quickvina._convert_pdbqt_to_sdf_obabel", return_value=False),
            ):
                def fake_run(cmd, **kwargs):
                    out_path = cmd[cmd.index("--out") + 1]
                    Path(out_path).write_text(_QVINA_PDBQT)
                    r = MagicMock()
                    r.returncode = 0
                    r.stderr = ""
                    return r

                mock_run.side_effect = fake_run

                result = run_docking(str(rec), str(lig), meta)

        assert isinstance(result, DockingResult)
        assert result.engine_used   == EngineChoice.QUICKVINA
        assert result.vina_affinity == pytest.approx(-6.9)
        assert result.cnn_score     is None
        assert result.cnn_affinity  is None
        assert "$$$$" in result.top_pose_sdf
        # CavityMetadata has no centre coords → router fires the "no coordinates"
        # rule (Rule 1) before the LOW-tier rule (Rule 2).
        assert "QuickVina" in result.routing_reason or "coordinates" in result.routing_reason.lower()


# ===========================================================================
# Error condition tests
# ===========================================================================

class TestErrorConditions:
    """Each of the three error codes is returned correctly."""

    def _high_meta(self):
        return CavityMetadata(
            tier=ConfidenceTier.HIGH,
            volume_angstrom3=400.0,
            center_x=1.0, center_y=1.0, center_z=1.0,
        )

    def test_binary_not_found_gnina(self):
        meta = self._high_meta()
        with tempfile.TemporaryDirectory() as tmp:
            rec = Path(tmp) / "receptor.pdbqt"
            lig = Path(tmp) / "ligand.pdbqt"
            _make_valid_pdbqt(rec)
            _make_valid_pdbqt(lig)

            with patch("docking.engines.gnina.shutil.which", return_value=None):
                result = run_docking(str(rec), str(lig), meta)

        assert isinstance(result, DockingError)
        assert result.error_code      == ErrorCode.BINARY_NOT_FOUND
        assert result.engine_attempted == EngineChoice.GNINA
        assert "gnina" in result.message.lower()

    def test_binary_not_found_quickvina(self):
        meta = CavityMetadata(tier=ConfidenceTier.LOW, volume_angstrom3=200.0)
        with tempfile.TemporaryDirectory() as tmp:
            rec = Path(tmp) / "receptor.pdbqt"
            lig = Path(tmp) / "ligand.pdbqt"
            _make_valid_pdbqt(rec)
            _make_valid_pdbqt(lig)

            with patch("docking.engines.quickvina.shutil.which", return_value=None):
                result = run_docking(str(rec), str(lig), meta)

        assert isinstance(result, DockingError)
        assert result.error_code      == ErrorCode.BINARY_NOT_FOUND
        assert result.engine_attempted == EngineChoice.QUICKVINA

    def test_malformed_input_missing_receptor(self):
        meta = self._high_meta()
        with tempfile.TemporaryDirectory() as tmp:
            lig = Path(tmp) / "ligand.pdbqt"
            _make_valid_pdbqt(lig)
            # receptor is intentionally NOT created

            with patch("docking.engines.gnina.shutil.which", return_value="/usr/local/bin/gnina"):
                result = run_docking(str(Path(tmp) / "missing.pdbqt"), str(lig), meta)

        assert isinstance(result, DockingError)
        assert result.error_code == ErrorCode.MALFORMED_INPUT

    def test_malformed_input_empty_ligand(self):
        meta = self._high_meta()
        with tempfile.TemporaryDirectory() as tmp:
            rec = Path(tmp) / "receptor.pdbqt"
            lig = Path(tmp) / "ligand.pdbqt"
            _make_valid_pdbqt(rec)
            lig.write_text("")   # empty file → malformed

            with patch("docking.engines.gnina.shutil.which", return_value="/usr/local/bin/gnina"):
                result = run_docking(str(rec), str(lig), meta)

        assert isinstance(result, DockingError)
        assert result.error_code == ErrorCode.MALFORMED_INPUT

    def test_timeout_gnina(self):
        import subprocess
        meta = self._high_meta()
        with tempfile.TemporaryDirectory() as tmp:
            rec = Path(tmp) / "receptor.pdbqt"
            lig = Path(tmp) / "ligand.pdbqt"
            _make_valid_pdbqt(rec)
            _make_valid_pdbqt(lig)

            with (
                patch("docking.engines.gnina.shutil.which", return_value="/usr/local/bin/gnina"),
                patch(
                    "docking.engines.gnina.subprocess.run",
                    side_effect=subprocess.TimeoutExpired(cmd="gnina", timeout=120),
                ),
            ):
                result = run_docking(str(rec), str(lig), meta)

        assert isinstance(result, DockingError)
        assert result.error_code      == ErrorCode.TIMEOUT
        assert result.engine_attempted == EngineChoice.GNINA
        assert "120" in result.message

    def test_timeout_quickvina(self):
        import subprocess
        meta = CavityMetadata(tier=ConfidenceTier.LOW, volume_angstrom3=200.0)
        with tempfile.TemporaryDirectory() as tmp:
            rec = Path(tmp) / "receptor.pdbqt"
            lig = Path(tmp) / "ligand.pdbqt"
            _make_valid_pdbqt(rec)
            _make_valid_pdbqt(lig)

            with (
                patch("docking.engines.quickvina.shutil.which", return_value="/usr/local/bin/qvina-w"),
                patch(
                    "docking.engines.quickvina.subprocess.run",
                    side_effect=subprocess.TimeoutExpired(cmd="qvina-w", timeout=120),
                ),
            ):
                result = run_docking(str(rec), str(lig), meta)

        assert isinstance(result, DockingError)
        assert result.error_code      == ErrorCode.TIMEOUT
        assert result.engine_attempted == EngineChoice.QUICKVINA


# ===========================================================================
# Response-object contract tests
# ===========================================================================

class TestDockingResultContract:
    """Verify that DockingResult always carries all mandatory fields."""

    def test_all_fields_present_gnina(self):
        result = DockingResult(
            top_pose_sdf   = "mol\n$$$$\n",
            cnn_score      = 0.85,
            cnn_affinity   = -8.2,
            vina_affinity  = -7.5,
            engine_used    = EngineChoice.GNINA,
            routing_reason = "test",
        )
        assert result.top_pose_sdf  is not None
        assert result.cnn_score     is not None
        assert result.cnn_affinity  is not None
        assert result.vina_affinity is not None
        assert result.engine_used   == EngineChoice.GNINA
        assert result.routing_reason != ""

    def test_cnn_fields_are_none_for_quickvina(self):
        result = DockingResult(
            top_pose_sdf   = "mol\n$$$$\n",
            cnn_score      = None,
            cnn_affinity   = None,
            vina_affinity  = -6.9,
            engine_used    = EngineChoice.QUICKVINA,
            routing_reason = "blind",
        )
        assert result.cnn_score    is None
        assert result.cnn_affinity is None
        assert result.vina_affinity == pytest.approx(-6.9)

    def test_docking_error_has_all_fields(self):
        err = DockingError(
            error_code       = ErrorCode.TIMEOUT,
            message          = "Timed out after 120 s",
            engine_attempted = EngineChoice.GNINA,
            routing_reason   = "GNINA selected",
        )
        assert err.error_code       == ErrorCode.TIMEOUT
        assert err.engine_attempted == EngineChoice.GNINA
        assert err.routing_reason   != ""
        assert "120" in err.message


# ===========================================================================
# Custom coordinates and size forwarding tests
# ===========================================================================

class TestRunDockingCustomCoordinates:
    """Tests that custom center and size coordinates are forwarded correctly to engines."""

    def test_gnina_forwards_custom_size(self):
        # GNINA chosen because tier=HIGH, volume=500 <= 1000, has coords.
        meta = CavityMetadata(
            tier=ConfidenceTier.HIGH,
            volume_angstrom3=500.0,
            center_x=10.0, center_y=20.0, center_z=5.0,
        )
        custom_size = (15.0, 16.0, 17.0)
        with tempfile.TemporaryDirectory() as tmp:
            rec = Path(tmp) / "receptor.pdbqt"
            lig = Path(tmp) / "ligand.pdbqt"
            _make_valid_pdbqt(rec)
            _make_valid_pdbqt(lig)

            with (
                patch("docking.engines.gnina.shutil.which", return_value="/usr/local/bin/gnina"),
                patch("docking.engines.gnina.subprocess.run") as mock_run,
            ):
                def fake_run(cmd, **kwargs):
                    # Verify command contains custom size arguments passed to gnina
                    assert "--center_x" in cmd
                    assert cmd[cmd.index("--center_x") + 1] == "10.0"
                    assert "--center_y" in cmd
                    assert cmd[cmd.index("--center_y") + 1] == "20.0"
                    assert "--center_z" in cmd
                    assert cmd[cmd.index("--center_z") + 1] == "5.0"
                    assert "--size_x" in cmd
                    assert cmd[cmd.index("--size_x") + 1] == "15.0"
                    assert "--size_y" in cmd
                    assert cmd[cmd.index("--size_y") + 1] == "16.0"
                    assert "--size_z" in cmd
                    assert cmd[cmd.index("--size_z") + 1] == "17.0"
                    
                    out_path = cmd[cmd.index("--out") + 1]
                    Path(out_path).write_text(_GNINA_SDF)
                    result = MagicMock()
                    result.returncode = 0
                    result.stderr = ""
                    return result

                mock_run.side_effect = fake_run

                result = run_docking(str(rec), str(lig), meta, size=custom_size)

        assert isinstance(result, DockingResult)
        assert result.engine_used == EngineChoice.GNINA

    def test_quickvina_forwards_custom_center_and_size(self):
        # QuickVina chosen because volume=2500 > 2000
        meta = CavityMetadata(
            tier=ConfidenceTier.HIGH,
            volume_angstrom3=2500.0,
            center_x=10.0, center_y=20.0, center_z=5.0,
        )
        custom_size = (25.0, 26.0, 27.0)
        with tempfile.TemporaryDirectory() as tmp:
            rec = Path(tmp) / "receptor.pdbqt"
            lig = Path(tmp) / "ligand.pdbqt"
            _make_valid_pdbqt(rec)
            _make_valid_pdbqt(lig)

            with (
                patch("docking.engines.quickvina.shutil.which", return_value="/usr/local/bin/qvina-w"),
                patch("docking.engines.quickvina.subprocess.run") as mock_run,
                patch("docking.engines.quickvina._convert_pdbqt_to_sdf_obabel", return_value=False),
            ):
                def fake_run(cmd, **kwargs):
                    # Verify command contains custom size and center arguments passed to qvina
                    assert "--center_x" in cmd
                    assert cmd[cmd.index("--center_x") + 1] == "10.0"
                    assert "--center_y" in cmd
                    assert cmd[cmd.index("--center_y") + 1] == "20.0"
                    assert "--center_z" in cmd
                    assert cmd[cmd.index("--center_z") + 1] == "5.0"
                    assert "--size_x" in cmd
                    assert cmd[cmd.index("--size_x") + 1] == "25.0"
                    assert "--size_y" in cmd
                    assert cmd[cmd.index("--size_y") + 1] == "26.0"
                    assert "--size_z" in cmd
                    assert cmd[cmd.index("--size_z") + 1] == "27.0"
                    
                    out_path = cmd[cmd.index("--out") + 1]
                    Path(out_path).write_text(_QVINA_PDBQT)
                    result = MagicMock()
                    result.returncode = 0
                    result.stderr = ""
                    return result

                mock_run.side_effect = fake_run

                # We pass size parameter to run_docking. Since meta has coordinates, they are passed as center.
                result = run_docking(str(rec), str(lig), meta, size=custom_size)

        assert isinstance(result, DockingResult)
        assert result.engine_used == EngineChoice.QUICKVINA

