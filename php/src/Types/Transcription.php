<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A transcription: the text, the language, the duration, timed segments, the price and your balance after the charge.
 */
final readonly class Transcription extends ApiObject
{
    /**
     * @param string $text The text of the whole audio.
     * @param string $language The language's code.
     * @param float $duration_seconds The audio's duration, in seconds. The price is set by it, at the per-minute rate.
     * @param list<TranscriptionSegment> $segments The text in timed pieces, in order: where each starts and ends in the
     *     audio, in seconds, and what was said.
     * @param float $cost The price billed, in UZS.
     * @param float $balance Your balance after the charge, in UZS.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id`, else its
     *     `X-Request-Id` header. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $text,
        public string $language,
        public float $duration_seconds,
        public array $segments,
        public float $cost,
        public float $balance,
        public ?string $request_id,
    ) {
        parent::__construct($sent);
    }

    /**
     * A transcription from its fields, as the API sends them.
     *
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data, ?string $request_id = null): self
    {
        $fields = Fields::of($data);

        return new self(
            $fields->object(),
            $fields->string('text'),
            $fields->string('language'),
            $fields->float('duration_seconds'),
            $fields->listOf('segments', TranscriptionSegment::from(...)),
            $fields->float('cost'),
            $fields->float('balance'),
            $request_id,
        );
    }
}
