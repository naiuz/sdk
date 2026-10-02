<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Options;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Core\RetryPolicy;
use Naiuz\Core\StatusFailure;
use Naiuz\Exceptions\APIConnectionException;
use Naiuz\Exceptions\APIException;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Exceptions\RateLimitException;
use Naiuz\Exceptions\WaitTimeoutException;
use Naiuz\Types\SpeechAudio;
use Naiuz\Types\TtsJob;
use Naiuz\Types\TtsJobStatus;

/**
 * Synthesis jobs: queue a long text, then poll the job until it finishes.
 *
 * @phpstan-type SpeechLanguage 'uz'|'ru'|'en'|'kk'|'ky'|'tk'|'tg'|'az'|'tr'|'ug'|'tt'|'ba'|'hy'|'ka'|'uk'|'be'|'zh'|'ja'|'ko'|'mn'|'id'|'vi'|'th'|'hi'|'bn'|'ur'|'fa'|'arb'|'de'|'fr'|'es'|'pt'|'it'|'nl'|'sv'|'pl'
 * @phpstan-type SpeechQuality 'fast'|'standard'|'high'
 * @phpstan-type SynthesizeSpeechRequest array{text: string, voice_id?: string|null, language?: SpeechLanguage|null, quality?: SpeechQuality|null, speed?: float|int|null}
 * @phpstan-type WaitOptions array{poll_interval?: float|int, timeout?: float|int, idempotency_key?: string|null, max_retries?: int, extra_headers?: array<string, string>}
 * @phpstan-import-type CallOptions from RequestOptions
 * @phpstan-import-type IdempotentCallOptions from RequestOptions
 */
readonly class TtsJobs
{
    /**
     * The keys SynthesizeSpeechRequest names, which tts->synthesize() takes too.
     *
     * @internal
     */
    public const SYNTHESIZE_SPEECH_REQUEST = ['text', 'voice_id', 'language', 'quality', 'speed'];

    private const WAIT_OPTIONS = ['poll_interval', 'timeout', 'idempotency_key', 'max_retries', 'extra_headers'];

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

    /**
     * Creates a job, polls it until it has `succeeded` or `failed`, and returns it in either state.
     *
     * Check status, then fetch a succeeded job's WAV with audio($job->id). A poll that fails with a connection error, a
     * timeout, or a 429, 500, 502, 503 or 504 doesn't end the wait: it is tried again at the next interval, or after a
     * 429's longer retry_after. Any other exception is thrown at once. When the wait's timeout runs out first, it throws
     * WaitTimeoutException, which carries the job as last seen: the job may still finish. Pass your own
     * idempotency_key: calling again with it and the same text picks up the same job, instead of queuing and billing a
     * second one.
     *
     * @param SynthesizeSpeechRequest $params As create() takes them.
     * @param WaitOptions $options
     *     - poll_interval: seconds between polls: 2 by default.
     *     - timeout: seconds to wait for the job to finish, counted from when it is created: 600 (10 minutes) by
     *       default. Each request keeps the client's own timeout, cut to the time left.
     *     - idempotency_key: the create's Idempotency-Key, at most 191 characters. Null or '' sends a generated
     *       UUIDv4.
     *     - max_retries: how many times the create may be retried. Each poll is one attempt: a failed one is tried
     *       again at the next interval.
     *     - extra_headers: headers for every request of the wait.
     *
     * @throws WaitTimeoutException when the wait runs out before the job finishes
     */
    public function createAndWait(array $params, array $options = []): TtsJob
    {
        foreach (array_keys($options) as $name) {
            if (!in_array($name, self::WAIT_OPTIONS, true)) {
                throw new NeuronAIException(sprintf('Unknown option "%s": createAndWait() takes %s.', $name, Params::listing(self::WAIT_OPTIONS, 'and')));
            }
        }
        $interval = Options::checkSeconds('poll_interval', $options['poll_interval'] ?? 2.0);
        $limit = Options::checkSeconds('timeout', $options['timeout'] ?? 600.0);
        $poll = array_intersect_key($options, ['extra_headers' => true]);
        $job = $this->create($params, array_intersect_key($options, ['idempotency_key' => true, 'max_retries' => true, 'extra_headers' => true]));
        $deadline = $this->http->monotonic() + $limit;
        $pause = $interval;
        while ($job->status !== TtsJobStatus::Succeeded->value && $job->status !== TtsJobStatus::Failed->value) {
            $left = $deadline - $this->http->monotonic();
            if ($left <= 0) {
                throw new WaitTimeoutException($job);
            }
            $this->http->sleep(min($pause, $left));
            $left = $deadline - $this->http->monotonic();
            if ($left <= 0) {
                throw new WaitTimeoutException($job);
            }
            try {
                // One attempt, bounded by the time left: the wait itself tries a failed poll again.
                $job = $this->retrieve($job->id, [...$poll, 'timeout' => min($this->http->timeout, $left), 'max_retries' => 0]);
                $pause = $interval;
            } catch (NeuronAIException $error) {
                if (!self::keepsWaiting($error)) {
                    throw $error;
                }
                $pause = $error instanceof RateLimitException && $error->retry_after !== null ? max($interval, $error->retry_after) : $interval;
            }
        }

        return $job;
    }

    /**
     * The WAV of a job that has succeeded, with the headers synthesize sends.
     *
     * Before then it throws ConflictException: `job_not_finished` while the job is queued or running, and `job_failed`
     * once it has failed. The audio is kept for 24 hours after the job finishes; after that it throws GoneException
     * (410 `audio_expired`), so download it promptly.
     *
     * @param CallOptions $options
     */
    public function audio(string $id, array $options = []): SpeechAudio
    {
        $request = new APIRequest('GET', '/tts/jobs/{id}/audio', RetryClass::Safe, ['id' => $id], accept: Readers::AUDIO, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::speech());
    }

    /**
     * Whether a failed poll lets the wait go on: a failure a read would retry, a connection error or a timeout, or a
     * 429, 500, 502, 503 or 504.
     */
    private static function keepsWaiting(NeuronAIException $error): bool
    {
        return $error instanceof APIConnectionException
            || ($error instanceof APIException && RetryPolicy::isRetryable(RetryClass::Safe, new StatusFailure($error->status, true)));
    }
}
