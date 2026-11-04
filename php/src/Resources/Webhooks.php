<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Exceptions\WebhookVerificationException;
use Naiuz\Page;
use Naiuz\Types\CreatedWebhookEndpoint;
use Naiuz\Types\WebhookEndpoint;
use Naiuz\Types\WebhookEvent;

/**
 * The addresses that hear of what agents and operators say.
 *
 * @phpstan-type CreateWebhookEndpointRequest array{url: string, events: list<string>}
 * @phpstan-type UpdateWebhookEndpointRequest array{url?: string, events?: list<string>, enabled?: bool}
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class Webhooks
{
    private const CREATE_WEBHOOK_ENDPOINT_REQUEST = ['url', 'events'];
    private const UPDATE_WEBHOOK_ENDPOINT_REQUEST = ['url', 'events', 'enabled'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * Your organization's endpoints. A signing secret never appears here.
     *
     * @param CallOptions $options
     *
     * @return Page<WebhookEndpoint>
     */
    public function list(array $options = []): Page
    {
        $request = new APIRequest('GET', '/webhooks', RetryClass::Safe, options: RequestOptions::from($options));

        return Page::fetch($this->http, $request, WebhookEndpoint::from(...));
    }

    /**
     * One endpoint, and how its last delivery went.
     *
     * @param CallOptions $options
     */
    public function retrieve(string $endpoint, array $options = []): WebhookEndpoint
    {
        $request = new APIRequest('GET', '/webhooks/{endpoint}', RetryClass::Safe, ['endpoint' => $endpoint], options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(WebhookEndpoint::from(...)));
    }

    /**
     * Adds an address to send events to, and returns its signing `secret`: the only time it's shown, so store it now. For owners and admins.
     *
     * @param CreateWebhookEndpointRequest $params
     *     - url: A public https address.
     *     - events: `conversation.message.created` and `conversation.ended`.
     * @param CallOptions $options
     */
    public function create(array $params, array $options = []): CreatedWebhookEndpoint
    {
        $body = Params::check('webhooks->create', $params, self::CREATE_WEBHOOK_ENDPOINT_REQUEST);
        $request = new APIRequest('POST', '/webhooks', RetryClass::Once, body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(CreatedWebhookEndpoint::from(...)));
    }

    /**
     * Changes the address or the events, or turns it off and on. Only what you pass is sent.
     *
     * @param UpdateWebhookEndpointRequest $params
     *     - url: A public https address.
     *     - events: What it hears of.
     *     - enabled: On or off. Turning it on sends what was waiting.
     * @param CallOptions $options
     */
    public function update(string $endpoint, array $params = [], array $options = []): WebhookEndpoint
    {
        $body = Params::check('webhooks->update', $params, self::UPDATE_WEBHOOK_ENDPOINT_REQUEST);
        $request = new APIRequest('PATCH', '/webhooks/{endpoint}', RetryClass::Safe, ['endpoint' => $endpoint], body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(WebhookEndpoint::from(...)));
    }

    /**
     * Deletes an endpoint, with its deliveries.
     *
     * @param CallOptions $options
     */
    public function delete(string $endpoint, array $options = []): void
    {
        $request = new APIRequest('DELETE', '/webhooks/{endpoint}', RetryClass::Safe, ['endpoint' => $endpoint], options: RequestOptions::from($options));

        $this->http->request($request, Readers::nothing());
    }

    /**
     * Checks a webhook's `X-NeuronAI-Signature` header against the body exactly as it arrived, and returns the event.
     *
     * Anything wrong throws WebhookVerificationException: answer 400 and do nothing with the body. A signature older
     * than $toleranceSeconds is refused, so a recorded delivery can't be played back later.
     *
     * @param string $body The body as it arrived, before it's parsed: `file_get_contents('php://input')`.
     * @param string|null $signature The `X-NeuronAI-Signature` header.
     * @param string $secret The endpoint's signing secret.
     * @param int|null $now The time to check it against, in seconds since the epoch. Now when left out.
     *
     * @throws WebhookVerificationException
     */
    public function verify(string $body, ?string $signature, string $secret, int $toleranceSeconds = 300, ?int $now = null): WebhookEvent
    {
        $timestamp = null;
        $candidates = [];
        foreach (explode(',', $signature ?? '') as $part) {
            [$name, $value] = array_pad(explode('=', trim($part), 2), 2, '');
            if ($name === 't') {
                $timestamp = $value;
            } elseif ($name === 'v1') {
                $candidates[] = $value;
            }
        }
        if ($timestamp === null || preg_match('/^\d+$/D', $timestamp) !== 1 || $candidates === []) {
            throw new WebhookVerificationException("The signature header isn't one we send.");
        }
        if (abs(($now ?? time()) - (int) $timestamp) > $toleranceSeconds) {
            throw new WebhookVerificationException('The signature is too old, or from the future.');
        }
        $expected = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
        foreach ($candidates as $candidate) {
            if (hash_equals($expected, $candidate)) {
                $event = json_decode($body, false, 512, JSON_THROW_ON_ERROR);

                return WebhookEvent::from($event instanceof \stdClass ? $event : new \stdClass());
            }
        }

        throw new WebhookVerificationException("The signature doesn't match the body.");
    }
}
