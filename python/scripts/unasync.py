"""Writes the sync code from the async code.

The async client is the source of truth: `src/naiuz/_async/` and its tests in `tests/_async/`. This script writes
their sync twins, `src/naiuz/_sync/` and `tests/_sync/`, token by token: it drops `async` and `await`, and renames
what differs, such as `AsyncPage` to `Page` and `aclose` to `close`. Strings, f-strings and comments stay as they
are, so a docstring is written to fit both clients. A file named `_io.py` is written by hand on each side: it holds
what the two can't share, such as how to sleep.

Run it after changing the async code: `uv run python scripts/unasync.py`. With `--check` it writes nothing, and exits
1 when a sync file is missing, out of date, or has no async source.
"""

from __future__ import annotations

import re
import sys
import tokenize
from io import StringIO
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
"""The Python package's directory, `python/`."""

TREES = (("src/naiuz/_async", "src/naiuz/_sync"), ("tests/_async", "tests/_sync"))
"""Each async directory, and the directory its sync twin is written to."""

HAND_WRITTEN = "_io.py"
"""The file each side writes by hand: it is never generated, and never reported as stale."""

RENAMES = {
    "AsyncPaginator": "Page",
    "StopAsyncIteration": "StopIteration",
    "__aenter__": "__enter__",
    "__aexit__": "__exit__",
    "__aiter__": "__iter__",
    "__anext__": "__next__",
    "_async": "_sync",
    "aclose": "close",
    "aiter": "iter",
    "aiter_bytes": "iter_bytes",
    "anext": "next",
    "aread": "read",
    "asynccontextmanager": "contextmanager",
}
"""Names the sync code spells differently. Any other name that starts with `Async` and a capital loses the prefix."""

PREFIXED = re.compile(r"Async([A-Z]\w*)")
IDENTIFIER = re.compile(r"[A-Za-z_]\w*")
HEADER = "# Written by scripts/unasync.py from {source}. Edit that file, then run the script.\n"
FSTRING_START = getattr(tokenize, "FSTRING_START", None)
FSTRING_END = getattr(tokenize, "FSTRING_END", None)


def rename(name: str) -> str:
    """A name as the sync code spells it."""
    if name in RENAMES:
        return RENAMES[name]
    match = PREFIXED.fullmatch(name)
    return match.group(1) if match else name


def unasync(source: str) -> str:
    """The sync twin of one async module's source."""
    starts = [0]
    for line in source.splitlines(keepends=True):
        starts.append(starts[-1] + len(line))

    def offset(position: tuple[int, int]) -> int:
        return starts[position[0] - 1] + position[1]

    tokens = list(tokenize.generate_tokens(StringIO(source).readline))
    edits: list[tuple[int, int, str]] = []
    depth = 0  # f-string nesting: an f-string, from Python 3.12 made of several tokens, is copied as it is
    for index, token in enumerate(tokens):
        if token.type == FSTRING_START:
            depth += 1
        elif token.type == FSTRING_END:
            depth -= 1
        elif depth > 0:
            continue
        elif token.type == tokenize.NAME and token.string in ("async", "await"):
            following = tokens[index + 1]
            # Drop the keyword and the space after it, so `await x` becomes `x`.
            upto = following.start if following.start[0] == token.end[0] else token.end
            edits.append((offset(token.start), offset(upto), ""))
        elif token.type == tokenize.NAME and rename(token.string) != token.string:
            edits.append((offset(token.start), offset(token.end), rename(token.string)))
        elif token.type == tokenize.STRING and IDENTIFIER.fullmatch(token.string[1:-1]):
            # A name in quotes, such as a forward reference, is a name too.
            renamed = token.string[0] + rename(token.string[1:-1]) + token.string[-1]
            if renamed != token.string:
                edits.append((offset(token.start), offset(token.end), renamed))
    for start, end, text in reversed(edits):
        source = source[:start] + text + source[end:]
    return source


def expected() -> dict[Path, str]:
    """Every sync file the async code makes, with the text it must hold."""
    files: dict[Path, str] = {}
    for async_dir, sync_dir in TREES:
        if not (ROOT / async_dir).is_dir():
            continue
        for path in sorted((ROOT / async_dir).rglob("*.py")):
            if path.name == HAND_WRITTEN:
                continue
            relative = path.relative_to(ROOT / async_dir)
            header = HEADER.format(source=(Path(async_dir) / relative).as_posix())
            files[ROOT / sync_dir / relative] = header + unasync(path.read_text(encoding="utf-8"))
    return files


def orphans(files: dict[Path, str]) -> list[Path]:
    """Sync files that no async file makes, other than the hand-written ones."""
    found: list[Path] = []
    for _, sync_dir in TREES:
        if (ROOT / sync_dir).is_dir():
            found += (path for path in (ROOT / sync_dir).rglob("*.py") if path.name != HAND_WRITTEN)
    return [path for path in found if path not in files]


def stale() -> list[str]:
    """The sync files that are missing, out of date or orphaned, relative to `python/`, sorted."""
    files = expected()
    problems = [path for path, text in files.items() if not path.is_file() or path.read_text(encoding="utf-8") != text]
    return sorted(path.relative_to(ROOT).as_posix() for path in problems + orphans(files))


def write() -> list[str]:
    """Writes every stale sync file and deletes the orphaned ones. Returns what changed, relative to `python/`."""
    changed = stale()
    files = expected()
    for path in orphans(files):
        path.unlink()
    for path, text in files.items():
        if not path.is_file() or path.read_text(encoding="utf-8") != text:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
    return changed


def main(arguments: list[str]) -> int:
    """Writes the sync code; with `--check`, reports what is stale instead."""
    if arguments == ["--check"]:
        problems = stale()
        for problem in problems:
            print(f"stale: {problem}")
        if problems:
            print("Run: uv run python scripts/unasync.py")
        return 1 if problems else 0
    if arguments:
        print("usage: python scripts/unasync.py [--check]")
        return 2
    for path in write():
        print(f"wrote: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
