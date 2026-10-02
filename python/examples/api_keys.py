"""Creates a key that may only synthesize speech, lists your keys, then revokes the new one.

The key you run this with needs the api_keys permission.
"""

from naiuz import NeuronAI

client = NeuronAI()

key = client.api_keys.create(
    name="Example: speech only", access="restricted", permissions={"tts": "write"}, monthly_spend_limit=50_000
)
# key.secret holds the whole key, shown this once: a real program stores it now.
print(f"Created {key.id}, {key.masked_key}.")

for each in client.api_keys.list(limit=20):
    print(f"{each.id}  {each.name}  {each.masked_key}  {'active' if each.revoked_at is None else 'revoked'}")

client.api_keys.update(key.id, enabled=False)
client.api_keys.revoke(key.id)
print(f"Revoked {key.id}.")
