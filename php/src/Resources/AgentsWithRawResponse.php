<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\Page;
use Naiuz\RawResponse;
use Naiuz\Types\Agent;
use Naiuz\Types\AgentDraftSaved;
use Naiuz\Types\AgentSignedUrl;
use Naiuz\Types\AgentStatus;
use Naiuz\Types\CreatedAgent;

/**
 * Your organization's agents: these methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type ListAgentsParams from Agents
 * @phpstan-import-type CreateAgentRequest from Agents
 * @phpstan-import-type UpdateAgentRequest from Agents
 * @phpstan-import-type PublishAgentRequest from Agents
 * @phpstan-import-type AgentSignedUrlParams from Agents
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class AgentsWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param ListAgentsParams $query
     * @param CallOptions $options
     *
     * @return RawResponse<Page<Agent>>
     */
    public function list(array $query = [], array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Page => (new Agents($http))->list($query, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<Agent>
     */
    public function retrieve(string $agent, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Agent => (new Agents($http))->retrieve($agent, $options));
    }

    /**
     * @param CreateAgentRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<CreatedAgent>
     */
    public function create(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): CreatedAgent => (new Agents($http))->create($params, $options));
    }

    /**
     * @param UpdateAgentRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<AgentDraftSaved>
     */
    public function update(string $agent, array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): AgentDraftSaved => (new Agents($http))->update($agent, $params, $options));
    }

    /**
     * @param PublishAgentRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<AgentStatus>
     */
    public function publish(string $agent, array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): AgentStatus => (new Agents($http))->publish($agent, $params, $options));
    }

    /**
     * @param AgentSignedUrlParams $query
     * @param CallOptions $options
     *
     * @return RawResponse<AgentSignedUrl>
     */
    public function signedUrl(string $agent, array $query = [], array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): AgentSignedUrl => (new Agents($http))->signedUrl($agent, $query, $options));
    }
}
