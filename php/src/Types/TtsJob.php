<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A synthesis job and where it stands. A final state never changes.
 *
 * cost, balance_after, latency_ms and audio_url are set once it has succeeded, and error once it has failed.
 */
final readonly class TtsJob extends ApiObject
{
    /**
     * @param string $id The job's id.
     * @param string $status `queued`, `running`, `succeeded` or `failed` (see TtsJobStatus), or a status the API adds
     *     later.
     * @param string $created_at When the job was created (ISO 8601).
     * @param string|null $started_at When a worker started on the job, or null while it is queued.
     * @param string|null $finished_at When the job succeeded or failed, or null until then.
     * @param int $character_count The text's spoken length, the measure billing uses.
     * @param float|null $cost The price, in UZS, once the job has succeeded; null until then.
     * @param float|null $balance_after The balance after the charge, once the job has succeeded; null until then.
     * @param bool $voice_custom Whether the voice is one of your clones.
     * @param float|null $latency_ms How long synthesis took, in milliseconds, once the job has succeeded; null until
     *     then.
     * @param TtsJobError|null $error Why the job failed, once it has failed; null otherwise.
     * @param string|null $audio_url Where to download the audio once the job has succeeded; null until then.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id`, else its
     *     `X-Request-Id` header. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public string $status,
        public string $created_at,
        public ?string $started_at,
        public ?string $finished_at,
        public int $character_count,
        public ?float $cost,
        public ?float $balance_after,
        public bool $voice_custom,
        public ?float $latency_ms,
        public ?TtsJobError $error,
        public ?string $audio_url,
        public ?string $request_id,
    ) {
        parent::__construct($sent);
    }

    /**
     * A job from its fields, as the API sends them.
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
            $fields->string('id'),
            $fields->string('status'),
            $fields->string('created_at'),
            $fields->nullableString('started_at'),
            $fields->nullableString('finished_at'),
            $fields->int('character_count'),
            $fields->nullableFloat('cost'),
            $fields->nullableFloat('balance_after'),
            $fields->bool('voice_custom'),
            $fields->nullableFloat('latency_ms'),
            $fields->nullableObjectOf('error', TtsJobError::from(...)),
            $fields->nullableString('audio_url'),
            $request_id,
        );
    }
}
