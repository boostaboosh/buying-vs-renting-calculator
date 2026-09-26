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
- **Leverage vs compounding.** The buyer gets house price growth on the whole
  property, not just the deposit: a lower rate on a bigger sum. The same cash
  invested instead gets a higher rate on a smaller sum. Both compound; a chart
  shows each year's gain and the year compounding overtakes.
- **Where each net worth comes from.** Both households invest their spare money
  in the same fund, so after a few years most of both net worths is shares; a
  chart splits each into home equity and shares at milestone years. A test pins
  the simple case (no interest, costs or rent) to the leverage race, so the full
  model provably reduces to the quick sum people do in their heads.
- **Risk and history.** Diversification, leverage on the way down, volatility and
  selling costs, plus a table of outcomes if past returns repeated (London flats
  over 5 and 20 years; world shares this century and since 1900).
- **Consistent growth assumptions.** Rent moves with house prices by default and
  in every what-if, and the page shows rent as a share of the home's value at the
  start and end so a hidden divergence can't tilt the result.
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

## UI tests (screenshots)

`npm run test:ui` opens the page in a real browser (Playwright) and:

- checks behaviour: no errors, each chart opens in the intended view, the home's
  gain compounds, rent rises in the costs chart, tooltips work, no sideways
  scrolling on a phone
- compares screenshots of each section, light and dark, plus a phone view, with
  the reference images in `e2e/__screenshots__`

If a screenshot differs, `npx playwright show-report` shows expected, actual and
the difference. Fix the page, or if the new look is intended, run
`npm run test:ui:update` and commit the new images. GitHub runs the behaviour
checks on every push (pixel comparisons are skipped there because fonts render
differently on other machines) and keeps the screenshots in the run's
`playwright-report` artifact.

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
