# @naiuz/agents-vue

Vue for NeuronAI agents: `useConversation`, a composable over the [`@naiuz/agents`](../client) client, and `AgentOrb`, the agent's face.

```vue
<script setup lang="ts">
import {useConversation} from "@naiuz/agents-vue";

const props = defineProps<{token: string}>();
const {status, mode, micMuted, startSession, endSession, setMicMuted} = useConversation({
    onMessage: (message) => console.log(message),
});

// From a click, so the browser lets the microphone start.
async function call(): Promise<void> {
    await startSession({token: props.token, textOnly: false});
}
</script>

<template>
    <button v-if="status === 'disconnected'" @click="call">Call</button>
    <template v-else>
        <p>{{ mode }}</p>
        <button @click="setMicMuted(!micMuted)">{{ micMuted ? "Unmute" : "Mute" }}</button>
        <button @click="endSession">Hang up</button>
    </template>
</template>
```

- **State,** as refs:
  - `status`: `connecting`, `connected`, `reconnecting` or `disconnected`;
  - `mode`: `text` in a text session; in a call, `listening`, `thinking` or `speaking`; null outside a session;
  - `isSpeaking`, while the agent speaks;
  - `micMuted`.
- **Methods:** `startSession` resolves to the conversation's id, and a second one ends the first. Then `endSession`, `sendUserMessage`, `setMicMuted`, `setVolume`, `getInputVolume`, `getOutputVolume`, `getId` and `getResumeToken`, as on the client.
- **The session ends with the component,** when its effect scope does.
- **Callbacks** are the client's (see [its README](../client/README.md)). They run after the refs have changed.
- `vue` ^3.5 is a peer dependency.

## AgentOrb

A lit sphere with the agent's colours flowing inside, drawn by a WebGL shader. It moves with the agent's state and the voice's level.

```vue
<script setup lang="ts">
import {computed} from "vue";
import {AgentOrb, useConversation} from "@naiuz/agents-vue";

const {status, mode, isSpeaking, getInputVolume, getOutputVolume} = useConversation();
const state = computed(() => status.value === "connecting" ? "connecting" : mode.value === null || mode.value === "text" ? "idle" : mode.value);
</script>

<template>
    <AgentOrb :state="state" :level="isSpeaking ? getOutputVolume : getInputVolume" />
    <p>{{ state }}</p>
</template>
```

- **Props:**
  - `state`: `idle`, `connecting`, `listening`, `thinking` or `speaking`;
  - `level`: read every frame, from 0 to 1: the agent's voice while it speaks, the microphone while it listens;
  - `colors`: a customer's two colours, from which the deepest and lightest tones are derived. NeuronAI's orange when left out;
  - `size`: 24 to 210 px, 132 by default.
- **It is decorative,** hidden from screen readers: put the state's word beside it.
- **One WebGL context** draws every orb on a page. Without WebGL, or once the context is lost, an orb is a lit gradient of its tones.
- **Under reduced motion** it holds one still frame, drawn again when its state changes.
- **`examples/orb.html`** shows every state, the avatar sizes and a customer's palette, in light and dark. Build the packages (`npm run build` in `agents/`), serve the repository's root (`python3 -m http.server 8766 --bind 127.0.0.1`), and open `http://127.0.0.1:8766/agents/vue/examples/orb.html`.
