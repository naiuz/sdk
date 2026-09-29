import {NeuronAIError} from "../errors";
import type {FileUpload} from "../types/uploads";
import {isRecord} from "./json";

/** The content type each upload extension names, the same in every NeuronAI SDK. */
const CONTENT_TYPES = new Map([
    ["wav", "audio/wav"],
    ["mp3", "audio/mpeg"],
    ["ogg", "audio/ogg"],
    ["flac", "audio/flac"],
    ["m4a", "audio/mp4"],
    ["webm", "audio/webm"],
]);

/**
 * The content type a filename's extension names. The extension is what
 * follows the last dot, in lower case. One that isn't in the table, or none
 * at all, gives `application/octet-stream`.
 */
export function contentTypeFor(filename: string): string {
    const dot = filename.lastIndexOf(".");
    return (dot === -1 ? undefined : CONTENT_TYPES.get(filename.slice(dot + 1).toLowerCase())) ?? "application/octet-stream";
}

/** A File. Bun's FormData hands a file back as a Blob with a name, so any Blob with a name counts. */
function isFile(value: unknown): value is File {
    return value instanceof Blob && typeof (value as {name?: unknown}).name === "string";
}

function isFileUpload(value: unknown): value is FileUpload {
    return isRecord(value) && (value.data instanceof Uint8Array || value.data instanceof Blob) && typeof value.filename === "string";
}

/** A file field's part: its bytes, as a Blob of the content type to declare, and its filename. */
function filePart(field: string, value: unknown): {blob: Blob; filename: string} {
    let data: Blob | Uint8Array;
    let filename: string;
    let declared = "";
    if (isFile(value)) {
        data = value;
        filename = value.name;
    } else if (isFileUpload(value)) {
        data = value.data;
        filename = value.filename;
        declared = value.contentType ?? "";
    } else {
        throw new NeuronAIError(`${field} must be a File, or {data, filename} with the bytes as a Uint8Array or a Blob.`);
    }
    if (filename === "") throw new NeuronAIError(`${field} needs a filename.`);
    const type = declared || (data instanceof Blob ? data.type : "") || contentTypeFor(filename);
    if (data instanceof Blob && data.type === type) return {blob: data, filename};
    // Uint8Array bytes are copied: a Blob takes only bytes backed by a plain ArrayBuffer.
    return {blob: new Blob([data instanceof Blob ? data : new Uint8Array(data)], {type}), filename};
}

/** A multipart field's text: a string as it is, anything else as JSON, such as `2` or `true`. */
function fieldText(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * The multipart form of an upload call: each field named in `files` as a
 * file part, a list as repeated `name[]` parts, and any other field as text.
 * Undefined and null fields are left out. A file that can't be sent raises
 * NeuronAIError.
 */
export function toFormData(params: unknown, files: readonly string[]): FormData {
    const form = new FormData();
    for (const [name, value] of Object.entries(isRecord(params) ? params : {})) {
        if (value === undefined || value === null) continue;
        if (files.includes(name)) {
            const {blob, filename} = filePart(name, value);
            form.append(name, blob, filename);
        } else if (Array.isArray(value)) {
            for (const item of value) form.append(`${name}[]`, fieldText(item));
        } else {
            form.append(name, fieldText(value));
        }
    }
    return form;
}
