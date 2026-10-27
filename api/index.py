import os
import sys
from pathlib import Path

# Configure paths so FastAPI app and modules load seamlessly
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "digitwin-healthcare" / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

if os.environ.get("VERCEL"):
    os.environ.setdefault("DIGITWIN_DB", "/tmp/digitwin.db")

from app.main import app
