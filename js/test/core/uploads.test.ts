import {describe, expect, it} from "vitest";
import {contentTypeFor, toFormData} from "../../src/core/uploads";
import {NeuronAIError} from "../../src/errors";

const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46]);

/** A form's file part: its filename, content type and bytes. */
async function filePart(form: FormData, field: string): Promise<{name: string; type: string; bytes: number[]}> {
    const value = form.get(field);
    if (!(value instanceof Blob)) throw new Error(`${field} is not a file part.`);
    return {name: value.name, type: value.type, bytes: [...new Uint8Array(await value.arrayBuffer())]};
}

describe("contentTypeFor", () => {
    it.each([
        ["clip.wav", "audio/wav"],
        ["clip.mp3", "audio/mpeg"],
        ["clip.ogg", "audio/ogg"],
        ["clip.flac", "audio/flac"],
        ["clip.m4a", "audio/mp4"],
        ["clip.webm", "audio/webm"],
        ["CLIP.WAV", "audio/wav"],
        ["take.2.mp3", "audio/mpeg"],
        ["notes.txt", "application/octet-stream"],
        ["clip", "application/octet-stream"],
        ["clip.", "application/octet-stream"],
        ["clip.constructor", "application/octet-stream"],
    ])("gives %s the type %s", (filename, type) => {
        expect(contentTypeFor(filename)).toBe(type);
    });
});

describe("toFormData", () => {
    it("sends each field as text, and a list as repeated name[] parts", () => {
        const form = toFormData({name: "Office voice", language: "uz", tags: ["support", "calm"]}, []);
        expect([...form.entries()]).toEqual([
            ["name", "Office voice"],
            ["language", "uz"],
            ["tags[]", "support"],
            ["tags[]", "calm"],
        ]);
    });

    it("leaves out undefined and null fields, and sends an empty list as no parts", () => {
        const form = toFormData({name: "Office voice", ref_text: null, category: undefined, tags: []}, []);
        expect([...form.keys()]).toEqual(["name"]);
    });

    it("sends bytes under their filename, typed by its extension", async () => {
        const form = toFormData({ref_audio: {data: WAV, filename: "sample.wav"}}, ["ref_audio"]);
        expect(await filePart(form, "ref_audio")).toEqual({name: "sample.wav", type: "audio/wav", bytes: [...WAV]});
    });

    it("sends a Node Buffer like any other Uint8Array", async () => {
        const form = toFormData({file: {data: Buffer.from(WAV), filename: "clip.mp3"}}, ["file"]);
        expect(await filePart(form, "file")).toEqual({name: "clip.mp3", type: "audio/mpeg", bytes: [...WAV]});
    });

    it("declares the caller's content type over the Blob's and the filename's", async () => {
        const form = toFormData({file: {data: new Blob([WAV], {type: "audio/x-wav"}), filename: "clip.mp3", contentType: "audio/wav"}}, ["file"]);
        expect((await filePart(form, "file")).type).toBe("audio/wav");
    });

    it("declares a Blob's own type over the filename's", async () => {
        const form = toFormData({file: {data: new Blob([WAV], {type: "audio/x-wav"}), filename: "clip.mp3"}}, ["file"]);
        expect((await filePart(form, "file")).type).toBe("audio/x-wav");
    });

    it("sends a File under its own name, typed by its own type, else by its extension", async () => {
        const typed = toFormData({file: new File([WAV], "take.ogg", {type: "audio/ogg"})}, ["file"]);
        const untyped = toFormData({file: new File([WAV], "take.flac")}, ["file"]);
        expect(await filePart(typed, "file")).toEqual({name: "take.ogg", type: "audio/ogg", bytes: [...WAV]});
        expect(await filePart(untyped, "file")).toEqual({name: "take.flac", type: "audio/flac", bytes: [...WAV]});
    });

    it("refuses a path, bare bytes or a bare Blob, which have no filename to send", () => {
        for (const value of ["clip.wav", WAV, new Blob([WAV])]) {
            expect(() => toFormData({file: value}, ["file"])).toThrow(NeuronAIError);
        }
        expect(() => toFormData({file: WAV}, ["file"])).toThrow("file must be a File, or {data, filename} with the bytes as a Uint8Array or a Blob.");
    });

    it("refuses an empty filename", () => {
        expect(() => toFormData({ref_audio: {data: WAV, filename: ""}}, ["ref_audio"])).toThrow("ref_audio needs a filename.");
        expect(() => toFormData({ref_audio: new File([WAV], "")}, ["ref_audio"])).toThrow("ref_audio needs a filename.");
    });

    it("sends no field for parameters that aren't an object, leaving the API to say what is missing", () => {
        expect([...toFormData(undefined, ["file"]).keys()]).toEqual([]);
    });
});
