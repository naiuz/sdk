import re
from importlib.metadata import requires, version
from pathlib import Path

import naiuz

PYTHON_DIR = Path(__file__).resolve().parent.parent


def test_the_package_reports_the_version_pyproject_declares() -> None:
    declared = re.search(r'^version = "([^"]+)"$', (PYTHON_DIR / "pyproject.toml").read_text(), re.MULTILINE)
    assert declared is not None
    assert naiuz.__version__ == declared.group(1) == version("naiuz")


def test_the_runtime_dependencies_are_httpx_and_pydantic_only() -> None:
    names = {re.split(r"[<>=!~;\[ ]", requirement, maxsplit=1)[0] for requirement in requires("naiuz") or []}
    assert names == {"httpx", "pydantic"}


def test_the_package_is_typed() -> None:
    assert (Path(naiuz.__file__).parent / "py.typed").is_file()


def test_the_license_is_the_repository_s() -> None:
    assert (PYTHON_DIR / "LICENSE").read_text() == (PYTHON_DIR.parent / "LICENSE").read_text()
