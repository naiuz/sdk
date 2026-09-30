from typing import Literal

from naiuz import BaseModel
from naiuz._models import COST, REQUEST_ID, WithCost, WithRequestId
from naiuz.types import ErrorEnvelope


class Tag(BaseModel):
    label: str
    weight: float | None = None


class Voice(WithRequestId):
    id: str
    type: Literal["custom", "stock"] | str
    category: str | None = None
    tag: Tag | None = None


class Answer(WithCost):
    id: str


def test_it_keeps_a_field_the_sdk_doesn_t_know_and_dumps_it() -> None:
    voice = Voice.model_validate({"id": "v1", "type": "stock", "gender": "female", "tag": {"label": "x", "new": 1}})
    assert voice.model_extra == {"gender": "female"}
    assert voice.model_dump() == {"id": "v1", "type": "stock", "gender": "female", "tag": {"label": "x", "new": 1}}


def test_it_takes_an_enum_value_the_sdk_doesn_t_know_yet_as_a_string() -> None:
    assert Voice.model_validate({"id": "v1", "type": "brand_new"}).type == "brand_new"


def test_it_dumps_exactly_the_fields_the_answer_held_a_null_as_null() -> None:
    voice = Voice.model_validate({"id": "v1", "type": "stock", "category": None, "tag": {"label": "x"}})
    assert voice.category is None
    assert voice.model_dump() == {"id": "v1", "type": "stock", "category": None, "tag": {"label": "x"}}
    assert voice.model_dump_json() == '{"id":"v1","type":"stock","category":null,"tag":{"label":"x"}}'


def test_the_request_id_is_attached_but_is_not_a_field() -> None:
    voice = Voice.model_validate({"id": "v1", "type": "stock"}, context={REQUEST_ID: "req-1"})
    assert voice.request_id == "req-1"
    assert voice.model_dump() == {"id": "v1", "type": "stock"}
    assert "req-1" not in voice.model_dump_json()
    assert "req-1" not in repr(voice)
    assert voice == Voice(id="v1", type="stock")
    assert Voice(id="v1", type="stock").request_id is None


def test_the_cost_is_attached_but_is_not_a_field() -> None:
    answer = Answer.model_validate({"id": "chatcmpl-1"}, context={COST: 0.34})
    assert answer.cost == 0.34
    assert answer.model_dump_json() == '{"id":"chatcmpl-1"}'
    assert Answer.model_validate({"id": "chatcmpl-1"}).cost is None


def test_objects_compare_by_what_the_api_sent() -> None:
    assert Tag(label="x") == Tag.model_validate({"label": "x"})
    assert Tag(label="x") != Tag(label="x", weight=None)
    assert Tag(label="x") != Tag(label="y")
    assert Tag(label="x") != "x"


def test_an_error_answer_s_body_reads_as_an_error_envelope() -> None:
    body = {
        "error": {"type": "invalid_request_error", "code": "invalid_request", "message": "No.", "param": "text"},
        "request_id": "req-1",
    }
    envelope = ErrorEnvelope.model_validate(body)
    assert (envelope.error.code, envelope.error.fields, envelope.request_id) == ("invalid_request", None, "req-1")
    assert envelope.model_dump() == body
