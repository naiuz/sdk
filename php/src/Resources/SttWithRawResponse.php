<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\RawResponse;
use Naiuz\Types\Transcription;

/**
 * Speech to text's methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type CreateTranscriptionRequest from Stt
 * @phpstan-import-type IdempotentCallOptions from RequestOptions
 */
readonly class SttWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param CreateTranscriptionRequest $params
     * @param IdempotentCallOptions $options
     *
     * @return RawResponse<Transcription>
     */
    public function transcribe(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Transcription => (new Stt($http))->transcribe($params, $options));
    }
}
