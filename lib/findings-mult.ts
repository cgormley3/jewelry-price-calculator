/** Optional findings/other retail multiplier for Strategy A/B only (undefined = use formula default). */
export function findingsMultFromItem(item: any): number | undefined {
  if (!item || item.strategy === "custom") return undefined;
  const v = item.findings_retail_multiplier;
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
