// Explanations for every figure the page shows: what it is, how it's worked
// out with the user's own numbers, and where the inputs come from.
import type { TipContent } from "./components/Tip";
import { stampDuty, takeHomePay, yearsToSave } from "./lib/finance";
import type { Inputs, Projection, Summary, UnrecoverableCosts } from "./lib/projection";
import { SDLT_FTB_MAX_PRICE } from "./lib/uk";
import { gbp, pct } from "./format";

export interface Context {
  p: Inputs;
  proj: Projection;
  summary: Summary;
  real: boolean;
  breakeven: number | null;
  y1: UnrecoverableCosts;
}

const money = (real: boolean) => (real ? "in today's money (adjusted for inflation)" : "in future pounds (not adjusted for inflation)");

export function explain({ p, proj, summary, real, breakeven, y1 }: Context) {
  const { upfront, rows } = proj;
  const last = rows[rows.length - 1];
  const d = real ? last.deflator : 1;
  const each = takeHomePay(p.salary);
  const budget0 = proj.takeHome - p.livingCosts;
  const renterSaving0 = budget0 - p.rent * 12;
  const household = p.earners === 2 ? "both earners" : "you";
  const ftb = p.firstTimeBuyer && p.price <= SDLT_FTB_MAX_PRICE;

  const takeHome: TipContent = {
    title: "Take-home pay",
    body: (
      <>
        <p>
          Pay after income tax and employee National Insurance, for {household}. Pension contributions and student
          loans aren't deducted.
        </p>
        <p className="calc">
          {gbp(p.salary)} gross → {gbp(each)} take-home{p.earners === 2 ? ` × 2 earners = ${gbp(proj.takeHome)}` : ""}
        </p>
        <p>Your marginal income tax rate is {proj.marginalRate}%.</p>
      </>
    ),
    sources: ["incomeTax", "ni"],
  };

  const budget = (year: number): TipContent => {
    const r = rows[year];
    return {
      title: "Money for housing and investing",
      body: (
        <>
          <p>
            What's left of take-home pay after everyday living costs. Both the renter and the buyer have exactly this
            much each year. Housing is paid out of it, and whatever is left over is invested.
          </p>
          <p className="calc">
            Year 1: {gbp(proj.takeHome)} take-home − {gbp(p.livingCosts)} living costs = {gbp(budget0)}
            {year > 1 && (
              <>
                <br />
                Year {year}: {gbp(budget0)} × (1 + {pct(p.wageGrowth)})<sup>{year - 1}</sup> = {gbp(r.budget)}
                {real && <> = {gbp(r.budget / r.deflator)} in today's money</>}
              </>
            )}
          </p>
          <p>It grows each year with pay growth ({pct(p.wageGrowth)}).</p>
        </>
      ),
      sources: ["incomeTax", "ni", "familySpending"],
    };
  };

  const housingCost = (year: number, who: "rent" | "buy"): TipContent => {
    const r = rows[year];
    if (who === "rent")
      return {
        title: `Renter's housing cost, year ${year}`,
        body: (
          <>
            <p>Twelve months of rent. Rent goes up once a year by the rent growth rate.</p>
            <p className="calc">
              {gbp(p.rent)} × (1 + {pct(p.rentGrowth)})<sup>{year - 1}</sup> × 12 = {gbp(r.rentPaid)}
            </p>
          </>
        ),
      };
    return {
      title: `Buyer's housing cost, year ${year}`,
      body: (
        <>
          <p>Everything the owner pays out that year, less any lodger income.</p>
          <p className="calc">
            Mortgage payments {gbp(r.mortgagePaid)}
            <br />+ service charge and maintenance {gbp(r.runningCosts)}
            {r.lodgerIncome > 0 && (
              <>
                <br />− lodger income after tax {gbp(r.lodgerIncome)}
              </>
            )}
            <br />= {gbp(r.mortgagePaid + r.runningCosts - r.lodgerIncome)}
          </p>
          <p>
            The mortgage payment stays the same every year. Of this year's payments, {gbp(r.mortgagePaid - r.interestPaid)}{" "}
            paid off the loan (that's saving) and {gbp(r.interestPaid)} was interest.
          </p>
        </>
      ),
    };
  };

  const invested = (year: number, who: "rent" | "buy"): TipContent => {
    const r = rows[year];
    const cost = who === "rent" ? r.rentPaid : r.mortgagePaid + r.runningCosts - r.lodgerIncome;
    const inv = who === "rent" ? r.renterInvested : r.buyerInvested;
    return {
      title: `${who === "rent" ? "Renter" : "Buyer"} invests, year ${year}`,
      body: (
        <>
          <p className="calc">
            {gbp(r.budget)} for housing and investing − {gbp(cost)} housing = {gbp(inv)}
          </p>
          <p>
            {inv >= 0
              ? `This goes into a global index fund: an ISA first (up to £${(20_000 * p.earners).toLocaleString("en-GB")} a year), then a taxable account.`
              : "Housing costs more than the budget, so investments are sold to cover the gap."}
          </p>
        </>
      ),
      sources: ["isa"],
    };
  };

  return {
    takeHome,
    budget,
    housingCost,
    invested,

    headline: {
      title: `Difference after ${p.years} years`,
      body: (
        <>
          <p>Buyer's net worth minus renter's net worth at the end, {money(real)}.</p>
          <p className="calc">
            {gbp(summary.finalBuyer)} − {gbp(summary.finalRenter)} = {gbp(summary.difference)}
          </p>
          <p>Hover over each net worth to see what it's made of.</p>
        </>
      ),
    } satisfies TipContent,

    buyerNetWorth: {
      title: "Buyer's net worth",
      body: (
        <>
          <p>What the buyer would have if they sold the home and their investments at the end.</p>
          <p className="calc">
            Home value {gbp(last.propertyValue / d)}
            <br />− selling costs ({pct(p.sellingCostPct)}) {gbp((last.propertyValue * p.sellingCostPct) / 100 / d)}
            <br />− mortgage left {gbp(last.mortgageBalance / d)}
            <br />+ investments after tax {gbp(last.buyerPortfolio / d)}
            <br />= {gbp(summary.finalBuyer)}
          </p>
          <p>No capital gains tax is due on your main home.</p>
        </>
      ),
      sources: ["cgt"],
    } satisfies TipContent,

    renterNetWorth: {
      title: "Renter's net worth",
      body: (
        <>
          <p>
            The renter's investments at the end, after capital gains tax on anything held outside an ISA,{" "}
            {money(real)}. They started with the {gbp(upfront.cashNeeded)} the buyer spent on the purchase, then
            invested whatever rent left over each month.
          </p>
          <p className="calc">= {gbp(summary.finalRenter)}</p>
        </>
      ),
      sources: ["isa", "cgt"],
    } satisfies TipContent,

    crossover: {
      title: "When buying pulls ahead",
      body: (
        <>
          <p>
            The first year the buyer's net worth is at least the renter's. On day one the buyer is behind, because stamp
            duty ({gbp(upfront.stampDuty)}), fees ({gbp(upfront.fees)}) and the cost of selling are lost straight away.
          </p>
          <p>{summary.crossoverYear ? `Here that's year ${summary.crossoverYear}.` : `Here it doesn't happen within ${p.years} years.`}</p>
        </>
      ),
    } satisfies TipContent,

    breakeven: {
      title: "Break-even house price growth",
      body: (
        <>
          <p>
            The yearly house price growth at which buying and renting finish level after {p.years} years, with every
            other input unchanged. Faster growth favours buying; slower growth favours renting.
          </p>
          <p className="calc">
            {breakeven == null ? "Not between −10% and +20% a year" : `${pct(breakeven, 2)} a year (you assumed ${pct(p.houseGrowth)})`}
          </p>
          <p>Rent keeps growing at {pct(p.rentGrowth)} in this test, even if house prices fall.</p>
        </>
      ),
      sources: ["ukhpi"],
    } satisfies TipContent,

    y1Rent: {
      title: "Rent in year one",
      body: <p className="calc">{gbp(p.rent)} a month × 12 = {gbp(y1.rent)}</p>,
      sources: ["pipr"],
    } satisfies TipContent,

    y1Interest: {
      title: "Mortgage interest in year one",
      body: (
        <>
          <p>
            Interest on a {gbp(upfront.loan)} loan at {pct(p.mortgageRate, 2)}. This money is gone, like rent. The rest
            of the payment reduces the loan.
          </p>
          <p className="calc">
            about {gbp(upfront.loan)} × {pct(p.mortgageRate, 2)} = {gbp(y1.interest)} (a little less as the loan
            shrinks)
          </p>
        </>
      ),
      sources: ["boeRates"],
    } satisfies TipContent,

    y1Running: {
      title: "Service charge and maintenance, year one",
      body: (
        <p className="calc">
          Service charge {gbp(p.serviceCharge)} + maintenance {pct(p.maintenancePct)} × {gbp(p.price)} ={" "}
          {gbp(y1.runningCosts)}
        </p>
      ),
      sources: ["ehs"],
    } satisfies TipContent,

    y1Lodger: {
      title: "Lodger income after tax",
      body: (
        <p>
          {gbp(p.lodgerRent * 12)} a year from a lodger. The first £7,500 is tax-free under Rent-a-Room; anything above
          is taxed at {proj.marginalRate}%.
        </p>
      ),
      sources: ["rentARoom"],
    } satisfies TipContent,

    y1Opportunity: {
      title: "Lost investment returns",
      body: (
        <>
          <p>
            The buyer spent {gbp(upfront.cashNeeded)} on the deposit, stamp duty and fees. Invested instead, it would
            have earned this much in a year. Monevator calls this the easiest cost of buying to forget.
          </p>
          <p className="calc">
            {gbp(upfront.cashNeeded)} × {pct(p.stockReturn)} = {gbp(y1.opportunityCost)}
          </p>
        </>
      ),
      sources: ["monevatorRent", "giry"],
    } satisfies TipContent,

    y1Growth: {
      title: "Expected rise in the home's value",
      body: (
        <>
          <p>A gain for the buyer, so it's taken off the cost of owning.</p>
          <p className="calc">
            {gbp(p.price)} × {pct(p.houseGrowth)} = {gbp(y1.expectedGrowth)}
          </p>
        </>
      ),
      sources: ["ukhpi"],
    } satisfies TipContent,

    y1BuyTotal: {
      title: "Money gone by owning, year one",
      body: (
        <>
          <p>What owning costs you in year one, counting only money you don't get back.</p>
          <p className="calc">
            {gbp(y1.interest)} + {gbp(y1.runningCosts)}
            {y1.lodgerIncome > 0 && <> − {gbp(y1.lodgerIncome)}</>} + {gbp(y1.opportunityCost)} −{" "}
            {gbp(y1.expectedGrowth)} = {gbp(y1.buyTotal)}
          </p>
          <p>
            Compare with {gbp(y1.rent)} of rent. Paying off the loan isn't a cost; it's saving, so it isn't
            counted here.
          </p>
        </>
      ),
      sources: ["monevatorBuy", "monevatorRent"],
    } satisfies TipContent,

    deposit: {
      title: "Deposit",
      body: (
        <>
          <p>
            The part of the price you pay in cash. The loan is the rest: {gbp(upfront.loan)}, which is{" "}
            {pct(upfront.loanToValue, 0)} of the price (loan-to-value).
          </p>
          <p className="calc">
            Most lenders will lend up to {p.incomeMultiple}× household income: {p.incomeMultiple} ×{" "}
            {gbp(p.salary * p.earners)} = {gbp(upfront.maxLoan)}
          </p>
        </>
      ),
      sources: ["lti"],
    } satisfies TipContent,

    stampDuty: {
      title: ftb ? "Stamp duty (first-time buyer rates)" : "Stamp duty",
      body: (
        <>
          <p>
            {ftb
              ? "First-time buyers pay nothing on the first £300,000 and 5% on the part up to £500,000."
              : p.firstTimeBuyer
                ? "First-time buyer relief is lost above £500,000, so standard rates apply to the whole price: 0% to £125,000, 2% to £250,000, 5% to £925,000."
                : "Standard rates: 0% to £125,000, 2% to £250,000, 5% to £925,000, 10% to £1.5m, 12% above."}
          </p>
          <p className="calc">
            On {gbp(p.price)}: {gbp(upfront.stampDuty)}
            {p.firstTimeBuyer && !ftb && <> (first-time buyer relief would have been {gbp(stampDuty(SDLT_FTB_MAX_PRICE, true))} at £500,000)</>}
          </p>
        </>
      ),
      sources: ["sdlt"],
    } satisfies TipContent,

    fees: {
      title: "Buying fees",
      body: <p>Conveyancing, searches, survey and the mortgage arrangement fee: an estimate of {gbp(p.purchaseFees)}.</p>,
    } satisfies TipContent,

    cashNeeded: {
      title: "Cash needed on completion day",
      body: (
        <p className="calc">
          {gbp(p.deposit)} deposit + {gbp(upfront.stampDuty)} stamp duty + {gbp(upfront.fees)} fees ={" "}
          {gbp(upfront.cashNeeded)}
        </p>
      ),
    } satisfies TipContent,

    savingRate: {
      title: "What you can save while renting",
      body: (
        <p className="calc">
          {gbp(budget0)} for housing and investing − {gbp(p.rent * 12)} rent = {gbp(renterSaving0)} a year
        </p>
      ),
    } satisfies TipContent,

    yearsToSave: {
      title: "Years to save the cash",
      body: (
        <>
          <p>
            Saving {gbp(renterSaving0)} a year, invested at {pct(p.stockReturn)}, starting from nothing. Pay and rent
            growth are ignored here.
          </p>
          <p className="calc">
            {(() => {
              const y = yearsToSave(upfront.cashNeeded, renterSaving0, p.stockReturn);
              return y == null ? "Not reachable" : `${y.toFixed(1)} years to reach ${gbp(upfront.cashNeeded)}`;
            })()}
          </p>
        </>
      ),
    } satisfies TipContent,

    monthlyMortgage: {
      title: "Monthly mortgage payment",
      body: (
        <>
          <p>
            {p.mortgageType === "repayment"
              ? `A repayment mortgage: a fixed payment that clears the ${gbp(upfront.loan)} loan over ${p.mortgageTerm} years.`
              : `Interest-only: you pay just the interest, and still owe the full ${gbp(upfront.loan)} at the end.`}
          </p>
          <p className="calc">
            {gbp(proj.monthlyMortgage)} a month = {gbp(proj.monthlyMortgage * 12)} a year, the same every year
          </p>
          <p>Rent rises over time, but this payment doesn't.</p>
        </>
      ),
      sources: ["boeRates"],
    } satisfies TipContent,
  };
}

export type Explain = ReturnType<typeof explain>;
