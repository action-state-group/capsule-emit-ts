# capsule-emit-ts design

Status: initial TypeScript implementation contract.

## Scope

This ESM package builds, signs, and verifies AAC format-4 records. It does not
persist, retry, witness, authorize signers, execute actions, or invent IDs and
timestamps.

## Source baseline

| Repository             | Revision                                   | Authority                                         |
| ---------------------- | ------------------------------------------ | ------------------------------------------------- |
| `agent-action-capsule` | `7e112c8b877ad79d4d2a53be7b522a63470a2b1d` | Pinned draft-04 implementation and frozen vectors |
| `agent-action-capsule` | `bb648e15d4826ff78e7d71eb4f3cc87ec5e6713c` | Synchronized current tree                         |
| `capsule-emit-go`      | `280596e03070d6c3333224313fd6aa20b0cb992a` | Public producer API and behavior                  |
| `capsule-emit`         | `40b592192e19622ff7a8c82674eb7caddb52e8db` | Released 0.7.0 Python byte-exact fixtures         |

These revisions record the implementation baseline. CI interoperability jobs
intentionally test the current change against each peer repository's `main`.

The pinned and current AAC revisions do not differ under `spec/`, `go/`,
`test-vectors/`, or `producer-envelope-vectors/`.

## Parity matrix

| Go                            | TypeScript                                       | Wire behavior and coverage                                                                 |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `DigestJSON`                  | `digestJSON`                                     | SHA-256 over RFC 8785 JCS; rejects floats and unsafe integers; normalizes negative zero    |
| `DecodePayload`               | `decodePayload`                                  | Strict UTF-8 object decode; rejects duplicates and trailing data; preserves number lexemes |
| `Build`                       | `build`                                          | Draft-04, format 4, `jcs`, UTC microseconds, derived assurance, signer-independent ID      |
| `Carry`                       | `carry`                                          | Exact opaque bytes using artifact type `foreign-artifact`                                  |
| `Received`                    | `received`                                       | Exact opaque bytes with a caller-declared non-empty type                                   |
| `Who`/`Can`/`Did`/`Audit`     | `who`/`can`/`did`/`audit`                        | Verified Capsule slot wrappers                                                             |
| `BuildComposition`            | `buildComposition`                               | One member per slot, unique IDs, order `who,can,did,audit`                                 |
| `Sign`                        | `sign`                                           | Tagged COSE_Sign1 with the raw Capsule-ID bytes attached as its payload                    |
| `Seal`                        | `seal`                                           | Delegates to digest, build or composition, and sign                                        |
| `VerifyCapsule`               | `verifyCapsule`                                  | Format-4 gate and complete Class 1 result on failure                                       |
| `VerifyEnvelope`              | `verifyEnvelope`                                 | Exact protected map, empty unprotected map, payload binding, Ed25519                       |
| `IsV4IrreversibilityClass`    | `isV4IrreversibilityClass`                       | Tests the pinned draft-04 seed set                                                         |
| signing identity constructors | `createEd25519Identity`, `createSigningIdentity` | Immutable signer and raw public-key pair                                                   |

Tests replay the complete upstream Class 1 corpus, including all canonical,
positive, negative, store, honesty, and JCS cases, every Producer Envelope
case, plus the five Go/Python authored, received, WHO, DID, and composition
fixtures byte for byte.

## Types and timestamps

Public wire types are explicit and readonly. Binary APIs use `Uint8Array` and
return copies. `Buffer` works through `Uint8Array` inheritance.

Timestamps accept `Date` or RFC 3339 strings. Strings retain sub-millisecond
input before truncation to microseconds. Output is UTC: whole seconds omit the
fraction, while non-zero fractions contain exactly six digits.

## JSON, JCS, and identity

The strict decoder rejects malformed UTF-8, duplicate keys, trailing data,
invalid surrogates, and nesting beyond the Go limit of 1,000. It preserves
number lexemes so Class 1 rejects every lexical float, including `2.0` and
`1e2`, and reports floats and unsafe integers at exact paths. It normalizes the
decoded integer lexeme `-0` to `0` before identity computation.
The JCS layer rejects those values when canonical bytes are requested.

JavaScript input rejects unsupported values, sparse arrays, cycles, non-plain
objects, non-finite or non-integer numbers, and integers outside the safe range.
Object names sort by UTF-16 code units. Negative zero serializes as zero.

JavaScript number inputs are checked by value, while decoded JSON numbers use
the lexical rule above. Format-4 Capsule identity removes only top-level `capsule_id`, `signature`, and
`key_id`. It retains `canonicalization_id` and `chain`.

## Low-level AAC compatibility subpath

`capsule-emit-ts/aac` exports `decodeCapsuleJson`, `computeCapsuleId`,
`verifyClass1`, and `verifyStore`. It mirrors the upstream AAC dependency used
by both Go libraries. It retains vintage format-2 identity and store checks
only so the AAC ledger binding in `cll-ts` can match current Go read behavior. Vintage
normalization recursively removes object members whose normalized value is
null, an empty array, or an empty object, while retaining null array elements.
The top-level
emitter never constructs or accepts format 2.

The port preserves the eight pinned checks: structure, identity, confirmed
effect, verdict/effect orthogonality, effect attestation, chain, assurance, and
registry findings. Unknown registry values remain informational. Public
`verifyCapsule` throws `CapsuleVerificationError` with the complete Class 1
result when verification does not pass.

## Producer Envelope

Node `crypto` supplies Ed25519. The Producer Envelope is tagged COSE_Sign1 with
the raw 32-byte Capsule ID attached in its payload slot. Bounded CBOR primitives encode the protected
map in frozen byte order: content type label 3, raw 32-byte public-key `kid`
label 4, then EdDSA label 1. The signature covers
`["Signature1", protected, empty-bstr, raw-id]`.

Verification requires tag 18, four array items, empty unprotected map, exactly
three protected headers, a 32-byte payload, a 64-byte signature, and no more
than 4,096 total envelope bytes.

An internal `signCapsuleId` test seam replays the upstream synthetic envelope
whose ID has no matching Capsule. Public `sign` first verifies that its built
Capsule matches the ID, then delegates to the same primitive.

## Toolchain

Node.js 24 LTS, npm, TypeScript 7 strict mode, Vitest 4, and tsup are used.
`cborg` supplies bounded deterministic CBOR primitives. GitHub Actions use
read-only permissions and immutable action revisions.

## Exclusions

- format-2 or format-3 construction and top-level emitter verification;
- Python persistence, pass-through, checkpoint, and witness conveniences;
- implicit IDs or time, action execution, retries, storage, authorization,
  anchors, policy evaluation, or application request/response projections.
