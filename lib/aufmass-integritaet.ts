// ============================================================
// SCAFFOLD OS – Integrität der Aufmaß-Abrechnung (Faktura F7-Sicherung, reine Logik)
// Wird vom Server benutzt, damit die Mengenprüfung nicht nur im Dialog stattfindet.
// ============================================================
import {
  normalisiereZwischenaufmasse, baueTeilleistungsPositionen, baueTeilleistungsPosition, baueSchlussaufmassPositionen, positionsKey, pruefePositionenGegenStand, aktuellerStandJePosition,
  type Zwischenaufmass,
} from '@/lib/zwischenaufmass'

const runde2 = (n: number) => Math.round(n * 100) / 100

/** Fingerabdruck eines Zwischenaufmaßes: ändert sich, sobald Stichtag, Menge, Preis oder Positionen anders sind. */
export function aufmassStand(z: Zwischenaufmass): string {
  return JSON.stringify([z.id, z.stichtag, runde2(z.flaecheM2), (z.positionen || []).map((p) => [p.key, runde2(p.menge), runde2(p.einzelpreis), runde2(p.vertragsmenge ?? 0)])])
}

export interface RechnungsPos { bezeichnung: string; menge: number; einheit: string; einzelpreis: number }
export type AufmassBezugFehler = { code: 'AUFMASS_NICHT_GEFUNDEN' | 'AUFMASS_GEAENDERT' | 'AUFMASS_ABWEICHUNG' | 'AUFMASS_BEREITS_ABGERECHNET' | 'AUFMASS_NUR_ABSCHLAG' | 'AUFMASS_SCHLUSS_ABWEICHUNG'; text: string }

/** Prüft, ob die angebotenen Rechnungspositionen genau der noch nicht abgerechneten Differenz des Zwischenaufmaßes entsprechen. */
export function pruefeAufmassBezug(args: {
  rohListe: unknown; zaId: string; stand: string; positionen: RechnungsPos[]; rechnungsart: string
}): { ok: true; za: Zwischenaufmass; roh: unknown } | { ok: false; fehler: AufmassBezugFehler } {
  const f = (code: AufmassBezugFehler['code'], text: string) => ({ ok: false as const, fehler: { code, text } })
  if (args.rechnungsart !== 'abschlag' && args.rechnungsart !== 'schluss') return f('AUFMASS_NUR_ABSCHLAG', 'Ein Zwischenaufmaß kann nur mit einer Abschlags- oder Schlussrechnung abgerechnet werden.')
  const liste = normalisiereZwischenaufmasse(args.rohListe)
  const za = liste.find((z) => z.id === args.zaId)
  const roh = Array.isArray(args.rohListe) ? (args.rohListe as any[]).find((x) => x?.id === args.zaId) : undefined
  if (!za || !roh) return f('AUFMASS_NICHT_GEFUNDEN', 'Das Zwischenaufmaß gibt es nicht mehr. Bitte die Seite neu laden.')
  if (za.rechnungId) return f('AUFMASS_BEREITS_ABGERECHNET', `${'ZA-' + String(za.nr).padStart(2, '0')} ist bereits mit ${za.rechnungNr || 'einer Rechnung'} abgerechnet. Es wird nicht noch einmal berechnet.`)
  if (aufmassStand(za) !== args.stand) return f('AUFMASS_GEAENDERT', 'Das Zwischenaufmaß wurde geändert, seit der Dialog geöffnet wurde. Bitte den Dialog schließen und neu öffnen.')
  if (args.rechnungsart === 'schluss') {
    // Schlussaufmaß: die Rechnung beginnt mit der GESAMTLEISTUNG je Position (kumuliert × Preis); danach folgen Zusatzpositionen und der
    // Abzug der Abschläge, die hier nicht aus dem Aufmaß stammen und von den Abrechnungsprüfungen (Auftragswert, Schluss schließt ab) erfasst werden.
    const r = baueSchlussaufmassPositionen(za, liste)
    if (r.fehler) return f('AUFMASS_SCHLUSS_ABWEICHUNG', r.fehler)
    const ok = r.positionen.every((e, i) => {
      const p = args.positionen[i]
      return !!p && p.einheit === e.einheit && Math.abs(Number(p.menge) - e.menge) < 0.005 && Math.abs(Number(p.einzelpreis) - e.einzelpreis) < 0.005
    })
    if (!ok) return f('AUFMASS_SCHLUSS_ABWEICHUNG', 'Die Rechnungspositionen stimmen nicht mit der Gesamtleistung des Schlussaufmaßes überein. Bitte den Dialog neu öffnen.')
    return { ok: true, za, roh }
  }
  let erwartet: RechnungsPos[]
  if (za.positionen?.length) {
    const r = baueTeilleistungsPositionen(za, liste)
    if (r.fehler) return f('AUFMASS_ABWEICHUNG', r.fehler)
    erwartet = r.positionen
  } else {
    // Altes Aufmaß nur mit Gesamtfläche: Menge steht fest, der Preis je m² kommt aus der Rechnung
    const preis = Number(args.positionen[0]?.einzelpreis) || 0
    const r = baueTeilleistungsPosition({ z: za, liste, preisProM2: preis })
    if (!r.position) return f('AUFMASS_ABWEICHUNG', r.fehler || 'Keine neue Menge abrechenbar.')
    erwartet = [r.position]
  }
  const gleich = args.positionen.length === erwartet.length && erwartet.every((e, i) => {
    const p = args.positionen[i]
    return !!p && p.einheit === e.einheit && Math.abs(Number(p.menge) - e.menge) < 0.005 && Math.abs(Number(p.einzelpreis) - e.einzelpreis) < 0.005
  })
  if (!gleich) return f('AUFMASS_ABWEICHUNG', 'Die Rechnungspositionen stimmen nicht mit der noch nicht abgerechneten Menge des Zwischenaufmaßes überein. Bitte den Dialog neu öffnen.')
  return { ok: true, za, roh }
}

/** Freie Positionen (ohne Bezug zum Aufmaß), die denselben Namen und dieselbe Einheit wie eine aufgemessene Position tragen. */
export function freiePositionenMitAufmassName(rohListe: unknown, positionen: { bezeichnung: string; einheit: string }[]): string[] {
  const keys = new Map<string, string>()
  for (const z of normalisiereZwischenaufmasse(rohListe)) for (const p of z.positionen || []) keys.set(p.key, p.bezeichnung)
  return positionen.map((p) => keys.get(positionsKey(p.bezeichnung, p.einheit))).filter((x): x is string => !!x)
}

const gesperrt = (raw: any): boolean => !!raw && (!!raw.rechnungId || !!raw.reserviertAm)

/**
 * Schutz gegen nachträgliche Änderung: Ein bereits abgerechnetes (oder gerade reserviertes) Zwischenaufmaß darf über die normale
 * Speicherroute weder geändert noch gelöscht werden, und niemand kann sich dort selbst eine Rechnung zuordnen.
 * Korrekturen sind ein NEUES Zwischenaufmaß (mit Begründung), keine Änderung des alten.
 */
export function pruefeAufmassAenderung(altRoh: unknown, neuRoh: unknown): string | null {
  const alt = Array.isArray(altRoh) ? (altRoh as any[]) : []
  const neu = Array.isArray(neuRoh) ? (neuRoh as any[]) : []
  const altN = normalisiereZwischenaufmasse(alt); const neuN = normalisiereZwischenaufmasse(neu)
  for (const a of alt) {
    if (!gesperrt(a)) continue
    const nr = 'ZA-' + String(Number(a.nr) || 0).padStart(2, '0')
    const n = neu.find((x) => x?.id === a.id)
    if (!n) return `${nr} ist abgerechnet bzw. wird gerade abgerechnet und kann nicht gelöscht werden.`
    if (JSON.stringify(altN.find((z) => z.id === a.id)) !== JSON.stringify(neuN.find((z) => z.id === a.id)) || (!!a.reserviertAm !== !!n.reserviertAm)) {
      return `${nr} ist abgerechnet bzw. wird gerade abgerechnet und kann nicht geändert werden. Eine Korrektur erfassen Sie als neues Zwischenaufmaß mit Begründung.`
    }
  }
  // Neu gespeicherte Zwischenaufmaße je Position gegen den bisherigen Stand prüfen (nicht nur im Dialog): sinkende oder fehlende Positionen brauchen eine Begründung
  for (const zNeu of neuN) {
    if (altN.some((z) => z.id === zNeu.id) || !zNeu.positionen?.length) continue
    const aeltere = altN.filter((z) => z.nr < zNeu.nr)
    const fehler = pruefePositionenGegenStand(aktuellerStandJePosition(aeltere), zNeu.positionen, zNeu.notiz)
    if (fehler) return `ZA-${String(zNeu.nr).padStart(2, '0')}: ${fehler}`
  }
  for (const n of neu) {
    if (!n || typeof n !== 'object') continue
    const a = alt.find((x) => x?.id === n.id)
    if ((n.rechnungId || n.reserviertAm) && (!a || a.rechnungId !== n.rechnungId || a.reserviertAm !== n.reserviertAm)) {
      return 'Die Zuordnung zu einer Rechnung wird beim Anlegen der Rechnung gesetzt und kann hier nicht eingetragen werden.'
    }
  }
  return null
}
