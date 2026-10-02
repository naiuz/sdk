<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\Page;
use Naiuz\RawResponse;
use Naiuz\Types\Voice;

/**
 * The voices' methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type ListVoicesParams from Voices
 * @phpstan-import-type CreateVoiceRequest from Voices
 * @phpstan-import-type UpdateVoiceRequest from Voices
 * @phpstan-import-type ReplaceVoiceAudioRequest from Voices
 * @phpstan-import-type CallOptions from RequestOptions
 * @phpstan-import-type IdempotentCallOptions from RequestOptions
 */
readonly class VoicesWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param ListVoicesParams $query
     * @param CallOptions $options
     *
     * @return RawResponse<Page<Voice>>
     */
    public function list(array $query = [], array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Page => (new Voices($http))->list($query, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<Voice>
     */
    public function retrieve(string $id, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Voice => (new Voices($http))->retrieve($id, $options));
    }

    /**
     * @param CreateVoiceRequest $params
     * @param IdempotentCallOptions $options
     *
     * @return RawResponse<Voice>
     */
    public function create(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Voice => (new Voices($http))->create($params, $options));
    }

    /**
     * @param UpdateVoiceRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<Voice>
     */
    public function update(string $id, array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Voice => (new Voices($http))->update($id, $params, $options));
    }

    /**
     * @param ReplaceVoiceAudioRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<Voice>
     */
    public function replaceAudio(string $id, array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Voice => (new Voices($http))->replaceAudio($id, $params, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<null>
     */
    public function delete(string $id, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static function (HttpClient $http) use ($id, $options): null {
            (new Voices($http))->delete($id, $options);

            return null;
        });
    }
}
