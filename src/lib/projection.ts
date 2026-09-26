import {
  cgtOnGia,
  marginalTaxRate,
  mortgagePayment,
  rentARoomTax,
  stampDuty,
  takeHomePay,
} from "./finance";
import { ISA_ALLOWANCE } from "./uk";

export type MortgageType = "repayment" | "interestOnly";

export interface Inputs {
  // You
  earners: number; // adults in the household, each earning `salary`
  salary: number; // gross £/yr per earner
  livingCosts: number; // non-housing spending £/yr (food, travel, fun…)
  wageGrowth: number; // %/yr
  incomeMultiple: number; // lender's loan-to-income cap
  // Buying
  price: number;
  deposit: number;
  firstTimeBuyer: boolean;
  purchaseFees: number; // legal, survey, mortgage arrangement fee
  mortgageRate: number; // %
  mortgageTerm: number; // years
  mortgageType: MortgageType;
  serviceCharge: number; // £/yr: service charge, ground rent, insurance
  maintenancePct: number; // % of property value per year
  lodgerRent: number; // £/month from letting a spare room
  sellingCostPct: number; // % of value: estate agent, legal, removals
  // Renting
  rent: number; // £/month
  // Markets
  stockReturn: number; // %/yr nominal, after fund fees
  houseGrowth: number; // %/yr nominal
  rentGrowth: number; // %/yr
  inflation: number; // %/yr CPI
  // Tax on investments
  useIsa: boolean; // false = treat all investments as tax-free
  cgtRate: number; // % CGT on gains outside the ISA
  // Horizon
  years: number;
}

/** The fixed worked example from docs/model-spec.md. Tests use this, not DEFAULTS. */
export const USER_EXAMPLE: Inputs = {
  earners: 1,
  salary: 90_000,
  livingCosts: 13_000,
  wageGrowth: 3,
  incomeMultiple: 4.5,
  price: 500_000,
  deposit: 95_000,
  firstTimeBuyer: true,
  purchaseFees: 3_000,
  mortgageRate: 3,
  mortgageTerm: 30,
  mortgageType: "repayment",
  serviceCharge: 2_000,
  maintenancePct: 0.5,
  lodgerRent: 0,
  sellingCostPct: 2,
  rent: 2_000,
  stockReturn: 7,
  houseGrowth: 3,
  rentGrowth: 3,
  inflation: 2,
  useIsa: true,
  cgtRate: 24,
  years: 30,
};

export const DEFAULTS: Inputs = USER_EXAMPLE;

/** An investment portfolio split between an ISA and a taxable account. */
interface Pot {
  isa: number;
  gia: number;
  giaBasis: number;
  /** Cash the plan couldn't fund because the pot was empty (treated as debt). */
  shortfall: number;
}

function newPot(start: number): Pot {
  // Savings for the deposit are assumed to have been built up in an ISA.
  return { isa: start, gia: 0, giaBasis: 0, shortfall: 0 };
}

/** Add (positive) or withdraw (negative) cash. Returns ISA allowance left this tax year. */
function flow(pot: Pot, amount: number, isaRoom: number, useIsa: boolean): number {
  if (amount >= 0) {
    const repay = Math.min(amount, pot.shortfall);
    pot.shortfall -= repay;
    amount -= repay;
    const toIsa = useIsa ? Math.min(amount, isaRoom) : amount;
    pot.isa += toIsa;
    pot.gia += amount - toIsa;
    pot.giaBasis += amount - toIsa;
    return useIsa ? isaRoom - toIsa : isaRoom;
  }
  // Withdraw from the taxable account first to keep the ISA wrapper intact.
  let need = -amount;
  const fromGia = Math.min(need, pot.gia);
  if (fromGia > 0) {
    pot.giaBasis *= 1 - fromGia / pot.gia;
    pot.gia -= fromGia;
    need -= fromGia;
  }
  const fromIsa = Math.min(need, pot.isa);
  pot.isa -= fromIsa;
  need -= fromIsa;
  pot.shortfall += need;
  return isaRoom;
}

function grow(pot: Pot, monthlyRate: number) {
  pot.isa *= 1 + monthlyRate;
  pot.gia *= 1 + monthlyRate;
}

function potAfterTax(pot: Pot, cgtRate: number): number {
  return pot.isa + pot.gia - cgtOnGia(pot.gia, pot.giaBasis, cgtRate) - pot.shortfall;
}

export interface YearRow {
  year: number;
  // Renter
  rentPaid: number; // this year
  renterInvested: number; // net cash added to (or taken from, if negative) the portfolio this year
  renterPortfolio: number; // after CGT if sold, less any shortfall
  renterNetWorth: number;
  // Buyer
  mortgagePaid: number; // this year
  interestPaid: number; // this year
  runningCosts: number; // service charge + maintenance this year
  lodgerIncome: number; // this year, after tax
  buyerInvested: number;
  propertyValue: number;
  mortgageBalance: number;
  equity: number; // value − selling costs − mortgage
  buyerPortfolio: number;
  buyerNetWorth: number;
  // Both
  budget: number; // money available for housing + investing this year
  /** Divide nominal £ by this to get today's money. */
  deflator: number;
}

export interface Upfront {
  loan: number;
  stampDuty: number;
  fees: number;
  cashNeeded: number; // deposit + stamp duty + fees
  maxLoan: number;
  loanToValue: number; // %
}

export interface Totals {
  rent: number;
  interest: number;
  capitalRepaid: number;
  runningCosts: number;
  lodgerIncome: number;
  purchaseCosts: number;
  sellingCosts: number;
}

export interface Projection {
  rows: YearRow[]; // rows[0] is purchase day, rows[n] is the end of year n
  upfront: Upfront;
  totals: Totals;
  monthlyMortgage: number;
  takeHome: number;
  marginalRate: number;
  /** First year the renter's or buyer's portfolio ran dry, if ever. */
  renterRanDryYear: number | null;
  buyerRanDryYear: number | null;
}

export function upfrontCosts(p: Inputs): Upfront {
  const loan = Math.max(0, p.price - p.deposit);
  const sdlt = stampDuty(p.price, p.firstTimeBuyer);
  return {
    loan,
    stampDuty: sdlt,
    fees: p.purchaseFees,
    cashNeeded: p.deposit + sdlt + p.purchaseFees,
    maxLoan: p.salary * p.incomeMultiple,
    loanToValue: p.price > 0 ? (loan / p.price) * 100 : 0,
  };
}

const monthly = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

/**
 * Month-by-month simulation of two people with identical income, spending and
 * savings on the day one of them buys. Each puts whatever is left after housing
 * costs into a global index fund; if housing costs more than their budget they
 * sell investments to cover it. Everything is nominal; use `deflator` for real terms.
 */
export function project(p: Inputs): Projection {
  const upfront = upfrontCosts(p);
  const takeHome = takeHomePay(p.salary);
  const marginalRate = marginalTaxRate(p.salary);
  const budget0 = takeHome - p.livingCosts;

  const payment =
    p.mortgageType === "repayment" ? mortgagePayment(upfront.loan, p.mortgageRate, p.mortgageTerm) : 0;
  const mRate = p.mortgageRate / 100 / 12;
  const termMonths = p.mortgageTerm * 12;
  const stockM = monthly(p.stockReturn);
  const houseM = monthly(p.houseGrowth);

  // Both start with the cash the buyer needs on completion day.
  const renter = newPot(upfront.cashNeeded);
  const buyer = newPot(0);
  let houseValue = p.price;
  let balance = upfront.loan;

  const totals: Totals = {
    rent: 0,
    interest: 0,
    capitalRepaid: 0,
    runningCosts: 0,
    lodgerIncome: 0,
    purchaseCosts: upfront.stampDuty + upfront.fees,
    sellingCosts: 0,
  };

  const snapshot = (year: number, acc: Omit<YearRow, "year" | "renterPortfolio" | "renterNetWorth" | "propertyValue" | "mortgageBalance" | "equity" | "buyerPortfolio" | "buyerNetWorth" | "deflator">): YearRow => {
    const renterPortfolio = potAfterTax(renter, p.cgtRate);
    const buyerPortfolio = potAfterTax(buyer, p.cgtRate);
    const equity = houseValue * (1 - p.sellingCostPct / 100) - balance;
    return {
      year,
      ...acc,
      renterPortfolio,
      renterNetWorth: renterPortfolio,
      propertyValue: houseValue,
      mortgageBalance: balance,
      equity,
      buyerPortfolio,
      buyerNetWorth: equity + buyerPortfolio,
      deflator: Math.pow(1 + p.inflation / 100, year),
    };
  };

  const zero = {
    rentPaid: 0,
    renterInvested: 0,
    mortgagePaid: 0,
    interestPaid: 0,
    runningCosts: 0,
    lodgerIncome: 0,
    buyerInvested: 0,
    budget: 0,
  };
  const rows: YearRow[] = [snapshot(0, zero)];
  let renterRanDryYear: number | null = null;
  let buyerRanDryYear: number | null = null;

  for (let y = 0; y < p.years; y++) {
    const acc = { ...zero };
    let renterIsaRoom = ISA_ALLOWANCE;
    let buyerIsaRoom = ISA_ALLOWANCE;
    // Pay rises and rent reviews happen once a year.
    const budget = (budget0 * Math.pow(1 + p.wageGrowth / 100, y)) / 12;
    const rent = p.rent * Math.pow(1 + p.rentGrowth / 100, y);
    const lodgerGross = p.lodgerRent * Math.pow(1 + p.rentGrowth / 100, y);
    const lodgerNet = lodgerGross - rentARoomTax(lodgerGross * 12, marginalRate) / 12;
    const serviceCharge = (p.serviceCharge * Math.pow(1 + p.inflation / 100, y)) / 12;

    for (let m = 0; m < 12; m++) {
      const month = y * 12 + m;
      // Mortgage: interest accrues on the balance; a repayment loan also pays down capital.
      const interest = balance * mRate;
      let paid = 0;
      if (p.mortgageType === "repayment") {
        if (month < termMonths && balance > 0) {
          paid = Math.min(payment, balance + interest);
          balance = Math.max(0, balance + interest - paid);
        }
      } else {
        paid = interest; // interest-only: the full loan is still owed at the end
      }
      const maintenance = (houseValue * p.maintenancePct) / 100 / 12;
      const running = serviceCharge + maintenance;
      const buyerCost = paid + running - lodgerNet;

      // Signed flows: a negative number means selling investments to pay for housing.
      renterIsaRoom = flow(renter, budget - rent, renterIsaRoom, p.useIsa);
      buyerIsaRoom = flow(buyer, budget - buyerCost, buyerIsaRoom, p.useIsa);
      grow(renter, stockM);
      grow(buyer, stockM);
      houseValue *= 1 + houseM;

      acc.budget += budget;
      acc.rentPaid += rent;
      acc.renterInvested += budget - rent;
      acc.mortgagePaid += paid;
      acc.interestPaid += Math.min(interest, paid);
      acc.runningCosts += running;
      acc.lodgerIncome += lodgerNet;
      acc.buyerInvested += budget - buyerCost;
      totals.capitalRepaid += Math.max(0, paid - interest);
    }

    totals.rent += acc.rentPaid;
    totals.interest += acc.interestPaid;
    totals.runningCosts += acc.runningCosts;
    totals.lodgerIncome += acc.lodgerIncome;
    if (renterRanDryYear === null && renter.shortfall > 0) renterRanDryYear = y + 1;
    if (buyerRanDryYear === null && buyer.shortfall > 0) buyerRanDryYear = y + 1;
    rows.push(snapshot(y + 1, acc));
  }

  totals.sellingCosts = (houseValue * p.sellingCostPct) / 100;

  return {
    rows,
    upfront,
    totals,
    monthlyMortgage: p.mortgageType === "repayment" ? payment : upfront.loan * mRate,
    takeHome,
    marginalRate,
    renterRanDryYear,
    buyerRanDryYear,
  };
}

export interface Summary {
  finalRenter: number;
  finalBuyer: number;
  /** Buyer − renter at the horizon (positive = buying wins). */
  difference: number;
  /** First year the buyer's net worth overtakes the renter's, if it does. */
  crossoverYear: number | null;
}

export function summarise(proj: Projection, real = false): Summary {
  const last = proj.rows[proj.rows.length - 1];
  const d = real ? last.deflator : 1;
  const crossover = proj.rows.find((r) => r.year > 0 && r.buyerNetWorth >= r.renterNetWorth);
  return {
    finalRenter: last.renterNetWorth / d,
    finalBuyer: last.buyerNetWorth / d,
    difference: (last.buyerNetWorth - last.renterNetWorth) / d,
    crossoverYear: crossover ? crossover.year : null,
  };
}

/**
 * House price growth (%/yr) at which buying and renting finish level at the
 * horizon. Returns null if the answer is outside −10%…+20%.
 */
export function breakevenHouseGrowth(p: Inputs): number | null {
  const diff = (g: number) => summarise(project({ ...p, houseGrowth: g })).difference;
  let lo = -10;
  let hi = 20;
  if (diff(lo) > 0 || diff(hi) < 0) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (diff(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Year-one running cost of each option, counting only money you never get back. */
export interface UnrecoverableCosts {
  rent: number;
  interest: number;
  runningCosts: number;
  lodgerIncome: number;
  /** What the buyer's cash (deposit, stamp duty, fees) would have earned invested. */
  opportunityCost: number;
  /** Expected rise in the property's value (a gain, so it reduces the cost). */
  expectedGrowth: number;
  buyTotal: number;
}

export function yearOneCosts(p: Inputs): UnrecoverableCosts {
  const proj = project({ ...p, years: 1 });
  const y1 = proj.rows[1];
  const opportunityCost = (proj.upfront.cashNeeded * p.stockReturn) / 100;
  const expectedGrowth = (p.price * p.houseGrowth) / 100;
  const buyTotal = y1.interestPaid + y1.runningCosts - y1.lodgerIncome + opportunityCost - expectedGrowth;
  return {
    rent: y1.rentPaid,
    interest: y1.interestPaid,
    runningCosts: y1.runningCosts,
    lodgerIncome: y1.lodgerIncome,
    opportunityCost,
    expectedGrowth,
    buyTotal,
  };
}
