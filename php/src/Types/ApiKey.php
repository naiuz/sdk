<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * An API key. Its secret is only ever shown once, in the result of apiKeys->create().
 */
final readonly class ApiKey extends ApiObject
{
    /**
     * @param string $id A lowercase ULID.
     * @param string $name The key's name.
     * @param string|null $description The key's description, or null.
     * @param string $masked_key `nai_...` and the last four characters of the secret.
     * @param string $access `full` or `restricted` (see ApiKeyAccess).
     * @param ApiKeyPermissions $permissions The effective level for every product. A full key reads as what it can do;
     *     `api_keys` is only ever granted explicitly.
     * @param string|null $expires_at When the key stops working, or null for never.
     * @param list<string> $allowed_ips Addresses or CIDR ranges the key may be used from. Empty allows any address.
     * @param float|null $monthly_spend_limit UZS per calendar month (UTC), or null for no limit.
     * @param float $spent_this_month UZS spent this calendar month (UTC).
     * @param bool $enabled Whether the key works; a disabled key can be enabled again.
     * @param string|null $revoked_at When the key was revoked, or null. A revoked key never works again.
     * @param string|null $last_used_at When the key was last used, or null.
     * @param string $created_at When the key was created (ISO 8601).
     * @param string|null $secret The whole key. Only in the result of a create, and never again; null otherwise.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id`, else its
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public string $name,
        public ?string $description,
        public string $masked_key,
        public string $access,
        public ApiKeyPermissions $permissions,
        public ?string $expires_at,
        public array $allowed_ips,
        public ?float $monthly_spend_limit,
        public float $spent_this_month,
        public bool $enabled,
        public ?string $revoked_at,
        public ?string $last_used_at,
        public string $created_at,
        public ?string $secret,
        public ?string $request_id,
    ) {
        parent::__construct($sent);
    }

    /**
     * A key from its fields, as the API sends them.
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
            $fields->string('id'),
            $fields->string('name'),
            $fields->nullableString('description'),
            $fields->string('masked_key'),
            $fields->string('access'),
            $fields->objectOf('permissions', ApiKeyPermissions::from(...)),
            $fields->nullableString('expires_at'),
            $fields->strings('allowed_ips'),
            $fields->nullableFloat('monthly_spend_limit'),
            $fields->float('spent_this_month'),
            $fields->bool('enabled'),
            $fields->nullableString('revoked_at'),
            $fields->nullableString('last_used_at'),
            $fields->string('created_at'),
            $fields->optionalString('secret'),
            $request_id,
        );
    }
}
