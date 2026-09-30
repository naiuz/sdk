"""The repo's spec/ directory: the contract the SDK is tested against."""

import json
from pathlib import Path
from typing import Any

SPEC_DIR = Path(__file__).resolve().parents[2] / "spec"


def read_spec(path: str) -> Any:
    """A JSON file under spec/, parsed."""
    return json.loads((SPEC_DIR / path).read_text(encoding="utf-8"))
