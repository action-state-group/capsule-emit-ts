import { describe, expect, it } from "vitest";
import {
  build,
  received,
  buildComposition,
  who,
  did,
  verifyCapsule,
  type Input,
} from "../src/index.js";

const input: Input = {
  actionId: "construction-test",
  actionType: "fyi",
  operator: "operator",
  developer: "developer",
  timestamp: "2026-09-09T00:00:00Z",
};

describe("shared construction boundary", () => {
  it("preserves ordinary compute fields and carried runtime/model metadata", () => {
    const ordinary = build({
      ...input,
      compute: { agentInputDigest: "a".repeat(64), runtime: "runtime" },
    });
    expect(ordinary.value.model_attestation).toMatchObject({
      compute_attestation: {
        agent_input_digest: "a".repeat(64),
        runtime: "runtime",
      },
    });
    const carried = received(
      {
        ...input,
        model: { provider: "provider" },
        compute: { runtime: "runtime" },
      },
      new Uint8Array([1, 2]),
      "foreign-artifact",
    );
    expect(carried.value.model_attestation).toMatchObject({
      provider: "provider",
      compute_attestation: {
        runtime: "runtime",
        carried_artifact: { type: "foreign-artifact" },
      },
    });
    expect(verifyCapsule(carried.json).capsuleId).toBe(carried.capsuleId);
  });

  it.each(["agentInputDigest", "agentOutputDigest"] as const)(
    "rejects mixed %s on both internal binding paths",
    (field) => {
      const mixed = { ...input, compute: { [field]: "a".repeat(64) } };
      const member = build({ ...input, actionId: "member" });
      expect(() =>
        received(mixed, new Uint8Array([1]), "foreign-artifact"),
      ).toThrow("must not include agent input or output digest");
      expect(() => buildComposition(mixed, [who(member)])).toThrow(
        "must not include agent input or output digest",
      );
    },
  );

  it("validates input and composition members before returning a Capsule", () => {
    const member = build({ ...input, actionId: "member" });
    expect(() =>
      received(
        { ...input, operator: "" },
        new Uint8Array([1]),
        "foreign-artifact",
      ),
    ).toThrow();
    expect(() =>
      buildComposition({ ...input, operator: "" }, [who(member)]),
    ).toThrow();
    expect(() =>
      buildComposition(input, [who({ ...member, capsuleId: "f".repeat(64) })]),
    ).toThrow("matching verified");
    expect(() => buildComposition(input, [who(member), did(member)])).toThrow(
      "duplicates Capsule ID",
    );
    const composed = buildComposition(input, [who(member)]);
    expect(verifyCapsule(composed.json).capsuleId).toBe(composed.capsuleId);
  });
});
