// ============================================================
// SCAFFOLD OS – Gerüstanalyse: Kennzahlen aus dem berechneten Modell (nichts geschätzt, keine Statik)
// ============================================================

import type { CADModel } from '@/lib/calculations/cad-engine'

export interface AnalyseZeile { label: string; wert: string }
export interface Analyse { kennzahlen: AnalyseZeile[]; bauteile: { typ: string; anzahl: number }[]; hinweise: string[] }

const TYP_NAME: Record<string, string> = {
  frame: 'Rahmen', deck: 'Beläge', railing: 'Geländer', diagonal: 'Diagonalen', footplate: 'Fußplatten', coupling: 'Kupplungen', anchor: 'Anker', console: 'Konsolen',
  stair: 'Treppen', net: 'Netze', board: 'Bordbretter', protection_roof: 'Schutzdächer', safety_net: 'Fangnetze', load_plate: 'Lastplatten', corner_brace: 'Eckstreben', ladder: 'Leitern',
}
const zahl = (v: number, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

export function erzeugeAnalyse(model: CADModel, gewichtKg: number, materialkostenEur: number): Analyse {
  const flaeche = model.totalAreaM2
  const obersterBelag = Math.max(0, ...model.levels.map((l) => l.topY))
  const tiefster = Math.min(0, ...model.levels.filter((l) => l.fields.length > 0).map((l) => l.bottomY))
  const kennzahlen: AnalyseZeile[] = [
    { label: 'System', wert: model.system ? `${model.system.hersteller} ${model.system.systemName}` : 'unbekannt' },
    { label: 'Gerüstfläche', wert: `${zahl(flaeche)} m²` },
    { label: 'Felder / Lagen', wert: `${model.fieldCount} / ${model.levelCount}` },
    { label: 'Oberster Belag', wert: `${zahl(obersterBelag, 2)} m` },
    ...(tiefster < -0.005 ? [{ label: 'Tiefster Gerüstfuß-Bereich (Lage)', wert: `${zahl(tiefster, 2)} m` }] : []),
    { label: 'Anker', wert: String(model.anchors.length) },
    { label: 'Gesamtgewicht', wert: `${zahl(gewichtKg, 0)} kg` },
    ...(flaeche > 0 ? [{ label: 'Gewicht je m² Gerüstfläche', wert: `${zahl(gewichtKg / flaeche)} kg/m²` }, { label: 'Materialkosten je m² Gerüstfläche', wert: `${zahl(materialkostenEur / flaeche, 2)} €/m²` }] : []),
    { label: 'Materialkosten', wert: `${zahl(materialkostenEur, 2)} €` },
  ]
  const zaehler = new Map<string, number>()
  for (const c of model.components3D) zaehler.set(c.type, (zaehler.get(c.type) ?? 0) + 1)
  const bauteile = [...zaehler.entries()].map(([typ, anzahl]) => ({ typ: TYP_NAME[typ] ?? typ, anzahl })).sort((a, b) => b.anzahl - a.anzahl)
  const hinweise = model.warnings.filter((w) => w.type !== 'info').map((w) => w.message)
  return { kennzahlen, bauteile, hinweise }
}
