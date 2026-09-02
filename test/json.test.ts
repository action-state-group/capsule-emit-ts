import { describe, expect, it } from "vitest";
import { decodeStrictJson, jcs } from "../src/aac/index.js";

describe("strict JSON and JCS", () => {
  it("preserves literal backslash-slash and backslash-u text", () => {
    expect(new TextDecoder().decode(jcs({ x: "a\\/b", y: "\\u00AB" }))).toBe(
      '{"x":"a\\\\/b","y":"\\\\u00AB"}',
    );
  });

  it.each(["\u000b", "\u000c", "\u00a0", "\u2028", "\ufeff"])(
    "rejects non-JSON whitespace U+%s",
    (whitespace) => {
      expect(() => decodeStrictJson(`{"a":${whitespace}1}`)).toThrow();
    },
  );

  it.each([" ", "\t", "\n", "\r"])(
    "accepts RFC 8259 whitespace %j",
    (whitespace) => {
      expect(decodeStrictJson(`{"a":${whitespace}1}`)).toEqual({
        a: expect.objectContaining({ raw: "1" }),
      });
    },
  );
});
