import re
from importlib.metadata import metadata, requires, version
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


def test_the_package_s_long_description_is_its_readme() -> None:
    assert re.search(r'^readme = "README\.md"$', (PYTHON_DIR / "pyproject.toml").read_text(), re.MULTILINE)
    assert metadata("naiuz")["Description-Content-Type"] == "text/markdown"
    assert (PYTHON_DIR / "README.md").read_text().startswith("# NeuronAI Python SDK\n")


def test_pypi_s_page_links_the_sdk_s_folder_of_the_github_repository() -> None:
    entries: list[str] = metadata("naiuz").get_all("Project-URL") or []
    urls = {label: url for label, _, url in (entry.partition(", ") for entry in entries)}
    assert urls == {
        "Homepage": "https://github.com/naiuz/sdk/tree/main/python",
        "Documentation": "https://github.com/naiuz/sdk/blob/main/python/api.md",
        "Repository": "https://github.com/naiuz/sdk",
        "Issues": "https://github.com/naiuz/sdk/issues",
        "Changelog": "https://github.com/naiuz/sdk/blob/main/python/CHANGELOG.md",
    }
    assert "neuronai" in (metadata("naiuz")["Keywords"] or "").split(",")


def test_the_readme_links_api_md_and_the_examples_by_github_urls_which_pypi_s_page_can_follow() -> None:
    readme = (PYTHON_DIR / "README.md").read_text()
    assert "[api.md](https://github.com/naiuz/sdk/blob/main/python/api.md)" in readme
    assert "[examples/](https://github.com/naiuz/sdk/tree/main/python/examples)" in readme
    assert [target for target in re.findall(r"\]\(([^)]*)\)", readme) if not target.startswith("https://")] == []
