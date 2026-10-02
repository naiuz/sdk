<?php

declare(strict_types=1);

namespace Naiuz\Types;

/**
 * What a voice is for. A voice's own category stays a string, so a category the API adds later still arrives:
 * compare it with a case's value.
 */
enum VoiceCategory: string
{
    case Conversational = 'conversational';
    case Narration = 'narration';
    case Characters = 'characters';
    case SocialMedia = 'social_media';
    case Educational = 'educational';
}
