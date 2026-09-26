/**
 * Contract tests for `nominalRate` (finance.ts) and `leverageRace` (projection.ts),
 * written from docs/model-spec.md and hand calculations, NOT from the implementation.
 *
 * Spec:
 *  - nominalRate(realPct, inflationPct) = ((1 + real/100)(1 + infl/100) − 1) × 100
 *  - leverageRace(inputs): for t = 1..years, h = houseGrowth/100, s = stockReturn/100
 *      homeGain = price      × ((1+h)^t − (1+h)^(t−1)) = price      × (1+h)^(t−1) × h
 *      cashGain = cashNeeded × ((1+s)^t − (1+s)^(t−1)) = cashNeeded × (1+s)^(t−1) × s
 *    returns { rows: [{ year, homeGain, cashGain }], overtakeYear }, overtakeYear =
 *    first t with cashGain ≥ homeGain, else null. No other cash flow matters.
 */
import { describe, expect, it } from "vitest";
import { nominalRate } from "./finance";
import { USER_EXAMPLE, leverageRace, upfrontCosts, type Inputs } from "./projection";

/** Within a penny, or 1e-9 relative for large numbers. */
function close(actual: number, expected: number, label = ""): void {
  const tol = Math.max(0.01, Math.abs(expected) * 1e-9);
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${label}: expected ${expected}, got ${actual} (diff ${actual - expected})`);
  }
}

const inp = (over: Partial<Inputs> = {}): Inputs => ({ ...USER_EXAMPLE, ...over });

// USER_EXAMPLE by hand: price 500,000, houseGrowth 3, stockReturn 7, years 30.
// cashNeeded = deposit 95,000 + SDLT 10,000 (FTB: 0% to 300k, 5% of 200k) + fees 3,000
const PRICE = 500_000;
const CASH_NEEDED = 108_000;
const N = 30;

// ---------------------------------------------------------------------------
// nominalRate
// ---------------------------------------------------------------------------
describe("nominalRate", () => {
  it("5.2% real with 2% inflation is 7.304% nominal (spec example)", () => {
    // 1.052 × 1.02 = 1.07304
    expect(nominalRate(5.2, 2)).toBeCloseTo(7.304, 9);
  });

  it("0% real with 0% inflation is 0%", () => {
    expect(nominalRate(0, 0)).toBeCloseTo(0, 12);
  });

  it("0% real is just inflation; 0% inflation is just the real rate", () => {
    expect(nominalRate(0, 2)).toBeCloseTo(2, 12);
    expect(nominalRate(3, 0)).toBeCloseTo(3, 12);
  });

  it("negative real return: −4.9% real with 2% inflation is −2.998% nominal", () => {
    // 0.951 × 1.02 = 0.97002 → −2.998%
    expect(nominalRate(-4.9, 2)).toBeCloseTo(-2.998, 9);
  });

  it("is not simply real + inflation (the cross term counts)", () => {
    // 10% real, 10% inflation: 1.1 × 1.1 = 1.21 → 21%, not 20%
    expect(nominalRate(10, 10)).toBeCloseTo(21, 9);
  });

  it("inverts: (1 + nominal)/(1 + inflation) − 1 = real", () => {
    for (const [real, infl] of [
      [5.2, 2],
      [-4.9, 2],
      [0, 3.5],
      [7, -1],
      [12.3, 8.7],
    ]) {
      const n = nominalRate(real, infl);
      const back = ((1 + n / 100) / (1 + infl / 100) - 1) * 100;
      expect(back).toBeCloseTo(real, 9);
    }
  });
});

// ---------------------------------------------------------------------------
// leverageRace
// ---------------------------------------------------------------------------
describe("leverageRace: shape", () => {
  it("cashNeeded for USER_EXAMPLE is 108,000 (hand check of the input it uses)", () => {
    expect(upfrontCosts(USER_EXAMPLE).cashNeeded).toBe(CASH_NEEDED);
  });

  it("has one row per year, numbered 1..years", () => {
    for (const years of [1, 5, N]) {
      const { rows } = leverageRace(inp({ years }));
      expect(rows.length).toBe(years);
      expect(rows.map((r) => r.year)).toEqual(Array.from({ length: years }, (_, i) => i + 1));
    }
  });

  it("each row has year, homeGain and cashGain as numbers", () => {
    for (const r of leverageRace(USER_EXAMPLE).rows) {
      expect(typeof r.year).toBe("number");
      expect(typeof r.homeGain).toBe("number");
      expect(typeof r.cashGain).toBe("number");
    }
  });
});

describe("leverageRace: USER_EXAMPLE values", () => {
  // Called inside each test, so a missing function fails tests, not collection.
  const race = () => leverageRace(USER_EXAMPLE).rows;

  it("year 1: home gains 15,000, cash gains 7,560", () => {
    const rows = race();
    close(rows[0].homeGain, 15_000, "homeGain y1"); // 500,000 × 0.03
    close(rows[0].cashGain, 7_560, "cashGain y1"); // 108,000 × 0.07
  });

  it("year 2: home gains 15,450, cash gains 8,089.20", () => {
    const rows = race();
    close(rows[1].homeGain, 15_450, "homeGain y2"); // 500,000 × 1.03 × 0.03
    close(rows[1].cashGain, 8_089.2, "cashGain y2"); // 108,000 × 1.07 × 0.07
  });

  it("year 30: home gains 35,348.48, cash gains 53,783.78", () => {
    const rows = race();
    // 500,000 × 1.03^29 × 0.03 = 35,348.4826; 108,000 × 1.07^29 × 0.07 = 53,783.7833
    close(rows[N - 1].homeGain, 500_000 * 1.03 ** 29 * 0.03, "homeGain y30");
    close(rows[N - 1].cashGain, 108_000 * 1.07 ** 29 * 0.07, "cashGain y30");
    expect(rows[N - 1].homeGain).toBeCloseTo(35_348.48, 2);
    expect(rows[N - 1].cashGain).toBeCloseTo(53_783.78, 2);
  });

  it("gains telescope: Σ homeGain = price((1+h)^n − 1), Σ cashGain = cashNeeded((1+s)^n − 1)", () => {
    const rows = race();
    const sumHome = rows.reduce((a, r) => a + r.homeGain, 0);
    const sumCash = rows.reduce((a, r) => a + r.cashGain, 0);
    close(sumHome, PRICE * (1.03 ** N - 1), "Σ homeGain"); // 713,631.24
    close(sumCash, CASH_NEEDED * (1.07 ** N - 1), "Σ cashGain"); // 714,123.54
  });

  it("telescoping holds for other horizons and rates too", () => {
    for (const over of [
      { years: 7, houseGrowth: 5, stockReturn: 4 },
      { years: 12, houseGrowth: -2, stockReturn: 9 },
    ]) {
      const i = inp(over);
      const r = leverageRace(i).rows;
      const cash = upfrontCosts(i).cashNeeded;
      close(r.reduce((a, x) => a + x.homeGain, 0), i.price * ((1 + i.houseGrowth / 100) ** i.years - 1), "Σ home");
      close(r.reduce((a, x) => a + x.cashGain, 0), cash * ((1 + i.stockReturn / 100) ** i.years - 1), "Σ cash");
    }
  });
});

describe("leverageRace: overtakeYear", () => {
  /*
   * USER_EXAMPLE by hand. cashGain_t ≥ homeGain_t
   *   ⇔ 108,000 × 1.07^(t−1) × 0.07 ≥ 500,000 × 1.03^(t−1) × 0.03
   *   ⇔ 7,560 × 1.07^(t−1) ≥ 15,000 × 1.03^(t−1)
   *   ⇔ (1.07/1.03)^(t−1) ≥ 15,000/7,560 = 1.984127
   *   ⇔ t − 1 ≥ ln(1.984127)/ln(1.038835) = 0.685179/0.038100 = 17.98
   * so t − 1 = 18, t = 19.
   *   t = 18: home 24,792.71 vs cash 23,880.64 → cash behind
   *   t = 19: home 25,536.50 vs cash 25,552.29 → cash ahead (by ~£15.79)
   *   t = 20: home 26,302.59 vs cash 27,340.95 → cash ahead
   */
  it("USER_EXAMPLE: compounding on the cash overtakes leverage in year 19", () => {
    expect(leverageRace(USER_EXAMPLE).overtakeYear).toBe(19);
  });

  it("the rows agree with year 19 on either side", () => {
    const { rows } = leverageRace(USER_EXAMPLE);
    const y = (t: number) => rows[t - 1];
    for (let t = 1; t <= 18; t++) expect(y(t).cashGain).toBeLessThan(y(t).homeGain);
    expect(y(18).homeGain).toBeCloseTo(24_792.71, 2);
    expect(y(18).cashGain).toBeCloseTo(23_880.64, 2);
    expect(y(19).homeGain).toBeCloseTo(25_536.5, 2);
    expect(y(19).cashGain).toBeCloseTo(25_552.29, 2);
    expect(y(20).homeGain).toBeCloseTo(26_302.59, 2);
    expect(y(20).cashGain).toBeCloseTo(27_340.95, 2);
    for (let t = 19; t <= N; t++) expect(y(t).cashGain).toBeGreaterThanOrEqual(y(t).homeGain);
  });

  it("horizon exactly at the crossover still finds it; one year short gives null", () => {
    expect(leverageRace(inp({ years: 19 })).overtakeYear).toBe(19);
    expect(leverageRace(inp({ years: 18 })).overtakeYear).toBeNull();
    expect(leverageRace(inp({ years: 5 })).overtakeYear).toBeNull();
  });

  it("is 1 when house growth is 0 and stocks return more than 0", () => {
    // homeGain = 0 every year; cashGain y1 = 108,000 × 0.07 = 7,560 ≥ 0
    const r = leverageRace(inp({ houseGrowth: 0 }));
    expect(r.overtakeYear).toBe(1);
    for (const row of r.rows) close(row.homeGain, 0, `homeGain y${row.year}`);
  });

  it("is 1 when both rates are 0 (0 ≥ 0 counts)", () => {
    expect(leverageRace(inp({ houseGrowth: 0, stockReturn: 0 })).overtakeYear).toBe(1);
  });

  it("is null when house growth ≥ stock return and the price exceeds the cash", () => {
    // ratio cashGain/homeGain = (108,000 s)/(500,000 h) × ((1+s)/(1+h))^(t−1) never rises to 1
    expect(leverageRace(inp({ houseGrowth: 7, stockReturn: 7 })).overtakeYear).toBeNull();
    expect(leverageRace(inp({ houseGrowth: 8, stockReturn: 7 })).overtakeYear).toBeNull();
    expect(leverageRace(inp({ houseGrowth: 5, stockReturn: 3, years: 50 })).overtakeYear).toBeNull();
  });

  it("is 1 when house prices fall and stocks rise", () => {
    expect(leverageRace(inp({ houseGrowth: -2 })).overtakeYear).toBe(1);
  });
});

describe("leverageRace: negative house growth", () => {
  it("gives a negative homeGain every year", () => {
    const { rows } = leverageRace(inp({ houseGrowth: -2, years: 10 }));
    // year 1: 500,000 × −0.02 = −10,000; year 2: 500,000 × 0.98 × −0.02 = −9,800
    close(rows[0].homeGain, -10_000, "homeGain y1");
    close(rows[1].homeGain, -9_800, "homeGain y2");
    for (const r of rows) expect(r.homeGain).toBeLessThan(0);
  });
});

describe("leverageRace: what it depends on", () => {
  it("homeGain doesn't depend on the deposit or the mortgage rate", () => {
    const base = leverageRace(USER_EXAMPLE).rows.map((r) => r.homeGain);
    for (const over of [{ deposit: 150_000 }, { deposit: 50_000 }, { mortgageRate: 6, followOnRate: 6 }]) {
      const got = leverageRace(inp(over)).rows.map((r) => r.homeGain);
      got.forEach((g, i) => close(g, base[i], `homeGain y${i + 1} with ${JSON.stringify(over)}`));
    }
  });

  it("cashGain depends on the deposit through cashNeeded", () => {
    // deposit 150,000: SDLT unchanged at 10,000 → cashNeeded = 163,000; y1 = 163,000 × 0.07 = 11,410
    const i = inp({ deposit: 150_000 });
    expect(upfrontCosts(i).cashNeeded).toBe(163_000);
    const r = leverageRace(i);
    close(r.rows[0].cashGain, 11_410, "cashGain y1");
    close(r.rows[1].cashGain, 163_000 * 1.07 * 0.07, "cashGain y2"); // 12,208.70
    // (1.07/1.03)^(t−1) ≥ 15,000/11,410 = 1.314636 → t−1 ≥ 0.273560/0.038100 = 7.18 → t = 9
    expect(r.overtakeYear).toBe(9);
  });

  it("cashGain follows stamp duty and fees too (they're part of cashNeeded)", () => {
    // Not FTB: SDLT on 500k = 2% × 125k + 5% × 250k = 2,500 + 12,500 = 15,000
    // cashNeeded = 95,000 + 15,000 + 3,000 = 113,000 → y1 = 7,910
    close(leverageRace(inp({ firstTimeBuyer: false })).rows[0].cashGain, 7_910, "not FTB");
    // fees 8,000 → cashNeeded 113,000 as well
    close(leverageRace(inp({ purchaseFees: 8_000 })).rows[0].cashGain, 7_910, "fees 8k");
  });

  it("ignores rent, salary, the mortgage and every other cash flow", () => {
    const base = leverageRace(USER_EXAMPLE);
    const variations: Partial<Inputs>[] = [
      { rent: 3_500 },
      { rentGrowth: 6 },
      { salary: 40_000 },
      { salary: 200_000 },
      { earners: 2 },
      { livingCosts: 40_000 },
      { wageGrowth: 0 },
      { incomeMultiple: 3 },
      { mortgageRate: 6 },
      { followOnRate: 8, fixYears: 2 },
      { mortgageTerm: 20 },
      { mortgageType: "interestOnly" },
      { serviceCharge: 6_000 },
      { maintenancePct: 2 },
      { lodgerRent: 900 },
      { sellingCostPct: 5 },
      { inflation: 6 },
      { useIsa: false, cgtRate: 20 },
    ];
    for (const over of variations) {
      const got = leverageRace(inp(over));
      expect(got.overtakeYear, JSON.stringify(over)).toBe(base.overtakeYear);
      expect(got.rows.length).toBe(base.rows.length);
      got.rows.forEach((r, i) => {
        close(r.homeGain, base.rows[i].homeGain, `homeGain y${i + 1} ${JSON.stringify(over)}`);
        close(r.cashGain, base.rows[i].cashGain, `cashGain y${i + 1} ${JSON.stringify(over)}`);
      });
    }
  });
});
