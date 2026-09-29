import {describe, expect, it} from "vitest";
import type {APIRequest} from "../../src/core/http";
import {Page, requestPage} from "../../src/core/pagination";
import {APIError, InternalServerError, NeuronAIError} from "../../src/errors";
import {httpClient} from "../helpers/http";
import {apiError, json, mockFetch} from "../helpers/mock-fetch";

interface Item {
    id: string;
}

const listVoices: APIRequest = {method: "GET", path: "/tts/voices", query: {type: "custom", limit: 2}, retry: "safe", options: {extraHeaders: {"x-trace": "t1"}}};
const page = (ids: string[], nextCursor: string | null, requestId = "req-page"): Response =>
    json(200, {data: ids.map((id) => ({id})), next_cursor: nextCursor, request_id: requestId}, {"x-request-id": requestId});

describe("a list call", () => {
    it("resolves to the first page: its items, next_cursor and request_id", async () => {
        const {fetch} = mockFetch(page(["a", "b"], "cursor-2"));
        const first = await requestPage<Item>(httpClient(fetch).http, listVoices);
        expect(first).toBeInstanceOf(Page);
        expect(first.data).toEqual([{id: "a"}, {id: "b"}]);
        expect(first.next_cursor).toBe("cursor-2");
        expect(first.request_id).toBe("req-page");
        expect(first.hasNextPage()).toBe(true);
    });

    it("serializes a page as the list's envelope", async () => {
        const {fetch} = mockFetch(page(["a"], null));
        const first = await requestPage<Item>(httpClient(fetch).http, listVoices);
        expect(JSON.parse(JSON.stringify(first))).toEqual({data: [{id: "a"}], next_cursor: null, request_id: "req-page"});
    });

    it("fetches the next page with the same query and options, plus the cursor", async () => {
        const {fetch, requests} = mockFetch(page(["a", "b"], "cursor-2"), page(["c"], null, "req-2"));
        const first = await requestPage<Item>(httpClient(fetch).http, listVoices);
        const second = await first.nextPage();
        expect(second.data).toEqual([{id: "c"}]);
        expect(second.request_id).toBe("req-2");
        expect(second.hasNextPage()).toBe(false);
        expect(Object.fromEntries(requests[1]?.url.searchParams ?? [])).toEqual({type: "custom", limit: "2", cursor: "cursor-2"});
        expect(requests[1]?.headers.get("x-trace")).toBe("t1");
    });

    it("rejects nextPage() on the last page, sending nothing", async () => {
        const {fetch, requests} = mockFetch(page(["a"], null));
        const last = await requestPage<Item>(httpClient(fetch).http, listVoices);
        await expect(last.nextPage()).rejects.toThrow(NeuronAIError);
        await expect(last.nextPage()).rejects.toThrow("This is the last page: check hasNextPage() before calling nextPage().");
        expect(requests).toHaveLength(1);
    });

    it("treats an empty cursor as the last page", async () => {
        const {fetch} = mockFetch(page(["a"], ""));
        const last = await requestPage<Item>(httpClient(fetch).http, listVoices);
        expect(last.hasNextPage()).toBe(false);
    });

    it("walks every item across pages with for await", async () => {
        const {fetch, requests} = mockFetch(page(["a", "b"], "cursor-2"), page(["c", "d"], "cursor-3"), page(["e"], null));
        const ids: string[] = [];
        for await (const item of requestPage<Item>(httpClient(fetch).http, listVoices)) ids.push(item.id);
        expect(ids).toEqual(["a", "b", "c", "d", "e"]);
        expect(requests.map((request) => request.url.searchParams.get("cursor"))).toEqual([null, "cursor-2", "cursor-3"]);
    });

    it("fetches a page only when the loop reaches it", async () => {
        const {fetch, requests} = mockFetch(page(["a", "b"], "cursor-2"), page(["c"], null));
        const items = requestPage<Item>(httpClient(fetch).http, listVoices)[Symbol.asyncIterator]();
        await items.next();
        await items.next();
        expect(requests).toHaveLength(1);
        await items.next();
        expect(requests).toHaveLength(2);
    });

    it("walks on from a page already in hand", async () => {
        const {fetch} = mockFetch(page(["a"], "cursor-2"), page(["b"], null));
        const first = await requestPage<Item>(httpClient(fetch).http, listVoices);
        const ids: string[] = [];
        for await (const item of first) ids.push(item.id);
        expect(ids).toEqual(["a", "b"]);
    });

    it("stops the walk with the error of a page that fails", async () => {
        const {fetch} = mockFetch(page(["a"], "cursor-2"), apiError(500, "server_error"));
        const {http} = httpClient(fetch, {maxRetries: 0});
        const ids: string[] = [];
        const walk = async (): Promise<void> => {
            for await (const item of requestPage<Item>(http, listVoices)) ids.push(item.id);
        };
        await expect(walk()).rejects.toBeInstanceOf(InternalServerError);
        expect(ids).toEqual(["a"]);
    });

    it("raises APIError when the answer holds no data list", async () => {
        const {fetch} = mockFetch(json(200, {data: {id: "a"}, next_cursor: null, request_id: "req-1"}));
        await expect(requestPage<Item>(httpClient(fetch).http, listVoices)).rejects.toBeInstanceOf(APIError);
    });

    it("gives the first page with its status and headers through withResponse()", async () => {
        const {fetch} = mockFetch(page(["a"], null));
        const {data, status} = await requestPage<Item>(httpClient(fetch).http, listVoices).withResponse();
        expect(data.data).toEqual([{id: "a"}]);
        expect(status).toBe(200);
    });
});
