<?php

declare(strict_types=1);

namespace Naiuz;

use Naiuz\Core\Headers;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Options;
use Naiuz\Core\Params;
use Naiuz\Core\Transport\Transports;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Resources\Account;
use Naiuz\Resources\ApiKeys;
use Naiuz\Resources\Chat;
use Naiuz\Resources\Embeddings;
use Naiuz\Resources\Models;
use Naiuz\Resources\Rerank;
use Naiuz\Resources\Stt;
use Naiuz\Resources\Tts;
use Naiuz\Resources\Voices;
use Psr\Http\Client\ClientInterface;

/**
 * The NeuronAI API client.
 *
 * Every method takes, after its own arguments, an array of options for that call: `timeout` (seconds each attempt
 * may take, reading the answer included), `max_retries`, and `extra_headers` (headers that go on over the SDK's own
 * and default_headers). The calls that send an Idempotency-Key also take `idempotency_key`. withRawResponse() has the
 * same methods, each returning a RawResponse: the result with its answer's status and headers.
 */
final readonly class NeuronAI
{
    /** This package's version, sent in the User-Agent header. release-please sets it on each release. */
    public const VERSION = '0.0.0'; // x-release-please-version

    /** The API's address when neither base_url nor NEURONAI_BASE_URL gives one. */
    public const DEFAULT_BASE_URL = 'https://my.neuronai.uz/api/v1';

    /** Seconds each attempt may take by default: 5 minutes. */
    public const DEFAULT_TIMEOUT = 300.0;

    /** How many times a failed attempt is retried by default. */
    public const DEFAULT_MAX_RETRIES = 2;

    private const OPTIONS = ['api_key', 'base_url', 'timeout', 'max_retries', 'default_headers', 'http_client'];

    /** The API's address, without a trailing slash. */
    public string $base_url;

    /** Seconds each attempt may take, unless a call passes its own timeout. */
    public float $timeout;

    /** How many times a failed attempt is retried, unless a call passes its own max_retries. */
    public int $max_retries;

    /** Your organization's balance and usage. */
    public Account $account;

    /** Stock voices and your organization's voice clones. */
    public Voices $voices;

    /** Text to speech. */
    public Tts $tts;

    /** Speech to text. */
    public Stt $stt;

    /** Your organization's API keys. */
    public ApiKeys $apiKeys;

    /** The chat models available to your account. */
    public Models $models;

    /** Dense vectors for text. */
    public Embeddings $embeddings;

    /** Ranking documents against a query. */
    public Rerank $rerank;

    /** Chat completions. */
    public Chat $chat;

    private HttpClient $http;

    /**
     * Throws NeuronAIException at once when there is no API key, when an option is invalid or unknown, or when no
     * HTTP client is found.
     *
     * @param array{api_key?: string|null, base_url?: string|null, timeout?: float|int|null, max_retries?: int|null, default_headers?: array<string, string>|null, http_client?: ClientInterface|null} $options
     *     - api_key: your API key (`nai_...`). Defaults to the NEURONAI_API_KEY environment variable.
     *     - base_url: the API's address. Defaults to NEURONAI_BASE_URL, then to `https://my.neuronai.uz/api/v1`.
     *     - timeout: seconds each attempt may take, reading the answer included: 300 (5 minutes) by default. A long
     *       dialogue, or a voice update that re-creates the voice, can take longer: pass a longer timeout.
     *     - max_retries: how many times a failed attempt may be retried: 2 by default.
     *     - default_headers: headers sent with every call, over the SDK's own. A call's Idempotency-Key and
     *       extra_headers go on over them.
     *     - http_client: the PSR-18 client to send with, for proxies and tests. Guzzle and Symfony HttpClient get each
     *       attempt's timeout from the SDK; any other client keeps its own. Without one, the SDK makes Guzzle when it
     *       is installed, else Symfony HttpClient, else uses the client php-http/discovery finds.
     */
    public function __construct(#[\SensitiveParameter] array $options = [])
    {
        foreach (array_keys($options) as $name) {
            if (!in_array($name, self::OPTIONS, true)) {
                throw new NeuronAIException(sprintf('Unknown option "%s": the client takes %s.', $name, Params::listing(self::OPTIONS, 'and')));
            }
        }
        $this->base_url = Options::baseUrl($options['base_url'] ?? null);
        $this->timeout = Options::checkTimeout($options['timeout'] ?? self::DEFAULT_TIMEOUT);
        $this->max_retries = Options::checkMaxRetries($options['max_retries'] ?? self::DEFAULT_MAX_RETRIES);
        $defaultHeaders = Headers::check($options['default_headers'] ?? [], 'default_headers');
        $client = $options['http_client'] ?? null;
        if ($client !== null && !$client instanceof ClientInterface) {
            throw new NeuronAIException('http_client must be a PSR-18 client: an instance of Psr\Http\Client\ClientInterface.');
        }
        $transport = Transports::for($client);
        [$requests, $streams] = Transports::factories();
        // The key last, once every other option is checked: the exception of an option refused holds no frame with it.
        $key = Options::apiKey($options['api_key'] ?? null);
        $this->http = new HttpClient($key, $this->base_url, $this->timeout, $this->max_retries, $defaultHeaders, Options::userAgent(), $transport, $requests, $streams);
        $this->account = new Account($this->http);
        $this->voices = new Voices($this->http);
        $this->tts = new Tts($this->http);
        $this->stt = new Stt($this->http);
        $this->apiKeys = new ApiKeys($this->http);
        $this->models = new Models($this->http);
        $this->embeddings = new Embeddings($this->http);
        $this->rerank = new Rerank($this->http);
        $this->chat = new Chat($this->http);
    }

    /** The client's resources, each method returning a RawResponse: its result with the answer's status and headers. */
    public function withRawResponse(): NeuronAIWithRawResponse
    {
        return new NeuronAIWithRawResponse($this->http);
    }
}
