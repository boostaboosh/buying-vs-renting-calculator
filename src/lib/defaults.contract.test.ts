/**
 * Contract tests for src/lib/defaults.ts (docs/model-spec.md, section 3),
 * written from the spec and NOT from the implementation.
 *
 * minimumDeposit(price, maxLoan, minPct = 10):
 *   need = max(price − maxLoan, price × minPct / 100)
 *   result = min(price, need rounded UP to the next £1,000)
 * Tests do not depend on the values in DEFAULTS.
 */
import { describe, expect, it } from "vitest";
import { minimumDeposit } from "./defaults";

describe("minimumDeposit", () => {
  it("income cap binds: deposit covers what the lender won't lend", () => {
    // 500,000 − 405,000 = 95,000 (> 10% = 50,000); already a multiple of 1,000
    expect(minimumDeposit(500_000, 405_000)).toBe(95_000);
    // 600,000 − 360,000 = 240,000 (> 60,000)
    expect(minimumDeposit(600_000, 360_000)).toBe(240_000);
  });

  it("income cap binds and is rounded up to the next £1,000", () => {
    // 500,000 − 404,500 = 95,500 → 96,000
    expect(minimumDeposit(500_000, 404_500)).toBe(96_000);
    // 412,345 − 300,000 = 112,345 → 113,000
    expect(minimumDeposit(412_345, 300_000)).toBe(113_000);
    // just £1 over a multiple still rounds up: 500,000 − 404,999 = 95,001 → 96,000
    expect(minimumDeposit(500_000, 404_999)).toBe(96_000);
  });

  it("10% floor binds when the income cap would lend (almost) everything", () => {
    // 300,000 − 280,000 = 20,000 < 10% = 30,000 → 30,000
    expect(minimumDeposit(300_000, 280_000)).toBe(30_000);
    // 10% of 325,500 = 32,550 → 33,000
    expect(minimumDeposit(325_500, 310_000)).toBe(33_000);
  });

  it("the two constraints meet: price − maxLoan = 10% of price", () => {
    // 400,000 − 360,000 = 40,000 = 10%
    expect(minimumDeposit(400_000, 360_000)).toBe(40_000);
  });

  it("maxLoan ≥ price: only the percentage floor applies", () => {
    expect(minimumDeposit(400_000, 400_000)).toBe(40_000);
    expect(minimumDeposit(400_000, 810_000)).toBe(40_000);
    expect(minimumDeposit(400_000, Number.MAX_SAFE_INTEGER)).toBe(40_000);
    // 10% of 287,650 = 28,765 → 29,000
    expect(minimumDeposit(287_650, 1_000_000)).toBe(29_000);
  });

  it("exact multiples of £1,000 are not rounded up (including float-prone 10% values)", () => {
    // 10% of any multiple of £10,000 is a multiple of £1,000. Note e.g.
    // 290,000 × 0.1 = 29,000.000000000004 in floating point, which must not become 30,000.
    for (let price = 100_000; price <= 2_000_000; price += 10_000) {
      expect(minimumDeposit(price, 10_000_000), `price ${price}`).toBe(price / 10);
    }
    expect(minimumDeposit(250_000, 1_000_000)).toBe(25_000);
    expect(minimumDeposit(1_000_000, 900_000)).toBe(100_000);
  });

  it("custom minPct", () => {
    // 5% of 300,000 = 15,000
    expect(minimumDeposit(300_000, 1_000_000, 5)).toBe(15_000);
    // 15% of 300,000 = 45,000
    expect(minimumDeposit(300_000, 1_000_000, 15)).toBe(45_000);
    // 5% of 312,340 = 15,617 → 16,000
    expect(minimumDeposit(312_340, 1_000_000, 5)).toBe(16_000);
    // 25% of 400,000 = 100,000 beats the cap gap 400,000 − 350,000 = 50,000
    expect(minimumDeposit(400_000, 350_000, 25)).toBe(100_000);
    // 5% of 400,000 = 20,000 loses to the cap gap 50,000
    expect(minimumDeposit(400_000, 350_000, 5)).toBe(50_000);
    // 0%: nothing needed when the lender covers the whole price
    expect(minimumDeposit(400_000, 400_000, 0)).toBe(0);
    expect(minimumDeposit(400_000, 500_000, 0)).toBe(0);
  });

  it("minPct defaults to 10", () => {
    for (const [price, maxLoan] of [[300_000, 1_000_000], [325_500, 310_000], [500_000, 404_500]]) {
      expect(minimumDeposit(price, maxLoan)).toBe(minimumDeposit(price, maxLoan, 10));
    }
  });

  it("never more than the price", () => {
    // Lender lends nothing: need the whole price; 150,500 would round up to 151,000 → capped
    expect(minimumDeposit(150_500, 0)).toBe(150_500);
    expect(minimumDeposit(200_000, 0)).toBe(200_000);
    // gap 99,999 − 0 = 99,999 → rounds up to 100,000 → capped at the 99,999 price
    expect(minimumDeposit(99_999, 0)).toBe(99_999);
    // 100% minimum on a non-round price
    expect(minimumDeposit(123_456, 1_000_000, 100)).toBe(123_456);
    // Rounding up the 10% floor on a tiny price: 10% of 500 = 50 → 1,000 → capped at 500
    expect(minimumDeposit(500, 1_000_000)).toBe(500);
    expect(minimumDeposit(0, 0)).toBe(0);
  });

  it("result is always within [0, price], ≥ both constraints, and < need + £1,000", () => {
    for (const price of [95_000, 187_250, 333_333, 500_000, 777_777, 1_234_567]) {
      for (const maxLoan of [0, 50_000, 200_000, 405_000, 810_000, 2_000_000]) {
        for (const minPct of [5, 10, 15]) {
          const d = minimumDeposit(price, maxLoan, minPct);
          const need = Math.max(price - maxLoan, (price * minPct) / 100);
          const label = `${price}/${maxLoan}/${minPct}`;
          expect(d, label).toBeGreaterThanOrEqual(0);
          expect(d, label).toBeLessThanOrEqual(price);
          if (d < price) {
            expect(d % 1_000, label).toBe(0);
            expect(d, label).toBeGreaterThanOrEqual(need - 1e-6);
            expect(d, label).toBeLessThan(need + 1_000);
          } else {
            expect(need + 1_000, label).toBeGreaterThan(price); // capped only when rounding hits the price
          }
        }
      }
    }
  });
});
