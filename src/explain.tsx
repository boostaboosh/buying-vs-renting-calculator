// Explanations for every figure the page shows: what it is, how it's worked
// out with the user's own numbers, and where the inputs come from.
import type { TipContent } from "./components/Tip";
import { stampDuty, takeHomePay, yearsToSave } from "./lib/finance";
import type { Inputs, LeverageRace, Projection, Summary, UnrecoverableCosts } from "./lib/projection";
import { SDLT_FTB_MAX_PRICE } from "./lib/uk";
import { gbp, pct } from "./format";

export interface Context {
  p: Inputs;
  proj: Projection;
  summary: Summary;
  real: boolean;
  breakeven: number | null;
  y1: UnrecoverableCosts;
  race: LeverageRace;
}

const money = (real: boolean) => (real ? "in today's money (adjusted for inflation)" : "in future pounds (not adjusted for inflation)");

export function explain({ p, proj, summary, real, breakeven, y1, race }: Context) {
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

    raceHome: {
      title: "The home's price gain (leverage)",
      body: (
        <>
          <p>
            What the home's value adds in year one. The growth is on the whole price, though the buyer only put in{" "}
            {gbp(upfront.cashNeeded)} of their own money. The bank's money works for them, at the cost of interest.
          </p>
          <p className="calc">
            {gbp(p.price)} × {pct(p.houseGrowth)} = {gbp(race.rows[0]?.homeGain ?? 0)}
            <br />
            {gbp(race.rows[0]?.homeGain ?? 0)} ÷ {gbp(upfront.cashNeeded)} ={" "}
            {pct(((race.rows[0]?.homeGain ?? 0) / Math.max(1, upfront.cashNeeded)) * 100)} on your own cash
          </p>
          <p>Each later year adds {pct(p.houseGrowth)} of a bigger value, so it compounds too, but slowly.</p>
        </>
      ),
      sources: ["housemetric", "ukhpi"],
    } satisfies TipContent,

    raceCash: {
      title: "The same cash invested instead (compounding)",
      body: (
        <>
          <p>
            What the {gbp(upfront.cashNeeded)} the buyer spent (deposit, stamp duty and fees) would earn in a global
            index fund, with nothing added. A smaller sum, but a higher return, and each year's return earns returns.
          </p>
          <p className="calc">
            {gbp(upfront.cashNeeded)} × {pct(p.stockReturn)} = {gbp(race.rows[0]?.cashGain ?? 0)} in year 1
          </p>
        </>
      ),
      sources: ["giry"],
    } satisfies TipContent,

    raceHomeTotal: {
      title: "Everything the home's value has gained",
      body: (
        <>
          <p className="calc">
            {gbp(p.price)} × ((1 + {pct(p.houseGrowth)})<sup>{p.years}</sup> − 1) ={" "}
            {gbp(race.rows[race.rows.length - 1]?.homeTotal ?? 0)} in pounds at the time
          </p>
          <p>Before selling costs. The buyer also still owes whatever is left of the mortgage.</p>
        </>
      ),
      sources: ["housemetric", "ukhpi"],
    } satisfies TipContent,

    raceCashTotal: {
      title: "Everything the invested cash has gained",
      body: (
        <>
          <p className="calc">
            {gbp(upfront.cashNeeded)} × ((1 + {pct(p.stockReturn)})<sup>{p.years}</sup> − 1) ={" "}
            {gbp(race.rows[race.rows.length - 1]?.cashTotal ?? 0)} in pounds at the time
          </p>
          <p>Before tax, with nothing added after the start.</p>
        </>
      ),
      sources: ["giry"],
    } satisfies TipContent,

    raceCatchUp: {
      title: "When the invested cash catches up in total",
      body: (
        <>
          <p>
            The first year the invested cash has gained as much in total as the home. It always comes later than the
            year it starts gaining more each year, because the home banked bigger gains before that.
          </p>
          <p className="calc">{race.catchUpYear ? `Year ${race.catchUpYear}` : `Not within ${p.years} years`}</p>
        </>
      ),
    } satisfies TipContent,

    raceOvertake: {
      title: "When compounding overtakes leverage",
      body: (
        <>
          <p>
            The first year the invested cash adds more than the home's price rise that year. The faster rate on the
            smaller sum has caught up with the slower rate on the bigger sum, year by year. The totals meet later.
          </p>
          <p className="calc">
            {race.overtakeYear ? `Year ${race.overtakeYear}` : `Not within ${p.years} years`}
          </p>
          <p>
            That's not when renting pulls ahead overall. Interest, rent against owning costs, and paying off the loan
            also matter. The gap chart adds everything up.
          </p>
        </>
      ),
    } satisfies TipContent,

    rentYield: {
      title: "Rent as a share of the home's value",
      body: (
        <>
          <p>
            A year's rent divided by the home's value (the gross rental yield). Over the long run it tends to stay in a
            range, because rents and prices are both tied to what people earn.
          </p>
          <p>
            If rent grows faster than prices year after year, this climbs and renting looks worse and worse. That's a
            big hidden assumption, so it's shown here.
          </p>
        </>
      ),
      sources: ["pipr", "ukhpi"],
    } satisfies TipContent,

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
            The yearly house price growth at which buying and renting finish level after {p.years} years. Faster
            growth favours buying; slower growth favours renting.
          </p>
          <p className="calc">
            {breakeven == null ? "Not between −10% and +20% a year" : `${pct(breakeven, 2)} a year (you assumed ${pct(p.houseGrowth)})`}
          </p>
          <p>
            Rent growth moves with house prices in this test, keeping the gap you set between them (
            {pct(p.rentGrowth - p.houseGrowth)}), because over the long run rents and prices rise and fall together.
          </p>
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

    y1Transaction: {
      title: "Buying and selling costs, spread out",
      body: (
        <>
          <p>
            Stamp duty, buying fees and the cost of selling are paid once but lost for good. Spread over the{" "}
            {Math.max(1, p.years)} years you'd stay, they cost this much a year.
          </p>
          <p className="calc">
            ({gbp(upfront.stampDuty)} + {gbp(upfront.fees)} + {pct(p.sellingCostPct)} × {gbp(p.price)}) ÷{" "}
            {Math.max(1, p.years)} = {gbp(y1.transactionCostsPerYear)}
          </p>
          <p>The shorter you stay, the bigger this gets.</p>
        </>
      ),
      sources: ["sdlt"],
    } satisfies TipContent,

    y1BeforeGrowth: {
      title: "Money gone before any change in the home's value",
      body: (
        <>
          <p className="calc">
            {gbp(y1.interest)} + {gbp(y1.runningCosts)}
            {y1.lodgerIncome > 0 && <> − {gbp(y1.lodgerIncome)}</>} + {gbp(y1.opportunityCost)} +{" "}
            {gbp(y1.transactionCostsPerYear)} = {gbp(y1.buyBeforeGrowth)}
          </p>
          <p>
            This is the figure to compare with rent ({gbp(y1.rent)}) if you think prices won't rise. Paying off the loan
            isn't counted: it's saving.
          </p>
        </>
      ),
      sources: ["monevatorBuy", "monevatorRent"],
    } satisfies TipContent,

    y1BuyTotal: {
      title: "Money gone by owning, year one",
      body: (
        <>
          <p>What owning costs you in year one after the expected change in the home's value.</p>
          <p className="calc">
            {gbp(y1.buyBeforeGrowth)} − {gbp(y1.expectedGrowth)} = {gbp(y1.buyTotal)}
          </p>
          <p>Compare with {gbp(y1.rent)} of rent. Whether the price rises is the big unknown.</p>
        </>
      ),
      sources: ["monevatorBuy", "monevatorRent"],
    } satisfies TipContent,

    growthNeeded: {
      title: "Price growth needed to match renting",
      body: (
        <>
          <p>How much the home's value must rise in year one for owning to cost the same as renting.</p>
          <p className="calc">
            ({gbp(y1.buyBeforeGrowth)} − {gbp(y1.rent)} rent) ÷ {gbp(p.price)} = {pct(y1.growthNeeded, 2)}
          </p>
          <p>
            {y1.growthNeeded <= 0
              ? "Negative means owning is cheaper even if prices fall this much."
              : `You assumed ${pct(p.houseGrowth)}. London flats have roughly matched inflation over 20 years.`}
          </p>
        </>
      ),
      sources: ["housemetric", "ukhpi"],
    } satisfies TipContent,

    fivePercent: {
      title: "The 5% rule of thumb",
      body: (
        <>
          <p>
            Ben Felix (PWL Capital) estimates an owner's yearly unrecoverable costs at about 5% of the home's value:
            1% maintenance, 1% property tax and 3% cost of capital. If a year's rent is less than this, renting is
            likely cheaper.
          </p>
          <p className="calc">
            5% × {gbp(p.price)} = {gbp(y1.fivePercentRule)} vs rent {gbp(y1.rent)}
          </p>
          <p>
            It's a quick check, not a model. It was built for Canada, where the 1% property tax has no UK equivalent
            (council tax is paid by renters too), and it assumes prices rise.
          </p>
        </>
      ),
      sources: ["felix"],
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
            {gbp(proj.monthlyMortgage)} a month for the {p.fixYears}-year fix at {pct(p.mortgageRate, 2)}
            {p.fixYears < p.mortgageTerm && (
              <>
                <br />
                then {gbp(proj.followOnMonthlyMortgage)} a month at {pct(p.followOnRate, 2)}
              </>
            )}
          </p>
          <p>The payment only changes when you remortgage. Rent rises every year.</p>
        </>
      ),
      sources: ["boeRates"],
    } satisfies TipContent,
  };
}

export type Explain = ReturnType<typeof explain>;
