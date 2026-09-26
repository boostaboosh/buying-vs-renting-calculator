import { describe, expect, it } from "vitest";
import { remainingBalance } from "./finance";
import {
  USER_EXAMPLE,
  type Inputs,
  breakevenHouseGrowth,
  project,
  summarise,
  upfrontCosts,
  yearOneCosts,
} from "./projection";

const base: Inputs = { ...USER_EXAMPLE };

describe("upfrontCosts", () => {
  it("works out the user's example: £500k flat, £95k deposit, £90k salary", () => {
    const u = upfrontCosts(base);
    expect(u.loan).toBe(405_000);
    expect(u.maxLoan).toBe(405_000); // 4.5 × £90k
    expect(u.stampDuty).toBe(10_000);
    expect(u.cashNeeded).toBe(95_000 + 10_000 + 3_000);
    expect(u.loanToValue).toBeCloseTo(81, 6);
  });
});

describe("project", () => {
  it("starts both people with the same cash; the buyer loses stamp duty, fees and selling costs", () => {
    const r = project(base).rows[0];
    expect(r.renterNetWorth).toBe(108_000);
    expect(r.buyerNetWorth).toBeCloseTo(500_000 * 0.98 - 405_000, 6);
  });

  it("keeps the mortgage payment fixed while rent rises", () => {
    const rows = project({ ...base, inflation: 5 }).rows;
    expect(rows[1].mortgagePaid).toBeCloseTo(rows[10].mortgagePaid, 6);
    expect(rows[10].rentPaid).toBeCloseTo(rows[1].rentPaid * Math.pow(1.03, 9), 6);
  });

  it("interest-only costs 3% of £405k a year and never reduces the loan", () => {
    const rows = project({ ...base, mortgageType: "interestOnly" }).rows;
    expect(rows[1].mortgagePaid).toBeCloseTo(12_150, 6);
    expect(rows[30].mortgageBalance).toBe(405_000);
  });

  it("tracks the repayment mortgage balance month by month", () => {
    const rows = project(base).rows;
    expect(rows[10].mortgageBalance).toBeCloseTo(remainingBalance(405_000, 3, 30, 120), 4);
    expect(rows[30].mortgageBalance).toBeCloseTo(0, 4);
  });

  it("gives equity equal to the net sale price once the mortgage is paid off", () => {
    const last = project(base).rows[30];
    expect(last.equity).toBeCloseTo(last.propertyValue * 0.98, 4);
  });

  it("uses signed flows: more expensive rent drains the renter's portfolio", () => {
    const cheap = summarise(project({ ...base, rent: 900 }));
    const dear = summarise(project({ ...base, rent: 4_000 }));
    expect(dear.finalRenter).toBeLessThan(cheap.finalRenter);
    const drained = project({ ...base, rent: 6_000 });
    expect(drained.renterRanDryYear).not.toBeNull();
    expect(drained.rows[30].renterNetWorth).toBeLessThan(0);
  });

  it("puts the first £20k a year in the ISA and taxes gains on the rest", () => {
    const taxed = summarise(project(base));
    const untaxed = summarise(project({ ...base, useIsa: false }));
    expect(taxed.finalRenter).toBeLessThan(untaxed.finalRenter);
    // Renter invests ~£25.8k in year 1, so ~£5.8k goes into the taxable account.
    const cheapRent = summarise(project({ ...base, livingCosts: 30_000 })); // invests < £20k/yr
    const cheapRentUntaxed = summarise(project({ ...base, livingCosts: 30_000, useIsa: false }));
    expect(cheapRent.finalRenter).toBeCloseTo(cheapRentUntaxed.finalRenter, 0);
  });

  it("uses Rent-a-Room: lodger income is tax-free up to £7,500", () => {
    const small = project({ ...base, lodgerRent: 625 }).rows[1]; // £7,500/yr
    expect(small.lodgerIncome).toBeCloseTo(7_500, 6);
    const big = project({ ...base, lodgerRent: 1_400 }).rows[1]; // £16,800/yr
    expect(big.lodgerIncome).toBeCloseTo(16_800 - 3_720, 6);
  });

  it("higher house price growth helps the buyer and not the renter", () => {
    const low = summarise(project({ ...base, houseGrowth: 1 }));
    const high = summarise(project({ ...base, houseGrowth: 5 }));
    expect(high.finalBuyer).toBeGreaterThan(low.finalBuyer);
    expect(high.finalRenter).toBeCloseTo(low.finalRenter, 6);
  });

  it("reports real values below nominal ones", () => {
    const proj = project(base);
    expect(summarise(proj, true).finalBuyer).toBeLessThan(summarise(proj).finalBuyer);
  });
});

describe("breakevenHouseGrowth", () => {
  it("finds the growth rate where both finish level", () => {
    const g = breakevenHouseGrowth(base)!;
    expect(g).not.toBeNull();
    // Spec change: rent growth moves with house growth, keeping the gap
    // (rentGrowth + (g − houseGrowth)); previously rent growth was held at 3%.
    const rentGrowth = base.rentGrowth + (g - base.houseGrowth);
    expect(Math.abs(summarise(project({ ...base, houseGrowth: g, rentGrowth })).difference)).toBeLessThan(10);
  });
});

describe("yearOneCosts", () => {
  it("compares rent with interest + running costs + opportunity cost − growth", () => {
    const c = yearOneCosts(base);
    expect(c.rent).toBe(24_000);
    expect(c.interest).toBeGreaterThan(12_000);
    expect(c.interest).toBeLessThan(12_150);
    expect(c.opportunityCost).toBeCloseTo(108_000 * 0.07, 6);
    expect(c.expectedGrowth).toBe(15_000);
  });
});
