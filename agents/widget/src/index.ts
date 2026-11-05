import {defineCustomElement} from "vue";
import {App, setDefaultApiUrl} from "./App";
import css from "./widget.css?inline";

// A script knows where it came from, which is where its widget's server is.
const script = document.currentScript;
if (script instanceof HTMLScriptElement && script.src !== "") setDefaultApiUrl(new URL(script.src).origin);

/** `<neuronai-agent widget-key="…">` or `<neuronai-agent agent-id="…">`, in its own shadow root. */
export const NeuronaiAgent = defineCustomElement({...App, styles: [css]} as unknown as typeof App);

// Two copies of the script on a page are one element.
if (customElements.get("neuronai-agent") === undefined) customElements.define("neuronai-agent", NeuronaiAgent);
