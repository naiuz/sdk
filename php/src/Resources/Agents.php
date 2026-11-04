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
use Naiuz\Types\Agent;
use Naiuz\Types\AgentDraftSaved;
use Naiuz\Types\AgentSignedUrl;
use Naiuz\Types\AgentStatus;
use Naiuz\Types\CreatedAgent;

/**
 * Your organization's agents.
 *
 * @phpstan-type ListAgentsParams array{search?: string|null, status?: string|null, limit?: int|null, cursor?: string|null}
 * @phpstan-type CreateAgentRequest array{template: string, language: string, name?: string|null, answers?: array<string, mixed>}
 * @phpstan-type UpdateAgentRequest array{base_revision: int, sections: array<string, mixed>}
 * @phpstan-type PublishAgentRequest array{base_revision: int, note?: string|null}
 * @phpstan-type AgentSignedUrlParams array{vars?: array<string, string|int|float|bool>, customer_id?: string|null}
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class Agents
{
    private const LIST_AGENTS_PARAMS = ['search', 'status', 'limit', 'cursor'];
    private const CREATE_AGENT_REQUEST = ['template', 'language', 'name', 'answers'];
    private const UPDATE_AGENT_REQUEST = ['base_revision', 'sections'];
    private const PUBLISH_AGENT_REQUEST = ['base_revision', 'note'];
    private const AGENT_SIGNED_URL_PARAMS = ['vars', 'customer_id'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * Your organization's agents, the ones changed last first. Loop over the result for every agent, each page fetched when the loop reaches it.
     *
     * @param ListAgentsParams $query
     *     - search: Part of the agent's name.
     *     - status: `draft`, `published` or `paused`.
     *     - limit: How many, from 1 to 100 (50 when left out).
     *     - cursor: A page's `next_cursor`, to start from the page after it.
     * @param CallOptions $options
     *
     * @return Page<Agent>
     */
    public function list(array $query = [], array $options = []): Page
    {
        $query = Params::check('agents->list', $query, self::LIST_AGENTS_PARAMS);
        $request = new APIRequest('GET', '/agents', RetryClass::Safe, query: $query, options: RequestOptions::from($options));

        return Page::fetch($this->http, $request, Agent::from(...));
    }

    /**
     * An agent, with its draft as `config` and the `revision` to change it from.
     *
     * @param CallOptions $options
     */
    public function retrieve(string $agent, array $options = []): Agent
    {
        $request = new APIRequest('GET', '/agents/{agent}', RetryClass::Safe, ['agent' => $agent], options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(Agent::from(...)));
    }

    /**
     * Creates an agent from a template. The model fits its prompt to your answers, and `personalized` says when it couldn't.
     *
     * @param CreateAgentRequest $params
     *     - template: The template to start from: `support`, `sales`, or `blank`, which asks nothing.
     *     - language: The agent's main language: `uz`, `ru` or `en`.
     *     - name: The agent's name. The template's when left out.
     *     - answers: The answers to the template's questions, by question. `support` and `sales` need `business_name`, `offering`, `goal` and `tone`, and `blank` needs none. The Agents page of the docs lists what each one takes.
     * @param CallOptions $options
     */
    public function create(array $params, array $options = []): CreatedAgent
    {
        $body = Params::check('agents->create', $params, self::CREATE_AGENT_REQUEST);
        $request = new APIRequest('POST', '/agents', RetryClass::Once, body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(CreatedAgent::from(...)));
    }

    /**
     * Replaces whole sections of the draft. Someone else's change since you read it raises a conflict: read the agent again. Customers see nothing of this until you publish.
     *
     * @param UpdateAgentRequest $params
     *     - base_revision: The `revision` you read.
     *     - sections: The top-level sections of the config to replace, such as `prompt`.
     * @param CallOptions $options
     */
    public function update(string $agent, array $params, array $options = []): AgentDraftSaved
    {
        $body = Params::check('agents->update', $params, self::UPDATE_AGENT_REQUEST);
        $request = new APIRequest('PATCH', '/agents/{agent}', RetryClass::Once, ['agent' => $agent], body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(AgentDraftSaved::from(...)));
    }

    /**
     * Makes the draft live as a new version. What stands in the way is an error with `fields`, naming each part of the config.
     *
     * @param PublishAgentRequest $params
     *     - base_revision: The `revision` you read.
     *     - note: What changed, for the version history. Up to 140 characters.
     * @param CallOptions $options
     */
    public function publish(string $agent, array $params, array $options = []): AgentStatus
    {
        $body = Params::check('agents->publish', $params, self::PUBLISH_AGENT_REQUEST);
        $request = new APIRequest('POST', '/agents/{agent}/publish', RetryClass::Once, ['agent' => $agent], body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(AgentStatus::from(...)));
    }

    /**
     * A link your page opens a conversation with, for a private agent or to bind a conversation to a customer of yours. It must be used within 15 minutes, once. Make it on your server.
     *
     * @param AgentSignedUrlParams $query
     *     - vars: Values for the agent's `{{variables}}` that the page can't change. They travel in the link, so they're not secret.
     *     - customer_id: Your own id for this customer. Their conversations then share one contact.
     * @param CallOptions $options
     */
    public function signedUrl(string $agent, array $query = [], array $options = []): AgentSignedUrl
    {
        $query = Params::check('agents->signedUrl', $query, self::AGENT_SIGNED_URL_PARAMS);
        /** @var array<string, bool|float|int|string> $vars */
        $vars = $query['vars'] ?? [];
        unset($query['vars']);
        foreach ($vars as $name => $value) {
            $query['vars[' . $name . ']'] = $value;
        }
        $request = new APIRequest('GET', '/agents/{agent}/signed-url', RetryClass::Safe, ['agent' => $agent], query: $query, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(AgentSignedUrl::from(...)));
    }
}
