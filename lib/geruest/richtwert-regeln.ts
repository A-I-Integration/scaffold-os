// ============================================================
// SCAFFOLD OS – Richtwert-Regeln aus den Zulassungs-Eckdaten des Katalogs
//
// Grundsatz: Es wird NUR geprüft, was im Katalog als Zahl oder Datum steht. Fehlt der Wert, gibt es
// KEIN Ergebnis (die Regel schweigt): kein Grenzwert aus der Praxis, kein Text, der nach Aussehen urteilt.
// Jedes Ergebnis nennt seine Fundstelle (Katalog, Serie, Feldname) in `quelle`.
//
// INVENTUR (Stand dieses Codes) – welche Eckdaten der Katalog führt:
//   MJ_LISTEN[liste].zulassungen[]  : nummer, bescheidVom, gueltigBis, gegenstand  (Text/Datum, keine Grenzwerte)
//   LASTKLASSEN_TABELLEN[liste]     : je Belagart höchste Lastklasse nach Feldweite (aus den Zulassungstabellen)
//   NICHT vorhanden (daher keine Regel): max. Gerüsthöhe je Serie, Ankerpflicht ab Mindesthöhe,
//   Breitenklasse, Ankerabstände, Diagonal-Raster. Wer diese Regeln will, muss die Werte zuerst mit
//   Quelle in den Katalog aufnehmen.
//
// Aktive Regeln:
//   RICHTWERT_BELAG_LASTKLASSE   geplante Lastklasse gegen die Belagtabelle der Zulassung (Feldweiten aus dem Modell)
//   RICHTWERT_ZULASSUNG_GUELTIG  Gültigkeitsende (gueltigBis) der Zulassung(en) der Serie gegen das Prüfdatum
//
// Ergebnis-Status: 'ok' (grün, mit Quelle) oder 'verletzt' (rot, mit Quelle). 'verletzt' ist KEINE Sperre:
// die bewusste Entscheidung bleibt beim Prüfer. Das ist ein Abgleich mit Katalogdaten, kein Nachweis.
// ============================================================

import type { CADModel } from '@/lib/calculations/cad-engine'
import { katalogListeFuerSystem } from '@/lib/cad/katalog-zuordnung'
import { MJ_LISTEN, type MjListe, type MjListeInfo } from '@/lib/mj-katalog'
import { LASTKLASSEN_TABELLEN, pruefeLastklassen, type LastklassenTabelle } from '@/lib/data/zulassung-lastklassen'
import type { Pruefergebnis } from '@/lib/geruest/regelpruefung'

/** Die Katalogdaten, gegen die geprüft wird. Im Betrieb die echten, in Tests Fixture-Daten. */
export interface RichtwertKatalog {
  listen: Partial<Record<MjListe, Pick<MjListeInfo, 'name' | 'zulassungen'>>>
  lastklassen: Partial<Record<MjListe, LastklassenTabelle>>
}

export const ECHTER_KATALOG: RichtwertKatalog = { listen: MJ_LISTEN, lastklassen: LASTKLASSEN_TABELLEN }

export interface RichtwertOptionen {
  katalog?: RichtwertKatalog
  /** Prüfdatum; Standard: heute. Im Protokoll steht es im Text, weil das Ergebnis vom Tag abhängt. */
  heute?: Date
}

function tt(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

/** 'TT.MM.JJJJ' → Zahl JJJJMMTT; null bei ungültigem Format (dann wird der Eintrag nicht bewertet, nichts geraten). */
export function datumZahl(text: string): number | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim())
  if (!m) return null
  const [t, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || t < 1 || t > 31) return null
  return j * 10000 + mo * 100 + t
}

const heuteZahl = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()

function weitenText(w: number[]): string {
  return w.map((x) => x.toLocaleString('de-DE', { maximumFractionDigits: 2 })).join(', ') + ' m'
}

export function richtwertErgebnisse(model: CADModel, opt: RichtwertOptionen = {}): Pruefergebnis[] {
  const out: Pruefergebnis[] = []
  const katalog = opt.katalog ?? ECHTER_KATALOG
  const heute = opt.heute ?? new Date()
  if (!model.system) return out
  const liste = katalogListeFuerSystem(model.system.id)
  if (!liste) return out
  const info = katalog.listen[liste]
  const serie = info ? `${info.name} (${liste})` : liste

  // ---- 1. Belag und Lastklasse: Tabelle der Zulassung gegen Feldweiten und geplante Lastklasse
  const lk = model.building.lastklasse
  const tabelle = katalog.lastklassen[liste]
  if (tabelle && lk !== undefined && model.fields.length > 0) {
    const pr = pruefeLastklassen(liste, model.fields.map((f) => f.lengthM), lk, katalog.lastklassen)
    if (pr && pr.zeilen.length > 0) {
      const ok = pr.zeilen.filter((z) => z.ergebnis === 'ok')
      const zuHoch = pr.zeilen.filter((z) => z.ergebnis === 'zu-hoch').length
      const offen = pr.zeilen.filter((z) => z.ergebnis === 'nicht-abgedeckt').length
      const quelle = `Katalog, Serie ${serie}: Zulassung ${tabelle.zulassung}, ${tabelle.tabelle}, ${tabelle.stand} (LASTKLASSEN_TABELLEN['${liste}'].belaege[].stufen)`
      if (ok.length > 0) {
        const namen = ok.slice(0, 3).map((z) => z.belag).join('; ') + (ok.length > 3 ? ' …' : '')
        out.push({
          id: 'RICHTWERT_BELAG_LASTKLASSE', regel: 'Belag und Lastklasse laut Zulassung', status: 'ok', art: 'geprueft',
          begruendung: `Lastklasse ${lk} bei den Feldweiten ${weitenText(pr.feldweitenM)}: ${ok.length} von ${pr.zeilen.length} Belagarten der Zulassung decken sie ab (${namen}). Welche Belagart verbaut wird, steht im Modell nicht fest.`,
          quelle,
        })
      } else {
        out.push({
          id: 'RICHTWERT_BELAG_LASTKLASSE', regel: 'Belag und Lastklasse laut Zulassung', status: 'verletzt', art: 'geprueft',
          begruendung: `Lastklasse ${lk} bei den Feldweiten ${weitenText(pr.feldweitenM)}: keine der ${pr.zeilen.length} Belagarten der Zulassungstabelle deckt sie ab (${zuHoch} mit niedrigerer höchster Lastklasse, ${offen} mit Feldweite außerhalb der Tabelle). Lastklasse oder Feldweite ändern, oder die Entscheidung begründen.`,
          quelle,
        })
      }
    }
  }

  // ---- 2. Zulassung gültig: Feld gueltigBis gegen das Prüfdatum
  const zulassungen = (info?.zulassungen ?? []).map((z) => ({ z, bis: datumZahl(z.gueltigBis) })).filter((x): x is { z: typeof x.z; bis: number } => x.bis !== null)
  if (info && zulassungen.length > 0) {
    const h = heuteZahl(heute)
    const abgelaufen = zulassungen.filter((x) => x.bis < h)
    const gueltig = zulassungen.filter((x) => x.bis >= h)
    const liste_ = (a: typeof zulassungen) => a.map((x) => `${x.z.nummer} (bis ${x.z.gueltigBis})`).join(', ')
    const quelle = `Katalog, Serie ${serie}: MJ_LISTEN['${liste}'].zulassungen[].gueltigBis; Prüfdatum ${tt(heute)}`
    if (abgelaufen.length === 0) {
      out.push({ id: 'RICHTWERT_ZULASSUNG_GUELTIG', regel: 'Zulassung gültig', status: 'ok', art: 'geprueft', begruendung: `Laut Katalog gültig: ${liste_(gueltig)}.`, quelle })
    } else if (gueltig.length === 0) {
      out.push({ id: 'RICHTWERT_ZULASSUNG_GUELTIG', regel: 'Zulassung gültig', status: 'verletzt', art: 'geprueft', begruendung: `Laut Katalog abgelaufen: ${liste_(abgelaufen)}. Aktuellen Bescheid beim Hersteller bzw. auf dibt.de prüfen.`, quelle })
    } else {
      // Teils gültig, teils abgelaufen: der Katalog ordnet die Zulassungen keiner Systemvariante zu, also wird nichts als Verstoß gewertet.
      out.push({ id: 'RICHTWERT_ZULASSUNG_GUELTIG', regel: 'Zulassung gültig', status: 'warnung', art: 'hinweis', begruendung: `Laut Katalog abgelaufen: ${liste_(abgelaufen)}; gültig: ${liste_(gueltig)}. Der Katalog ordnet die Zulassungen nicht einzelnen Systemvarianten zu: bitte prüfen, welche für das Projekt gilt.`, quelle })
    }
  }

  return out
}
