<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * Why a job failed.
 */
final readonly class TtsJobError extends ApiObject
{
    /**
     * @param string $code `insufficient_balance`, `voice_unavailable`, `synthesis_failed`, `storage_failed` or
     *     `queue_timeout`. None of them is charged.
     * @param string $message What went wrong, written for people.
     */
    private function __construct(\stdClass $sent, public string $code, public string $message)
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

        return new self($fields->object(), $fields->string('code'), $fields->string('message'));
    }
}
