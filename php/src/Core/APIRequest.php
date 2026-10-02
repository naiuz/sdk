<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * One API call, as a resource describes it to the HTTP core.
 *
 * @internal
 */
final readonly class APIRequest
{
    /**
     * @param 'GET'|'POST'|'PATCH'|'DELETE' $method
     * @param string $path The path under the base URL, with `{name}` for each path parameter, such as
     *     `/tts/voices/{id}`.
     * @param RetryClass $retry Which failures are retried, and whether an Idempotency-Key is sent (Idempotent).
     * @param array<string, mixed> $pathParams
     * @param array<string, mixed> $query Nulls are left out.
     * @param array<string, mixed>|null $body Sent as a JSON object, unless null.
     * @param string $accept What the call takes back: JSON, unless it answers with something else, such as audio.
     */
    public function __construct(
        public string $method,
        public string $path,
        public RetryClass $retry,
        public array $pathParams = [],
        public array $query = [],
        public ?array $body = null,
        public string $accept = 'application/json',
        public RequestOptions $options = new RequestOptions(),
    ) {}

    /**
     * The same call, with these query values over its own.
     *
     * @param array<string, mixed> $query
     */
    public function withQuery(array $query): self
    {
        return new self($this->method, $this->path, $this->retry, $this->pathParams, [...$this->query, ...$query], $this->body, $this->accept, $this->options);
    }
}
