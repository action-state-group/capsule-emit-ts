# capsule-emit-ts

TypeScript-native AAC format-4 producer and verifier. The package is ESM-first,
uses strict TypeScript, preserves signer-independent Capsule IDs, and emits the
same attached-payload COSE Producer Envelopes as `capsule-emit-go`.

It builds records only. It does not execute actions, generate business IDs or
timestamps, persist Capsules, retry effects, contact witnesses, or authorize
signers.

## Install

Node.js 24 or newer is required.

```sh
npm install @action-state-group/capsule-emit
```

## Build, sign, and verify

`seal` is the recommended application-facing API. It digests caller-owned JSON,
builds and verifies the format-4 Capsule, then signs its raw 32-byte Capsule ID
with an independent Producer Envelope.

```ts
import { randomBytes } from "node:crypto";
import {
  createEd25519Identity,
  seal,
  verifyCapsule,
  verifyEnvelope,
} from "@action-state-group/capsule-emit";

const identity = createEd25519Identity(randomBytes(32));
const result = seal({
  capsule: {
    actionId: "example/1",
    actionType: "decide",
    operator: "example-org",
    developer: "example-agent@v1",
    timestamp: new Date("2026-09-02T12:00:00Z"),
    disposition: {
      decision: "approve",
      approver: "policy",
      humanDisposed: false,
      verdictClass: "executed",
    },
  },
  payload: { task: "publish", issue: 123 },
  agentOutput: { accepted: true },
  model: { provider: "example", modelId: "model-v1" },
  runtime: "example-runtime@1",
  identity,
});

const capsule = verifyCapsule(result.payload);
if (capsule.capsuleId !== result.capsuleId) {
  throw new Error("Capsule ID mismatch");
}
const envelope = verifyEnvelope(result.capsuleId, result.envelope);
if (!envelope.ok) {
  throw new Error(
    `Producer Envelope failed: ${JSON.stringify(envelope.findings)}`,
  );
}
```

`verifyCapsule` validates Capsule identity and Class 1 structure. It does not
authenticate local-only `signature` or `key_id` fields. `verifyEnvelope`
authenticates the public key carried by the Producer Envelope. Whether that key
is authorized for an operator, developer, or action remains caller policy.

## Typed construction

Use `build` when the application already owns all typed Capsule fields and wants
construction separate from signing. `received` binds exact opaque bytes under a
caller-declared CPB type. `carry` is the same operation with the generic
`foreign-artifact` type. `who`, `can`, `did`, and `audit` reference already-built
Capsules in a typed composition without minting or persisting those members.

```ts
import { randomBytes } from "node:crypto";
import {
  build,
  buildComposition,
  createEd25519Identity,
  did,
  received,
  sign,
  who,
} from "@action-state-group/capsule-emit";

const identity = createEd25519Identity(randomBytes(32));
const common = {
  actionType: "fyi" as const,
  operator: "example-org",
  developer: "example-agent@v1",
  timestamp: "2026-09-02T12:00:00Z",
};

const identityCapsule = build({
  ...common,
  actionId: "identity/1",
  domain: "identity",
});
const providerAck = received(
  { ...common, actionId: "provider-ack/1" },
  new TextEncoder().encode("opaque provider acknowledgement"),
  "provider-ack",
);
const actionCapsule = build({
  ...common,
  actionId: "action/1",
  effect: {
    type: "example.publish",
    status: "planned",
    irreversibilityClass: "reversible",
  },
});
const composition = buildComposition({ ...common, actionId: "composition/1" }, [
  who(identityCapsule),
  did(actionCapsule),
]);
const envelope = sign(composition, identity);

console.log(providerAck.capsuleId, composition.capsuleId, envelope.length);
```

The same composition can use the high-level signing path:

```ts
const signedComposition = seal({
  capsule: { ...common, actionId: "composition/2" },
  members: [who(identityCapsule), did(actionCapsule)],
  identity,
});
```

Composition members must occupy distinct slots and refer to distinct verified
format-4 Capsules. Carried and composed construction rejects explicit agent
input/output digests because those records already own their construction
commitments.

## Compose with CLL

This package constructs and verifies AAC records. It does not persist them.
Applications that also need checkpointed inclusion install the independent CLL
package, store the full Capsule and Producer Envelope in application storage,
and append only the verified 32-byte Capsule ID to CLL.

```ts
import { build, verifyCapsule } from "@action-state-group/capsule-emit";
import { MysqlStore } from "@action-state-group/cll/mysql";

const built = build({
  actionId: "deploy-42",
  actionType: "fyi",
  operator: "example-org",
  developer: "example-agent@v1",
  timestamp: new Date(),
});
verifyCapsule(built.json); // returns verified metadata or throws

// Persist built.json and any Producer Envelope in application storage.
const cll = await MysqlStore.open(process.env.MYSQL_URL!, "application-log");
await cll.append({
  value: Buffer.from(built.capsuleId, "hex"),
  appendedAt: new Date(),
});
```

Neither package depends on the other. An application that uses both declares
both dependencies explicitly.

## JSON digests

`digestJSON(value)` returns the lowercase SHA-256 of RFC 8785 JCS bytes. It
rejects duplicate object names, excessive depth, floats, unsafe integers,
invalid UTF-8, and trailing JSON data on strict decoding paths.

```ts
import { digestJSON } from "@action-state-group/capsule-emit";

const requestDigest = digestJSON({ issue: 123, operation: "publish" });
const responseDigest = digestJSON({ accepted: true });
```

Callers own the JSON shape and assign these values to effect request/response
fields where appropriate. Raw payload values never enter the Capsule.

## Verification and compatibility

The `@action-state-group/capsule-emit/aac` subpath exposes strict JSON decoding, current and
vintage Capsule-ID computation, Class 1 verification, and store verification
for persistence adapters. Top-level construction and verification remain
format-4-only.

`isV4IrreversibilityClass(value)` tests membership in the four
irreversibility-class values seeded by AAC draft-04. It deliberately returns
false for future registry extensions without claiming that an extension is
invalid.

Tests replay the complete upstream AAC corpus, all Producer Envelope vectors,
and Go/Python authored, received, WHO, DID, and composition fixtures.

## Development

```sh
npm install
npm run check
npm run build
```

Interop tests expect `agent-action-capsule` and `capsule-emit-go` as sibling
checkouts. Override those paths with `AAC_ROOT` and `CAPSULE_EMIT_GO_ROOT`.

## Release

Releases are published from `main` with the manual
[Publish npm package](https://github.com/action-state-group/capsule-emit-ts/actions/workflows/publish.yml)
GitHub Action:

1. Update `version` in `package.json` and `package-lock.json`, commit the change,
   and wait for `main` CI to pass.
2. In GitHub, open the workflow, choose **Run workflow**, and select `main`.
3. Verify the workflow published `@action-state-group/capsule-emit` and created
   the `v<version>` GitHub release and tag on the published commit.

The npm package must have a GitHub Actions trusted publisher configured for
the `action-state-group/capsule-emit-ts` repository and
`.github/workflows/publish.yml`. No long-lived npm token is required. Re-running
the workflow is safe: it skips an existing npm version and verifies that its
Git tag points to the `gitHead` recorded by npm.

If npm contains the version but its tag is missing after this workflow has
changed, GitHub may reject recovery with the workflow's `GITHUB_TOKEN`. A
maintainer with `workflow` scope must create the tag at the npm `gitHead`, then
rerun the workflow to verify the tag and create any missing GitHub release:

```sh
version=0.1.2
git_head=$(npm view "@action-state-group/capsule-emit@$version" gitHead)
git fetch origin --tags
git tag -a "v$version" "$git_head" -m "Release v$version"
git push origin "refs/tags/v$version"
```

## License

Apache-2.0. The upstream Agent Action Capsule dependency is BSD-3-Clause.
