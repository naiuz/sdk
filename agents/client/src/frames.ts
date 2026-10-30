/** The agents protocol's binary audio frames: a kind byte, a big-endian uint32, then PCM16 little-endian, mono. */
const USER_AUDIO = 0x01;
const AGENT_AUDIO = 0x02;
export const HEADER_BYTES = 5;

/** A microphone frame: kind 0x01, its sequence, then its samples. */
export function encodeUserAudio(sequence: number, pcm: Int16Array): Uint8Array {
    const frame = new Uint8Array(HEADER_BYTES + pcm.length * 2);
    const view = new DataView(frame.buffer);
    view.setUint8(0, USER_AUDIO);
    view.setUint32(1, sequence);
    pcm.forEach((sample, i) => {
        view.setInt16(HEADER_BYTES + i * 2, sample, true);
    });
    return frame;
}

/** An agent audio frame's reply and samples, or null for a frame that isn't agent audio. */
export function decodeAgentAudio(data: ArrayBuffer): {eventId: number; pcm: Int16Array} | null {
    const bytes = data.byteLength - HEADER_BYTES;
    if (bytes < 2 || bytes % 2 !== 0) return null;
    const view = new DataView(data);
    if (view.getUint8(0) !== AGENT_AUDIO) return null;
    const pcm = new Int16Array(bytes / 2);
    for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(HEADER_BYTES + i * 2, true);
    return {eventId: view.getUint32(1), pcm};
}
