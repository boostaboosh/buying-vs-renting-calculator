import { describe, expect, it } from "vitest";
import {
  cgtOnGia,
  incomeTax,
  marginalTaxRate,
  mortgagePayment,
  nationalInsurance,
  remainingBalance,
  rentARoomTax,
  stampDuty,
  takeHomePay,
  yearsToSave,
} from "./finance";

describe("mortgagePayment", () => {
  it("matches the standard annuity formula", () => {
    expect(mortgagePayment(380_000, 4, 30)).toBeCloseTo(1814.2, 0);
    expect(mortgagePayment(405_000, 3, 30)).toBeCloseTo(1707.5, 0);
  });
  it("handles a 0% rate and a zero loan", () => {
    expect(mortgagePayment(380_000, 0, 25)).toBeCloseTo(1266.67, 2);
    expect(mortgagePayment(0, 4, 25)).toBe(0);
  });
});

describe("remainingBalance", () => {
  it("starts at the principal and ends at zero", () => {
    expect(remainingBalance(380_000, 4, 30, 0)).toBeCloseTo(380_000, 6);
    expect(remainingBalance(380_000, 4, 30, 360)).toBe(0);
  });
  it("equals the present value of the remaining payments", () => {
    // 240 payments of £1,814.19 left, discounted at 4%/12: about 79% of the loan.
    expect(remainingBalance(380_000, 4, 30, 120)).toBeCloseTo(299_379, 0);
  });
  it("pays down linearly at 0%", () => {
    expect(remainingBalance(300_000, 0, 30, 180)).toBeCloseTo(150_000, 6);
  });
});

describe("stampDuty (England, from April 2025)", () => {
  it("applies first-time buyer relief up to £500k", () => {
    expect(stampDuty(300_000, true)).toBe(0);
    expect(stampDuty(425_000, true)).toBe(6_250);
    expect(stampDuty(500_000, true)).toBe(10_000);
  });
  it("loses relief entirely above £500k", () => {
    expect(stampDuty(500_001, true)).toBe(stampDuty(500_001, false));
    expect(stampDuty(510_000, true)).toBe(15_500);
  });
  it("uses standard bands for home movers", () => {
    expect(stampDuty(125_000, false)).toBe(0);
    expect(stampDuty(250_000, false)).toBe(2_500);
    expect(stampDuty(500_000, false)).toBe(15_000);
    expect(stampDuty(925_000, false)).toBe(36_250);
    expect(stampDuty(1_500_000, false)).toBe(93_750);
    expect(stampDuty(2_000_000, false)).toBe(153_750);
  });
});

describe("income tax, NI and take-home pay", () => {
  it("matches HMRC figures for 2025/26", () => {
    expect(incomeTax(12_570)).toBe(0);
    expect(incomeTax(50_270)).toBeCloseTo(7_540, 0);
    expect(incomeTax(90_000)).toBeCloseTo(23_432, 0);
    expect(incomeTax(110_000)).toBeCloseTo(33_432, 0);
    expect(incomeTax(150_000)).toBeCloseTo(53_703, 0);
    expect(nationalInsurance(90_000)).toBeCloseTo(3_810.6, 1);
  });
  it("gives about £62.8k take-home on £90k", () => {
    expect(takeHomePay(90_000)).toBeCloseTo(62_757, 0);
    expect(takeHomePay(60_000) / 12).toBeCloseTo(3_780, 0);
  });
  it("finds the marginal rate, including the 60% taper zone", () => {
    expect(marginalTaxRate(30_000)).toBe(20);
    expect(marginalTaxRate(90_000)).toBe(40);
    expect(marginalTaxRate(110_000)).toBe(60);
    expect(marginalTaxRate(200_000)).toBe(45);
  });
});

describe("rentARoomTax", () => {
  it("only taxes lodger income above £7,500", () => {
    expect(rentARoomTax(7_500, 40)).toBe(0);
    expect(rentARoomTax(16_800, 40)).toBeCloseTo(3_720, 6);
    expect(rentARoomTax(0, 40)).toBe(0);
  });
});

describe("cgtOnGia", () => {
  it("taxes gains above the £3k exemption", () => {
    expect(cgtOnGia(100_000, 50_000, 24)).toBeCloseTo(47_000 * 0.24, 6);
    expect(cgtOnGia(52_000, 50_000, 24)).toBe(0);
    expect(cgtOnGia(40_000, 50_000, 24)).toBe(0);
  });
});

describe("yearsToSave", () => {
  it("takes about four years to save ~£108k at £25k/yr and 7%", () => {
    const y = yearsToSave(108_000, 25_000, 7)!;
    expect(y).toBeGreaterThan(3.8);
    expect(y).toBeLessThan(4.1);
  });
  it("returns 0 when already there and null when unreachable", () => {
    expect(yearsToSave(10_000, 0, 7, 20_000)).toBe(0);
    expect(yearsToSave(10_000, 0, 0)).toBeNull();
  });
});
