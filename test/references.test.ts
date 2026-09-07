import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { build, verifyCapsule, type Reference } from "../src/index.js";
import {
  computeCapsuleId,
  decodeStrictJson,
  jcs,
  verifyClass1,
  type ParsedJson,
} from "../src/aac/index.js";

const root = resolve(process.env.AAC_ROOT ?? "../agent-action-capsule");
const vectors = JSON.parse(
  readFileSync(resolve(root, "go/verify/testdata/references.json"), "utf8"),
) as {
  cases: {
    name: string;
    capsule: Record<string, ParsedJson>;
    canonical: string;
    ok: boolean;
    codes: string[];
  }[];
};

describe("shared draft-04 cross-record reference vectors", () => {
  for (const vector of vectors.cases) {
    it(vector.name, () => {
      const capsule = decodeStrictJson(JSON.stringify(vector.capsule));
      const result = verifyClass1(capsule, new Set(["a".repeat(64)]));
      expect(result.ok).toBe(vector.ok);
      expect(result.findings.map((finding) => finding.code)).toEqual(
        vector.codes,
      );
      expect(new TextDecoder().decode(jcs(capsule))).toBe(vector.canonical);
      if (vector.name === "future-purpose") {
        const custom = verifyClass1(capsule, new Set(["a".repeat(64)]), {
          citation_purpose: new Set(["example-purpose"]),
        });
        expect(custom.ok).toBe(true);
        expect(custom.findings).toEqual([]);
      }
    });
  }

  it("constructs the same cited Capsule bytes as Python and commits the citation", () => {
    const expected = vectors.cases.find((v) => v.name === "external-capsule")!;
    const reference: Reference = {
      type: "agent-action-capsule",
      digestAlg: "SHA-256",
      digest: "b".repeat(64),
      citationPurpose: "responds_to",
    };
    const built = build({
      actionId: "reference/example",
      actionType: "fyi",
      operator: "example-org",
      developer: "example-agent@v1",
      timestamp: "2026-09-07T12:00:00Z",
      chain: { parentCapsuleId: "a".repeat(64), relation: "confirms" },
      references: [reference],
    });
    expect(new TextDecoder().decode(built.json)).toBe(expected.canonical);
    const tampered = JSON.parse(new TextDecoder().decode(built.json));
    tampered.references[0].citation_purpose = "acted_on";
    expect(computeCapsuleId(tampered)).not.toBe(built.capsuleId);
    expect(() => verifyCapsule(jcs(tampered))).toThrow("capsule_id_mismatch");
  });

  it("rejects a typed citation that duplicates the chain parent", () => {
    expect(() =>
      build({
        actionId: "reference/example",
        actionType: "fyi",
        operator: "example",
        developer: "example",
        timestamp: "2026-09-07T12:00:00Z",
        chain: { parentCapsuleId: "a".repeat(64), relation: "confirms" },
        references: [
          {
            type: "agent-action-capsule",
            digestAlg: "SHA-256",
            digest: "a".repeat(64),
          },
        ],
      }),
    ).toThrow("reference_duplicates_chain_parent");
  });
});

it("records opaque log coordinates and preserves absent versus empty references", () => {
  const base = {
    actionId: "reference/example",
    actionType: "fyi" as const,
    operator: "example",
    developer: "example",
    timestamp: "2026-09-07T12:00:00Z",
  };
  const reference = {
    type: "agent-action-capsule",
    digestAlg: "SHA-256",
    digest: "b".repeat(64),
    logCoordinates: {
      log_id: "example",
      leaf_index: 0,
      inclusion_proof: "opaque",
    },
  };
  const built = build({ ...base, references: [reference] });
  expect(built.value.references).toEqual([
    {
      type: reference.type,
      digest_alg: reference.digestAlg,
      digest: reference.digest,
      log_coordinates: reference.logCoordinates,
    },
  ]);
  expect(() =>
    build({
      ...base,
      references: [
        { ...reference, logCoordinates: { log_id: "example", leaf_index: 0 } },
      ],
    }),
  ).toThrow("reference_log_coordinates_malformed");
  const absent = build(base);
  const empty = build({ ...base, references: [] });
  expect(absent.value).not.toHaveProperty("references");
  expect(empty.value.references).toEqual([]);
  expect(absent.capsuleId).not.toBe(empty.capsuleId);
});

it("treats decoded numbers as scalars in reference object positions", () => {
  const vector = vectors.cases.find((v) => v.name === "opaque-proof")!;
  for (const numericEntry of [true, false]) {
    const capsule = JSON.parse(JSON.stringify(vector.capsule));
    if (numericEntry) capsule.references = [1];
    else capsule.references[0].log_coordinates = 7;
    capsule.capsule_id = computeCapsuleId(capsule);
    const result = verifyClass1(
      decodeStrictJson(JSON.stringify(capsule)),
      new Set(["a".repeat(64)]),
    );
    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual([
      numericEntry
        ? "reference_malformed"
        : "reference_log_coordinates_malformed",
    ]);
  }
});

it("detaches nested log coordinates from caller mutations", () => {
  const coordinates = {
    log_id: "example",
    leaf_index: 0,
    inclusion_proof: { path: ["original"] },
  };
  const built = build({
    actionId: "reference/mutation",
    actionType: "fyi",
    operator: "example",
    developer: "example",
    timestamp: "2026-09-07T12:00:00Z",
    references: [
      {
        type: "agent-action-capsule",
        digestAlg: "SHA-256",
        digest: "b".repeat(64),
        logCoordinates: coordinates,
      },
    ],
  });
  coordinates.leaf_index = 1;
  coordinates.inclusion_proof.path[0] = "changed";
  expect(jcs(built.value)).toEqual(built.json);
  expect(
    computeCapsuleId(built.value as Parameters<typeof computeCapsuleId>[0]),
  ).toBe(built.capsuleId);
});
