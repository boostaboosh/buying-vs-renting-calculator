// UK tax rules used by the calculator. England / Wales / NI rates for the
// 2025/26 tax year (thresholds frozen to April 2028). Scotland has different
// income tax bands and its own property transaction tax, which aren't modelled.

export const PERSONAL_ALLOWANCE = 12_570;
export const PA_TAPER_START = 100_000;
export const BASIC_RATE_LIMIT = 50_270;
export const ADDITIONAL_RATE_START = 125_140;

export const NI_PRIMARY_THRESHOLD = 12_570;
export const NI_UPPER_LIMIT = 50_270;
export const NI_MAIN_RATE = 0.08;
export const NI_UPPER_RATE = 0.02;

export const ISA_ALLOWANCE = 20_000;
export const CGT_ANNUAL_EXEMPTION = 3_000;
export const RENT_A_ROOM_ALLOWANCE = 7_500;

// SDLT on residential property in England from 1 April 2025.
export const SDLT_STANDARD_BANDS: ReadonlyArray<[upTo: number, rate: number]> = [
  [125_000, 0],
  [250_000, 0.02],
  [925_000, 0.05],
  [1_500_000, 0.1],
  [Infinity, 0.12],
];
export const SDLT_FTB_BANDS: ReadonlyArray<[upTo: number, rate: number]> = [
  [300_000, 0],
  [500_000, 0.05],
];
/** First-time buyer relief is lost entirely above this price. */
export const SDLT_FTB_MAX_PRICE = 500_000;
