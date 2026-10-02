<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Core\Url;
use Naiuz\Exceptions\NeuronAIException;
use PHPUnit\Framework\Attributes\DataProvider;

final class UrlTest extends TestCase
{
    private const BASE_URL = 'https://my.neuronai.uz/api/v1';

    public function test_encode_path_param_leaves_rfc_3986_s_unreserved_characters_alone(): void
    {
        self::assertSame('AZaz09-._~', Url::encodePathParam('AZaz09-._~'));
    }

    public function test_encode_path_param_escapes_everything_else_as_utf_8(): void
    {
        self::assertSame('it%27s%20%281%29%2A%21', Url::encodePathParam("it's (1)*!"));
        self::assertSame('a%2Fb%3Fc%23d', Url::encodePathParam('a/b?c#d'));
        self::assertSame('ovoz%20%C3%A9', Url::encodePathParam('ovoz é'));
    }

    public function test_build_joins_the_base_url_and_the_path_filling_in_encoded_parameters(): void
    {
        self::assertSame(self::BASE_URL . '/tts/voices/voice%20%281%29', Url::build(self::BASE_URL, '/tts/voices/{id}', ['id' => 'voice (1)']));
        self::assertSame(self::BASE_URL . '/api-keys/01j9/revoke', Url::build(self::BASE_URL, '/api-keys/{id}/revoke', ['id' => '01j9']));
    }

    public function test_build_ignores_trailing_slashes_on_the_base_url(): void
    {
        self::assertSame(self::BASE_URL . '/balance', Url::build(self::BASE_URL . '//', '/balance'));
    }

    #[DataProvider('pathParametersNamingAnotherEndpoint')]
    public function test_build_refuses_a_path_parameter_that_would_name_another_endpoint(string $value): void
    {
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage('The path parameter "id" must be a non-empty string other than "." and "..".');
        Url::build(self::BASE_URL, '/tts/voices/{id}', ['id' => $value]);
    }

    /** @return iterable<string, array{string}> */
    public static function pathParametersNamingAnotherEndpoint(): iterable
    {
        yield 'empty' => [''];
        yield 'dot' => ['.'];
        yield 'dot dot' => ['..'];
    }

    public function test_build_refuses_a_path_parameter_that_isn_t_a_string_or_is_missing(): void
    {
        foreach ([['id' => 42], []] as $pathParams) {
            try {
                Url::build(self::BASE_URL, '/tts/voices/{id}', $pathParams);
                self::fail('The call should have been refused.');
            } catch (NeuronAIException $error) {
                self::assertStringStartsWith('The path parameter "id"', $error->getMessage());
            }
        }
    }

    public function test_build_adds_the_query_leaving_nulls_out_and_sending_the_rest_as_text_in_order(): void
    {
        $query = ['type' => 'custom', 'language' => null, 'limit' => 2, 'cursor' => null, 'flag' => false];
        self::assertSame(self::BASE_URL . '/tts/voices?type=custom&limit=2&flag=false', Url::build(self::BASE_URL, '/tts/voices', [], $query));
        self::assertSame(self::BASE_URL . '/tts/voices', Url::build(self::BASE_URL, '/tts/voices', [], ['cursor' => null]));
    }

    public function test_an_opaque_cursor_goes_back_exactly_as_it_came(): void
    {
        $cursor = 'eyJpZCI6IjAxaiJ9+/=&x y';
        $query = (string) parse_url(Url::build(self::BASE_URL, '/tts/voices', [], ['cursor' => $cursor]), PHP_URL_QUERY);
        parse_str($query, $parsed);
        self::assertSame(['cursor' => $cursor], $parsed);
    }

    public function test_query_refuses_a_value_that_isn_t_a_string_a_number_or_a_boolean(): void
    {
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage('The query parameter "limit" must be a string, a number or a boolean.');
        Url::query(['limit' => [1, 2]]);
    }
}
