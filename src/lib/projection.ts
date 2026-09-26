import {
  cgtOnGia,
  marginalTaxRate,
  mortgagePayment,
  remainingBalance,
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
  mortgageRate: number; // %, the starting fixed rate
  fixYears: number; // years the starting rate is fixed
  followOnRate: number; // % after the fixed period (remortgage)
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
  fixYears: 5,
  followOnRate: 3,
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

function potAfterTax(pot: Pot, cgtRate: number, people: number): number {
  return pot.isa + pot.gia - cgtOnGia(pot.gia, pot.giaBasis, cgtRate, people) - pot.shortfall;
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
  // Growth this year: leverage (the home, on the whole price) vs compounding (investments)
  houseGain: number;
  renterInvestmentGain: number; // before tax, excluding new money paid in
  buyerInvestmentGain: number;
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
  monthlyMortgage: number; // during the fixed period
  followOnMonthlyMortgage: number; // after remortgaging onto followOnRate
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
    maxLoan: p.salary * p.earners * p.incomeMultiple,
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
  const takeHome = p.earners * takeHomePay(p.salary);
  const isaAllowance = ISA_ALLOWANCE * p.earners;
  const marginalRate = marginalTaxRate(p.salary);
  const budget0 = takeHome - p.livingCosts;

  const repayment = p.mortgageType === "repayment";
  const termMonths = p.mortgageTerm * 12;
  // The starting rate is fixed for fixYears; then the loan is remortgaged onto followOnRate.
  const remortgages = p.fixYears < p.mortgageTerm;
  const fixMonths = p.fixYears * 12;
  const initialPayment = repayment ? mortgagePayment(upfront.loan, p.mortgageRate, p.mortgageTerm) : 0;
  const followOnPayment = !remortgages
    ? initialPayment
    : repayment
      ? mortgagePayment(
          remainingBalance(upfront.loan, p.mortgageRate, p.mortgageTerm, fixMonths),
          p.followOnRate,
          p.mortgageTerm - p.fixYears,
        )
      : 0;
  let payment = initialPayment;
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
    const renterPortfolio = potAfterTax(renter, p.cgtRate, p.earners);
    const buyerPortfolio = potAfterTax(buyer, p.cgtRate, p.earners);
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
    houseGain: 0,
    renterInvestmentGain: 0,
    buyerInvestmentGain: 0,
  };
  const rows: YearRow[] = [snapshot(0, zero)];
  let renterRanDryYear: number | null = null;
  let buyerRanDryYear: number | null = null;

  for (let y = 0; y < p.years; y++) {
    const acc = { ...zero };
    let renterIsaRoom = isaAllowance;
    let buyerIsaRoom = isaAllowance;
    // Pay rises and rent reviews happen once a year.
    const budget = (budget0 * Math.pow(1 + p.wageGrowth / 100, y)) / 12;
    const rent = p.rent * Math.pow(1 + p.rentGrowth / 100, y);
    const lodgerGross = p.lodgerRent * Math.pow(1 + p.rentGrowth / 100, y);
    const lodgerNet = lodgerGross - rentARoomTax(lodgerGross * 12, marginalRate) / 12;
    const serviceCharge = (p.serviceCharge * Math.pow(1 + p.inflation / 100, y)) / 12;
    const valueAtStart = houseValue;

    for (let m = 0; m < 12; m++) {
      const month = y * 12 + m;
      // Mortgage: interest accrues on the balance; a repayment loan also pays down capital.
      const afterFix = remortgages && month >= fixMonths;
      const interest = (balance * (afterFix ? p.followOnRate : p.mortgageRate)) / 100 / 12;
      // Remortgaging resets the payment to clear what's left over the rest of the term.
      if (repayment && remortgages && month === fixMonths) {
        payment = mortgagePayment(balance, p.followOnRate, p.mortgageTerm - p.fixYears);
      }
      let paid = 0;
      if (repayment) {
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
      acc.renterInvestmentGain += (renter.isa + renter.gia) * stockM;
      acc.buyerInvestmentGain += (buyer.isa + buyer.gia) * stockM;
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

    acc.houseGain = houseValue - valueAtStart;
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
    monthlyMortgage: repayment ? initialPayment : (upfront.loan * p.mortgageRate) / 100 / 12,
    followOnMonthlyMortgage: !remortgages
      ? repayment
        ? initialPayment
        : (upfront.loan * p.mortgageRate) / 100 / 12
      : repayment
        ? followOnPayment
        : (upfront.loan * p.followOnRate) / 100 / 12,
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

export interface LeverageRace {
  rows: { year: number; homeGain: number; cashGain: number; homeTotal: number; cashTotal: number }[];
  /** First year the invested cash adds at least as much as the home's price gain. */
  overtakeYear: number | null;
  /** First year the invested cash has gained at least as much in total. */
  catchUpYear: number | null;
}

/**
 * Leverage against compounding, on their own: the home's price gain on the whole
 * price vs what the buyer's own cash would earn invested instead, nothing added.
 */
export function leverageRace(p: Inputs): LeverageRace {
  const cash = upfrontCosts(p).cashNeeded;
  const h = 1 + p.houseGrowth / 100;
  const s = 1 + p.stockReturn / 100;
  const rows = [];
  for (let t = 1; t <= p.years; t++) {
    rows.push({
      year: t,
      homeGain: p.price * (Math.pow(h, t) - Math.pow(h, t - 1)),
      cashGain: cash * (Math.pow(s, t) - Math.pow(s, t - 1)),
      homeTotal: p.price * (Math.pow(h, t) - 1),
      cashTotal: cash * (Math.pow(s, t) - 1),
    });
  }
  const overtake = rows.find((r) => r.cashGain >= r.homeGain);
  const catchUp = rows.find((r) => r.cashTotal >= r.homeTotal);
  return { rows, overtakeYear: overtake ? overtake.year : null, catchUpYear: catchUp ? catchUp.year : null };
}

/**
 * First year the renter's investment returns are at least the home's price gain:
 * where compounding on a smaller pot overtakes leverage on the whole price.
 */
export function compoundingOvertakesYear(proj: Projection): number | null {
  const row = proj.rows.find((r) => r.year > 0 && r.renterInvestmentGain >= r.houseGain);
  return row ? row.year : null;
}

/**
 * House price growth (%/yr) at which buying and renting finish level at the
 * horizon. Rent growth moves with it, keeping the chosen gap between the two.
 * Returns null if the answer is outside −10%…+20%.
 */
export function breakevenHouseGrowth(p: Inputs): number | null {
  const diff = (g: number) =>
    summarise(project({ ...p, houseGrowth: g, rentGrowth: p.rentGrowth + (g - p.houseGrowth) })).difference;
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
  /** Stamp duty, fees and selling costs spread over the years you stay. */
  transactionCostsPerYear: number;
  /** Owning's unrecoverable costs if the price doesn't change. */
  buyBeforeGrowth: number;
  /** Expected rise in the property's value (a gain, so it reduces the cost). */
  expectedGrowth: number;
  buyTotal: number;
  /** Year-one house price growth (%) at which owning costs the same as renting. */
  growthNeeded: number;
  /** Ben Felix's rule of thumb: 5% of the price a year. */
  fivePercentRule: number;
}

export function yearOneCosts(p: Inputs): UnrecoverableCosts {
  const proj = project({ ...p, years: 1 });
  const y1 = proj.rows[1];
  const opportunityCost = (proj.upfront.cashNeeded * p.stockReturn) / 100;
  const expectedGrowth = (p.price * p.houseGrowth) / 100;
  const stay = Math.max(1, p.years);
  const transactionCostsPerYear =
    (proj.upfront.stampDuty + p.purchaseFees + (p.price * p.sellingCostPct) / 100) / stay;
  const buyBeforeGrowth =
    y1.interestPaid + y1.runningCosts - y1.lodgerIncome + opportunityCost + transactionCostsPerYear;
  return {
    rent: y1.rentPaid,
    interest: y1.interestPaid,
    runningCosts: y1.runningCosts,
    lodgerIncome: y1.lodgerIncome,
    opportunityCost,
    transactionCostsPerYear,
    buyBeforeGrowth,
    expectedGrowth,
    buyTotal: buyBeforeGrowth - expectedGrowth,
    growthNeeded: p.price > 0 ? ((buyBeforeGrowth - y1.rentPaid) / p.price) * 100 : 0,
    fivePercentRule: (p.price * 5) / 100,
  };
}
