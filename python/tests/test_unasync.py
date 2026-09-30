from pathlib import Path

import pytest
import unasync


def test_the_sync_code_is_the_one_the_async_code_makes() -> None:
    assert unasync.stale() == [], "The sync code is stale. Run: uv run python scripts/unasync.py"


def test_it_drops_async_and_await() -> None:
    source = (
        "async def read(response):\n"
        "    async with response as body:\n"
        "        async for chunk in body.aiter_bytes():\n"
        "            await body.aclose()\n"
        "    first = await anext(aiter(response))\n"
        "    return [item async for item in response], await response.aread()\n"
    )
    assert unasync.unasync(source) == (
        "def read(response):\n"
        "    with response as body:\n"
        "        for chunk in body.iter_bytes():\n"
        "            body.close()\n"
        "    first = next(iter(response))\n"
        "    return [item for item in response], response.read()\n"
    )


def test_it_renames_what_the_sync_code_spells_differently() -> None:
    source = (
        "from naiuz._async._http import AsyncHttpClient\n"
        "from collections.abc import AsyncIterator\n"
        "def pages(self) -> AsyncPaginator[AsyncPage[Voice]]:\n"
        "    raise StopAsyncIteration\n"
        "class AsyncVoices:\n"
        "    def __aiter__(self) -> AsyncIterator[Voice]: ...\n"
        "    async def __aenter__(self) -> 'AsyncVoices': ...\n"
    )
    assert unasync.unasync(source) == (
        "from naiuz._sync._http import HttpClient\n"
        "from collections.abc import Iterator\n"
        "def pages(self) -> Page[Page[Voice]]:\n"
        "    raise StopIteration\n"
        "class Voices:\n"
        "    def __iter__(self) -> Iterator[Voice]: ...\n"
        "    def __enter__(self) -> 'Voices': ...\n"
    )


def test_it_leaves_other_names_strings_f_strings_and_comments_alone() -> None:
    source = (
        "import asyncio\n"
        "Asyncify = 'AsyncPage docs: await it'  # async for AsyncPage\n"
        'label = f"{AsyncPage.__name__} async"\n'
        '"""Loop over it with async for, or await it."""\n'
    )
    assert unasync.unasync(source) == source


@pytest.fixture
def tree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A python/ directory with one async module, whose sync twin isn't written yet."""
    (tmp_path / "src/naiuz/_async").mkdir(parents=True)
    (tmp_path / "src/naiuz/_async/_page.py").write_text("async def first(): ...\n")
    (tmp_path / "src/naiuz/_async/_io.py").write_text("async def sleep(): ...\n")
    (tmp_path / "src/naiuz/_sync").mkdir(parents=True)
    (tmp_path / "src/naiuz/_sync/_io.py").write_text("def sleep(): ...\n")
    monkeypatch.setattr(unasync, "ROOT", tmp_path)
    return tmp_path


def test_it_writes_each_sync_twin_with_its_header_but_never_an_io_file(tree: Path) -> None:
    assert unasync.stale() == ["src/naiuz/_sync/_page.py"]
    assert unasync.main([]) == 0
    assert (tree / "src/naiuz/_sync/_page.py").read_text() == (
        "# Written by scripts/unasync.py from src/naiuz/_async/_page.py. Edit that file, then run the script.\n"
        "def first(): ...\n"
    )
    assert (tree / "src/naiuz/_sync/_io.py").read_text() == "def sleep(): ...\n"
    assert unasync.stale() == []
    assert unasync.main(["--check"]) == 0


def test_check_reports_a_twin_edited_by_hand_and_one_without_a_source(tree: Path) -> None:
    unasync.main([])
    (tree / "src/naiuz/_sync/_page.py").write_text("def first(): return 1\n")
    (tree / "src/naiuz/_sync/_gone.py").write_text("")
    assert unasync.main(["--check"]) == 1
    assert unasync.stale() == ["src/naiuz/_sync/_gone.py", "src/naiuz/_sync/_page.py"]
    unasync.main([])
    assert not (tree / "src/naiuz/_sync/_gone.py").exists()
    assert unasync.stale() == []
