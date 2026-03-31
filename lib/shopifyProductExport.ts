export const SHOPIFY_PRODUCT_VENDOR = 'Bear Silver and Stone';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildBodyHtml(item: {
  notes?: string | null;
  metals?: unknown[];
  stones?: unknown[];
}): string {
  const parts: string[] = [];
  if (item.notes?.trim()) {
    parts.push(`<p>${escapeHtml(item.notes.trim())}</p>`);
  }
  if (Array.isArray(item.metals) && item.metals.length > 0) {
    const metalsStr = item.metals
      .map((m: any) => `${m.type || 'Metal'}: ${m.weight || 0} ${m.unit || 'g'}`)
      .join(', ');
    parts.push(`<p><strong>Materials:</strong> ${escapeHtml(metalsStr)}</p>`);
  }
  if (Array.isArray(item.stones) && item.stones.length > 0) {
    const stonesStr = item.stones.map((s: any) => s.name || 'Stone').join(', ');
    parts.push(`<p><strong>Stones:</strong> ${escapeHtml(stonesStr)}</p>`);
  }
  return parts.length > 0 ? parts.join('\n') : '<p>Handcrafted jewelry</p>';
}

/** Matches Admin API export: first 8 characters of inventory UUID. */
export function vaultSkuFromItemId(id: string): string {
  return `VAULT-${(id || '').slice(0, 8)}`;
}

/** Title line for Shopify / Squarespace CSV and Admin API (caps, max 255). */
export function vaultExportItemTitle(name?: string | null): string {
  const raw = (name || 'Untitled Piece').trim() || 'Untitled Piece';
  return raw.toUpperCase().slice(0, 255);
}
