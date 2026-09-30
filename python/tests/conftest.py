import pytest


@pytest.fixture(autouse=True)
def _no_neuronai_environment(monkeypatch: pytest.MonkeyPatch) -> None:  # pyright: ignore[reportUnusedFunction]
    """A developer's own NEURONAI_* variables must not reach the tests."""
    monkeypatch.delenv("NEURONAI_API_KEY", raising=False)
    monkeypatch.delenv("NEURONAI_BASE_URL", raising=False)
