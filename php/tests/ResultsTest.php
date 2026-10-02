<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Core\Fields;
use Naiuz\Tests\Support\Item;
use Naiuz\Tests\Support\Priced;
use Naiuz\Types\ErrorDetail;
use Naiuz\Types\ErrorEnvelope;

final class ResultsTest extends TestCase
{
    public function test_it_keeps_a_field_the_sdk_doesn_t_know_and_gives_it_back(): void
    {
        $item = Item::from(['id' => 'v1', 'gender' => 'female', 'meta' => ['new' => 1]]);
        self::assertSame(['id' => 'v1', 'gender' => 'female', 'meta' => ['new' => 1]], $item->toArray());
        self::assertSame('{"id":"v1","gender":"female","meta":{"new":1}}', json_encode($item));
    }

    public function test_it_takes_an_enum_value_the_sdk_doesn_t_know_yet_as_a_string(): void
    {
        $detail = ErrorDetail::from(['type' => 'brand_new_type', 'code' => 'brand_new_code', 'message' => 'New.', 'param' => null]);
        self::assertSame(['brand_new_type', 'brand_new_code'], [$detail->type, $detail->code]);
    }

    public function test_it_gives_back_exactly_the_fields_the_answer_held_a_null_as_null_and_an_empty_object_as_one(): void
    {
        $item = Item::from(json_decode('{"id":"v1","name":null,"tags":[],"extra":{}}', false, 512, JSON_THROW_ON_ERROR));
        self::assertNull($item->name);
        self::assertSame(['id' => 'v1', 'name' => null, 'tags' => [], 'extra' => []], $item->toArray());
        self::assertSame('{"id":"v1","name":null,"tags":[],"extra":{}}', json_encode($item));
        self::assertSame(['id' => 'v1'], Item::from(['id' => 'v1'])->toArray());
    }

    public function test_the_request_id_is_attached_but_is_not_a_field(): void
    {
        $item = Item::from(['id' => 'v1'], 'req-1');
        self::assertSame('req-1', $item->request_id);
        self::assertSame(['id' => 'v1'], $item->toArray());
        self::assertSame('{"id":"v1"}', json_encode($item));
        self::assertNull(Item::from(['id' => 'v1'])->request_id);
    }

    public function test_the_cost_is_attached_but_is_not_a_field(): void
    {
        $priced = Priced::from(['id' => 'chatcmpl-1'], 0.34);
        self::assertSame(0.34, $priced->cost);
        self::assertSame('{"id":"chatcmpl-1"}', json_encode($priced));
        self::assertNull(Priced::from(['id' => 'chatcmpl-1'])->cost);
    }

    public function test_changing_what_to_array_gives_changes_nothing_in_the_object(): void
    {
        $item = Item::from(['id' => 'v1']);
        $fields = $item->toArray();
        $fields['id'] = 'changed';
        $object = $item->jsonSerialize();
        $object->id = 'changed too';
        self::assertSame(['id' => 'v1'], $item->toArray());
        self::assertSame('v1', $item->id);
    }

    public function test_a_field_the_api_always_sends_that_is_missing_or_of_another_type_is_named_and_its_value_never_quoted(): void
    {
        foreach ([[[], 'The field "id" is missing.'], [['id' => ['token-in-the-body']], 'The field "id" must be a string.']] as [$data, $message]) {
            try {
                Item::from($data);
                self::fail('The object should have been refused.');
            } catch (\UnexpectedValueException $error) {
                self::assertSame($message, $error->getMessage());
            }
        }
    }

    public function test_numbers_read_by_value_but_never_from_text(): void
    {
        $fields = Fields::of(['whole' => 5.0, 'price' => 10000, 'text' => '5', 'half' => 2.5]);
        self::assertSame(5, $fields->int('whole'));
        self::assertSame(10000.0, $fields->float('price'));
        $this->expectException(\UnexpectedValueException::class);
        $this->expectExceptionMessage('The field "half" must be a whole number.');
        $fields->int('half');
    }

    public function test_a_number_never_reads_from_text(): void
    {
        $this->expectExceptionMessage('The field "text" must be a number.');
        Fields::of(['text' => '5'])->float('text');
    }

    public function test_an_error_answer_s_body_reads_as_an_error_envelope(): void
    {
        $body = [
            'error' => ['type' => 'invalid_request_error', 'code' => 'invalid_request', 'message' => 'No.', 'param' => 'text', 'fields' => ['text' => 'No.']],
            'request_id' => 'req-1',
        ];
        $envelope = ErrorEnvelope::from($body);
        self::assertSame(['invalid_request', ['text' => 'No.'], 'req-1'], [$envelope->error->code, $envelope->error->fields, $envelope->request_id]);
        self::assertSame($body, $envelope->toArray());
        self::assertNull(ErrorDetail::from(['type' => 't', 'code' => 'c', 'message' => 'm', 'param' => null])->fields);
    }
}
