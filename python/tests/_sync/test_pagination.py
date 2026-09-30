# Written by scripts/unasync.py from tests/_async/test_pagination.py. Edit that file, then run the script.
import httpx
import pytest

from naiuz import APIError, InternalServerError, NeuronAIError
from naiuz._sync._io import paginate
from naiuz._sync._pagination import Page
from naiuz._models import BaseModel
from naiuz._request import APIRequest, RequestOptions
from tests.helpers import MockAPI, api_error, json_response

from .clients import http_client


class Item(BaseModel):
    id: str


list_voices = APIRequest(
    "GET",
    "/tts/voices",
    "safe",
    query={"type": "custom", "limit": 2},
    options=RequestOptions(extra_headers={"x-trace": "t1"}),
)


def page(ids: list[str], next_cursor: str | None, request_id: str = "req-page") -> httpx.Response:
    body = {"data": [{"id": item} for item in ids], "next_cursor": next_cursor, "request_id": request_id}
    return json_response(200, body, {"x-request-id": request_id})


def test_a_list_call_gives_its_first_page_its_items_cursor_and_request_id() -> None:
    first = paginate(http_client(MockAPI(page(["a", "b"], "cursor-2")))[0], list_voices, Item)
    assert isinstance(first, Page)
    assert first.data == [Item(id="a"), Item(id="b")]
    assert (first.next_cursor, first.request_id, first.has_next_page()) == ("cursor-2", "req-page", True)


def test_next_page_sends_the_same_query_and_options_with_the_cursor() -> None:
    api = MockAPI(page(["a", "b"], "cursor-2"), page(["c"], None, "req-2"))
    first = paginate(http_client(api)[0], list_voices, Item)
    second = first.next_page()
    assert [item.id for item in second.data] == ["c"]
    assert (second.request_id, second.has_next_page()) == ("req-2", False)
    assert api.requests[1].url.params.multi_items() == [("type", "custom"), ("limit", "2"), ("cursor", "cursor-2")]
    assert api.requests[1].headers["x-trace"] == "t1"


def test_next_page_on_the_last_page_raises_and_sends_nothing() -> None:
    api = MockAPI(page(["a"], None))
    last = paginate(http_client(api)[0], list_voices, Item)
    with pytest.raises(NeuronAIError, match=r"^This is the last page: check has_next_page\(\) before calling"):
        last.next_page()
    assert len(api.requests) == 1


def test_an_empty_cursor_marks_the_last_page() -> None:
    assert not (paginate(http_client(MockAPI(page(["a"], "")))[0], list_voices, Item)).has_next_page()


def test_looping_walks_every_item_across_pages() -> None:
    api = MockAPI(page(["a", "b"], "cursor-2"), page(["c", "d"], "cursor-3"), page(["e"], None))
    assert [item.id for item in paginate(http_client(api)[0], list_voices, Item)] == ["a", "b", "c", "d", "e"]
    assert [request.url.params.get("cursor") for request in api.requests] == [None, "cursor-2", "cursor-3"]


def test_a_page_is_fetched_only_when_the_loop_reaches_it() -> None:
    api = MockAPI(page(["a", "b"], "cursor-2"), page(["c"], None))
    items = iter(paginate(http_client(api)[0], list_voices, Item))
    next(items)
    next(items)
    assert len(api.requests) == 1
    next(items)
    assert len(api.requests) == 2


def test_looping_over_a_page_in_hand_walks_on_from_it() -> None:
    first = paginate(http_client(MockAPI(page(["a"], "cursor-2"), page(["b"], None)))[0], list_voices, Item)
    assert [item.id for item in first] == ["a", "b"]


def test_a_page_that_fails_stops_the_walk_with_its_error() -> None:
    http, _ = http_client(MockAPI(page(["a"], "cursor-2"), api_error(500, "server_error")), max_retries=0)
    ids: list[str] = []

    def walk() -> None:
        for item in paginate(http, list_voices, Item):
            ids.append(item.id)

    with pytest.raises(InternalServerError):
        walk()
    assert ids == ["a"]


def test_an_answer_without_a_data_list_raises_api_error() -> None:
    body = {"data": {"id": "a"}, "next_cursor": None, "request_id": "r"}
    with pytest.raises(APIError):
        paginate(http_client(MockAPI(json_response(200, body)))[0], list_voices, Item)


def test_a_page_prints_its_items_cursor_and_request_id() -> None:
    first = paginate(http_client(MockAPI(page(["a"], None)))[0], list_voices, Item)
    assert repr(first) == f"{type(first).__name__}(data=[Item(id='a')], next_cursor=None, request_id='req-page')"
