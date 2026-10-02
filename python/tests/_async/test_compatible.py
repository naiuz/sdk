import json

import httpx
import pytest

from naiuz import APIConnectionError, AsyncStream
from naiuz.types import (
    ChatCompletion,
    ChatCompletionChunk,
    CreateChatCompletionRequest,
    CreateEmbeddingRequest,
    EmbeddingResponse,
    ModelList,
    RerankRequest,
    RerankResponse,
)
from tests.helpers import MockAPI, api_error, body_of, json_response

from ._io import Body, events
from .clients import client_for, retry_classes

MODELS = {
    "object": "list",
    "data": [{"id": "gemma-4-26b-a4b", "object": "model", "created": 0, "owned_by": "neuronai"}],
}
EMBEDDINGS = {
    "object": "list",
    "model": "bge-m3",
    "data": [{"object": "embedding", "index": 0, "embedding": [0.1, -0.2]}],
    "usage": {"prompt_tokens": 4, "total_tokens": 4},
}
RANKED = {
    "id": "r1",
    "model": "bge-reranker-v2-m3",
    "results": [{"index": 1, "relevance_score": 0.9}, {"index": 0, "relevance_score": 0.2, "document": {"text": "d"}}],
    "meta": {"billed_units": {"search_units": 1, "input_tokens": 3}},
    "usage": {"prompt_tokens": 3, "total_tokens": 3},
}
COMPLETION = {
    "id": "chatcmpl-1",
    "object": "chat.completion",
    "created": 1790000000,
    "model": "gemma-4-26b-a4b",
    "choices": [{"index": 0, "message": {"role": "assistant", "content": "Salom!"}, "finish_reason": "stop"}],
    "usage": {"prompt_tokens": 9, "completion_tokens": 2, "total_tokens": 11},
}
HELLO: CreateChatCompletionRequest = {"model": "gemma-4-26b-a4b", "messages": [{"role": "user", "content": "Salom!"}]}
CHUNKS: list[dict[str, object]] = [
    {
        "id": "chatcmpl-1",
        "object": "chat.completion.chunk",
        "created": 1790000000,
        "model": "gemma-4-26b-a4b",
        "choices": [{"index": 0, "delta": {"role": "assistant", "content": "Salom"}, "finish_reason": None}],
    },
    {
        "id": "chatcmpl-1",
        "object": "chat.completion.chunk",
        "created": 1790000000,
        "model": "gemma-4-26b-a4b",
        "choices": [],
        "usage": {"prompt_tokens": 9, "completion_tokens": 2, "total_tokens": 11},
    },
]


def sse(*data: str) -> bytes:
    """An event stream's body: one event for each data."""
    return "".join(f"data: {each}\n\n" for each in data).encode()


async def read_into(chunks: list[ChatCompletionChunk], stream: AsyncStream[ChatCompletionChunk]) -> None:
    """Reads the stream, keeping each chunk, until it ends or fails."""
    async for chunk in stream:
        chunks.append(chunk)


async def test_models_list_returns_the_body_as_it_is_without_a_cost() -> None:
    api = MockAPI(json_response(200, MODELS))
    models = await client_for(api).models.list()
    assert isinstance(models, ModelList)
    assert (models.data[0].id, models.cost) == ("gemma-4-26b-a4b", None)
    assert models.model_dump() == MODELS
    assert (api.requests[0].method, api.requests[0].url.raw_path) == ("GET", b"/api/v1/models")


async def test_embeddings_create_returns_the_body_with_the_cost_from_x_cost() -> None:
    api = MockAPI(json_response(200, EMBEDDINGS, {"x-cost": "0.02"}))
    embeddings = await client_for(api).embeddings.create(model="bge-m3", input=["Salom", "Rahmat"])
    assert isinstance(embeddings, EmbeddingResponse)
    assert embeddings.cost == 0.02
    assert embeddings.model_dump() == EMBEDDINGS
    assert body_of(api.requests[0]) == {"model": "bge-m3", "input": ["Salom", "Rahmat"]}


async def test_rerank_create_returns_the_results_in_the_server_s_order_with_the_cost() -> None:
    api = MockAPI(json_response(200, RANKED, {"x-cost": "0.05"}))
    ranked = await client_for(api).rerank.create(model="bge-reranker-v2-m3", query="q", documents=["d", "e"], top_n=2)
    assert isinstance(ranked, RerankResponse)
    assert [result.index for result in ranked.results] == [1, 0]
    assert (ranked.results[0].document, ranked.cost) == (None, 0.05)
    assert body_of(api.requests[0]) == {
        "model": "bge-reranker-v2-m3",
        "query": "q",
        "documents": ["d", "e"],
        "top_n": 2,
    }


async def test_chat_completions_create_returns_the_completion_with_the_cost() -> None:
    api = MockAPI(json_response(200, COMPLETION, {"x-cost": "0.34"}))
    answer = await client_for(api).chat.completions.create(**HELLO)
    assert isinstance(answer, ChatCompletion)
    assert (answer.choices[0].message.content, answer.cost) == ("Salom!", 0.34)
    assert (api.requests[0].method, api.requests[0].url.raw_path) == ("POST", b"/api/v1/chat/completions")
    assert body_of(api.requests[0]) == HELLO


async def test_chat_completions_create_with_stream_true_returns_a_stream_of_chunks_asking_for_events() -> None:
    api = MockAPI(events(Body(sse(*(json.dumps(chunk) for chunk in CHUNKS), "[DONE]"))))
    stream = await client_for(api).chat.completions.create(model="m", messages=HELLO["messages"], stream=True)
    assert isinstance(stream, AsyncStream)
    chunks = [chunk async for chunk in stream]
    assert [chunk.model_dump() for chunk in chunks] == CHUNKS
    assert (chunks[0].choices[0].delta.content, chunks[0].usage) == ("Salom", None)
    assert chunks[1].usage is not None
    assert chunks[1].usage.total_tokens == 11
    sent = api.requests[0]
    assert sent.headers["accept"] == "text/event-stream, application/json"
    assert body_of(sent) == {"model": "m", "messages": HELLO["messages"], "stream": True}


async def test_a_stream_is_retried_like_any_completion_before_it_starts_and_never_once_it_has() -> None:
    dropped = httpx.RemoteProtocolError("peer closed connection without sending complete message body")
    started = events(Body(sse(json.dumps(CHUNKS[0])), error=dropped))
    api = MockAPI(api_error(503, "service_unavailable", {"retry-after": "0"}), started)
    stream = await client_for(api, max_retries=2).chat.completions.create(
        model="m", messages=HELLO["messages"], stream=True
    )
    chunks: list[ChatCompletionChunk] = []
    with pytest.raises(APIConnectionError):
        await read_into(chunks, stream)
    assert (len(chunks), len(api.requests)) == (1, 2)


async def test_chat_completions_create_types_its_result_by_stream() -> None:
    api = MockAPI(json_response(200, COMPLETION), events(Body(sse("[DONE]"))), json_response(200, COMPLETION))
    completions = client_for(api).chat.completions
    completion: ChatCompletion = await completions.create(model="m", messages=HELLO["messages"])
    stream: AsyncStream[ChatCompletionChunk] = await completions.create(
        model="m", messages=HELLO["messages"], stream=True
    )
    known_later = len(api.requests) > 9
    either: ChatCompletion | AsyncStream[ChatCompletionChunk] = await completions.create(
        model="m", messages=HELLO["messages"], stream=known_later
    )
    assert isinstance(completion, ChatCompletion)
    assert isinstance(stream, AsyncStream)
    assert isinstance(either, ChatCompletion)


async def test_the_compatible_calls_take_their_request_types_as_keyword_arguments() -> None:
    embed: CreateEmbeddingRequest = {"model": "bge-m3", "input": "Salom", "encoding_format": "float"}
    rank: RerankRequest = {"model": "m", "query": "q", "documents": ["d"], "return_documents": False}
    api = MockAPI(json_response(200, EMBEDDINGS), json_response(200, RANKED))
    client = client_for(api)
    await client.embeddings.create(**embed)
    await client.rerank.create(**rank)
    assert [body_of(request) for request in api.requests] == [embed, rank]


async def test_a_body_field_named_cost_stays_in_the_body_and_apart_from_the_price() -> None:
    api = MockAPI(json_response(200, {**COMPLETION, "cost": 111}, {"x-cost": "999"}))
    answer = await client_for(api).chat.completions.create(**HELLO)
    assert isinstance(answer, ChatCompletion)
    assert answer.cost == 999
    assert answer.model_dump()["cost"] == 111


async def test_a_paid_call_is_retried_after_a_5xx_in_the_api_s_envelope() -> None:
    api = MockAPI(api_error(503, "service_unavailable", {"retry-after": "0"}), json_response(200, COMPLETION))
    await client_for(api, max_retries=1).chat.completions.create(**HELLO)
    assert len(api.requests) == 2


async def test_models_is_a_safe_call_and_the_rest_are_paid(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = retry_classes(monkeypatch)
    client = client_for(
        MockAPI(
            json_response(200, MODELS),
            json_response(200, EMBEDDINGS),
            json_response(200, RANKED),
            json_response(200, COMPLETION),
        )
    )
    await client.models.list()
    await client.embeddings.create(model="m", input="x")
    await client.rerank.create(model="m", query="q", documents=["d"])
    await client.chat.completions.create(**HELLO)
    assert seen == ["safe", "paid", "paid", "paid"]


async def test_with_raw_response_gives_a_compatible_result_with_its_status_and_headers() -> None:
    api = MockAPI(json_response(200, COMPLETION, {"x-cost": "0.34", "x-request-id": "req-chat"}))
    raw = await client_for(api).chat.completions.with_raw_response.create(**HELLO)
    assert isinstance(raw.data, ChatCompletion)
    assert (raw.data.cost, raw.status, raw.headers["x-request-id"]) == (0.34, 200, "req-chat")


async def test_chat_completions_create_sends_every_field_it_is_given() -> None:
    api = MockAPI(json_response(200, COMPLETION))
    await client_for(api).chat.completions.create(
        model="gemma-4-26b-a4b",
        messages=[{"role": "user", "content": "Salom!"}],
        max_tokens=64,
        temperature=None,
        top_p=0.9,
        stop=["\n\n"],
        stream=False,
    )
    assert body_of(api.requests[0]) == {
        "model": "gemma-4-26b-a4b",
        "messages": [{"role": "user", "content": "Salom!"}],
        "max_tokens": 64,
        "temperature": None,
        "top_p": 0.9,
        "stop": ["\n\n"],
        "stream": False,
    }
