"""Each request type names exactly the fields its method takes as keyword arguments."""

import inspect
from typing import Any

import pytest

from naiuz import AsyncNeuronAI, NeuronAI
from naiuz.types import (
    CreateAgentRequest,
    CreateApiKeyRequest,
    CreateChatCompletionRequest,
    CreateConversationMessageRequest,
    CreateConversationRequest,
    CreateEmbeddingRequest,
    CreateFileDocumentRequest,
    CreateLinkDocumentRequest,
    CreateQaDocumentRequest,
    CreateTextDocumentRequest,
    CreateTranscriptionRequest,
    CreateVoiceRequest,
    CreateWebhookEndpointRequest,
    PublishAgentRequest,
    ReplaceVoiceAudioRequest,
    RerankRequest,
    SaveToolRequest,
    SynthesizeDialogueRequest,
    SynthesizeSpeechRequest,
    UpdateAgentRequest,
    UpdateApiKeyRequest,
    UpdateDocumentRequest,
    UpdateVoiceRequest,
    UpdateWebhookEndpointRequest,
)
from tests.helpers import KEY

OPTIONS = {"timeout", "max_retries", "extra_headers", "idempotency_key", "poll_interval"}

REQUEST_TYPES: list[tuple[Any, str]] = [
    (SynthesizeSpeechRequest, "tts.synthesize"),
    (SynthesizeDialogueRequest, "tts.dialogue"),
    (SynthesizeSpeechRequest, "tts.jobs.create"),
    (SynthesizeSpeechRequest, "tts.jobs.create_and_wait"),
    (CreateVoiceRequest, "voices.create"),
    (UpdateVoiceRequest, "voices.update"),
    (ReplaceVoiceAudioRequest, "voices.replace_audio"),
    (CreateTranscriptionRequest, "stt.transcribe"),
    (CreateApiKeyRequest, "api_keys.create"),
    (UpdateApiKeyRequest, "api_keys.update"),
    (CreateChatCompletionRequest, "chat.completions.create"),
    (CreateEmbeddingRequest, "embeddings.create"),
    (RerankRequest, "rerank.create"),
    (CreateAgentRequest, "agents.create"),
    (UpdateAgentRequest, "agents.update"),
    (PublishAgentRequest, "agents.publish"),
    (CreateConversationRequest, "conversations.create"),
    (CreateConversationMessageRequest, "conversations.messages.create"),
    (CreateTextDocumentRequest, "knowledge_base.create_text"),
    (CreateQaDocumentRequest, "knowledge_base.create_qa"),
    (CreateLinkDocumentRequest, "knowledge_base.create_link"),
    (CreateFileDocumentRequest, "knowledge_base.create_file"),
    (UpdateDocumentRequest, "knowledge_base.update"),
    (SaveToolRequest, "tools.create"),
    (SaveToolRequest, "tools.update"),
    (CreateWebhookEndpointRequest, "webhooks.create"),
    (UpdateWebhookEndpointRequest, "webhooks.update"),
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
