/**
 * Contract tests for the running totals and `catchUpYear` in `leverageRace`
 * (projection.ts), written from docs/model-spec.md and hand calculations, NOT from
 * the implementation.
 *
 * Spec: for t = 1..years, h = houseGrowth/100, s = stockReturn/100
 *   homeTotal = price      × ((1+h)^t − 1)
 *   cashTotal = cashNeeded × ((1+s)^t − 1)
 *   catchUpYear = first t with cashTotal ≥ homeTotal, else null within `years`.
 *   catchUpYear is never earlier than overtakeYear. All figures nominal.
 */
import { describe, expect, it } from "vitest";
import { USER_EXAMPLE, leverageRace, upfrontCosts, type Inputs } from "./projection";

/** Within a penny, or 1e-9 relative for large numbers. */
function close(actual: number, expected: number, label = ""): void {
  const tol = Math.max(0.01, Math.abs(expected) * 1e-9);
  if (!(typeof actual === "number" && Math.abs(actual - expected) <= tol)) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const inp = (over: Partial<Inputs> = {}): Inputs => ({ ...USER_EXAMPLE, ...over });

// USER_EXAMPLE: price 500,000, houseGrowth 3, stockReturn 7, years 30.
// cashNeeded = deposit 95,000 + SDLT 10,000 (FTB) + fees 3,000 = 108,000
const PRICE = 500_000;
const CASH_NEEDED = 108_000;
const N = 30;

// Fields not yet in the type; read them loosely so the file still typechecks.
type Row = { year: number; homeGain: number; cashGain: number; homeTotal: number; cashTotal: number };
const race = (i: Inputs) => {
  const r = leverageRace(i) as unknown as { rows: Row[]; overtakeYear: number | null; catchUpYear: number | null };
  return r;
};

describe("leverageRace totals: shape", () => {
  it("every row has numeric homeTotal and cashTotal", () => {
    const { rows } = race(USER_EXAMPLE);
    expect(rows.length).toBe(N);
    for (const r of rows) {
      expect(typeof r.homeTotal, `homeTotal y${r.year}`).toBe("number");
      expect(typeof r.cashTotal, `cashTotal y${r.year}`).toBe("number");
    }
  });

  it("the result has a catchUpYear key (number or null)", () => {
    const r = race(USER_EXAMPLE);
    expect(r).toHaveProperty("catchUpYear");
    expect(r.catchUpYear === null || typeof r.catchUpYear === "number").toBe(true);
  });
});

describe("leverageRace totals: USER_EXAMPLE values", () => {
  it("cashNeeded is 108,000 (input check)", () => {
    expect(upfrontCosts(USER_EXAMPLE).cashNeeded).toBe(CASH_NEEDED);
  });

  it("year 1: totals equal that year's gains (15,000 and 7,560)", () => {
    const { rows } = race(USER_EXAMPLE);
    close(rows[0].homeTotal, 15_000, "homeTotal y1"); // 500,000 × 0.03
    close(rows[0].cashTotal, 7_560, "cashTotal y1"); // 108,000 × 0.07
    close(rows[0].homeTotal, rows[0].homeGain, "homeTotal y1 = homeGain y1");
    close(rows[0].cashTotal, rows[0].cashGain, "cashTotal y1 = cashGain y1");
  });

  it("year 2: home 30,450, cash 15,649.20", () => {
    const { rows } = race(USER_EXAMPLE);
    close(rows[1].homeTotal, 30_450, "homeTotal y2"); // 500,000 × (1.0609 − 1)
    close(rows[1].cashTotal, 15_649.2, "cashTotal y2"); // 108,000 × (1.1449 − 1)
  });

  it("year 30: home 713,631.24, cash 714,123.54", () => {
    const { rows } = race(USER_EXAMPLE);
    // 1.03^30 = 2.4272624712 → 500,000 × 1.4272624712 = 713,631.2356
    // 1.07^30 = 7.6122550423 → 108,000 × 6.6122550423 = 714,123.5446
    close(rows[N - 1].homeTotal, PRICE * (1.03 ** 30 - 1), "homeTotal y30");
    close(rows[N - 1].cashTotal, CASH_NEEDED * (1.07 ** 30 - 1), "cashTotal y30");
    expect(rows[N - 1].homeTotal).toBeCloseTo(713_631.24, 2);
    expect(rows[N - 1].cashTotal).toBeCloseTo(714_123.54, 2);
  });

  it("each total is the running sum of the yearly gains", () => {
    for (const i of [USER_EXAMPLE, inp({ houseGrowth: -2, stockReturn: 9, years: 12 }), inp({ houseGrowth: 5, stockReturn: 4, years: 7 })]) {
      const { rows } = race(i);
      let h = 0;
      let c = 0;
      for (const r of rows) {
        h += r.homeGain;
        c += r.cashGain;
        close(r.homeTotal, h, `homeTotal y${r.year}`);
        close(r.cashTotal, c, `cashTotal y${r.year}`);
      }
    }
  });
});

describe("leverageRace: catchUpYear", () => {
  /*
   * USER_EXAMPLE by hand: first t with 108,000(1.07^t − 1) ≥ 500,000(1.03^t − 1).
   * No closed form; tabulated (40-digit decimal arithmetic, no project code):
   *   t   homeTotal       cashTotal       cash − home
   *   28  643,963.84      610,074.54      −33,889.29
   *   29  678,282.75      660,339.76      −17,942.99
   *   30  713,631.24      714,123.54      +492.31
   *   31  750,040.17      771,672.19      +21,632.02
   * so catchUpYear = 30 (11 years after overtakeYear 19). Margin at 30 is £492,
   * far above floating-point error.
   */
  it("USER_EXAMPLE: the invested cash catches up in total in year 30", () => {
    expect(race(USER_EXAMPLE).catchUpYear).toBe(30);
  });

  it("the rows agree with year 30 on either side", () => {
    const { rows } = race(inp({ years: 31 }));
    const y = (t: number) => rows[t - 1];
    for (let t = 1; t <= 29; t++) expect(y(t).cashTotal, `y${t}`).toBeLessThan(y(t).homeTotal);
    expect(y(29).homeTotal).toBeCloseTo(678_282.75, 2);
    expect(y(29).cashTotal).toBeCloseTo(660_339.76, 2);
    expect(y(30).cashTotal).toBeGreaterThanOrEqual(y(30).homeTotal);
    expect(y(31).homeTotal).toBeCloseTo(750_040.17, 2);
    expect(y(31).cashTotal).toBeCloseTo(771_672.19, 2);
    expect(y(31).cashTotal).toBeGreaterThanOrEqual(y(31).homeTotal);
  });

  it("is null with years 29 (crossing is at 30), and still 30 over longer horizons", () => {
    expect(race(inp({ years: 29 })).catchUpYear).toBeNull();
    expect(race(inp({ years: 19 })).catchUpYear).toBeNull(); // overtake found, catch-up not yet
    expect(race(inp({ years: 31 })).catchUpYear).toBe(30);
    expect(race(inp({ years: 40 })).catchUpYear).toBe(30);
    expect(race(inp({ years: 60 })).catchUpYear).toBe(30);
  });

  it("is never earlier than overtakeYear (worked cases)", () => {
    // Hand/decimal-tabulated first crossings (price 500k, cash 108k):
    //  h 2, s 7: overtake t−1 ≥ ln(10000/7560)/ln(1.07/1.02) = 5.85 → 7; totals cross at 12
    //  h 3, s 8: overtake t−1 ≥ ln(15000/8640)/ln(1.08/1.03) = 11.64 → 13; totals cross at 21
    //  h 4, s 9: overtake 17; totals cross at 26
    const cases: [Partial<Inputs>, number, number][] = [
      [{ houseGrowth: 2, stockReturn: 7, years: 40 }, 7, 12],
      [{ houseGrowth: 3, stockReturn: 8, years: 40 }, 13, 21],
      [{ houseGrowth: 4, stockReturn: 9, years: 60 }, 17, 26],
      [{ houseGrowth: 3, stockReturn: 7, years: 60 }, 19, 30],
    ];
    for (const [over, ov, cu] of cases) {
      const r = race(inp(over));
      expect(r.overtakeYear, JSON.stringify(over)).toBe(ov);
      expect(r.catchUpYear, JSON.stringify(over)).toBe(cu);
    }
  });

  it("is never earlier than overtakeYear (sweep; null catch-up if no overtake)", () => {
    for (const h of [-3, 0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const s of [0, 3, 5, 7, 9, 12]) {
        for (const years of [10, 30, 50]) {
          const r = race(inp({ houseGrowth: h, stockReturn: s, years }));
          const tag = JSON.stringify({ h, s, years });
          expect(r.catchUpYear === null || typeof r.catchUpYear === "number", tag).toBe(true);
          if (r.catchUpYear !== null) {
            expect(r.overtakeYear, tag).not.toBeNull();
            expect(r.catchUpYear, tag).toBeGreaterThanOrEqual(r.overtakeYear as number);
          }
          if (r.overtakeYear === null) expect(r.catchUpYear, tag).toBeNull();
        }
      }
    }
  });

  it("is 1 when house growth is 0 and stocks return more than 0", () => {
    // homeTotal = 500,000 × (1 − 1) = 0; cashTotal y1 = 7,560 ≥ 0
    const r = race(inp({ houseGrowth: 0 }));
    expect(r.catchUpYear).toBe(1);
    for (const row of r.rows) close(row.homeTotal, 0, `homeTotal y${row.year}`);
  });

  it("is 1 when both rates are 0 (0 ≥ 0 counts)", () => {
    expect(race(inp({ houseGrowth: 0, stockReturn: 0 })).catchUpYear).toBe(1);
  });

  it("is 1 when house prices fall and stocks rise", () => {
    expect(race(inp({ houseGrowth: -2 })).catchUpYear).toBe(1);
  });

  it("is null when house growth ≥ stock return and the price exceeds the cash", () => {
    // (1+h)^t − 1 ≥ (1+s)^t − 1 ≥ 0 and 500,000 > 108,000 → homeTotal > cashTotal always
    expect(race(inp({ houseGrowth: 7, stockReturn: 7 })).catchUpYear).toBeNull();
    expect(race(inp({ houseGrowth: 8, stockReturn: 7 })).catchUpYear).toBeNull();
    expect(race(inp({ houseGrowth: 5, stockReturn: 3, years: 50 })).catchUpYear).toBeNull();
  });
});

describe("leverageRace totals: negative house growth", () => {
  it("gives negative homeTotal every year", () => {
    const { rows } = race(inp({ houseGrowth: -2, years: 10 }));
    close(rows[0].homeTotal, -10_000, "homeTotal y1"); // 500,000 × (0.98 − 1)
    close(rows[1].homeTotal, -19_800, "homeTotal y2"); // 500,000 × (0.9604 − 1)
    // 0.98^10 = 0.8170728069 → 500,000 × −0.1829271931 = −91,463.60
    expect(rows[9].homeTotal).toBeCloseTo(-91_463.6, 1);
    for (const r of rows) expect(r.homeTotal, `y${r.year}`).toBeLessThan(0);
  });

  it("gives negative cashTotal when stocks fall", () => {
    const { rows } = race(inp({ stockReturn: -5, years: 5 }));
    close(rows[0].cashTotal, -5_400, "cashTotal y1"); // 108,000 × −0.05
    for (const r of rows) expect(r.cashTotal, `y${r.year}`).toBeLessThan(0);
  });
});

describe("leverageRace totals: what they depend on", () => {
  it("ignore rent, salary, the mortgage and other cash flows", () => {
    const base = race(USER_EXAMPLE);
    const variations: Partial<Inputs>[] = [
      { rent: 3_500 },
      { rentGrowth: 6 },
      { salary: 40_000 },
      { salary: 200_000 },
      { earners: 2 },
      { livingCosts: 40_000 },
      { incomeMultiple: 3 },
      { mortgageRate: 6 },
      { followOnRate: 8, fixYears: 2 },
      { mortgageTerm: 20 },
      { mortgageType: "interestOnly" },
      { serviceCharge: 6_000 },
      { lodgerRent: 900 },
      { inflation: 6 },
    ];
    for (const over of variations) {
      const got = race(inp(over));
      const tag = JSON.stringify(over);
      expect(got.catchUpYear, tag).toBe(30);
      got.rows.forEach((r, i) => {
        close(r.homeTotal, base.rows[i].homeTotal, `homeTotal y${i + 1} ${tag}`);
        close(r.cashTotal, base.rows[i].cashTotal, `cashTotal y${i + 1} ${tag}`);
      });
    }
  });

  it("cashTotal follows the deposit through cashNeeded; homeTotal does not", () => {
    // deposit 150,000: cashNeeded = 150,000 + 10,000 + 3,000 = 163,000
    const r = race(inp({ deposit: 150_000 }));
    close(r.rows[0].cashTotal, 11_410, "cashTotal y1"); // 163,000 × 0.07
    close(r.rows[1].cashTotal, 163_000 * (1.07 ** 2 - 1), "cashTotal y2"); // 23,618.70
    close(r.rows[1].homeTotal, 30_450, "homeTotal y2 unchanged");
  });
});
