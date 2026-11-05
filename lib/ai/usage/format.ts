/** "1.2M", "450k", "980" — compact token counts for meters and tables. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 || n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/** 0–100, for meters. Unlimited (null) → 0. */
export function usagePercent(used: number, total: number | null): number {
  if (total === null) return 0;
  if (total <= 0) return 100;
  return Math.min(100, Math.round((used / total) * 100));
}
