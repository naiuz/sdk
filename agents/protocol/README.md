# @naiuz/agents-protocol

The TypeScript types of the NeuronAI agents protocol, the WebSocket protocol a client uses to talk to a NeuronAI agent.

The protocol is specified in [`spec/agents/`](../../spec/agents): [`protocol.md`](../../spec/agents/protocol.md) describes it, and [`events.schema.json`](../../spec/agents/events.schema.json) defines its events. This package's `src/events.ts` is generated from that schema, so the types never drift from it.

```ts
import type {ClientEvent, ServerEvent} from "@naiuz/agents-protocol";
import {SERVER_EVENT_TYPES} from "@naiuz/agents-protocol";
```

Most apps want [`@naiuz/agents`](../client), the client built on these types.

## Regenerating

After changing the schema, run `npm run generate` in `agents/`. The tests fail while `src/events.ts` is stale.
