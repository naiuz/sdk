<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * Which failures a call may retry, as the spec's retry table gives them.
 *
 * Every class retries a 429, and a connection error raised before the request was sent. Beyond that:
 * - Safe: GET, DELETE, apiKeys->update and apiKeys->revoke. Also 500, 502, 503 and 504, and a timeout or a connection
 *   error after sending.
 * - Idempotent: the five POSTs that send an Idempotency-Key. Also any 5xx, and a timeout or a connection error after
 *   sending.
 * - Paid: chat completions, embeddings and rerank. Also a 5xx that carries the API's own error envelope, but not a
 *   bare page from a proxy or gateway, and not a timeout or a connection error once the request was sent: the call
 *   may have completed and been charged.
 * - Recreate: voices->update and voices->replaceAudio. Also a 5xx that carries the API's own error envelope, but not
 *   a bare gateway page, and not after sending, since either may still be re-creating the voice.
 * - Once: apiKeys->create. Nothing more, since a retry could create a second key.
 *
 * @internal
 */
enum RetryClass: string
{
    case Safe = 'safe';
    case Idempotent = 'idempotent';
    case Paid = 'paid';
    case Recreate = 'recreate';
    case Once = 'once';
}
