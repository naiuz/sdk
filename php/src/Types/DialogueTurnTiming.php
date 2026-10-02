<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * Where one turn of a dialogue is in its audio, from the `X-Turns` header. Times are in seconds.
 */
final readonly class DialogueTurnTiming extends ApiObject
{
    /**
     * @param int $index The turn's position in the script, from 0.
     * @param string $voice_id The voice that spoke it.
     * @param float $start_s Where the turn starts.
     * @param float $end_s Where it ends.
     * @param float $duration_s How long it lasts.
     */
    private function __construct(\stdClass $sent, public int $index, public string $voice_id, public float $start_s, public float $end_s, public float $duration_s)
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

        return new self($fields->object(), $fields->int('index'), $fields->string('voice_id'), $fields->float('start_s'), $fields->float('end_s'), $fields->float('duration_s'));
    }
}
