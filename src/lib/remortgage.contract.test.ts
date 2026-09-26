/**
 * Contract tests for the remortgage, yearOneCosts and breakevenHouseGrowth
 * changes in docs/model-spec.md (section 2), written from the spec and standard
 * annuity maths, NOT from the implementation.
 *
 * Remortgage rule (spec): month m uses `mortgageRate` while m < fixYears × 12 and
 * `followOnRate` from then on. A repayment mortgage pays
 * mortgagePayment(loan, mortgageRate, mortgageTerm) during the fix; at month
 * fixYears × 12 (if still within the term) the payment resets to
 * mortgagePayment(balance then, followOnRate, mortgageTerm − fixYears).
 * Interest-only pays interest at that month's rate. If fixYears ≥ mortgageTerm
 * only the starting rate is used and followOnMonthlyMortgage = monthlyMortgage.
 *
 * Hand anchors (USER_EXAMPLE: loan 405,000, 3% over 30 years, 5-year fix):
 *  - payment P0 = 405,000 × 0.0025 / (1 − 1.0025^−360) = 1,707.4963
 *  - balance after 60 payments B60 = 405,000·1.0025^60 − P0·(1.0025^60 − 1)/0.0025
 *    = 360,070.7716
 *  - reset at 6% over 25 years: B60 × 0.005 / (1 − 1.005^−300) = 2,319.9410
 *  - reset at 1.5% over 25 years: 1,440.0538
 */
import { describe, expect, it } from "vitest";
import {
  USER_EXAMPLE,
  breakevenHouseGrowth,
  project,
  summarise,
  yearOneCosts,
  type Inputs,
} from "./projection";

/** Within a penny, or 1e-9 relative for large numbers. */
function close(actual: number, expected: number, label = ""): void {
  const tol = Math.max(0.01, Math.abs(expected) * 1e-9);
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${label}: expected ${expected}, got ${actual} (diff ${actual - expected})`);
  }
}

const inp = (over: Partial<Inputs> = {}): Inputs => ({ ...USER_EXAMPLE, ...over });

/** Standard annuity payment; equal instalments at 0%. */
function annuity(principal: number, ratePct: number, termYears: number): number {
  const n = termYears * 12;
  const r = ratePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Closed-form balance after k payments of that annuity. */
function balanceAfter(principal: number, ratePct: number, termYears: number, k: number): number {
  const r = ratePct / 100 / 12;
  if (r === 0) return principal * (1 - k / (termYears * 12));
  const g = Math.pow(1 + r, k);
  return principal * g - (annuity(principal, ratePct, termYears) * (g - 1)) / r;
}

/** Interest paid over `months` months starting from `balance`, paying `payment` at `ratePct`. */
function interestOver(balance: number, ratePct: number, payment: number, months: number) {
  const r = ratePct / 100 / 12;
  let b = balance;
  let interest = 0;
  for (let m = 0; m < months; m++) {
    interest += b * r;
    b -= payment - b * r;
  }
  return { interest, balance: b };
}

const LOAN = 405_000;
const P0 = 1_707.4963; // hand anchor, see header
const B60 = 360_070.7716;

describe("hand anchors (self-check of the helpers above)", () => {
  it("match the numbers in the header", () => {
    expect(annuity(LOAN, 3, 30)).toBeCloseTo(P0, 4);
    expect(balanceAfter(LOAN, 3, 30, 60)).toBeCloseTo(B60, 3);
    expect(annuity(B60, 6, 25)).toBeCloseTo(2_319.941, 3);
    expect(annuity(B60, 1.5, 25)).toBeCloseTo(1_440.0538, 3);
    // Same rate after the fix → the reset payment is the original payment.
    expect(annuity(balanceAfter(LOAN, 3, 30, 60), 3, 25)).toBeCloseTo(P0, 4);
  });
});

// ---------------------------------------------------------------------------
// Repayment mortgage: payment reset at the end of the fix
// ---------------------------------------------------------------------------

describe("remortgage: repayment", () => {
  it("USER_EXAMPLE has a 5-year fix at 3% and a 3% follow-on rate", () => {
    expect(USER_EXAMPLE.fixYears).toBe(5);
    expect(USER_EXAMPLE.followOnRate).toBe(3);
    expect(USER_EXAMPLE.mortgageRate).toBe(3);
  });

  it("follow-on rate equal to the starting rate: same payment every year, as before", () => {
    const p = project(USER_EXAMPLE);
    close(p.monthlyMortgage, annuity(LOAN, 3, 30), "monthlyMortgage");
    close(p.followOnMonthlyMortgage, annuity(LOAN, 3, 30), "followOnMonthlyMortgage");
    for (let n = 1; n <= 30; n++) close(p.rows[n].mortgagePaid, 12 * annuity(LOAN, 3, 30), `y${n}`);
    close(p.rows[10].mortgageBalance, balanceAfter(LOAN, 3, 30, 120), "balance y10");
  });

  it("3% → 6%: payment resets to mortgagePayment(remainingBalance(loan, 3%, 30, 60), 6%, 25)", () => {
    const p = project(inp({ followOnRate: 6 }));
    const reset = annuity(balanceAfter(LOAN, 3, 30, 60), 6, 25); // 2,319.94
    close(p.monthlyMortgage, annuity(LOAN, 3, 30), "starting payment unchanged"); // 1,707.50
    close(p.followOnMonthlyMortgage, reset, "followOnMonthlyMortgage");
    expect(p.followOnMonthlyMortgage).toBeCloseTo(2_319.94, 2);
    for (let n = 1; n <= 5; n++) close(p.rows[n].mortgagePaid, 12 * annuity(LOAN, 3, 30), `fixed y${n}`);
    for (let n = 6; n <= 30; n++) close(p.rows[n].mortgagePaid, 12 * reset, `reset y${n}`);
    close(p.rows[5].mortgageBalance, B60, "balance at end of fix");
  });

  it("3% → 6%: the balance still reaches 0 at the end of the term", () => {
    const p = project(inp({ followOnRate: 6 }));
    expect(Math.abs(p.rows[30].mortgageBalance)).toBeLessThan(0.01);
    close(p.totals.capitalRepaid, LOAN, "capitalRepaid");
    for (let n = 1; n <= 30; n++) {
      expect(p.rows[n].mortgageBalance).toBeLessThan(p.rows[n - 1].mortgageBalance);
    }
  });

  it("3% → 6%: interest in year 5 uses 3%, interest in year 6 uses 6%", () => {
    const p = project(inp({ followOnRate: 6 }));
    // Year 5 = months 48..59 at 3% on the original payment.
    const b48 = balanceAfter(LOAN, 3, 30, 48);
    const y5 = interestOver(b48, 3, annuity(LOAN, 3, 30), 12);
    close(p.rows[5].interestPaid, y5.interest, "y5 interest");
    // Year 6 = months 60..71 at 6% on the reset payment: 21,429.89 (hand loop from B60).
    const y6 = interestOver(B60, 6, annuity(B60, 6, 25), 12);
    expect(y6.interest).toBeCloseTo(21_429.89, 1);
    close(p.rows[6].interestPaid, y6.interest, "y6 interest");
    close(p.rows[6].mortgageBalance, y6.balance, "y6 balance"); // 353,661.37
    // Capital identity still holds in the reset year.
    close(p.rows[6].mortgagePaid - p.rows[6].interestPaid,
      p.rows[5].mortgageBalance - p.rows[6].mortgageBalance, "capital y6");
  });

  it("3% → 1.5%: lower reset payment, balance still reaches 0", () => {
    const p = project(inp({ followOnRate: 1.5 }));
    close(p.followOnMonthlyMortgage, annuity(B60, 1.5, 25), "followOn"); // 1,440.05
    expect(p.followOnMonthlyMortgage).toBeCloseTo(1_440.05, 2);
    close(p.rows[6].mortgagePaid, 12 * annuity(B60, 1.5, 25), "y6 paid");
    close(p.rows[6].interestPaid, interestOver(B60, 1.5, annuity(B60, 1.5, 25), 12).interest, "y6 interest");
    expect(Math.abs(p.rows[30].mortgageBalance)).toBeLessThan(0.01);
  });

  it("5% → 2% after a 2-year fix on a 25-year term: reset, then 0 after the term", () => {
    const i = inp({ mortgageRate: 5, fixYears: 2, followOnRate: 2, mortgageTerm: 25, years: 30 });
    const p = project(i);
    const b24 = balanceAfter(LOAN, 5, 25, 24);
    const reset = annuity(b24, 2, 23);
    close(p.monthlyMortgage, annuity(LOAN, 5, 25), "start");
    close(p.followOnMonthlyMortgage, reset, "reset");
    close(p.rows[2].mortgageBalance, b24, "balance at fix");
    close(p.rows[3].mortgagePaid, 12 * reset, "y3");
    expect(Math.abs(p.rows[25].mortgageBalance)).toBeLessThan(0.01);
    for (let n = 26; n <= 30; n++) {
      expect(p.rows[n].mortgagePaid).toBe(0);
      expect(Math.abs(p.rows[n].mortgageBalance)).toBeLessThan(1e-6);
    }
    close(p.totals.capitalRepaid, LOAN, "capitalRepaid");
  });

  it("0% fix then 4%: 405,000/120 = 3,375 a month, then the reset on 202,500 over 5 years", () => {
    const p = project(inp({ mortgageRate: 0, fixYears: 5, followOnRate: 4, mortgageTerm: 10, years: 12 }));
    close(p.monthlyMortgage, 3_375, "start");
    close(p.rows[5].mortgageBalance, 202_500, "balance at fix"); // 405,000 − 60 × 3,375
    close(p.rows[5].interestPaid, 0, "0% during the fix");
    // 202,500 × (0.04/12) / (1 − (1 + 0.04/12)^−60) = 3,729.35
    close(p.followOnMonthlyMortgage, annuity(202_500, 4, 5), "reset");
    expect(p.followOnMonthlyMortgage).toBeCloseTo(3_729.35, 2);
    expect(Math.abs(p.rows[10].mortgageBalance)).toBeLessThan(0.01);
  });

  it("4% fix then 0%: equal instalments of the remaining balance over the remaining term", () => {
    const p = project(inp({ mortgageRate: 4, fixYears: 3, followOnRate: 0, mortgageTerm: 15, years: 20 }));
    const b36 = balanceAfter(LOAN, 4, 15, 36); // 342,163.22
    close(p.followOnMonthlyMortgage, b36 / 144, "reset"); // 2,376.13
    close(p.rows[4].interestPaid, 0, "0% after the fix");
    close(p.rows[4].mortgagePaid, 12 * (b36 / 144), "y4 paid");
    expect(Math.abs(p.rows[15].mortgageBalance)).toBeLessThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// Interest-only
// ---------------------------------------------------------------------------

describe("remortgage: interest-only", () => {
  it("3% → 6%: 12,150 a year during the fix, 24,300 after; balance stays at the loan", () => {
    const p = project(inp({ mortgageType: "interestOnly", followOnRate: 6 }));
    close(p.monthlyMortgage, 1_012.5, "start"); // 405,000 × 3% / 12
    close(p.followOnMonthlyMortgage, 2_025, "followOn"); // 405,000 × 6% / 12
    for (let n = 1; n <= 5; n++) {
      close(p.rows[n].interestPaid, 12_150, `y${n}`);
      close(p.rows[n].mortgagePaid, 12_150, `paid y${n}`);
    }
    for (let n = 6; n <= 30; n++) {
      close(p.rows[n].interestPaid, 24_300, `y${n}`);
      close(p.rows[n].mortgagePaid, 24_300, `paid y${n}`);
    }
    for (const r of p.rows) close(r.mortgageBalance, LOAN, `balance row ${r.year}`);
  });

  it("4% → 2% after 3 years, continuing beyond a 25-year term", () => {
    const p = project(inp({ mortgageType: "interestOnly", mortgageRate: 4, fixYears: 3, followOnRate: 2,
      mortgageTerm: 25, years: 30 }));
    close(p.monthlyMortgage, 1_350, "start"); // 405,000 × 4% / 12
    close(p.followOnMonthlyMortgage, 675, "followOn"); // 405,000 × 2% / 12
    close(p.rows[3].interestPaid, 16_200, "y3");
    for (let n = 4; n <= 30; n++) close(p.rows[n].interestPaid, 8_100, `y${n}`);
    close(p.rows[30].mortgageBalance, LOAN, "balance");
  });
});

// ---------------------------------------------------------------------------
// Edge cases: fix ≥ term, fix ending at the horizon
// ---------------------------------------------------------------------------

describe("remortgage: edge cases", () => {
  it("fixYears = mortgageTerm: only the starting rate is used", () => {
    const a = project(inp({ fixYears: 30, followOnRate: 9 }));
    const b = project(inp({ fixYears: 30, followOnRate: 3 }));
    close(a.followOnMonthlyMortgage, a.monthlyMortgage, "followOn = start");
    close(a.monthlyMortgage, annuity(LOAN, 3, 30), "start");
    a.rows.forEach((r, n) => {
      close(r.mortgagePaid, b.rows[n].mortgagePaid, `paid ${n}`);
      close(r.buyerNetWorth, b.rows[n].buyerNetWorth, `buyer ${n}`);
    });
  });

  it("fixYears > mortgageTerm: only the starting rate is used, 0 after the term", () => {
    const p = project(inp({ fixYears: 35, followOnRate: 9, mortgageTerm: 25, years: 30 }));
    close(p.followOnMonthlyMortgage, annuity(LOAN, 3, 25), "followOn = start");
    close(p.monthlyMortgage, annuity(LOAN, 3, 25), "start");
    for (let n = 1; n <= 25; n++) close(p.rows[n].mortgagePaid, 12 * annuity(LOAN, 3, 25), `y${n}`);
    for (let n = 26; n <= 30; n++) expect(p.rows[n].mortgagePaid).toBe(0);
  });

  it("interest-only with fixYears ≥ mortgageTerm: followOnMonthlyMortgage = monthlyMortgage", () => {
    // Horizon kept within the fix, so only the starting rate applies in the rows.
    const p = project(inp({ mortgageType: "interestOnly", fixYears: 25, followOnRate: 9, mortgageTerm: 20, years: 25 }));
    close(p.monthlyMortgage, 1_012.5, "start");
    close(p.followOnMonthlyMortgage, 1_012.5, "followOn");
    for (let n = 1; n <= 25; n++) close(p.rows[n].interestPaid, 12_150, `y${n}`);
  });

  it("fix ending exactly at the horizon: rows unaffected, followOnMonthlyMortgage still reported", () => {
    const a = project(inp({ years: 5, followOnRate: 9 }));
    const b = project(inp({ years: 5, followOnRate: 3 }));
    a.rows.forEach((r, n) => {
      close(r.mortgagePaid, b.rows[n].mortgagePaid, `paid ${n}`);
      close(r.interestPaid, b.rows[n].interestPaid, `interest ${n}`);
      close(r.buyerNetWorth, b.rows[n].buyerNetWorth, `buyer ${n}`);
    });
    close(a.followOnMonthlyMortgage, annuity(B60, 9, 25), "followOn at 9%");
  });
});

// ---------------------------------------------------------------------------
// Effect on net worth
// ---------------------------------------------------------------------------

describe("remortgage: effect on the two households", () => {
  it("a higher follow-on rate lowers the buyer's final net worth and leaves the renter's unchanged", () => {
    const base = project(USER_EXAMPLE);
    const hi = project(inp({ followOnRate: 6 }));
    const lo = project(inp({ followOnRate: 1.5 }));
    expect(hi.rows[30].buyerNetWorth).toBeLessThan(base.rows[30].buyerNetWorth);
    expect(lo.rows[30].buyerNetWorth).toBeGreaterThan(base.rows[30].buyerNetWorth);
    base.rows.forEach((r, n) => {
      expect(hi.rows[n].renterNetWorth).toBe(r.renterNetWorth);
      expect(lo.rows[n].renterNetWorth).toBe(r.renterNetWorth);
    });
    // During the fix (first 60 months) nothing differs for the buyer either.
    for (let n = 0; n <= 5; n++) close(hi.rows[n].buyerNetWorth, base.rows[n].buyerNetWorth, `row ${n}`);
  });
});

// ---------------------------------------------------------------------------
// yearOneCosts
// ---------------------------------------------------------------------------

describe("yearOneCosts: spread transaction costs, growthNeeded, 5% rule", () => {
  // USER_EXAMPLE, derived by hand:
  //  interest (months 0..11 at 3% on 405k, payment 1,707.4963) = 12,034.3646
  //  runningCosts = 2,000 + Σ_{m=0..11} 500,000·1.03^(m/12) × 0.5%/12 = 4,534.1915
  //  opportunityCost = 108,000 × 7% = 7,560; expectedGrowth = 500,000 × 3% = 15,000
  //  transactionCostsPerYear = (10,000 SDLT + 3,000 fees + 2% × 500,000) / 30 = 766.6667
  //  buyBeforeGrowth = 12,034.3646 + 4,534.1915 + 7,560 + 766.6667 = 24,895.2228
  //  buyTotal = 24,895.2228 − 15,000 = 9,895.2228
  //  growthNeeded = (24,895.2228 − 24,000) / 500,000 × 100 = 0.179045%
  //  fivePercentRule = 500,000 × 5% = 25,000
  it("USER_EXAMPLE exact figures", () => {
    const y = yearOneCosts(USER_EXAMPLE);
    close(y.transactionCostsPerYear, 23_000 / 30, "transactionCostsPerYear");
    expect(y.interest).toBeCloseTo(12_034.3646, 3);
    expect(y.runningCosts).toBeCloseTo(4_534.1915, 3);
    expect(y.buyBeforeGrowth).toBeCloseTo(24_895.2228, 3);
    expect(y.buyTotal).toBeCloseTo(9_895.2228, 3);
    expect(y.growthNeeded).toBeCloseTo(0.179045, 5);
    close(y.fivePercentRule, 25_000, "fivePercentRule");
  });

  it("buyBeforeGrowth and buyTotal identities", () => {
    for (const over of [{}, { lodgerRent: 1_000 }, { firstTimeBuyer: false, sellingCostPct: 3, years: 10 }]) {
      const y = yearOneCosts(inp(over));
      close(y.buyBeforeGrowth,
        y.interest + y.runningCosts - y.lodgerIncome + y.opportunityCost + y.transactionCostsPerYear,
        `${JSON.stringify(over)} buyBeforeGrowth`);
      close(y.buyTotal, y.buyBeforeGrowth - y.expectedGrowth, `${JSON.stringify(over)} buyTotal`);
    }
  });

  it("non-FTB, 3% selling costs, 10 years: (15,000 + 3,000 + 15,000) / 10 = 3,300 a year", () => {
    close(yearOneCosts(inp({ firstTimeBuyer: false, sellingCostPct: 3, years: 10 })).transactionCostsPerYear,
      3_300, "transactionCostsPerYear");
  });

  it("growthNeeded: price × growthNeeded/100 = buyBeforeGrowth − rent", () => {
    for (const over of [{}, { rent: 4_000 }, { rent: 1_000, years: 5 }, { price: 350_000, deposit: 40_000 }]) {
      const i = inp(over);
      const y = yearOneCosts(i);
      close((i.price * y.growthNeeded) / 100, y.buyBeforeGrowth - y.rent, `${JSON.stringify(over)}`);
    }
  });

  it("growthNeeded is negative when owning is cheaper even with falling prices", () => {
    // Rent 4,000/month = 48,000/yr; (24,895.2228 − 48,000) / 500,000 × 100 = −4.62096%
    const y = yearOneCosts(inp({ rent: 4_000 }));
    expect(y.growthNeeded).toBeCloseTo(-4.620955, 5);
  });

  it("fivePercentRule = price × 5%", () => {
    close(yearOneCosts(inp({ price: 350_000, deposit: 40_000 })).fivePercentRule, 17_500, "350k");
  });

  it("years < 1 is treated as 1: all 23,000 of transaction costs fall in the one year", () => {
    const zero = yearOneCosts(inp({ years: 0 }));
    const one = yearOneCosts(inp({ years: 1 }));
    close(zero.transactionCostsPerYear, 23_000, "years 0");
    close(one.transactionCostsPerYear, 23_000, "years 1");
    expect(zero).toEqual(one);
    // Year-one flows are still there when years = 0.
    expect(zero.interest).toBeCloseTo(12_034.3646, 3);
    close(zero.rent, 24_000, "rent");
  });

  it("year one is inside the fix, so the follow-on rate doesn't change it", () => {
    const a = yearOneCosts(USER_EXAMPLE);
    const b = yearOneCosts(inp({ followOnRate: 8 }));
    close(b.interest, a.interest, "interest");
    close(b.buyTotal, a.buyTotal, "buyTotal");
  });
});

// ---------------------------------------------------------------------------
// breakevenHouseGrowth: rent growth moves with house growth
// ---------------------------------------------------------------------------

describe("breakevenHouseGrowth: rent growth keeps its gap to house growth", () => {
  const moved = (i: Inputs, g: number): Inputs =>
    ({ ...i, houseGrowth: g, rentGrowth: i.rentGrowth + (g - i.houseGrowth) });
  const diffMoved = (i: Inputs, g: number) => summarise(project(moved(i, g))).difference;
  const diffFixedRent = (i: Inputs, g: number) => summarise(project({ ...i, houseGrowth: g })).difference;
  const bisect = (f: (g: number) => number) => {
    let lo = -10;
    let hi = 20;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < 0) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  it("with rent growth moved to rentGrowth + (g − houseGrowth), the nominal difference is about 0", () => {
    for (const over of [{}, { rent: 1_500 }, { houseGrowth: 4, rentGrowth: 2 }, { followOnRate: 6 }]) {
      const i = inp(over);
      const g = breakevenHouseGrowth(i);
      expect(g).not.toBeNull();
      const below = diffMoved(i, g! - 0.01);
      const above = diffMoved(i, g! + 0.01);
      expect(below).toBeLessThanOrEqual(0);
      expect(above).toBeGreaterThanOrEqual(0);
      // |difference at g| is no bigger than the change across ±0.01pp.
      expect(Math.abs(diffMoved(i, g!))).toBeLessThanOrEqual(above - below);
    }
  });

  it("depends only on the gap: same answer for (3%, 1%), (5%, 3%) and (0%, −2%)", () => {
    // Under the old fixed-rent rule the houseGrowth input would not matter and
    // rentGrowth would, so these three would all differ.
    const a = breakevenHouseGrowth(inp({ houseGrowth: 3, rentGrowth: 1 }))!;
    const b = breakevenHouseGrowth(inp({ houseGrowth: 5, rentGrowth: 3 }))!;
    const c = breakevenHouseGrowth(inp({ houseGrowth: 0, rentGrowth: -2 }))!;
    expect(Math.abs(a - b)).toBeLessThan(0.02);
    expect(Math.abs(a - c)).toBeLessThan(0.02);
  });

  it("USER_EXAMPLE: differs from the old fixed-rent answer, and lies between it and houseGrowth", () => {
    // Independent reference simulation (projection.contract.test.ts): moving rent
    // growth gives ≈ +1.22%; holding rent growth at 3% gives ≈ −5.34%.
    // The difference rises with rent growth, so when the fixed-rent root is below
    // houseGrowth, lowering rent growth with g pushes the new root up towards houseGrowth.
    const i = USER_EXAMPLE;
    const g = breakevenHouseGrowth(i)!;
    const oldG = bisect((x) => diffFixedRent(i, x));
    expect(Math.abs(g - oldG)).toBeGreaterThan(1);
    expect(g).toBeGreaterThan(oldG);
    expect(g).toBeLessThan(i.houseGrowth);
    expect(Math.abs(g - 1.2157)).toBeLessThan(0.02);
    // And it agrees with a bisection of the moved-rent definition.
    expect(Math.abs(g - bisect((x) => diffMoved(i, x)))).toBeLessThan(0.01);
  });
});
