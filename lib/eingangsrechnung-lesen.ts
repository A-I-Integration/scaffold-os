// Liest Felder einer externen Rechnung aus dem Inhalt einer PDF: zuerst eingebettetes XML (ZUGFeRD / XRechnung, zuverlässig),
// sonst Textmuster. Nichts wird geraten: was nicht sicher gefunden wird, bleibt leer und steht in `pruefen`.
// Eingescannte PDFs ohne Textebene liefern nichts (keine Texterkennung).

import { XMLParser } from 'fast-xml-parser'
import { parseBetrag } from '@/lib/eingangsrechnung'

export type LeseFeld = 'lieferant' | 'rechnungsnummer' | 'rechnungsdatum' | 'faellig_am' | 'netto' | 'ust_satz' | 'brutto'
export interface LeseErgebnis {
  quelle: 'xml' | 'text' | 'leer'
  felder: Partial<{ lieferant: string; rechnungsnummer: string; rechnungsdatum: string; faellig_am: string; netto: number; ust_satz: number; brutto: number }>
  /** Felder, die nicht oder nur als Vermutung gefunden wurden */
  pruefen: LeseFeld[]
  hinweis?: string
}

const runde = (n: number) => Math.round(n * 100) / 100
const iso = (t: number, m: number, j: number): string | null => {
  if (j < 100) j += 2000
  const d = new Date(Date.UTC(j, m - 1, t))
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t ? d.toISOString().slice(0, 10) : null
}
const deDatum = (s: string): string | null => { const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/); return m ? iso(+m[1], +m[2], +m[3]) : null }
const plusTage = (d: string, n: number) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)
const BETRAG = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?!\d)/g
const betraege = (zeile: string): number[] => (zeile.match(BETRAG) || []).map((x) => parseBetrag(x)).filter((x): x is number => x !== null)
const nahe = (a: number, b: number) => Math.abs(a - b) <= 0.02

// ───────── XML (CII = ZUGFeRD/Factur-X/XRechnung CII, UBL = XRechnung UBL) ─────────
const arr = (v: any): any[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])
const txt = (v: any): string => (v === undefined || v === null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v)).trim()
const ymd = (s: string): string | null => { const m = s.replace(/-/g, '').match(/^(\d{4})(\d{2})(\d{2})/); return m ? iso(+m[3], +m[2], +m[1]) : null }

export function leseXml(xml: string): LeseErgebnis | null {
  let w: any
  try { w = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, parseTagValue: false }).parse(xml) } catch { return null }
  const f: LeseErgebnis['felder'] = {}
  if (w?.CrossIndustryInvoice) {
    const d = w.CrossIndustryInvoice
    const dok = d.ExchangedDocument || {}
    const ts = d.SupplyChainTradeTransaction || {}
    const ha = ts.ApplicableHeaderTradeAgreement || {}
    const hs = ts.ApplicableHeaderTradeSettlement || {}
    const sum = hs.SpecifiedTradeSettlementHeaderMonetarySummation || {}
    f.lieferant = txt(ha.SellerTradeParty?.Name) || undefined
    f.rechnungsnummer = txt(dok.ID) || undefined
    const dt = ymd(txt(dok.IssueDateTime?.DateTimeString)); if (dt) f.rechnungsdatum = dt
    const fa = ymd(txt(arr(hs.SpecifiedTradePaymentTerms)[0]?.DueDateDateTime?.DateTimeString)); if (fa) f.faellig_am = fa
    const netto = parseBetrag(txt(sum.TaxBasisTotalAmount)); if (netto !== null) f.netto = netto
    const brutto = parseBetrag(txt(sum.GrandTotalAmount)); if (brutto !== null) f.brutto = brutto
    const satz = parseBetrag(txt(arr(hs.ApplicableTradeTax)[0]?.RateApplicablePercent)); if (satz !== null) f.ust_satz = satz
  } else if (w?.Invoice) {
    const d = w.Invoice
    f.rechnungsnummer = txt(d.ID) || undefined
    const dt = ymd(txt(d.IssueDate)); if (dt) f.rechnungsdatum = dt
    const fa = ymd(txt(d.DueDate)); if (fa) f.faellig_am = fa
    const p = d.AccountingSupplierParty?.Party
    f.lieferant = txt(p?.PartyLegalEntity?.RegistrationName) || txt(p?.PartyName?.Name) || undefined
    const m = d.LegalMonetaryTotal || {}
    const netto = parseBetrag(txt(m.TaxExclusiveAmount)); if (netto !== null) f.netto = netto
    const brutto = parseBetrag(txt(m.TaxInclusiveAmount ?? m.PayableAmount)); if (brutto !== null) f.brutto = brutto
    const satz = parseBetrag(txt(arr(arr(d.TaxTotal)[0]?.TaxSubtotal)[0]?.TaxCategory?.Percent)); if (satz !== null) f.ust_satz = satz
  } else return null
  for (const k of Object.keys(f) as LeseFeld[]) if (f[k] === undefined) delete f[k]
  if (f.netto === undefined && f.brutto === undefined && !f.rechnungsnummer) return null
  const alle: LeseFeld[] = ['lieferant', 'rechnungsnummer', 'rechnungsdatum', 'faellig_am', 'netto', 'ust_satz', 'brutto']
  return { quelle: 'xml', felder: f, pruefen: alle.filter((k) => k !== 'faellig_am' && f[k] === undefined) }
}

// ───────── Text ─────────
const FIRMA = /\b(gmbh|ag|kg|ug|ohg|gbr|e\.?\s?k\.?|e\.?\s?v\.?|mbh|& co|co\. kg|gmbh & co\. kg|se)\b/i

export function leseText(roh: string): LeseErgebnis {
  const text = roh.replace(/ /g, ' ').replace(/[ \t]+/g, ' ')
  const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean)
  const f: LeseErgebnis['felder'] = {}
  const unsicher = new Set<LeseFeld>()
  if (zeilen.join('').length < 30) return { quelle: 'leer', felder: {}, pruefen: [], hinweis: 'In dieser PDF steckt kein lesbarer Text (vermutlich eingescannt). Bitte die Felder von Hand ausfüllen.' }

  // Rechnungsnummer
  for (const z of zeilen) {
    const m = z.match(/(?:rechnungs-?\s*(?:nummer|nr\.?)|rechnung\s*(?:nummer|nr\.?)|invoice\s*(?:no\.?|number|nr\.?)|beleg-?\s*(?:nummer|nr\.?))\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-\/_.]{1,30})/i)
    if (m && /\d/.test(m[1]) && !/^(datum|date)$/i.test(m[1])) { f.rechnungsnummer = m[1].replace(/[.,;]$/, ''); break }
  }
  // Rechnungsdatum
  for (let i = 0; i < zeilen.length; i++) {
    const m = zeilen[i].match(/(?:rechnungsdatum|rechnungs-datum|belegdatum|datum|date)\s*[:]?\s*(.*)/i)
    if (m && !/f[äa]llig|liefer|leistung/i.test(zeilen[i].slice(0, m.index! + 14))) { const d = deDatum(m[1]) || deDatum(zeilen[i + 1] || ''); if (d) { f.rechnungsdatum = d; break } }
  }
  if (!f.rechnungsdatum) { for (const z of zeilen.slice(0, 40)) { const d = deDatum(z); if (d && !/f[äa]llig|liefer|leistung/i.test(z)) { f.rechnungsdatum = d; unsicher.add('rechnungsdatum'); break } } }
  // Fälligkeit
  for (const z of zeilen) {
    const m = z.match(/(?:f[äa]llig(?:keit)?(?:sdatum)?(?: am)?|zahlbar bis|zahlungsziel|zahlung bis)[^\d]{0,30}(\d{1,2}\.\d{1,2}\.\d{2,4})/i)
    if (m) { const d = deDatum(m[1]); if (d) { f.faellig_am = d; break } }
  }
  if (!f.faellig_am && f.rechnungsdatum) {
    const m = text.match(/(?:innerhalb|binnen|within)\s+(?:von\s+)?(\d{1,3})\s*(?:tage|tagen|days)/i)
    if (m && +m[1] <= 120) f.faellig_am = plusTage(f.rechnungsdatum, +m[1])
  }

  // Beträge
  const reverse = /§\s*13b|steuerschuldnerschaft|reverse[- ]charge/i.test(text)
  const zeilenMit = (re: RegExp, nicht?: RegExp) => zeilen.filter((z) => re.test(z) && !(nicht && nicht.test(z)))
  const werte = (ls: string[], i = 0) => ls.flatMap((z, idx) => { const b = betraege(z); if (b.length) return b; const n = betraege(zeilen[zeilen.indexOf(z) + 1] || ''); return idx >= 0 ? n : [] })
  const bruttoKand = werte(zeilenMit(/gesamtbetrag|rechnungsbetrag|bruttobetrag|brutto|zu zahlen|zahlbetrag|endbetrag|gesamtsumme|summe brutto|amount due|total/i, /netto|zwischensumme/i), 0)
  const nettoKand = werte(zeilenMit(/nettobetrag|netto|zwischensumme|summe netto|warenwert|nettosumme|subtotal/i, /brutto/i), 0)
  // USt-Zeilen: "19 % MwSt 190,00" / "MwSt. 19 % 190,00"
  const ustZeilen: { satz: number; betrag: number | null }[] = []
  for (const z of zeilen) {
    const m = z.match(/(\d{1,2}(?:,\d+)?)\s*%\s*(?:mwst|ust|umsatzsteuer|mehrwertsteuer|vat)/i) || z.match(/(?:mwst|ust|umsatzsteuer|mehrwertsteuer|vat)\.?[^\d%]{0,25}(\d{1,2}(?:,\d+)?)\s*%/i)
    if (m) { const satz = parseBetrag(m[1]); if (satz !== null && [0, 7, 19].includes(satz)) { const b = betraege(z); ustZeilen.push({ satz, betrag: b.length ? b[b.length - 1] : null }) } }
  }

  const sätze = reverse ? [0] : ustZeilen.length ? [...new Set(ustZeilen.map((u) => u.satz))] : [19, 7]
  // beste konsistente Kombination aus Netto, Brutto, Satz
  let best: { n: number; b: number; s: number } | null = null
  for (const b of [...new Set(bruttoKand)].sort((x, y) => y - x)) for (const n of [...new Set(nettoKand)]) for (const s of sätze) {
    if (nahe(runde(n * (1 + s / 100)), b)) { best = { n, b, s }; break }
    if (best) break
  }
  if (best) { f.netto = best.n; f.brutto = best.b; f.ust_satz = best.s }
  else if (reverse && bruttoKand.length) { const b = Math.max(...bruttoKand); f.netto = b; f.brutto = b; f.ust_satz = 0 }
  else if (bruttoKand.length && ustZeilen.length && ustZeilen[0].betrag !== null) {
    const b = Math.max(...bruttoKand), u = ustZeilen[0].betrag!
    if (u < b) { f.brutto = b; f.netto = runde(b - u); f.ust_satz = ustZeilen[0].satz; unsicher.add('netto') }
  } else {
    if (bruttoKand.length) { f.brutto = Math.max(...bruttoKand); unsicher.add('brutto') }
    if (nettoKand.length) { f.netto = Math.max(...nettoKand); unsicher.add('netto') }
    if (ustZeilen.length) f.ust_satz = ustZeilen[0].satz
    // nur Netto + Satz bekannt → Brutto lässt das Formular selbst rechnen
  }

  // Lieferant: Absenderzeile über dem Adressfeld ("Firma · Straße · PLZ Ort") oder erste Zeile mit Rechtsform
  const kopf = zeilen.slice(0, 25)
  const absender = kopf.find((z) => /[·|•]/.test(z) && /\b\d{5}\b/.test(z))
  if (absender) { f.lieferant = absender.split(/[·|•]/)[0].trim(); unsicher.add('lieferant') }
  else {
    const z = kopf.find((x) => FIRMA.test(x) && x.length <= 80 && !/rechnung|empf[äa]nger|kunde/i.test(x))
    if (z) { f.lieferant = z.replace(/\s*[,|].*$/, '').trim(); unsicher.add('lieferant') }
  }
  if (f.lieferant && (f.lieferant.length < 3 || f.lieferant.length > 80)) delete f.lieferant

  const alle: LeseFeld[] = ['lieferant', 'rechnungsnummer', 'rechnungsdatum', 'netto', 'ust_satz', 'brutto']
  const pruefen = new Set<LeseFeld>([...alle.filter((k) => f[k] === undefined), ...unsicher])
  const gefunden = Object.keys(f).length
  return { quelle: gefunden ? 'text' : 'leer', felder: f, pruefen: [...pruefen], hinweis: gefunden ? undefined : 'Aus dem Text konnten keine Angaben erkannt werden. Bitte von Hand ausfüllen.' }
}

/** Kombiniert beide Wege: eingebettetes XML hat Vorrang, fehlende Felder ergänzt der Text. */
export function leseRechnung(eingabe: { text: string; xml?: string | null }): LeseErgebnis {
  const x = eingabe.xml ? leseXml(eingabe.xml) : null
  const t = leseText(eingabe.text)
  if (!x) return t
  const felder = { ...t.felder, ...x.felder }
  const pruefen = (['lieferant', 'rechnungsnummer', 'rechnungsdatum', 'netto', 'ust_satz', 'brutto'] as LeseFeld[]).filter((k) => felder[k] === undefined)
  return { quelle: 'xml', felder, pruefen }
}
