# @naiuz/agents-vue

Vue for NeuronAI agents: `useConversation`, a composable over the [`@naiuz/agents`](../client) client.

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
