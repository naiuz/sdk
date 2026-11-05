# @naiuz/agents-react

React for NeuronAI agents: `useConversation`, a hook over the [`@naiuz/agents`](../client) client, and `AgentOrb`, the agent's animated orb.

```tsx
import {AgentOrb, useConversation} from "@naiuz/agents-react";

function Agent({agentId}: {agentId: string}) {
    const {status, mode, micMuted, startSession, endSession, setMicMuted, getOutputVolume} = useConversation({
        onMessage: (message) => console.log(message),
    });

    // From a click, so the browser lets the microphone start.
    if (status === "disconnected") {
        return <button onClick={() => startSession({agentId, textOnly: false})}>Call</button>;
    }
    return (
        <>
            <AgentOrb state={mode === "speaking" || mode === "listening" || mode === "thinking" ? mode : "idle"} level={getOutputVolume} />
            <button onClick={() => setMicMuted(!micMuted)}>{micMuted ? "Unmute" : "Mute"}</button>
            <button onClick={endSession}>Hang up</button>
        </>
    );
}
```

- **State:** `status`, `mode`, `isSpeaking`, `conversationStatus` and `micMuted`, which re-render the component when they change.
- **Methods:** everything the [client](../client) has, whose identity never changes, so they're safe in a dependency list.
- **Callbacks** are the latest render's, so they can use props and state without a dependency list.
- **The session ends with the component.** Starting again ends the one before, and StrictMode's double mount leaves nothing open.
- **On a server** it renders with no session.
