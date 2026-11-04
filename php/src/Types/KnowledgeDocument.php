<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A document agents answer from.
 */
final readonly class KnowledgeDocument extends ApiObject
{
    /**
     * @param int $id The document's id.
     * @param string $name Its name.
     * @param string $kind `file`, `text`, `qa` or a link's kind.
     * @param string $status How far reading it has got, such as `processing` or `ready`.
     * @param string|null $failure_reason Why reading it failed.
     * @param bool $searchable Whether agents can find it.
     * @param string|null $source_url A link's address.
     * @param string|null $crawl_scope How far a website is read.
     * @param string|null $last_fetched_at When a link was last read.
     * @param string|null $next_refresh_at When a link is next read.
     * @param int $bytes Its size.
     * @param int $char_count Its characters.
     * @param int $page_count Its pages.
     * @param int $row_count A spreadsheet's rows.
     * @param int $ocr_pages The pages read from images.
     * @param int $chunk_count The passages it was split into.
     * @param bool $truncated Whether it was cut short.
     * @param int $pages_done A website's pages read so far.
     * @param int $pages_total A website's pages found so far.
     * @param int|null $refused_char_count How many characters over the limit it was.
     * @param string|null $created_at When it was added.
     * @param string|null $updated_at When it last changed.
     * @param list<DocumentUser> $used_by The agents that use it.
     * @param string|null $text A text document's text.
     * @param list<DocumentPair>|null $pairs A questions document's pairs.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public int $id,
        public string $name,
        public string $kind,
        public string $status,
        public ?string $failure_reason,
        public bool $searchable,
        public ?string $source_url,
        public ?string $crawl_scope,
        public ?string $last_fetched_at,
        public ?string $next_refresh_at,
        public int $bytes,
        public int $char_count,
        public int $page_count,
        public int $row_count,
        public int $ocr_pages,
        public int $chunk_count,
        public bool $truncated,
        public int $pages_done,
        public int $pages_total,
        public ?int $refused_char_count,
        public ?string $created_at,
        public ?string $updated_at,
        public array $used_by,
        public ?string $text,
        public ?array $pairs,
        public ?string $request_id,
    ) {
        parent::__construct($sent);
    }

    /**
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data, ?string $request_id = null): self
    {
        $fields = Fields::of($data);

        return new self(
            $fields->object(),
            $fields->int('id'),
            $fields->string('name'),
            $fields->string('kind'),
            $fields->string('status'),
            $fields->nullableString('failure_reason'),
            $fields->bool('searchable'),
            $fields->nullableString('source_url'),
            $fields->nullableString('crawl_scope'),
            $fields->nullableString('last_fetched_at'),
            $fields->nullableString('next_refresh_at'),
            $fields->int('bytes'),
            $fields->int('char_count'),
            $fields->int('page_count'),
            $fields->int('row_count'),
            $fields->int('ocr_pages'),
            $fields->int('chunk_count'),
            $fields->bool('truncated'),
            $fields->int('pages_done'),
            $fields->int('pages_total'),
            $fields->nullableInt('refused_char_count'),
            $fields->nullableString('created_at'),
            $fields->nullableString('updated_at'),
            $fields->listOf('used_by', DocumentUser::from(...)),
            $fields->optionalString('text'),
            $fields->optionalListOf('pairs', DocumentPair::from(...)),
            $request_id,
        );
    }
}
