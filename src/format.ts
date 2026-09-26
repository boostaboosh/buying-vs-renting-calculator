const whole = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** £12,345 (negative as −£12,345). */
export function gbp(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}£${whole.format(Math.abs(Math.round(n)))}`;
}

/** Compact money for headlines and axes: £514k, £1.25m. */
export function gbpShort(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}£${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}m`;
  if (a >= 10_000) return `${sign}£${Math.round(a / 1_000)}k`;
  if (a >= 1_000) return `${sign}£${(a / 1_000).toFixed(1)}k`;
  return `${sign}£${Math.round(a)}`;
}

export function pct(n: number, dp = 1): string {
  return `${n.toFixed(dp)}%`;
}
