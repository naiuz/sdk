<?php

declare(strict_types=1);

/*
 * Creates a key that may only synthesize speech, lists your keys, then revokes the new one.
 *
 * The key you run this with needs the api_keys permission.
 */

use Naiuz\NeuronAI;

require __DIR__ . '/../vendor/autoload.php';

$client = new NeuronAI();

$key = $client->apiKeys->create([
    'name' => 'Example: speech only',
    'access' => 'restricted',
    'permissions' => ['tts' => 'write'],
    'monthly_spend_limit' => 50_000,
]);
// $key->secret holds the whole key, shown this once: a real program stores it now.
echo "Created {$key->id}, {$key->masked_key}.\n";

foreach ($client->apiKeys->list(['limit' => 20]) as $each) {
    echo "{$each->id}  {$each->name}  {$each->masked_key}  " . ($each->revoked_at === null ? 'active' : 'revoked') . "\n";
}

$client->apiKeys->update($key->id, ['enabled' => false]);
$client->apiKeys->revoke($key->id);
echo "Revoked {$key->id}.\n";
