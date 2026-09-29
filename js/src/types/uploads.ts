/** Bytes to upload, with the filename to send them under. */
export interface FileUpload {
    /** The file's bytes: a Uint8Array (a Node Buffer is one) or a Blob. */
    data: Uint8Array | Blob;
    /** The filename to send, such as `clip.wav`. Unless a content type is given, its extension picks one. */
    filename: string;
    /** The content type to declare, such as `audio/wav`. It wins over a Blob's own type and over the filename's. */
    contentType?: string;
}

/**
 * A file to upload: a `File`, whose name is the filename, or bytes with a
 * filename. Its part's content type is `contentType` when given, else the
 * Blob's own type when it has one, else the one its filename's extension
 * names: `wav` is `audio/wav`, `mp3` `audio/mpeg`, `ogg` `audio/ogg`, `flac`
 * `audio/flac`, `m4a` `audio/mp4`, `webm` `audio/webm`, and anything else
 * `application/octet-stream`. The server checks a file by its content, so
 * the declared type never decides whether it is accepted.
 */
export type Uploadable = File | FileUpload;
