<?php

declare(strict_types=1);

namespace Naiuz\Core\Transport;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\ClientInterface as GuzzleClientInterface;
use Http\Discovery\Exception\NotFoundException;
use Http\Discovery\Psr17FactoryDiscovery;
use Http\Discovery\Psr18ClientDiscovery;
use Naiuz\Exceptions\NeuronAIException;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestFactoryInterface;
use Psr\Http\Message\StreamFactoryInterface;
use Symfony\Component\HttpClient\Psr18Client as SymfonyClient;

/**
 * Which transport sends the calls, and the PSR-17 factories that build them.
 *
 * @internal
 */
final class Transports
{
    /**
     * The transport for the client given, or for one the SDK makes: Guzzle when it is installed, else Symfony
     * HttpClient, else whatever PSR-18 client php-http/discovery finds.
     *
     * @param \Closure(string): bool|null $classExists Says whether a class can be loaded; class_exists() by default.
     *
     * @throws NeuronAIException when no client is given and none can be made
     */
    public static function for(?ClientInterface $client, ?\Closure $classExists = null): Transport
    {
        $client ??= self::defaultClient($classExists ?? class_exists(...));
        if ($client instanceof GuzzleClientInterface) {
            return new GuzzleTransport($client);
        }
        if ($client instanceof SymfonyClient) {
            return new SymfonyTransport($client);
        }

        return new Psr18Transport($client);
    }

    /**
     * The PSR-17 factories the SDK builds requests and bodies with, as php-http/discovery finds them.
     *
     * @return array{RequestFactoryInterface, StreamFactoryInterface}
     *
     * @throws NeuronAIException when none is installed
     */
    public static function factories(): array
    {
        try {
            return [Psr17FactoryDiscovery::findRequestFactory(), Psr17FactoryDiscovery::findStreamFactory()];
        } catch (NotFoundException) {
            throw new NeuronAIException('No PSR-17 HTTP factories were found: run composer require guzzlehttp/guzzle, or install another PSR-7 implementation such as nyholm/psr7.');
        }
    }

    /** @param \Closure(string): bool $classExists */
    private static function defaultClient(\Closure $classExists): ClientInterface
    {
        if ($classExists(GuzzleClient::class)) {
            return new GuzzleClient();
        }
        if ($classExists(SymfonyClient::class)) {
            try {
                return new SymfonyClient();
            } catch (\LogicException) {
                // Symfony's client needs a PSR-17 implementation, and there is none: let discovery look on.
            }
        }
        try {
            return Psr18ClientDiscovery::find();
        } catch (NotFoundException) {
            throw new NeuronAIException('No HTTP client was found: run composer require guzzlehttp/guzzle, or pass a PSR-18 client as http_client.');
        }
    }
}
