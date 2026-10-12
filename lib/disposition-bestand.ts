// ============================================================
// SCAFFOLD OS – Disposition (Schritt 6): Bestand den Materialzeilen zuordnen
//
// Reine Funktionen (ohne DB). Zwei Regeln, beide bewusst streng:
//   1. Zuordnung KI-Materialzeile ↔ Lagerartikel: Artikelnummer (SKU),
//      sonst genau gleicher Name – dieselbe Logik wie bei der Annahme
//      (lib/lager-zuordnung.ts). Früher nur per Name → Schritt 6 fand
//      Lagerartikel mit Artikelnummer nicht und meldete "neu bestellen".
//   2. Material auf ANDEREN Baustellen zählt nur dann als verfügbar,
//      wenn diese Baustelle bis zu unserem Projektbeginn abgebaut ist
//      (Projektende im Aufmaß ≤ unser Projektbeginn). Früher galt alles,
//      was dort physisch lag – auch auf noch laufenden Baustellen.
//      Fehlt unser Projektbeginn oder deren Projektende: NICHT verfügbar
//      (nichts raten).
// ============================================================

import { baueLagerIndex, findeLagerartikel, type LagerArtikelKurz } from '@/lib/lager-zuordnung';
import type { CentralStock, SiteStock } from '@/lib/calculations/disposition';

interface Zeile { name: string; quantity: number; articleNumber?: string | null }

export type LagerMitOrt = LagerArtikelKurz & { location_in_warehouse?: string | null };

/** Zentrallager: je Materialzeile der passende Lagerartikel (Schlüssel der Disposition = Zeilenname). */
export function ordneZentralbestand(materialList: Zeile[], lager: LagerMitOrt[]): CentralStock[] {
  const index = baueLagerIndex(lager);
  const out: CentralStock[] = [];
  const gesehen = new Set<string>();
  for (const zeile of materialList) {
    if (gesehen.has(zeile.name)) continue;
    const { artikel } = findeLagerartikel(zeile, index);
    if (!artikel || !(Number(artikel.quantity) > 0)) continue;
    gesehen.add(zeile.name);
    out.push({
      articleNumber: zeile.name,
      quantity: Number(artikel.quantity) || 0,
      location: (artikel as LagerMitOrt).location_in_warehouse || 'Zentrallager',
    });
  }
  return out;
}

export interface BaustellenZeile { project_id: string; inventory_id: string; quantity: number }
export interface BaustellenInfo { id: string; name: string; adresse: string | null; projektende: string | null }

/**
 * Material auf anderen Baustellen, das bis `zielBeginn` (YYYY-MM-DD) frei wird.
 * distanceKm bleibt null – die Entfernung füllt der Aufrufer (Google).
 */
export function ordneBaustellenbestand(
  materialList: Zeile[],
  lager: LagerMitOrt[],
  zeilen: BaustellenZeile[],
  projekte: BaustellenInfo[],
  zielBeginn: string | null | undefined
): SiteStock[] {
  if (!zielBeginn) return [];
  const index = baueLagerIndex(lager);
  const projektNachId = new Map(projekte.map((p) => [p.id, p]));
  const out: SiteStock[] = [];
  const schluessel = new Set<string>();
  for (const zeile of materialList) {
    const { artikel } = findeLagerartikel(zeile, index);
    if (!artikel) continue;
    // mehrere site_stock-Zeilen je (Baustelle, Artikel) zusammenfassen
    const summe = new Map<string, number>();
    for (const r of zeilen) {
      if (r.inventory_id !== artikel.id || !(Number(r.quantity) > 0)) continue;
      summe.set(r.project_id, (summe.get(r.project_id) || 0) + Number(r.quantity));
    }
    for (const [projektId, menge] of summe) {
      const p = projektNachId.get(projektId);
      if (!p || !p.projektende || p.projektende > zielBeginn) continue; // läuft noch / Ende unbekannt
      const key = `${zeile.name}|${projektId}`;
      if (schluessel.has(key)) continue;
      schluessel.add(key);
      out.push({
        siteId: projektId,
        siteName: p.name,
        address: p.adresse || '',
        articleNumber: zeile.name,
        quantity: menge,
        distanceKm: null,
        freiAb: p.projektende,
      });
    }
  }
  return out;
}
