"""Generates the agents protocol's voice fixtures from a simulated call, so their runs of audio,
playback reports and state changes follow the engine's real pacing.

The server's playout follows app/voice/playout.py: 20 ms frames, never more than 400 ms ahead of
real time, paused and dropped as the session says, idle once what it sent has played. The client
follows @naiuz/agents' Call: from the metadata on, the microphone sends a frame every 20 ms, and a
clock ticks every 250 ms, reporting the reply in front when its position moved. It also reports
at a pause and at an interruption, always, and when a reply's audio runs out, if that moved it.
It plays what it received in real time. Latency is zero, so both sides share one clock.

Whatever changes the audio happens on the microphone's 20 ms grid, so a replay that counts time
in microphone frames reproduces every report.

    python3 spec/scripts/voice-fixtures.py           writes spec/agents/fixtures/voice-*.json
    python3 spec/scripts/voice-fixtures.py --check   fails when they differ from what it makes
"""

import json
import pathlib
import sys
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

FRAME = 20
AHEAD = 400
REPORT_EVERY = 250
BASE = datetime(2026, 10, 30, 9, 15, 0, tzinfo=timezone.utc)
CONVERSATION = "conv_01JB8Z5R4Q6Y2N7K3M9D0F1H3K"
TOKENS = {
    n: "eyJhbGciOiJFZERTQSIsImtpZCI6ImUxIiwidHlwIjoiSldUIn0."
    "eyJjb252IjoiY29udl8wMUpCOFo1UjRRNlkyTjdLM005RDBGMUgzSyIsImp0aSI6Imp0aS0" + jti + "."
    "c2lnbmF0dXJlLT" + sig
    for n, jti, sig in [(1, "xIn0", "E"), (2, "yIn0", "I"), (3, "zIn0", "M"), (4, "0In0", "Q")]
}


def at(t: int) -> str:
    stamp = BASE + timedelta(milliseconds=t)
    return stamp.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def init(output: str) -> dict:
    return {
        "type": "conversation_initiation_client_data",
        "text_only": False,
        "audio": {"input": "pcm_16000", "output": output},
    }


def metadata(output: str, n: int) -> dict:
    return {
        "type": "conversation_initiation_metadata",
        "conversation_id": CONVERSATION,
        "resume_token": TOKENS[n],
        "status": "ai_handling",
        "languages": ["uz", "ru", "en"],
        "language": "uz",
        "features": {"text": True, "voice": True, "debug": False},
        "audio": {"input": "pcm_16000", "output": output},
    }


HISTORY = {
    "type": "conversation_history",
    "messages": [
        {
            "role": "customer",
            "text": "Buyurtmam qayerda?",
            "at": "2026-10-30T09:12:41.120Z",
            "message_id": 981,
            "client_message_id": None,
        },
        {
            "role": "agent",
            "text": "Buyurtmangiz yoʻlda, bugun omborga keldi.",
            "at": "2026-10-30T09:12:43.480Z",
            "message_id": 982,
            "client_message_id": None,
        },
    ],
}


def state(name: str) -> dict:
    return {"type": "agent_state", "state": name}


def part(event_id: int, kind: str, text: str = "") -> dict:
    return {
        "type": "agent_chat_response_part",
        "event_id": event_id,
        "text_response_part": {"type": kind, "text": text},
    }


def transcript(t: int, text: str) -> dict:
    return {"type": "user_transcript", "text": text, "language": "uz", "occurred_at": at(t)}


# The order of what happens at one millisecond: the microphone's frame, the client's clock and a
# reply running out (a replay's timers fire before the events it delivers), the server's event,
# the client's report on it, the server's audio, then a close.
MIC, TICK, END, EVENT, REACTION, AGENT, CLOSE = range(7)


@dataclass
class Simulated:
    items: list[tuple[int, int, dict]]
    idle_at: list[int]
    played: dict[int, int]


@dataclass
class Call:
    """One connection: the scripted events, and the audio simulated around them."""

    mic_from: int | None
    events: list[tuple[int, int, dict]] = field(default_factory=list)
    controls: dict[int, list[tuple[str, int, int]]] = field(default_factory=dict)

    def event(self, t: int, side: str, frame: dict) -> None:
        self.events.append((t, EVENT, {"from": side, "frame": frame}))

    def close(self, t: int, code: int, reason: str) -> None:
        self.events.append((t, CLOSE, {"from": "server", "close": {"code": code, "reason": reason}}))

    def enqueue(self, t: int, event_id: int, ms: int) -> None:
        self.controls.setdefault(t, []).append(("enqueue", event_id, ms))

    def pause(self, t: int, event_id: int) -> None:
        self.event(t, "server", {"type": "audio_pause", "event_id": event_id})
        self.controls.setdefault(t, []).append(("pause", event_id, 0))

    def resume(self, t: int, event_id: int) -> None:
        self.event(t, "server", {"type": "audio_resume", "event_id": event_id})
        self.controls.setdefault(t, []).append(("resume", event_id, 0))

    def interrupt(self, t: int, event_id: int) -> None:
        self.event(t, "server", {"type": "interruption", "event_id": event_id})
        self.controls.setdefault(t, []).append(("drop", event_id, 0))

    def simulate(self, until: int) -> Simulated:
        items: list[tuple[int, int, dict]] = []
        idle_at: list[int] = []
        played: dict[int, int] = {}
        # The server's playout.
        queued: deque[int] = deque()
        paused = False
        started: int | None = None
        stretch = held = 0
        idle = True
        # The client's player: the frames it holds, in order, and how far into the first.
        held_frames: deque[int] = deque()
        into = 0
        stopped = False
        reported: dict[int, int] = {}

        def ahead(now: int) -> int:
            return 0 if started is None else max(0, stretch - (now - started))

        def report(now: int, priority: int, event_id: int, always: bool = False) -> None:
            position = played.get(event_id, 0)
            if not always and reported.get(event_id) == position:
                return
            reported[event_id] = position
            frame = {"type": "playback", "event_id": event_id, "played_ms": position}
            items.append((now, priority, {"from": "client", "frame": frame}))

        for now in range(until + 1):
            for action, event_id, ms in self.controls.get(now, []):
                if action == "enqueue":
                    queued.extend([event_id] * (ms // FRAME))
                    idle = False
                elif action == "pause":
                    paused, held, started = True, ahead(now), None
                    stopped = True
                    report(now, REACTION, event_id, always=True)
                elif action == "resume":
                    paused, started, stretch = False, now, held
                    stopped = False
                elif action == "drop":
                    queued.clear()
                    paused, started, held, idle = False, None, 0, True
                    report(now, REACTION, event_id, always=True)
                    held_frames.clear()
                    into = 0
                    stopped = False
            while queued and not paused:
                if started is None:
                    started, stretch = now, 0
                if ahead(now) + FRAME > AHEAD:
                    break
                event_id = queued.popleft()
                stretch += FRAME
                held_frames.append(event_id)
                audio = {"kind": "agent", "event_id": event_id, "ms": FRAME}
                items.append((now, AGENT, {"from": "server", "audio": audio}))
            if not queued and not paused and not idle and ahead(now) == 0:
                started, idle = None, True
                idle_at.append(now)
            since = None if self.mic_from is None else now - self.mic_from
            if since is not None and since > 0 and since % FRAME == 0:
                items.append((now, MIC, {"from": "client", "audio": {"kind": "user", "ms": FRAME}}))
            if since is not None and since > 0 and since % REPORT_EVERY == 0 and held_frames:
                report(now, TICK, held_frames[0])
            if stopped or not held_frames:
                continue
            event_id = held_frames[0]
            played[event_id] = played.get(event_id, 0) + 1
            into += 1
            if into == FRAME:
                held_frames.popleft()
                into = 0
                if not held_frames or held_frames[0] != event_id:
                    report(now + 1, END, event_id)
        return Simulated(items, idle_at, played)

    def fixture(self, description: str, kind: str, until: int) -> dict:
        simulated = self.simulate(until)
        entries: list[dict] = []
        runs: dict[tuple[str, int], dict] = {}
        sequence = 0
        for t, _, entry in sorted([*self.events, *simulated.items], key=lambda item: item[:2]):
            if t > until:
                continue
            audio = entry.get("audio")
            if audio is None:
                entries.extend(runs.values())
                runs.clear()
                entries.append(entry)
                continue
            key = (audio["kind"], audio.get("event_id", 0))
            if key in runs:
                run = runs[key]["audio"]
                run["count"] = run.get("count", 1) + 1
            elif audio["kind"] == "user":
                audio = {"kind": "user", "sequence": sequence, "ms": FRAME}
                runs[key] = {"from": "client", "audio": audio}
            else:
                runs[key] = {"from": "server", "audio": dict(audio)}
            if audio["kind"] == "user":
                sequence += 1
        entries.extend(runs.values())
        return {"description": description, "token": kind, "frames": entries}


def voice_call() -> dict:
    call = Call(mic_from=60)
    call.event(0, "client", init("pcm_24000"))
    call.event(60, "server", metadata("pcm_24000", 1))
    greeting = {"type": "agent_response", "event_id": 1, "text": "Assalomu alaykum! Eshitaman."}
    call.event(61, "server", greeting)
    call.event(160, "server", state("speaking"))
    call.enqueue(160, 1, 1700)
    # The customer speaks from 2.0 s to 3.2 s, and 700 ms of quiet ends the turn.
    call.event(3905, "server", transcript(3905, "Yetkazib berish qancha turadi?"))
    call.event(3906, "server", state("thinking"))
    call.event(3940, "server", {"type": "agent_typing"})
    call.event(4300, "server", part(2, "start"))
    call.event(4300, "server", part(2, "delta", "Toshkent boʻylab"))
    call.event(4360, "server", part(2, "delta", " yetkazib berish bepul."))
    call.event(4380, "server", part(2, "stop"))
    reply = {"type": "agent_response", "event_id": 2, "text": "Toshkent boʻylab yetkazib berish bepul."}
    call.event(4380, "server", reply)
    # The sentence's end has nothing after it, so speech starts once the reply is whole.
    call.event(4540, "server", state("speaking"))
    call.enqueue(4540, 2, 2000)
    first, second = call.simulate(8000).idle_at
    call.event(first, "server", state("listening"))
    call.event(second, "server", state("listening"))
    return call.fixture(
        "A voice call on a new conversation: the spoken first message, the customer's turn "
        "(1.2 s of speech, then 700 ms of quiet), and the spoken reply. The microphone streams "
        "from the metadata on, the agent's audio runs up to 400 ms ahead of real time, and "
        "playback is reported every 250 ms and at each reply's end.",
        "session",
        second,
    )


def voice_interruption() -> tuple[dict, dict[int, int]]:
    call = Call(mic_from=50)
    call.event(0, "client", init("pcm_16000"))
    call.event(50, "server", metadata("pcm_16000", 2))
    call.event(51, "server", HISTORY)
    call.event(52, "server", state("listening"))
    # "Qachon yetib keladi?" from 0.4 s to 1.4 s.
    call.event(2105, "server", state("thinking"))
    call.event(2106, "server", transcript(2106, "Qachon yetib keladi?"))
    call.event(2130, "server", {"type": "agent_typing"})
    call.event(2500, "server", part(3, "start"))
    call.event(2500, "server", part(3, "delta", "Buyurtmangiz ertaga yetkaziladi, "))
    call.event(2560, "server", part(3, "delta", "kuryer sizga oldindan qoʻngʻiroq qiladi."))
    call.event(2600, "server", part(3, "stop"))
    text = "Buyurtmangiz ertaga yetkaziladi, kuryer sizga oldindan qoʻngʻiroq qiladi."
    call.event(2600, "server", {"type": "agent_response", "event_id": 3, "text": text})
    # The first chunk ends at the comma; the second is synthesised while the first plays.
    call.event(2650, "server", state("speaking"))
    call.enqueue(2650, 3, 1800)
    call.enqueue(2810, 3, 2200)
    # A cough from 4.2 s to 4.5 s: 250 ms of it pauses the reply, and its empty transcript,
    # once 700 ms of quiet ends it, resumes it.
    call.pause(4450, 3)
    call.resume(5210, 3)
    # Words from 5.6 s to 7.7 s: 250 ms pauses the reply, 1.5 s interrupts it.
    call.pause(5850, 3)
    call.interrupt(7110, 3)
    played = call.simulate(7110).played
    heard = heard_text(played[3], [(0, 1800, "Buyurtmangiz ertaga yetkaziladi,"), (1800, 2200, "kuryer sizga oldindan qoʻngʻiroq qiladi.")])
    call.event(7112, "server", {"type": "agent_response_correction", "event_id": 3, "text": heard})
    call.event(7113, "server", state("listening"))
    call.event(8405, "server", transcript(8405, "Kechirasiz, manzilni oʻzgartirsam boʻladimi?"))
    call.event(8406, "server", state("thinking"))
    call.event(8440, "server", {"type": "agent_typing"})
    return (
        call.fixture(
            "A resumed voice call: the customer's question and the spoken reply. A cough over "
            "the reply pauses it, and its empty transcript resumes it. Then the customer's "
            "words pause it and, after 1.5 s of speech, interrupt it: the reply is cut to what "
            "was heard, and the customer's turn goes on.",
            "resume",
            8440,
        ),
        played,
    )


def heard_text(played: int, chunks: list[tuple[int, int, str]]) -> str:
    """As app/voice/playout.py's heard_text: whole chunks, then the played share of the next."""
    heard = []
    for start, duration, text in chunks:
        if played >= start + duration:
            heard.append(text)
            continue
        if played > start:
            cut = int(len(text) * (played - start) / duration)
            prefix = text[:cut]
            if cut < len(text) and not text[cut].isspace():
                prefix = prefix.rsplit(" ", 1)[0] if " " in prefix else ""
            if prefix.strip():
                heard.append(prefix.strip())
        break
    return " ".join(heard)


def voice_takeover() -> dict:
    call = Call(mic_from=50)
    call.event(0, "client", init("pcm_24000"))
    call.event(50, "server", metadata("pcm_24000", 3))
    call.event(51, "server", HISTORY)
    call.event(52, "server", state("listening"))
    call.close(3000, 4008, "taken_over")
    return call.fixture(
        "A resumed voice call that another connection takes over, as when the customer starts "
        "the call on another device: this connection's call ends with 4008, and the "
        "conversation goes on in the other one.",
        "resume",
        3000,
    )


def voice_max_duration() -> dict:
    call = Call(mic_from=50)
    call.event(0, "client", init("pcm_24000"))
    call.event(50, "server", metadata("pcm_24000", 4))
    call.event(51, "server", HISTORY)
    call.event(52, "server", state("listening"))
    for n in (1, 2, 3):
        call.event(52 + 15_000 * n + 1, "server", {"type": "ping", "event_id": n})
        call.event(52 + 15_000 * n + 8, "client", {"type": "pong", "event_id": n})
    call.close(60_060, 1000, "max_duration")
    return call.fixture(
        "A resumed voice call that reaches the agent's max duration, 60 s here, while the agent "
        "listens: the server closes with 1000 max_duration and no conversation_ended, and the "
        "conversation goes on as chat.",
        "resume",
        60_060,
    )


def refused(code: int, reason: str, description: str) -> dict:
    call = Call(mic_from=None)
    call.event(0, "client", init("pcm_24000"))
    call.close(40, code, reason)
    return call.fixture(description, "session", 40)


if __name__ == "__main__":
    out = pathlib.Path(__file__).resolve().parent.parent / "agents" / "fixtures"
    interruption, played = voice_interruption()
    fixtures = {
        "voice-call.json": voice_call(),
        "voice-interruption.json": interruption,
        "voice-takeover.json": voice_takeover(),
        "voice-max-duration.json": voice_max_duration(),
        "voice-limit.json": refused(
            4009,
            "voice_limit",
            "A voice call when every voice line is busy, the organization's or the platform's: "
            "the server closes with 4009 before the metadata. The client offers text instead.",
        ),
        "voice-not-allowed.json": refused(
            4003,
            "not_allowed",
            "A voice call with a token that doesn't allow voice: the server closes with 4003 "
            "before the metadata.",
        ),
        "voice-refused.json": refused(
            4010,
            "balance",
            "A voice call the balance can't cover one minute of: the server closes with 4010 "
            "before the metadata.",
        ),
    }
    stale = []
    for name, fixture in fixtures.items():
        text = json.dumps(fixture, indent=2, ensure_ascii=False) + "\n"
        if "--check" not in sys.argv:
            (out / name).write_text(text)
        elif not (out / name).exists() or (out / name).read_text() != text:
            stale.append(name)
    if stale:
        sys.exit(f"out of date, run python3 spec/scripts/voice-fixtures.py: {', '.join(stale)}")
