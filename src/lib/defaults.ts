// Starting values for the page, each tied to a source or a stated assumption.
// When the statistics are refreshed, update the numbers here, the notes beside
// them, and src/lib/sources.ts together.
import { USER_EXAMPLE, type Inputs } from "./projection";
import type { SourceId } from "./sources";

/**
 * The smallest deposit a lender would accept: enough to cover what the income cap
 * won't lend, and at least `minPct`% of the price. Rounded up to the next £1,000.
 */
export function minimumDeposit(price: number, maxLoan: number, minPct = 10): number {
  const needed = Math.max(price - maxLoan, (price * minPct) / 100, 0);
  // The epsilon stops float noise (29,000.000000000004) rounding an exact £1,000 up.
  // Math.max with 0 also turns a -0 from Math.ceil into a plain 0.
  const rounded = Math.max(0, Math.ceil(needed / 1000 - 1e-9) * 1000);
  return Math.min(price, rounded);
}

/** What each input means, whatever its value. */
export const FIELD_HELP: Record<keyof Inputs, string> = {
  earners:
    "Adults in the household with a salary. Each is taxed separately, and each gets their own £20,000 ISA allowance and £3,000 capital gains allowance.",
  salary: "Gross annual pay before tax, per earner. Used for take-home pay and for how much a lender will offer.",
  livingCosts:
    "Everything the household spends a year apart from rent or mortgage: food, energy, transport, fun. Take-home pay minus this is the money for housing and investing.",
  wageGrowth: "How fast pay, and so the money for housing and investing, rises each year.",
  incomeMultiple: "The most a lender will usually offer, as a multiple of gross household income.",
  price: "The price of the home you'd buy.",
  deposit: "Cash you put down. The rest of the price is borrowed.",
  firstTimeBuyer: "First-time buyers pay less stamp duty on homes up to £500,000.",
  purchaseFees: "One-off costs of buying besides stamp duty: conveyancing, searches, survey and the mortgage arrangement fee.",
  mortgageRate: "The yearly interest rate, assumed fixed for the whole term.",
  mortgageTerm: "Years until the loan is paid off.",
  mortgageType:
    "Repayment pays off the loan by the end of the term. Interest-only keeps payments low but leaves the whole loan to repay.",
  serviceCharge: "Yearly service charge, ground rent and buildings insurance. Mostly for flats. Rises with inflation.",
  maintenancePct: "Repairs and upkeep a year, as a percentage of the home's current value.",
  lodgerRent: "Monthly rent from a lodger in a spare room. Up to £7,500 a year is tax-free under Rent-a-Room.",
  sellingCostPct: "Estate agent, legal and moving costs when you sell, as a percentage of the price.",
  rent: "Monthly rent for the home you'd live in instead of buying. Rises every year with rent growth.",
  stockReturn: "Yearly return on a global index fund, before inflation and after fund fees.",
  houseGrowth: "How fast the home's value rises each year.",
  rentGrowth: "How fast rent rises each year.",
  inflation: "General price rises. Used to show results in today's money and to grow the service charge.",
  useIsa:
    "On: investments go into ISAs first, and anything over the allowance goes into a taxable account. Off: all investments are treated as tax-free.",
  cgtRate: "Capital gains tax on profits outside an ISA: 18% for basic-rate taxpayers, 24% for higher-rate.",
  years: "How far ahead to compare.",
};

export interface Note {
  text: string;
  sources?: SourceId[];
}

export interface RentOption {
  label: string;
  value: number;
  why: string;
  sources?: SourceId[];
}

export interface Preset {
  label: string;
  summary: string;
  inputs: Inputs;
  /** Why each default has the value it has. */
  why: Partial<Record<keyof Inputs, Note>>;
  rentOptions: RentOption[];
}

// Official figures used below (see sources.ts for links and dates).
const LONDON_MEDIAN_PAY = 49_692; // ONS ASHE 2025
const UK_MEDIAN_PAY = 39_039; // ONS ASHE 2025
const LONDON_PRICE = 550_000; // UK HPI, July 2026
const UK_PRICE = 273_000; // UK HPI, July 2026
const LONDON_RENT = 2_332; // ONS PIPR, August 2026
const UK_RENT = 1_400; // ONS PIPR, August 2026
const LONDON_ROOM = 915; // SpareRoom, Q2 2026
const UK_ROOM = 761; // SpareRoom, Q2 2026
const NON_HOUSING_SPEND = 29_026; // ONS Family spending FYE 2025: (£676.60 − £118.40) × 52
const MORTGAGE_RATE = 4.45; // Bank of England, new mortgages, July 2026
const LONDON_FLAT_SERVICE_CHARGE = 1_920; // English Housing Survey 2023-24, London flats median
const INFLATION = 2; // Bank of England target
const PAY_GROWTH = 3.4; // OBR long-run productivity ~1.4% + 2% inflation
const STOCK_RETURN = 7.1; // 5.2% real (UBS yearbook) + 2% inflation − ~0.2% fund fees
const LTI = 4.5; // Bank of England FPC

const shared = {
  incomeMultiple: LTI,
  firstTimeBuyer: true,
  purchaseFees: 3_000,
  mortgageRate: MORTGAGE_RATE,
  mortgageTerm: 30,
  mortgageType: "repayment",
  lodgerRent: 0,
  sellingCostPct: 2,
  stockReturn: STOCK_RETURN,
  houseGrowth: PAY_GROWTH,
  rentGrowth: PAY_GROWTH,
  inflation: INFLATION,
  wageGrowth: PAY_GROWTH,
  livingCosts: NON_HOUSING_SPEND,
  useIsa: true,
  cgtRate: 24,
  years: 30,
} satisfies Partial<Inputs>;

const sharedWhy: Partial<Record<keyof Inputs, Note>> = {
  livingCosts: {
    text: "The average UK household spends £676.60 a week, of which £118.40 is housing, fuel and power. The other £558.20 a week is £29,026 a year. Energy bills are left out of this figure, so it's slightly low.",
    sources: ["familySpending"],
  },
  wageGrowth: {
    text: "Long-run pay growth is roughly productivity growth plus inflation. The OBR's long-term baseline has productivity growing about 1.4% a year, and inflation is 2%, which gives about 3.4%.",
    sources: ["obr", "boeTarget"],
  },
  incomeMultiple: {
    text: "Bank of England rules limit lending at 4.5× income or more to 15% of new mortgages, so 4.5× is the usual ceiling.",
    sources: ["lti"],
  },
  deposit: {
    text: "The smallest deposit a lender would accept: whatever the 4.5× income cap won't lend, and at least 10% of the price, rounded up to £1,000.",
    sources: ["lti"],
  },
  firstTimeBuyer: { text: "Assumes neither of you has owned a home before.", sources: ["sdlt"] },
  purchaseFees: {
    text: "An estimate: conveyancing and searches about £1,500 to £2,000, a survey about £500, and a mortgage arrangement fee about £1,000. There's no official average.",
  },
  mortgageRate: {
    text: "The average rate actually paid on new mortgages in July 2026 was 4.45%. Deals with small deposits usually cost more, and big deposits get less.",
    sources: ["boeRates"],
  },
  mortgageTerm: { text: "A common term. Longer terms lower the monthly payment but add interest. This is an assumption." },
  mortgageType: { text: "Most mortgages for homes you live in are repayment mortgages." },
  lodgerRent: { text: "Off by default. Try it if you'd let a spare room.", sources: ["rentARoom"] },
  sellingCostPct: {
    text: "An estimate: estate agent fees of roughly 1% to 1.5% plus VAT, plus legal fees. There's no official average.",
  },
  stockReturn: {
    text: "World shares returned 5.2% a year above inflation from 1900 to 2024. Add 2% inflation and take off about 0.2% for fund fees: about 7.1%. Returns this century have been lower, at 3.5% above inflation.",
    sources: ["giry"],
  },
  houseGrowth: {
    text: "Over the long run house prices can't keep growing faster than incomes, so this is set to the same 3.4% as pay. Recent growth is weaker: UK prices rose 1.4% and London prices fell 3.3% in the year to July 2026. The break-even figure shows how much this matters.",
    sources: ["ukhpi", "obr"],
  },
  rentGrowth: {
    text: "Set to track pay (3.4%), as rents do over the long run. Rents rose 3.5% in London and 3.8% across the UK in the year to August 2026.",
    sources: ["pipr"],
  },
  inflation: {
    text: "The Bank of England's 2% target. CPI was 3.1% in the year to August 2026.",
    sources: ["boeTarget", "cpi"],
  },
  useIsa: { text: "On, because most people investing for the long term use ISAs first.", sources: ["isa"] },
  cgtRate: {
    text: "24%, because gains would mostly land above the basic-rate band once added to a salary near the median.",
    sources: ["cgt"],
  },
  years: { text: "About the length of a mortgage term." },
};

function preset(
  label: string,
  summary: string,
  inputs: Omit<Inputs, "deposit">,
  why: Partial<Record<keyof Inputs, Note>>,
  rentOptions: RentOption[],
): Preset {
  const deposit = minimumDeposit(inputs.price, inputs.salary * inputs.earners * inputs.incomeMultiple);
  return { label, summary, inputs: { ...inputs, deposit }, why: { ...sharedWhy, ...why }, rentOptions };
}

export const PRESETS = {
  london: preset(
    "London household",
    "Two median London earners, average London home",
    {
      ...shared,
      earners: 2,
      salary: LONDON_MEDIAN_PAY,
      price: LONDON_PRICE,
      rent: LONDON_RENT,
      serviceCharge: LONDON_FLAT_SERVICE_CHARGE,
      maintenancePct: 0.5,
    },
    {
      earners: {
        text: "Two, because the average London home costs 11 times one median salary. On one median salary a lender would offer about £224,000, and the average rent would take most of your take-home pay.",
      },
      salary: { text: "The median full-time salary in London in April 2025.", sources: ["ashe"] },
      price: { text: "The average London house price in July 2026.", sources: ["ukhpi"] },
      rent: { text: "The average London private rent in August 2026.", sources: ["pipr"] },
      serviceCharge: {
        text: "The median service charge for London flats. Most homes Londoners can buy are flats.",
        sources: ["ehs"],
      },
      maintenancePct: {
        text: "0.5% because in a flat the service charge covers most repairs to the building. A common rule of thumb for houses is 1%.",
        sources: ["monevatorRent"],
      },
    },
    [
      { label: "Same home", value: LONDON_RENT, why: "The average London private rent, August 2026.", sources: ["pipr"] },
      {
        label: "Room in a flatshare",
        value: LONDON_ROOM,
        why: "The average room rent in Greater London, Q2 2026. Realistic for one earner.",
        sources: ["spareRoom"],
      },
    ],
  ),
  uk: preset(
    "UK household",
    "Two median UK earners, average UK home",
    {
      ...shared,
      earners: 2,
      salary: UK_MEDIAN_PAY,
      price: UK_PRICE,
      rent: UK_RENT,
      serviceCharge: 0,
      maintenancePct: 1,
    },
    {
      earners: { text: "Two, to match average prices and rents, which are for whole households." },
      salary: { text: "The median full-time salary in the UK in April 2025.", sources: ["ashe"] },
      price: { text: "The average UK house price in July 2026.", sources: ["ukhpi"] },
      rent: { text: "The average UK private rent in August 2026.", sources: ["pipr"] },
      serviceCharge: { text: "Zero, because most homes outside London are freehold houses with no service charge." },
      maintenancePct: {
        text: "1% of the value a year, a common rule of thumb for a house, where you pay for all repairs yourself.",
        sources: ["monevatorRent"],
      },
    },
    [
      { label: "Same home", value: UK_RENT, why: "The average UK private rent, August 2026.", sources: ["pipr"] },
      {
        label: "Room in a flatshare",
        value: UK_ROOM,
        why: "The average UK room rent, Q2 2026. Realistic for one earner.",
        sources: ["spareRoom"],
      },
    ],
  ),
  example: {
    label: "Your example",
    summary: "£90k salary, £500k two-bed flat, £2,000 rent (from our chat)",
    inputs: USER_EXAMPLE,
    why: Object.fromEntries(
      (Object.keys(USER_EXAMPLE) as (keyof Inputs)[]).map((k) => [
        k,
        { text: "From the example you described, with assumptions filling the gaps. Not official data." },
      ]),
    ),
    rentOptions: [
      { label: "Same flat", value: 2_000, why: "The £24,000 a year from your example." },
      { label: "Room in a flatshare", value: LONDON_ROOM, why: "The average room rent in Greater London, Q2 2026.", sources: ["spareRoom"] },
    ],
  },
} satisfies Record<string, Preset>;

export type PresetId = keyof typeof PRESETS;

/** The page's starting values: the London household. */
export const DEFAULTS: Inputs = PRESETS.london.inputs;
