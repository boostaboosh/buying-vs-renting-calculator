import {
  ADDITIONAL_RATE_START,
  BASIC_RATE_LIMIT,
  CGT_ANNUAL_EXEMPTION,
  NI_MAIN_RATE,
  NI_PRIMARY_THRESHOLD,
  NI_UPPER_LIMIT,
  NI_UPPER_RATE,
  PA_TAPER_START,
  PERSONAL_ALLOWANCE,
  RENT_A_ROOM_ALLOWANCE,
  SDLT_FTB_BANDS,
  SDLT_FTB_MAX_PRICE,
  SDLT_STANDARD_BANDS,
} from "./uk";

/** Monthly payment on a repayment (capital + interest) mortgage. */
export function mortgagePayment(principal: number, ratePct: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  const n = termYears * 12;
  const r = ratePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Balance left on a repayment mortgage after `monthsPaid` payments. */
export function remainingBalance(
  principal: number,
  ratePct: number,
  termYears: number,
  monthsPaid: number,
): number {
  const n = termYears * 12;
  if (monthsPaid >= n) return 0;
  const r = ratePct / 100 / 12;
  if (r === 0) return principal * (1 - monthsPaid / n);
  const pmt = mortgagePayment(principal, ratePct, termYears);
  const g = Math.pow(1 + r, monthsPaid);
  return principal * g - (pmt * (g - 1)) / r;
}

function banded(amount: number, bands: ReadonlyArray<readonly [number, number]>): number {
  let tax = 0;
  let lower = 0;
  for (const [upTo, rate] of bands) {
    if (amount <= lower) break;
    tax += (Math.min(amount, upTo) - lower) * rate;
    lower = upTo;
  }
  return tax;
}

/** Stamp duty (England) on a main residence, no additional-property surcharge. */
export function stampDuty(price: number, firstTimeBuyer: boolean): number {
  const bands = firstTimeBuyer && price <= SDLT_FTB_MAX_PRICE ? SDLT_FTB_BANDS : SDLT_STANDARD_BANDS;
  // HMRC rounds down to the pound; the small epsilon absorbs float error on exact amounts.
  return Math.floor(banded(price, bands) + 1e-6);
}

function personalAllowance(gross: number): number {
  // £1 off for every whole £2 over the threshold.
  const taper = Math.max(0, Math.floor((gross - PA_TAPER_START) / 2));
  return Math.max(0, PERSONAL_ALLOWANCE - taper);
}

export function incomeTax(gross: number): number {
  const pa = personalAllowance(gross);
  const taxable = Math.max(0, gross - pa);
  const basicBand = BASIC_RATE_LIMIT - PERSONAL_ALLOWANCE; // 37,700
  const higherTop = ADDITIONAL_RATE_START - pa;
  const basic = Math.min(taxable, basicBand);
  const higher = Math.max(0, Math.min(taxable, higherTop) - basicBand);
  const additional = Math.max(0, taxable - Math.max(basicBand, higherTop));
  return basic * 0.2 + higher * 0.4 + additional * 0.45;
}

export function nationalInsurance(gross: number): number {
  const main = Math.max(0, Math.min(gross, NI_UPPER_LIMIT) - NI_PRIMARY_THRESHOLD);
  const upper = Math.max(0, gross - NI_UPPER_LIMIT);
  return main * NI_MAIN_RATE + upper * NI_UPPER_RATE;
}

/** Annual take-home pay after income tax and employee NI (no pension or student loan). */
export function takeHomePay(gross: number): number {
  return gross - incomeTax(gross) - nationalInsurance(gross);
}

/** Marginal income tax rate (%) on the next pound, including the 60% taper zone. */
export function marginalTaxRate(gross: number): number {
  // Tax on an extra £100, which is the rate in percent.
  return Math.round(incomeTax(gross + 100) - incomeTax(gross));
}

/** Tax on lodger income under Rent-a-Room: only receipts above £7,500 are taxed. */
export function rentARoomTax(annualLodgerIncome: number, marginalRatePct: number): number {
  return Math.max(0, annualLodgerIncome - RENT_A_ROOM_ALLOWANCE) * (marginalRatePct / 100);
}

/** CGT due if a general (non-ISA) investment account shared by `people` adults were sold today. */
export function cgtOnGia(value: number, costBasis: number, cgtRatePct: number, people = 1): number {
  const gain = value - costBasis - CGT_ANNUAL_EXEMPTION * people;
  return gain > 0 ? gain * (cgtRatePct / 100) : 0;
}

/** A return above inflation converted to a nominal one, in %. */
export function nominalRate(realPct: number, inflationPct: number): number {
  return ((1 + realPct / 100) * (1 + inflationPct / 100) - 1) * 100;
}

/**
 * Years needed to save `target`, contributing `annualSaving` monthly into a pot
 * growing at `returnPct`, starting from `current`. Returns null if never reached.
 */
export function yearsToSave(
  target: number,
  annualSaving: number,
  returnPct: number,
  current = 0,
): number | null {
  if (current >= target) return 0;
  const r = Math.pow(1 + returnPct / 100, 1 / 12) - 1;
  const monthly = annualSaving / 12;
  let pot = current;
  for (let m = 1; m <= 12 * 100; m++) {
    pot = pot * (1 + r) + monthly;
    if (pot >= target) return m / 12;
  }
  return null;
}
