<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The organization's remaining credits, and its prices.
 */
final readonly class Balance extends ApiObject
{
    /**
     * @param float $balance The remaining balance, in `currency`.
     * @param string $formatted The balance written for people, such as `10 000 credits`.
     * @param string $currency The unit of the balance and the prices: `credits`.
     * @param float $stt_price_per_minute The price of one minute of transcription, in `currency`.
     * @param float $tts_price_per_char The price of one character of speech, in `currency`.
     * @param float $min_topup The smallest top-up, in `currency`.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id`, else its
     *     `X-Request-Id` header. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public float $balance,
        public string $formatted,
        public string $currency,
        public float $stt_price_per_minute,
        public float $tts_price_per_char,
        public float $min_topup,
        public ?string $request_id,
    ) {
        parent::__construct($sent);
    }

    /**
     * A balance from its fields, as the API sends them.
     *
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data, ?string $request_id = null): self
    {
        $fields = Fields::of($data);

        return new self(
            $fields->object(),
            $fields->float('balance'),
            $fields->string('formatted'),
            $fields->string('currency'),
            $fields->float('stt_price_per_minute'),
            $fields->float('tts_price_per_char'),
            $fields->float('min_topup'),
            $request_id,
        );
    }
}
