<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Page;
use Naiuz\Types\ApiKey;
use Naiuz\Types\ApiKeyAccess;

/**
 * Your organization's API keys.
 *
 * @phpstan-type ApiKeyPermissionsParam array{tts?: 'none'|'read'|'write', voices?: 'none'|'read'|'write', stt?: 'none'|'write', llm?: 'none'|'read'|'write', embeddings?: 'none'|'write', rerank?: 'none'|'write', account?: 'none'|'read', api_keys?: 'none'|'read'|'write'}
 * @phpstan-type ListApiKeysParams array{limit?: int|null, cursor?: string|null}
 * @phpstan-type CreateApiKeyRequest array{name: string, access: ApiKeyAccess|value-of<ApiKeyAccess>, description?: string|null, permissions?: ApiKeyPermissionsParam, expires_at?: string|null, monthly_spend_limit?: float|int|null, allowed_ips?: list<string>|null}
 * @phpstan-type UpdateApiKeyRequest array{name?: string, description?: string|null, access?: ApiKeyAccess|value-of<ApiKeyAccess>, permissions?: ApiKeyPermissionsParam, expires_at?: string|null, monthly_spend_limit?: float|int|null, enabled?: bool, allowed_ips?: list<string>|null}
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class ApiKeys
{
    private const LIST_API_KEYS_PARAMS = ['limit', 'cursor'];

    private const CREATE_API_KEY_REQUEST = ['name', 'access', 'description', 'permissions', 'expires_at', 'monthly_spend_limit', 'allowed_ips'];

    private const UPDATE_API_KEY_REQUEST = ['name', 'description', 'access', 'permissions', 'expires_at', 'monthly_spend_limit', 'enabled', 'allowed_ips'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * Your organization's keys, newest first, revoked ones included.
     *
     * Loop over the page with foreach for every key, each page fetched when the loop reaches it.
     *
     * @param ListApiKeysParams $query
     *     - limit: keys per page, from 1 to 100 (50 when left out).
     *     - cursor: a page's next_cursor, to start from the page after it. Cursors are opaque: don't build them.
     * @param CallOptions $options
     *
     * @return Page<ApiKey>
     */
    public function list(array $query = [], array $options = []): Page
    {
        $query = Params::check('apiKeys->list', $query, self::LIST_API_KEYS_PARAMS);
        $request = new APIRequest('GET', '/api-keys', RetryClass::Safe, query: $query, options: RequestOptions::from($options));

        return Page::fetch($this->http, $request, ApiKey::from(...));
    }

    /**
     * Creates a key, and returns it with its secret: the only time the secret is shown, so store it now.
     *
     * The new key never holds more than the calling key. Only a 429, or a connection that was never made, is retried,
     * since a retry could create a second key.
     *
     * @param CreateApiKeyRequest $params
     *     - name: from 1 to 80 characters.
     *     - access: `full` or `restricted`.
     *     - description: up to 500 characters.
     *     - permissions: levels by product, such as ['tts' => 'write']. On a restricted key a product left out is
     *       `none`. A full key already holds every other product at its highest level, so its map may name only
     *       `api_keys`.
     *     - expires_at: when the key stops working (ISO 8601), or null for never.
     *     - monthly_spend_limit: in credits per calendar month (UTC), from 0 to 999999999999.99 with at most two
     *       decimals. Leave it out, or pass null, for no limit.
     *     - allowed_ips: up to 100 addresses or CIDR ranges the key may be used from.
     * @param CallOptions $options
     */
    public function create(array $params, array $options = []): ApiKey
    {
        $body = Params::check('apiKeys->create', $params, self::CREATE_API_KEY_REQUEST);
        $request = new APIRequest('POST', '/api-keys', RetryClass::Once, body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(ApiKey::from(...)));
    }

    /**
     * One key by id. A key of another organization throws NotFoundException.
     *
     * @param CallOptions $options
     */
    public function retrieve(string $id, array $options = []): ApiKey
    {
        $request = new APIRequest('GET', '/api-keys/{id}', RetryClass::Safe, ['id' => $id], options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(ApiKey::from(...)));
    }

    /**
     * Changes a key. Only the keys you pass are sent: a key left out stays as it is, and a null clears it.
     *
     * A change that gives the key more power is checked as if the key were being created, so send the key's limits
     * along with it. A revoked key can't be changed: ConflictException (409 `conflict`).
     *
     * @param UpdateApiKeyRequest $params
     *     - name: from 1 to 80 characters.
     *     - description: up to 500 characters.
     *     - access: `full` or `restricted`.
     *     - permissions: replaces the whole map. Levels by product, such as ['tts' => 'write'].
     *     - expires_at: when the key stops working (ISO 8601); null clears the expiry.
     *     - monthly_spend_limit: in credits per calendar month (UTC), from 0 to 999999999999.99 with at most two
     *       decimals. Null removes the limit.
     *     - enabled: switches the key on or off.
     *     - allowed_ips: up to 100 addresses or CIDR ranges; null or [] clears the allowlist.
     * @param CallOptions $options
     */
    public function update(string $id, array $params, array $options = []): ApiKey
    {
        $body = Params::check('apiKeys->update', $params, self::UPDATE_API_KEY_REQUEST);
        $request = new APIRequest('PATCH', '/api-keys/{id}', RetryClass::Safe, ['id' => $id], body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(ApiKey::from(...)));
    }

    /**
     * Revokes a key for good: it stops working at once and can never be switched back on. A key may revoke itself,
     * to rotate.
     *
     * @param CallOptions $options
     */
    public function revoke(string $id, array $options = []): void
    {
        $request = new APIRequest('POST', '/api-keys/{id}/revoke', RetryClass::Safe, ['id' => $id], options: RequestOptions::from($options));
        $this->http->request($request, Readers::nothing());
    }
}
