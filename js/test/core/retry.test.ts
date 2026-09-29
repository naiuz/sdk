import {describe, expect, it} from "vitest";
import {failedBeforeSending, isRetryable, MAX_RETRY_AFTER_SECONDS, retryDelay, type AttemptFailure, type RetryClass} from "../../src/core/retry";

const CLASSES: RetryClass[] = ["safe", "idempotent", "paid", "recreate", "once"];
const status = (code: number): AttemptFailure => ({kind: "status", status: code});

describe("isRetryable follows the spec's retry table", () => {
    it.each<[string, AttemptFailure, RetryClass[]]>([
        ["a 429", status(429), ["safe", "idempotent", "paid", "recreate", "once"]],
        ["a connection error before sending", {kind: "connection", beforeSend: true}, ["safe", "idempotent", "paid", "recreate", "once"]],
        ["a 500", status(500), ["safe", "idempotent", "paid", "recreate"]],
        ["a 502", status(502), ["safe", "idempotent", "paid", "recreate"]],
        ["a 503", status(503), ["safe", "idempotent", "paid", "recreate"]],
        ["a 504", status(504), ["safe", "idempotent", "paid", "recreate"]],
        ["a 501", status(501), ["idempotent", "paid", "recreate"]],
        ["a 507", status(507), ["idempotent", "paid", "recreate"]],
        ["a timeout", {kind: "timeout"}, ["safe", "idempotent"]],
        ["a connection error after sending", {kind: "connection", beforeSend: false}, ["safe", "idempotent"]],
        ["a 400", status(400), []],
        ["a 404", status(404), []],
        ["a 409", status(409), []],
        ["a 422", status(422), []],
    ])("retries %s in exactly these classes", (_label, failure, expected) => {
        expect(CLASSES.filter((retryClass) => isRetryable(retryClass, failure))).toEqual(expected);
    });
});

describe("retryDelay", () => {
    it("doubles from 0.5 s", () => {
        expect([0, 1, 2, 3].map((retry) => retryDelay(retry, null, () => 0))).toEqual([500, 1000, 2000, 4000]);
    });

    it("adds up to 25% jitter", () => {
        expect(retryDelay(0, null, () => 0.5)).toBe(562.5);
        expect(retryDelay(1, null, () => 0.999)).toBeCloseTo(1249.75);
    });

    it("never waits more than 8 s", () => {
        expect(retryDelay(4, null, () => 0.999)).toBe(8000);
        expect(retryDelay(20, null, () => 0)).toBe(8000);
    });

    it("waits what Retry-After says instead, without jitter", () => {
        expect(retryDelay(0, 12, () => 0.9)).toBe(12000);
        expect(retryDelay(3, 0, () => 0.9)).toBe(0);
    });

    it("gives up rather than wait more than a minute", () => {
        expect(MAX_RETRY_AFTER_SECONDS).toBe(60);
        expect(retryDelay(0, 60, () => 0)).toBe(60000);
        expect(retryDelay(0, 61, () => 0)).toBeNull();
        expect(retryDelay(0, 1800, () => 0)).toBeNull();
    });
});

describe("failedBeforeSending", () => {
    const withCode = (message: string, code: string): Error => Object.assign(new Error(message), {code});

    it("sees a refused connection, a failed lookup or a connect timeout on the error's cause", () => {
        for (const code of ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT", "ConnectionRefused", "FailedToOpenSocket"]) {
            expect(failedBeforeSending(new TypeError("fetch failed", {cause: withCode("no", code)})), code).toBe(true);
        }
    });

    it("looks inside an AggregateError, as a failed connection to every address raises", () => {
        const aggregate = Object.assign(new AggregateError([withCode("a", "ECONNREFUSED"), withCode("b", "ECONNREFUSED")], "all failed"), {code: "ECONNREFUSED"});
        expect(failedBeforeSending(new TypeError("fetch failed", {cause: new AggregateError([withCode("a", "ECONNREFUSED")])}))).toBe(true);
        expect(failedBeforeSending(aggregate)).toBe(true);
    });

    it("counts a reset, a closed socket or an error without a code as possibly sent", () => {
        expect(failedBeforeSending(new TypeError("fetch failed", {cause: withCode("read ECONNRESET", "ECONNRESET")}))).toBe(false);
        expect(failedBeforeSending(new TypeError("fetch failed", {cause: withCode("other side closed", "UND_ERR_SOCKET")}))).toBe(false);
        expect(failedBeforeSending(new TypeError("error sending request"))).toBe(false);
        expect(failedBeforeSending("a string")).toBe(false);
    });
});
