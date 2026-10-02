<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Exceptions\APIException;
use Naiuz\Stream;
use Naiuz\Types\DialogueAudio;
use Naiuz\Types\DialogueTurnTiming;
use Naiuz\Types\SpeechAudio;
use Psr\Http\Message\ResponseInterface;

/**
 * How a success answer becomes a call's result. A reader throws APIException, with the answer's status and the key
 * redacted, for a body the call can't use.
 *
 * @internal
 */
final class Readers
{
    /** What the audio calls take back: the WAV, or an error in the API's JSON envelope. */
    public const AUDIO = 'audio/wav, application/json';

    /**
     * Reads a `{data, request_id}` answer: its `data` object, made into the call's result with the request's ID.
     *
     * @template T
     *
     * @param \Closure(\stdClass, ?string): T $make
     *
     * @return \Closure(Answer, Attempt): T
     */
    public static function envelope(\Closure $make): \Closure
    {
        return static function (Answer $answer, Attempt $attempt) use ($make): mixed {
            $body = Json::decode($answer->body);
            $data = $body instanceof \stdClass ? $body->data ?? null : null;
            if (!$body instanceof \stdClass || !$data instanceof \stdClass) {
                throw self::unusable($answer, $attempt);
            }

            return self::make(static fn(): mixed => $make($data, self::requestIdOf($body, $answer)), $answer, $attempt);
        };
    }

    /**
     * Reads a compatible endpoint's answer: the body as it is, made into the call's result with its price from
     * `X-Cost` when the answer sends one.
     *
     * @template T
     *
     * @param \Closure(\stdClass, ?float): T $make
     *
     * @return \Closure(Answer, Attempt): T
     */
    public static function body(\Closure $make): \Closure
    {
        return static function (Answer $answer, Attempt $attempt) use ($make): mixed {
            $body = Json::decode($answer->body);
            if (!$body instanceof \stdClass) {
                throw self::unusable($answer, $attempt);
            }

            return self::make(static fn(): mixed => $make($body, self::numberHeader($answer->headers, 'x-cost')), $answer, $attempt);
        };
    }

    /**
     * Reads a `{data: [...], next_cursor, request_id}` answer, each item made by $make.
     *
     * @template T
     *
     * @param \Closure(\stdClass): T $make
     *
     * @return \Closure(Answer, Attempt): PageData<T>
     */
    public static function page(\Closure $make): \Closure
    {
        return static function (Answer $answer, Attempt $attempt) use ($make): PageData {
            $body = Json::decode($answer->body);
            $data = $body instanceof \stdClass ? $body->data ?? null : null;
            if (!$body instanceof \stdClass || !is_array($data) || !array_is_list($data)) {
                throw self::unusable($answer, $attempt);
            }
            $items = self::make(static fn(): array => array_map(
                static fn(mixed $item): mixed => $item instanceof \stdClass ? $make($item) : throw new \UnexpectedValueException('An item is not an object.'),
                $data,
            ), $answer, $attempt);
            $cursor = $body->next_cursor ?? null;

            return new PageData($items, is_string($cursor) ? $cursor : null, self::requestIdOf($body, $answer));
        };
    }

    /**
     * Reads a speech answer: the WAV, and what its headers say about it.
     *
     * @return \Closure(Answer, Attempt): SpeechAudio
     */
    public static function speech(): \Closure
    {
        return static fn(Answer $answer, Attempt $attempt): SpeechAudio => new SpeechAudio(...self::audio($answer, $attempt));
    }

    /**
     * Reads a dialogue answer: the WAV, what its headers say about it, and where each turn sits in it.
     *
     * @return \Closure(Answer, Attempt): DialogueAudio
     */
    public static function dialogue(): \Closure
    {
        return static fn(Answer $answer, Attempt $attempt): DialogueAudio => new DialogueAudio(
            ...self::audio($answer, $attempt),
            turns: self::turns($answer->headers['x-turns'] ?? null),
            turn_count: self::countHeader($answer->headers, 'x-turn-count'),
        );
    }

    /**
     * Reads a stream of server-sent events, each made by $make: the core hands the answer over open, and the stream
     * reads it. A success that isn't an event stream throws APIException, its body read within the call's timeout.
     *
     * @template T
     *
     * @param \Closure(\stdClass): T $make
     *
     * @return TakeOver<Stream<T>>
     */
    public static function stream(\Closure $make): TakeOver
    {
        return new TakeOver(static fn(ResponseInterface $response, Attempt $attempt): Stream => new Stream($response, $attempt, $make), 'text/event-stream');
    }

    /**
     * Reads a 204 answer: nothing.
     *
     * @return \Closure(Answer, Attempt): null
     */
    public static function nothing(): \Closure
    {
        return static fn(Answer $answer, Attempt $attempt): mixed => null;
    }

    /** The exception for a success answer whose body isn't what the call returns, with the API key redacted from it. */
    public static function unusable(Answer $answer, Attempt $attempt): APIException
    {
        return ErrorFactory::make($answer->status, $answer->reason, $answer->headers, $attempt->redact($answer->body));
    }

    /**
     * A header as a number, or null when it is absent or isn't a finite number.
     *
     * @param array<string, string> $headers
     */
    public static function numberHeader(array $headers, string $name): ?float
    {
        $text = trim($headers[$name] ?? '');
        if (preg_match('/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/', $text) !== 1) {
            return null;
        }
        $value = (float) $text;

        return is_finite($value) ? $value : null;
    }

    /**
     * An audio answer's bytes and what its headers say, in SpeechAudio's order. A success that isn't audio, such as a
     * proxy's or a captive portal's page, throws APIException with its status and the key redacted.
     *
     * @return array{string, string, float|null, int|null, float|null, bool, float|null, bool, string|null}
     */
    private static function audio(Answer $answer, Attempt $attempt): array
    {
        $headers = $answer->headers;
        $type = trim($headers['content-type'] ?? '');
        if (!str_starts_with(strtolower($type), 'audio/')) {
            throw self::unusable($answer, $attempt);
        }

        return [
            $answer->body,
            $type,
            self::numberHeader($headers, 'x-cost'),
            self::countHeader($headers, 'x-character-count'),
            self::numberHeader($headers, 'x-balance'),
            self::flagHeader($headers, 'x-voice-custom'),
            self::numberHeader($headers, 'x-latency-ms'),
            self::flagHeader($headers, 'idempotency-replayed'),
            $headers['x-request-id'] ?? null,
        ];
    }

    /**
     * A header that counts something, read from its digits alone, or null when it is absent or anything else.
     *
     * @param array<string, string> $headers
     */
    private static function countHeader(array $headers, string $name): ?int
    {
        $text = trim($headers[$name] ?? '');

        return preg_match('/^\d{1,18}$/', $text) === 1 ? (int) $text : null;
    }

    /**
     * A header that is a flag: true only for `1`.
     *
     * @param array<string, string> $headers
     */
    private static function flagHeader(array $headers, string $name): bool
    {
        return trim($headers[$name] ?? '') === '1';
    }

    /**
     * The turns an `X-Turns` header lists: none unless the whole header is a JSON list of turn timings.
     *
     * @return list<DialogueTurnTiming>
     */
    private static function turns(?string $header): array
    {
        $turns = $header === null ? null : Json::decode($header);
        if (!is_array($turns) || !array_is_list($turns)) {
            return [];
        }
        try {
            return array_map(static fn(mixed $turn): DialogueTurnTiming => $turn instanceof \stdClass ? DialogueTurnTiming::from($turn) : throw new \UnexpectedValueException('A turn is not an object.'), $turns);
        } catch (\UnexpectedValueException) {
            return [];
        }
    }

    /** The request's ID: the body's `request_id`, else the `X-Request-Id` header, else null. */
    private static function requestIdOf(\stdClass $body, Answer $answer): ?string
    {
        $requestId = $body->request_id ?? null;

        return is_string($requestId) ? $requestId : $answer->headers['x-request-id'] ?? null;
    }

    /**
     * Makes the result, and throws APIException when the body doesn't read as it. The type error isn't kept as the
     * exception's previous one: it is no help to the caller, and the answer's status and body say what came back.
     *
     * @template T
     *
     * @param \Closure(): T $make
     *
     * @return T
     */
    private static function make(\Closure $make, Answer $answer, Attempt $attempt): mixed
    {
        try {
            return $make();
        } catch (\UnexpectedValueException) {
            throw self::unusable($answer, $attempt);
        }
    }
}
