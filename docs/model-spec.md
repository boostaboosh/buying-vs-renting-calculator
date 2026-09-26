# Model specification

This is the contract for the calculator's logic. Tests are written from this
document and from real-world rules (HMRC, GOV.UK, standard mortgage maths), never
from the implementation. When behaviour needs to change, change this document
first, then the tests, then the code.

All money is in pounds. Rates are passed as percentages (`3` means 3%).

## 1. Pure functions: `src/lib/finance.ts`

### `mortgagePayment(principal, ratePct, termYears): number`
Monthly payment on a repayment mortgage using the standard annuity formula with
monthly rate `ratePct / 100 / 12` and `termYears * 12` payments. At 0% the loan is
repaid in equal instalments. Returns 0 when `principal <= 0` or `termYears <= 0`.

### `remainingBalance(principal, ratePct, termYears, monthsPaid): number`
Balance outstanding on that same mortgage after `monthsPaid` payments. Equals
`principal` at 0 months and 0 once `monthsPaid >= termYears * 12`. At 0% it falls
linearly.

### `stampDuty(price, firstTimeBuyer): number`
Stamp Duty Land Tax on a main residence in England, rates from 1 April 2025, no
additional-property surcharge, rounded to the nearest pound.
- Standard bands: 0% up to £125,000; 2% £125,001 to £250,000; 5% £250,001 to
  £925,000; 10% £925,001 to £1.5m; 12% above £1.5m.
- First-time buyer relief: 0% up to £300,000; 5% £300,001 to £500,000. It applies
  only when the price is £500,000 or less. Above that, standard bands apply to the
  whole price.

### `incomeTax(gross)`, `nationalInsurance(gross)`, `takeHomePay(gross)`
Annual employee figures for England, Wales and Northern Ireland, 2025/26 tax year.
- Personal allowance £12,570, reduced by £1 for every £2 of income above £100,000
  (zero at £125,140 and above).
- Income tax: 20% on the first £37,700 of taxable income; 40% up to £125,140 of
  taxable income; 45% above that.
- Employee Class 1 NI: 8% between £12,570 and £50,270; 2% above £50,270.
- `takeHomePay = gross − incomeTax − nationalInsurance` (no pension or student loan).

### `marginalTaxRate(gross): number`
Income tax rate, in whole percent, on the next pound earned: 0, 20, 40, 45, or 60
in the personal allowance taper zone (£100,000 to £125,140).

### `rentARoomTax(annualLodgerIncome, marginalRatePct): number`
Rent-a-Room scheme: the first £7,500 of gross annual receipts is tax-free. Receipts
above that are taxed at the marginal rate (the "alternative method", no expenses).

### `cgtOnGia(value, costBasis, cgtRatePct): number`
Capital gains tax if a general investment account worth `value`, bought for
`costBasis`, were sold in one tax year: `(gain − £3,000 annual exemption) × rate`,
never negative.

### `yearsToSave(target, annualSaving, returnPct, current = 0): number | null`
Years until a pot reaches `target`. The pot starts at `current`. Each month it
grows at `(1 + returnPct/100)^(1/12) − 1` and then receives `annualSaving / 12`.
Returns months/12 for the first month-end at or above the target, 0 if already
there, and null if not reached within 100 years.

## 2. Rent vs buy projection: `src/lib/projection.ts`

### Inputs (`Inputs`, defaults in `DEFAULTS`)
| Field | Default | Meaning |
|---|---|---|
| salary | 90,000 | gross £/yr |
| livingCosts | 13,000 | non-housing spending £/yr |
| wageGrowth | 3 | %/yr growth of the housing + investing budget |
| incomeMultiple | 4.5 | lender's maximum loan as a multiple of salary |
| price | 500,000 | property price |
| deposit | 95,000 | |
| firstTimeBuyer | true | stamp duty relief |
| purchaseFees | 3,000 | legal, survey, arrangement fee |
| mortgageRate | 3 | %, fixed for the whole term |
| mortgageTerm | 30 | years |
| mortgageType | "repayment" | or "interestOnly" |
| serviceCharge | 2,000 | £/yr (service charge, ground rent, insurance) |
| maintenancePct | 0.5 | % of current property value per year |
| lodgerRent | 0 | £/month gross from a lodger |
| sellingCostPct | 2 | % of property value lost when selling |
| rent | 2,000 | £/month |
| stockReturn | 7 | %/yr nominal |
| houseGrowth | 3 | %/yr nominal |
| rentGrowth | 3 | %/yr |
| inflation | 2 | %/yr |
| useIsa | true | if false, all investments are tax-free |
| cgtRate | 24 | % on gains outside the ISA |
| years | 30 | horizon |

### `upfrontCosts(inputs)`
- `loan = max(0, price − deposit)`
- `stampDuty = stampDuty(price, firstTimeBuyer)`
- `fees = purchaseFees`
- `cashNeeded = deposit + stampDuty + fees`
- `maxLoan = salary × incomeMultiple`
- `loanToValue = loan / price × 100`

### `project(inputs)`: the simulation
Two people, a **renter** and a **buyer**, with identical income and spending.
Month-by-month for `years × 12` months. Year `y` runs from 0 to `years − 1`.

**Starting point (completion day).** The renter holds an investment portfolio of
`cashNeeded`, all inside an ISA (it was saved before this point). The buyer has
spent that cash, owns the property worth `price`, owes `loan`, and has an empty
portfolio.

**Annual amounts for year `y`.** These step up once a year, not monthly.
- Budget: `(takeHomePay(salary) − livingCosts) × (1 + wageGrowth)^y`, spread
  evenly over 12 months.
- Rent per month: `rent × (1 + rentGrowth)^y`.
- Lodger income per month: `lodgerRent × (1 + rentGrowth)^y`, minus Rent-a-Room
  tax on 12 × that amount at `marginalTaxRate(salary)`, spread evenly.
- Service charge per month: `serviceCharge × (1 + inflation)^y / 12`.

**Each month, in this order.**
1. Mortgage. Interest = balance × `mortgageRate/100/12`.
   - Repayment: pay the fixed `mortgagePayment(loan, rate, term)` while within
     the term; the balance falls by payment − interest. After the term, nothing
     is paid and the balance is 0.
   - Interest-only: pay the interest only; the balance stays at `loan` for the
     whole projection, even beyond the term.
2. Buyer's housing cost = mortgage paid + service charge + maintenance
   (`current property value × maintenancePct/100/12`) − net lodger income.
3. Cash flows (signed): renter gets `budget − rent`; buyer gets
   `budget − buyer's housing cost`.
   - Positive: first repay any shortfall (see below). The rest goes into the ISA
     up to the remaining allowance for that year (£20,000, reset at the start of
     each projection year), then into a general investment account (GIA). With
     `useIsa = false` everything is treated as tax-free.
   - Negative: sell GIA holdings first (cost basis reduced in proportion), then
     ISA. If both are empty, the unpaid amount accumulates as a shortfall, which
     counts as debt and earns no interest.
4. Both portfolios (ISA and GIA) grow by `(1 + stockReturn/100)^(1/12) − 1`.
5. The property value grows by `(1 + houseGrowth/100)^(1/12) − 1`.

**Rows.** `rows[0]` is completion day and `rows[n]` is the end of year `n`, so
there are `years + 1` rows. Each row has:
- `renterPortfolio` = ISA + GIA − CGT on the GIA (`cgtOnGia`) − shortfall;
  `renterNetWorth` = `renterPortfolio`.
- `propertyValue`, `mortgageBalance`, and
  `equity = propertyValue × (1 − sellingCostPct/100) − mortgageBalance` (can be
  negative).
- `buyerPortfolio`, calculated the same way as the renter's;
  `buyerNetWorth = equity + buyerPortfolio`. The home is exempt from CGT.
- Totals for that year: `rentPaid`, `mortgagePaid`, `interestPaid`,
  `runningCosts` (service charge + maintenance), `lodgerIncome` (net of tax),
  `renterInvested` and `buyerInvested` (the signed net flows), and `budget`. These
  are all 0 on row 0.
- `deflator = (1 + inflation/100)^year`. Divide a nominal amount by it to get
  today's money.

**Other outputs.** `upfront`, `monthlyMortgage` (the repayment payment, or
`loan × rate/12` for interest-only), `takeHome`, `marginalRate`, and
`renterRanDryYear` / `buyerRanDryYear`: the first year (1-based) that ended with
a shortfall, else null. `totals` has lifetime sums of rent, interest, capital
repaid, running costs and net lodger income, plus `purchaseCosts` (stamp duty +
fees) and `sellingCosts` (the final value × `sellingCostPct`).

### `summarise(projection, real = false)`
From the last row: `finalRenter`, `finalBuyer`, and `difference` (buyer − renter).
All are divided by that row's deflator when `real` is true. `crossoverYear` is the
first year ≥ 1 where buyer net worth ≥ renter net worth, else null.

### `breakevenHouseGrowth(inputs)`
The `houseGrowth` at which the nominal `difference` at the horizon is 0, holding
all other inputs fixed. Searches −10% to +20%. Returns null if the difference
doesn't change sign in that range.

### `yearOneCosts(inputs)`
Year-one money that neither person gets back:
- `rent` = the renter's year-one rent.
- `interest`, `runningCosts` and `lodgerIncome` = the buyer's year-one figures
  from the projection.
- `opportunityCost = cashNeeded × stockReturn/100`.
- `expectedGrowth = price × houseGrowth/100`.
- `buyTotal = interest + runningCosts − lodgerIncome + opportunityCost − expectedGrowth`.
