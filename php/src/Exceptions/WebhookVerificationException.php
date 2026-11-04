<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * A webhook's signature didn't check out: answer 400 and do nothing with the body.
 */
class WebhookVerificationException extends NeuronAIException {}
