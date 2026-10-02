"""What both clients' streams share: splitting a stream of server-sent events into each event's data."""

from __future__ import annotations

import re

MAX_DRAIN_SECONDS = 5.0
"""How long, at most, a stream reads on after `[DONE]` to let its answer end cleanly, however long the timeout."""

_LINE_END = re.compile(r"\r\n|\r|\n")


class SSEDecoder:
    """Splits a stream of server-sent events into each event's data, as the HTML standard parses one.

    A line ends at CRLF, LF or CR. Each `data` field adds a line to the event's data, and a blank line ends the event.
    Comments and other fields are skipped. An event the stream's end cuts off is dropped.
    """

    def __init__(self) -> None:
        self._pending = ""
        self._data: list[str] = []

    def push(self, text: str) -> list[str]:
        """Takes the next piece of the stream's text, and returns the data of each event it completes."""
        self._pending += text
        events: list[str] = []
        while True:
            end = _LINE_END.search(self._pending)
            # A CR at the very end may be the first half of a CRLF: wait for the next piece.
            if end is None or (end.group() == "\r" and end.end() == len(self._pending)):
                return events
            line = self._pending[: end.start()]
            self._pending = self._pending[end.end() :]
            if line == "":
                if self._data:
                    events.append("\n".join(self._data))
                self._data = []
            elif line == "data" or line.startswith("data:"):
                value = line[5:]
                self._data.append(value[1:] if value.startswith(" ") else value)
