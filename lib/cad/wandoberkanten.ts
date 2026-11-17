// ============================================================
// SCAFFOLD OS – Vorbelegung der Wandoberkanten aus den Fußboden-Koten (OKFF) der Geschosse.
// Die Oberkante der Außenwand eines Geschosses ist die Fußboden-Kote des nächsthöheren Geschosses; beim obersten Geschoss gilt die Traufe,
// sofern der Plan sie nennt. Alles nur Vorschläge in der Bestätigungskarte: ohne belegte Grundlage bleibt der eigene Wert stehen.
// ============================================================

export interface OkffEintrag { ebene: number; obenM: number }

/** Wandoberkante je Eintrag (gleiche Reihenfolge wie `eintraege`). */
export function wandOberkantenVorschlag(eintraege: OkffEintrag[], traufeM?: number): number[] {
  const sortiert = eintraege.map((e, i) => ({ ...e, i })).sort((a, b) => a.ebene - b.ebene)
  const out = eintraege.map((e) => e.obenM)
  sortiert.forEach((e, k) => {
    const naechst = sortiert[k + 1]
    if (naechst) {
      if (naechst.obenM > e.obenM) out[e.i] = naechst.obenM
    } else if (e.ebene !== 99 && traufeM !== undefined && traufeM > e.obenM) {
      out[e.i] = traufeM
    }
  })
  return out
}
