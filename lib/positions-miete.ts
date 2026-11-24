// ============================================================
// SCAFFOLD OS – Vorhalte-Regel je Aufmaßposition (Faktura Schritt B1, reine Logik)
//
// Ausschreibungen führen dieselbe Gerüstposition oft mehrfach mit verschiedenen Vorhaltebedingungen. Je Position (Identität = key der
// Aufmaßposition, also auch bei gleichem Namen über die Positionsnummer) gilt eine von drei Regeln:
//   baustelle : es gelten Beginn und freie Vorhaltezeit der Vorhaltevereinbarung der Baustelle (Standard)
//   eigen     : eigene freie Vorhaltezeit in Tagen (0 = ab Beginn sofort Miete, z. B. 28 für 4 Wochen) und optional eigener Beginn
//   keine     : keine eigene Miete – sie läuft in einer Hauptposition weiter (Verweis auf deren Positions-ID)
// B1 hält die Regel fest und zeigt, ab wann Miete anfällt. Berechnet und abgerechnet wird die Miete weiterhin über die Vorhaltevereinbarung
// der Baustelle; die Abrechnung je Position folgt in einem eigenen Schritt (B2). Es ändert sich kein Betrag.
// ============================================================
import { istIso, plusTage } from './vorhaltung'
import type { Vorhaltevereinbarung } from './vorhaltung'
import type { ZaPosition } from './zwischenaufmass'
import { positionsTitel } from './zwischenaufmass'

export type MietModus = 'baustelle' | 'eigen' | 'keine'

export interface PositionsMiete {
  key: string
  modus: MietModus
  /** nur bei 'eigen': freie Vorhaltezeit in Tagen ab Beginn (0 = direkt Miete) */
  freiTage?: number
  /** nur bei 'eigen': eigener Beginn der Vorhaltung dieser Position; ohne Angabe gilt der Beginn der Baustelle */
  beginn?: string
  /** nur bei 'keine': Positions-ID der Hauptposition, in der die Miete weiterläuft */
  verweisKey?: string
  notiz?: string
}

export type MietStatus = 'frei' | 'kostenpflichtig' | 'keine' | 'offen'

export interface MietStand {
  key: string
  modus: MietModus
  status: MietStatus
  /** erster kostenpflichtiger Tag (null bei keine oder fehlendem Beginn) */
  mieteAb: string | null
  freiTage: number | null
  /** lesbarer Text für die Anzeige */
  text: string
  verweisKey?: string
  verweisTitel?: string
}

const MODI: MietModus[] = ['baustelle', 'eigen', 'keine']
const de = (iso: string) => iso.split('-').reverse().join('.')

/** Liest gespeicherte Regeln defensiv: ungültige Zeilen und doppelte Positions-IDs werden verworfen. */
export function normalisierePositionsMiete(raw: unknown): PositionsMiete[] {
  if (!Array.isArray(raw)) return []
  const gesehen = new Set<string>()
  const r: PositionsMiete[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const key = typeof (x as any).key === 'string' ? (x as any).key.trim().slice(0, 160) : ''
    const modus = (x as any).modus as MietModus
    if (!key || !MODI.includes(modus) || gesehen.has(key)) continue
    gesehen.add(key)
    const eintrag: PositionsMiete = { key, modus }
    if (modus === 'eigen') {
      const t = Math.round(Number((x as any).freiTage))
      eintrag.freiTage = Number.isFinite(t) && t >= 0 && t <= 3650 ? t : 0
      if (istIso((x as any).beginn)) eintrag.beginn = (x as any).beginn
    }
    if (modus === 'keine' && typeof (x as any).verweisKey === 'string' && (x as any).verweisKey.trim()) eintrag.verweisKey = (x as any).verweisKey.trim().slice(0, 160)
    const n = typeof (x as any).notiz === 'string' ? (x as any).notiz.trim().slice(0, 300) : ''
    if (n) eintrag.notiz = n
    r.push(eintrag)
  }
  return r
}

export type MietErgebnis = { ok: true; liste: PositionsMiete[] } | { ok: false; fehler: string }

/**
 * Setzt oder ersetzt die Regel einer Position. Prüft: Position existiert im Aufmaß; 'eigen' braucht freie Tage (≥ 0);
 * 'keine' braucht eine ANDERE Hauptposition, die selbst eine Miete hat (keine Ketten, keine Kreise).
 * `modus: 'baustelle'` entfernt die Sonderregel.
 */
export function setzePositionsMiete(liste: PositionsMiete[], positionen: Pick<ZaPosition, 'key' | 'bezeichnung' | 'posNr'>[], eingabe: PositionsMiete): MietErgebnis {
  const p = positionen.find((x) => x.key === eingabe.key)
  if (!p) return { ok: false, fehler: 'Die Position gibt es im Aufmaß nicht (mehr).' }
  if (!MODI.includes(eingabe.modus)) return { ok: false, fehler: 'Bitte eine Regel wählen.' }
  const rest = liste.filter((x) => x.key !== eingabe.key)
  if (eingabe.modus === 'baustelle') return { ok: true, liste: rest }
  const neu: PositionsMiete = { key: eingabe.key, modus: eingabe.modus }
  if (eingabe.modus === 'eigen') {
    const t = eingabe.freiTage
    if (t === undefined || !Number.isFinite(t) || t < 0 || !Number.isInteger(t)) return { ok: false, fehler: `Bitte für „${positionsTitel(p)}“ die freie Vorhaltezeit in ganzen Tagen angeben (0 = sofort Miete).` }
    neu.freiTage = t
    if (eingabe.beginn) { if (!istIso(eingabe.beginn)) return { ok: false, fehler: 'Der Beginn ist kein gültiges Datum.' }; neu.beginn = eingabe.beginn }
  }
  if (eingabe.modus === 'keine') {
    const v = eingabe.verweisKey
    if (!v) return { ok: false, fehler: `Bitte für „${positionsTitel(p)}“ die Hauptposition wählen, in der die Miete weiterläuft.` }
    if (v === eingabe.key) return { ok: false, fehler: 'Eine Position kann nicht auf sich selbst verweisen.' }
    if (!positionen.some((x) => x.key === v)) return { ok: false, fehler: 'Die Hauptposition gibt es im Aufmaß nicht.' }
    if (rest.find((x) => x.key === v)?.modus === 'keine') return { ok: false, fehler: 'Die gewählte Hauptposition hat selbst keine Miete. Bitte direkt auf die Position verweisen, die die Miete trägt.' }
    neu.verweisKey = v
  }
  if (eingabe.notiz?.trim()) neu.notiz = eingabe.notiz.trim().slice(0, 300)
  // Wird diese Position selbst zur Position ohne Miete, darf keine andere mehr auf sie verweisen.
  if (neu.modus === 'keine' && rest.some((x) => x.modus === 'keine' && x.verweisKey === neu.key)) return { ok: false, fehler: 'Auf diese Position verweisen andere Positionen als Hauptposition. Bitte zuerst deren Verweis ändern.' }
  return { ok: true, liste: [...rest, neu] }
}

/** Entfernt Regeln, deren Position nicht mehr im Aufmaß steht, und Verweise auf nicht mehr vorhandene oder mietfreie Hauptpositionen. */
export function bereinigePositionsMiete(liste: PositionsMiete[], positionen: Pick<ZaPosition, 'key'>[]): PositionsMiete[] {
  const keys = new Set(positionen.map((p) => p.key))
  const aktiv = liste.filter((r) => keys.has(r.key))
  return aktiv.filter((r) => r.modus !== 'keine' || (!!r.verweisKey && keys.has(r.verweisKey) && aktiv.find((x) => x.key === r.verweisKey)?.modus !== 'keine'))
}

/** Stand der Miete je Position zum Stichtag `heute`. Ohne Sonderregel gilt die Vereinbarung der Baustelle. */
export function mietStandJePosition(
  regeln: PositionsMiete[], positionen: Pick<ZaPosition, 'key' | 'bezeichnung' | 'posNr'>[], vereinbarung: Pick<Vorhaltevereinbarung, 'aktiv' | 'beginn' | 'freiTage'> | null, heute: string,
): MietStand[] {
  const titel = new Map(positionen.map((p) => [p.key, positionsTitel(p)]))
  return positionen.map((p): MietStand => {
    const r = regeln.find((x) => x.key === p.key)
    const modus: MietModus = r?.modus ?? 'baustelle'
    if (modus === 'keine') {
      const vt = r?.verweisKey ? titel.get(r.verweisKey) : undefined
      return { key: p.key, modus, status: 'keine', mieteAb: null, freiTage: null, verweisKey: r?.verweisKey, verweisTitel: vt, text: vt ? `keine eigene Miete – läuft in ${vt} weiter` : 'keine eigene Miete – Hauptposition fehlt' }
    }
    const baustelleAktiv = !!vereinbarung && vereinbarung.aktiv !== false
    const beginn = modus === 'eigen' && r?.beginn ? r.beginn : (baustelleAktiv && istIso(vereinbarung!.beginn) ? vereinbarung!.beginn : null)
    const frei = modus === 'eigen' ? (r?.freiTage ?? 0) : (baustelleAktiv ? vereinbarung!.freiTage : null)
    if (!beginn || frei === null) return { key: p.key, modus, status: 'offen', mieteAb: null, freiTage: frei, text: modus === 'eigen' ? 'Beginn der Vorhaltung fehlt' : 'keine Vorhaltevereinbarung der Baustelle' }
    const ab = plusTage(beginn, frei)
    const status: MietStatus = ab <= heute ? 'kostenpflichtig' : 'frei'
    const dauer = frei === 0 ? 'sofort Miete' : frei % 7 === 0 ? `${frei / 7} Wochen frei` : `${frei} Tage frei`
    return { key: p.key, modus, status, mieteAb: ab, freiTage: frei, text: `${dauer} · Miete ab ${de(ab)}${modus === 'baustelle' ? ' (wie Baustelle)' : ''}` }
  })
}
