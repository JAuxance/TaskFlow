import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.deletion_log import reapply_recorded_deletions

reapply_recorded_deletions()
