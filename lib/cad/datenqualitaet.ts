// ============================================================
// SCAFFOLD OS – Zentrale Prüfung: Datenqualität des Plan-Imports und 3D-Freigabe des Modells.
//
// Eine Stelle, zwei Eingänge:
//  - pruefePlanImport(PlanImport): Was wurde aus dem Plan gelesen, wie belastbar ist es, was fehlt oder widerspricht sich?
//  - pruefeModell3D(CADModel): Stimmt das erzeugte Modell mit sich selbst und mit dem Gelände überein?
// Ergebnis ist ein Prüfbericht mit Ampel (grün / gelb / rot). Fehlende Werte bleiben „fehlt“ – sie werden nie durch 0 ersetzt.
// Die Quelle eines Wertes ist die Art der Zeichnung (Grundriss, Ansicht, Schnitt …), keine Dateinamen.
// Hohe KI-Sicherheit allein macht einen Wert nicht grün: Maße aus KI/Schätzung bleiben gelb, bis sie gemessen oder bestätigt sind.
// ============================================================

import { gelaendeHoeheFn, type CADModel, type CADWarning } from '@/lib/calculations/cad-engine'
import { FUSSPLATTE_UNTERKANTE_REL_M } from '@/lib/cad/hang-geometrie'
import type { PlanImport } from '@/lib/cad/plan-import'

export type Ampel = 'gruen' | 'gelb' | 'rot'
export type Erkennung = 'vektor' | 'text' | 'raster' | 'ki' | 'manuell' | 'berechnet'
export type Konfidenz = 'gemessen' | 'gelesen' | 'geschaetzt' | 'fehlt'

export interface PruefWert {
  schluessel: string
  bezeichnung: string
  /** undefined = nicht erkannt (nie 0 als Ersatz) */
  wert?: number | string
  einheit?: string
  /** Art der Zeichnung bzw. Berechnung, z. B. „Grundriss“, „Ansicht“, „Schnitt“ */
  quelle: string
  methode: Erkennung
  konfidenz: Konfidenz
  ampel: Ampel
  hinweis?: string
}

export interface Befund {
  code: string
  ampel: Ampel
  titel: string
  detail: string
}

export interface Pruefbericht {
  ampel: Ampel
  befunde: Befund[]
  werte: PruefWert[]
}

const RANG: Record<Ampel, number> = { gruen: 0, gelb: 1, rot: 2 }
export const schlechtereAmpel = (a: Ampel, b: Ampel): Ampel => (RANG[a] >= RANG[b] ? a : b)
export const gesamtAmpel = (liste: { ampel: Ampel }[]): Ampel => liste.reduce<Ampel>((m, x) => schlechtereAmpel(m, x.ampel), 'gruen')
export const AMPEL_TEXT: Record<Ampel, string> = { gruen: 'Grün: ausreichend belegt, widerspruchsfrei', gelb: 'Gelb: teilweise erkannt, mit Unsicherheiten', rot: 'Rot: wesentliche Daten fehlen oder widersprechen sich' }

const de = (v: number, n = 2) => v.toFixed(n).replace('.', ',')
const GAENGIGE_MASSSTAEBE = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500]

/** CAD-Meldungen für die bestehende Warnungsanzeige (nur Auffälliges; grüne Befunde erzeugen keine Meldung). */
export function alsWarnungen(b: Pruefbericht, vorsatz = 'PRUEF'): CADWarning[] {
  return b.befunde.filter((x) => x.ampel !== 'gruen').map((x) => ({
    type: x.ampel === 'rot' ? 'error' as const : 'warning' as const,
    code: `${vorsatz}_${x.code}`,
    message: `${x.titel}: ${x.detail}`,
  }))
}

// ------------------------------------------------------------
// Plan-Import
// ------------------------------------------------------------

export function pruefePlanImport(pl: PlanImport | null | undefined): Pruefbericht {
  const befunde: Befund[] = []
  const werte: PruefWert[] = []
  const b = (code: string, ampel: Ampel, titel: string, detail: string) => befunde.push({ code, ampel, titel, detail })
  if (!pl) {
    b('KEIN_PLAN', 'rot', 'Plan nicht lesbar', 'Aus der Datei konnte kein Vektor-Grundriss gelesen werden. Es werden keine Maße übernommen; bitte Werte manuell eintragen.')
    return { ampel: 'rot', befunde, werte }
  }

  // Maßstab
  const m = pl.massstab
  if (!(m > 0)) b('MASSSTAB', 'rot', 'Maßstab', 'Kein Maßstab erkannt: alle Längen sind unbelegt.')
  else if (!GAENGIGE_MASSSTAEBE.includes(m)) b('MASSSTAB', 'gelb', 'Maßstab', `1:${m} ist kein üblicher Planmaßstab – Längen bitte mit einer Maßkette im Plan abgleichen.`)
  // Maßzahlen gegen die gezeichneten Maßlinien: bestätigt den Maßstab (oder weist auf einen falschen hin)
  const mk = pl.masse
  if (mk && mk.angaben.length >= 5) {
    if (mk.besterMassstab && mk.besterMassstab !== m) b('MASSSTAB_MASSKETTEN', 'gelb', 'Maßstab laut Maßketten', `Die gezeichneten Maßlinien passen zu den Maßzahlen eher bei 1:${mk.besterMassstab} als bei 1:${m} (${Math.round((mk.trefferAnteil ?? 0) * 100)} % Treffer). Maßstab bitte mit einer Maßkette im Plan abgleichen.`)
    else if (mk.bestaetigt / mk.angaben.length >= 0.6) b('MASSKETTEN_OK', 'gruen', 'Maßketten bestätigt', `${mk.bestaetigt} von ${mk.angaben.length} Maßzahlen haben eine passende gezeichnete Maßlinie bei 1:${m}; der Maßstab ist damit doppelt belegt.`)
    else b('MASSKETTEN_TEILWEISE', 'gelb', 'Maßketten nur teilweise bestätigt', `Nur ${mk.bestaetigt} von ${mk.angaben.length} Maßzahlen haben eine passende Maßlinie (${mk.abweichend} weichen ab, ${mk.ohneLinie} ohne Linie). Maße bitte stichprobenartig prüfen.`)
  }
  // Maße je Geschoss gegen bestätigte Maßketten NEBEN dem Geschoss: passt eine Seite nicht, aber eine Maßkette liegt knapp daneben, ist das ein Hinweis
  // (z. B. Dachüberstand oder Attika in der Kontur, Maßkette meint die Wand). Nur Hinweis, die Maße werden nicht geändert.
  if (mk && m > 0) {
    const rand = 4 / ((0.0254 / 72) * m)
    for (const g of pl.geschosse.filter((q) => q.ebene >= 0 && q.bboxPt)) {
      const [x0, y0, x1, y1] = g.bboxPt!
      const nah = mk.angaben.filter((a) => a.status === 'bestaetigt' && a.x >= x0 - rand && a.x <= x1 + rand && a.y >= y0 - rand && a.y <= y1 + rand && !(a.x > x0 && a.x < x1 && a.y > y0 && a.y < y1))
      for (const dim of [g.laengeM, g.breiteM]) {
        if (nah.some((a) => Math.abs(a.textM - dim) <= 0.005 * dim)) continue
        const knapp = nah.filter((a) => Math.abs(a.textM - dim) <= 0.06 * dim).sort((p1, p2) => Math.abs(p1.textM - dim) - Math.abs(p2.textM - dim))[0]
        if (knapp) b('MASS_GESCHOSS_ABWEICHT', 'gelb', `Maß ${g.titel}`, `Gemessen ${de(dim)} m, aber neben dem Grundriss steht die bestätigte Maßkette ${knapp.text} m. Der Grundriss enthält vermutlich mehr als die Wand (z. B. Überstand): bitte im Plan prüfen, welches Maß gilt.`)
      }
    }
  }
  werte.push({ schluessel: 'massstab', bezeichnung: 'Maßstab', wert: m > 0 ? `1:${m}` : undefined, quelle: 'Plankopf/Zeichnung', methode: 'text', konfidenz: m > 0 ? (GAENGIGE_MASSSTAEBE.includes(m) ? 'gelesen' : 'geschaetzt') : 'fehlt', ampel: !(m > 0) ? 'rot' : GAENGIGE_MASSSTAEBE.includes(m) ? 'gruen' : 'gelb' })

  // Geschosse und Hauptkörper
  const haupt = pl.geschosse.find((g) => g.ebene === pl.hauptEbene)
  if (pl.geschosse.length === 0 || !haupt) {
    b('GRUNDRISS', 'rot', 'Grundriss', 'Kein Geschoss-Grundriss erkannt: Länge und Breite fehlen.')
  } else {
    const gross = (v: number, min: number, max: number) => v >= min && v <= max
    const lOk = gross(haupt.laengeM, 3, 80), bOk = gross(haupt.breiteM, 3, 50)
    werte.push({ schluessel: 'gebaeude.laengeM', bezeichnung: 'Gebäudelänge', wert: haupt.laengeM, einheit: 'm', quelle: 'Grundriss', methode: 'vektor', konfidenz: 'gemessen', ampel: lOk ? 'gruen' : 'gelb' })
    werte.push({ schluessel: 'gebaeude.breiteM', bezeichnung: 'Gebäudebreite', wert: haupt.breiteM, einheit: 'm', quelle: 'Grundriss', methode: 'vektor', konfidenz: 'gemessen', ampel: bOk ? 'gruen' : 'gelb' })
    if (!lOk || !bOk) b('MASSE_UNPLAUSIBEL', 'gelb', 'Gebäudemaße', `${de(haupt.laengeM)} × ${de(haupt.breiteM)} m liegen außerhalb des üblichen Bereichs – Maßstab und Zuordnung prüfen.`)
    // Hüllrechteck gegen echte Fläche: eine Fläche, die größer als das Rechteck ist, kann nicht stimmen; deutlich kleiner heißt: kein Rechteck (L-Form o. Ä.)
    const rechteck = haupt.laengeM * haupt.breiteM
    // Länge × Breite beschreiben den Hauptkörper OHNE Vorbauten, die Fläche des Geschosses enthält sie: Vorbauflächen vorher abziehen, sonst entsteht ein Scheinwiderspruch
    const vorbauM2 = (haupt.vorbauten ?? []).reduce((q, v) => q + v.flaecheM2, 0)
    const flaecheHaupt = haupt.flaecheM2 - vorbauM2
    if (flaecheHaupt > rechteck * 1.03) b('FLAECHE_WIDERSPRUCH', 'rot', 'Grundrissfläche', `Fläche ${de(flaecheHaupt, 1)} m² ist größer als Länge × Breite (${de(rechteck, 1)} m²) – Maße widersprechen sich.`)
    else if (flaecheHaupt < rechteck * 0.8) b('KEIN_RECHTECK', 'gelb', 'Grundrissform', `Der Grundriss füllt nur ${Math.round((flaecheHaupt / rechteck) * 100)} % des Rechtecks ${de(haupt.laengeM)} × ${de(haupt.breiteM)} m (L-Form, Rücksprung oder offene Kontur). Das Modell nimmt ein Rechteck an – Umriss prüfen.`)
    // Geschosse
    const ebenen = [...new Set(pl.geschosse.map((g) => g.ebene))].sort((x, y) => x - y)
    const luecke = ebenen.some((e, i) => i > 0 && e - ebenen[i - 1] > 1)
    if (luecke) b('GESCHOSSLUECKE', 'gelb', 'Geschosse', `Die erkannten Geschosse (${ebenen.join(', ')}) sind nicht lückenlos – ein Geschoss fehlt oder ist falsch zugeordnet.`)
    const abweichend = pl.geschosse.filter((g) => g.ebene >= 0 && (Math.abs(g.laengeM - haupt.laengeM) > 0.3 || Math.abs(g.breiteM - haupt.breiteM) > 0.3))
    if (abweichend.length) b('GESCHOSS_MASSE', 'gelb', 'Maße je Geschoss', `${abweichend.length} Geschoss(e) haben andere Außenmaße als das Hauptgeschoss (Rücksprung oder Fehlzuordnung) – Obergeschosse werden mittig angenommen.`)
    werte.push({ schluessel: 'geschosse', bezeichnung: 'Geschosse', wert: pl.geschosse.length, quelle: 'Grundriss', methode: 'vektor', konfidenz: 'gemessen', ampel: luecke ? 'gelb' : 'gruen' })
    if (haupt.vorbauten?.length) b('VORBAUTEN', 'gelb', 'Vorbauten', `${haupt.vorbauten.length} Vorbau(ten) sind in Länge/Breite nicht enthalten.`)
    if (haupt.oeffnungenAbseits) b('OEFFNUNGEN_ABSEITS', 'gelb', 'Öffnungen', `${haupt.oeffnungenAbseits} Öffnung(en) liegen an keiner Kante des Hauptkörpers und werden nicht eingezeichnet.`)
    if (!(haupt.fenster || haupt.tueren) && !haupt.oeffnungen?.length) b('OEFFNUNGEN_FEHLEN', 'gelb', 'Fenster und Türen', 'Keine Öffnungen erkannt – Türen und Durchgänge bitte prüfen (Zugang, Treppe).')
  }

  // Höhen
  const ersterDachwert = pl.firstKoteM, traufe = pl.traufKoteM
  werte.push({ schluessel: 'gebaeude.firstM', bezeichnung: 'Firsthöhe', wert: ersterDachwert, einheit: 'm', quelle: 'Schnitt/Ansicht', methode: 'text', konfidenz: ersterDachwert === undefined ? 'fehlt' : 'gelesen', ampel: ersterDachwert === undefined ? 'gelb' : 'gruen' })
  werte.push({ schluessel: 'gebaeude.traufeM', bezeichnung: 'Traufhöhe', wert: traufe, einheit: 'm', quelle: 'Schnitt/Ansicht', methode: 'text', konfidenz: traufe === undefined ? 'fehlt' : 'gelesen', ampel: traufe === undefined ? 'gelb' : 'gruen' })
  if (ersterDachwert === undefined || traufe === undefined) b('HOEHEN_FEHLEN', 'gelb', 'Höhen', `${ersterDachwert === undefined ? 'Firsthöhe' : ''}${ersterDachwert === undefined && traufe === undefined ? ' und ' : ''}${traufe === undefined ? 'Traufhöhe' : ''} nicht eindeutig gelesen – nichts wird geraten; bitte eintragen.`)
  else if (!(ersterDachwert > traufe)) b('HOEHEN_WIDERSPRUCH', 'rot', 'Höhen', `Firsthöhe ${de(ersterDachwert)} m liegt nicht über der Traufhöhe ${de(traufe)} m.`)
  else if (ersterDachwert > 60) b('HOEHEN_UNPLAUSIBEL', 'gelb', 'Höhen', `Firsthöhe ${de(ersterDachwert)} m ist ungewöhnlich hoch – Einheit (m/cm) prüfen.`)
  if (traufe !== undefined && haupt) {
    const ebenenOben = pl.geschosse.filter((g) => g.ebene >= 0).length
    const proGeschoss = ebenenOben > 0 ? traufe / ebenenOben : NaN
    if (Number.isFinite(proGeschoss) && (proGeschoss < 2.0 || proGeschoss > 4.8)) b('GESCHOSSHOEHE', 'gelb', 'Geschosshöhen', `${de(traufe)} m Traufhöhe auf ${ebenenOben} Geschoss(e) ergibt ${de(proGeschoss)} m je Geschoss – unplausibel; Geschosszahl oder Höhe prüfen.`)
  }
  werte.push({ schluessel: 'gebaeude.dachform', bezeichnung: 'Dachform', wert: pl.dachform, quelle: 'Ansicht/Schnitt', methode: 'vektor', konfidenz: pl.dachform ? 'gemessen' : 'fehlt', ampel: pl.dachform ? 'gruen' : 'gelb' })
  if (!pl.dachform) b('DACHFORM_FEHLT', 'gelb', 'Dachform', 'Dachform nicht eindeutig erkannt – bitte wählen.')

  // Gelände
  const linien = pl.gelaendeLinien ?? []
  const jeRichtung = new Set(linien.map((l) => l.art))
  const NAME = { nord: 'Nord', sued: 'Süd', ost: 'Ost', west: 'West' } as const
  for (const r of ['nord', 'sued', 'ost', 'west'] as const) {
    const l = linien.find((x) => x.art === r)
    werte.push({ schluessel: `gelaende.${NAME[r]}`, bezeichnung: `Geländelinie ${NAME[r]}`, wert: l ? `${l.profil.length} Punkte` : undefined, quelle: `Ansicht ${NAME[r]}`, methode: 'raster', konfidenz: l ? (l.sicher ? 'gemessen' : 'geschaetzt') : 'fehlt', ampel: l ? (l.sicher ? 'gruen' : 'gelb') : 'gelb', hinweis: l ? undefined : 'nicht erkannt; Höhen dieser Seite werden aus den Ecken der Nachbarseiten abgeleitet' })
  }
  if (linien.length === 0) {
    const hatKoten = (pl.gelaende?.anzahl ?? 0) >= 2 || (pl.gelaendeTiefe?.length ?? 0) > 0
    b('GELAENDE_FEHLT', hatKoten ? 'gelb' : 'gelb', 'Gelände', hatKoten ? 'Nur einzelne Geländekoten gelesen, keine Geländelinie – der Verlauf zwischen den Koten ist unbelegt.' : 'Kein Gelände erkannt: das Modell geht von ebenem Boden aus. Bei Hanglage bitte Eckhöhen eintragen.')
  } else {
    const fehlend = (['nord', 'sued', 'ost', 'west'] as const).filter((r) => !jeRichtung.has(r)).map((r) => NAME[r])
    if (fehlend.length) b('GELAENDE_SEITEN', 'gelb', 'Gelände je Seite', `Keine eigene Geländelinie für ${fehlend.join(', ')} – diese Seiten folgen den Ecken der anderen Seiten (abgeleitet, nicht gemessen).`)
    const unsicher = linien.filter((l) => !l.sicher).map((l) => l.art)
    if (unsicher.length) b('GELAENDE_UNSICHER', 'gelb', 'Geländelinie', `Lage der Ecken im Bild nicht belegt (${unsicher.map((r) => NAME[r]).join(', ')}): Fassadenbreite im Bild passt nicht zur Gebäudelänge.`)
    const alle = linien.flatMap((l) => l.profil.map((p) => p.hoeheM))
    const spanne = alle.length ? Math.max(...alle) - Math.min(...alle) : 0
    if (spanne > 15) b('GELAENDE_UNPLAUSIBEL', 'rot', 'Geländehöhen', `Höhenunterschied ${de(spanne, 1)} m im Gelände ist unplausibel für ein Wohngebäude – Koten oder Einheit prüfen.`)
    // Widerspruch zwischen Geländelinien und Tiefstkote der Ansichten
    const tief = pl.gelaendeTiefe?.length ? Math.min(...pl.gelaendeTiefe.map((g) => g.tiefsteM)) : undefined
    if (tief !== undefined && alle.length && Math.abs(Math.min(...alle) - tief) > 0.6) b('GELAENDE_WIDERSPRUCH', 'gelb', 'Gelände', `Tiefste Linie ${de(Math.min(...alle))} m, tiefste Kote ${de(tief)} m: die Angaben weichen voneinander ab.`)
  }
  return { ampel: gesamtAmpel(befunde), befunde, werte }
}

// ------------------------------------------------------------
// Dateiformate: was kann der Import tatsächlich?
// ------------------------------------------------------------

export interface FormatFaehigkeit {
  endungen: string[]
  name: string
  /** was zuverlässig gelesen wird */
  liest: string
  /** was nicht oder nur eingeschränkt gelesen wird */
  grenze: string
  stufe: 'maßhaltig' | 'eingeschraenkt' | 'nicht'
}

/** Ehrliche Fähigkeitsliste – wird dem Benutzer gezeigt, wenn ein Format nur eingeschränkt oder nicht verarbeitet werden kann. */
export const FORMAT_FAEHIGKEITEN: FormatFaehigkeit[] = [
  { endungen: ['pdf'], name: 'PDF (Vektor)', liest: 'Grundrisse, Maße, Höhenkoten, Fenster/Türen, Dach, Geländelinien aus den Zeichenlinien', grenze: 'Texte als Kurven gezeichnet oder Rasterkacheln: dann nur Teile lesbar (Raster-Pfad)', stufe: 'maßhaltig' },
  { endungen: ['jpg', 'jpeg', 'png', 'webp'], name: 'Bild / Scan / Foto', liest: 'Beschriftete Maße über die KI-Auswertung, Ansichten mit sichtbarer Geländelinie', grenze: 'Keine Maßhaltigkeit: Ziffern können abweichen, Maßstab nicht verlässlich – immer gelb bis zur Bestätigung', stufe: 'eingeschraenkt' },
  { endungen: ['dxf'], name: 'DXF', liest: 'Umriss und Wände aus Linien/Polylinien', grenze: 'Maßeinheit muss in der Datei stehen; Höhen nur, wenn als Elevation vorhanden', stufe: 'maßhaltig' },
  { endungen: ['dwg'], name: 'DWG', liest: 'nichts direkt', grenze: 'Wird nicht gelesen – bitte als DXF, IFC oder PDF exportieren', stufe: 'nicht' },
  { endungen: ['ifc'], name: 'IFC', liest: 'Geschosse, Wände, Öffnungen aus dem Bauwerksmodell', grenze: 'Nur Außenmaße; Gelände nur, wenn im Modell enthalten', stufe: 'maßhaltig' },
  { endungen: ['obj', 'glb', 'gltf'], name: 'OBJ / GLB / glTF', liest: 'Außenmaße und Teile des 3D-Modells', grenze: 'Einheit und Ausrichtung müssen stimmen (Meter, Y oben); Geschosse werden nicht erkannt', stufe: 'eingeschraenkt' },
  { endungen: ['ply', 'las', 'laz', 'e57'], name: 'Punktwolke', liest: 'Hüllmaße aus den Punkten', grenze: 'Keine Bauteile, keine Öffnungen ohne Auswertung', stufe: 'eingeschraenkt' },
]

export function formatFaehigkeit(dateiname: string): FormatFaehigkeit | null {
  const ext = /\.([a-z0-9]+)$/i.exec(dateiname)?.[1]?.toLowerCase()
  if (!ext) return null
  return FORMAT_FAEHIGKEITEN.find((f) => f.endungen.includes(ext)) ?? null
}

/** Meldung für den Benutzer; null, wenn das Format maßhaltig gelesen wird. */
export function formatHinweis(dateiname: string): string | null {
  const f = formatFaehigkeit(dateiname)
  if (!f) return 'Dieses Dateiformat wird nicht gelesen. Bitte als PDF (Vektor), DXF, IFC oder Bild exportieren.'
  if (f.stufe === 'nicht') return `${f.name}: ${f.grenze}.`
  if (f.stufe === 'eingeschraenkt') return `${f.name}: ${f.grenze}.`
  return null
}

// ------------------------------------------------------------
// 3D-Prüfung vor der Freigabe
// ------------------------------------------------------------

export interface Pruef3DOptionen {
  /** erlaubte Abweichung Fußplatten-Unterseite zu Gelände in m (Netzauflösung der Darstellung ≤ 2 cm) */
  toleranzM?: number
}

export interface FussAbweichung { id: string; x: number; z: number; gelaendeY: number; plattenY: number; abweichungM: number }

/** Je Fußplatte: Gelände-Y (selbe Fläche wie die Darstellung), Plattenunterseite und Abweichung. Leer, wenn die Fläche nicht definiert ist. */
export function fussAbweichungen(model: CADModel): FussAbweichung[] | null {
  const b = model.building
  if ((b.sections && b.sections.length >= 2) || (b.umriss && b.umriss.length >= 3)) return null
  const gf = gelaendeHoeheFn(b)
  const W = b.widthM || 0
  return model.components3D.filter((c) => c.type === 'footplate').map((c) => {
    const gelaendeY = gf(c.position[0], c.position[2] + W / 2 + 0.5)
    const plattenY = c.position[1] + FUSSPLATTE_UNTERKANTE_REL_M
    return { id: c.id, x: c.position[0], z: c.position[2], gelaendeY, plattenY, abweichungM: plattenY - gelaendeY }
  })
}

export function pruefeModell3D(model: CADModel, opt: Pruef3DOptionen = {}): Pruefbericht {
  const tol = opt.toleranzM ?? 0.02
  const befunde: Befund[] = []
  const b = (code: string, ampel: Ampel, titel: string, detail: string) => befunde.push({ code, ampel, titel, detail })
  const bg = model.building
  const fields = model.fields ?? []
  const comps = model.components3D ?? []

  // 1 + 7: Geometrie und Höhen
  const zahlen = [bg.lengthM, bg.widthM, bg.heightM, bg.eavesHeightM]
  if (zahlen.some((v) => !Number.isFinite(v))) b('GEOMETRIE_NAN', 'rot', 'Gebäudegeometrie', 'Ein Maß ist keine Zahl.')
  else if (!(bg.lengthM > 0) || !(bg.widthM > 0) || !(bg.heightM > 0)) b('GEOMETRIE_NULL', 'rot', 'Gebäudegeometrie', 'Länge, Breite oder Höhe ist 0 – ein fehlender Wert wurde nicht ergänzt, das Modell ist nicht freigabefähig.')
  else {
    if (bg.eavesHeightM > bg.heightM + 1e-6) b('HOEHE_TRAUFE', 'rot', 'Höhen', `Traufhöhe ${de(bg.eavesHeightM)} m liegt über der Gebäudehöhe ${de(bg.heightM)} m.`)
    if (bg.heightM > 60 || bg.lengthM > 120 || bg.widthM > 80) b('MASSE_GROSS', 'gelb', 'Höhen und Abstände', `Maße ${de(bg.lengthM, 1)} × ${de(bg.widthM, 1)} × ${de(bg.heightM, 1)} m sind ungewöhnlich groß – Einheit prüfen.`)
    const proGeschoss = bg.floors > 0 ? bg.eavesHeightM / bg.floors : NaN
    if (Number.isFinite(proGeschoss) && (proGeschoss < 2.0 || proGeschoss > 4.8)) b('GESCHOSSHOEHE', 'gelb', 'Geschosshöhen', `${de(proGeschoss)} m je Geschoss (${bg.floors} Geschosse bis Traufe ${de(bg.eavesHeightM)} m) – unplausibel.`)
  }

  // 2: alle Gerüstseiten vorhanden
  if (fields.length === 0) b('KEINE_FELDER', 'rot', 'Gerüst', 'Das Modell enthält keine Felder.')
  else {
    // Umriss-Modus: Alle Felder gehören zu Kanten (side 'front' + kante), vorne/hinten/links/rechts gibt es dort nicht – kein Fehler
    const umrissModus = fields.some((f) => f.kante !== undefined)
    const fehlend = umrissModus ? [] : (bg.sides ?? []).filter((sd) => !fields.some((f) => f.side === sd))
    if (fehlend.length) b('SEITE_FEHLT', 'rot', 'Gerüstseiten', `Für gewählte Seite(n) ${fehlend.join(', ')} gibt es kein Feld.`)
  }

  // 3 + 4 + 5: Fußpunkte auf dem Gelände (Treppenfüße sind Fußplatten und gehören dazu)
  const fuesse = fussAbweichungen(model)
  const plattenAnzahl = comps.filter((c) => c.type === 'footplate').length
  if (fields.length > 0 && plattenAnzahl === 0) b('KEINE_FUESSE', 'rot', 'Fußpunkte', 'Es gibt Felder, aber keine Fußplatten.')
  else if (fuesse === null) b('FUESSE_NICHT_PRUEFBAR', 'gelb', 'Fußpunkte', 'Bei mehrteiligen Gebäuden oder Umriss-Gebäuden ist keine Geländefläche definiert; die Höhe der Füße konnte nicht gegen das Gelände geprüft werden.')
  else if (fuesse.length > 0) {
    const bad = fuesse.filter((f) => !(Math.abs(f.abweichungM) <= tol))
    const schwebend = bad.filter((f) => f.abweichungM > tol), imBoden = bad.filter((f) => f.abweichungM < -tol)
    const maxAbw = Math.max(...fuesse.map((f) => Math.abs(f.abweichungM)))
    if (bad.length) {
      const stark = bad.some((f) => Math.abs(f.abweichungM) > 0.05)
      b('FUESSE_GELAENDE', stark ? 'rot' : 'gelb', 'Fußpunkte', `${schwebend.length} Ständer schweben über dem Gelände, ${imBoden.length} stehen im Boden (größte Abweichung ${de(maxAbw * 100, 1)} cm, Toleranz ${de(tol * 100, 0)} cm). Beispiel: ${bad[0].id} bei x=${de(bad[0].x)}, z=${de(bad[0].z)}.`)
    }
  }

  // 6: Feldanzahl, Fläche, Bauteilliste
  if (fields.length > 0) {
    const jeLage = new Map<number, number>()
    fields.forEach((f) => jeLage.set(f.levelIndex, (jeLage.get(f.levelIndex) ?? 0) + 1))
    const maxJeLage = Math.max(...jeLage.values())
    if (!(model.fieldCount > 0)) b('FELDZAHL_NULL', 'rot', 'Feldanzahl', `Angezeigt werden ${model.fieldCount} Felder, das Modell enthält aber ${fields.length} Felder in ${jeLage.size} Lage(n).`)
    else if (model.fieldCount > maxJeLage + 0 && model.fieldCount > fields.length) b('FELDZAHL_ZU_HOCH', 'gelb', 'Feldanzahl', `Angezeigt ${model.fieldCount} Felder je Lage, höchstens ${maxJeLage} vorhanden.`)
    if (jeLage.size > model.levelCount) b('LAGENZAHL', 'gelb', 'Lagenanzahl', `${jeLage.size} Lagen mit Feldern, angezeigt werden ${model.levelCount}.`)
    else if (model.levelCount > jeLage.size) b('LAGEN_LEER', 'gelb', 'Lagenanzahl', `Angezeigt ${model.levelCount} Lagen, nur ${jeLage.size} davon enthalten Felder (Rest liegt unter dem Gelände oder über dem Gerüst).`)
    const ids = new Set(fields.map((f) => f.id))
    const ohneBauteil = fields.filter((f) => !comps.some((c) => c.fieldId === f.id))
    if (ohneBauteil.length) b('FELD_OHNE_TEILE', 'rot', 'Bauteilliste', `${ohneBauteil.length} Feld(er) haben kein einziges Bauteil (z. B. ${ohneBauteil[0].id}).`)
    const fremd = comps.filter((c) => c.fieldId && !ids.has(c.fieldId))
    if (fremd.length) b('TEIL_OHNE_FELD', 'gelb', 'Bauteilliste', `${fremd.length} Bauteil(e) gehören zu einem Feld, das es nicht gibt.`)
    if (comps.length === 0) b('KEINE_TEILE', 'rot', 'Bauteilliste', 'Felder ohne Bauteilliste.')
    if (!(model.totalAreaM2 > 0)) b('FLAECHE_NULL', 'rot', 'Gerüstfläche', 'Die Gerüstfläche ist 0, obwohl Felder vorhanden sind.')
    else {
      const gebaut = model.gebauteFlaecheM2
      if (gebaut !== undefined && gebaut + 0.5 < model.totalAreaM2) b('FLAECHE_GEBAUT', 'gelb', 'Gerüstfläche', `Gebaute Fläche ${de(gebaut, 1)} m² ist kleiner als die Fassadenfläche ${de(model.totalAreaM2, 1)} m².`)
      const aus = fields.reduce((s, f) => s + f.lengthM * (model.levels.find((l) => l.index === f.levelIndex)?.heightM ?? 2), 0)
      if (aus > 0 && (model.totalAreaM2 > aus * 1.35 || model.totalAreaM2 < aus * 0.45)) b('FLAECHE_FELDER', 'gelb', 'Gerüstfläche', `Fläche ${de(model.totalAreaM2, 1)} m² passt nicht zu den Feldern (${de(aus, 1)} m² aus ${fields.length} Feldern).`)
    }
  }
  return { ampel: gesamtAmpel(befunde), befunde, werte: [] }
}
