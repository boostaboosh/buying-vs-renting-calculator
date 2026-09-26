/**
 * Contract tests for src/lib/finance.ts, written from docs/model-spec.md §1 and
 * from real-world rules (HMRC 2025/26, SDLT England from 1 April 2025, standard
 * annuity maths). Expected values are derived independently of the implementation.
 */
import { describe, it, expect } from "vitest";
import {
  mortgagePayment,
  remainingBalance,
  stampDuty,
  incomeTax,
  nationalInsurance,
  takeHomePay,
  marginalTaxRate,
  rentARoomTax,
  cgtOnGia,
  yearsToSave,
} from "./finance";

// ---------------------------------------------------------------------------
// mortgagePayment
// ---------------------------------------------------------------------------
describe("mortgagePayment", () => {
  it("£200,000 at 5% over 25 years is £1,169.18/month", () => {
    // r = 0.05/12, n = 300; P·r / (1 − (1+r)^−n) = 1,169.1801
    expect(mortgagePayment(200_000, 5, 25)).toBeCloseTo(1169.18, 2);
  });

  it("£100,000 at 6% over 10 years is £1,110.21/month", () => {
    // r = 0.005, n = 120; 100,000 × 0.005 / (1 − 1.005^−120) = 1,110.2050
    expect(mortgagePayment(100_000, 6, 10)).toBeCloseTo(1110.21, 2);
  });

  it("£400,000 at 3% over 30 years is £1,686.42/month", () => {
    // r = 0.0025, n = 360 → 1,686.4161
    expect(mortgagePayment(400_000, 3, 30)).toBeCloseTo(1686.42, 2);
  });

  it("at 0% the loan is repaid in equal instalments", () => {
    expect(mortgagePayment(120_000, 0, 10)).toBeCloseTo(1000, 6); // 120,000 / 120
    expect(mortgagePayment(300_000, 0, 25)).toBeCloseTo(1000, 6); // 300,000 / 300
  });

  it("returns 0 for a zero or negative principal", () => {
    expect(mortgagePayment(0, 5, 25)).toBe(0);
    expect(mortgagePayment(-10_000, 5, 25)).toBe(0);
  });

  it("returns 0 for a zero or negative term", () => {
    expect(mortgagePayment(200_000, 5, 0)).toBe(0);
    expect(mortgagePayment(200_000, 5, -5)).toBe(0);
  });

  it("scales linearly with the principal", () => {
    expect(mortgagePayment(400_000, 5, 25)).toBeCloseTo(2 * mortgagePayment(200_000, 5, 25), 6);
  });

  it("is higher at higher rates and lower over longer terms", () => {
    expect(mortgagePayment(200_000, 6, 25)).toBeGreaterThan(mortgagePayment(200_000, 5, 25));
    expect(mortgagePayment(200_000, 5, 30)).toBeLessThan(mortgagePayment(200_000, 5, 25));
  });

  it("always exceeds the first month's interest (loan is actually repaid)", () => {
    // first-month interest = 200,000 × 0.05/12 = 833.33
    expect(mortgagePayment(200_000, 5, 25)).toBeGreaterThan(833.34);
  });
});

// ---------------------------------------------------------------------------
// remainingBalance
// ---------------------------------------------------------------------------
describe("remainingBalance", () => {
  it("equals the principal at 0 months", () => {
    expect(remainingBalance(200_000, 5, 25, 0)).toBeCloseTo(200_000, 6);
  });

  it("is 0 once all payments are made, and stays 0 afterwards", () => {
    expect(remainingBalance(200_000, 5, 25, 300)).toBeCloseTo(0, 6);
    expect(remainingBalance(200_000, 5, 25, 301)).toBeCloseTo(0, 6);
    expect(remainingBalance(200_000, 5, 25, 1000)).toBeCloseTo(0, 6);
  });

  it("£200,000 at 5% over 25 years: £177,160.38 left after 5 years", () => {
    // P(1+r)^60 − pmt·((1+r)^60 − 1)/r with r = 0.05/12 → 177,160.378
    expect(remainingBalance(200_000, 5, 25, 60)).toBeCloseTo(177_160.38, 1);
  });

  it("£400,000 at 3% over 30 years: £304,079.24 left after 10 years", () => {
    // iterating b = b(1+r) − 1,686.4161 for 120 months → 304,079.235
    expect(remainingBalance(400_000, 3, 30, 120)).toBeCloseTo(304_079.24, 1);
  });

  it("at 0% falls linearly", () => {
    // 120,000 over 120 months: £1,000 off per month
    expect(remainingBalance(120_000, 0, 10, 1)).toBeCloseTo(119_000, 6);
    expect(remainingBalance(120_000, 0, 10, 60)).toBeCloseTo(60_000, 6);
    expect(remainingBalance(120_000, 0, 10, 119)).toBeCloseTo(1_000, 6);
    expect(remainingBalance(120_000, 0, 10, 120)).toBeCloseTo(0, 6);
  });

  it("strictly decreases month on month over the term", () => {
    let prev = remainingBalance(250_000, 4.5, 30, 0);
    for (let m = 1; m <= 360; m++) {
      const b = remainingBalance(250_000, 4.5, 30, m);
      expect(b).toBeLessThan(prev);
      prev = b;
    }
  });

  it("follows the recurrence balance(m) = balance(m−1)·(1+r) − payment", () => {
    const P = 250_000, rate = 4.5, term = 30, r = rate / 100 / 12;
    const pmt = mortgagePayment(P, rate, term);
    for (const m of [1, 12, 100, 250, 359]) {
      const expected = remainingBalance(P, rate, term, m - 1) * (1 + r) - pmt;
      expect(remainingBalance(P, rate, term, m)).toBeCloseTo(expected, 4);
    }
  });

  it("the principal portions of all payments sum to the loan", () => {
    const P = 250_000, rate = 4.5, term = 30, r = rate / 100 / 12;
    const pmt = mortgagePayment(P, rate, term);
    let sumPrincipal = 0;
    for (let m = 1; m <= term * 12; m++) {
      const interest = remainingBalance(P, rate, term, m - 1) * r;
      sumPrincipal += pmt - interest;
    }
    expect(sumPrincipal).toBeCloseTo(P, 2);
  });

  it("is 0 throughout for a zero loan", () => {
    expect(remainingBalance(0, 5, 25, 0)).toBeCloseTo(0, 6);
    expect(remainingBalance(0, 5, 25, 12)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// stampDuty
// ---------------------------------------------------------------------------
describe("stampDuty — standard rates (England, from 1 April 2025)", () => {
  it("nil up to £125,000", () => {
    expect(stampDuty(0, false)).toBe(0);
    expect(stampDuty(100_000, false)).toBe(0);
    expect(stampDuty(125_000, false)).toBe(0);
  });

  it("£250,000 → £2,500", () => {
    // 125,000 × 2% = 2,500
    expect(stampDuty(250_000, false)).toBe(2_500);
  });

  it("GOV.UK worked example: £295,000 → £4,750", () => {
    // 125,000 × 2% + 45,000 × 5% = 2,500 + 2,250 = 4,750
    expect(stampDuty(295_000, false)).toBe(4_750);
  });

  it("£500,000 → £15,000", () => {
    // 2,500 + 250,000 × 5% = 15,000
    expect(stampDuty(500_000, false)).toBe(15_000);
  });

  it("£925,000 → £36,250", () => {
    // 2,500 + 675,000 × 5% = 36,250
    expect(stampDuty(925_000, false)).toBe(36_250);
  });

  it("£1,000,000 → £43,750", () => {
    // 36,250 + 75,000 × 10% = 43,750
    expect(stampDuty(1_000_000, false)).toBe(43_750);
  });

  it("£1,500,000 → £93,750", () => {
    // 36,250 + 575,000 × 10% = 93,750
    expect(stampDuty(1_500_000, false)).toBe(93_750);
  });

  it("£2,000,000 → £153,750", () => {
    // 93,750 + 500,000 × 12% = 153,750
    expect(stampDuty(2_000_000, false)).toBe(153_750);
  });

  it("rounds to the nearest pound", () => {
    expect(stampDuty(125_020, false)).toBe(0); // 20 × 2% = 0.40 → 0
    expect(stampDuty(125_030, false)).toBe(1); // 30 × 2% = 0.60 → 1
    expect(stampDuty(250_008, false)).toBe(2_500); // 2,500 + 8 × 5% = 2,500.40 → 2,500
    expect(stampDuty(250_012, false)).toBe(2_501); // 2,500 + 12 × 5% = 2,500.60 → 2,501
  });

  it("always returns a whole number of pounds", () => {
    for (const p of [125_001, 187_777, 333_333, 926_123, 1_500_001]) {
      expect(Number.isInteger(stampDuty(p, false))).toBe(true);
      expect(Number.isInteger(stampDuty(p, true))).toBe(true);
    }
  });

  it("is non-decreasing in price", () => {
    let prev = -1;
    for (let p = 0; p <= 2_500_000; p += 5_000) {
      const s = stampDuty(p, false);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe("stampDuty — first-time buyer relief", () => {
  it("nil up to £300,000", () => {
    expect(stampDuty(200_000, true)).toBe(0);
    expect(stampDuty(250_000, true)).toBe(0);
    expect(stampDuty(300_000, true)).toBe(0);
  });

  it("£400,000 → £5,000", () => {
    // 100,000 × 5% = 5,000
    expect(stampDuty(400_000, true)).toBe(5_000);
  });

  it("GOV.UK worked example: £500,000 → £10,000", () => {
    // 200,000 × 5% = 10,000
    expect(stampDuty(500_000, true)).toBe(10_000);
  });

  it("cliff: at £500,001 relief is lost and standard bands apply to the whole price", () => {
    // standard: 2,500 + 250,001 × 5% = 15,000.05 → 15,000
    expect(stampDuty(500_001, true)).toBe(15_000);
    expect(stampDuty(500_001, true)).toBe(stampDuty(500_001, false));
  });

  it("above £500,000 an FTB pays exactly the standard amount", () => {
    for (const p of [550_000, 925_000, 1_200_000, 2_000_000]) {
      expect(stampDuty(p, true)).toBe(stampDuty(p, false));
    }
  });

  it("FTB never pays more than a standard buyer", () => {
    for (let p = 0; p <= 1_000_000; p += 10_000) {
      expect(stampDuty(p, true)).toBeLessThanOrEqual(stampDuty(p, false));
    }
  });

  it("£200,000: FTB saves £1,500 vs standard", () => {
    // standard: 75,000 × 2% = 1,500; FTB: 0
    expect(stampDuty(200_000, false) - stampDuty(200_000, true)).toBe(1_500);
  });

  it("£300,000: FTB saves £5,000 vs standard", () => {
    // standard: 2,500 + 50,000 × 5% = 5,000; FTB: 0
    expect(stampDuty(300_000, false)).toBe(5_000);
    expect(stampDuty(300_000, true)).toBe(0);
  });

  it("is non-decreasing in price except for the single cliff just above £500,000", () => {
    let prev = -1;
    let drops = 0;
    for (let p = 0; p <= 1_000_000; p += 1_000) {
      const s = stampDuty(p, true);
      if (s < prev) drops++;
      prev = s;
    }
    expect(drops).toBe(0); // the cliff is an *increase*: 10,000 → 15,000+
    expect(stampDuty(501_000, true) - stampDuty(500_000, true)).toBe(5_050);
    // 2,500 + 251,000 × 5% = 15,050 minus 10,000
  });
});

// ---------------------------------------------------------------------------
// incomeTax / nationalInsurance / takeHomePay (2025/26, rUK)
// ---------------------------------------------------------------------------
describe("incomeTax 2025/26", () => {
  it("nil up to the £12,570 personal allowance", () => {
    expect(incomeTax(0)).toBeCloseTo(0, 2);
    expect(incomeTax(10_000)).toBeCloseTo(0, 2);
    expect(incomeTax(12_570)).toBeCloseTo(0, 2);
  });

  it("£30,000 → £3,486", () => {
    // (30,000 − 12,570) × 20% = 17,430 × 20% = 3,486
    expect(incomeTax(30_000)).toBeCloseTo(3_486, 2);
  });

  it("£50,270 (top of basic rate) → £7,540", () => {
    // 37,700 × 20% = 7,540
    expect(incomeTax(50_270)).toBeCloseTo(7_540, 2);
  });

  it("£60,000 → £11,432", () => {
    // 37,700 × 20% + 9,730 × 40% = 7,540 + 3,892 = 11,432
    expect(incomeTax(60_000)).toBeCloseTo(11_432, 2);
  });

  it("£90,000 → £23,432", () => {
    // 37,700 × 20% + 39,730 × 40% = 7,540 + 15,892 = 23,432
    expect(incomeTax(90_000)).toBeCloseTo(23_432, 2);
  });

  it("£100,000 (full personal allowance still) → £27,432", () => {
    // 7,540 + 49,730 × 40% = 7,540 + 19,892 = 27,432
    expect(incomeTax(100_000)).toBeCloseTo(27_432, 2);
  });

  it("£110,000 (allowance tapered to £7,570) → £33,432", () => {
    // PA = 12,570 − 10,000/2 = 7,570; taxable 102,430
    // 7,540 + 64,730 × 40% = 7,540 + 25,892 = 33,432
    expect(incomeTax(110_000)).toBeCloseTo(33_432, 2);
  });

  it("£125,140 (allowance fully withdrawn) → £42,516", () => {
    // PA = 0; taxable 125,140: 7,540 + 87,440 × 40% = 7,540 + 34,976 = 42,516
    expect(incomeTax(125_140)).toBeCloseTo(42_516, 2);
  });

  it("£150,000 → £53,703", () => {
    // 7,540 + 34,976 + (150,000 − 125,140) × 45% = 42,516 + 11,187 = 53,703
    expect(incomeTax(150_000)).toBeCloseTo(53_703, 2);
  });

  it("£200,000 → £76,203", () => {
    // 42,516 + 74,860 × 45% = 42,516 + 33,687 = 76,203
    expect(incomeTax(200_000)).toBeCloseTo(76_203, 2);
  });

  it("taper zone: each extra £1,000 costs £600 in tax (60% effective)", () => {
    // +1,000 gross, PA −500 → taxable +1,500 at 40% = 600
    expect(incomeTax(110_000) - incomeTax(109_000)).toBeCloseTo(600, 2);
    expect(incomeTax(120_000) - incomeTax(118_000)).toBeCloseTo(1_200, 2);
  });

  it("above £125,140 each extra £1,000 costs £450", () => {
    expect(incomeTax(161_000) - incomeTax(160_000)).toBeCloseTo(450, 2);
  });

  it("is non-decreasing in gross", () => {
    let prev = -1;
    for (let g = 0; g <= 250_000; g += 250) {
      const t = incomeTax(g);
      expect(t).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = t;
    }
  });
});

describe("nationalInsurance 2025/26 (employee Class 1)", () => {
  it("nil up to £12,570", () => {
    expect(nationalInsurance(0)).toBeCloseTo(0, 2);
    expect(nationalInsurance(12_000)).toBeCloseTo(0, 2);
    expect(nationalInsurance(12_570)).toBeCloseTo(0, 2);
  });

  it("£30,000 → £1,394.40", () => {
    // 17,430 × 8% = 1,394.40
    expect(nationalInsurance(30_000)).toBeCloseTo(1_394.4, 2);
  });

  it("£50,270 (upper earnings limit) → £3,016", () => {
    // 37,700 × 8% = 3,016
    expect(nationalInsurance(50_270)).toBeCloseTo(3_016, 2);
  });

  it("£60,000 → £3,210.60", () => {
    // 3,016 + 9,730 × 2% = 3,016 + 194.60
    expect(nationalInsurance(60_000)).toBeCloseTo(3_210.6, 2);
  });

  it("£100,000 → £4,010.60", () => {
    // 3,016 + 49,730 × 2% = 3,016 + 994.60
    expect(nationalInsurance(100_000)).toBeCloseTo(4_010.6, 2);
  });

  it("£150,000 → £5,010.60", () => {
    // 3,016 + 99,730 × 2% = 3,016 + 1,994.60
    expect(nationalInsurance(150_000)).toBeCloseTo(5_010.6, 2);
  });

  it("marginal NI is 8% just below the UEL and 2% just above", () => {
    expect(nationalInsurance(50_270) - nationalInsurance(49_270)).toBeCloseTo(80, 2);
    expect(nationalInsurance(51_270) - nationalInsurance(50_270)).toBeCloseTo(20, 2);
  });

  it("is not affected by the personal allowance taper", () => {
    // 2% throughout 100k–125,140
    expect(nationalInsurance(125_140) - nationalInsurance(100_000)).toBeCloseTo(502.8, 2); // 25,140 × 2%
  });
});

describe("takeHomePay 2025/26", () => {
  const cases: Array<[number, number, string]> = [
    [0, 0, "0"],
    [12_570, 12_570, "no tax or NI"],
    [30_000, 25_119.6, "30,000 − 3,486 − 1,394.40"],
    [50_270, 39_714, "50,270 − 7,540 − 3,016"],
    [60_000, 45_357.4, "60,000 − 11,432 − 3,210.60"],
    [90_000, 62_757.4, "90,000 − 23,432 − 3,810.60 (NI 3,016 + 39,730 × 2%)"],
    [100_000, 68_557.4, "100,000 − 27,432 − 4,010.60"],
    [110_000, 72_357.4, "110,000 − 33,432 − 4,210.60 (NI 3,016 + 59,730 × 2%)"],
    [125_140, 78_110.6, "125,140 − 42,516 − 4,513.40 (NI 3,016 + 74,870 × 2%)"],
    [150_000, 91_286.4, "150,000 − 53,703 − 5,010.60"],
  ];
  for (const [gross, expected, why] of cases) {
    it(`£${gross.toLocaleString("en-GB")} → £${expected.toLocaleString("en-GB")} (${why})`, () => {
      expect(takeHomePay(gross)).toBeCloseTo(expected, 2);
    });
  }

  it("equals gross − incomeTax − nationalInsurance", () => {
    for (const g of [15_000, 45_000, 75_000, 112_345, 180_000]) {
      expect(takeHomePay(g)).toBeCloseTo(g - incomeTax(g) - nationalInsurance(g), 6);
    }
  });

  it("never decreases as gross rises (no cliff in the taper zone)", () => {
    let prev = -Infinity;
    for (let g = 0; g <= 250_000; g += 100) {
      const t = takeHomePay(g);
      expect(t).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = t;
    }
  });

  it("keeps 38p of each extra pound in the taper zone (60% tax + 2% NI)", () => {
    expect(takeHomePay(111_000) - takeHomePay(110_000)).toBeCloseTo(380, 2);
  });
});

// ---------------------------------------------------------------------------
// marginalTaxRate
// ---------------------------------------------------------------------------
describe("marginalTaxRate", () => {
  it("0 below the personal allowance", () => {
    expect(marginalTaxRate(0)).toBe(0);
    expect(marginalTaxRate(10_000)).toBe(0);
  });

  it("20 in the basic-rate band", () => {
    expect(marginalTaxRate(30_000)).toBe(20);
    expect(marginalTaxRate(50_000)).toBe(20);
  });

  it("40 in the higher-rate band below £100,000", () => {
    expect(marginalTaxRate(60_000)).toBe(40);
    expect(marginalTaxRate(90_000)).toBe(40);
  });

  it("60 in the personal allowance taper zone", () => {
    expect(marginalTaxRate(100_001)).toBe(60);
    expect(marginalTaxRate(110_000)).toBe(60);
    expect(marginalTaxRate(125_000)).toBe(60);
  });

  it("45 above £125,140", () => {
    expect(marginalTaxRate(125_141)).toBe(45);
    expect(marginalTaxRate(150_000)).toBe(45);
    expect(marginalTaxRate(500_000)).toBe(45);
  });

  describe("at exact thresholds (rate on the NEXT pound earned)", () => {
    it("£12,570 → 20 (the next pound is taxable)", () => {
      expect(marginalTaxRate(12_570)).toBe(20);
    });
    it("£50,270 → 40 (the next pound is in the higher-rate band)", () => {
      expect(marginalTaxRate(50_270)).toBe(40);
    });
    it("£100,000 → 60 (the next pound starts the taper)", () => {
      expect(marginalTaxRate(100_000)).toBe(60);
    });
  });

  it("agrees with the numerical slope of incomeTax away from boundaries", () => {
    for (const g of [5_000, 25_000, 70_000, 112_000, 180_000]) {
      const slope = (incomeTax(g + 100) - incomeTax(g)) / 100 * 100;
      expect(marginalTaxRate(g)).toBeCloseTo(slope, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// rentARoomTax
// ---------------------------------------------------------------------------
describe("rentARoomTax", () => {
  it("nil at or below the £7,500 threshold", () => {
    expect(rentARoomTax(0, 40)).toBeCloseTo(0, 6);
    expect(rentARoomTax(6_000, 20)).toBeCloseTo(0, 6);
    expect(rentARoomTax(7_500, 40)).toBeCloseTo(0, 6);
  });

  it("£8,000 at 20% → £100", () => {
    // (8,000 − 7,500) × 20% = 100
    expect(rentARoomTax(8_000, 20)).toBeCloseTo(100, 6);
  });

  it("£12,000 at 40% → £1,800", () => {
    // (12,000 − 7,500) × 40% = 1,800
    expect(rentARoomTax(12_000, 40)).toBeCloseTo(1_800, 6);
  });

  it("£9,600 (£800/month) at 60% (taper zone) → £1,260", () => {
    // (9,600 − 7,500) × 60% = 1,260
    expect(rentARoomTax(9_600, 60)).toBeCloseTo(1_260, 6);
  });

  it("£20,000 at 45% → £5,625", () => {
    // 12,500 × 45% = 5,625
    expect(rentARoomTax(20_000, 45)).toBeCloseTo(5_625, 6);
  });

  it("nil when the marginal rate is 0", () => {
    expect(rentARoomTax(15_000, 0)).toBeCloseTo(0, 6);
  });

  it("never negative", () => {
    expect(rentARoomTax(-1_000, 40)).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// cgtOnGia
// ---------------------------------------------------------------------------
describe("cgtOnGia", () => {
  it("£20,000 gain at 24% → £4,080", () => {
    // (50,000 − 30,000 − 3,000) × 24% = 17,000 × 0.24 = 4,080
    expect(cgtOnGia(50_000, 30_000, 24)).toBeCloseTo(4_080, 6);
  });

  it("£10,000 gain at 18% → £1,260", () => {
    // (10,000 − 3,000) × 18% = 1,260
    expect(cgtOnGia(20_000, 10_000, 18)).toBeCloseTo(1_260, 6);
  });

  it("nil when the gain is within the £3,000 annual exemption", () => {
    expect(cgtOnGia(12_000, 10_000, 24)).toBeCloseTo(0, 6); // gain 2,000
    expect(cgtOnGia(13_000, 10_000, 24)).toBeCloseTo(0, 6); // gain exactly 3,000
  });

  it("£1 above the exemption is taxed", () => {
    expect(cgtOnGia(13_001, 10_000, 24)).toBeCloseTo(0.24, 6);
  });

  it("nil for zero gain and for a loss (never negative)", () => {
    expect(cgtOnGia(10_000, 10_000, 24)).toBeCloseTo(0, 6);
    expect(cgtOnGia(5_000, 10_000, 24)).toBeCloseTo(0, 6);
    expect(cgtOnGia(0, 0, 24)).toBeCloseTo(0, 6);
  });

  it("nil at a 0% rate", () => {
    expect(cgtOnGia(100_000, 10_000, 0)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// yearsToSave
// ---------------------------------------------------------------------------
describe("yearsToSave", () => {
  it("returns 0 if the pot already meets or exceeds the target", () => {
    expect(yearsToSave(10_000, 1_200, 5, 10_000)).toBe(0);
    expect(yearsToSave(10_000, 1_200, 5, 20_000)).toBe(0);
    expect(yearsToSave(0, 1_200, 5)).toBe(0);
  });

  it("at 0% return: £12,000/yr reaches £12,000 in exactly 12 months", () => {
    expect(yearsToSave(12_000, 12_000, 0)).toBeCloseTo(1, 10);
  });

  it("at 0% return: one pound more needs a 13th month", () => {
    expect(yearsToSave(12_001, 12_000, 0)).toBeCloseTo(13 / 12, 10);
  });

  it("returns whole months divided by 12", () => {
    // 0%: 30,000 at 1,000/month → 30 months = 2.5 years
    expect(yearsToSave(30_000, 12_000, 0)).toBeCloseTo(2.5, 10);
    // 0%: 25,500 at 1,000/month → 26 months
    expect(yearsToSave(25_500, 12_000, 0)).toBeCloseTo(26 / 12, 10);
  });

  it("£100,000 at £12,000/yr and 5% → 85 months", () => {
    // simulated per spec: p = p·1.05^(1/12) + 1,000 → first ≥ 100,000 at month 85
    expect(yearsToSave(100_000, 12_000, 5)).toBeCloseTo(85 / 12, 10);
  });

  it("£50,000 from £10,000 at £6,000/yr and 7% → 61 months", () => {
    // simulated per spec → month 61
    expect(yearsToSave(50_000, 6_000, 7, 10_000)).toBeCloseTo(61 / 12, 10);
  });

  it("growth alone: £10,000 → £11,000 at 12% takes 11 months", () => {
    // 12 × ln(1.1)/ln(1.12) = 10.09 → first month-end at 11
    expect(yearsToSave(11_000, 0, 12, 10_000)).toBeCloseTo(11 / 12, 10);
  });

  it("grows the pot first, then adds the monthly saving", () => {
    // current 1,000, 1,000/month, 12%: g = 1.12^(1/12) − 1 = 0.9489%
    // grow-then-add month 1: 1,000·1.009489 + 1,000 = 2,009.49 (< 2,015)
    // (add-then-grow would give 2,018.98 and hit at month 1)
    // month 2: 2,009.49·1.009489 + 1,000 = 3,028.56 → hits at month 2
    expect(yearsToSave(2_015, 12_000, 12, 1_000)).toBeCloseTo(2 / 12, 10);
  });

  it("counts a target reached exactly at month 1,200 (100 years) as reached", () => {
    // 0%: 100/month × 1,200 = 120,000
    expect(yearsToSave(120_000, 1_200, 0)).toBeCloseTo(100, 10);
  });

  it("returns null when not reached within 100 years", () => {
    expect(yearsToSave(120_001, 1_200, 0)).toBeNull();
    expect(yearsToSave(1_000_000, 1_000, 0)).toBeNull();
  });

  it("returns null when nothing is saved and nothing grows", () => {
    expect(yearsToSave(10_000, 0, 0)).toBeNull();
    expect(yearsToSave(10_000, 0, 0, 5_000)).toBeNull();
  });

  it("higher returns never take longer", () => {
    const low = yearsToSave(200_000, 15_000, 2)!;
    const high = yearsToSave(200_000, 15_000, 8)!;
    expect(high).toBeLessThanOrEqual(low);
  });
});
