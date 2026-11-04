<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\Page;
use Naiuz\RawResponse;
use Naiuz\Types\CreatedWebhookEndpoint;
use Naiuz\Types\WebhookEndpoint;

/**
 * The addresses that hear of what agents and operators say: these methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type CreateWebhookEndpointRequest from Webhooks
 * @phpstan-import-type UpdateWebhookEndpointRequest from Webhooks
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class WebhooksWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<Page<WebhookEndpoint>>
     */
    public function list(array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Page => (new Webhooks($http))->list($options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<WebhookEndpoint>
     */
    public function retrieve(string $endpoint, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): WebhookEndpoint => (new Webhooks($http))->retrieve($endpoint, $options));
    }

    /**
     * @param CreateWebhookEndpointRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<CreatedWebhookEndpoint>
     */
    public function create(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): CreatedWebhookEndpoint => (new Webhooks($http))->create($params, $options));
    }

    /**
     * @param UpdateWebhookEndpointRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<WebhookEndpoint>
     */
    public function update(string $endpoint, array $params = [], array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): WebhookEndpoint => (new Webhooks($http))->update($endpoint, $params, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<null>
     */
    public function delete(string $endpoint, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static function (HttpClient $http) use ($endpoint, $options): null {
            (new Webhooks($http))->delete($endpoint, $options);

            return null;
        });
    }
}
