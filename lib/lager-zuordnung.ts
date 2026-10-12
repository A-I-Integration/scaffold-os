// ============================================================
// SCAFFOLD OS – Zuordnung KI-Materialzeile ↔ Lagerartikel (Angebots-Annahme)
//
// Reine Funktionen (ohne DB). Reihenfolge:
//   1. Artikelnummer: materialList.articleNumber == inventory.sku
//      (so arbeiten auch article-prices.ts und cad-lager.ts)
//   2. Rückfall: genau gleicher Name (case-insensitive, getrimmt)
// Kein unscharfes Raten – wer nicht passt, wird als "nicht gefunden"
// gemeldet, nichts wird gebucht.
// ============================================================

export interface LagerArtikelKurz {
  id: string;
  name: string;
  sku?: string | null;
  quantity: number;
  unit: string;
}

export interface MaterialZeileKurz {
  name: string;
  quantity: number;
  articleNumber?: string | null;
  unit?: string;
}

export interface LagerIndex {
  nachSku: Map<string, LagerArtikelKurz>;
  nachName: Map<string, LagerArtikelKurz>;
}

const norm = (s: unknown): string => (typeof s === 'string' ? s.trim().toLowerCase() : '');

export function baueLagerIndex(lager: LagerArtikelKurz[]): LagerIndex {
  const nachSku = new Map<string, LagerArtikelKurz>();
  const nachName = new Map<string, LagerArtikelKurz>();
  for (const a of lager) {
    const s = norm(a.sku);
    const n = norm(a.name);
    if (s && !nachSku.has(s)) nachSku.set(s, a);
    if (n && !nachName.has(n)) nachName.set(n, a);
  }
  return { nachSku, nachName };
}

export function findeLagerartikel(
  zeile: MaterialZeileKurz,
  index: LagerIndex
): { artikel: LagerArtikelKurz | null; via: 'sku' | 'name' | null } {
  const s = norm(zeile.articleNumber);
  if (s) {
    const treffer = index.nachSku.get(s);
    if (treffer) return { artikel: treffer, via: 'sku' };
  }
  const n = norm(zeile.name);
  if (n) {
    const treffer = index.nachName.get(n);
    if (treffer) return { artikel: treffer, via: 'name' };
  }
  return { artikel: null, via: null };
}
