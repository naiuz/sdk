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
use Naiuz\Types\Voice;
use Naiuz\Types\VoiceCategory;

/**
 * Stock voices and your organization's voice clones.
 *
 * @phpstan-type ListVoicesParams array{type?: 'stock'|'custom'|null, language?: string|null, limit?: int|null, cursor?: string|null}
 * @phpstan-type UpdateVoiceRequest array{name?: string, category?: VoiceCategory|value-of<VoiceCategory>, language?: SpeechLanguage, ref_text?: string|null, tags?: list<string>|null}
 * @phpstan-import-type SpeechLanguage from TtsJobs
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class Voices
{
    private const LIST_VOICES_PARAMS = ['type', 'language', 'limit', 'cursor'];

    private const UPDATE_VOICE_REQUEST = ['name', 'category', 'language', 'ref_text', 'tags'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * Stock voices first, in their catalog order, then your organization's ready clones, newest first.
     *
     * Loop over the page with foreach for every voice, each page fetched when the loop reaches it.
     *
     * @param ListVoicesParams $query
     *     - type: `stock` or `custom` narrows the list to that type.
     *     - language: only voices in this language, such as `uz`.
     *     - limit: voices per page, from 1 to 100 (50 when left out).
     *     - cursor: a page's next_cursor, to start from the page after it. Cursors are opaque: don't build them.
     * @param CallOptions $options
     *
     * @return Page<Voice>
     */
    public function list(array $query = [], array $options = []): Page
    {
        $query = Params::check('voices->list', $query, self::LIST_VOICES_PARAMS);
        $request = new APIRequest('GET', '/tts/voices', RetryClass::Safe, query: $query, options: RequestOptions::from($options));

        return Page::fetch($this->http, $request, Voice::from(...));
    }

    /**
     * One voice by id. Stock voices are public; a clone of another organization throws NotFoundException.
     *
     * @param CallOptions $options
     */
    public function retrieve(string $id, array $options = []): Voice
    {
        $request = new APIRequest('GET', '/tts/voices/{id}', RetryClass::Safe, ['id' => $id], options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(Voice::from(...)));
    }

    /**
     * Changes a voice clone's name, category, language, transcript or tags. The clone keeps its id.
     *
     * Only the keys you pass are sent: a key left out stays as it is, and a null clears it. Changing the language or
     * the transcript re-creates the voice, which can take several minutes: pass a longer timeout for it. A timeout is
     * never retried here, because the voice may still be re-creating on the server.
     *
     * @param UpdateVoiceRequest $params
     *     - name: the new name, up to 120 characters.
     *     - category: the new category.
     *     - language: the new language. Changing it re-creates the voice.
     *     - ref_text: the new transcript, up to 1000 characters. Null or '' clears it. Changing it re-creates the
     *       voice.
     *     - tags: the new tags, up to 32 characters each. Null or [] clears them, and blank tags are dropped.
     * @param CallOptions $options
     */
    public function update(string $id, array $params, array $options = []): Voice
    {
        $body = Params::check('voices->update', $params, self::UPDATE_VOICE_REQUEST);
        $request = new APIRequest('PATCH', '/tts/voices/{id}', RetryClass::Recreate, ['id' => $id], body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(Voice::from(...)));
    }

    /**
     * Deletes a voice clone for good. A stock voice can't be deleted: like an unknown id, it throws NotFoundException.
     *
     * @param CallOptions $options
     */
    public function delete(string $id, array $options = []): void
    {
        $request = new APIRequest('DELETE', '/tts/voices/{id}', RetryClass::Safe, ['id' => $id], options: RequestOptions::from($options));
        $this->http->request($request, Readers::nothing());
    }
}
