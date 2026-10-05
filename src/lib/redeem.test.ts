import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_PATTERN,
  describePeriod,
  generateCode,
  isCompleteCode,
  normaliseCode,
  redeemMessage,
} from "@/lib/redeem";

describe("generateCode", () => {
  it("produces the shape the database accepts", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(CODE_PATTERN);
  });

  it("never uses a letter the alphabet leaves out", () => {
    const code = generateCode().replace(/-/g, "");
    for (const char of code) expect(CODE_ALPHABET).toContain(char);
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("rejects bytes past the last whole multiple of the alphabet", () => {
    // 248 is the first rejected byte for a 31-letter alphabet; a modulo would
    // have mapped it to the alphabet's start and skewed the distribution.
    let call = 0;
    const random = (bytes: Uint8Array) => {
      bytes.fill(call++ === 0 ? 248 : 0);
      return bytes;
    };
    expect(generateCode(random)).toBe("AAAA-AAAA-AAAA");
    expect(call).toBe(2);
  });
});

describe("normaliseCode", () => {
  it("formats what is typed or pasted", () => {
    expect(normaliseCode("abcd")).toBe("ABCD");
    expect(normaliseCode("abcde")).toBe("ABCD-E");
    expect(normaliseCode(" abcd efgh jkmn ")).toBe("ABCD-EFGH-JKMN");
    expect(normaliseCode("ABCD-EFGH-JKMN-PQRS")).toBe("ABCD-EFGH-JKMN");
    expect(normaliseCode("")).toBe("");
  });

  it("knows a finished code", () => {
    expect(isCompleteCode("ABCD-EFGH-JKMN")).toBe(true);
    expect(isCompleteCode("ABCD-EFGH-JKM")).toBe(false);
  });
});

describe("redeemMessage", () => {
  it("maps each refusal to its sentence and anything else to a retry", () => {
    expect(redeemMessage("code_used")).toMatch(/already been used/);
    expect(redeemMessage("code_redeemed")).toMatch(/already redeemed/);
    expect(redeemMessage("code_invalid")).toMatch(/isn't valid/);
    expect(redeemMessage("fetch failed")).toMatch(/try again/);
    expect(redeemMessage(undefined)).toMatch(/try again/);
  });

  it("names a custom period in days", () => {
    expect(describePeriod(30)).toBe("1 month");
    expect(describePeriod(45)).toBe("45 days");
    expect(describePeriod(1)).toBe("1 day");
  });
});
