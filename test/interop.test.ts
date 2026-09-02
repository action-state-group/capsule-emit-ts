import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  audit,
  buildComposition,
  can,
  createEd25519Identity,
  did,
  received,
  seal,
  sign,
  verifyEnvelope,
  who,
  type Input,
  type Result,
} from "../src/index.js";

const goRoot = resolve(
  process.env.CAPSULE_EMIT_GO_ROOT ?? "../capsule-emit-go",
);
const vectorRoot = resolve(goRoot, "testdata/capsule-emit/format4-interop");
const spec = JSON.parse(
  readFileSync(resolve(vectorRoot, "input.json"), "utf8"),
) as {
  seed_hex: string;
  timestamp: string;
  operator: string;
  developer: string;
  disposition: {
    decision: string;
    approver: "policy";
    human_disposed: boolean;
  };
  records: Array<Record<string, unknown>>;
};
const identity = createEd25519Identity(Buffer.from(spec.seed_hex, "hex"));
const base = (record: Record<string, unknown>): Input => ({
  actionId: record.action_id as string,
  actionType: record.action_type as "decide",
  operator: spec.operator,
  developer: spec.developer,
  timestamp: spec.timestamp,
  disposition: {
    decision: spec.disposition.decision,
    approver: spec.disposition.approver,
    humanDisposed: spec.disposition.human_disposed,
    verdictClass: record.verdict as string,
  },
});

describe("Go/Python format-4 frozen vectors", () => {
  const results = new Map<string, Result>();
  for (const record of spec.records) {
    it(`${String(record.name)} replays byte for byte`, () => {
      let result: Result;
      if (record.operation === "seal")
        result = seal({
          capsule: base(record),
          payload: record.payload,
          ...(record.agent_output === undefined
            ? {}
            : { agentOutput: record.agent_output }),
          ...(record.model === undefined
            ? {}
            : {
                model: {
                  provider: String(
                    (record.model as Record<string, string>).provider,
                  ),
                  modelId: String(
                    (record.model as Record<string, string>).model_id,
                  ),
                },
              }),
          ...(record.runtime === undefined
            ? {}
            : { runtime: record.runtime as string }),
          identity,
        });
      else if (record.operation === "received") {
        const built = received(
          base(record),
          Buffer.from(record.artifact_utf8 as string),
          record.artifact_type as string,
        );
        result = {
          capsuleId: built.capsuleId,
          payload: built.json,
          envelope: sign(built, identity),
        };
      } else {
        const members = (
          record.members as Array<{ slot: string; record: string }>
        ).map((item) =>
          ({ who, can, did, audit })[item.slot]!(results.get(item.record)!),
        );
        const built = buildComposition(base(record), members);
        result = {
          capsuleId: built.capsuleId,
          payload: built.json,
          envelope: sign(built, identity),
        };
      }
      const directory = resolve(vectorRoot, "valid", record.name as string);
      results.set(record.name as string, result);
      expect(
        Buffer.from(result.payload).equals(
          readFileSync(resolve(directory, "capsule.detached.jcs")),
        ),
      ).toBe(true);
      expect(
        Buffer.from(result.envelope).equals(
          readFileSync(resolve(directory, "envelope.cose")),
        ),
      ).toBe(true);
      expect(verifyEnvelope(result.capsuleId, result.envelope).ok).toBe(true);
    });
  }
});
