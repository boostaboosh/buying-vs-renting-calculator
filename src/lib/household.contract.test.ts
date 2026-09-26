/**
 * Contract tests for the `earners` input (docs/model-spec.md, sections 1-2),
 * written from the spec and HMRC rules, NOT from the implementation.
 *
 * `earners` is the number of adults (1 or 2), each earning `salary`. It changes:
 *  - household take-home = earners × takeHomePay(salary) (tax and NI per person)
 *  - maxLoan = salary × earners × incomeMultiple
 *  - ISA allowance = £20,000 × earners per projection year
 *  - CGT exemption = £3,000 × earners (cgtOnGia(value, basis, rate, people))
 * It does NOT change the Rent-a-Room allowance (£7,500 per home) or the marginal
 * rate used for it (marginalTaxRate(salary), a per-person figure).
 *
 * All expected values are hand-derived in the comments.
 */
import { describe, expect, it } from "vitest";
import { cgtOnGia } from "./finance";
import { USER_EXAMPLE, project, upfrontCosts, type Inputs } from "./projection";

/** Within a penny, or 1e-9 relative for large numbers. */
function close(actual: number, expected: number, label = ""): void {
  const tol = Math.max(0.01, Math.abs(expected) * 1e-9);
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${label}: expected ${expected}, got ${actual} (diff ${actual - expected})`);
  }
}

const inp = (over: Partial<Inputs> & { earners?: number } = {}): Inputs =>
  ({ ...USER_EXAMPLE, ...over }) as Inputs;

/** Everything that moves set to zero, 1-year horizon. */
const FLAT = {
  years: 1,
  wageGrowth: 0,
  mortgageRate: 0,
  stockReturn: 0,
  houseGrowth: 0,
  rentGrowth: 0,
  inflation: 0,
  maintenancePct: 0,
  serviceCharge: 0,
  sellingCostPct: 0,
  lodgerRent: 0,
} satisfies Partial<Inputs>;

// Hand-derived take-home pay, 2025/26 (rUK):
//  90k: tax 37,700×20% + 39,730×40% = 23,432; NI 37,700×8% + 39,730×2% = 3,810.60
//       → 62,757.40
//  45k: tax (45,000 − 12,570) × 20% = 6,486; NI 32,430 × 8% = 2,594.40 → 35,919.60
//  40k: tax 27,430 × 20% = 5,486; NI 27,430 × 8% = 2,194.40 → 32,319.60
//  200k: PA 0; tax 37,700×20% + 87,440×40% + 74,860×45% = 7,540 + 34,976 + 33,687
//        = 76,203; NI 3,016 + 149,730×2% = 6,010.60 → 117,786.40
const TH_90K = 62_757.4;
const TH_45K = 35_919.6;
const TH_40K = 32_319.6;
const TH_200K = 117_786.4;

// ---------------------------------------------------------------------------
// Take-home and tax per person
// ---------------------------------------------------------------------------

describe("household take-home (tax and NI are per person)", () => {
  it("couple on 90k each takes home 2 × the single figure", () => {
    close(project(inp({ earners: 1 })).takeHome, TH_90K, "single");
    close(project(inp({ earners: 2 })).takeHome, 2 * TH_90K, "couple"); // 125,514.80
  });

  it("holds across bands: 40k and 200k couples", () => {
    close(project(inp({ earners: 2, salary: 40_000 })).takeHome, 2 * TH_40K, "40k"); // 64,639.20
    close(project(inp({ earners: 2, salary: 200_000 })).takeHome, 2 * TH_200K, "200k"); // 235,572.80
  });

  it("two £45k earners pay less tax than one £90k earner (not taxed on joint income)", () => {
    const couple = project(inp({ earners: 2, salary: 45_000 })).takeHome;
    const single = project(inp({ earners: 1, salary: 90_000 })).takeHome;
    close(couple, 2 * TH_45K, "couple 2 × 45k"); // 71,839.20
    // Same gross (90k), but 2 allowances and 2 basic-rate bands:
    // 71,839.20 − 62,757.40 = 9,081.80 more.
    close(couple - single, 9_081.8, "saving");
  });

  it("the yearly budget is household take-home − household living costs", () => {
    // Couple 90k: 125,514.80 − 13,000 = 112,514.80. Living costs are NOT doubled.
    close(project(inp({ ...FLAT, earners: 2 })).rows[1].budget, 112_514.8, "couple 90k");
    // Couple 45k: 71,839.20 − 13,000 = 58,839.20
    close(project(inp({ ...FLAT, earners: 2, salary: 45_000 })).rows[1].budget, 58_839.2, "couple 45k");
  });

  it("marginalRate is the per-person rate on `salary`, not on household income", () => {
    expect(project(inp({ earners: 2, salary: 45_000 })).marginalRate).toBe(20); // not 40 (90k)
    expect(project(inp({ earners: 2, salary: 90_000 })).marginalRate).toBe(40); // not 60 (180k)
    expect(project(inp({ earners: 2, salary: 70_000 })).marginalRate).toBe(40); // not 45 (140k)
  });
});

// ---------------------------------------------------------------------------
// maxLoan
// ---------------------------------------------------------------------------

describe("maxLoan uses household gross income", () => {
  it("doubles for a couple", () => {
    expect(upfrontCosts(inp({ earners: 1 })).maxLoan).toBe(405_000); // 90,000 × 4.5
    expect(upfrontCosts(inp({ earners: 2 })).maxLoan).toBe(810_000); // 2 × 90,000 × 4.5
    expect(upfrontCosts(inp({ earners: 2, incomeMultiple: 5 })).maxLoan).toBe(900_000);
  });

  it("two £45k earners borrow the same as one £90k earner", () => {
    expect(upfrontCosts(inp({ earners: 2, salary: 45_000 })).maxLoan).toBe(405_000);
  });

  it("the rest of the upfront figures don't depend on earners", () => {
    const a = upfrontCosts(inp({ earners: 1 }));
    const b = upfrontCosts(inp({ earners: 2 }));
    expect({ ...b, maxLoan: 0 }).toEqual({ ...a, maxLoan: 0 });
  });

  it("project().upfront carries the household maxLoan", () => {
    expect(project(inp({ earners: 2 })).upfront.maxLoan).toBe(810_000);
  });
});

// ---------------------------------------------------------------------------
// ISA allowance: £20,000 × earners
// ---------------------------------------------------------------------------

describe("ISA allowance is £20,000 per adult (£40,000 for a couple)", () => {
  // Both households get the SAME budget, 54,000/yr, so all flows are identical:
  //  single 90k: 62,757.40 − 8,757.40 = 54,000
  //  couple 45k: 71,839.20 − 17,839.20 = 54,000
  // Renter flow = 54,000 − 12 × 2,000 = 30,000/yr (flat: 0% wage and rent growth).
  // Buyer flow = 54,000 − (mortgage ≈ 20,490 + service ≤ ~3,600 + maintenance ≤ ~6,100)
  //   ≈ 24k-29k/yr, so always positive and under £40k.
  // So a couple's contributions always fit the ISA; a single's spill ~£10k/yr into a GIA.
  const shared = { rent: 2_000, rentGrowth: 0, wageGrowth: 0, lodgerRent: 0, years: 30 };
  const single = (useIsa: boolean) =>
    project(inp({ ...shared, earners: 1, salary: 90_000, livingCosts: 8_757.4, useIsa }));
  const couple = (useIsa: boolean) =>
    project(inp({ ...shared, earners: 2, salary: 45_000, livingCosts: 17_839.2, useIsa }));

  it("the two households really have the same flows", () => {
    const s = single(false);
    const c = couple(false);
    close(c.rows[1].budget, 54_000, "couple budget");
    close(s.rows[1].budget, 54_000, "single budget");
    for (let n = 1; n <= 30; n++) {
      close(c.rows[n].renterInvested, 30_000, `renter flow y${n}`);
      expect(c.rows[n].buyerInvested).toBeGreaterThan(20_000);
      expect(c.rows[n].buyerInvested).toBeLessThan(40_000);
      close(c.rows[n].buyerInvested, s.rows[n].buyerInvested, `buyer flow y${n}`);
    }
  });

  it("couple: useIsa=true gives exactly the useIsa=false (all tax-free) result", () => {
    const withIsa = couple(true);
    const free = couple(false);
    withIsa.rows.forEach((r, n) => {
      close(r.renterNetWorth, free.rows[n].renterNetWorth, `renter row ${n}`);
      close(r.buyerNetWorth, free.rows[n].buyerNetWorth, `buyer row ${n}`);
    });
  });

  it("single: useIsa=true is lower (the GIA overflow pays CGT)", () => {
    const withIsa = single(true).rows[30];
    const free = single(false).rows[30];
    // ~£10k/yr into a GIA for 30 years at 7% → gain far above £3,000 → CGT at 24%.
    expect(withIsa.renterNetWorth).toBeLessThan(free.renterNetWorth - 1_000);
    expect(withIsa.buyerNetWorth).toBeLessThan(free.buyerNetWorth - 1_000);
  });

  it("same flows, all tax-free: household size makes no difference", () => {
    const s = single(false);
    const c = couple(false);
    s.rows.forEach((r, n) => {
      close(c.rows[n].renterNetWorth, r.renterNetWorth, `renter row ${n}`);
      close(c.rows[n].buyerNetWorth, r.buyerNetWorth, `buyer row ${n}`);
    });
  });

  it("hand check: couple's renter fills £40k of ISA then the GIA (FLAT, 1 year)", () => {
    // Budget 112,514.80, rent 24,000 → renter flow 88,514.80: ISA 40,000, GIA 48,514.80
    // at cost (0% growth, no CGT). 108,000 + 88,514.80 = 196,514.80.
    // Buyer: 0% mortgage → 1,125/month = 13,500; portfolio 112,514.80 − 13,500 = 99,014.80;
    // equity 500,000 − 391,500 = 108,500 → net worth 207,514.80.
    const p = project(inp({ ...FLAT, earners: 2 }));
    const r1 = p.rows[1];
    close(r1.renterInvested, 88_514.8, "renterInvested");
    close(r1.renterNetWorth, 196_514.8, "renter");
    close(r1.buyerPortfolio, 99_014.8, "buyerPortfolio");
    close(r1.buyerNetWorth, 207_514.8, "buyer");
  });
});

// ---------------------------------------------------------------------------
// CGT exemption: £3,000 per adult
// ---------------------------------------------------------------------------

describe("cgtOnGia: people parameter", () => {
  it("people = 2 gets a £6,000 exemption", () => {
    // (50,000 − 30,000 − 6,000) × 24% = 3,360
    expect(cgtOnGia(50_000, 30_000, 24, 2)).toBeCloseTo(3_360, 6);
    // (20,000 − 10,000 − 6,000) × 18% = 720
    expect(cgtOnGia(20_000, 10_000, 18, 2)).toBeCloseTo(720, 6);
  });

  it("a gain between £3,000 and £6,000 is taxed for one person but not for two", () => {
    // gain 5,000: single (5,000 − 3,000) × 24% = 480; couple 0
    expect(cgtOnGia(15_000, 10_000, 24, 1)).toBeCloseTo(480, 6);
    expect(cgtOnGia(15_000, 10_000, 24, 2)).toBeCloseTo(0, 6);
    // gain exactly 6,000 → 0; £1 more → 24p
    expect(cgtOnGia(16_000, 10_000, 24, 2)).toBeCloseTo(0, 6);
    expect(cgtOnGia(16_001, 10_000, 24, 2)).toBeCloseTo(0.24, 6);
  });

  it("people defaults to 1 (£3,000 exemption)", () => {
    // (50,000 − 30,000 − 3,000) × 24% = 4,080
    expect(cgtOnGia(50_000, 30_000, 24)).toBeCloseTo(4_080, 6);
    expect(cgtOnGia(50_000, 30_000, 24, 1)).toBeCloseTo(4_080, 6);
  });

  it("a couple always saves 3,000 × rate when the gain is over £6,000", () => {
    for (const [value, basis, rate] of [[100_000, 40_000, 24], [70_000, 60_000, 18], [9_000, 2_000, 20]]) {
      close(cgtOnGia(value, basis, rate, 1) - cgtOnGia(value, basis, rate, 2), 3_000 * rate / 100, `${value}`);
    }
  });
});

describe("project(): a couple's GIA gets the £6,000 exemption", () => {
  // Couple on 90k each, rent 0, livingCosts 5,514.80 → budget 125,514.80 − 5,514.80 =
  // 120,000/yr = 10,000/month into the renter's pot. FLAT otherwise, 1 year.
  // Months 0-3 fill the £40k ISA; months 4-11 each put 10,000 into the GIA
  // (basis 80,000), invested before that month's growth, so with monthly growth g:
  //   GIA = 10,000 × Σ_{k=1..8} (1+g)^k
  //   ISA = 108,000 × (1+g)^12 + 10,000 × [(1+g)^12 + (1+g)^11 + (1+g)^10 + (1+g)^9]
  const setup = (stockReturn: number, cgtRate: number) =>
    inp({ ...FLAT, earners: 2, rent: 0, livingCosts: 5_514.8, stockReturn, cgtRate });
  const hand = (stockReturn: number) => {
    const g = Math.pow(1 + stockReturn / 100, 1 / 12) - 1;
    let gia = 0;
    for (let k = 1; k <= 8; k++) gia += 10_000 * (1 + g) ** k;
    let isa = 108_000 * (1 + g) ** 12;
    for (let k = 9; k <= 12; k++) isa += 10_000 * (1 + g) ** k;
    return { gia, isa, gain: gia - 80_000 };
  };

  it("gain between £3k and £6k (12% return): no CGT for the couple", () => {
    const h = hand(12);
    expect(h.gain).toBeGreaterThan(3_000); // a single person's exemption would NOT cover it
    expect(h.gain).toBeLessThan(6_000);
    const taxed = project(setup(12, 24)).rows[1];
    const untaxed = project(setup(12, 0)).rows[1];
    close(untaxed.renterNetWorth, h.isa + h.gia, "hand total");
    close(taxed.renterNetWorth, h.isa + h.gia, "no CGT under £6k");
  });

  it("gain above £6k (30% return): CGT = (gain − 6,000) × 24%", () => {
    const h = hand(30);
    expect(h.gain).toBeGreaterThan(6_000);
    const r1 = project(setup(30, 24)).rows[1];
    close(r1.renterNetWorth, h.isa + h.gia - (h.gain - 6_000) * 0.24, "renter");
    close(r1.renterPortfolio, r1.renterNetWorth, "portfolio = net worth");
  });
});

// ---------------------------------------------------------------------------
// Rent-a-Room: £7,500 per home, not per person
// ---------------------------------------------------------------------------

describe("Rent-a-Room stays £7,500 per home for a couple", () => {
  it("£7,500 a year is still fully tax-free", () => {
    const p = project(inp({ earners: 2, lodgerRent: 625, rentGrowth: 0 }));
    close(p.rows[1].lodgerIncome, 7_500, "7.5k");
  });

  it("£15,000 a year is NOT doubled to a £15k allowance: 7,500 taxed at 40%", () => {
    // Couple 90k each (40% each): 15,000 − (15,000 − 7,500) × 40% = 12,000
    const p = project(inp({ earners: 2, lodgerRent: 1_250, rentGrowth: 0 }));
    close(p.rows[1].lodgerIncome, 12_000, "15k gross");
  });

  it("couple on 90k: same net lodger income as a single on 90k", () => {
    // year 1: 12,000 − 4,500 × 40% = 10,200; year 2: 12,360 − 4,860 × 40% = 10,416
    const c = project(inp({ earners: 2, lodgerRent: 1_000, rentGrowth: 3 }));
    close(c.rows[1].lodgerIncome, 10_200, "y1");
    close(c.rows[2].lodgerIncome, 10_416, "y2");
  });

  it("couple on 45k each: taxed at the per-person 20% rate", () => {
    // 12,000 − 4,500 × 20% = 11,100
    const c = project(inp({ earners: 2, salary: 45_000, lodgerRent: 1_000 }));
    close(c.rows[1].lodgerIncome, 11_100, "y1");
  });
});

// ---------------------------------------------------------------------------
// earners: 1 is unchanged
// ---------------------------------------------------------------------------

describe("earners: 1 behaves exactly as before", () => {
  it("USER_EXAMPLE is a single earner", () => {
    expect((USER_EXAMPLE as Inputs & { earners: number }).earners).toBe(1);
  });

  it("explicit earners: 1 gives the same projection as USER_EXAMPLE", () => {
    for (const over of [{}, { lodgerRent: 900 }, { rent: 800, rentGrowth: 12, wageGrowth: 0 }]) {
      expect(project(inp({ ...over, earners: 1 }))).toEqual(project(inp(over)));
    }
  });

  it("single hand numbers: take-home, maxLoan, 1-year FLAT result", () => {
    const p = project(inp({ ...FLAT, earners: 1 }));
    close(p.takeHome, TH_90K, "takeHome");
    expect(p.upfront.maxLoan).toBe(405_000);
    // 108,000 + (49,757.40 − 24,000) = 133,757.40 (ISA 20,000, GIA 5,757.40 at cost)
    close(p.rows[1].renterNetWorth, 133_757.4, "renter");
    close(p.rows[1].buyerNetWorth, 144_757.4, "buyer"); // 36,257.40 + 108,500
  });

  it("single: £20k ISA allowance still applies (CGT on the overflow)", () => {
    // Renter flow = 20,000/yr exactly → fits the single allowance → useIsa true == false.
    // Renter flow = 30,000/yr → 10,000/yr overflows into a GIA → lower with useIsa.
    const exact = { rent: (49_757.4 - 20_000) / 12, rentGrowth: 0, wageGrowth: 0 };
    const a = project(inp({ ...exact, earners: 1, useIsa: true }));
    const b = project(inp({ ...exact, earners: 1, useIsa: false }));
    a.rows.forEach((r, n) => close(r.renterNetWorth, b.rows[n].renterNetWorth, `row ${n}`));
    const over = { rent: (49_757.4 - 30_000) / 12, rentGrowth: 0, wageGrowth: 0 };
    expect(project(inp({ ...over, earners: 1, useIsa: true })).rows[30].renterNetWorth)
      .toBeLessThan(project(inp({ ...over, earners: 1, useIsa: false })).rows[30].renterNetWorth);
  });
});
