"""
salidock.cavity — wRRF Consensus Binding-Site Detection Pipeline
================================================================

Fuses predictions from fpocket, P2Rank, and PUResNetV2.0 using
Weighted Reciprocal Rank Fusion (wRRF) with Bayesian-optimised weights.

Published benchmark results (SALIDOCK wRRF v1.0):
  COACH420-298: DCA@top-1 = 60.09%  (+2.58 pp vs best individual)
  JOINED-560:   DCA@top-1 = 66.76%  (+5.86 pp vs best individual)
  HOLO4K:       DCA@top-5 = 84.63%  (+6.96 pp vs PUResNet alone)

Optimal weights (Optuna TPE, 200 trials, 5-fold family-stratified CV):
  w_fpocket  = 0.1514
  w_p2rank   = 0.1514
  w_puresnet = 0.6972

Fusion parameters:
  Clustering radius : 6.0 Å (greedy spatial merge)
  RRF constant k    : 60
"""

from .models import CavityResult
from .config import CavityConfig
from .pipeline import CavityDetectionPipeline

__all__ = ["CavityResult", "CavityConfig", "CavityDetectionPipeline"]
