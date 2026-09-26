import { describe, expect, it } from "vitest";
import { takeHomePay } from "./finance";
import { type Inputs, USER_EXAMPLE, leverageRace, project } from "./projection";

// docs/model-spec.md, "Property: the simple case matches the leverage race".
// The quick sum people do: a £300k flat bought with a £60k deposit, the house
// growing 2% a year, the deposit invested at 5% instead, and nothing else going on.
const simple: Inputs = {
  ...USER_EXAMPLE,
  price: 300_000,
  deposit: 60_000,
  firstTimeBuyer: true, // £300k is in the 0% band, so no stamp duty
  purchaseFees: 0,
  sellingCostPct: 0,
  mortgageType: "interestOnly",
  mortgageRate: 0,
  followOnRate: 0,
  serviceCharge: 0,
  maintenancePct: 0,
  lodgerRent: 0,
  rent: 0,
  livingCosts: takeHomePay(USER_EXAMPLE.salary), // nothing left over to save
  houseGrowth: 2,
  stockReturn: 5,
  inflation: 0,
  useIsa: false,
  years: 50,
};

describe("the simple case matches the leverage race", () => {
  const proj = project(simple);
  const race = leverageRace(simple);

  it("has no stamp duty or fees, so both start with the deposit", () => {
    expect(proj.upfront.cashNeeded).toBe(60_000);
    expect(proj.rows[0].renterNetWorth).toBe(60_000);
    expect(proj.rows[0].buyerNetWorth).toBe(60_000);
  });

  it("gives the buyer the deposit plus the home's total gain", () => {
    for (const t of [1, 2, 10, 30, 50]) {
      // 60,000 + 300,000 × (1.02^t − 1); year 1 = 66,000, year 2 = 72,120
      const expected = 60_000 + 300_000 * (1.02 ** t - 1);
      expect(proj.rows[t].buyerNetWorth).toBeCloseTo(expected, 4);
      expect(proj.rows[t].buyerNetWorth).toBeCloseTo(60_000 + race.rows[t - 1].homeTotal, 4);
    }
  });

  it("gives the renter the deposit grown at the share return", () => {
    for (const t of [1, 2, 10, 30, 50]) {
      // 60,000 × 1.05^t; year 1 = 63,000, year 2 = 66,150
      const expected = 60_000 * 1.05 ** t;
      expect(proj.rows[t].renterNetWorth).toBeCloseTo(expected, 4);
      expect(proj.rows[t].renterNetWorth).toBeCloseTo(60_000 + race.rows[t - 1].cashTotal, 4);
    }
  });

  it("has the buyer ahead first and the renter overtaking once the totals catch up", () => {
    // Totals: home 300,000 × (1.02^t − 1) against cash 60,000 × (1.05^t − 1).
    // t = 40: home 362,412 vs cash 362,399 (home still just ahead)
    // t = 41: home 375,660 vs cash 383,519 (cash ahead), so the renter overtakes in year 41.
    const crossing = race.catchUpYear!;
    expect(crossing).toBe(41);
    for (let t = 1; t < crossing; t++) {
      expect(proj.rows[t].buyerNetWorth).toBeGreaterThan(proj.rows[t].renterNetWorth);
    }
    for (let t = crossing; t <= 50; t++) {
      expect(proj.rows[t].renterNetWorth).toBeGreaterThanOrEqual(proj.rows[t].buyerNetWorth);
    }
  });
});
