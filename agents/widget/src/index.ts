import {defineCustomElement} from "vue";
import {App, setDefaultApiUrl} from "./App";
import css from "./widget.css?inline";

// A script knows where it came from, which is where its widget's server is.
const script = document.currentScript;
if (script instanceof HTMLScriptElement && script.src !== "") setDefaultApiUrl(new URL(script.src).origin);

const Element = defineCustomElement(App as unknown as Parameters<typeof defineCustomElement>[0]);

/**
 * `<neuronai-agent widget-key="…">` or `<neuronai-agent agent-id="…">`, in its own shadow root. Its styles are a constructed
 * sheet, which a site's Content-Security-Policy leaves alone where it would block a `<style>`.
 */
export class NeuronaiAgent extends Element {
    constructor() {
        super();
        if (this.shadowRoot !== null) applyStyles(this.shadowRoot);
    }
}

let sheet: CSSStyleSheet | undefined;

function applyStyles(root: ShadowRoot): void {
    if ("adoptedStyleSheets" in root && "replaceSync" in CSSStyleSheet.prototype) {
        if (sheet === undefined) {
            sheet = new CSSStyleSheet();
            sheet.replaceSync(css);
        }
        root.adoptedStyleSheets = [sheet];
    } else {
        const style = document.createElement("style");
        style.textContent = css;
        root.append(style);
    }
}

// Two copies of the script on a page are one element.
if (customElements.get("neuronai-agent") === undefined) customElements.define("neuronai-agent", NeuronaiAgent);
