# capsule-emit-ts

TypeScript-native AAC format-4 producer and verifier. The package is ESM-first,
uses strict TypeScript, preserves signer-independent Capsule IDs, and emits the
same attached-payload COSE Producer Envelopes as `capsule-emit-go`.

```ts
import { createEd25519Identity, seal } from "capsule-emit-ts";

const identity = createEd25519Identity(seed); // 32-byte Ed25519 seed
const result = seal({
  capsule: {
    actionId: "example/1",
    actionType: "fyi",
    operator: "example-org",
    developer: "example-agent@v1",
    timestamp: new Date(),
  },
  payload: { task: "example" },
  identity,
});
```

The `capsule-emit-ts/aac` subpath exposes strict JSON decoding, current and
vintage Capsule-ID computation, Class 1 verification, and store verification
for ledger implementations. Top-level construction and verification remain
format-4-only.

`isV4IrreversibilityClass(value)` tests membership in the four
irreversibility-class values seeded by AAC draft-04. It deliberately returns
false for future registry extensions rather than claiming that an extension is
invalid.

## Toolchain

Node.js 24 or newer, npm, TypeScript 7, Vitest 4, tsup, Prettier, and Oxlint.
Tests replay the complete upstream AAC corpus, all Producer Envelope vectors,
and the five Go/Python authored, received, WHO, DID, and composition fixtures.

## Development

```sh
npm install
npm run check
npm run build
```

Interop tests expect `agent-action-capsule` and `capsule-emit-go` as sibling
checkouts. Override their paths with `AAC_ROOT` and `CAPSULE_EMIT_GO_ROOT`.
