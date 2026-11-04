# Written by scripts/unasync.py from src/naiuz/_async/resources/conversations.py. Edit that file, then run the script.
"""Your organization's conversations, and carrying one on a channel of your own."""

from __future__ import annotations

from collections.abc import Mapping

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_envelope, read_speech_audio
from ...types.audio import SpeechAudio
from ...types.conversations import (
    Conversation,
    ConversationContactParam,
    ConversationMessage,
    ConversationTranscript,
    SentConversationMessage,
    StartedConversation,
)
from .._http import HttpClient
from .._io import Page, paginate, to_raw
from .._resource import APIResource

AUDIO = "audio/ogg, application/json"
"""What a recording call accepts: the audio, or an error in the API's JSON envelope."""


class ConversationMessages(APIResource):
    """What's said in a conversation."""

    @property
    def with_raw_response(self) -> ConversationMessagesWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return ConversationMessagesWithRawResponse(self)

    def create(
        self,
        conversation: str,
        *,
        client_message_id: str,
        text: str,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> SentConversationMessage:
        """Stores what the customer said and answers at once, and the agent's reply reaches you by webhook.

        After the conversation has ended it goes on in the next one, and `conversation_id` says which.

        Args:
            client_message_id: Your own id for this message: letters, digits, `_` and `-`, up to 64. Sending it
                again stores it once.
            text: What the customer said, up to 10,000 characters.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(client_message_id=client_message_id, text=text)
        request = APIRequest(
            "POST",
            "/conversations/{conversation}/messages",
            "safe",
            path_params={"conversation": conversation},
            body=body,
            options=options,
        )
        return self._http.request(request, read_envelope(SentConversationMessage))

    def list(
        self,
        conversation: str,
        *,
        after: str | int | None = None,
        limit: int | None = None,
        cursor: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Page[ConversationMessage]:
        """What's been said, oldest first, from wherever you got to.

        Use it to catch up on anything a webhook missed.

        Args:
            after: The message to read on from.
            limit: How many, from 1 to 100 (50 when left out).
            cursor: A page's `next_cursor`, to start from the page after it.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        query = {"after": after, "limit": limit, "cursor": cursor}
        return paginate(
            self._http,
            APIRequest(
                "GET",
                "/conversations/{conversation}/messages",
                "safe",
                path_params={"conversation": conversation},
                query=query,
                options=options,
            ),
            ConversationMessage,
        )


class ConversationMessagesWithRawResponse:
    """ConversationMessages: these methods, each returning a RawResponse: the result with its status and headers."""

    def __init__(self, messages: ConversationMessages) -> None:
        self.create = to_raw(messages.create)
        self.list = to_raw(messages.list)


class Conversations(APIResource):
    """Your organization's conversations, and carrying one on a channel of your own."""

    messages: ConversationMessages
    """What's said in a conversation."""

    def __init__(self, http: HttpClient) -> None:
        super().__init__(http)
        self.messages = ConversationMessages(http)

    @property
    def with_raw_response(self) -> ConversationsWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return ConversationsWithRawResponse(self)

    def list(
        self,
        *,
        agent_id: str | None = None,
        status: str | None = None,
        limit: int | None = None,
        cursor: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Page[Conversation]:
        """Your organization's conversations from every channel, newest first.

        Loop over the result for every one, each page fetched when the loop reaches it.

        Args:
            agent_id: Only this agent's.
            status: Only those in this status, such as `resolved`.
            limit: How many, from 1 to 100 (50 when left out).
            cursor: A page's `next_cursor`, to start from the page after it.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        query = {"agent_id": agent_id, "status": status, "limit": limit, "cursor": cursor}
        return paginate(
            self._http, APIRequest("GET", "/conversations", "safe", query=query, options=options), Conversation
        )

    def retrieve(
        self,
        conversation: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Conversation:
        """One conversation, with its variables, summary and cost, and whether it has audio."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest(
            "GET", "/conversations/{conversation}", "safe", path_params={"conversation": conversation}, options=options
        )
        return self._http.request(request, read_envelope(Conversation))

    def transcript(
        self,
        conversation: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> ConversationTranscript:
        """What the customer, the agent and operators said, all in one answer."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest(
            "GET",
            "/conversations/{conversation}/transcript",
            "safe",
            path_params={"conversation": conversation},
            options=options,
        )
        return self._http.request(request, read_envelope(ConversationTranscript))

    def audio(
        self,
        conversation: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> SpeechAudio:
        """The recording of a call, as Ogg Opus.

        No recording, or one past its time, raises NotFound.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest(
            "GET",
            "/conversations/{conversation}/audio",
            "safe",
            path_params={"conversation": conversation},
            accept=AUDIO,
            options=options,
        )
        return self._http.request(request, read_speech_audio)

    def create(
        self,
        *,
        agent_id: str,
        contact: ConversationContactParam | NotGiven = NOT_GIVEN,
        variables: Mapping[str, str | int | float | bool] | NotGiven = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> StartedConversation:
        """A conversation on a channel of your own.

        Nothing is sent until the customer says something, and then the agent's first message and its answer reach
        you by webhook.

        Args:
            agent_id: The agent that answers.
            contact: Who it's with.
            variables: Values for the agent's `{{variables}}`.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(agent_id=agent_id, contact=contact, variables=variables)
        request = APIRequest("POST", "/conversations", "once", body=body, options=options)
        return self._http.request(request, read_envelope(StartedConversation))


class ConversationsWithRawResponse:
    """Conversations: these methods, each returning a RawResponse: the result with its status and headers."""

    def __init__(self, conversations: Conversations) -> None:
        self.list = to_raw(conversations.list)
        self.retrieve = to_raw(conversations.retrieve)
        self.transcript = to_raw(conversations.transcript)
        self.audio = to_raw(conversations.audio)
        self.create = to_raw(conversations.create)
        self.messages = ConversationMessagesWithRawResponse(conversations.messages)
