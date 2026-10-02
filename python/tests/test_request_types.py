"""Each request type names exactly the fields its method takes as keyword arguments."""

import inspect
from typing import Any

import pytest

from naiuz import AsyncNeuronAI, NeuronAI
from naiuz.types import (
    CreateApiKeyRequest,
    CreateChatCompletionRequest,
    CreateEmbeddingRequest,
    RerankRequest,
    SynthesizeDialogueRequest,
    SynthesizeSpeechRequest,
    UpdateApiKeyRequest,
    UpdateVoiceRequest,
)
from tests.helpers import KEY

OPTIONS = {"timeout", "max_retries", "extra_headers", "idempotency_key"}

REQUEST_TYPES: list[tuple[Any, str]] = [
    (SynthesizeSpeechRequest, "tts.synthesize"),
    (SynthesizeDialogueRequest, "tts.dialogue"),
    (SynthesizeSpeechRequest, "tts.jobs.create"),
    (UpdateVoiceRequest, "voices.update"),
    (CreateApiKeyRequest, "api_keys.create"),
    (UpdateApiKeyRequest, "api_keys.update"),
    (CreateChatCompletionRequest, "chat.completions.create"),
    (CreateEmbeddingRequest, "embeddings.create"),
    (RerankRequest, "rerank.create"),
]


@pytest.mark.parametrize("client_class", [NeuronAI, AsyncNeuronAI])
@pytest.mark.parametrize(("request_type", "method"), REQUEST_TYPES)
def test_a_request_type_names_exactly_its_method_s_fields(client_class: Any, request_type: Any, method: str) -> None:
    target: Any = client_class(api_key=KEY)
    for name in method.split("."):
        target = getattr(target, name)
    parameters = inspect.signature(target).parameters
    fields = {name for name, parameter in parameters.items() if parameter.kind is inspect.Parameter.KEYWORD_ONLY}
    required = {name for name in fields if parameters[name].default is inspect.Parameter.empty}
    assert set(request_type.__annotations__) == fields - OPTIONS
    assert request_type.__required_keys__ == required
