<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\RawResponse;
use Naiuz\Types\DialogueAudio;
use Naiuz\Types\SpeechAudio;

/**
 * Text to speech's methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type SynthesizeSpeechRequest from TtsJobs
 * @phpstan-import-type SynthesizeDialogueRequest from Tts
 * @phpstan-import-type IdempotentCallOptions from RequestOptions
 */
readonly class TtsWithRawResponse
{
    /** Synthesis jobs. */
    public TtsJobsWithRawResponse $jobs;

    /** @internal */
    public function __construct(private HttpClient $http)
    {
        $this->jobs = new TtsJobsWithRawResponse($http);
    }

    /**
     * @param SynthesizeSpeechRequest $params
     * @param IdempotentCallOptions $options
     *
     * @return RawResponse<SpeechAudio>
     */
    public function synthesize(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): SpeechAudio => (new Tts($http))->synthesize($params, $options));
    }

    /**
     * @param SynthesizeDialogueRequest $params
     * @param IdempotentCallOptions $options
     *
     * @return RawResponse<DialogueAudio>
     */
    public function dialogue(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): DialogueAudio => (new Tts($http))->dialogue($params, $options));
    }
}
