import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { gbp, gbpShort } from "../format";

const TOKENS = ["--buy", "--rent", "--grid", "--ink-2", "--ink-3", "--surface"] as const;
type Palette = Record<(typeof TOKENS)[number], string>;

/** SVG attributes can't take var(), so read the theme tokens and re-read when the theme flips. */
function usePalette(): Palette {
  const read = (): Palette => {
    const s = getComputedStyle(document.documentElement);
    return Object.fromEntries(TOKENS.map((t) => [t, s.getPropertyValue(t).trim()])) as Palette;
  };
  const [p, setP] = useState(read);
  useEffect(() => {
    const update = () => setP(read());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", update);
      mo.disconnect();
    };
  }, []);
  return p;
}

export interface SeriesPoint {
  year: number;
  buy: number;
  rent: number;
}

type Footer = (p: SeriesPoint) => string;

const wealthFooter: Footer = (p) =>
  `${p.buy >= p.rent ? "Buying" : "Renting"} ahead by ${gbp(Math.abs(p.buy - p.rent))}`;

function ChartTooltip({
  active,
  payload,
  label,
  footer,
  names,
}: TooltipContentProps<number, string> & { footer: Footer; names: Names }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as SeriesPoint;
  return (
    <div className="tip">
      <div className="tip-head">{label === 0 ? "Purchase day" : `Year ${label}`}</div>
      <div className="tip-row">
        <span className="key key-buy" />
        <strong>{gbp(row.buy)}</strong>
        <span>{names.buy}</span>
      </div>
      <div className="tip-row">
        <span className="key key-rent" />
        <strong>{gbp(row.rent)}</strong>
        <span>{names.rent}</span>
      </div>
      <div className="tip-foot">{footer(row)}</div>
    </div>
  );
}

/** Series names; "Buy" and "Rent" unless a chart plots something more specific. */
export interface Names {
  buy: string;
  rent: string;
}
const DEFAULT_NAMES: Names = { buy: "Buy", rent: "Rent" };

export function Legend({ names = DEFAULT_NAMES }: { names?: Names }) {
  return (
    <div className="legend" aria-hidden="true">
      <span>
        <span className="key key-buy" /> {names.buy}
      </span>
      <span>
        <span className="key key-rent" /> {names.rent}
      </span>
    </div>
  );
}

export function TwoLineChart({
  data,
  ariaLabel,
  crossover,
  height = 300,
  footer = wealthFooter,
  names = DEFAULT_NAMES,
  marker,
}: {
  data: SeriesPoint[];
  ariaLabel: string;
  crossover?: number | null;
  height?: number;
  footer?: Footer;
  names?: Names;
  /** An extra labelled vertical line, e.g. the year one series overtakes the other. */
  marker?: { x: number; label: string } | null;
}) {
  const c = usePalette();
  const axis = { fill: c["--ink-3"], fontSize: 12, fontFamily: "var(--mono)" };
  const last = data.length - 1;
  const endDot =
    (color: string) =>
    ({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) =>
      index === last && cx != null && cy != null ? (
        <circle key={`end-${index}`} cx={cx} cy={cy} r={4.5} fill={color} stroke={c["--surface"]} strokeWidth={2} />
      ) : (
        <g key={`none-${index}`} />
      );
  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={c["--grid"]} vertical={false} />
          <XAxis
            dataKey="year"
            tick={axis}
            tickLine={false}
            axisLine={{ stroke: c["--grid"] }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            tickFormatter={gbpShort}
            width={56}
          />
          {marker && (
            <ReferenceLine
              x={marker.x}
              stroke={c["--ink-3"]}
              label={{ value: marker.label, position: "insideTopLeft", fill: c["--ink-2"], fontSize: 12 }}
            />
          )}
          {crossover != null && crossover > 0 && (
            <ReferenceLine
              x={crossover}
              stroke={c["--ink-3"]}
              strokeDasharray="0"
              label={{ value: `Buying ahead from year ${crossover}`, position: "insideTopLeft", fill: c["--ink-2"], fontSize: 12 }}
            />
          )}
          <Tooltip
            content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} footer={footer} names={names} />}
            cursor={{ stroke: c["--ink-3"], strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="rent"
            name={names.rent}
            stroke={c["--rent"]}
            strokeWidth={2}
            dot={endDot(c["--rent"])}
            activeDot={{ r: 5, stroke: c["--surface"], strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="buy"
            name={names.buy}
            stroke={c["--buy"]}
            strokeWidth={2}
            dot={endDot(c["--buy"])}
            activeDot={{ r: 5, stroke: c["--surface"], strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
