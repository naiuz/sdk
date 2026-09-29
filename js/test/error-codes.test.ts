import {describe, expect, it} from "vitest";
import {ErrorCode} from "../src/error-codes";
import {readSpec} from "./helpers/spec";

const document = readSpec("openapi.json") as {components: {schemas: {ErrorCode: {enum: string[]}}}};

describe("ErrorCode", () => {
    it("holds exactly the API's 38 codes, in the document's order", () => {
        expect(Object.values(ErrorCode)).toEqual(document.components.schemas.ErrorCode.enum);
        expect(Object.values(ErrorCode)).toHaveLength(38);
    });

    it("names each member after its code, in PascalCase", () => {
        for (const [name, code] of Object.entries(ErrorCode)) {
            const pascal = code
                .split("_")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join("");
            expect(name).toBe(pascal);
        }
    });
});
