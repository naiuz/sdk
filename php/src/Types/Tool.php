<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A tool agents can use. `config` comes with `retrieve`, `create` and `update`.
 */
final readonly class Tool extends ApiObject
{
    /**
     * @param int $id The tool's id.
     * @param string $kind `webhook` or `client`, or a kind the platform manages.
     * @param string $name Its name.
     * @param string $description What it does and when to use it.
     * @param string|null $target What it calls.
     * @param string|null $last_test_at When it was last tested.
     * @param string|null $last_test_status How the last test went.
     * @param list<ToolUser> $used_by The agents that use it.
     * @param bool|null $wait_for_result Whether a client tool's result is waited for.
     * @param int|null $timeout_s How long a client tool has, in seconds.
     * @param \stdClass|null $config For `webhook`: `method` and `url`, with `parameters` holding `path`, `query` and `body` lists, each parameter a `name`, a `source` (`model` for what the agent fills in, `fixed`, `variable` or `secret`), and its `type`, `required` and `description`. Also `headers`, `auth`, `response` and `timeout_s`, from 5 to 120. For `client`: `parameters`, a list of `name`, `type`, `required` and `description`, with `wait_for_result` and `timeout_s`, from 1 to 120. A `client` tool can send `{}`. Secrets appear by id.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public int $id,
        public string $kind,
        public string $name,
        public string $description,
        public ?string $target,
        public ?string $last_test_at,
        public ?string $last_test_status,
        public array $used_by,
        public ?bool $wait_for_result,
        public ?int $timeout_s,
        public ?\stdClass $config,
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
            $fields->int('id'),
            $fields->string('kind'),
            $fields->string('name'),
            $fields->string('description'),
            $fields->nullableString('target'),
            $fields->nullableString('last_test_at'),
            $fields->nullableString('last_test_status'),
            $fields->listOf('used_by', ToolUser::from(...)),
            $fields->nullableBool('wait_for_result'),
            $fields->nullableInt('timeout_s'),
            $fields->optionalObject('config'),
            $request_id,
        );
    }
}
