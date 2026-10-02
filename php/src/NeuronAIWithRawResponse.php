<?php

declare(strict_types=1);

namespace Naiuz;

use Naiuz\Core\HttpClient;
use Naiuz\Resources\AccountWithRawResponse;
use Naiuz\Resources\TtsWithRawResponse;
use Naiuz\Resources\VoicesWithRawResponse;

/**
 * The client's resources, each method returning a RawResponse: its result with the status and headers of the answer
 * it came from. A list's gives its first page.
 */
final readonly class NeuronAIWithRawResponse
{
    /** Your organization's balance and usage. */
    public AccountWithRawResponse $account;

    /** Stock voices and your organization's voice clones. */
    public VoicesWithRawResponse $voices;

    /** Text to speech. */
    public TtsWithRawResponse $tts;

    /** @internal */
    public function __construct(HttpClient $http)
    {
        $this->account = new AccountWithRawResponse($http);
        $this->voices = new VoicesWithRawResponse($http);
        $this->tts = new TtsWithRawResponse($http);
    }
}
