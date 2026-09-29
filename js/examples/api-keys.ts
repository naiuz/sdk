// Creates a key that may only synthesize speech, lists your keys, then revokes the new one.
// The key you run this with needs the api_keys permission.
import {NeuronAI} from "@naiuz/sdk";

const client = new NeuronAI();

const key = await client.apiKeys.create({
    name: "Example: speech only",
    access: "restricted",
    permissions: {tts: "write"},
    monthly_spend_limit: 50_000,
});
// key.secret holds the whole key, shown this once: a real program stores it now.
console.log(`Created ${key.id}, ${key.masked_key}.`);

for await (const each of client.apiKeys.list({limit: 20})) {
    console.log(`${each.id}  ${each.name}  ${each.masked_key}  ${each.revoked_at === null ? "active" : "revoked"}`);
}

await client.apiKeys.update(key.id, {enabled: false});
await client.apiKeys.revoke(key.id);
console.log(`Revoked ${key.id}.`);
