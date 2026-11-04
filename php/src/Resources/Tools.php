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
use Naiuz\Types\Tool;

/**
 * The tools agents can use.
 *
 * @phpstan-type SaveToolRequest array{kind: string, name: string, description: string, config: array<string, mixed>, last_test_status?: string|null}
 * @phpstan-type DeleteToolParams array{detach?: bool|null}
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class Tools
{
    private const SAVE_TOOL_REQUEST = ['kind', 'name', 'description', 'config', 'last_test_status'];
    private const DELETE_TOOL_PARAMS = ['detach'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * Your organization's tools.
     *
     * @param CallOptions $options
     *
     * @return Page<Tool>
     */
    public function list(array $options = []): Page
    {
        $request = new APIRequest('GET', '/tools', RetryClass::Safe, options: RequestOptions::from($options));

        return Page::fetch($this->http, $request, Tool::from(...));
    }

    /**
     * One tool, with its config. Secrets appear by id, never by value.
     *
     * @param CallOptions $options
     */
    public function retrieve(int|string $tool, array $options = []): Tool
    {
        $request = new APIRequest('GET', '/tools/{tool}', RetryClass::Safe, ['tool' => (string) $tool], options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(Tool::from(...)));
    }

    /**
     * Creates a webhook tool, which calls your systems, or a client tool, which runs in your page.
     *
     * @param SaveToolRequest $params
     *     - kind: A `webhook` our servers call, or a `client` tool your page runs.
     *     - name: Its name: small letters, digits and `_`.
     *     - description: What it does and when to use it, for the model to read.
     *     - config: For `webhook`: `method` and `url`, with `parameters` holding `path`, `query` and `body` lists, each parameter a `name`, a `source` (`model` for what the agent fills in, `fixed`, `variable` or `secret`), and its `type`, `required` and `description`. Also `headers`, `auth`, `response` and `timeout_s`, from 5 to 120. For `client`: `parameters`, a list of `name`, `type`, `required` and `description`, with `wait_for_result` and `timeout_s`, from 1 to 120. A `client` tool can send `{}`.
     *     - last_test_status: The result of a test this config passed.
     * @param CallOptions $options
     */
    public function create(array $params, array $options = []): Tool
    {
        $body = Params::check('tools->create', $params, self::SAVE_TOOL_REQUEST);
        $request = new APIRequest('POST', '/tools', RetryClass::Once, body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(Tool::from(...)));
    }

    /**
     * Replaces a tool. Agents that use it get the change when it's saved.
     *
     * @param SaveToolRequest $params
     *     - kind: A `webhook` our servers call, or a `client` tool your page runs.
     *     - name: Its name.
     *     - description: What it does and when to use it.
     *     - config: For `webhook`: `method` and `url`, with `parameters` holding `path`, `query` and `body` lists, each parameter a `name`, a `source` (`model` for what the agent fills in, `fixed`, `variable` or `secret`), and its `type`, `required` and `description`. Also `headers`, `auth`, `response` and `timeout_s`, from 5 to 120. For `client`: `parameters`, a list of `name`, `type`, `required` and `description`, with `wait_for_result` and `timeout_s`, from 1 to 120. A `client` tool can send `{}`.
     *     - last_test_status: The result of a test this config passed.
     * @param CallOptions $options
     */
    public function update(int|string $tool, array $params, array $options = []): Tool
    {
        $body = Params::check('tools->update', $params, self::SAVE_TOOL_REQUEST);
        $request = new APIRequest('PUT', '/tools/{tool}', RetryClass::Safe, ['tool' => (string) $tool], body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(Tool::from(...)));
    }

    /**
     * Deletes a tool.
     *
     * @param DeleteToolParams $query
     *     - detach: Take it off the agents that use it. Without this, one in use raises a conflict naming them.
     * @param CallOptions $options
     */
    public function delete(int|string $tool, array $query = [], array $options = []): void
    {
        $query = Params::check('tools->delete', $query, self::DELETE_TOOL_PARAMS);
        $request = new APIRequest('DELETE', '/tools/{tool}', RetryClass::Safe, ['tool' => (string) $tool], query: $query, options: RequestOptions::from($options));

        $this->http->request($request, Readers::nothing());
    }
}
