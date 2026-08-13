import sys
from pathlib import Path

# Make the backend package importable for pure unit tests (import simulation, etc.)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
