import type {OrbFrame} from "./motion";
import {rgb} from "./palette";
import type {OrbTones} from "./palette";
import {FRAGMENT_SHADER, VERTEX_SHADER} from "./shader";

/** Where the flow starts: every orb wears the same pattern, as the agent's face. */
const SEED = 6.2;
const UNIFORMS = ["uRes", "uTime", "uRot", "uEnergy", "uSeed", "uSwirl", "uSat", "uLightA", "uC1", "uC2", "uC3", "uC4"] as const;

type Uniform = (typeof UNIFORMS)[number];

export interface OrbRenderer {
    /** Draws an orb into its own canvas, px wide: through the shared WebGL context, or as a gradient without one. */
    drawOrb(ctx: CanvasRenderingContext2D, px: number, tones: OrbTones, frame: OrbFrame): void;
}

/** One offscreen WebGL canvas for every orb on the page, so a page of avatars holds one context, not one each. */
class SharedRenderer implements OrbRenderer {
    private canvas: HTMLCanvasElement | null = null;
    private gl: WebGLRenderingContext | null = null;
    private uniforms = new Map<Uniform, WebGLUniformLocation | null>();
    private size = 0;

    constructor(private readonly makeCanvas: () => HTMLCanvasElement) {}

    drawOrb(ctx: CanvasRenderingContext2D, px: number, tones: OrbTones, frame: OrbFrame): void {
        const canvas = this.canvas ?? this.open();
        const gl = this.gl;
        if (gl === null) {
            gradient(ctx, px, tones);
            return;
        }
        if (px > this.size) {
            this.size = px;
            canvas.width = px;
            canvas.height = px;
        }
        gl.viewport(0, 0, px, px);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const at = (name: Uniform) => this.uniforms.get(name) ?? null;
        gl.uniform2f(at("uRes"), px, px);
        gl.uniform1f(at("uTime"), frame.flow);
        gl.uniform1f(at("uRot"), frame.rot);
        gl.uniform1f(at("uEnergy"), frame.energy);
        gl.uniform1f(at("uSeed"), SEED);
        gl.uniform1f(at("uSwirl"), frame.swirl);
        gl.uniform1f(at("uSat"), frame.sat);
        gl.uniform1f(at("uLightA"), frame.lightA);
        (["uC1", "uC2", "uC3", "uC4"] as const).forEach((name, i) => {
            gl.uniform3fv(at(name), rgb(tones[i] ?? tones[0]));
        });
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // WebGL draws from the bottom left, so the orb's square sits at the canvas's bottom.
        ctx.clearRect(0, 0, px, px);
        ctx.drawImage(canvas, 0, canvas.height - px, px, px, 0, 0, px, px);
    }

    private open(): HTMLCanvasElement {
        const canvas = this.makeCanvas();
        this.canvas = canvas;
        canvas.addEventListener("webglcontextlost", (event) => {
            // Asks the browser to restore it; until then, the gradient stands in.
            event.preventDefault();
            this.gl = null;
        });
        canvas.addEventListener("webglcontextrestored", () => {
            this.gl = this.setUp(canvas);
        });
        this.gl = this.setUp(canvas);
        return canvas;
    }

    private setUp(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
        const gl = canvas.getContext("webgl", {premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true});
        if (gl === null) return null;
        const program = gl.createProgram();
        for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX_SHADER], [gl.FRAGMENT_SHADER, FRAGMENT_SHADER]] as const) {
            const shader = gl.createShader(type);
            if (shader === null) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) return null;
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "p");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        this.uniforms = new Map(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]));
        return gl;
    }
}

/** The orb without WebGL: a lit radial gradient of its tones, never a blank circle. */
function gradient(ctx: CanvasRenderingContext2D, px: number, tones: OrbTones): void {
    ctx.clearRect(0, 0, px, px);
    const fill = ctx.createRadialGradient((px * 36) / 100, (px * 30) / 100, (px * 5) / 100, px / 2, px / 2, px / 2);
    fill.addColorStop(0, tones[3]);
    fill.addColorStop(0.45, tones[2]);
    fill.addColorStop(0.8, tones[1]);
    fill.addColorStop(1, tones[0]);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, (px * 485) / 1000, 0, Math.PI * 2);
    ctx.fill();
}

const pageCanvas = () => document.createElement("canvas");
let shared: {make: () => HTMLCanvasElement; renderer: OrbRenderer} | null = null;

/** The page's one renderer. A test passes a canvas factory of its own, and gets a renderer of its own. */
export function orbRenderer(makeCanvas: () => HTMLCanvasElement = pageCanvas): OrbRenderer {
    if (shared?.make !== makeCanvas) shared = {make: makeCanvas, renderer: new SharedRenderer(makeCanvas)};
    return shared.renderer;
}
