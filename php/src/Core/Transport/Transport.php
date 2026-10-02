<?php

declare(strict_types=1);

namespace Naiuz\Core\Transport;

use Naiuz\Core\Answer;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Sends one attempt of a call through an HTTP client.
 *
 * @internal
 */
interface Transport
{
    /**
     * Sends the request and reads its whole answer, all within $timeout seconds.
     *
     * @throws TransportFailure when no whole answer arrived in time
     */
    public function fetch(#[\SensitiveParameter] RequestInterface $request, float $timeout): Answer;

    /**
     * Sends the request and hands the answer over once its headers have arrived, its body unread, as a stream needs.
     * $timeout bounds the wait for the headers, then each wait for a piece of the body, but not the whole body.
     *
     * @throws TransportFailure when no answer arrived in time
     */
    public function open(#[\SensitiveParameter] RequestInterface $request, float $timeout): ResponseInterface;
}
