<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Types\TtsJob;

/**
 * Synthesis jobs: queue a long text, then poll the job until it finishes.
 *
 * @phpstan-type SpeechLanguage 'uz'|'ru'|'en'|'kk'|'ky'|'tk'|'tg'|'az'|'tr'|'ug'|'tt'|'ba'|'hy'|'ka'|'uk'|'be'|'zh'|'ja'|'ko'|'mn'|'id'|'vi'|'th'|'hi'|'bn'|'ur'|'fa'|'arb'|'de'|'fr'|'es'|'pt'|'it'|'nl'|'sv'|'pl'
 * @phpstan-type SpeechQuality 'fast'|'standard'|'high'
 * @phpstan-type SynthesizeSpeechRequest array{text: string, voice_id?: string|null, language?: SpeechLanguage|null, quality?: SpeechQuality|null, speed?: float|int|null}
 * @phpstan-import-type CallOptions from RequestOptions
 * @phpstan-import-type IdempotentCallOptions from RequestOptions
 */
readonly class TtsJobs
{
    private const SYNTHESIZE_SPEECH_REQUEST = ['text', 'voice_id', 'language', 'quality', 'speed'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * Queues a synthesis, and returns the job at once, whether the API answers 202 (queued) or 200 (a replay).
     *
     * Poll retrieve() until status is `succeeded` or `failed`; the charge lands only when the job succeeds. Every call
     * sends an Idempotency-Key, the idempotency_key option or a generated one, the same on each retry, so a retry
     * never queues a second job: the same key again returns the job it created, whatever its state.
     *
     * @param SynthesizeSpeechRequest $params
     *     - text: the text to speak. Length is measured as spoken length, the same measure billing uses: an emotion
     *       tag counts as one character, however long its name is spelled.
     *     - voice_id: the voice to speak with, up to 128 characters.
     *     - language: the text's language.
     *     - quality: `fast`, `standard` or `high`.
     *     - speed: from 0.5 to 2.
     * @param IdempotentCallOptions $options idempotency_key: sent as the Idempotency-Key header, at most 191
     *     characters. Null or '' sends a generated UUIDv4.
     */
    public function create(array $params, array $options = []): TtsJob
    {
        $body = Params::check('tts->jobs->create', $params, self::SYNTHESIZE_SPEECH_REQUEST);
        $request = new APIRequest('POST', '/tts/jobs', RetryClass::Idempotent, body: $body, options: RequestOptions::from($options, idempotent: true));

        return $this->http->request($request, Readers::envelope(TtsJob::from(...)));
    }

    /**
     * The job and where it stands: `queued`, `running`, `succeeded` or `failed`. A final state never changes.
     *
     * @param CallOptions $options
     */
    public function retrieve(string $id, array $options = []): TtsJob
    {
        $request = new APIRequest('GET', '/tts/jobs/{id}', RetryClass::Safe, ['id' => $id], options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(TtsJob::from(...)));
    }
}
