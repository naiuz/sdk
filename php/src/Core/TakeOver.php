<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Psr\Http\Message\ResponseInterface;

/**
 * A reader that takes the open answer over, instead of the core reading its whole body, as a stream does.
 *
 * $take gets a success answer of $mediaType (any, when it is null) with its body unread, and the attempt's deadline
 * no longer runs: the transport's timeout bounds each wait for a piece, read with Transport\Body::piece(). Once $take
 * returns, the body is the reader's to close; if $take throws, the core closes it. The core reads a success of
 * another media type whole, within the deadline, and throws APIException for it.
 *
 * @template T
 *
 * @internal
 */
final readonly class TakeOver
{
    /** @param \Closure(ResponseInterface, Attempt): T $take */
    public function __construct(public \Closure $take, public ?string $mediaType = null) {}

    /** Whether an answer is one to take over: its content type is $mediaType. */
    public function takes(ResponseInterface $response): bool
    {
        $type = strtolower(trim(explode(';', $response->getHeaderLine('content-type'))[0]));

        return $this->mediaType === null || $type === $this->mediaType;
    }
}
