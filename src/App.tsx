import { useMemo, useState } from "react";
import { Field, Segmented, Toggle } from "./components/Field";
import { GapChart, Legend, TwoLineChart, type GapPoint, type SeriesPoint } from "./components/Charts";
import { Tip, type TipContent } from "./components/Tip";
import { nominalRate, yearsToSave } from "./lib/finance";
import {
  type Inputs,
  type MortgageType,
  breakevenHouseGrowth,
  leverageRace,
  project,
  summarise,
  yearOneCosts,
} from "./lib/projection";
import { FIELD_HELP, PRESETS, type Preset, type PresetId } from "./lib/defaults";
import { SOURCES, type SourceId } from "./lib/sources";
import { SDLT_FTB_MAX_PRICE } from "./lib/uk";
import { explain } from "./explain";
import { gbp, gbpShort, pct } from "./format";

const RATES = [3, 3.5, 4, 4.5, 5, 5.5, 6];
const GROWTHS = [0, 1, 2, 3, 4, 5];
const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

interface Scenario {
  label: string;
  /** Yearly growth above inflation, %. */
  real: number;
  why: string;
  sources: SourceId[];
}
const HOUSE_SCENARIOS: Scenario[] = [
  {
    label: "London flats' last 5 years",
    real: -4.9,
    why: "London flats fell 4.9% a year after inflation over the last 5 years (Land Registry data via Housemetric). This row assumes that carries on.",
    sources: ["housemetric"],
  },
  {
    label: "London flats' last 20 years",
    real: 0.1,
    why: "London flats rose 0.1% a year after inflation over 20 years: about flat in real terms (Land Registry data via Housemetric).",
    sources: ["housemetric"],
  },
  {
    label: "Prices keep up with pay",
    real: 1.4,
    why: "Prices rise with pay, about 1.4% a year above inflation, the OBR's long-run productivity growth.",
    sources: ["obr"],
  },
];
const STOCK_SCENARIOS: Scenario[] = [
  {
    label: "World shares this century",
    real: 3.5,
    why: "World shares returned 3.5% a year after inflation from 2000 to 2024 (UBS Global Investment Returns Yearbook). About 0.2% is taken off for fund fees.",
    sources: ["giry"],
  },
  {
    label: "World shares since 1900",
    real: 5.2,
    why: "World shares returned 5.2% a year after inflation from 1900 to 2024 (UBS Global Investment Returns Yearbook). About 0.2% is taken off for fund fees.",
    sources: ["giry"],
  },
];
const FUND_FEES = 0.2;

function formatInput(k: keyof Inputs, v: Inputs[keyof Inputs]): string {
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "string") return v === "repayment" ? "repayment" : "interest-only";
  if (["salary", "livingCosts", "price", "deposit", "purchaseFees", "serviceCharge", "lodgerRent", "rent"].includes(k))
    return gbp(v);
  if (k === "earners" || k === "years" || k === "mortgageTerm") return String(v);
  if (k === "incomeMultiple") return `${v}×`;
  return pct(v, 2).replace(/\.?0+%$/, "%");
}

/**
 * Per-chart choice of units. Charts of yearly amounts default to pounds at the
 * time, because that's what shows rent rising and a fixed mortgage staying put.
 */
function MoneySwitch({ real, onChange }: { real: boolean; onChange: (real: boolean) => void }) {
  return (
    <Segmented<"nominal" | "real">
      label="Show this chart"
      value={real ? "real" : "nominal"}
      onChange={(v) => onChange(v === "real")}
      options={[
        { value: "nominal", label: "Pounds at the time" },
        { value: "real", label: "Today's money" },
      ]}
    />
  );
}

export default function App() {
  const [presetId, setPresetId] = useState<PresetId>("london");
  const preset: Preset = PRESETS[presetId];
  const [p, setP] = useState<Inputs>(preset.inputs);
  const [real, setReal] = useState(true);
  const [view, setView] = useState<"gap" | "both">("gap");
  // The race defaults to pounds at the time, so the home's compounding is visible even when it only matches inflation.
  const [raceReal, setRaceReal] = useState(false);
  const [costReal, setCostReal] = useState(false);
  const set =
    <K extends keyof Inputs>(k: K) =>
    (v: Inputs[K]) =>
      setP((prev) => ({ ...prev, [k]: v }));
  const choosePreset = (id: PresetId) => {
    setPresetId(id);
    setP(PRESETS[id].inputs);
  };

  const proj = useMemo(() => project(p), [p]);
  const summary = useMemo(() => summarise(proj, real), [proj, real]);
  const breakeven = useMemo(() => breakevenHouseGrowth(p), [p]);
  const y1 = useMemo(() => yearOneCosts(p), [p]);
  const grid = useMemo(
    () =>
      RATES.map((rate) =>
        GROWTHS.map(
          (g) =>
            // Rent moves with house prices, keeping the gap you set, as in the break-even figure.
            summarise(
              project({ ...p, mortgageRate: rate, followOnRate: rate, houseGrowth: g, rentGrowth: p.rentGrowth + (g - p.houseGrowth) }),
              true,
            ).difference,
        ),
      ),
    [p],
  );
  const race = useMemo(() => leverageRace(p), [p]);
  const scenarios = useMemo(
    () =>
      HOUSE_SCENARIOS.map((h) =>
        STOCK_SCENARIOS.map((sc) => {
          const houseGrowth = nominalRate(h.real, p.inflation);
          const stockReturn = nominalRate(sc.real, p.inflation) - FUND_FEES;
          const rentGrowth = p.rentGrowth + (houseGrowth - p.houseGrowth);
          return summarise(project({ ...p, houseGrowth, rentGrowth, stockReturn }), true).difference;
        }),
      ),
    [p],
  );
  const ex = explain({ p, proj, summary, real, breakeven, y1, race });

  /** The explanation for an input: what it is, its default here, and why. */
  const fieldTip = (k: keyof Inputs, title: string): TipContent => {
    const why = preset.why[k];
    return {
      title,
      body: (
        <>
          <p>{FIELD_HELP[k]}</p>
          <p>
            <strong>Default: {formatInput(k, preset.inputs[k])}.</strong> {why?.text ?? ""}
          </p>
        </>
      ),
      sources: why?.sources,
    };
  };
  const F = <K extends keyof Inputs>(k: K, label: string) => ({
    label,
    value: p[k] as number,
    onChange: set(k) as (v: number) => void,
    tip: fieldTip(k, label),
  });

  const { upfront, rows, totals } = proj;
  const deflate = (n: number, year: number) => (real ? n / rows[year].deflator : n);
  const wealth: SeriesPoint[] = rows.map((r) => ({
    year: r.year,
    buy: deflate(r.buyerNetWorth, r.year),
    rent: deflate(r.renterNetWorth, r.year),
  }));
  const gapData: GapPoint[] = rows.map((r) => ({ year: r.year, gap: deflate(r.buyerNetWorth - r.renterNetWorth, r.year) }));
  const raceDeflate = (n: number, year: number) => (raceReal ? n / rows[year].deflator : n);
  const raceData: SeriesPoint[] = race.rows.map((r) => ({
    year: r.year,
    buy: raceDeflate(r.homeGain, r.year),
    rent: raceDeflate(r.cashGain, r.year),
  }));
  const raceFirst = race.rows[0];
  const raceLast = race.rows[race.rows.length - 1];
  const raceMoney = raceReal ? "in today's money" : "in pounds at the time (not adjusted for inflation)";
  const raceNames = { buy: "Home's price gain", rent: "Same cash invested instead" };
  const costDeflate = (n: number, year: number) => (costReal ? n / rows[year].deflator : n);
  const housingCost: SeriesPoint[] = rows.slice(1).map((r) => ({
    year: r.year,
    buy: costDeflate(r.mortgagePaid + r.runningCosts - r.lodgerIncome, r.year),
    rent: costDeflate(r.rentPaid, r.year),
  }));

  const budget0 = proj.takeHome - p.livingCosts;
  const renterSaving0 = budget0 - p.rent * 12;
  const saveYears = yearsToSave(upfront.cashNeeded, renterSaving0, p.stockReturn);
  const first = rows[1];
  const lastRow = rows[rows.length - 1];
  const buyWins = summary.difference >= 0;
  const money = real ? "in today's money" : "in future pounds";
  const ftb = p.firstTimeBuyer && p.price <= SDLT_FTB_MAX_PRICE;

  const warnings: string[] = [];
  if (upfront.loan > upfront.maxLoan)
    warnings.push(
      `The loan (${gbp(upfront.loan)}) is more than ${p.incomeMultiple}× household income (${gbp(upfront.maxLoan)}). Most lenders won't offer this. Raise the deposit to at least ${gbp(p.price - upfront.maxLoan)}.`,
    );
  if (upfront.loanToValue > 95) warnings.push("A deposit under 5% is rarely mortgageable.");
  if (p.firstTimeBuyer && p.price > SDLT_FTB_MAX_PRICE)
    warnings.push(
      `First-time buyer stamp duty relief only applies up to ${gbp(SDLT_FTB_MAX_PRICE)}. Above that you pay standard rates on the whole price.`,
    );
  if (renterSaving0 < 0)
    warnings.push(
      `Rent (${gbp(p.rent * 12)} a year) is more than the ${gbp(budget0)} left after living costs, so the renter has to sell investments from day one.`,
    );
  if (proj.renterRanDryYear)
    warnings.push(
      `Renting: the renter's investments run out in year ${proj.renterRanDryYear}. The shortfall after that is counted as debt.`,
    );
  if (proj.buyerRanDryYear)
    warnings.push(
      `Buying: the buyer's investments run out in year ${proj.buyerRanDryYear}. The shortfall after that is counted as debt.`,
    );
  if (p.mortgageType === "interestOnly")
    warnings.push(
      `Interest-only: you still owe the full ${gbp(upfront.loan)} at the end. It's repaid from the sale in this comparison. Lenders want a credible repayment plan.`,
    );

  const milestoneYears = [1, 5, 10, 15, 20, 25, 30, 40, 50].filter((y) => y < p.years).concat(p.years);
  const flowYears = [1, Math.min(10, p.years), p.years].filter((y, i, a) => a.indexOf(y) === i);
  const usedSources = Object.keys(SOURCES) as SourceId[];

  return (
    <div className="page">
      <header className="masthead">
        <p className="eyebrow">UK housing · rent vs buy</p>
        <h1>Rent or buy, over the long run</h1>
        <p className="lede">
          Two households earn the same and spend the same. One buys; the other rents and invests the deposit. Each
          month both put whatever is left after housing into a global index fund, for {p.years} years. Who ends up
          richer? Hover over or tap any underlined figure to see what it is and where it comes from.
        </p>
      </header>

      <div className="layout">
        <aside className="inputs" id="inputs" aria-label="Assumptions">
          <section>
            <h2>Starting point</h2>
            <div className="presets presets-stack" role="radiogroup" aria-label="Starting point">
              {PRESET_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={presetId === id}
                  className={presetId === id ? "on" : ""}
                  onClick={() => choosePreset(id)}
                >
                  <strong>{PRESETS[id].label}</strong>
                  <span>{PRESETS[id].summary}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>Household</h2>
            <Segmented<"1" | "2">
              label="Earners"
              tip={fieldTip("earners", "Earners")}
              value={String(p.earners) as "1" | "2"}
              onChange={(v) => set("earners")(Number(v))}
              options={[
                { value: "1", label: "One" },
                { value: "2", label: "Two" },
              ]}
            />
            <Field {...F("salary", p.earners === 2 ? "Gross salary, each" : "Gross salary")} unit="£" min={15_000} max={250_000} step={500}
              hint={<>Take-home <Tip tip={ex.takeHome}>{gbp(proj.takeHome)}</Tip> a year{p.earners === 2 ? " for both" : ""}.</>} />
            <Field {...F("livingCosts", "Living costs, excluding housing")} unit="£" min={0} max={80_000} step={500}
              hint={<>Leaves <Tip tip={ex.budget(1)}><strong>{gbp(budget0)}</strong></Tip> a year for housing and investing.</>} />
            <Field {...F("wageGrowth", "Pay growth")} unit="%" min={0} max={8} step={0.1} />
          </section>

          <section>
            <h2>Buying</h2>
            <Field {...F("price", "Property price")} unit="£" min={100_000} max={1_500_000} step={5_000} />
            <Field {...F("deposit", "Deposit")} unit="£" min={0} max={Math.max(p.price, 100_000)} step={1_000}
              hint={<>Loan <Tip tip={ex.deposit}>{gbp(upfront.loan)} ({pct(upfront.loanToValue, 0)} of the price)</Tip>. Lenders' cap: <Tip tip={ex.deposit}>{gbp(upfront.maxLoan)}</Tip>.</>} />
            <Field {...F("mortgageRate", "Mortgage rate")} unit="%" min={0.5} max={9} step={0.05} />
            <Field {...F("fixYears", "Fixed for")} unit="yrs" min={1} max={40} step={1} />
            <Field {...F("followOnRate", "Rate after the fix")} unit="%" min={0.5} max={10} step={0.05}
              hint={p.fixYears < p.mortgageTerm ? <>Payment then: <Tip tip={ex.monthlyMortgage}>{gbp(proj.followOnMonthlyMortgage)} a month</Tip>.</> : "The fix lasts the whole term."} />
            <Segmented<MortgageType>
              label="Mortgage type"
              tip={fieldTip("mortgageType", "Mortgage type")}
              value={p.mortgageType}
              onChange={set("mortgageType")}
              options={[
                { value: "repayment", label: "Repayment" },
                { value: "interestOnly", label: "Interest-only" },
              ]}
            />
            <Field {...F("mortgageTerm", "Term")} unit="yrs" min={5} max={40} step={1}
              hint={<><Tip tip={ex.monthlyMortgage}>{gbp(proj.monthlyMortgage)} a month</Tip> during the fix.</>} />
            <Toggle label="First-time buyer" tip={fieldTip("firstTimeBuyer", "First-time buyer")} checked={p.firstTimeBuyer} onChange={set("firstTimeBuyer")}
              hint={<>Stamp duty: <Tip tip={ex.stampDuty}>{gbp(upfront.stampDuty)}</Tip>{p.firstTimeBuyer && !ftb ? " (no relief above £500,000)" : ""}.</>} />
            <Field {...F("purchaseFees", "Legal, survey & mortgage fees")} unit="£" min={0} max={15_000} step={250} />
            <Field {...F("serviceCharge", "Service charge, ground rent & insurance")} unit="£" min={0} max={10_000} step={20} />
            <Field {...F("maintenancePct", "Maintenance")} unit="%" min={0} max={3} step={0.1} />
            <Field {...F("lodgerRent", "Lodger income")} unit="£" min={0} max={1_500} step={25} />
            <Field {...F("sellingCostPct", "Cost of selling")} unit="%" min={0} max={5} step={0.25} />
          </section>

          <section>
            <h2>Renting</h2>
            <Field {...F("rent", "Rent per month")} unit="£" min={300} max={6_000} step={1} />
            <div className="presets" role="group" aria-label="Rent examples">
              {preset.rentOptions.map((o) => (
                <Tip key={o.label} tip={{ title: o.label, body: <p>{o.why}</p>, sources: o.sources }} className="chip-tip">
                  <span className="chip" onClick={() => set("rent")(o.value)}>
                    {o.label} · {gbp(o.value)}
                  </span>
                </Tip>
              ))}
            </div>
          </section>

          <section>
            <h2>Markets</h2>
            <Field {...F("stockReturn", "Investment return")} unit="%" min={0} max={12} step={0.1}
              hint={<>After inflation: {pct(((1 + p.stockReturn / 100) / (1 + p.inflation / 100) - 1) * 100)}.</>} />
            <Field {...F("houseGrowth", "House price growth")} unit="%" min={-3} max={8} step={0.1} />
            <Field {...F("rentGrowth", "Rent growth")} unit="%" min={0} max={8} step={0.1} />
            <Field {...F("inflation", "Inflation")} unit="%" min={0} max={8} step={0.1} />
            <Field {...F("years", "Years to compare")} unit="yrs" min={3} max={60} step={1} />
          </section>

          <section>
            <h2>Tax on investments</h2>
            <Toggle label="ISA first, then taxable account" tip={fieldTip("useIsa", "ISA first, then taxable account")} checked={p.useIsa} onChange={set("useIsa")} />
            <Field {...F("cgtRate", "Capital gains tax rate")} unit="%" min={0} max={24} step={1} />
            <Field {...F("incomeMultiple", "Lender's income multiple")} unit="×" min={3} max={6} step={0.1} />
          </section>

          <button type="button" className="reset" onClick={() => setP(preset.inputs)}>
            Reset to “{preset.label}”
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
              <Tip tip={ex.headline} className="num">{gbpShort(Math.abs(summary.difference))}</Tip> better off{" "}
              <span className="muted">{money}</span>.
            </h2>
            <a className="jump" href="#inputs">Change the assumptions ↓</a>
            <div className="kpis">
              <div className="kpi">
                <span className="kpi-label"><span className="key key-buy" /> Buyer's net worth</span>
                <Tip tip={ex.buyerNetWorth} className="kpi-value">{gbpShort(summary.finalBuyer)}</Tip>
                <span className="kpi-note">Home {gbpShort(deflate(lastRow.equity, p.years))} + investments {gbpShort(deflate(lastRow.buyerPortfolio, p.years))}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label"><span className="key key-rent" /> Renter's net worth</span>
                <Tip tip={ex.renterNetWorth} className="kpi-value">{gbpShort(summary.finalRenter)}</Tip>
                <span className="kpi-note">All investments, after tax</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Buying pulls ahead</span>
                <Tip tip={ex.crossover} className="kpi-value">{summary.crossoverYear ? `Year ${summary.crossoverYear}` : "Never"}</Tip>
                <span className="kpi-note">After stamp duty, fees and selling costs</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Break-even house growth</span>
                <Tip tip={ex.breakeven} className="kpi-value">{breakeven == null ? "n/a" : pct(breakeven)}</Tip>
                <span className="kpi-note">
                  {breakeven == null ? "Outside −10% to 20% a year" : `Buying wins above this. You assumed ${pct(p.houseGrowth)}.`}
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
              <h2>Who's ahead, and by how much</h2>
              <Segmented<"gap" | "both">
                label="Chart"
                value={view}
                onChange={setView}
                options={[
                  { value: "gap", label: "The gap" },
                  { value: "both", label: "Both net worths" },
                ]}
              />
            </div>
            {view === "gap" ? (
              <>
                <p className="sub">
                  Buyer's net worth minus renter's, {money}. Above the line (blue), buying is ahead. Below it (orange),
                  renting is.
                </p>
                <GapChart
                  data={gapData}
                  ariaLabel={`Gap between buyer and renter over ${p.years} years. ${buyWins ? "Buying" : "Renting"} ends ${gbp(Math.abs(summary.difference))} ahead.`}
                />
              </>
            ) : (
              <>
                <p className="sub">
                  Buyer: home value minus mortgage and selling costs, plus investments. Renter: investments. Both after
                  tax, {money}.
                </p>
                <Legend />
                <TwoLineChart
                  data={wealth}
                  crossover={summary.crossoverYear}
                  ariaLabel={`Net worth over ${p.years} years. Buyer ends at ${gbp(summary.finalBuyer)}, renter at ${gbp(summary.finalRenter)}.`}
                />
              </>
            )}
            <p className="note">
              Renting starts ahead: on day one the buyer loses{" "}
              <Tip tip={ex.y1Transaction}>{gbp(upfront.stampDuty + upfront.fees + (p.price * p.sellingCostPct) / 100)}</Tip>{" "}
              to stamp duty, fees and the cost of selling.{" "}
              {summary.crossoverYear
                ? `Buying catches up in year ${summary.crossoverYear}${buyWins ? " and stays ahead" : ", but renting finishes ahead"}.`
                : `Buying doesn't catch up within ${p.years} years.`}{" "}
              The three charts below show why.
            </p>
          </section>
          <h2 className="group-title">What drives the result</h2>
          <section className="card">
            <div className="card-head">
              <h2>Leverage vs compounding</h2>
              <MoneySwitch real={raceReal} onChange={setRaceReal} />
            </div>
            <p className="sub">
              The buyer's {gbp(upfront.cashNeeded)} controls a {gbp(p.price)} home, so price growth of {pct(p.houseGrowth)}{" "}
              a year works on the whole price. Invested instead, the same cash would grow faster ({pct(p.stockReturn)} a
              year) but on a smaller sum. Both compound. Each line is what that year adds, {raceMoney}.
            </p>
            <Legend names={raceNames} />
            <TwoLineChart
              data={raceData}
              height={240}
              names={raceNames}
              marker={race.overtakeYear ? { x: race.overtakeYear, label: `Compounding overtakes in year ${race.overtakeYear}` } : null}
              ariaLabel="Yearly gain from the home's price against the same cash invested in shares"
              footer={(r) => `${r.rent >= r.buy ? "The invested cash" : "The home"} adds ${gbp(Math.abs(r.rent - r.buy))} more`}
            />
            {raceFirst && raceLast && (
            <dl className="facts facts-3">
              <div>
                <dt>Home's gain, year 1</dt>
                <dd><Tip tip={ex.raceHome}>{gbp(raceDeflate(raceFirst.homeGain, 1))}</Tip></dd>
              </div>
              <div>
                <dt>Home's gain, year {raceLast.year}</dt>
                <dd>
                  <Tip tip={{
                    title: `The home's price gain in year ${raceLast.year}`,
                    body: (
                      <>
                        <p className="calc">
                          {gbp(p.price)} × (1 + {pct(p.houseGrowth)})<sup>{raceLast.year - 1}</sup> × {pct(p.houseGrowth)} ={" "}
                          {gbp(raceLast.homeGain)} in pounds at the time
                          <br />= {gbp(raceLast.homeGain / rows[raceLast.year].deflator)} in today's money
                        </p>
                        <p>{pct(p.houseGrowth)} of a bigger value each year: it compounds, but slowly.</p>
                      </>
                    ),
                  }}>{gbp(raceDeflate(raceLast.homeGain, raceLast.year))}</Tip>
                </dd>
              </div>
              <div>
                <dt>Year 1 gain on your cash</dt>
                <dd><Tip tip={ex.raceHome}>{pct((raceFirst.homeGain / Math.max(1, upfront.cashNeeded)) * 100)}</Tip></dd>
              </div>
              <div>
                <dt>Cash invested instead, year 1</dt>
                <dd><Tip tip={ex.raceCash}>{gbp(raceDeflate(raceFirst.cashGain, 1))}</Tip></dd>
              </div>
              <div>
                <dt>Cash invested instead, year {raceLast.year}</dt>
                <dd>
                  <Tip tip={{
                    title: `The invested cash's return in year ${raceLast.year}`,
                    body: (
                      <p className="calc">
                        {gbp(upfront.cashNeeded)} × (1 + {pct(p.stockReturn)})<sup>{raceLast.year - 1}</sup> × {pct(p.stockReturn)} ={" "}
                        {gbp(raceLast.cashGain)} in pounds at the time
                        <br />= {gbp(raceLast.cashGain / rows[raceLast.year].deflator)} in today's money
                      </p>
                    ),
                  }}>{gbp(raceDeflate(raceLast.cashGain, raceLast.year))}</Tip>
                </dd>
              </div>
              <div>
                <dt>Compounding overtakes</dt>
                <dd><Tip tip={ex.raceOvertake}>{race.overtakeYear ? `Year ${race.overtakeYear}` : "Not within " + p.years + " years"}</Tip></dd>
              </div>
            </dl>
            )}
            {Math.abs(p.houseGrowth - p.inflation) < 0.5 && (
              <p className="note">
                {raceReal
                  ? "The home's line is flat in today's money because it grows at about the rate of inflation. It compounds in pounds, but those pounds buy no more. Switch to pounds at the time to see it compound."
                  : `The home grows at about the rate of inflation (${pct(p.inflation)}), so in today's money its yearly gain stays about the same. Only the part of a return above inflation makes you better off.`}
              </p>
            )}
            <p className="note">
              This chart shows one force on its own. Leverage costs interest (<Tip tip={ex.y1Interest}>{gbp(y1.interest)}</Tip>{" "}
              in year one), and it works both ways: a 10% fall in price takes {gbp(p.price * 0.1)} off the buyer's{" "}
              {gbp(p.deposit)} deposit. Rent against owning costs is the next chart.
            </p>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Rent vs owning costs, each year</h2>
              <MoneySwitch real={costReal} onChange={setCostReal} />
            </div>
            <p className="sub">
              Rent rises every year. The mortgage payment only changes when you remortgage, and it stops once the loan
              is paid off. Owning includes service charge and maintenance, less lodger income. Each household invests
              whatever its housing leaves of the same money for housing and investing.{" "}
              {costReal ? "In today's money." : "In pounds at the time (not adjusted for inflation)."}
            </p>
            <Legend />
            <p className="note">
              A year's rent is <Tip tip={ex.rentYield}>{pct((rows[1].rentPaid / p.price) * 100)}</Tip> of the home's value
              today and <Tip tip={ex.rentYield}>{pct((lastRow.rentPaid / rows[p.years - 1].propertyValue) * 100)}</Tip> in
              year {p.years}.{" "}
              {Math.abs(p.rentGrowth - p.houseGrowth) >= 0.5 &&
                `Rent is set to grow ${p.rentGrowth > p.houseGrowth ? "faster" : "slower"} than prices, which ${p.rentGrowth > p.houseGrowth ? "favours buying" : "favours renting"} more each year.`}
            </p>
            <TwoLineChart
              data={housingCost}
              height={240}
              ariaLabel="Yearly housing cost of renting versus owning"
              footer={(r) => `${r.rent >= r.buy ? "Owning" : "Renting"} is ${gbp(Math.abs(r.rent - r.buy))} cheaper`}
            />
            <div className="scroll">
              <table className="flows">
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col">
                      <Tip tip={ex.budget(1)}>Money for housing and investing</Tip>
                    </th>
                    <th scope="col"><span className="key key-rent" /> Renter</th>
                    <th scope="col"><span className="key key-buy" /> Buyer</th>
                  </tr>
                </thead>
                <tbody>
                  {flowYears.map((y) => {
                    const r = rows[y];
                    const buyCost = r.mortgagePaid + r.runningCosts - r.lodgerIncome;
                    return (
                      <tr key={y}>
                        <th scope="row">{y}</th>
                        <td><Tip tip={ex.budget(y)}>{gbp(costDeflate(r.budget, y))}</Tip></td>
                        <td>
                          <Tip tip={ex.housingCost(y, "rent")}>{gbp(costDeflate(r.rentPaid, y))}</Tip> on rent
                          <br />
                          <Tip tip={ex.invested(y, "rent")} className={r.renterInvested < 0 ? "neg" : ""}>{gbp(costDeflate(r.renterInvested, y))}</Tip> invested
                        </td>
                        <td>
                          <Tip tip={ex.housingCost(y, "buy")}>{gbp(costDeflate(buyCost, y))}</Tip> on housing
                          <br />
                          <Tip tip={ex.invested(y, "buy")} className={r.buyerInvested < 0 ? "neg" : ""}>{gbp(costDeflate(r.buyerInvested, y))}</Tip> invested
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
                  <tr><th>Rent</th><td><Tip tip={ex.y1Rent}>{gbp(y1.rent)}</Tip></td></tr>
                  <tr className="total"><th>Money gone</th><td><Tip tip={ex.y1Rent}>{gbp(y1.rent)}</Tip></td></tr>
                </tbody>
              </table>
              <table className="ledger">
                <caption><span className="key key-buy" /> Owning</caption>
                <tbody>
                  <tr><th>Mortgage interest</th><td><Tip tip={ex.y1Interest}>{gbp(y1.interest)}</Tip></td></tr>
                  <tr><th>Service charge &amp; maintenance</th><td><Tip tip={ex.y1Running}>{gbp(y1.runningCosts)}</Tip></td></tr>
                  {y1.lodgerIncome > 0 && <tr><th>Lodger income, after tax</th><td><Tip tip={ex.y1Lodger}>−{gbp(y1.lodgerIncome)}</Tip></td></tr>}
                  <tr><th>Lost returns on the {gbp(upfront.cashNeeded)} spent buying</th><td><Tip tip={ex.y1Opportunity}>{gbp(y1.opportunityCost)}</Tip></td></tr>
                  <tr><th>Stamp duty, fees and selling costs, spread over {Math.max(1, p.years)} years</th><td><Tip tip={ex.y1Transaction}>{gbp(y1.transactionCostsPerYear)}</Tip></td></tr>
                  <tr className="subtotal"><th>Money gone if prices stay flat</th><td><Tip tip={ex.y1BeforeGrowth}>{gbp(y1.buyBeforeGrowth)}</Tip></td></tr>
                  <tr><th>Expected rise in the home's value at {pct(p.houseGrowth)}</th><td><Tip tip={ex.y1Growth}>−{gbp(y1.expectedGrowth)}</Tip></td></tr>
                  <tr className="total"><th>Money gone</th><td><Tip tip={ex.y1BuyTotal}>{gbp(y1.buyTotal)}</Tip></td></tr>
                </tbody>
              </table>
            </div>
            <div className="checks">
              <p>
                <strong>Price growth needed to match renting:</strong>{" "}
                <Tip tip={ex.growthNeeded}>{pct(y1.growthNeeded, 1)} in year one</Tip>. You assumed {pct(p.houseGrowth)}.
              </p>
              <p>
                <strong>5% rule of thumb:</strong> <Tip tip={ex.fivePercent}>{gbp(y1.fivePercentRule)} a year</Tip> vs rent{" "}
                {gbp(y1.rent)}, which suggests {y1.rent < y1.fivePercentRule ? "renting" : "buying"} is cheaper.
              </p>
            </div>
            <p className="note">
              Also paid once: stamp duty <Tip tip={ex.stampDuty}>{gbp(upfront.stampDuty)}</Tip> and fees{" "}
              <Tip tip={ex.fees}>{gbp(upfront.fees)}</Tip> when buying, and about {pct(p.sellingCostPct, 1)} of the price
              when selling. The repayment mortgage costs <Tip tip={ex.monthlyMortgage}>{gbp(proj.monthlyMortgage * 12)}</Tip>{" "}
              a year in cash, but <Tip tip={ex.housingCost(1, "buy")}>{gbp(first.mortgagePaid - first.interestPaid)}</Tip>{" "}
              of year one's payments reduce the loan and stay yours.
            </p>
          </section>
          <h2 className="group-title">Risk, and how sure can we be?</h2>
          <section className="card prose">
            <h2>One home vs the whole market</h2>
            <ul>
              <li>
                <strong>Diversification.</strong> A global index tracker owns small slices of thousands of large companies,
                across dozens of countries and every part of the economy. A home is one building, on one street, in one
                city. If that area does badly, all your eggs are in it.
              </li>
              <li>
                <strong>Leverage cuts both ways.</strong> The mortgage multiplies gains and losses on your own money. A 10%
                fall in the home's price loses {gbp(p.price * 0.1)}, which is{" "}
                {pct(((p.price * 0.1) / Math.max(1, p.deposit)) * 100, 0)} of the deposit. A 10% fall in shares loses 10%.
              </li>
              <li>
                <strong>Volatility.</strong> Share prices jump around much more from year to year than house prices, and
                big falls happen. You have to be able to sit through them without selling.
              </li>
              <li>
                <strong>Selling.</strong> You can sell part of a fund in days for almost nothing. A home is sold whole,
                takes months, and costs about {pct(p.sellingCostPct, 0)} of the price, plus stamp duty on the next one.
              </li>
              <li>
                <strong>What the numbers leave out.</strong> Owning means security, no landlord and freedom to change
                the place. Renting means flexibility to move, but also rent rises and the risk of being asked to leave.
              </li>
            </ul>
            <h3>What history says</h3>
            <p className="sub">
              Buyer minus renter after {p.years} years in today's money if past returns repeated. The scenarios replace
              your house growth and investment return with real figures from the record; rent moves with house prices.
              Everything else is as you set it.
            </p>
            <div className="scroll">
              <table className="grid">
                <thead>
                  <tr>
                    <th scope="col" className="corner">House prices ↓ · shares →</th>
                    {STOCK_SCENARIOS.map((sc) => (
                      <th scope="col" key={sc.label}>
                        <Tip tip={{ title: sc.label, body: <p>{sc.why}</p>, sources: sc.sources }}>{sc.label}</Tip>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOUSE_SCENARIOS.map((h, i) => (
                    <tr key={h.label}>
                      <th scope="row" className="scenario-row">
                        <Tip tip={{ title: h.label, body: <p>{h.why}</p>, sources: h.sources }}>{h.label}</Tip>
                      </th>
                      {scenarios[i].map((d, j) => {
                        const strength = Math.min(1, Math.abs(d) / 750_000);
                        return (
                          <td
                            key={j}
                            style={{
                              background: `color-mix(in oklab, var(${d >= 0 ? "--buy" : "--rent"}) ${Math.round(8 + strength * 42)}%, var(--surface))`,
                            }}
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
            <p className="note">
              Your inputs assume house prices grow {pct(p.houseGrowth)} a year ({pct(((1 + p.houseGrowth / 100) / (1 + p.inflation / 100) - 1) * 100)}{" "}
              after inflation) and investments return {pct(p.stockReturn)} ({pct(((1 + p.stockReturn / 100) / (1 + p.inflation / 100) - 1) * 100)}{" "}
              after inflation).
            </p>
          </section>
          <section className="card">
            <h2>What if the rate or house prices differ?</h2>
            <p className="sub">
              Buyer minus renter after {p.years} years, in today's money. The mortgage rate applies for the whole term,
              and rent moves with house prices. Everything else is as you set it. Blue means buying wins; orange means
              renting wins. Your current inputs are outlined.
            </p>
            <div className="scroll">
              <table className="grid">
                <thead>
                  <tr>
                    <th scope="col" className="corner">Mortgage rate ↓ · house growth →</th>
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
                        const isYou = rate === p.mortgageRate && rate === p.followOnRate && GROWTHS[j] === p.houseGrowth;
                        return (
                          <td
                            key={j}
                            className={isYou ? "you" : ""}
                            style={{
                              background: `color-mix(in oklab, var(${d >= 0 ? "--buy" : "--rent"}) ${Math.round(8 + strength * 42)}%, var(--surface))`,
                            }}
                          >
                            <Tip
                              tip={{
                                title: `${pct(rate, 1)} mortgage, ${pct(GROWTHS[j], 0)} house growth`,
                                body: (
                                  <p>
                                    With every other input as you've set it, {d >= 0 ? "buying" : "renting"} finishes{" "}
                                    {gbp(Math.abs(d))} ahead after {p.years} years, in today's money.
                                  </p>
                                ),
                              }}
                            >
                              <span className="grid-who">{d >= 0 ? "Buy" : "Rent"}</span> +{gbpShort(Math.abs(d))}
                            </Tip>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <h2 className="group-title">The details</h2>
          <section className="card">
            <h2>Getting to completion day</h2>
            <dl className="facts">
              <div><dt>Deposit</dt><dd><Tip tip={ex.deposit}>{gbp(p.deposit)}</Tip></dd></div>
              <div><dt>Stamp duty{ftb ? " (first-time buyer)" : ""}</dt><dd><Tip tip={ex.stampDuty}>{gbp(upfront.stampDuty)}</Tip></dd></div>
              <div><dt>Fees</dt><dd><Tip tip={ex.fees}>{gbp(upfront.fees)}</Tip></dd></div>
              <div className="total"><dt>Cash needed</dt><dd><Tip tip={ex.cashNeeded}>{gbp(upfront.cashNeeded)}</Tip></dd></div>
            </dl>
            <p className="note">
              {renterSaving0 > 0 && saveYears != null ? (
                <>
                  While renting at {gbp(p.rent)} a month you can save <Tip tip={ex.savingRate}>{gbp(renterSaving0)}</Tip> a
                  year, so this takes about <Tip tip={ex.yearsToSave}><strong>{saveYears.toFixed(1)} years</strong></Tip>.{" "}
                </>
              ) : (
                <>At this rent you can't save anything towards a deposit. </>
              )}
              Both households are identical until then, so the comparison starts on completion day. The renter keeps the
              same {gbp(upfront.cashNeeded)} invested.
            </p>
          </section>
          <section className="card">
            <h2>Year by year</h2>
            <p className="sub">{real ? "In today's money." : "In future pounds."} Hover over a column heading for what it means.</p>
            <div className="scroll">
              <table className="milestones">
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col"><Tip tip={{ title: "Home value", body: <p>The price grown at {pct(p.houseGrowth)} a year.</p>, sources: ["ukhpi"] }}>Home value</Tip></th>
                    <th scope="col"><Tip tip={{ title: "Mortgage left", body: <p>The loan still owed at the end of the year.</p> }}>Mortgage left</Tip></th>
                    <th scope="col"><Tip tip={{ title: "Buyer's investments", body: <p>What the buyer has invested from money left over after housing, after capital gains tax if sold.</p> }}>Buyer's investments</Tip></th>
                    <th scope="col"><Tip tip={ex.buyerNetWorth}>Buyer net worth</Tip></th>
                    <th scope="col"><Tip tip={ex.renterNetWorth}>Renter net worth</Tip></th>
                    <th scope="col"><Tip tip={{ title: "Difference", body: <p>Buyer's net worth minus renter's. “Buy +” means the buyer is ahead.</p> }}>Difference</Tip></th>
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
              Totals over {p.years} years in future pounds: rent paid {gbp(totals.rent)}; mortgage interest{" "}
              {gbp(totals.interest)}; service charge and maintenance {gbp(totals.runningCosts)}; stamp duty and fees{" "}
              {gbp(totals.purchaseCosts)}; selling costs {gbp(totals.sellingCosts)}.
            </p>
          </section>
          <section className="card prose">
            <h2>How the comparison works</h2>
            <ul>
              <li>
                <strong>Same money, different housing.</strong> Each year both households have the same money for housing
                and investing: take-home pay minus living costs, rising with pay. Whatever housing doesn't use is
                invested. If housing costs more, investments are sold to cover it.
              </li>
              <li>
                <strong>The renter keeps the deposit invested.</strong> The buyer's deposit, stamp duty and fees become
                the renter's starting investments. Forgetting this lost return is why buying looks so much cheaper in the
                quick sum.
              </li>
              <li>
                <strong>Leverage vs compounding.</strong> The buyer puts down {gbp(p.deposit)} but gets the growth on a{" "}
                {gbp(p.price)} home: a lower rate on a bigger sum. The renter gets a higher rate on a smaller sum that
                compounds and keeps growing, so it can catch up. The chart above shows when.
              </li>
              <li>
                <strong>Fixed mortgage, rising rent.</strong> The mortgage payment only changes when you remortgage
                after the {p.fixYears}-year fix. It doesn't rise with inflation. Rent grows at {pct(p.rentGrowth)} a year,
                so over time owning gets cheaper in today's money and renting doesn't.
              </li>
              <li>
                <strong>Tax.</strong> Your main home is free of capital gains tax. Investments go into ISAs first (£20,000
                a year per adult). Anything above that is taxed at {pct(p.cgtRate, 0)} on gains above £3,000 per adult
                when sold. Dividend tax isn't modelled.
              </li>
              <li>
                <strong>Risk isn't in the numbers.</strong> These are steady averages. Markets crash, and rates change
                when you remortgage every 2 to 5 years. The buyer has one leveraged, hard-to-sell asset. The renter has
                a diversified portfolio, but faces rent rises and moves.
              </li>
              <li>
                <strong>Simplifications.</strong> One remortgage, onto a single rate for the rest of the term. No pensions.
                England, Wales and Northern Ireland tax rules.
              </li>
            </ul>
          </section>
          <section className="card prose" id="sources">
            <h2>Sources</h2>
            <p className="sub">
              Where the starting values and tax rules come from. Figures checked September 2026. Anything not listed here
              (fees, selling costs, maintenance, term) is a stated assumption; hover over its input for the reasoning.
            </p>
            <ul className="source-list">
              {usedSources.map((id) => (
                <li key={id}>
                  <a href={SOURCES[id].url} target="_blank" rel="noreferrer">
                    {SOURCES[id].publisher}: {SOURCES[id].title}
                  </a>
                  <span>{SOURCES[id].figures}</span>
                </li>
              ))}
            </ul>
            <p className="note">This is a model, not financial advice.</p>
          </section>
        </main>
      </div>
    </div>
  );
}
