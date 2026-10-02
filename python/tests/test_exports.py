from typing import Any

import pytest

import naiuz
import naiuz.resources
import naiuz.types
from naiuz import AsyncNeuronAI, NeuronAI
from tests.helpers import KEY

RESOURCES = {
    "account": "Account",
    "voices": "Voices",
    "tts": "Tts",
    "tts.jobs": "TtsJobs",
    "stt": "Stt",
    "api_keys": "ApiKeys",
    "models": "Models",
    "embeddings": "Embeddings",
    "rerank": "Rerank",
    "chat": "Chat",
    "chat.completions": "Completions",
}


def test_every_name_the_package_exports_exists() -> None:
    for module in (naiuz, naiuz.types, naiuz.resources):
        for name in module.__all__:
            assert hasattr(module, name), f"{module.__name__}.{name}"


@pytest.mark.parametrize(("client_class", "prefix"), [(NeuronAI, ""), (AsyncNeuronAI, "Async")])
def test_the_resources_module_names_the_class_of_every_resource(client_class: Any, prefix: str) -> None:
    client = client_class(api_key=KEY)
    for path, name in RESOURCES.items():
        resource = client
        for part in path.split("."):
            resource = getattr(resource, part)
        assert type(resource) is getattr(naiuz.resources, prefix + name), path
