// ============================================================
// SCAFFOLD OS – CAD-Stückliste mit den Lager-Daten der Firma
//
// Jede Firma pflegt Namen, Preise und Gewichte im eigenen Lager (Tabelle
// inventory, Artikelnummer = sku). Die CAD-Stückliste nimmt dieselben Werte
// wie der normale Aufmaß (Abgleich über die Artikelnummer, wie in
// article-prices.ts). Nur wenn das Lager für einen Artikel keinen Preis /
// kein Gewicht (> 0) hat, bleibt der bisherige CAD-Wert stehen.
// Es werden keine Werte erfunden: bleibt ein Preis oder Gewicht bei 0,
// meldet das die Funktion zurück und die Stückliste zeigt einen Hinweis.
// ============================================================

import type { MaterialItem } from '@/types/scaffold'

/** Lager-Zeile, so wie /api/inventory sie liefert (nur die benötigten Felder). */
export interface LagerZeile {
  sku?: string | null
  name?: string | null
  unit_price?: number | string | null
  weight_kg?: number | string | null
  is_active?: boolean | null
}

export interface LagerAnwendung {
  materials: MaterialItem[]
  /** Artikelnummern, deren Preis nach dem Abgleich 0 ist → „Preis im Lager pflegen". */
  ohnePreis: string[]
  /** Artikelnummern, deren Gewicht nach dem Abgleich 0 ist → „Gewicht im Lager pflegen". */
  ohneGewicht: string[]
  /** Anzahl Positionen, die Werte aus dem Lager bekommen haben. */
  ausLager: number
}

const positiv = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function wendeLagerAn(materials: MaterialItem[], lager: LagerZeile[] | null | undefined): LagerAnwendung {
  const nachSku = new Map<string, LagerZeile>()
  for (const z of lager ?? []) {
    if (z.is_active === false) continue
    const sku = (z.sku ?? '').trim()
    if (sku) nachSku.set(sku, z)
  }
  let ausLager = 0
  const out = materials.map((m) => {
    const z = nachSku.get(m.articleNumber)
    if (!z) return m
    ausLager++
    const unitPrice = positiv(z.unit_price) ?? m.unitPrice
    const weightKg = positiv(z.weight_kg) ?? m.weightKg
    const name = (z.name ?? '').trim() || m.name
    return { ...m, name, unitPrice, weightKg, totalPrice: Math.round(m.quantity * unitPrice * 100) / 100 }
  })
  return {
    materials: out,
    ohnePreis: out.filter((m) => m.unitPrice <= 0).map((m) => m.articleNumber),
    ohneGewicht: out.filter((m) => m.weightKg <= 0).map((m) => m.articleNumber),
    ausLager,
  }
}
