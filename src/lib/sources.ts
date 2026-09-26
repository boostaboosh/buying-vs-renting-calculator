// Where every default and tax figure comes from. Figures were checked in
// September 2026; update `checked` and the numbers together when refreshing.

export interface Source {
  publisher: string;
  title: string;
  url: string;
  /** The figures this calculator takes from it. */
  figures: string;
}

export const SOURCES = {
  ashe: {
    publisher: "ONS",
    title: "Employee earnings in the UK: 2025 (Annual Survey of Hours and Earnings)",
    url: "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/bulletins/annualsurveyofhoursandearnings/2025",
    figures:
      "Median gross annual pay for full-time employees, April 2025: £49,692 in London, £39,039 across the UK.",
  },
  pipr: {
    publisher: "ONS",
    title: "Private rent and house prices, UK: September 2026",
    url: "https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/privaterentandhousepricesuk/september2026",
    figures:
      "Average private rent, August 2026: £2,332 a month in London (up 3.5% in a year), £1,400 across the UK (up 3.8%).",
  },
  ukhpi: {
    publisher: "HM Land Registry and ONS",
    title: "UK House Price Index: July 2026",
    url: "https://www.gov.uk/government/statistics/uk-house-price-index-for-july-2026/uk-house-price-index-summary-july-2026",
    figures:
      "Average house price, July 2026: £550,000 in London (down 3.3% in a year), £273,000 across the UK (up 1.4%).",
  },
  boeRates: {
    publisher: "Bank of England",
    title: "Money and Credit: July 2026",
    url: "https://www.bankofengland.co.uk/statistics/money-and-credit/2026/july-2026",
    figures: "Effective interest rate on newly drawn mortgages: 4.45% in July 2026 (4.35% in June).",
  },
  boeTarget: {
    publisher: "Bank of England",
    title: "Monetary policy: the 2% inflation target",
    url: "https://www.bankofengland.co.uk/monetary-policy/inflation",
    figures: "The government's inflation target is 2% CPI. CPI was 3.1% in the year to August 2026 (ONS).",
  },
  cpi: {
    publisher: "ONS",
    title: "Consumer price inflation, UK: August 2026",
    url: "https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/consumerpriceinflation/august2026",
    figures: "CPI rose 3.1% in the 12 months to August 2026.",
  },
  obr: {
    publisher: "Office for Budget Responsibility",
    title: "Fiscal risks and sustainability",
    url: "https://obr.uk/frs/fiscal-risks-and-sustainability-july-2026/",
    figures:
      "Long-term baseline productivity growth of about 1.4% a year. With 2% inflation that means nominal pay growth of about 3.4% a year.",
  },
  giry: {
    publisher: "UBS / Dimson, Marsh and Staunton",
    title: "Global Investment Returns Yearbook 2025",
    url: "https://www.jbs.cam.ac.uk/2025/report-stocks-have-far-outperformed-over-the-past-125-years/",
    figures:
      "World equities returned 5.2% a year above inflation from 1900 to 2024. This is the long-run data Monevator uses for expected returns.",
  },
  ehs: {
    publisher: "Ministry of Housing, Communities and Local Government",
    title: "English Housing Survey 2023 to 2024: leasehold experience",
    url: "https://www.gov.uk/government/statistics/english-housing-survey-2023-to-2024-leasehold-experience-fact-sheet/english-housing-survey-2023-to-2024-leasehold-experience-fact-sheet",
    figures:
      "Leaseholders in flats paid a mean service charge of £1,857 a year (median £1,500). The London median for flats was £1,920.",
  },
  familySpending: {
    publisher: "ONS",
    title: "Family spending in the UK: April 2024 to March 2025",
    url: "https://www.ons.gov.uk/peoplepopulationandcommunity/personalandhouseholdfinances/expenditure/bulletins/familyspendingintheuk/april2024tomarch2025",
    figures:
      "Average household spending was £676.60 a week, of which £118.40 went on housing (net), fuel and power. That leaves £558.20 a week, or £29,026 a year, for everything else.",
  },
  spareRoom: {
    publisher: "SpareRoom",
    title: "Rental index, Q2 2026",
    url: "https://www.spareroom.co.uk/content/info-landlords/rentalindex/",
    figures: "Average room rent in a flatshare: £915 a month in Greater London, £761 across the UK.",
  },
  lti: {
    publisher: "Bank of England Financial Policy Committee / FCA",
    title: "The FPC's mortgage market recommendations",
    url: "https://www.fca.org.uk/firms/fpcs-mortgage-market-recommendation",
    figures:
      "Lenders can make at most 15% of new mortgages at 4.5 times income or more, so 4.5× is the usual ceiling.",
  },
  incomeTax: {
    publisher: "GOV.UK",
    title: "Income Tax rates and Personal Allowances",
    url: "https://www.gov.uk/income-tax-rates",
    figures:
      "£12,570 personal allowance, 20% to £50,270, 40% to £125,140, 45% above. The allowance tapers away above £100,000.",
  },
  ni: {
    publisher: "GOV.UK",
    title: "National Insurance rates and categories",
    url: "https://www.gov.uk/national-insurance-rates-letters",
    figures: "Employees pay 8% between £12,570 and £50,270 and 2% above.",
  },
  sdlt: {
    publisher: "GOV.UK",
    title: "Stamp Duty Land Tax: residential property rates",
    url: "https://www.gov.uk/stamp-duty-land-tax/residential-property-rates",
    figures:
      "Standard bands 0% / 2% / 5% / 10% / 12%. First-time buyers pay 0% to £300,000 and 5% to £500,000, with no relief above £500,000.",
  },
  isa: {
    publisher: "GOV.UK",
    title: "Individual Savings Accounts (ISAs)",
    url: "https://www.gov.uk/individual-savings-accounts",
    figures: "£20,000 a year per adult, tax-free.",
  },
  cgt: {
    publisher: "GOV.UK",
    title: "Capital Gains Tax: what you pay it on, rates and allowances",
    url: "https://www.gov.uk/capital-gains-tax/allowances",
    figures: "£3,000 tax-free allowance per person. 18% or 24% on shares. Your main home is exempt.",
  },
  rentARoom: {
    publisher: "GOV.UK",
    title: "Rent a room in your home",
    url: "https://www.gov.uk/rent-room-in-your-home/the-rent-a-room-scheme",
    figures: "Up to £7,500 a year from a lodger is tax-free (halved if you share the income).",
  },
  monevatorBuy: {
    publisher: "Monevator",
    title: "Reasons to buy a house instead of renting",
    url: "https://monevator.com/reasons-to-buy-a-house-instead-of-rentin/",
    figures: "Compare rent with mortgage interest, not the whole mortgage payment.",
  },
  monevatorRent: {
    publisher: "Monevator",
    title: "Reasons to rent a house instead of buying",
    url: "https://monevator.com/reasons-to-rent-a-house-instead-of-buying/",
    figures: "Include maintenance, insurance and the lost returns on your deposit.",
  },
} satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;
