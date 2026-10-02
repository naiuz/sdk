<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\RawResponse;
use Naiuz\Types\SpeechAudio;
use Naiuz\Types\TtsJob;

/**
 * The synthesis jobs' methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type SynthesizeSpeechRequest from TtsJobs
 * @phpstan-import-type CallOptions from RequestOptions
 * @phpstan-import-type IdempotentCallOptions from RequestOptions
 */
readonly class TtsJobsWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param SynthesizeSpeechRequest $params
     * @param IdempotentCallOptions $options
     *
     * @return RawResponse<TtsJob>
     */
    public function create(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): TtsJob => (new TtsJobs($http))->create($params, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<TtsJob>
     */
    public function retrieve(string $id, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): TtsJob => (new TtsJobs($http))->retrieve($id, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<SpeechAudio>
     */
    public function audio(string $id, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): SpeechAudio => (new TtsJobs($http))->audio($id, $options));
    }
}
