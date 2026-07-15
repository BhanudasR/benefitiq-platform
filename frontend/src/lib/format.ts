/**
 * Display-only formatting of values that ALREADY come from the governed API.
 * This module performs NO business/KPI arithmetic — it only renders numbers,
 * currency and percentages for the eye. Official numbers are computed server-side.
 */
export function fmtNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("en-IN").format(v);
}

export function fmtCurrency(v: number | null | undefined, currency = "INR"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

/** The API already returns ICR as a percent number (e.g. 73.64). We only append '%'. */
export function fmtPercent(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v}%`;
}

export function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return fmtNumber(v);
  return String(v);
}
