# Rent or buy, over the long run

**Use it:** https://boostaboosh.github.io/buying-vs-renting-calculator/

Share that link with anyone. It's rebuilt and redeployed automatically each time
`main` changes (see `.github/workflows/deploy.yml`).

A UK calculator that answers one question: if two people earn and spend the same,
and one buys a home while the other rents and invests the deposit, who is richer
after 10, 30 or 50 years?

It goes past the usual "rent £24k vs mortgage interest £12k" sum by including:

- **The deposit's lost returns.** The renter keeps the deposit, stamp duty and fees invested.
- **Invest-the-difference, both ways.** Each month both people have the same budget
  (take-home pay minus living costs). Whatever housing doesn't use goes into a global
  index fund. If housing costs more than the budget, investments are sold (signed flows).
- **Fixed mortgage vs rising rent.** The mortgage payment is set on day one; rent,
  service charges and maintenance rise every year.
- **Leverage.** The buyer gets house price growth on the whole property, not just the deposit.
- **UK tax.** Stamp duty (England, from April 2025, with first-time buyer relief),
  income tax and NI for take-home pay, ISA allowance with CGT on anything above it,
  CGT-free main home, Rent-a-Room relief for a lodger.
- **Repayment or interest-only** mortgages, a fixed period then a remortgage onto
  a follow-on rate, and selling costs at the end.
- **Year-one check, Monevator style.** Rent against the money owning loses if
  prices stay flat (interest, running costs, lost returns on the deposit, and
  stamp duty and fees spread over your stay), then the price growth needed to
  break even, and Ben Felix's 5% rule as a sanity check.

**Defaults come from official data**, with three starting points: a London
household (two median London earners, average London home and rent), a UK
household, and the original worked example. Salaries come from ONS ASHE 2025,
prices from the UK House Price Index, rents from ONS private rent statistics,
mortgage rates from the Bank of England, living costs from ONS Family spending,
and investment returns from the UBS Global Investment Returns Yearbook, which
Monevator draws on. Every source is listed on the page and in
[`src/lib/sources.ts`](src/lib/sources.ts). Hover over or tap any underlined
figure or input to see what it is, how it's worked out, and where the number
comes from.

Results: net worth over time (today's money or future pounds), the year buying pulls
ahead, the break-even house price growth, a year-one "money gone" comparison, and a
mortgage-rate × house-growth sensitivity grid.

## Run it

```bash
npm install
npm run dev          # local dev server
npm run test:run     # unit tests (Vitest)
npm run build        # type-check + production build to dist/
npm run build:single # one self-contained HTML file in dist-single/
```

## Working on it: tests first

The calculator's logic is specified in [`docs/model-spec.md`](docs/model-spec.md).
Tests are written from that spec and from real-world rules (HMRC, GOV.UK, standard
mortgage maths), never by copying what the code happens to output.

To change behaviour:

1. Update `docs/model-spec.md`.
2. Write or change a test so it fails for the right reason.
3. Change the code until it passes (`npm test` watches as you edit).

Test files:

- `src/lib/*.contract.test.ts`: written blind from the spec, without reading the implementation.
- `src/lib/*.test.ts`: further examples and regression checks.

If a test disagrees with the code, work out which one matches the spec and the
real-world rule before touching either.

## Code

- `src/lib/uk.ts`: tax thresholds and stamp duty bands
- `src/lib/finance.ts`: mortgage maths, stamp duty, take-home pay, CGT, Rent-a-Room
- `src/lib/projection.ts`: the month-by-month rent vs buy simulation
- `src/lib/defaults.ts`: starting values, with the reason for each
- `src/lib/sources.ts`: the statistics behind them, with links and dates
- `src/explain.tsx`: the hover explanations for every figure
- `src/App.tsx`: the page

## Not modelled (yet)

Remortgaging at different rates, pensions/SIPP, dividend tax, Scottish tax and LBTT,
market volatility, and the other strategies in the original spec (buy then sell,
buy-to-let, retirement glide path).

This is a model, not financial advice.
