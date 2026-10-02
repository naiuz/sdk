<?php

declare(strict_types=1);

namespace Naiuz;

/**
 * A call's result, with the status and headers of the answer it came from: what each method of withRawResponse()
 * returns.
 *
 * @template-covariant T
 */
final readonly class RawResponse
{
    /**
     * @param T $data What the call returns without withRawResponse(), with its request_id or cost.
     * @param int $status The answer's HTTP status.
     * @param array<string, string> $headers The answer's headers, by lower-case name, such as `x-request-id` and
     *     `x-cost`; a repeated header's values are joined with ", ".
     */
    public function __construct(public mixed $data, public int $status, public array $headers) {}
}
