import {afterEach, describe, expect, test, vi} from "vitest";
import {newClientMessageId} from "../src/index";

describe("a message's client id", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("is a UUID where the page is secure", () => {
        expect(newClientMessageId()).toMatch(/^[0-9a-f-]{36}$/);
    });

    test("is still random where it isn't, as on a plain http page", () => {
        let value = 0;
        vi.stubGlobal("crypto", {getRandomValues: (bytes: Uint8Array) => bytes.fill((value += 1))});
        const first = newClientMessageId();
        expect(first).toMatch(/^[0-9a-f]{32}$/);
        expect(newClientMessageId()).not.toBe(first);
    });
});
