"""Schelling Protocol Python SDK — AI agent coordination layer."""

__version__ = "3.0.0"

from .client import SchellingClient, SchellingError, Candidate

__all__ = ["SchellingClient", "SchellingError", "Candidate", "__version__"]
