// ============================================================
// SCAFFOLD OS – Angaben aus dem LV des Statikers (Excel) einlesen
//
// Liest aus den Texten der LV-Positionen nur, was dort ausdrücklich steht: Lastklasse, Breitenklasse,
// Gerüsthöhe laut Ausschreibung, Höhe des 2. Bauabschnitts und (Blatt „Daten Projekt“) die Gesamt-Vorhaltung.
// Was nicht gefunden wird, bleibt unverändert und steht in `nichtGefunden`. Es wird nichts geraten.
// ============================================================
import type { LvEingaben } from '@/lib/leistungsverzeichnis'
import { LASTKLASSEN } from '@/lib/leistungsverzeichnis'

export type Zelle = string | number | boolean | null | undefined
export interface LvBlatt { name: string; zeilen: Zelle[][] }

export interface StatikerLvErgebnis {
  /** Werte für die LV-Eingaben (nur gefundene) */
  werte: Partial<LvEingaben>
  /** was gefunden wurde, mit Fundstelle (zum Anzeigen) */
  gefunden: { label: string; wert: string; fundstelle: string }[]
  nichtGefunden: string[]
}

const zahl = (s: string): number => parseFloat(s.replace(',', '.'))
const de = (n: number): string => n.toLocaleString('de-DE', { maximumFractionDigits: 2 })

/** Liest die Angaben aus den Blättern (Zeilen von Zellen), unabhängig vom Dateiformat. */
export function leseStatikerLv(blaetter: LvBlatt[]): StatikerLvErgebnis {
  const werte: Partial<LvEingaben> = { stil: 'statiker' }
  const gefunden: StatikerLvErgebnis['gefunden'] = []
  const nichtGefunden: string[] = []
  const texte: { text: string; fundstelle: string }[] = []
  for (const b of blaetter) b.zeilen.forEach((z, i) => z.forEach((c) => { if (typeof c === 'string' && c.trim()) texte.push({ text: c, fundstelle: `Blatt „${b.name}“, Zeile ${i + 1}` }) }))
  const suche = (re: RegExp): { m: RegExpExecArray; fundstelle: string } | null => {
    for (const t of texte) { const m = re.exec(t.text); if (m) return { m, fundstelle: t.fundstelle } }
    return null
  }

  const lk = suche(/Lastklasse\s+(\d)\b/i)
  if (lk && LASTKLASSEN[Number(lk.m[1])] !== undefined) {
    werte.lastklasse = Number(lk.m[1])
    gefunden.push({ label: 'Lastklasse', wert: `${lk.m[1]} (${de(LASTKLASSEN[Number(lk.m[1])])} kN/m²)`, fundstelle: lk.fundstelle })
  } else nichtGefunden.push('Lastklasse')

  const bk = suche(/Breitenklasse\s+S?(W\s?\d{2})\b/i)
  if (bk) {
    werte.breitenklasseManuell = bk.m[1].replace(/\s/g, '').toUpperCase()
    gefunden.push({ label: 'Breitenklasse', wert: werte.breitenklasseManuell, fundstelle: bk.fundstelle })
  } else nichtGefunden.push('Breitenklasse')

  const h1 = suche(/Turmschaft\s+bis\s+(\d+(?:[.,]\d+)?)\s*m\s*Höhe/i)
  if (h1 && zahl(h1.m[1]) > 0) {
    werte.geruestHoeheAusschreibungM = zahl(h1.m[1])
    gefunden.push({ label: 'Gerüsthöhe laut Ausschreibung', wert: `${de(zahl(h1.m[1]))} m`, fundstelle: h1.fundstelle })
  } else nichtGefunden.push('Gerüsthöhe laut Ausschreibung')

  const h2 = suche(/Turmschaft\s+bis\s+ca\.?\s*(\d+(?:[.,]\d+)?)\s*m\s*Höhe/i)
  if (h2 && zahl(h2.m[1]) > 0) {
    werte.hoeheBa2M = zahl(h2.m[1])
    gefunden.push({ label: '2. Bauabschnitt: Höhe', wert: `${de(zahl(h2.m[1]))} m`, fundstelle: h2.fundstelle })
  } else nichtGefunden.push('2. Bauabschnitt: Höhe')

  // Blatt „Daten Projekt“: Zeile „Vorhaltung | Gesamt | <Zahl>“ (Einheit steht dort nicht; hier als Wochen angenommen)
  let standzeit: { wert: number; fundstelle: string } | null = null
  for (const b of blaetter) {
    if (!/daten\s*projekt/i.test(b.name)) continue
    b.zeilen.forEach((z, i) => {
      const s = z.map((c) => (typeof c === 'string' ? c.trim().toLowerCase() : c))
      if (s.includes('vorhaltung') && s.includes('gesamt')) {
        const n = z.find((c) => typeof c === 'number' && c > 0) as number | undefined
        if (n !== undefined && !standzeit) standzeit = { wert: n, fundstelle: `Blatt „${b.name}“, Zeile ${i + 1}` }
      }
    })
  }
  const st = standzeit as { wert: number; fundstelle: string } | null
  if (st) {
    werte.gesamtStandzeitWochen = st.wert
    gefunden.push({ label: 'Standzeit gesamt (Wochen angenommen)', wert: `${de(st.wert)}`, fundstelle: st.fundstelle })
  } else nichtGefunden.push('Standzeit gesamt')

  return { werte, gefunden, nichtGefunden }
}

/** Excel-Datei (xlsx) → Blätter → Angaben. */
export async function leseStatikerLvXlsx(daten: ArrayBuffer): Promise<StatikerLvErgebnis> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(daten, { type: 'array' })
  const blaetter: LvBlatt[] = wb.SheetNames.map((name) => ({
    name,
    zeilen: XLSX.utils.sheet_to_json<Zelle[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: null }),
  }))
  return leseStatikerLv(blaetter)
}
