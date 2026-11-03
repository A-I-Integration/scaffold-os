// ============================================================
// SCAFFOLD OS – Leistungsverzeichnis als GAEB-Datei (X83, Angebotsaufforderung, GAEB DA XML 3.3)
//
// Warum: Planer und Architekten (Leistungsphase 6, Vorbereitung der Vergabe) geben Ausschreibungen als GAEB-Datei
// weiter. X83 enthält Positionen, Texte, Mengen und Einheiten, aber KEINE Preise (Preise gehören ins Angebot, X84).
//
// Aufbau (nach GAEB DA XML 3.3): GAEB > GAEBInfo, PrjInfo, Award (DP 83) > BoQ > BoQInfo (Gliederung: Titel 2-stellig,
// Position 4-stellig) und BoQBody > je Titel BoQCtgy (RNoPart = Titelnummer) > Itemlist > Item (RNoPart = Positionsnummer,
// Qty, QU, Description > CompleteText > DetailTxt (Langtext) und OutlineText (Kurztext)).
//
// Regeln:
// • Positionsnummer: die laufende Nummer aus dem LV, vierstellig aufgefüllt ("02.3" → Titel 02, Position 0003).
// • Einheit: höchstens 4 Zeichen, ohne Hochzahlen ("m²" → "m2").
// • Menge: höchstens 3 Nachkommastellen, Punkt als Dezimaltrenner.
// • Entfallene Positionen (von Hand gestrichen) und Positionen mit Menge 0 werden nicht ausgegeben; Titel ohne Position auch nicht.
//
// Geprüft: Aufbau und Elementreihenfolge gegen die Open-Source-Bibliothek pyGAEB (parst die Datei ohne Fehler zurück).
// NICHT geprüft: gegen die offiziellen GAEB-XSD-Dateien oder den GAEB-Konverter (lagen nicht vor). Vor dem Versand an
// einen Auftraggeber bitte einmal in dessen Programm öffnen.
// ============================================================

import type { Leistungsverzeichnis } from '@/lib/leistungsverzeichnis'

const esc = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Steuerzeichen sind in XML 1.0 verboten
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

const absatz = (t: string): string => `<p><span>${esc(t)}</span></p>`

/** Einheit für GAEB: höchstens 4 Zeichen, Hochzahlen als normale Ziffern. */
const EINHEIT_ABKUERZUNG: Record<string, string> = {
  'stück': 'Stk', 'stueck': 'Stk', 'stck': 'Stk', 'stk': 'Stk', 'st': 'Stk',
  'pauschal': 'psch', 'pausch': 'psch', 'psch': 'psch',
  'stunden': 'h', 'stunde': 'h', 'std': 'h',
  'wochen': 'Wo', 'woche': 'Wo',
  'einsatz': 'Eins', 'einsätze': 'Eins',
}
// Zusammengesetzte Einheiten der Vorhaltung („StWo“, „m²/Wo“): Grundeinheit kurz + „Wo“, zusammen höchstens 4 Zeichen
const BASIS_KURZ: Record<string, string> = { stk: 'St', psch: 'ps', lfdm: 'm', m: 'm' }
export function gaebEinheit(einheit: string): string {
  const e = einheit.trim().replace(/\.$/, '').replace(/²/g, '2').replace(/³/g, '3').replace(/\s+/g, '')
  const wo = /^(.+?)\/?wo$/i.exec(e)
  if (wo && wo[1]) {
    const b = wo[1].toLowerCase()
    const basis = BASIS_KURZ[EINHEIT_ABKUERZUNG[b]?.toLowerCase() ?? b] ?? wo[1]
    return `${basis}Wo`.slice(0, 4)
  }
  return (EINHEIT_ABKUERZUNG[e.toLowerCase()] ?? (e || 'Stk')).slice(0, 4)
}

/** Menge mit höchstens 3 Nachkommastellen, Punkt als Dezimaltrenner, ohne überflüssige Nullen. */
export function gaebMenge(menge: number): string {
  const r = Math.round(menge * 1000) / 1000
  return String(r)
}

/** Vierstellige Positionsnummer aus der laufenden Nummer des LV ("02.3" → "0003", "02.10" → "0010"). */
export function gaebPositionsNr(nr: string, laufend: number): string {
  const ende = nr.split('.').pop() ?? ''
  const n = /^\d+$/.test(ende) ? parseInt(ende, 10) : laufend
  return String(Math.min(9999, Math.max(1, n))).padStart(4, '0')
}

export interface GaebExportOptionen {
  /** Bauvorhaben (Projektname im Kopf) */
  bauvorhaben?: string
  /** Projektnummer */
  projektnummer?: string
  /** Datum der Erstellung (JJJJ-MM-TT), für Tests festlegbar */
  datum?: string
}

export function erzeugeGaebX83(lv: Leistungsverzeichnis, opt: GaebExportOptionen = {}): string {
  const datum = opt.datum ?? new Date().toISOString().slice(0, 10)
  const name = (opt.bauvorhaben ?? '').trim() || 'Gerüstarbeiten'
  const prjId = (opt.projektnummer ?? '').trim().replace(/[^0-9A-Za-z_\-./ ]/g, '').slice(0, 20) || '1'
  const out: string[] = []
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  out.push(`<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">`)
  out.push(`<GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate><Date>${esc(datum)}</Date><ProgSystem>SCAFFOLD OS</ProgSystem><ProgName>SCAFFOLD OS</ProgName></GAEBInfo>`)
  out.push(`<PrjInfo><NamePrj>${esc(name.slice(0, 60))}</NamePrj><PrjID>${esc(prjId)}</PrjID><Cur>EUR</Cur></PrjInfo>`)
  out.push(`<Award><DP>83</DP><AwardInfo><Cur>EUR</Cur></AwardInfo>`)
  out.push(`<BoQ ID="B1"><BoQInfo><Name>${esc(name.slice(0, 20))}</Name><LblBoQ>${esc(name)}</LblBoQ><OutlCompl>AllTxt</OutlCompl>`
    + `<BoQBkdn><Type>BoQLevel</Type><Length>2</Length><Num>Yes</Num></BoQBkdn>`
    + `<BoQBkdn><Type>Item</Type><Length>4</Length><Num>Yes</Num></BoQBkdn></BoQInfo>`)
  out.push(`<BoQBody>`)
  let idTitel = 0, idPos = 0
  for (const t of lv.titel) {
    const pos = t.positionen.filter((p) => !p.entfaellt && p.menge > 0)
    if (pos.length === 0) continue
    idTitel++
    out.push(`<BoQCtgy ID="C${idTitel}" RNoPart="${esc(t.nrText)}"><LblTx>${absatz(t.titel)}</LblTx><BoQBody><Itemlist>`)
    const benutzt = new Set<string>()
    pos.forEach((p, i) => {
      idPos++
      let nr = gaebPositionsNr(p.nr, i + 1)
      // Doppelte Nummern vermeiden (zwei Positionen dürfen nicht dieselbe Nummer tragen)
      while (benutzt.has(nr)) nr = String(parseInt(nr, 10) + 1).padStart(4, '0')
      benutzt.add(nr)
      const lang = p.text.map((z) => z.trim()).filter(Boolean)
      out.push(`<Item ID="I${idPos}" RNoPart="${nr}"><Qty>${gaebMenge(p.menge)}</Qty><QU>${esc(gaebEinheit(p.einheit))}</QU><Description>`
        + (lang.length ? `<CompleteText><DetailTxt><Text>${lang.map(absatz).join('')}</Text></DetailTxt><OutlineText><OutlTxt><TextOutlTxt>${absatz(p.titel)}</TextOutlTxt></OutlTxt></OutlineText></CompleteText>`
          : `<OutlineText><OutlTxt><TextOutlTxt>${absatz(p.titel)}</TextOutlTxt></OutlTxt></OutlineText>`)
        + `</Description></Item>`)
    })
    out.push(`</Itemlist></BoQBody></BoQCtgy>`)
  }
  out.push(`</BoQBody></BoQ></Award></GAEB>`)
  return out.join('\n')
}
