import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
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

export interface GapPoint {
  year: number;
  /** Buyer's net worth minus renter's: positive when buying is ahead. */
  gap: number;
}

function GapTooltip({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const gap = (payload[0].payload as GapPoint).gap;
  return (
    <div className="tip">
      <div className="tip-head">{label === 0 ? "Purchase day" : `Year ${label}`}</div>
      <div className="tip-row">
        <span className={`key ${gap >= 0 ? "key-buy" : "key-rent"}`} />
        <strong>{gbp(Math.abs(gap))}</strong>
        <span>{gap >= 0 ? "Buying ahead" : "Renting ahead"}</span>
      </div>
    </div>
  );
}

/**
 * One line for the gap between the two households, filled blue above zero
 * (buying ahead) and orange below (renting ahead). Easier to read than two
 * net-worth lines that sit almost on top of each other.
 */
export function GapChart({ data, ariaLabel, height = 280 }: { data: GapPoint[]; ariaLabel: string; height?: number }) {
  const c = usePalette();
  const axis = { fill: c["--ink-3"], fontSize: 12, fontFamily: "var(--mono)" };
  const max = Math.max(0, ...data.map((d) => d.gap));
  const min = Math.min(0, ...data.map((d) => d.gap));
  // Where zero sits between the top (max) and bottom (min) of the plot, for the colour split.
  const zero = max === min ? 0 : max / (max - min);
  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="gap-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={c["--buy"]} stopOpacity={0.28} />
              <stop offset={zero} stopColor={c["--buy"]} stopOpacity={0.06} />
              <stop offset={zero} stopColor={c["--rent"]} stopOpacity={0.06} />
              <stop offset={1} stopColor={c["--rent"]} stopOpacity={0.28} />
            </linearGradient>
            <linearGradient id="gap-stroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset={zero} stopColor={c["--buy"]} />
              <stop offset={zero} stopColor={c["--rent"]} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c["--grid"]} vertical={false} />
          <XAxis dataKey="year" tick={axis} tickLine={false} axisLine={{ stroke: c["--grid"] }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v === 0 ? "£0" : gbpShort(Math.abs(v)))} width={56} />
          <ReferenceLine y={0} stroke={c["--ink-3"]} />
          <Tooltip
            content={(props) => <GapTooltip {...(props as TooltipContentProps<number, string>)} />}
            cursor={{ stroke: c["--ink-3"], strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="gap"
            stroke="url(#gap-stroke)"
            strokeWidth={2}
            fill="url(#gap-fill)"
            baseValue={0}
            isAnimationActive={false}
            activeDot={{ r: 5, fill: c["--ink-2"], stroke: c["--surface"], strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
