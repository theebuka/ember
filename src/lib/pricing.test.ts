import { describe, expect, it } from "vitest";
import { niceAmount, proPrice } from "@/lib/pricing";
import { PRO_PRICE_USD, yearlySaving } from "@/lib/plan";

describe("niceAmount", () => {
  it("rounds to two significant figures", () => {
    expect(niceAmount(16286.93)).toBe(16000);
    expect(niceAmount(11.04)).toBe(11);
    expect(niceAmount(9.47)).toBe(9.5);
    expect(niceAmount(1788)).toBe(1800);
  });
  it("refuses nonsense rather than printing it", () => {
    expect(niceAmount(0)).toBe(0);
    expect(niceAmount(Number.NaN)).toBe(0);
  });
});

describe("proPrice", () => {
  it("is the dollar price, unconverted, in dollars", () => {
    expect(proPrice("monthly", "USD", {})).toMatchObject({
      charged: PRO_PRICE_USD.monthly,
      converted: false,
    });
    expect(proPrice("yearly", "USD", {}).perMonth).toBe(PRO_PRICE_USD.yearly / 12);
  });
  it("converts at the rate and says so", () => {
    // 1 NGN = 1/1357 USD.
    const price = proPrice("monthly", "NGN", { NGN: 1 / 1357 });
    expect(price).toMatchObject({ currency: "NGN", charged: 16000, converted: true });
  });
  it("falls back to dollars when there is no rate", () => {
    expect(proPrice("monthly", "NGN", {})).toMatchObject({ currency: "USD", converted: false });
  });
  it("derives the saving from the two prices", () => {
    expect(yearlySaving()).toBeCloseTo(1 - 120 / 144);
  });
});
