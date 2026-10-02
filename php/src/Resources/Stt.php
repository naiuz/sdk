<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\Form;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Core\Upload;
use Naiuz\Types\Transcription;

/**
 * Speech to text.
 *
 * @phpstan-type TranscriptionLanguage 'uz'|'ru'|'en'|'kk'|'tk'|'tg'|'tr'|'az'|'ja'|'de'|'ko'
 * @phpstan-type CreateTranscriptionRequest array{file: Uploadable, language: TranscriptionLanguage}
 * @phpstan-import-type Uploadable from Upload
 * @phpstan-import-type IdempotentCallOptions from RequestOptions
 */
readonly class Stt
{
    private const CREATE_TRANSCRIPTION_REQUEST = ['file', 'language'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * Transcribes an audio file, sent as multipart/form-data, and returns the text, the language, the duration, timed
     * segments, the price and your balance after the charge.
     *
     * It is billed by duration at the per-minute rate, settled on the actual duration. Every call sends an
     * Idempotency-Key, the idempotency_key option or a generated one, the same on each retry, so a retry never charges
     * twice. A transcription's key is kept indefinitely: reuse one only for the same file.
     *
     * @param CreateTranscriptionRequest $params
     *     - file: the audio, MP3, WAV, OGG, FLAC, M4A or WebM, at most 25 MB: a path, or ['stream' => $stream,
     *       'filename' => 'call.mp3'], and optionally 'content_type'. The filename's extension names the format.
     *     - language: the language spoken in it.
     * @param IdempotentCallOptions $options idempotency_key: sent as the Idempotency-Key header, at most 191
     *     characters. Null or '' sends a generated UUIDv4.
     */
    public function transcribe(array $params, array $options = []): Transcription
    {
        $fields = Params::check('stt->transcribe', $params, self::CREATE_TRANSCRIPTION_REQUEST);
        $request = new APIRequest('POST', '/stt/transcribe', RetryClass::Idempotent, options: RequestOptions::from($options, idempotent: true), form: new Form($fields, ['file']));

        return $this->http->request($request, Readers::envelope(Transcription::from(...)));
    }
}
