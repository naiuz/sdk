<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A new agent.
 */
final readonly class CreatedAgent extends ApiObject
{
    /**
     * @param string $id The agent's id, `agent_…`.
     * @param bool $personalized Whether the model fitted the prompt to your answers. `false` keeps the template's prompt.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public bool $personalized,
        public ?string $request_id,
    ) {
        parent::__construct($sent);
    }

    /**
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data, ?string $request_id = null): self
    {
        $fields = Fields::of($data);

        return new self(
            $fields->object(),
            $fields->string('id'),
            $fields->bool('personalized'),
            $request_id,
        );
    }
}
