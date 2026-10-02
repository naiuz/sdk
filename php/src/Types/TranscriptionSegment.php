<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A timed piece of a transcription's text.
 */
final readonly class TranscriptionSegment extends ApiObject
{
    /**
     * @param float $start Where the piece starts in the audio, in seconds.
     * @param float $end Where it ends, in seconds.
     * @param string $text What was said.
     */
    private function __construct(\stdClass $sent, public float $start, public float $end, public string $text)
    {
        parent::__construct($sent);
    }

    /**
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data): self
    {
        $fields = Fields::of($data);

        return new self($fields->object(), $fields->float('start'), $fields->float('end'), $fields->string('text'));
    }
}
