<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Files;
use Naiuz\Exceptions\NeuronAIException;

/**
 * Synthesized speech: the WAV file's bytes, and what the answer's headers say about it.
 *
 * A number is null when the answer lacks its header, and a flag is false. var_dump() and print_r() show the audio's
 * size, not its bytes.
 */
readonly class SpeechAudio
{
    /**
     * @param string $audio The WAV file's bytes.
     * @param string $content_type The media type, `audio/wav`.
     * @param float|null $cost The price billed, in credits (`X-Cost`).
     * @param int|null $character_count The characters billed (`X-Character-Count`): an emotion tag counts as one.
     * @param float|null $balance Your balance after the charge, in credits (`X-Balance`).
     * @param bool $voice_custom Whether the voice is one of your clones (`X-Voice-Custom: 1`); for a dialogue, whether
     *     any turn's is.
     * @param float|null $latency_ms How long the voice took, in milliseconds (`X-Latency-Ms`).
     * @param bool $replayed Whether this answer replays an earlier call with the same Idempotency-Key
     *     (`Idempotency-Replayed: 1`), and so charged nothing new.
     * @param string|null $request_id The request's ID (`X-Request-Id`), to quote to support.
     */
    public function __construct(
        public string $audio,
        public string $content_type,
        public ?float $cost,
        public ?int $character_count,
        public ?float $balance,
        public bool $voice_custom,
        public ?float $latency_ms,
        public bool $replayed,
        public ?string $request_id,
    ) {}

    /**
     * Writes the WAV file to $path, replacing a file already there.
     *
     * @throws NeuronAIException naming the path and why, when it can't be written
     */
    public function save(string $path): void
    {
        try {
            Files::write($path, $this->audio);
        } catch (\RuntimeException $error) {
            throw new NeuronAIException("The audio couldn't be written to {$path}: {$error->getMessage()}");
        }
    }

    /**
     * What var_dump() and print_r() show: every field, with the audio as its size.
     *
     * @return array<string, mixed>
     */
    public function __debugInfo(): array
    {
        $fields = [];
        foreach (get_object_vars($this) as $name => $value) {
            $fields[(string) $name] = $name === 'audio' ? sprintf('<%d bytes>', strlen($this->audio)) : $value;
        }

        return $fields;
    }
}
