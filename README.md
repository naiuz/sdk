# NeuronAI SDKs

Official client libraries for the NeuronAI API: speech synthesis, voices, transcription, chat completions, embeddings and rerank.

| Language | Package | Source |
|---|---|---|
| TypeScript and JavaScript | [`@naiuz/sdk`](https://www.npmjs.com/package/@naiuz/sdk) on npm | [`js/`](js) |
| Python | [`naiuz`](https://pypi.org/project/naiuz/) on PyPI | [`python/`](python) |
| PHP | [`naiuz/sdk`](https://packagist.org/packages/naiuz/sdk) on Packagist | [`php/`](php), mirrored to `naiuz/sdk-php` |

## The contract

`spec/` holds what all three SDKs are tested against:
- `openapi.json`: a pinned copy of the API's OpenAPI document, from `https://my.neuronai.uz/docs/api.json`.
- `operations.json`: every API operation, and the method that calls it in each SDK.
- `fixtures/`: contract fixtures. Each holds one SDK call, the exact HTTP request it must send, a canned response, and the result the SDK must return. Every SDK replays every fixture. See `spec/fixtures/README.md`.

Check them with Node 20 or newer:

```bash
cd spec
npm ci
npm test          # the tooling's own tests
npm run validate  # every fixture against the pinned document, and coverage
npm run check     # the pinned document against the live API; exits 1 on drift
npm run refresh   # pin the live document again
```

A daily workflow runs the drift check and opens an issue when the live API changes.

## Releases

Each SDK has its own version, changelog and release. release-please keeps a release pull request open for each, built from the conventional commits that touch its folder, and merging one tags the release, such as `js-v0.1.0`. The `Release` workflow then publishes it, once a maintainer approves: to npm with provenance, to PyPI through trusted publishing, and to Packagist as a tag of `naiuz/sdk-php`, such as `v0.1.0`.

## License

MIT
