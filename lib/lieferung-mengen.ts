// ============================================================
// SCAFFOLD OS – Liefermengen aus der Materialliste (Schritt 5)
//
// Schritt 5 (Lieferung/Abholung) füllt leere Mengenfelder aus der
// Materialliste der Kalkulation vor. Zwei Regeln:
//  • Bauteile, die in mehreren Größen vorkommen können (Rahmen, Bühnen,
//    Diagonalen, Geländer – z.B. bei gemischten Feldlängen), werden über
//    ALLE passenden Zeilen addiert, nicht nur über die erste.
//  • "Anker" zählt nur Anker-Zeilen. Früher galt auch "Kupplung" als
//    Treffer, und weil die Kupplungen in der Liste vor den Ankern stehen,
//    bekam das Feld die Kupplungs-Menge.
// ============================================================

export interface MaterialZeileKurz {
  name?: unknown;
  category?: unknown;
  quantity?: unknown;
}

export interface LieferMengen {
  arbeitsbuehnen: string;
  rahmen: string;
  diagonale: string;
  spindeltreppe: string;
  gelander: string;
  anker: string;
}

const lo = (x: unknown) => String(x ?? '').toLowerCase();

/** Summe der Mengen aller Zeilen, deren Name oder Kategorie einen der Begriffe enthält. Kein Treffer: ''. */
function summiere(liste: MaterialZeileKurz[], begriffe: string[]): string {
  const treffer = liste.filter(
    (m) => typeof m?.quantity === 'number' && begriffe.some((k) => lo(m.name).includes(k) || lo(m.category).includes(k))
  );
  if (treffer.length === 0) return '';
  return String(treffer.reduce((s, m) => s + (m.quantity as number), 0));
}

export function lieferMengenAusMaterialliste(liste: MaterialZeileKurz[] | null | undefined): LieferMengen {
  const l = Array.isArray(liste) ? liste : [];
  return {
    arbeitsbuehnen: summiere(l, ['bühne', 'buehne', 'plattform']),
    rahmen: summiere(l, ['rahmen']),
    diagonale: summiere(l, ['diagonal']),
    spindeltreppe: summiere(l, ['treppe']),
    gelander: summiere(l, ['geländ', 'gelaend', 'handlauf']),
    anker: summiere(l, ['anker']),
  };
}
