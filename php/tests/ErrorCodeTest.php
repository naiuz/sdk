<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Core\ErrorFactory;
use Naiuz\ErrorCode;
use Naiuz\Tests\Support\Spec;

final class ErrorCodeTest extends TestCase
{
    public function test_it_holds_exactly_the_api_s_38_codes_in_the_document_s_order(): void
    {
        $documented = Spec::strings(Spec::at(Spec::read('openapi.json'), 'components', 'schemas', 'ErrorCode', 'enum'));
        self::assertCount(38, $documented);
        self::assertSame($documented, array_map(static fn(ErrorCode $case): string => $case->value, ErrorCode::cases()));
    }

    public function test_each_case_is_named_after_its_code_in_pascal_case(): void
    {
        foreach (ErrorCode::cases() as $case) {
            self::assertSame(str_replace('_', '', ucwords($case->value, '_')), $case->name);
        }
    }

    public function test_an_exception_s_code_compares_with_a_case_s_value(): void
    {
        $error = ErrorFactory::make(402, '', [], '{"error": {"code": "insufficient_balance", "message": "Top up."}}');
        self::assertSame(ErrorCode::InsufficientBalance, ErrorCode::tryFrom((string) $error->error_code));
        self::assertSame(ErrorCode::InsufficientBalance->value, $error->error_code);
        $later = ErrorFactory::make(400, '', [], '{"error": {"code": "brand_new_code", "message": "New."}}');
        self::assertNull(ErrorCode::tryFrom((string) $later->error_code));
    }
}
