import { useMemo, useState } from "react";
import { Field, Segmented, Toggle } from "./components/Field";
import { Legend, TwoLineChart, type SeriesPoint } from "./components/Charts";
import { yearsToSave } from "./lib/finance";
import {
  DEFAULTS,
  type Inputs,
  type MortgageType,
  breakevenHouseGrowth,
  project,
  summarise,
  yearOneCosts,
} from "./lib/projection";
import { SDLT_FTB_MAX_PRICE } from "./lib/uk";
import { gbp, gbpShort, pct } from "./format";

const RATES = [2.5, 3, 3.5, 4, 4.5, 5, 6];
const GROWTHS = [0, 1, 2, 3, 4, 5];

export default function App() {
  const [p, setP] = useState<Inputs>(DEFAULTS);
  const [real, setReal] = useState(true);
  const set =
    <K extends keyof Inputs>(k: K) =>
    (v: Inputs[K]) =>
      setP((prev) => ({ ...prev, [k]: v }));

  const proj = useMemo(() => project(p), [p]);
  const summary = useMemo(() => summarise(proj, real), [proj, real]);
  const breakeven = useMemo(() => breakevenHouseGrowth(p), [p]);
  const y1 = useMemo(() => yearOneCosts(p), [p]);
  const grid = useMemo(
    () =>
      RATES.map((rate) =>
        GROWTHS.map((g) => summarise(project({ ...p, mortgageRate: rate, houseGrowth: g }), true).difference),
      ),
    [p],
  );

  const { upfront, rows, totals } = proj;
  const deflate = (n: number, year: number) => (real ? n / rows[year].deflator : n);
  const wealth: SeriesPoint[] = rows.map((r) => ({
    year: r.year,
    buy: deflate(r.buyerNetWorth, r.year),
    rent: deflate(r.renterNetWorth, r.year),
  }));
  const housingCost: SeriesPoint[] = rows.slice(1).map((r) => ({
    year: r.year,
    buy: deflate(r.mortgagePaid + r.runningCosts - r.lodgerIncome, r.year),
    rent: deflate(r.rentPaid, r.year),
  }));

  const budget0 = proj.takeHome - p.livingCosts;
  const renterSaving0 = budget0 - p.rent * 12;
  const saveYears = yearsToSave(upfront.cashNeeded, renterSaving0, p.stockReturn);
  const first = rows[1];
  const lastRow = rows[rows.length - 1];
  const buyWins = summary.difference >= 0;
  const money = real ? "in today's money" : "in future pounds";

  const warnings: string[] = [];
  if (upfront.loan > upfront.maxLoan)
    warnings.push(
      `The loan (${gbp(upfront.loan)}) is more than ${p.incomeMultiple}× your salary (${gbp(upfront.maxLoan)}). Most lenders won't offer this.`,
    );
  if (upfront.loanToValue > 95) warnings.push("A deposit under 5% is rarely mortgageable.");
  if (p.firstTimeBuyer && p.price > SDLT_FTB_MAX_PRICE)
    warnings.push(
      `First-time buyer stamp duty relief only applies up to ${gbp(SDLT_FTB_MAX_PRICE)}. Above that you pay standard rates on the whole price.`,
    );
  if (proj.renterRanDryYear)
    warnings.push(
      `Renting: rent outgrows your budget and the portfolio runs dry in year ${proj.renterRanDryYear}. The shortfall is counted as debt.`,
    );
  if (proj.buyerRanDryYear)
    warnings.push(
      `Buying: housing costs outgrow your budget and the portfolio runs dry in year ${proj.buyerRanDryYear}. The shortfall is counted as debt.`,
    );
  if (p.mortgageType === "interestOnly")
    warnings.push(
      `Interest-only: you still owe the full ${gbp(upfront.loan)} at the end. It's repaid from the sale proceeds in this comparison. Lenders need a credible repayment plan and usually want a bigger deposit.`,
    );

  const milestoneYears = [1, 5, 10, 15, 20, 25, 30, 40, 50].filter((y) => y < p.years).concat(p.years);

  return (
    <div className="page">
      <header className="masthead">
        <p className="eyebrow">UK housing · rent vs buy</p>
        <h1>Rent or buy, over the long run</h1>
        <p className="lede">
          Two people earn the same and spend the same. One buys; the other rents and invests the deposit. Both put
          whatever is left after housing into a global index fund, every month, for {p.years} years. Who ends up
          richer?
        </p>
      </header>

      <div className="layout">
        <aside className="inputs" aria-label="Assumptions">
          <section>
            <h2>You</h2>
            <Field label="Gross salary" unit="£" value={p.salary} onChange={set("salary")} min={20_000} max={250_000} step={1_000}
              hint={<>Take-home {gbp(proj.takeHome)} a year after income tax and NI ({proj.marginalRate}% marginal rate).</>} />
            <Field label="Living costs, excluding housing" unit="£" value={p.livingCosts} onChange={set("livingCosts")} min={0} max={60_000} step={500}
              hint={<>Leaves <strong>{gbp(budget0)}</strong> a year for housing plus investing.</>} />
            <Field label="Pay growth" unit="%" value={p.wageGrowth} onChange={set("wageGrowth")} min={0} max={6} step={0.25} />
          </section>

          <section>
            <h2>Buying</h2>
            <Field label="Property price" unit="£" value={p.price} onChange={set("price")} min={100_000} max={1_500_000} step={5_000} />
            <Field label="Deposit" unit="£" value={p.deposit} onChange={set("deposit")} min={0} max={Math.max(p.price, 100_000)} step={1_000}
              hint={<>Loan {gbp(upfront.loan)} ({pct(upfront.loanToValue, 0)} LTV). Lenders cap it at {p.incomeMultiple}× salary: {gbp(upfront.maxLoan)}.</>} />
            <Field label="Mortgage rate" unit="%" value={p.mortgageRate} onChange={set("mortgageRate")} min={0.5} max={9} step={0.05} />
            <Segmented<MortgageType>
              label="Mortgage type"
              value={p.mortgageType}
              onChange={set("mortgageType")}
              options={[
                { value: "repayment", label: "Repayment" },
                { value: "interestOnly", label: "Interest-only" },
              ]}
            />
            <Field label="Term" unit="yrs" value={p.mortgageTerm} onChange={set("mortgageTerm")} min={5} max={40} step={1}
              hint={<>{gbp(proj.monthlyMortgage)} a month, fixed. It doesn't rise with inflation.</>} />
            <Toggle label="First-time buyer (stamp duty relief)" checked={p.firstTimeBuyer} onChange={set("firstTimeBuyer")} />
            <Field label="Legal, survey & mortgage fees" unit="£" value={p.purchaseFees} onChange={set("purchaseFees")} min={0} max={15_000} step={250} />
            <Field label="Service charge, ground rent & insurance" unit="£" value={p.serviceCharge} onChange={set("serviceCharge")} min={0} max={10_000} step={100}
              hint="Per year. Rises with inflation." />
            <Field label="Maintenance" unit="%" value={p.maintenancePct} onChange={set("maintenancePct")} min={0} max={3} step={0.1}
              hint="Of the property's value per year. About 0.5% for a flat, 1% for a house." />
            <Field label="Lodger income" unit="£" value={p.lodgerRent} onChange={set("lodgerRent")} min={0} max={1_500} step={25}
              hint="Per month, for a spare room. Tax-free up to £7,500 a year (Rent-a-Room)." />
            <Field label="Cost of selling" unit="%" value={p.sellingCostPct} onChange={set("sellingCostPct")} min={0} max={5} step={0.25}
              hint="Estate agent and legal fees, deducted from the buyer's net worth." />
          </section>

          <section>
            <h2>Renting</h2>
            <Field label="Rent" unit="£" value={p.rent} onChange={set("rent")} min={300} max={6_000} step={25}
              hint="Per month. Rises every year with rent growth." />
            <div className="presets" role="group" aria-label="Rent presets">
              <button type="button" onClick={() => set("rent")(2_000)}>Same flat · £2,000</button>
              <button type="button" onClick={() => set("rent")(1_000)}>Room in a flatshare · £1,000</button>
              <button type="button" onClick={() => set("rent")(750)}>Lodger · £750</button>
            </div>
          </section>

          <section>
            <h2>Markets</h2>
            <Field label="Investment return" unit="%" value={p.stockReturn} onChange={set("stockReturn")} min={0} max={12} step={0.25}
              hint="Global index tracker, nominal, after fees." />
            <Field label="House price growth" unit="%" value={p.houseGrowth} onChange={set("houseGrowth")} min={-3} max={8} step={0.25} />
            <Field label="Rent growth" unit="%" value={p.rentGrowth} onChange={set("rentGrowth")} min={0} max={8} step={0.25} />
            <Field label="Inflation" unit="%" value={p.inflation} onChange={set("inflation")} min={0} max={8} step={0.25}
              hint={<>Real investment return: {pct(((1 + p.stockReturn / 100) / (1 + p.inflation / 100) - 1) * 100)}.</>} />
            <Field label="Years to compare" unit="yrs" value={p.years} onChange={set("years")} min={3} max={60} step={1} />
          </section>

          <section>
            <h2>Tax on investments</h2>
            <Toggle label="ISA first, then taxable account" checked={p.useIsa} onChange={set("useIsa")}
              hint="The first £20,000 a year goes into an ISA. Any more goes into a general account, with CGT charged on the gains at the end. Your home is exempt from CGT." />
            <Field label="CGT rate" unit="%" value={p.cgtRate} onChange={set("cgtRate")} min={0} max={24} step={1} />
          </section>

          <button type="button" className="reset" onClick={() => setP(DEFAULTS)}>
            Reset to the example
          </button>
        </aside>

        <main className="results">
          <section className="verdict" aria-live="polite">
            <div className="verdict-top">
              <p className={`pill ${buyWins ? "pill-buy" : "pill-rent"}`}>{buyWins ? "Buying wins" : "Renting wins"}</p>
              <Segmented<"real" | "nominal">
                label="Show amounts"
                value={real ? "real" : "nominal"}
                onChange={(v) => setReal(v === "real")}
                options={[
                  { value: "real", label: "Today's money" },
                  { value: "nominal", label: "Future pounds" },
                ]}
              />
            </div>
            <h2 className="headline">
              After {p.years} years, {buyWins ? "buying" : "renting"} leaves you{" "}
              <span className="num">{gbpShort(Math.abs(summary.difference))}</span> better off{" "}
              <span className="muted">{money}</span>.
            </h2>
            <div className="kpis">
              <div className="kpi">
                <span className="kpi-label"><span className="key key-buy" /> Buyer's net worth</span>
                <span className="kpi-value">{gbpShort(summary.finalBuyer)}</span>
                <span className="kpi-note">Home {gbpShort(deflate(lastRow.equity, p.years))} + investments {gbpShort(deflate(lastRow.buyerPortfolio, p.years))}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label"><span className="key key-rent" /> Renter's net worth</span>
                <span className="kpi-value">{gbpShort(summary.finalRenter)}</span>
                <span className="kpi-note">All investments, after CGT</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Buying pulls ahead</span>
                <span className="kpi-value">{summary.crossoverYear ? `Year ${summary.crossoverYear}` : "Never"}</span>
                <span className="kpi-note">After stamp duty, fees and selling costs</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Break-even house growth</span>
                <span className="kpi-value">{breakeven == null ? "n/a" : pct(breakeven)}</span>
                <span className="kpi-note">
                  {breakeven == null
                    ? "Outside −10% to 20% a year"
                    : `Buying wins if prices grow faster than this a year. You assumed ${pct(p.houseGrowth)}.`}
                </span>
              </div>
            </div>
            {warnings.length > 0 && (
              <ul className="warnings">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Net worth over time</h2>
              <Legend />
            </div>
            <p className="sub">
              Buyer: home value minus mortgage and selling costs, plus investments. Renter: investments. Both after CGT,{" "}
              {money}.
            </p>
            <TwoLineChart
              data={wealth}
              crossover={summary.crossoverYear}
              ariaLabel={`Net worth over ${p.years} years. Buyer ends at ${gbp(summary.finalBuyer)}, renter at ${gbp(summary.finalRenter)}.`}
            />
          </section>

          <section className="card">
            <h2>The sum most people stop at</h2>
            <p className="sub">
              Only part of a mortgage payment is a cost. Paying off capital is saving. Compare rent with the money
              owning <em>loses</em> each year. Year one:
            </p>
            <div className="ledger-pair">
              <table className="ledger">
                <caption><span className="key key-rent" /> Renting</caption>
                <tbody>
                  <tr><th>Rent</th><td>{gbp(y1.rent)}</td></tr>
                  <tr className="total"><th>Money gone</th><td>{gbp(y1.rent)}</td></tr>
                </tbody>
              </table>
              <table className="ledger">
                <caption><span className="key key-buy" /> Owning</caption>
                <tbody>
                  <tr><th>Mortgage interest</th><td>{gbp(y1.interest)}</td></tr>
                  <tr><th>Service charge &amp; maintenance</th><td>{gbp(y1.runningCosts)}</td></tr>
                  {y1.lodgerIncome > 0 && <tr><th>Lodger income, after tax</th><td>−{gbp(y1.lodgerIncome)}</td></tr>}
                  <tr><th>Lost returns on {gbp(upfront.cashNeeded)} upfront cash at {pct(p.stockReturn, 1)}</th><td>{gbp(y1.opportunityCost)}</td></tr>
                  <tr><th>Expected rise in home value at {pct(p.houseGrowth, 1)}</th><td>−{gbp(y1.expectedGrowth)}</td></tr>
                  <tr className="total"><th>Money gone</th><td>{gbp(y1.buyTotal)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="note">
              Also paid once when buying: stamp duty {gbp(upfront.stampDuty)} and fees {gbp(upfront.fees)}. Selling
              costs about {pct(p.sellingCostPct, 1)} of the price. The interest-only payment would be{" "}
              {gbp((upfront.loan * p.mortgageRate) / 100)} a year. A repayment mortgage costs{" "}
              {gbp(proj.monthlyMortgage * 12)} a year in cash, but {gbp(first.mortgagePaid - first.interestPaid)} of
              that year-one amount pays off the loan and stays yours.
            </p>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Housing cost each year</h2>
              <Legend />
            </div>
            <p className="sub">
              Rent rises every year. A fixed-rate mortgage payment doesn't, and it stops once the loan is paid off.
              Owning includes service charge and maintenance, less lodger income. The gap between the lines is what each
              person can invest.
            </p>
            <TwoLineChart
              data={housingCost}
              height={240}
              ariaLabel="Yearly housing cost of renting versus owning"
              footer={(r) => `${r.rent >= r.buy ? "Owning" : "Renting"} is ${gbp(Math.abs(r.rent - r.buy))} cheaper`}
            />
            <table className="flows">
              <thead>
                <tr>
                  <th />
                  <th scope="col"><span className="key key-rent" /> Renter</th>
                  <th scope="col"><span className="key key-buy" /> Buyer</th>
                </tr>
              </thead>
              <tbody>
                {[1, Math.min(10, p.years), p.years].filter((y, i, a) => a.indexOf(y) === i).map((y) => {
                  const r = rows[y];
                  const buyCost = r.mortgagePaid + r.runningCosts - r.lodgerIncome;
                  return (
                    <tr key={y}>
                      <th scope="row">
                        Year {y}
                        <span className="muted"> · budget {gbpShort(deflate(r.budget, y))}</span>
                      </th>
                      <td>
                        {gbpShort(deflate(r.rentPaid, y))} housing
                        <br />
                        <span className={r.renterInvested < 0 ? "neg" : ""}>{gbpShort(deflate(r.renterInvested, y))} invested</span>
                      </td>
                      <td>
                        {gbpShort(deflate(buyCost, y))} housing
                        <br />
                        <span className={r.buyerInvested < 0 ? "neg" : ""}>{gbpShort(deflate(r.buyerInvested, y))} invested</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Getting to completion day</h2>
            <dl className="facts">
              <div><dt>Deposit</dt><dd>{gbp(p.deposit)}</dd></div>
              <div><dt>Stamp duty{p.firstTimeBuyer && p.price <= SDLT_FTB_MAX_PRICE ? " (first-time buyer)" : ""}</dt><dd>{gbp(upfront.stampDuty)}</dd></div>
              <div><dt>Fees</dt><dd>{gbp(upfront.fees)}</dd></div>
              <div className="total"><dt>Cash needed</dt><dd>{gbp(upfront.cashNeeded)}</dd></div>
            </dl>
            <p className="note">
              {renterSaving0 > 0 && saveYears != null ? (
                <>
                  Paying {gbp(p.rent)} a month in rent, you can save {gbp(renterSaving0)} a year. Invested at{" "}
                  {pct(p.stockReturn, 1)}, you'd have this in about <strong>{saveYears.toFixed(1)} years</strong>.{" "}
                </>
              ) : (
                <>At this rent you can't save anything towards a deposit. </>
              )}
              Both people are identical until then, so the comparison starts on completion day. The renter keeps the same{" "}
              {gbp(upfront.cashNeeded)} invested (assumed to be in an ISA).
            </p>
          </section>

          <section className="card">
            <h2>What if the rate or house prices differ?</h2>
            <p className="sub">
              Buyer minus renter after {p.years} years, in today's money, keeping all your other inputs. Blue means
              buying wins; orange means renting wins.
            </p>
            <div className="scroll">
              <table className="grid">
                <thead>
                  <tr>
                    <th scope="col" className="corner">Rate ↓ · growth →</th>
                    {GROWTHS.map((g) => (
                      <th scope="col" key={g}>{pct(g, 0)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RATES.map((rate, i) => (
                    <tr key={rate}>
                      <th scope="row">{pct(rate, 1)}</th>
                      {grid[i].map((d, j) => {
                        const strength = Math.min(1, Math.abs(d) / 750_000);
                        const isYou = rate === p.mortgageRate && GROWTHS[j] === p.houseGrowth;
                        return (
                          <td
                            key={j}
                            className={isYou ? "you" : ""}
                            style={{
                              background: `color-mix(in oklab, var(${d >= 0 ? "--buy" : "--rent"}) ${Math.round(8 + strength * 42)}%, var(--surface))`,
                            }}
                            title={`${pct(rate, 1)} mortgage, ${pct(GROWTHS[j], 0)} house growth`}
                          >
                            <span className="grid-who">{d >= 0 ? "Buy" : "Rent"}</span> +{gbpShort(Math.abs(d))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>Year by year</h2>
            <p className="sub">{real ? "In today's money." : "In future pounds."}</p>
            <div className="scroll">
              <table className="milestones">
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col">Home value</th>
                    <th scope="col">Mortgage left</th>
                    <th scope="col">Buyer's investments</th>
                    <th scope="col">Buyer net worth</th>
                    <th scope="col">Renter net worth</th>
                    <th scope="col">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {milestoneYears.map((y) => {
                    const r = rows[y];
                    const diff = deflate(r.buyerNetWorth - r.renterNetWorth, y);
                    return (
                      <tr key={y}>
                        <th scope="row">{y}</th>
                        <td>{gbp(deflate(r.propertyValue, y))}</td>
                        <td>{gbp(deflate(r.mortgageBalance, y))}</td>
                        <td>{gbp(deflate(r.buyerPortfolio, y))}</td>
                        <td>{gbp(deflate(r.buyerNetWorth, y))}</td>
                        <td>{gbp(deflate(r.renterNetWorth, y))}</td>
                        <td>{diff >= 0 ? "Buy +" : "Rent +"}{gbp(Math.abs(diff))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="note">
              Over {p.years} years in future pounds: rent paid {gbp(totals.rent)}; mortgage interest {gbp(totals.interest)};
              service charge and maintenance {gbp(totals.runningCosts)}; stamp duty and fees {gbp(totals.purchaseCosts)};
              selling costs {gbp(totals.sellingCosts)}.
            </p>
          </section>

          <section className="card prose">
            <h2>How the comparison works</h2>
            <ul>
              <li>
                <strong>Same money, different housing.</strong> Each month both people have the same budget (take-home
                pay minus living costs, rising with pay growth). Whatever housing doesn't use gets invested. If housing
                costs more than the budget, they sell investments to cover it.
              </li>
              <li>
                <strong>The renter keeps the deposit invested.</strong> The buyer's deposit, stamp duty and fees are the
                renter's starting portfolio. Ignoring this lost return is why buying looks so much cheaper in the
                quick sum.
              </li>
              <li>
                <strong>Leverage.</strong> The buyer puts down {gbp(p.deposit)} but gets the growth on a{" "}
                {gbp(p.price)} home: {pct(p.houseGrowth)} of that is {gbp((p.price * p.houseGrowth) / 100)} in year one.
                The renter's {gbp(upfront.cashNeeded)} at {pct(p.stockReturn)} earns{" "}
                {gbp((upfront.cashNeeded * p.stockReturn) / 100)}. The effect shrinks as the loan is paid down and the
                renter's portfolio grows.
              </li>
              <li>
                <strong>Fixed mortgage, rising rent.</strong> The mortgage payment is set on day one and doesn't grow.
                Rent grows at {pct(p.rentGrowth)} a year, so in today's money owning gets cheaper each year and
                renting doesn't. This is the main reason buying tends to win over long periods.
              </li>
              <li>
                <strong>Tax.</strong> Your main home is free of capital gains tax. The renter's investments go into an
                ISA up to £20,000 a year. Anything above that is taxed at {pct(p.cgtRate, 0)} on gains above £3,000 when
                sold. Dividend tax isn't modelled.
              </li>
              <li>
                <strong>Risk isn't in the numbers.</strong> These are steady average returns. Real markets crash. The
                buyer has one leveraged, illiquid asset. The renter has a diversified portfolio that can be de-risked
                bit by bit, but faces rent rises and moves.
              </li>
              <li>
                <strong>Simplifications.</strong> One mortgage rate for the whole term (in reality you remortgage every 2
                to 5 years), no pensions, England/Wales/NI tax rules, stamp duty rates from April 2025.
              </li>
            </ul>
            <h3>Further reading</h3>
            <ul className="sources">
              <li><a href="https://monevator.com/reasons-to-buy-a-house-instead-of-rentin/" target="_blank" rel="noreferrer">Monevator: Reasons to buy a house instead of renting</a></li>
              <li><a href="https://monevator.com/reasons-to-rent-a-house-instead-of-buying/" target="_blank" rel="noreferrer">Monevator: Reasons to rent a house instead of buying</a></li>
              <li><a href="https://monevator.com/a-mortgage-is-money-rented-from-a-bank/" target="_blank" rel="noreferrer">Monevator: What is a mortgage but money rented from a bank?</a></li>
              <li><a href="https://www.gov.uk/stamp-duty-land-tax/residential-property-rates" target="_blank" rel="noreferrer">GOV.UK: Stamp Duty Land Tax rates</a></li>
              <li><a href="https://www.gov.uk/rent-room-in-your-home/the-rent-a-room-scheme" target="_blank" rel="noreferrer">GOV.UK: The Rent a Room Scheme</a></li>
            </ul>
            <p className="note">This is a model, not financial advice.</p>
          </section>
        </main>
      </div>
    </div>
  );
}
