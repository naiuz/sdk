<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Types\DialogueAudio;
use Naiuz\Types\SpeechAudio;

/**
 * Text to speech.
 *
 * @phpstan-type DialogueTurn array{voice_id: string, text: string, language?: SpeechLanguage|null, quality?: SpeechQuality|null, speed?: float|int|null}
 * @phpstan-type SynthesizeDialogueRequest array{turns: list<DialogueTurn>, gap_ms?: int|null, language?: SpeechLanguage|null, quality?: SpeechQuality|null, speed?: float|int|null}
 * @phpstan-import-type SpeechLanguage from TtsJobs
 * @phpstan-import-type SpeechQuality from TtsJobs
 * @phpstan-import-type SynthesizeSpeechRequest from TtsJobs
 * @phpstan-import-type IdempotentCallOptions from RequestOptions
 */
readonly class Tts
{
    private const SYNTHESIZE_DIALOGUE_REQUEST = ['turns', 'gap_ms', 'language', 'quality', 'speed'];

    /** Synthesis jobs: queue a long text, then poll the job until it finishes. */
    public TtsJobs $jobs;

    /** @internal */
    public function __construct(private HttpClient $http)
    {
        $this->jobs = new TtsJobs($http);
    }

    /**
     * Synthesizes speech from text, and returns the WAV with what its headers say: the price, the characters billed,
     * your balance after the charge, and more.
     *
     * Every call sends an Idempotency-Key, the idempotency_key option or a generated one, the same on each retry, so a
     * retry returns the first answer instead of charging again; the same key with a different body throws
     * ConflictException (409 `idempotency_conflict`). Emotion tags such as `[laughter]` are acted out rather than read,
     * and each bills as one character.
     *
     * @param SynthesizeSpeechRequest $params
     *     - text: the text to speak. Length is measured as spoken length, the same measure billing uses: an emotion
     *       tag counts as one character, however long its name is spelled.
     *     - voice_id: the voice to speak with, a stock voice or one of your clones, up to 128 characters.
     *     - language: the text's language.
     *     - quality: `fast` (lowest latency), `standard` (the default, balanced) or `high` (best fidelity, slowest).
     *     - speed: from 0.5 to 2.
     * @param IdempotentCallOptions $options idempotency_key: sent as the Idempotency-Key header, at most 191
     *     characters. Null or '' sends a generated UUIDv4.
     */
    public function synthesize(array $params, array $options = []): SpeechAudio
    {
        $body = Params::check('tts->synthesize', $params, TtsJobs::SYNTHESIZE_SPEECH_REQUEST);
        $request = new APIRequest('POST', '/tts/synthesize', RetryClass::Idempotent, body: $body, accept: Readers::AUDIO, options: RequestOptions::from($options, idempotent: true));

        return $this->http->request($request, Readers::speech());
    }

    /**
     * Renders a multi-speaker script into one WAV file, and returns it with its headers and where each turn sits.
     *
     * Billed per character, per turn, at that turn's own rate. Over 8000 characters in all throws
     * PayloadTooLargeException (413 `input_too_large`). A long script can take about four and a half minutes, close to
     * the default timeout: pass a longer timeout for one. The Idempotency-Key works as it does on synthesize().
     *
     * @param SynthesizeDialogueRequest $params
     *     - turns: the script, 1 to 100 turns, each a voice_id and its text, and optionally its own language, quality
     *       and speed.
     *     - gap_ms: milliseconds of silence between turns, from 0 to 5000.
     *     - language: the language of each turn that doesn't set its own.
     *     - quality: the quality of each turn that doesn't set its own: `fast`, `standard` or `high`.
     *     - speed: the speed of each turn that doesn't set its own, from 0.5 to 2.
     * @param IdempotentCallOptions $options idempotency_key: sent as the Idempotency-Key header, at most 191
     *     characters. Null or '' sends a generated UUIDv4.
     */
    public function dialogue(array $params, array $options = []): DialogueAudio
    {
        $body = Params::check('tts->dialogue', $params, self::SYNTHESIZE_DIALOGUE_REQUEST);
        $request = new APIRequest('POST', '/tts/dialogue', RetryClass::Idempotent, body: $body, accept: Readers::AUDIO, options: RequestOptions::from($options, idempotent: true));

        return $this->http->request($request, Readers::dialogue());
    }
}
