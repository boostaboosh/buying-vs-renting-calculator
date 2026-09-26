/**
 * Contract tests for src/lib/projection.ts, written from docs/model-spec.md
 * (section 2, with the section-1 formulas it relies on) and NOT from the
 * implementation.
 *
 * Strategy:
 *  1. An independent reference simulation (`ref*` below) that follows the spec
 *     step by step, including its own copies of the section-1 finance formulas,
 *     so nothing here depends on ./finance or ./projection internals.
 *  2. Hand-checkable scenarios with 0% rates / 1-year horizons.
 *  3. Properties and invariants the spec implies.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  breakevenHouseGrowth,
  project,
  summarise,
  upfrontCosts,
  yearOneCosts,
  type Inputs,
} from "./projection";

// ---------------------------------------------------------------------------
// Independent reference implementation of the spec
// ---------------------------------------------------------------------------

/** Section 1: SDLT, England, from 1 April 2025, rounded to nearest pound. */
function refStampDuty(price: number, ftb: boolean): number {
  if (ftb && price <= 500_000) {
    return Math.round(Math.max(0, price - 300_000) * 0.05);
  }
  const bands: [number, number][] = [
    [125_000, 0],
    [250_000, 0.02],
    [925_000, 0.05],
    [1_500_000, 0.1],
    [Infinity, 0.12],
  ];
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of bands) {
    if (price > lower) tax += (Math.min(price, upper) - lower) * rate;
    lower = upper;
  }
  return Math.round(tax);
}

/** Section 1: personal allowance with the £1-per-£2 taper above £100k. */
function refPersonalAllowance(gross: number): number {
  return Math.max(0, 12_570 - Math.max(0, gross - 100_000) / 2);
}

function refIncomeTax(gross: number): number {
  const taxable = Math.max(0, gross - refPersonalAllowance(gross));
  return (
    Math.min(taxable, 37_700) * 0.2 +
    Math.max(0, Math.min(taxable, 125_140) - 37_700) * 0.4 +
    Math.max(0, taxable - 125_140) * 0.45
  );
}

function refNI(gross: number): number {
  return (
    Math.max(0, Math.min(gross, 50_270) - 12_570) * 0.08 +
    Math.max(0, gross - 50_270) * 0.02
  );
}

function refTakeHome(gross: number): number {
  return gross - refIncomeTax(gross) - refNI(gross);
}

/** Only used for salaries away from band edges in these tests. */
function refMarginal(gross: number): number {
  if (gross < 12_570) return 0;
  if (gross >= 100_000 && gross < 125_140) return 60;
  if (gross >= 125_140) return 45;
  const taxable = gross - refPersonalAllowance(gross);
  return taxable < 37_700 ? 20 : 40;
}

/** Standard annuity formula; equal instalments at 0%. */
function refPayment(principal: number, ratePct: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  const n = termYears * 12;
  const r = ratePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Rent-a-Room: first £7,500 of receipts tax free, rest at marginal rate. */
function refRentARoomTax(annual: number, marginalPct: number): number {
  return Math.max(0, annual - 7_500) * (marginalPct / 100);
}

/** CGT if the GIA were sold in one tax year, £3,000 exemption. */
function refCgt(value: number, basis: number, ratePct: number): number {
  return Math.max(0, (value - basis - 3_000) * (ratePct / 100));
}

interface Pot {
  isa: number;
  gia: number;
  basis: number;
  shortfall: number;
  allowance: number;
}

/** Section 2, step 3: signed cash flow into / out of a portfolio. */
function applyFlow(p: Pot, flow: number, useIsa: boolean): void {
  if (flow >= 0) {
    const repay = Math.min(flow, p.shortfall);
    p.shortfall -= repay;
    let rest = flow - repay;
    if (!useIsa) {
      // "everything is treated as tax-free": no allowance, no GIA.
      p.isa += rest;
      return;
    }
    const toIsa = Math.min(rest, p.allowance);
    p.isa += toIsa;
    p.allowance -= toIsa;
    rest -= toIsa;
    p.gia += rest;
    p.basis += rest;
  } else {
    let need = -flow;
    // GIA first, cost basis reduced in proportion.
    if (p.gia > 0) {
      const sold = Math.min(need, p.gia);
      p.basis *= (p.gia - sold) / p.gia;
      p.gia -= sold;
      need -= sold;
    }
    const fromIsa = Math.min(need, p.isa);
    p.isa -= fromIsa;
    need -= fromIsa;
    p.shortfall += need; // debt, no interest
  }
}

function potValue(p: Pot, cgtRate: number): number {
  return p.isa + p.gia - refCgt(p.gia, p.basis, cgtRate) - p.shortfall;
}

interface RefRow {
  year: number;
  rentPaid: number;
  renterInvested: number;
  mortgagePaid: number;
  interestPaid: number;
  runningCosts: number;
  lodgerIncome: number;
  buyerInvested: number;
  budget: number;
  renterPortfolio: number;
  renterNetWorth: number;
  propertyValue: number;
  mortgageBalance: number;
  equity: number;
  buyerPortfolio: number;
  buyerNetWorth: number;
  deflator: number;
}

function refProject(i: Inputs) {
  const loan = Math.max(0, i.price - i.deposit);
  const stampDuty = refStampDuty(i.price, i.firstTimeBuyer);
  const cashNeeded = i.deposit + stampDuty + i.purchaseFees;
  const takeHome = refTakeHome(i.salary);
  const marginal = refMarginal(i.salary);
  const monthlyRate = i.mortgageRate / 100 / 12;
  const repayment = i.mortgageType === "repayment";
  const payment = refPayment(loan, i.mortgageRate, i.mortgageTerm);
  const termMonths = i.mortgageTerm * 12;
  const stockM = Math.pow(1 + i.stockReturn / 100, 1 / 12) - 1;
  const houseM = Math.pow(1 + i.houseGrowth / 100, 1 / 12) - 1;

  const renter: Pot = { isa: cashNeeded, gia: 0, basis: 0, shortfall: 0, allowance: 20_000 };
  const buyer: Pot = { isa: 0, gia: 0, basis: 0, shortfall: 0, allowance: 20_000 };
  let value = i.price;
  let balance = loan;
  let renterRanDryYear: number | null = null;
  let buyerRanDryYear: number | null = null;
  const totals = { rent: 0, interest: 0, capitalRepaid: 0, runningCosts: 0, lodgerIncome: 0 };

  const snapshot = (year: number, flows: Omit<RefRow, "year" | "renterPortfolio" | "renterNetWorth" | "propertyValue" | "mortgageBalance" | "equity" | "buyerPortfolio" | "buyerNetWorth" | "deflator">): RefRow => {
    const renterPortfolio = potValue(renter, i.cgtRate);
    const buyerPortfolio = potValue(buyer, i.cgtRate);
    const equity = value * (1 - i.sellingCostPct / 100) - balance;
    return {
      year,
      ...flows,
      renterPortfolio,
      renterNetWorth: renterPortfolio,
      propertyValue: value,
      mortgageBalance: balance,
      equity,
      buyerPortfolio,
      buyerNetWorth: equity + buyerPortfolio,
      deflator: Math.pow(1 + i.inflation / 100, year),
    };
  };

  const zero = { rentPaid: 0, renterInvested: 0, mortgagePaid: 0, interestPaid: 0, runningCosts: 0, lodgerIncome: 0, buyerInvested: 0, budget: 0 };
  const rows: RefRow[] = [snapshot(0, zero)];

  for (let y = 0; y < i.years; y++) {
    renter.allowance = 20_000;
    buyer.allowance = 20_000;
    const budgetYear = (takeHome - i.livingCosts) * Math.pow(1 + i.wageGrowth / 100, y);
    const budgetM = budgetYear / 12;
    const rentM = i.rent * Math.pow(1 + i.rentGrowth / 100, y);
    const lodgerGrossM = i.lodgerRent * Math.pow(1 + i.rentGrowth / 100, y);
    const lodgerNetYear = 12 * lodgerGrossM - refRentARoomTax(12 * lodgerGrossM, marginal);
    const lodgerM = lodgerNetYear / 12;
    const serviceM = (i.serviceCharge * Math.pow(1 + i.inflation / 100, y)) / 12;

    const f = { ...zero, budget: budgetYear };
    for (let m = 0; m < 12; m++) {
      const month = y * 12 + m;
      // 1. mortgage
      const interest = balance * monthlyRate;
      let paid = 0;
      let interestPaid = 0;
      if (repayment) {
        if (month < termMonths) {
          paid = payment;
          interestPaid = interest;
          balance -= payment - interest;
          if (month === termMonths - 1) balance = Math.max(0, balance);
        } else {
          balance = 0;
        }
        totals.capitalRepaid += paid - interestPaid;
      } else {
        paid = interest;
        interestPaid = interest;
      }
      // 2. buyer's housing cost
      const maintenance = (value * i.maintenancePct) / 100 / 12;
      const housing = paid + serviceM + maintenance - lodgerM;
      // 3. signed flows
      const renterFlow = budgetM - rentM;
      const buyerFlow = budgetM - housing;
      applyFlow(renter, renterFlow, i.useIsa);
      applyFlow(buyer, buyerFlow, i.useIsa);
      // 4. portfolios grow
      for (const p of [renter, buyer]) {
        p.isa *= 1 + stockM;
        p.gia *= 1 + stockM;
      }
      // 5. property grows
      value *= 1 + houseM;

      f.rentPaid += rentM;
      f.mortgagePaid += paid;
      f.interestPaid += interestPaid;
      f.runningCosts += serviceM + maintenance;
      f.lodgerIncome += lodgerM;
      f.renterInvested += renterFlow;
      f.buyerInvested += buyerFlow;
    }
    totals.rent += f.rentPaid;
    totals.interest += f.interestPaid;
    totals.runningCosts += f.runningCosts;
    totals.lodgerIncome += f.lodgerIncome;
    if (renterRanDryYear === null && renter.shortfall > 0) renterRanDryYear = y + 1;
    if (buyerRanDryYear === null && buyer.shortfall > 0) buyerRanDryYear = y + 1;
    rows.push(snapshot(y + 1, f));
  }

  return {
    rows,
    loan,
    cashNeeded,
    stampDuty,
    takeHome,
    marginal,
    monthlyMortgage: repayment ? payment : loan * monthlyRate,
    renterRanDryYear,
    buyerRanDryYear,
    totals: {
      ...totals,
      purchaseCosts: stampDuty + i.purchaseFees,
      sellingCosts: (value * i.sellingCostPct) / 100,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROW_FIELDS: (keyof RefRow)[] = [
  "rentPaid", "renterInvested", "mortgagePaid", "interestPaid", "runningCosts",
  "lodgerIncome", "buyerInvested", "budget", "renterPortfolio", "renterNetWorth",
  "propertyValue", "mortgageBalance", "equity", "buyerPortfolio", "buyerNetWorth",
  "deflator",
];

/** Within a penny, or 1e-9 relative for large numbers. */
function close(actual: number, expected: number, label = ""): void {
  const tol = Math.max(0.01, Math.abs(expected) * 1e-9);
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${label}: expected ${expected}, got ${actual} (diff ${actual - expected})`);
  }
}

const inp = (over: Partial<Inputs> = {}): Inputs => ({ ...DEFAULTS, ...over });

/** Everything that moves set to zero, 1-year horizon. */
const FLAT: Partial<Inputs> = {
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
};

// Hand-derived constants for DEFAULTS (salary 90k, price 500k, deposit 95k, FTB):
//  Income tax: taxable 90,000 − 12,570 = 77,430 → 37,700×20% + 39,730×40% = 7,540 + 15,892 = 23,432
//  NI: 37,700×8% + 39,730×2% = 3,016 + 794.60 = 3,810.60
//  Take-home = 90,000 − 23,432 − 3,810.60 = 62,757.40
//  Budget (year 0) = 62,757.40 − 13,000 = 49,757.40
//  SDLT (FTB) = (500,000 − 300,000)×5% = 10,000; cashNeeded = 95,000 + 10,000 + 3,000 = 108,000
const TAKE_HOME_90K = 62_757.4;
const BUDGET_DEFAULT = 49_757.4;
const CASH_NEEDED_DEFAULT = 108_000;
const LOAN_DEFAULT = 405_000;

// ---------------------------------------------------------------------------
// Sanity-check the reference against the hand numbers above
// ---------------------------------------------------------------------------

describe("reference model self-check (hand numbers)", () => {
  it("take-home, stamp duty and payment anchors", () => {
    close(refTakeHome(90_000), TAKE_HOME_90K, "takeHome");
    expect(refStampDuty(500_000, true)).toBe(10_000);
    expect(refStampDuty(500_000, false)).toBe(15_000); // 125k×2% + 250k×5%
    // Well-known figure: £100k over 25 years at 5% ≈ £584.59/month
    expect(refPayment(100_000, 5, 25)).toBeCloseTo(584.59, 2);
  });
});

// ---------------------------------------------------------------------------
// upfrontCosts
// ---------------------------------------------------------------------------

describe("upfrontCosts", () => {
  it("defaults", () => {
    const u = upfrontCosts(DEFAULTS);
    expect(u.loan).toBe(LOAN_DEFAULT);
    expect(u.stampDuty).toBe(10_000);
    expect(u.fees).toBe(3_000);
    expect(u.cashNeeded).toBe(CASH_NEEDED_DEFAULT);
    expect(u.maxLoan).toBe(405_000); // 90,000 × 4.5
    expect(u.loanToValue).toBeCloseTo(81, 10); // 405/500
  });

  it("non-first-time buyer pays standard SDLT", () => {
    const u = upfrontCosts(inp({ firstTimeBuyer: false }));
    expect(u.stampDuty).toBe(15_000);
    expect(u.cashNeeded).toBe(95_000 + 15_000 + 3_000);
  });

  it("FTB relief is lost entirely above £500k", () => {
    // 600k standard: 125k×2% + 350k×5% = 2,500 + 17,500 = 20,000
    expect(upfrontCosts(inp({ price: 600_000, firstTimeBuyer: true })).stampDuty).toBe(20_000);
  });

  it("loan is never negative", () => {
    const u = upfrontCosts(inp({ price: 200_000, deposit: 250_000 }));
    expect(u.loan).toBe(0);
    expect(u.loanToValue).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// project(): comparison with the reference simulation
// ---------------------------------------------------------------------------

const SCENARIOS: [string, Partial<Inputs>][] = [
  ["defaults", {}],
  ["interest-only beyond term, lodger above Rent-a-Room limit", {
    mortgageType: "interestOnly", mortgageTerm: 25, years: 35, lodgerRent: 900,
  }],
  ["renter runs dry then recovers (shortfall repaid first)", {
    rent: 7_000, rentGrowth: 0, wageGrowth: 8, stockReturn: 5, years: 25,
  }],
  ["renter builds GIA then sells it down (proportional basis, then ISA, then shortfall)", {
    rent: 800, rentGrowth: 12, wageGrowth: 0, years: 25, stockReturn: 6,
  }],
  ["useIsa=false, non-FTB, cheaper flat, 20% salary band", {
    useIsa: false, firstTimeBuyer: false, price: 350_000, deposit: 40_000, salary: 40_000,
    livingCosts: 5_000, rent: 1_200, cgtRate: 18, lodgerRent: 500,
  }],
  ["buyer runs dry (huge service charge) then recovers", {
    serviceCharge: 40_000, wageGrowth: 10, years: 20,
  }],
  ["falling house prices, 0% mortgage, short term ends inside horizon", {
    houseGrowth: -2, mortgageRate: 0, mortgageTerm: 10, years: 15,
  }],
  ["cash buyer (deposit > price)", { price: 300_000, deposit: 320_000, years: 10 }],
  ["high earner with lodger at 45% rate", { salary: 200_000, lodgerRent: 1_500, years: 12 }],
];

describe("project() matches an independent reference simulation of the spec", () => {
  for (const [name, over] of SCENARIOS) {
    it(name, () => {
      const i = inp(over);
      const actual = project(i);
      const expected = refProject(i);
      expect(actual.rows.length).toBe(i.years + 1);
      for (let n = 0; n <= i.years; n++) {
        const a = actual.rows[n] as unknown as Record<string, number>;
        const e = expected.rows[n] as unknown as Record<string, number>;
        expect(a.year).toBe(n);
        for (const f of ROW_FIELDS) close(a[f], e[f], `row ${n} ${f}`);
      }
      expect(actual.renterRanDryYear).toBe(expected.renterRanDryYear);
      expect(actual.buyerRanDryYear).toBe(expected.buyerRanDryYear);
      close(actual.monthlyMortgage, expected.monthlyMortgage, "monthlyMortgage");
      close(actual.takeHome, expected.takeHome, "takeHome");
      expect(actual.marginalRate).toBe(expected.marginal);
      for (const k of Object.keys(expected.totals) as (keyof typeof expected.totals)[]) {
        close((actual.totals as unknown as Record<string, number>)[k], expected.totals[k], `totals.${k}`);
      }
    });
  }

  it("the scenarios above really exercise the interesting branches", () => {
    // guard against the scenario list silently becoming trivial
    const r2 = refProject(inp(SCENARIOS[2][1]));
    expect(r2.renterRanDryYear).not.toBeNull();
    expect(r2.rows[25].renterNetWorth).toBeGreaterThan(0); // shortfall repaid later
    expect(refProject(inp(SCENARIOS[5][1])).buyerRanDryYear).toBe(1);
    const r3 = refProject(inp(SCENARIOS[3][1]));
    expect(r3.rows[5].renterInvested).toBeGreaterThan(20_000);
    expect(r3.rows[25].renterInvested).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// project(): hand-checkable scenarios
// ---------------------------------------------------------------------------

describe("project(): hand-checked tiny scenarios", () => {
  it("1 year, everything at 0%", () => {
    const p = project(inp(FLAT));
    const [r0, r1] = p.rows;
    // Renter: 108,000 + (49,757.40 − 12×2,000) = 133,757.40.
    // ISA takes 20,000, GIA 5,757.40 at cost → no gain → no CGT.
    close(r1.renterNetWorth, 133_757.4, "renter");
    close(r1.renterInvested, BUDGET_DEFAULT - 24_000, "renterInvested");
    close(r1.rentPaid, 24_000, "rentPaid");
    close(r1.budget, BUDGET_DEFAULT, "budget");
    // Buyer: 0% repayment → 405,000 / 360 = 1,125/month = 13,500/yr, all capital.
    close(p.monthlyMortgage, 1_125, "monthlyMortgage");
    close(r1.mortgagePaid, 13_500, "mortgagePaid");
    close(r1.interestPaid, 0, "interestPaid");
    close(r1.mortgageBalance, 391_500, "balance");
    close(r1.propertyValue, 500_000, "value");
    close(r1.buyerPortfolio, BUDGET_DEFAULT - 13_500, "buyerPortfolio"); // 36,257.40
    close(r1.equity, 108_500, "equity");
    close(r1.buyerNetWorth, 144_757.4, "buyerNW");
    // row 0 is completion day
    close(r0.renterNetWorth, CASH_NEEDED_DEFAULT, "r0 renter");
    close(r0.buyerNetWorth, 500_000 - LOAN_DEFAULT, "r0 buyer (0% selling cost)");
  });

  it("zero net flows: renter's pot compounds at exactly stockReturn per year", () => {
    // livingCosts chosen so budget = 12 × rent = 24,000 → renter flow is 0.
    const i = inp({ ...FLAT, years: 5, stockReturn: 7, livingCosts: TAKE_HOME_90K - 24_000 });
    const p = project(i);
    for (let n = 0; n <= 5; n++) {
      close(p.rows[n].renterNetWorth, CASH_NEEDED_DEFAULT * 1.07 ** n, `row ${n}`);
      close(p.rows[n].renterInvested, 0, `row ${n} invested`);
    }
  });

  it("property value compounds at exactly houseGrowth per year", () => {
    const p = project(inp({ houseGrowth: 4, years: 10 }));
    for (let n = 0; n <= 10; n++) close(p.rows[n].propertyValue, 500_000 * 1.04 ** n, `row ${n}`);
  });

  it("maintenance is on the current value: 0% growth → exactly maintenancePct × price per year", () => {
    const p = project(inp({ ...FLAT, years: 3, maintenancePct: 1, serviceCharge: 1_200, inflation: 10 }));
    // year 1: 5,000 + 1,200 ; year 2: 5,000 + 1,320 ; year 3: 5,000 + 1,452
    close(p.rows[1].runningCosts, 6_200, "y1");
    close(p.rows[2].runningCosts, 6_320, "y2");
    close(p.rows[3].runningCosts, 6_452, "y3");
  });

  it("very high rent: renter runs dry in year 2 and net worth goes negative (0% returns)", () => {
    const p = project(inp({ ...FLAT, years: 3, rent: 10_000 }));
    // Annual renter flow = 49,757.40 − 120,000 = −70,242.60
    close(p.rows[1].renterNetWorth, 108_000 - 70_242.6, "y1"); // 37,757.40, still ≥ 0
    close(p.rows[2].renterNetWorth, 108_000 - 2 * 70_242.6, "y2"); // −32,485.20 shortfall
    close(p.rows[3].renterNetWorth, 108_000 - 3 * 70_242.6, "y3");
    close(p.rows[2].renterInvested, -70_242.6, "signed flow");
    expect(p.renterRanDryYear).toBe(2);
    expect(p.buyerRanDryYear).toBeNull();
  });

  it("shortfall earns no interest while the pot does", () => {
    // Buyer with 0 portfolio and housing cost above budget → pure shortfall.
    // With stockReturn 50% it must still be just the sum of the flows.
    const p = project(inp({ ...FLAT, years: 2, serviceCharge: 80_000, stockReturn: 50 }));
    // buyer flow/yr = 49,757.40 − 13,500 − 80,000 = −43,742.60
    close(p.rows[2].buyerPortfolio, -2 * 43_742.6, "buyer shortfall");
    expect(p.buyerRanDryYear).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// project(): properties / invariants
// ---------------------------------------------------------------------------

describe("project(): rows and day-0 figures", () => {
  it("rows.length = years + 1, row n has year n, deflator = (1+inflation)^n", () => {
    for (const years of [1, 7, 30]) {
      const p = project(inp({ years, inflation: 2.5 }));
      expect(p.rows.length).toBe(years + 1);
      p.rows.forEach((r, n) => {
        expect(r.year).toBe(n);
        close(r.deflator, 1.025 ** n, `deflator ${n}`);
      });
    }
  });

  it("row 0 is completion day: flows 0, renter = cashNeeded, buyer = price×(1−sell%) − loan", () => {
    const i = inp({ sellingCostPct: 3 });
    const r0 = project(i).rows[0];
    for (const f of ["rentPaid", "mortgagePaid", "interestPaid", "runningCosts", "lodgerIncome",
      "renterInvested", "buyerInvested", "budget"] as const) {
      expect(r0[f]).toBe(0);
    }
    close(r0.renterPortfolio, CASH_NEEDED_DEFAULT, "renterPortfolio");
    close(r0.renterNetWorth, CASH_NEEDED_DEFAULT, "renterNetWorth");
    close(r0.propertyValue, 500_000, "value");
    close(r0.mortgageBalance, LOAN_DEFAULT, "balance");
    close(r0.buyerPortfolio, 0, "buyerPortfolio");
    close(r0.equity, 500_000 * 0.97 - LOAN_DEFAULT, "equity"); // 80,000
    close(r0.buyerNetWorth, 80_000, "buyerNetWorth");
    close(r0.deflator, 1, "deflator");
  });

  it("net worth identities hold on every row", () => {
    const p = project(inp({ sellingCostPct: 2.5 }));
    for (const r of p.rows) {
      close(r.renterNetWorth, r.renterPortfolio, "renter");
      close(r.equity, r.propertyValue * 0.975 - r.mortgageBalance, "equity");
      close(r.buyerNetWorth, r.equity + r.buyerPortfolio, "buyer");
    }
  });

  it("budget steps up by exactly (1 + wageGrowth) each year", () => {
    const p = project(inp({ wageGrowth: 4, years: 10 }));
    close(p.rows[1].budget, BUDGET_DEFAULT, "y1");
    for (let n = 2; n <= 10; n++) close(p.rows[n].budget, p.rows[n - 1].budget * 1.04, `y${n}`);
  });

  it("rent steps up by exactly (1 + rentGrowth) each year, starting at 12 × rent", () => {
    const p = project(inp({ rentGrowth: 5, years: 20 }));
    close(p.rows[1].rentPaid, 24_000, "y1");
    for (let n = 2; n <= 20; n++) close(p.rows[n].rentPaid, p.rows[n - 1].rentPaid * 1.05, `y${n}`);
  });

  it("renter's signed flow each year = budget − rent paid", () => {
    const p = project(inp({ rent: 3_000 }));
    for (let n = 1; n < p.rows.length; n++) {
      close(p.rows[n].renterInvested, p.rows[n].budget - p.rows[n].rentPaid, `y${n}`);
    }
  });

  it("buyer's signed flow each year = budget − (mortgage + running costs − lodger)", () => {
    const p = project(inp({ lodgerRent: 700 }));
    for (let n = 1; n < p.rows.length; n++) {
      const r = p.rows[n];
      close(r.buyerInvested, r.budget - (r.mortgagePaid + r.runningCosts - r.lodgerIncome), `y${n}`);
    }
  });
});

describe("project(): mortgage", () => {
  it("repayment: same payment every year within the term, 0 after, balance ~0 at end of term", () => {
    const i = inp({ mortgageTerm: 25, years: 30 });
    const p = project(i);
    const pmt = refPayment(LOAN_DEFAULT, 3, 25);
    close(p.monthlyMortgage, pmt, "monthlyMortgage");
    for (let n = 1; n <= 25; n++) close(p.rows[n].mortgagePaid, 12 * pmt, `y${n}`);
    expect(Math.abs(p.rows[25].mortgageBalance)).toBeLessThan(0.01);
    for (let n = 26; n <= 30; n++) {
      expect(p.rows[n].mortgagePaid).toBe(0);
      expect(p.rows[n].interestPaid).toBe(0);
      expect(Math.abs(p.rows[n].mortgageBalance)).toBeLessThan(1e-6);
    }
    // balance falls monotonically within the term
    for (let n = 1; n <= 25; n++) {
      expect(p.rows[n].mortgageBalance).toBeLessThan(p.rows[n - 1].mortgageBalance);
    }
    close(p.totals.capitalRepaid, LOAN_DEFAULT, "capitalRepaid");
  });

  it("repayment: capital repaid in a year = drop in balance; interest = paid − capital", () => {
    const p = project(DEFAULTS);
    for (let n = 1; n <= 30; n++) {
      const capital = p.rows[n - 1].mortgageBalance - p.rows[n].mortgageBalance;
      close(p.rows[n].mortgagePaid - p.rows[n].interestPaid, capital, `y${n}`);
    }
  });

  it("repayment year-1 interest equals the sum of balance × r over 12 months", () => {
    const r = 0.03 / 12;
    const pmt = refPayment(LOAN_DEFAULT, 3, 30);
    let b = LOAN_DEFAULT;
    let interest = 0;
    for (let m = 0; m < 12; m++) {
      interest += b * r;
      b -= pmt - b * r;
    }
    const p = project(DEFAULTS);
    close(p.rows[1].interestPaid, interest, "interest");
    close(p.rows[1].mortgageBalance, b, "balance");
  });

  it("£100k at 5% over 25 years costs the textbook £584.59 a month", () => {
    const p = project(inp({ price: 200_000, deposit: 100_000, mortgageRate: 5, mortgageTerm: 25 }));
    expect(p.monthlyMortgage).toBeCloseTo(584.59, 2);
  });

  it("interest-only: balance stays at the loan for the whole projection, even beyond the term", () => {
    const p = project(inp({ mortgageType: "interestOnly", mortgageTerm: 20, years: 30 }));
    close(p.monthlyMortgage, (LOAN_DEFAULT * 0.03) / 12, "monthlyMortgage"); // 1,012.50
    for (let n = 0; n <= 30; n++) close(p.rows[n].mortgageBalance, LOAN_DEFAULT, `row ${n}`);
    for (let n = 1; n <= 30; n++) {
      close(p.rows[n].interestPaid, 12_150, `interest y${n}`); // 405,000 × 3%
      close(p.rows[n].mortgagePaid, 12_150, `paid y${n}`);
    }
    close(p.totals.capitalRepaid, 0, "capitalRepaid");
  });
});

describe("project(): sensitivity properties", () => {
  it("raising houseGrowth raises the buyer's final net worth and leaves the renter's unchanged", () => {
    const lo = project(inp({ houseGrowth: 1 }));
    const hi = project(inp({ houseGrowth: 5 }));
    const L = lo.rows[30];
    const H = hi.rows[30];
    expect(H.buyerNetWorth).toBeGreaterThan(L.buyerNetWorth);
    expect(H.renterNetWorth).toBe(L.renterNetWorth);
    lo.rows.forEach((r, n) => expect(hi.rows[n].renterNetWorth).toBe(r.renterNetWorth));
  });

  it("raising rent lowers the renter's final net worth and leaves the buyer's unchanged", () => {
    const a = project(inp({ rent: 1_500 })).rows[30];
    const b = project(inp({ rent: 2_500 })).rows[30];
    expect(b.renterNetWorth).toBeLessThan(a.renterNetWorth);
    expect(b.buyerNetWorth).toBe(a.buyerNetWorth);
  });
});

describe("project(): ISA allowance", () => {
  it("with useIsa=true every net worth is ≤ useIsa=false", () => {
    const isa = project(inp({ useIsa: true }));
    const free = project(inp({ useIsa: false }));
    isa.rows.forEach((r, n) => {
      expect(r.renterNetWorth).toBeLessThanOrEqual(free.rows[n].renterNetWorth + 1e-6);
      expect(r.buyerNetWorth).toBeLessThanOrEqual(free.rows[n].buyerNetWorth + 1e-6);
    });
    // and strictly lower at the horizon for the defaults (buyer & renter put > £20k/yr in)
    expect(isa.rows[30].renterNetWorth).toBeLessThan(free.rows[30].renterNetWorth);
  });

  it("exactly equal when contributions never exceed £20k/yr (no GIA holdings)", () => {
    // Renter flow = 49,757.40 − 12 × 2,479.7833… = 20,000 exactly each year.
    const over = { rent: (BUDGET_DEFAULT - 20_000) / 12, rentGrowth: 0, wageGrowth: 0 };
    const isa = project(inp({ ...over, useIsa: true }));
    const free = project(inp({ ...over, useIsa: false }));
    isa.rows.forEach((r, n) => close(r.renterNetWorth, free.rows[n].renterNetWorth, `row ${n}`));
  });

  it("GIA gains above the £3,000 exemption are taxed at cgtRate in the row figures", () => {
    // Renter flow ≈ 25,757/yr > 20k → GIA builds up; at 7% for 30 years the gain is large.
    const a = project(inp({ cgtRate: 0 })).rows[30];
    const b = project(inp({ cgtRate: 24 })).rows[30];
    const c = project(inp({ cgtRate: 48 })).rows[30];
    expect(b.renterNetWorth).toBeLessThan(a.renterNetWorth);
    // CGT is linear in the rate (same gain, same exemption) → equal steps.
    close(a.renterNetWorth - b.renterNetWorth, b.renterNetWorth - c.renterNetWorth, "linear in rate");
  });

  it("no CGT on a GIA whose gain is under £3,000", () => {
    // 1 year: GIA gets ~5,757 in the last months at 7% → gain far below £3k.
    const i = inp({ ...FLAT, stockReturn: 7 });
    close(project({ ...i, cgtRate: 24 }).rows[1].renterNetWorth,
      project({ ...i, cgtRate: 0 }).rows[1].renterNetWorth, "no CGT");
  });
});

describe("project(): Rent-a-Room", () => {
  it("lodger income ≤ £7,500/yr is untaxed", () => {
    const p = project(inp({ lodgerRent: 625, rentGrowth: 0 })); // exactly 7,500/yr
    close(p.rows[1].lodgerIncome, 7_500, "7.5k");
    close(project(inp({ lodgerRent: 500 })).rows[1].lodgerIncome, 6_000, "6k");
  });

  it("receipts above £7,500 are taxed at the 40% marginal rate (salary 90k)", () => {
    const p = project(inp({ lodgerRent: 1_000, rentGrowth: 3 }));
    // year 1: 12,000 − (12,000 − 7,500) × 40% = 10,200
    close(p.rows[1].lodgerIncome, 10_200, "y1");
    // year 2: gross 12,360 → 12,360 − 4,860 × 40% = 10,416
    close(p.rows[2].lodgerIncome, 10_416, "y2");
    expect(p.marginalRate).toBe(40);
  });

  it("taxed at 20% for a basic-rate salary", () => {
    const p = project(inp({ salary: 40_000, lodgerRent: 1_000 }));
    // 12,000 − 4,500 × 20% = 11,100
    close(p.rows[1].lodgerIncome, 11_100, "y1");
    expect(p.marginalRate).toBe(20);
  });

  it("net lodger income reduces the buyer's housing cost pound for pound", () => {
    const a = project(inp({ lodgerRent: 0 }));
    const b = project(inp({ lodgerRent: 1_000 }));
    close(b.rows[1].buyerInvested - a.rows[1].buyerInvested, 10_200, "y1");
    // renter unaffected
    expect(b.rows[30].renterNetWorth).toBe(a.rows[30].renterNetWorth);
  });
});

describe("project(): totals", () => {
  it("are lifetime sums of the row figures, plus purchase and selling costs", () => {
    const p = project(inp({ lodgerRent: 800 }));
    const sum = (f: "rentPaid" | "interestPaid" | "runningCosts" | "lodgerIncome") =>
      p.rows.reduce((s, r) => s + r[f], 0);
    close(p.totals.rent, sum("rentPaid"), "rent");
    close(p.totals.interest, sum("interestPaid"), "interest");
    close(p.totals.runningCosts, sum("runningCosts"), "runningCosts");
    close(p.totals.lodgerIncome, sum("lodgerIncome"), "lodgerIncome");
    close(p.totals.capitalRepaid, LOAN_DEFAULT - p.rows[30].mortgageBalance, "capitalRepaid");
    close(p.totals.purchaseCosts, 13_000, "purchaseCosts");
    close(p.totals.sellingCosts, p.rows[30].propertyValue * 0.02, "sellingCosts");
  });

  it("other outputs: upfront, takeHome", () => {
    const p = project(DEFAULTS);
    expect(p.upfront).toEqual(upfrontCosts(DEFAULTS));
    close(p.takeHome, TAKE_HOME_90K, "takeHome");
  });
});

// ---------------------------------------------------------------------------
// summarise
// ---------------------------------------------------------------------------

describe("summarise", () => {
  it("nominal figures come from the last row", () => {
    const p = project(DEFAULTS);
    const last = p.rows[30];
    const s = summarise(p);
    close(s.finalRenter, last.renterNetWorth, "renter");
    close(s.finalBuyer, last.buyerNetWorth, "buyer");
    close(s.difference, last.buyerNetWorth - last.renterNetWorth, "difference");
  });

  it("real figures are nominal ÷ (1 + inflation)^years", () => {
    const p = project(DEFAULTS);
    const nom = summarise(p);
    const real = summarise(p, true);
    const d = 1.02 ** 30;
    close(real.finalRenter, nom.finalRenter / d, "renter");
    close(real.finalBuyer, nom.finalBuyer / d, "buyer");
    close(real.difference, nom.difference / d, "difference");
    expect(real.crossoverYear).toBe(nom.crossoverYear);
  });

  it("crossoverYear is the first year ≥ 1 where buyer ≥ renter", () => {
    for (const over of [{}, { rent: 1_200 }, { rent: 3_000 }, { houseGrowth: 0 }, { stockReturn: 2 }]) {
      const p = project(inp(over));
      const idx = p.rows.findIndex((r, n) => n >= 1 && r.buyerNetWorth >= r.renterNetWorth);
      expect(summarise(p).crossoverYear).toBe(idx === -1 ? null : idx);
    }
  });

  it("crossoverYear ignores row 0 even when the buyer is ahead on day 0", () => {
    // Cash purchase, no purchase or selling costs: buyer ≥ renter on day 0 but not after.
    const i = inp({ ...FLAT, years: 3, price: 100_000, deposit: 100_000, firstTimeBuyer: true,
      purchaseFees: 0, rent: 0, serviceCharge: 50_000 });
    // day 0: buyer 100,000, renter 100,000 (SDLT 0 under £300k FTB) → equal, buyer ≥ renter.
    // each year renter +49,757.40, buyer +49,757.40 − 50,000 → buyer behind from year 1 on.
    const p = project(i);
    expect(p.rows[0].buyerNetWorth).toBeGreaterThanOrEqual(p.rows[0].renterNetWorth);
    expect(summarise(p).crossoverYear).toBeNull();
  });

  it("crossoverYear null when the buyer never catches up", () => {
    const p = project(inp({ rent: 500, houseGrowth: -3 }));
    expect(summarise(p).crossoverYear).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// breakevenHouseGrowth
// ---------------------------------------------------------------------------

describe("breakevenHouseGrowth", () => {
  const diffAt = (i: Inputs, g: number) => summarise(project({ ...i, houseGrowth: g })).difference;

  it("zeroes the nominal difference (sign change within ±0.01pp)", () => {
    for (const over of [{}, { rent: 1_500 }, { stockReturn: 5, years: 15 }]) {
      const i = inp(over);
      const g = breakevenHouseGrowth(i);
      expect(g).not.toBeNull();
      expect(g!).toBeGreaterThanOrEqual(-10);
      expect(g!).toBeLessThanOrEqual(20);
      expect(diffAt(i, g! - 0.01)).toBeLessThanOrEqual(0);
      expect(diffAt(i, g! + 0.01)).toBeGreaterThanOrEqual(0);
    }
  });

  it("agrees with a bisection on the reference model", () => {
    const i = DEFAULTS;
    const refDiff = (g: number) => {
      const last = refProject({ ...i, houseGrowth: g }).rows.at(-1)!;
      return last.buyerNetWorth - last.renterNetWorth;
    };
    let lo = -10;
    let hi = 20;
    expect(Math.sign(refDiff(lo))).not.toBe(Math.sign(refDiff(hi)));
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (refDiff(mid) < 0) lo = mid;
      else hi = mid;
    }
    expect(Math.abs(breakevenHouseGrowth(i)! - lo)).toBeLessThan(0.01);
  });

  it("returns null when the difference doesn't change sign in −10%..+20%", () => {
    // 1-year horizon, 50% selling costs, free rent: renter wins even at +20% growth.
    const i = inp({ years: 1, sellingCostPct: 50, rent: 0 });
    const ref = (g: number) => {
      const last = refProject({ ...i, houseGrowth: g }).rows[1];
      return last.buyerNetWorth - last.renterNetWorth;
    };
    expect(ref(20)).toBeLessThan(0);
    expect(ref(-10)).toBeLessThan(0);
    expect(breakevenHouseGrowth(i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// yearOneCosts
// ---------------------------------------------------------------------------

describe("yearOneCosts", () => {
  it("follows the formula, using the year-1 projection figures", () => {
    const i = inp({ lodgerRent: 1_000 });
    const y = yearOneCosts(i);
    const r1 = project(i).rows[1];
    const ref1 = refProject(i).rows[1];
    close(y.rent, 24_000, "rent");
    close(y.interest, ref1.interestPaid, "interest vs reference");
    close(y.interest, r1.interestPaid, "interest vs row");
    close(y.runningCosts, ref1.runningCosts, "runningCosts"); // 2,000 + ~0.5% × value
    close(y.lodgerIncome, 10_200, "lodgerIncome");
    close(y.opportunityCost, 108_000 * 0.07, "opportunityCost"); // 7,560
    close(y.expectedGrowth, 500_000 * 0.03, "expectedGrowth"); // 15,000
    close(y.buyTotal, y.interest + y.runningCosts - y.lodgerIncome + y.opportunityCost - y.expectedGrowth, "buyTotal");
  });

  it("0% rates: interest 0, running costs = service charge + maintenance on a flat price", () => {
    const y = yearOneCosts(inp({ ...FLAT, maintenancePct: 1, serviceCharge: 2_000, stockReturn: 5 }));
    close(y.interest, 0, "interest");
    close(y.runningCosts, 7_000, "runningCosts"); // 2,000 + 1% × 500,000
    close(y.opportunityCost, 5_400, "opp"); // 108,000 × 5%
    close(y.expectedGrowth, 0, "growth");
    close(y.buyTotal, 7_000 + 5_400, "buyTotal");
  });
});

describe("spec clarifications: yearOneCosts ignores the horizon", () => {
  it("returns the same year-one figures whatever years is set to", () => {
    const one = yearOneCosts({ ...DEFAULTS, years: 1 });
    expect(yearOneCosts({ ...DEFAULTS, years: 30 })).toEqual(one);
    expect(yearOneCosts({ ...DEFAULTS, years: 0 })).toEqual(one);
  });
});
