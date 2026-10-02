<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Exceptions\NeuronAIException;

/**
 * The options every method takes for its own call, as its last argument.
 *
 * @phpstan-type CallOptions array{timeout?: float|int, max_retries?: int, extra_headers?: array<string, string>}
 * @phpstan-type IdempotentCallOptions array{timeout?: float|int, max_retries?: int, extra_headers?: array<string, string>, idempotency_key?: string|null}
 *
 * @internal
 */
final readonly class RequestOptions
{
    /**
     * @param float|null $timeout Seconds each attempt may take, reading the answer included. Null keeps the client's.
     * @param int|null $maxRetries How many times a failed attempt may be retried. Null keeps the client's.
     * @param array<string, string> $extraHeaders Headers for this call. They go on last, over the SDK's own, the
     *     client's default_headers and the Idempotency-Key.
     * @param string|null $idempotencyKey The Idempotency-Key of an idempotent call. Null or '' sends a generated UUIDv4.
     */
    public function __construct(
        public ?float $timeout = null,
        public ?int $maxRetries = null,
        public array $extraHeaders = [],
        public ?string $idempotencyKey = null,
    ) {}

    /**
     * A call's options, checked. An option the call doesn't take, or a value of the wrong kind, throws
     * NeuronAIException before anything is sent; a null keeps the client's.
     *
     * @param array<mixed> $options
     */
    public static function from(array $options, bool $idempotent = false): self
    {
        $known = $idempotent ? ['timeout', 'max_retries', 'extra_headers', 'idempotency_key'] : ['timeout', 'max_retries', 'extra_headers'];
        foreach (array_keys($options) as $name) {
            if (!in_array($name, $known, true)) {
                throw new NeuronAIException(sprintf('Unknown option "%s": a call takes %s.', $name, Params::listing($known, 'and')));
            }
        }
        $key = $options['idempotency_key'] ?? null;
        if ($key !== null && !is_string($key)) {
            throw new NeuronAIException('idempotency_key must be a string.');
        }

        return new self(
            isset($options['timeout']) ? Options::checkTimeout($options['timeout']) : null,
            isset($options['max_retries']) ? Options::checkMaxRetries($options['max_retries']) : null,
            Headers::check($options['extra_headers'] ?? [], 'extra_headers'),
            $key,
        );
    }
}
