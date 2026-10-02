<?php

declare(strict_types=1);

namespace Naiuz\Types;

/**
 * A dialogue's audio: everything SpeechAudio has, and where each turn sits in it.
 */
final readonly class DialogueAudio extends SpeechAudio
{
    /**
     * @param list<DialogueTurnTiming> $turns Where each turn is in the audio (`X-Turns`), so you can seek to a line;
     *     empty when the answer lacks the header, or it isn't a list of turns.
     * @param int|null $turn_count The number of turns rendered (`X-Turn-Count`).
     */
    public function __construct(
        string $audio,
        string $content_type,
        ?float $cost,
        ?int $character_count,
        ?float $balance,
        bool $voice_custom,
        ?float $latency_ms,
        bool $replayed,
        ?string $request_id,
        public array $turns,
        public ?int $turn_count,
    ) {
        parent::__construct($audio, $content_type, $cost, $character_count, $balance, $voice_custom, $latency_ms, $replayed, $request_id);
    }
}
