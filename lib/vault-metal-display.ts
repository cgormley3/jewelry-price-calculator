/** Fine metal fraction by alloy; spot math uses $/troy oz (same as live market quotes). */
export const METAL_PURITIES: Record<string, number> = {
  "10K Gold": 0.417,
  "14K Gold": 0.583,
  "18K Gold": 0.75,
  "22K Gold": 0.916,
  "24K Gold": 0.999,
  "Sterling Silver": 0.925,
  "Platinum 950": 0.95,
  Palladium: 0.95,
};

export const UNIT_TO_GRAMS: { [key: string]: number } = {
  Grams: 1,
  "Pennyweights (dwt)": 1.55517,
  "Troy Ounces": 31.1035,
  "Ounces (std)": 28.3495,
};

export const FALLBACK_SPOT: Record<string, number> = {
  gold: 2600,
  silver: 28,
  platinum: 950,
  palladium: 1000,
};

/** Live $/ozt for a metal row (matches calculateFullBreakdown spot resolution). */
export function resolveSpotOzForMetal(
  m: any,
  livePrices: { gold?: number; silver?: number; platinum?: number; palladium?: number }
): number {
  const type = (m.type || "").toLowerCase();
  let spot = 0;
  if (type.includes("gold")) spot = Number(livePrices.gold) || 0;
  else if (type.includes("silver")) spot = Number(livePrices.silver) || 0;
  else if (type.includes("platinum")) spot = Number(livePrices.platinum) || 0;
  else if (type.includes("palladium")) spot = Number(livePrices.palladium) || 0;
  if (!spot && m.spotSaved != null && Number(m.spotSaved) > 0) spot = Number(m.spotSaved);
  else if (!spot) {
    if (type.includes("gold")) spot = FALLBACK_SPOT.gold;
    else if (type.includes("silver")) spot = FALLBACK_SPOT.silver;
    else if (type.includes("platinum")) spot = FALLBACK_SPOT.platinum;
    else if (type.includes("palladium")) spot = FALLBACK_SPOT.palladium;
  }
  return spot;
}

/** Metal line $ value from a spot quote in USD per troy ounce (matches live market). */
export function metalRowDollarValueFromSpotOzt(m: any, spotOzt: number): number {
  const purity = METAL_PURITIES[m.type] || 1;
  const gramWeight = Number(m.weight) * (UNIT_TO_GRAMS[m.unit as keyof typeof UNIT_TO_GRAMS] || 1);
  return (spotOzt / 31.1035) * purity * gramWeight;
}

/** Dollar value of one metal line at current live + saved-spot logic (vault display). */
export function metalRowLiveDollarValue(
  m: any,
  livePrices: { gold?: number; silver?: number; platinum?: number; palladium?: number }
): number {
  const spot = resolveSpotOzForMetal(m, livePrices);
  return metalRowDollarValueFromSpotOzt(m, spot);
}
