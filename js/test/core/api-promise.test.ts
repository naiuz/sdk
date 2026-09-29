import {describe, expect, it} from "vitest";
import {APIPromise} from "../../src/core/api-promise";
import {NeuronAIError} from "../../src/errors";

const answer = <T>(data: T) => Promise.resolve({data, status: 201, headers: new Headers({"x-request-id": "req-1"})});

describe("APIPromise", () => {
    it("resolves to the result when awaited", async () => {
        await expect(new APIPromise(answer({id: "v1"}))).resolves.toEqual({id: "v1"});
    });

    it("gives the result with the status and headers from withResponse()", async () => {
        const {data, status, headers} = await new APIPromise(answer({id: "v1"})).withResponse();
        expect(data).toEqual({id: "v1"});
        expect(status).toBe(201);
        expect(headers.get("x-request-id")).toBe("req-1");
    });

    it("rejects the same way whether awaited or asked for its response", async () => {
        const failed = new APIPromise<never>(Promise.reject(new NeuronAIError("boom")));
        await expect(failed).rejects.toThrow("boom");
        await expect(failed.withResponse()).rejects.toThrow("boom");
    });

    it("supports then, catch and finally like a promise", async () => {
        const doubled = await new APIPromise(answer(2)).then((value) => value * 2);
        expect(doubled).toBe(4);
        const caught = await new APIPromise<number>(Promise.reject(new NeuronAIError("boom"))).catch((error: unknown) => (error as Error).message);
        expect(caught).toBe("boom");
        let settled = false;
        await new APIPromise(answer(1)).finally(() => {
            settled = true;
        });
        expect(settled).toBe(true);
    });

    it("works with Promise.all", async () => {
        await expect(Promise.all([new APIPromise(answer("a")), new APIPromise(answer("b"))])).resolves.toEqual(["a", "b"]);
    });
});
