// ============================================================
// SCAFFOLD OS – Lastannahmen-Blatt für den Statiker (Daten)
//
// Baut die Inhalte des Blatts: Gerüstsystem, Geometrie, Lastklasse, Bekleidung,
// Wind-Angaben, Untergrund, Verankerung, Sonderlasten. Alle Werte sind ANGABEN
// des Planers bzw. Geometrie aus dem Modell. Es wird nichts berechnet und keine
// Windlast abgeleitet; fehlende Angaben stehen als "nicht angegeben" im Blatt.
// Kein Nachweis, keine Abnahme. Die Darstellung als PDF steht in lastannahmen-pdf.ts.
// ============================================================

import type { CADModel } from '@/lib/calculations/cad-engine'
import { BEKLEIDUNGEN, GELAENDEKATEGORIEN, SONDERLASTEN, fehlendeStatikAngaben, type StatikDaten } from '@/lib/statik-daten'
import { statikPruefpunkte } from '@/lib/statik-pruefpunkte'
import { abschnittsListe } from '@/lib/geruest/regelpruefung'
import { MJ_LISTEN } from '@/lib/mj-katalog'
import { katalogListeFuerSystem } from '@/lib/cad/katalog-zuordnung'
import { pruefeLastklassen, type LkErgebnis } from '@/lib/data/zulassung-lastklassen'

export interface LastannahmenOptionen {
  projektName: string
  firma: string
  datum: string
}

export const NICHT_ANGEGEBEN = 'nicht angegeben'

export interface LastZeile { label: string; wert: string | null } // null = nicht angegeben
export interface LastSektion {
  titel: string
  zeilen: LastZeile[]
  /** Tabelle unter den Zeilen (z. B. Abschnitte) */
  tabelle?: { kopf: string[]; zeilen: string[][] }
}
export interface LastannahmenDaten {
  titel: string
  kopf: string
  wichtig: string
  /** Pflichtangaben, die noch fehlen */
  fehlend: string[]
  sektionen: LastSektion[]
  /** Hinweise aus der Planung (Warnungen/Fehler des Modells) */
  planungshinweise: string[]
  pruefpunkte: { thema: string; text: string }[]
  fusszeile: string
}

function zahl(n: number, stellen = 2): string {
  return (Math.round(n * 10 ** stellen) / 10 ** stellen).toLocaleString('de-DE', { maximumFractionDigits: stellen })
}

function datumDe(iso?: string): string | null {
  if (!iso) return null
  const [j, m, t] = iso.split('-')
  return `${t}.${m}.${j}`
}

const LK_ERGEBNIS_TEXT: Record<LkErgebnis, string> = {
  ok: 'deckt die geplante Lastklasse ab',
  'zu-hoch': 'geplante Lastklasse höher als zulässig',
  'nicht-abgedeckt': 'Feldweite nicht in der Tabelle',
}

/** Abschnitt 6: Zulassung und Lastklassen der Beläge (Angaben der Zulassung, kein Nachweis); null, wenn für das System nichts erfasst ist */
function zulassungsSektion(model: CADModel): LastSektion | null {
  const sys = model.system
  const liste = sys ? katalogListeFuerSystem(sys.id) : null
  const weiten = model.fields.map((f) => f.lengthM)
  const pr = pruefeLastklassen(liste, weiten, model.building.lastklasse)
  if (!liste || !pr) return null
  const z = MJ_LISTEN[liste].zulassungen[0]
  const fw = (n: number) => `${zahl(n)} m`
  return {
    titel: '6. Zulassung und Lastklassen der Beläge (Angaben der Zulassung)',
    zeilen: [
      { label: 'Zulassung', wert: z ? `${z.nummer} (Bescheid vom ${z.bescheidVom}, gültig bis ${z.gueltigBis})` : pr.tabelle.zulassung },
      { label: 'Tabelle in der Zulassung', wert: `${pr.tabelle.tabelle} „Zuordnung der Beläge zu den Lastklassen“ – ${pr.tabelle.stand}` },
      { label: 'Feldweiten im Modell', wert: pr.feldweitenM.length > 0 ? pr.feldweitenM.map(fw).join(', ') : null },
      { label: 'Geplante Lastklasse', wert: pr.geplanteLk !== null ? String(pr.geplanteLk) : null },
      { label: 'Hinweis', wert: 'Die Werte stammen aus der Zulassung (von Hand aus den Tabellenseiten übertragen). Es ist KEIN Nachweis. Maßgeblich ist der aktuelle Bescheid; Einschränkungen im Text der Zulassung (Fang-/Dachfanggerüst, Belagsicherung, Gerüstbreite) sind nicht übernommen.' },
      ...(liste === 'combi' && sys?.id === 'mj-plus' ? [{ label: 'Annahme', wert: 'MJ-Plus wird hier der Zulassung MJ COMBI zugeordnet – bitte prüfen.' }] : []),
      ...(pr.tabelle.hinweis ? [{ label: 'Zur Tabelle', wert: pr.tabelle.hinweis }] : []),
    ],
    tabelle: {
      kopf: ['Belag laut Zulassung', 'Anlage', 'Höchste Lastklasse je Feldweite', ...(pr.geplanteLk !== null ? ['Abgleich'] : [])],
      zeilen: pr.zeilen.map((z2) => [
        z2.belag,
        z2.anlage,
        z2.proFeldweite.map((p) => `${fw(p.feldweiteM)}: ${p.maxLk === null ? 'nicht abgedeckt' : `≤ ${p.maxLk}`}`).join('; ') || 'keine Felder',
        ...(pr.geplanteLk !== null ? [z2.ergebnis ? LK_ERGEBNIS_TEXT[z2.ergebnis] : '-'] : []),
      ]),
    },
  }
}

export function baueLastannahmenDaten(model: CADModel, statik: StatikDaten, opt: LastannahmenOptionen): LastannahmenDaten {
  const b = model.building
  const sys = model.system
  const gelaende = GELAENDEKATEGORIEN.find((g) => g.id === statik.gelaende)
  const bekleidung = BEKLEIDUNGEN.find((x) => x.id === statik.bekleidung)
  const sonder = (statik.sonderlasten ?? []).map((id) => SONDERLASTEN.find((s) => s.id === id)?.text ?? id)
  const seiten = b.sides.map((s) => ({ front: 'Vorne', back: 'Hinten', left: 'Links', right: 'Rechts' }[s])).join(', ')
  const abschnitte = b.sections && b.sections.length >= 2 ? abschnittsListe(model) : null

  const sektionen: LastSektion[] = [
    {
      titel: '1. Gerüstsystem',
      zeilen: [
        { label: 'Hersteller / System', wert: sys ? `${sys.hersteller} ${sys.systemName}` : null },
        { label: 'Bauart', wert: sys ? sys.bauart : null },
        { label: 'Gerüstbreite', wert: sys ? `${zahl(b.geruestOptionen?.breiteM ?? sys.rahmenBreitenM[0])} m` : null },
        { label: 'Höhenraster', wert: sys ? `${zahl(sys.rasterHoeheM)} m` : null },
        { label: 'Lastklasse (DIN EN 12811-1)', wert: b.lastklasse ? String(b.lastklasse) : null },
        { label: 'Mischsysteme', wert: statik.systemmischung ? 'ja - gesonderter Nachweis nötig' : 'nein / nicht angegeben' },
      ],
    },
    {
      titel: '2. Geometrie (aus dem Modell)',
      zeilen: [
        { label: 'Gerüsthöhe', wert: `${zahl(model.totalHeightM, 1)} m` },
        { label: 'Gerüstlänge', wert: `${zahl(model.totalLengthM, 1)} m` },
        { label: 'Gerüstfläche', wert: `${zahl(model.totalAreaM2, 1)} m²` },
        { label: 'Felder / Lagen', wert: `${model.fieldCount} Felder · ${model.levelCount} Lagen` },
        { label: 'Eingerüstete Seiten', wert: seiten || null },
        { label: 'Anker im Modell', wert: String(model.anchors.length) },
        { label: 'Gebäude (L × B × H)', wert: `${zahl(b.lengthM, 1)} × ${zahl(b.widthM, 1)} × ${zahl(b.heightM, 1)} m` },
        { label: 'Wandabstand', wert: b.geruestOptionen?.wandabstandM !== undefined ? `${zahl(b.geruestOptionen.wandabstandM)} m` : 'Standardwert des Systems' },
      ],
      ...(abschnitte ? { tabelle: { kopf: ['Abschnitt', 'Länge', 'Höhe', 'Eingerüstet'], zeilen: abschnitte.map((a, i) => [String(i + 1), `${zahl(a.laengeM, 1)} m`, `${zahl(a.hoeheM, 1)} m`, a.eingeruestet ? 'ja' : 'nein']) } } : {}),
    },
    {
      titel: '3. Wind und Bekleidung (Angaben des Planers)',
      zeilen: [
        { label: 'Windnorm', wert: statik.windnorm ?? null },
        { label: 'Windzone', wert: statik.windzone ? `Zone ${statik.windzone}` : null },
        { label: 'Referenzwindgeschwindigkeit', wert: statik.vrefMs !== undefined ? `${zahl(statik.vrefMs, 1)} m/s` : null },
        { label: 'Geländekategorie', wert: gelaende ? gelaende.text : null },
        { label: 'Bekleidung', wert: bekleidung ? bekleidung.text : null },
      ],
    },
    {
      titel: '4. Lagerung und Verankerung (Angaben des Planers)',
      zeilen: [
        { label: 'Untergrund / Fußpunkte', wert: statik.untergrund ?? null },
        { label: 'Verankerungsgrund', wert: statik.verankerungsgrund ?? null },
      ],
    },
    {
      titel: '5. Nutzung, Zeitraum, Sonderlasten',
      zeilen: [
        { label: 'Nutzung', wert: statik.nutzung ? (statik.nutzung === 'oeffentlich' ? 'Öffentlich zugänglich' : 'Privat / nicht öffentlich') : null },
        { label: 'Aufbau', wert: datumDe(statik.aufbau) },
        { label: 'Abbau', wert: datumDe(statik.abbau) },
        { label: 'Sonderlasten', wert: sonder.length > 0 ? sonder.join('; ') : 'keine angegeben' },
        ...(statik.notiz ? [{ label: 'Notiz', wert: statik.notiz }] : []),
      ],
    },
  ]

  const zulSektion = zulassungsSektion(model)
  if (zulSektion) sektionen.push(zulSektion)

  return {
    titel: 'Lastannahmen und Eingangsdaten für die Statik',
    kopf: `${opt.projektName} · ${opt.firma} · Stand ${opt.datum}`,
    wichtig: 'Dieses Blatt enthält Angaben des Planers und Geometrie aus dem Modell. Es wurde nichts nachgerechnet, keine Windlast abgeleitet und kein Standsicherheitsnachweis erstellt. Den Nachweis führt der Statiker.',
    fehlend: fehlendeStatikAngaben(statik),
    sektionen,
    planungshinweise: model.warnings.filter((w) => w.type === 'error' || w.type === 'warning').map((w) => w.message),
    pruefpunkte: statikPruefpunkte(model, statik).map((p) => ({ thema: p.thema, text: p.text })),
    fusszeile: 'Erzeugt mit SCAFFOLD OS. Die fachliche Verantwortung für Planung, Nachweis und Abnahme liegt beim Fachbetrieb bzw. beim Statiker.',
  }
}
