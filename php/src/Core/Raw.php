<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\RawResponse;

/**
 * How a method of withRawResponse() gets its answer's status and headers.
 *
 * @internal
 */
final class Raw
{
    /**
     * Makes the call on a copy of the core that records the answer its result comes from, and returns the result with
     * that answer's status and headers. Each call gets its own copy, so calls never share what they record.
     *
     * @template T
     *
     * @param \Closure(HttpClient): T $call
     *
     * @return RawResponse<T>
     */
    public static function capture(HttpClient $http, \Closure $call): RawResponse
    {
        $captured = new Captured();
        $data = $call($http->capturingInto($captured));

        return new RawResponse($data, $captured->status, $captured->headers);
    }
}
