import {OrbDriver, orbLayout} from "@naiuz/agents/orb";
import type {OrbProps} from "@naiuz/agents/orb";
import {createElement, useEffect, useRef, useState} from "react";
import type {ReactElement} from "react";

export type AgentOrbProps = Partial<OrbProps>;

/**
 * The agent's face: a lit sphere with its colours flowing inside, which moves with the agent's state and the voice's
 * level. It is decorative, so screen readers skip it; the state's word belongs beside it.
 */
export function AgentOrb({state = "idle", colors, size, level}: AgentOrbProps): ReactElement {
    const root = useRef<HTMLDivElement>(null);
    const glow = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const props = useRef<OrbProps>({state, colors, size, level});
    const [driver] = useState(
        () =>
            new OrbDriver(
                () => props.current,
                () => ({root: root.current, glow: glow.current, canvas: canvas.current}),
            ),
    );

    useEffect(() => {
        props.current = {state, colors, size, level};
    });
    useEffect(() => {
        driver.mount();
        return () => {
            driver.unmount();
        };
    }, [driver]);
    // A new state starts the motion again, and a held frame is drawn again for a new size or colour.
    useEffect(driver.update, [driver, state, colors, size]);

    const layout = orbLayout({colors, size});
    return createElement(
        "div",
        {ref: root, className: "naiuz-orb", "aria-hidden": true, style: layout.root},
        createElement("div", {ref: glow, style: layout.glow}),
        createElement("canvas", {ref: canvas, width: layout.pixels, height: layout.pixels, style: layout.canvas}),
    );
}
