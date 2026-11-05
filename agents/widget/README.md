# @naiuz/agents-widget

The NeuronAI agent widget: one tag on a page for voice and text with an agent. It brings its own Vue, in its own shadow root, so it works on any page and doesn't touch the page's styles.

```html
<script src="https://my.neuronai.uz/agents-widget/v1/widget.js" async></script>
<neuronai-agent agent-id="agent_01JB8Z5R4Q6Y2N7K3M9D0F1H2J"></neuronai-agent>
```

Or from npm, with a bundler:

```js
import "@naiuz/agents-widget";
```

## Attributes

- **`widget-key`:** a web widget's key, from its channel page. Its look, texts and modes come from there, and it keeps its visitors, their messages and their files.
- **`agent-id`:** a public agent's id, for a page on one of its allowed websites, with the agent's name and both modes.
- **`lang`:** `uz`, `ru` or `en`. Left out, it goes by what the visitor chose, the page's language, then the browser's.
- **`dynamic-variables`:** values for the agent's variables, as JSON.
- **`api-url`:** where its server is, for a local one. Loaded as a script, it's where the script came from.

## Client tools

The tools an agent runs in the page are a property of the element:

```js
document.querySelector("neuronai-agent").clientTools = {
    open_cart: () => {
        location.href = "/cart";
    },
};
```

## Links on a page

With in-page links on, a link to the page's own site stays on the page, and the visitor keeps the chat. A site with a router can take it, by listening for `neuron-widget:navigate` on `window` and cancelling it.

A site with a Content-Security-Policy needs to allow the script's origin in `script-src` and `connect-src`, its socket in `connect-src`, and for a call's audio, whose worklets load from a `blob:` address, `blob:` in `script-src`. Logos and operators' avatars come from `img-src`. Its styles need nothing: they're a constructed sheet, which `style-src` leaves alone. A browser too old for one falls back to a `<style>`, which needs `'unsafe-inline'`.
