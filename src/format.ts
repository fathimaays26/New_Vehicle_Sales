export function formatCompactNumber(value: number): string {
  if (!isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e9) return (value / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (value / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (value / 1e3).toFixed(2) + "K";
  return value.toFixed(0);
}

export function formatNumber(value: number): string {
  if (!isFinite(value)) return "0";
  return Math.round(value).toLocaleString("en-IN");
}

export function formatCurrency(value: number): string {
  return "₹" + formatCompactNumber(value);
}

export function formatPercent(value: number, decimals = 1): string {
  if (!isFinite(value)) return "0%";
  return value.toFixed(decimals) + "%";
}
