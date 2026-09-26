/**
 * Contract tests for the "growth race" (docs/model-spec.md, section 2), written
 * from the spec and hand calculations, NOT from the implementation.
 *
 * Spec:
 *  - Row fields, all 0 on row 0:
 *    - `houseGain`: property value at the end of the year minus at the start.
 *    - `renterInvestmentGain` / `buyerInvestmentGain`: investment growth that
 *      year, before tax: Σ over the 12 months of (ISA + GIA after that month's
 *      flow) × monthly stock rate. New money paid in isn't growth.
 *  - `compoundingOvertakesYear(projection)`: first year ≥ 1 with
 *    renterInvestmentGain ≥ houseGain, else null.
 *
 * Row-by-row comparison with the independent reference simulation lives in
 * projection.contract.test.ts; this file sticks to hand-checkable cases and
 * identities.
 */
import { describe, expect, it } from "vitest";
import { USER_EXAMPLE, compoundingOvertakesYear, project, type Inputs } from "./projection";

/** Within a penny, or 1e-9 relative for large numbers. */
function close(actual: number, expected: number, label = ""): void {
  const tol = Math.max(0.01, Math.abs(expected) * 1e-9);
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${label}: expected ${expected}, got ${actual} (diff ${actual - expected})`);
  }
}

const inp = (over: Partial<Inputs> = {}): Inputs => ({ ...USER_EXAMPLE, ...over });

/** Everything that moves set to zero, 1-year horizon. */
const FLAT: Partial<Inputs> = {
  years: 1,
  wageGrowth: 0,
  mortgageRate: 0,
  followOnRate: 0,
  stockReturn: 0,
  houseGrowth: 0,
  rentGrowth: 0,
  inflation: 0,
  maintenancePct: 0,
  serviceCharge: 0,
  sellingCostPct: 0,
  lodgerRent: 0,
};

// Hand-derived for USER_EXAMPLE (salary 90k, price 500k, deposit 95k, FTB):
//  take-home 90,000 − 23,432 tax − 3,810.60 NI = 62,757.40; budget 49,757.40
//  cashNeeded = 95,000 + SDLT 10,000 + fees 3,000 = 108,000
const TAKE_HOME_90K = 62_757.4;
const BUDGET_DEFAULT = 49_757.4;
const CASH_NEEDED = 108_000;
const PRICE = 500_000;

/** livingCosts that make the budget exactly 12 × £2,000 rent → renter's flow is 0. */
const ZERO_RENTER_FLOW: Partial<Inputs> = { livingCosts: TAKE_HOME_90K - 24_000 };

/** Monthly stock rate from the spec: (1 + r)^(1/12) − 1. */
const monthly = (pct: number) => (1 + pct / 100) ** (1 / 12) - 1;

/**
 * Hand formula for one year's gain with a constant monthly flow c paid in before
 * each month's growth, pot P at the start and never empty during the year:
 *   pot_end = P(1+s)^12 + c Σ_{k=1..12} (1+s)^k = P(1+R) + c(1+s)R/s,  R = annual rate
 *   gain = pot_end − P − 12c = P·R + c·((1+s)·R/s − 12).
 */
const yearGain = (P: number, c: number, pct: number) => {
  const R = pct / 100;
  const s = monthly(pct);
  return P * R + c * ((1 + s) * R / s - 12);
};

const GROWTH = ["houseGain", "renterInvestmentGain", "buyerInvestmentGain"] as const;

describe("growth race: row 0", () => {
  it("all three gains are 0 on completion day", () => {
    for (const over of [{}, { houseGrowth: -3 }, { stockReturn: 12, years: 5 }, { earners: 2 as const }]) {
      const r0 = project(inp(over)).rows[0];
      for (const f of GROWTH) close(r0[f], 0, `row 0 ${f}`);
    }
  });
});

describe("growth race: houseGain", () => {
  it("is the change in property value over the year: price × ((1+g)^n − (1+g)^(n−1))", () => {
    const p = project(inp({ houseGrowth: 4, years: 10 }));
    // year 1: 500,000 × 4% = 20,000; year 2: 520,000 × 4% = 20,800
    close(p.rows[1].houseGain, 20_000, "y1");
    close(p.rows[2].houseGain, 20_800, "y2");
    for (let n = 1; n <= 10; n++) {
      close(p.rows[n].houseGain, PRICE * (1.04 ** n - 1.04 ** (n - 1)), `formula y${n}`);
      close(p.rows[n].houseGain, p.rows[n].propertyValue - p.rows[n - 1].propertyValue, `rows y${n}`);
    }
  });

  it("is on the whole price, not the deposit (same whatever the deposit)", () => {
    const small = project(inp({ deposit: 50_000, years: 5 }));
    const large = project(inp({ deposit: 400_000, years: 5 }));
    for (let n = 1; n <= 5; n++) {
      close(small.rows[n].houseGain, PRICE * 0.03 * 1.03 ** (n - 1), `deposit 50k y${n}`);
      close(large.rows[n].houseGain, small.rows[n].houseGain, `deposit 400k y${n}`);
    }
  });

  it("is negative when prices fall", () => {
    const p = project(inp({ houseGrowth: -2, years: 3 }));
    // 500,000 × −2% = −10,000; 490,000 × −2% = −9,800; 480,200 × −2% = −9,604
    close(p.rows[1].houseGain, -10_000, "y1");
    close(p.rows[2].houseGain, -9_800, "y2");
    close(p.rows[3].houseGain, -9_604, "y3");
  });

  it("is exactly 0 with 0% house growth", () => {
    const p = project(inp({ houseGrowth: 0, years: 5 }));
    for (let n = 1; n <= 5; n++) close(p.rows[n].houseGain, 0, `y${n}`);
  });

  it("summed over all years equals the final value minus the price", () => {
    for (const g of [3, -2.5, 7]) {
      const p = project(inp({ houseGrowth: g }));
      const sum = p.rows.reduce((s, r) => s + r.houseGain, 0);
      close(sum, p.rows[30].propertyValue - PRICE, `g=${g}`);
      close(sum, PRICE * ((1 + g / 100) ** 30 - 1), `g=${g} closed form`);
    }
  });
});

describe("growth race: investment gains, hand-checked", () => {
  it("1 year, renter's flow 0: gain = cashNeeded × stockReturn (108,000 × 7% = 7,560)", () => {
    const p = project(inp({ ...FLAT, ...ZERO_RENTER_FLOW, stockReturn: 7 }));
    close(p.rows[1].renterInvested, 0, "flow");
    close(p.rows[1].renterInvestmentGain, 7_560, "gain");
  });

  it("renter's flow 0 for 5 years: gain in year n = 7,560 × 1.07^(n−1)", () => {
    const p = project(inp({ ...FLAT, ...ZERO_RENTER_FLOW, stockReturn: 7, years: 5 }));
    for (let n = 1; n <= 5; n++) close(p.rows[n].renterInvestmentGain, 7_560 * 1.07 ** (n - 1), `y${n}`);
  });

  it("buyer with 0 flows and an empty pot earns nothing", () => {
    // FLAT: 0% mortgage → 405,000 / 360 = 1,125 a month. Service charge 10,500/yr = 875 a month.
    // Budget 2,000 a month → buyer's flow 2,000 − 1,125 − 875 = 0, so the pot stays empty.
    const p = project(inp({ ...FLAT, ...ZERO_RENTER_FLOW, serviceCharge: 10_500, stockReturn: 7, years: 3 }));
    for (let n = 1; n <= 3; n++) {
      close(p.rows[n].buyerInvested, 0, `flow y${n}`);
      close(p.rows[n].buyerInvestmentGain, 0, `gain y${n}`);
    }
  });

  it("everything is 0 when stockReturn is 0", () => {
    for (const over of [{}, { earners: 2 as const }, { rent: 7_000 }, { useIsa: false }]) {
      const p = project(inp({ ...over, stockReturn: 0 }));
      for (let n = 0; n <= 30; n++) {
        close(p.rows[n].renterInvestmentGain, 0, `renter y${n}`);
        close(p.rows[n].buyerInvestmentGain, 0, `buyer y${n}`);
      }
    }
  });

  it("new money isn't growth: 1 year with steady contributions matches the closed form", () => {
    // FLAT, 7%: renter's flow c = (49,757.40 − 24,000)/12 = 2,146.45 a month, pot starts 108,000.
    // gain = 108,000 × 7% + 2,146.45 × ((1+s)·0.07/s − 12) ≈ 7,560 + 966.8 ≈ 8,526.8,
    // far below the ~33,317 rise in the pot (which includes 25,757.40 of new money).
    const p = project(inp({ ...FLAT, stockReturn: 7 }));
    const c = (BUDGET_DEFAULT - 24_000) / 12;
    const expected = yearGain(CASH_NEEDED, c, 7);
    close(p.rows[1].renterInvestmentGain, expected, "renter");
    expect(expected).toBeGreaterThan(8_500);
    expect(expected).toBeLessThan(8_560);
    // Buyer: pot starts empty, flow (49,757.40 − 13,500)/12 = 3,021.45 a month.
    close(p.rows[1].buyerInvestmentGain, yearGain(0, (BUDGET_DEFAULT - 13_500) / 12, 7), "buyer");
  });

  it("timing matters: money in from the start of the year earns more than the same money paid in monthly", () => {
    // Run A: renter flow 0, pot 108,000 → gain 7,560.
    // Run B: same pot, plus 2,146.45 a month → the extra gain is only the growth on
    // the contributions, c × ((1+s)·0.07/s − 12) ≈ 966.8, not the 25,757.40 paid in.
    const a = project(inp({ ...FLAT, ...ZERO_RENTER_FLOW, stockReturn: 7 })).rows[1];
    const b = project(inp({ ...FLAT, stockReturn: 7 })).rows[1];
    const c = (BUDGET_DEFAULT - 24_000) / 12;
    close(b.renterInvestmentGain - a.renterInvestmentGain, c * ((1 + monthly(7)) * 0.07 / monthly(7) - 12), "extra gain");
    expect(b.renterInvestmentGain - a.renterInvestmentGain).toBeLessThan(0.05 * 12 * c);
  });

  it("withdrawals: growth is on the pot after each month's withdrawal; an empty pot earns nothing", () => {
    // FLAT, rent 10,000/month, 7%: renter's flow c = (49,757.40 − 120,000)/12 = −5,853.55 a month.
    // Year 1 the pot (108,000) never empties (108,000 − 70,242.60 plus growth > 0), so the
    // closed form holds: 7,560 − 5,853.55 × 0.4504 ≈ 4,924.
    // Year 2 starts near 108,000 × 1.07 − 72,700 ≈ 42,900 and empties mid-year → shortfall.
    // Year 3: shortfall all year, no ISA or GIA holdings → gain 0 (a shortfall earns nothing).
    const p = project(inp({ ...FLAT, rent: 10_000, stockReturn: 7, years: 3 }));
    const c = (BUDGET_DEFAULT - 120_000) / 12;
    close(p.rows[1].renterInvestmentGain, yearGain(CASH_NEEDED, c, 7), "y1");
    expect(p.rows[2].renterInvestmentGain).toBeGreaterThan(0);
    expect(p.rows[2].renterInvestmentGain).toBeLessThan(p.rows[1].renterInvestmentGain);
    close(p.rows[3].renterInvestmentGain, 0, "y3");
    expect(p.renterRanDryYear).toBe(2);
  });

  it("gains are before tax: the same whatever cgtRate and useIsa", () => {
    // ISA/GIA split and CGT change only what's taxed, not ISA + GIA, so gains can't move.
    const base = project(inp({ cgtRate: 0 }));
    for (const over of [{ cgtRate: 24 }, { cgtRate: 48 }, { useIsa: false }]) {
      const p = project(inp(over));
      for (let n = 1; n <= 30; n++) {
        close(p.rows[n].renterInvestmentGain, base.rows[n].renterInvestmentGain, `${JSON.stringify(over)} renter y${n}`);
        close(p.rows[n].buyerInvestmentGain, base.rows[n].buyerInvestmentGain, `${JSON.stringify(over)} buyer y${n}`);
      }
    }
  });
});

describe("growth race: identities (no CGT, so the portfolio is ISA + GIA − shortfall)", () => {
  // Each month a flow changes ISA + GIA − shortfall by exactly the flow (paid in, withdrawn,
  // or added to / repaid from the shortfall), and growth adds (ISA + GIA after the flow) × s.
  // So, before tax: portfolio[n] − portfolio[n−1] = invested[n] + gain[n].
  const cases: [string, Partial<Inputs>][] = [
    ["defaults", {}],
    ["GIA builds then is sold down", { rent: 800, rentGrowth: 12, wageGrowth: 0, years: 25, stockReturn: 6 }],
    ["renter runs dry then recovers", { rent: 7_000, rentGrowth: 0, wageGrowth: 8, stockReturn: 5, years: 25 }],
    ["buyer runs dry then recovers", { serviceCharge: 40_000, wageGrowth: 10, years: 20 }],
    ["couple", { earners: 2 }],
  ];

  for (const [name, over] of cases) {
    it(`year by year: ${name}`, () => {
      const p = project(inp({ ...over, cgtRate: 0 }));
      for (let n = 1; n < p.rows.length; n++) {
        const [a, b] = [p.rows[n - 1], p.rows[n]];
        close(b.renterPortfolio - a.renterPortfolio, b.renterInvested + b.renterInvestmentGain, `renter y${n}`);
        close(b.buyerPortfolio - a.buyerPortfolio, b.buyerInvested + b.buyerInvestmentGain, `buyer y${n}`);
      }
    });

    it(`summed over the horizon: ${name}`, () => {
      const p = project(inp({ ...over, cgtRate: 0 }));
      const last = p.rows[p.rows.length - 1];
      const sum = (f: "renterInvested" | "renterInvestmentGain" | "buyerInvested" | "buyerInvestmentGain") =>
        p.rows.reduce((s, r) => s + r[f], 0);
      // Renter starts with cashNeeded; buyer starts with nothing.
      close(last.renterPortfolio - CASH_NEEDED, sum("renterInvested") + sum("renterInvestmentGain"), "renter");
      close(last.buyerPortfolio, sum("buyerInvested") + sum("buyerInvestmentGain"), "buyer");
    });
  }

  it("investment gains are never negative when stockReturn ≥ 0", () => {
    for (const [, over] of cases) {
      for (const r of project(inp(over)).rows) {
        expect(r.renterInvestmentGain).toBeGreaterThanOrEqual(0);
        expect(r.buyerInvestmentGain).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("compoundingOvertakesYear", () => {
  it("null when house growth is high and stocks return 0 (row 0 doesn't count)", () => {
    // Renter gains 0 every year; house gains 50,000+ a year → never ≥.
    // Row 0 has 0 ≥ 0, so a function that looked at row 0 would wrongly answer 0.
    expect(compoundingOvertakesYear(project(inp({ houseGrowth: 10, stockReturn: 0 })))).toBeNull();
  });

  it("1 when house prices are flat or falling and stocks return more than 0", () => {
    // Year 1: renter gain > 0 (pot 108,000 at 7%) ≥ houseGain 0 or −10,000.
    expect(compoundingOvertakesYear(project(inp({ houseGrowth: 0, stockReturn: 7 })))).toBe(1);
    expect(compoundingOvertakesYear(project(inp({ houseGrowth: -2, stockReturn: 7 })))).toBe(1);
    expect(compoundingOvertakesYear(project(inp({ houseGrowth: -2, stockReturn: 0.5 })))).toBe(1);
  });

  it("'at least': a tie counts (0% stocks, 0% house growth → 0 ≥ 0 in year 1)", () => {
    expect(compoundingOvertakesYear(project(inp({ houseGrowth: 0, stockReturn: 0 })))).toBe(1);
  });

  it("1 when prices fall even with 0% stocks (0 ≥ a negative house gain)", () => {
    expect(compoundingOvertakesYear(project(inp({ houseGrowth: -1, stockReturn: 0 })))).toBe(1);
  });

  it("mid-horizon, by hand: zero renter flows, 7% stocks vs 3% house growth → year 19", () => {
    // Renter gain in year n = 108,000 × 0.07 × 1.07^(n−1) = 7,560 × 1.07^(n−1).
    // House gain in year n = 500,000 × 0.03 × 1.03^(n−1) = 15,000 × 1.03^(n−1).
    // Need (1.07/1.03)^(n−1) ≥ 15,000/7,560 = 1.984127.
    // ln 1.984127 = 0.685179; ln(1.07/1.03) = 0.0676586 − 0.0295588 = 0.0380998
    // → n − 1 ≥ 17.98 → n = 19.
    // Year 18: 7,560 × 1.07^17 ≈ 23,881 < 15,000 × 1.03^17 ≈ 24,793.
    // Year 19: 7,560 × 1.07^18 ≈ 25,552 ≥ 15,000 × 1.03^18 ≈ 25,536.
    const p = project(inp({ ...FLAT, ...ZERO_RENTER_FLOW, years: 30, houseGrowth: 3, stockReturn: 7 }));
    close(p.rows[18].renterInvestmentGain, 7_560 * 1.07 ** 17, "renter y18");
    close(p.rows[19].houseGain, 15_000 * 1.03 ** 18, "house y19");
    expect(compoundingOvertakesYear(p)).toBe(19);
  });

  it("null when the horizon ends before the crossover (same case, 18 years)", () => {
    const p = project(inp({ ...FLAT, ...ZERO_RENTER_FLOW, years: 18, houseGrowth: 3, stockReturn: 7 }));
    expect(compoundingOvertakesYear(p)).toBeNull();
  });

  it("USER_EXAMPLE: year 4 (reference simulation, see projection.contract.test.ts)", () => {
    // Reference: renter 8,527 / 10,955 / 13,609 / 16,506 vs house 15,000 / 15,450 / 15,914 / 16,391.
    expect(compoundingOvertakesYear(project(USER_EXAMPLE))).toBe(4);
  });

  it("is the first year ≥ 1 where the row's renterInvestmentGain ≥ houseGain", () => {
    for (const over of [{}, { houseGrowth: 5 }, { stockReturn: 4 }, { rent: 7_000, rentGrowth: 0, wageGrowth: 8, stockReturn: 5, years: 25 }, { earners: 2 as const }]) {
      const p = project(inp(over));
      const idx = p.rows.findIndex((r, n) => n >= 1 && r.renterInvestmentGain >= r.houseGain);
      expect(compoundingOvertakesYear(p), JSON.stringify(over)).toBe(idx === -1 ? null : idx);
    }
  });
});
