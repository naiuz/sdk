import {NeuronAIError} from "../errors";
import {APIPromise} from "./api-promise";
import type {APIRequest, HttpClient} from "./http";
import {readJsonObject, requestIdOf} from "./parse";

async function* walk<T>(first: Page<T>): AsyncGenerator<T, void, undefined> {
    for (let page = first; ; page = await page.nextPage()) {
        yield* page.data;
        if (!page.hasNextPage()) return;
    }
}

/** One page of a list. Loop over it with `for await` to walk its items and every page after it. */
export class Page<T> implements AsyncIterable<T> {
    /** This page's items. */
    readonly data: T[];
    /** Pass it as `cursor` to get the next page; `null` on the last page. Cursors are opaque: don't build or change them. */
    readonly next_cursor: string | null;
    /** The request's ID, to quote to support: the answer's `request_id`, else its `X-Request-Id` header, else `null`. */
    readonly request_id: string | null;
    readonly #fetchPage: (cursor: string) => PagePromise<T>;

    constructor(body: {data: T[]; next_cursor: string | null; request_id: string | null}, fetchPage: (cursor: string) => PagePromise<T>) {
        this.data = body.data;
        this.next_cursor = body.next_cursor;
        this.request_id = body.request_id;
        this.#fetchPage = fetchPage;
    }

    /** Whether another page follows this one. */
    hasNextPage(): boolean {
        return this.next_cursor !== null && this.next_cursor !== "";
    }

    /** The page after this one, fetched with the same query and options. On the last page it rejects with NeuronAIError. */
    nextPage(): PagePromise<T> {
        const cursor = this.next_cursor;
        if (cursor === null || cursor === "") {
            return new PagePromise<T>(Promise.reject(new NeuronAIError("This is the last page: check hasNextPage() before calling nextPage().")));
        }
        return this.#fetchPage(cursor);
    }

    [Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
        return walk(this);
    }
}

/** What a list method returns: await it for the first page, or loop over it with `for await` to walk every item across pages. */
export class PagePromise<T> extends APIPromise<Page<T>> implements AsyncIterable<T> {
    async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
        yield* await this;
    }
}

/** Sends a list call. The Page it resolves to fetches later pages with the same request and the next cursor. */
export function requestPage<T>(http: HttpClient, request: APIRequest): PagePromise<T> {
    const fetchPage = (cursor: string): PagePromise<T> => requestPage<T>(http, {...request, query: {...request.query, cursor}});
    return new PagePromise<T>(
        http.send(request, async (response, attempt) => {
            const body = await readJsonObject(response, attempt, (candidate) => Array.isArray(candidate.data));
            const nextCursor = typeof body.next_cursor === "string" ? body.next_cursor : null;
            return new Page<T>({data: body.data as T[], next_cursor: nextCursor, request_id: requestIdOf(body, response.headers)}, fetchPage);
        }),
    );
}
