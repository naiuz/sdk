"""How the async client's wait for a job ends: at its deadline, even mid-poll, or when its task is cancelled."""

import asyncio
import time

import httpx
import pytest

from naiuz import AsyncNeuronAI, WaitTimeoutError
from tests._async._io import GIVE_UP
from tests.helpers import KEY, envelope

JOB = {
    "id": "job-1",
    "status": "queued",
    "created_at": "2026-09-28T10:00:00Z",
    "started_at": None,
    "finished_at": None,
    "character_count": 5,
    "cost": None,
    "balance_after": None,
    "voice_custom": False,
    "latency_ms": None,
    "error": None,
    "audio_url": None,
}


def client_answering_once(sent: list[httpx.Request]) -> AsyncNeuronAI:
    """A client whose API queues the job, then doesn't answer another request: one left waiting fails the test after
    GIVE_UP seconds, so a wait that stops abandoning its poll fails rather than hangs."""

    async def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        if len(sent) == 1:
            return envelope(JOB, "req-create", 202)
        await asyncio.sleep(GIVE_UP)
        raise AssertionError(f"The poll waited {GIVE_UP:g} s: nothing abandoned it.")

    return AsyncNeuronAI(api_key=KEY, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_the_wait_abandons_a_poll_still_in_flight_at_its_deadline() -> None:
    sent: list[httpx.Request] = []
    started = time.monotonic()
    with pytest.raises(WaitTimeoutError) as caught:
        await client_answering_once(sent).tts.jobs.create_and_wait(text="Salom", timeout=0.3, poll_interval=0.1)
    assert time.monotonic() - started < 2
    assert caught.value.job.status == "queued"
    assert len(sent) == 2


@pytest.mark.parametrize("after", [0.05, 0.2], ids=["between polls", "during a poll"])
async def test_cancelling_the_task_ends_the_wait_at_once(after: float) -> None:
    sent: list[httpx.Request] = []
    jobs = client_answering_once(sent).tts.jobs
    task = asyncio.create_task(jobs.create_and_wait(text="Salom", timeout=30, poll_interval=0.1))
    await asyncio.sleep(after)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert len(sent) == (1 if after < 0.1 else 2)
