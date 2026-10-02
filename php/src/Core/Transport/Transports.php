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
use Symfony\Component\HttpClient\HttpClient as SymfonyHttpClient;
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
        if ($client === null) {
            return self::made($classExists ?? class_exists(...));
        }
        if ($client instanceof GuzzleClientInterface) {
            return new GuzzleTransport($client);
        }
        if ($client instanceof SymfonyClient && self::takesOptions($client)) {
            return new SymfonyTransport($client);
        }

        return new Psr18Transport($client);
    }

    /** Whether Symfony's PSR-18 client takes options per request, as it does from Symfony 6.2 on. */
    public static function takesOptions(object $client): bool
    {
        return method_exists($client, 'withOptions');
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

    /**
     * The transport for a client the SDK makes. Symfony's is its own client, not its PSR-18 one, which takes options
     * per request only from 6.2 on. Each attempt wraps it in a PSR-18 client, which finds the PSR-17 factories as
     * factories() does, so a client without them is never made: factories() throws first.
     *
     * @param \Closure(string): bool $classExists
     */
    private static function made(\Closure $classExists): Transport
    {
        if ($classExists(GuzzleClient::class)) {
            return new GuzzleTransport(new GuzzleClient());
        }
        if ($classExists(SymfonyClient::class)) {
            return new SymfonyTransport(SymfonyHttpClient::create());
        }
        try {
            return self::for(Psr18ClientDiscovery::find());
        } catch (NotFoundException) {
            throw new NeuronAIException('No HTTP client was found: run composer require guzzlehttp/guzzle, or pass a PSR-18 client as http_client.');
        }
    }
}
