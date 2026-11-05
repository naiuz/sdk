/** Two soft rising notes when a reply arrives with the panel shut. Browsers keep a page silent until someone has touched it. */
export function createChime(enabled: () => boolean): {chime(): void; dispose(): void} {
    let context: AudioContext | null = null;
    let touched = false;
    const onTouch = () => {
        touched = true;
    };
    window.addEventListener("pointerdown", onTouch, true);
    window.addEventListener("keydown", onTouch, true);

    return {
        chime() {
            if (!enabled() || !touched || typeof AudioContext !== "function") return;
            try {
                context ??= new AudioContext();
                const start = context.currentTime;
                const volume = context.createGain();
                volume.gain.setValueAtTime(0.0001, start);
                volume.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
                volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.36);
                volume.connect(context.destination);
                [880, 1320].forEach((frequency, index) => {
                    const tone = (context as AudioContext).createOscillator();
                    const at = start + index * 0.12;
                    tone.type = "sine";
                    tone.frequency.setValueAtTime(frequency, at);
                    tone.connect(volume);
                    tone.start(at);
                    tone.stop(at + 0.22);
                });
            } catch {
                // No sound here; the unread count still says it.
            }
        },
        dispose() {
            window.removeEventListener("pointerdown", onTouch, true);
            window.removeEventListener("keydown", onTouch, true);
            void context?.close();
        },
    };
}
