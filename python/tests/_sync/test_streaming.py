# Written by scripts/unasync.py from tests/_async/test_streaming.py. Edit that file, then run the script.
import json
import time

import httpx
import pytest

from naiuz import APIConnectionError, APIError, APITimeoutError, NeuronAIError
from naiuz._sync._http import HttpClient
from naiuz._sync._streaming import Stream, read_stream
from naiuz._models import BaseModel
from naiuz._request import APIRequest
from tests.helpers import KEY, MockAPI, json_response, silent_server

from ._io import Body, events, settle
from .clients import http_client


class Chunk(BaseModel):
    """Any chunk."""


streamed = APIRequest("POST", "/chat/completions", "paid", body={"stream": True}, accept="text/event-stream")
read_chunks = read_stream(Chunk)
UPSTREAM_ERROR = json.dumps(
    {
        "error": {"type": "server_error", "code": "upstream_error", "message": "The model failed.", "param": None},
        "request_id": "req-event",
    }
)


def chunk(n: int) -> str:
    return json.dumps({"object": "chat.completion.chunk", "n": n})


def sse(*data: str) -> bytes:
    """An event stream's body: one event for each data."""
    return "".join(f"data: {each}\n\n" for each in data).encode()


def opened(body: Body, timeout: float = 1.0) -> Stream[Chunk]:
    """The stream of a call whose answer is an event stream with `body`."""
    http, _ = http_client(MockAPI(events(body)), timeout=timeout)
    return http.request(streamed, read_chunks)


def collect(stream: Stream[Chunk]) -> tuple[list[dict[str, object]], NeuronAIError | None]:
    """Every chunk a loop over the stream gets, and the error that ends it, if any."""
    chunks: list[dict[str, object]] = []
    try:
        for item in stream:
            chunks.append(item.model_dump())
    except NeuronAIError as error:
        return chunks, error
    return chunks, None


def test_it_yields_each_event_s_chunk_and_ends_at_done_whatever_follows_it() -> None:
    stream = opened(Body(sse(chunk(1), chunk(2), "[DONE]", chunk(3))))
    assert collect(stream) == ([json.loads(chunk(1)), json.loads(chunk(2))], None)


def test_after_done_it_reads_the_answer_to_its_end_so_its_connection_can_be_reused() -> None:
    body = Body(sse(chunk(1), "[DONE]"), b": a comment after [DONE]\n")
    assert collect(opened(body)) == ([json.loads(chunk(1))], None)
    assert (body.finished, body.closed) == (True, True)


def test_after_done_it_stops_reading_at_its_bound_without_an_error() -> None:
    body = Body(sse(chunk(1), "[DONE]"), gap=0.02, forever=True)
    started = time.monotonic()
    assert collect(opened(body, timeout=0.2)) == ([json.loads(chunk(1))], None)
    assert time.monotonic() - started < 2
    assert (body.finished, body.closed) == (False, True)


def test_an_error_event_raises_api_error_with_the_status_200_after_the_chunks_before_it() -> None:
    chunks, error = collect(opened(Body(sse(chunk(1), UPSTREAM_ERROR, "[DONE]"))))
    assert chunks == [json.loads(chunk(1))]
    assert type(error) is APIError
    assert (error.status, error.type, error.code) == (200, "server_error", "upstream_error")
    assert (error.message, error.request_id) == ("The model failed.", "req-event")


def test_an_event_that_isn_t_a_json_object_raises_api_error_with_the_key_redacted() -> None:
    _, error = collect(opened(Body(sse(f"not json {KEY}", "[DONE]"))))
    assert isinstance(error, APIError)
    assert (error.status, error.code, error.message) == (200, None, "OK: not json [redacted]")


def test_a_stream_that_ends_before_done_raises_api_connection_error() -> None:
    chunks, error = collect(opened(Body(sse(chunk(1)))))
    assert len(chunks) == 1
    assert type(error) is APIConnectionError
    assert str(error) == "The stream ended before [DONE]: the answer may be cut short."


def test_a_connection_that_drops_mid_stream_raises_api_connection_error_saying_what_failed() -> None:
    dropped = httpx.RemoteProtocolError("peer closed connection without sending complete message body")
    chunks, error = collect(opened(Body(sse(chunk(1)), error=dropped)))
    assert len(chunks) == 1
    assert isinstance(error, APIConnectionError)
    assert str(error) == (
        "The connection failed while the response arrived: peer closed connection without sending complete message body"
    )


def test_it_decodes_a_character_whose_bytes_two_pieces_split() -> None:
    encoded = sse(json.dumps({"text": "Salom 👋"}, ensure_ascii=False), "[DONE]")
    split = encoded.index("👋".encode()) + 2
    stream = opened(Body(encoded[:split], encoded[split:]))
    assert collect(stream) == ([{"text": "Salom 👋"}], None)


def test_breaking_out_of_a_loop_aborts_the_request() -> None:
    body = Body(sse(chunk(1), chunk(2)))
    stream = opened(body)
    for item in stream:
        assert item.model_dump() == json.loads(chunk(1))
        break
    settle()
    # The stream is still held here: leaving the loop closed it, not the stream going away.
    assert stream is not None
    assert (body.closed, body.finished) == (True, False)


def test_close_aborts_the_request_and_the_loop_reading_the_stream_ends_quietly() -> None:
    body = Body(sse(chunk(1), chunk(2), chunk(3)))
    stream = opened(body)
    chunks: list[Chunk] = []
    for item in stream:
        chunks.append(item)
        stream.close()
    stream.close()
    assert len(chunks) == 1
    assert (body.closed, body.finished) == (True, False)


def test_a_with_block_gives_the_stream_and_closes_it_on_the_way_out() -> None:
    body = Body(sse(chunk(1), chunk(2), "[DONE]"))
    with opened(body) as stream:
        assert isinstance(stream, Stream)
    assert (body.closed, body.finished) == (True, False)


def test_a_stream_can_be_read_once() -> None:
    stream = opened(Body(sse(chunk(1), "[DONE]")))
    collect(stream)
    _, error = collect(stream)
    assert type(error) is NeuronAIError
    assert str(error) == "This stream has already been read: a stream can be read once."


def test_a_success_that_isn_t_an_event_stream_raises_api_error_and_is_closed() -> None:
    body = Body(b'{"id": "chatcmpl-1"}')
    http, _ = http_client(MockAPI(httpx.Response(200, headers={"content-type": "application/json"}, stream=body)))
    with pytest.raises(APIError) as caught:
        http.request(streamed, read_chunks)
    assert (caught.value.status, caught.value.code, caught.value.message) == (200, None, 'OK: {"id": "chatcmpl-1"}')
    assert body.closed


def test_an_error_answer_is_raised_as_usual_and_never_streamed() -> None:
    http, _ = http_client(MockAPI(json_response(404, {"error": {"code": "not_found", "message": "No."}})))
    with pytest.raises(APIError) as caught:
        http.request(streamed, read_chunks)
    assert (caught.value.status, caught.value.code) == (404, "not_found")


def test_the_timeout_bounds_each_piece_of_a_stream_not_the_whole_of_it() -> None:
    head = b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\r\n"
    pieces = [sse(chunk(n)) for n in range(1, 6)]
    with silent_server(head, *pieces, gap=0.15) as base_url:
        with httpx.Client(trust_env=False) as client:
            http = HttpClient(
                api_key=KEY,
                base_url=base_url,
                timeout=0.4,
                max_retries=0,
                default_headers={},
                user_agent="naiuz-python/test",
                client=client,
            )
            started = time.monotonic()
            chunks, error = collect(http.request(streamed, read_chunks))
            assert time.monotonic() - started < 3
    assert len(chunks) == 5
    assert isinstance(error, APITimeoutError)
    assert str(error) == "No part of the stream arrived within 0.4 s."
