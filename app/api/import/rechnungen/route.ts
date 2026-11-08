import { NextRequest, NextResponse } from 'next/server'
import { pruefeAltrechnung } from '@/lib/import-altdaten'
import { importEinfuegen, importHole, importLeseZeilen, importPruefeRolle, importProtokollieren } from '@/lib/import-auth'

// ============================================================
// SCAFFOLD OS – CSV-Import: Alte Rechnungen und offene Posten
// POST { rows: [{ nummer, kunde?, kunde_nr?, projekt_nr?, datum, netto|brutto, steuersatz?, faelligkeit?, bezahlt?|offen?|status?, baustelle?, bezeichnung? }], dryRun?, quelle?, dateiname? }
// Zuordnung zum Kunden zuerst über die Kundennummer der Altsoftware, sonst über den Namen; zur Baustelle über die
// Projektnummer, sonst über den Namen. dryRun = true: nur prüfen und zählen, nichts schreiben.
//
// Die Rechnungen behalten ihre ursprüngliche Nummer und werden als Altbestand (importiert = true)
// gekennzeichnet: kein Eingriff in den laufenden Nummernkreis, nicht im DATEV-Export (wurde im Altsystem verbucht).
// Offene Beträge bleiben für Zahlungsverfolgung und Mahnwesen erhalten. Nummern, die es schon gibt, werden übersprungen.
// Vor dem Deploy: supabase/phase-import-altbestand.sql ausführen.
// ============================================================

const nameKey = (v: unknown) => String(v ?? '').trim().toLowerCase()

export async function POST(req: NextRequest) {
  const denied = await importPruefeRolle()
  if (denied) return denied
  const gelesen = await importLeseZeilen(req)
  if (gelesen instanceof NextResponse) return gelesen

  try {
    type K = { id: string; name: string; street: string | null; zip: string | null; city: string | null; alt_nummer?: string | null }
    type P = { id: string; name: string | null; customer_id: string | null; alt_nummer?: string | null }
    const holeAlt = async <T,>(mit: string, ohne: string): Promise<T[]> => { try { return await importHole<T>(mit) } catch { return importHole<T>(ohne) } }
    const [kunden, projekte, rechnungen] = await Promise.all([
      holeAlt<K>('customers?select=id,name,street,zip,city,alt_nummer&is_active=eq.true&limit=50000', 'customers?select=id,name,street,zip,city&is_active=eq.true&limit=50000'),
      holeAlt<P>('projects?select=id,name,customer_id,alt_nummer&limit=50000', 'projects?select=id,name,customer_id&limit=50000'),
      importHole<{ invoice_number: string }>('invoices?select=invoice_number&limit=100000'),
    ])
    const kundeByName = new Map(kunden.map((k) => [nameKey(k.name), k]))
    const kundeByNr = new Map(kunden.filter((k) => k.alt_nummer).map((k) => [String(k.alt_nummer).trim(), k]))
    const projektKey = new Map(projekte.filter((p) => p.customer_id).map((p) => [`${p.customer_id}|${nameKey(p.name)}`, p.id]))
    const projektByNr = new Map(projekte.filter((p) => p.alt_nummer).map((p) => [String(p.alt_nummer).trim(), p]))
    const vorhanden = new Set(rechnungen.map((r) => r.invoice_number))

    const fehler: { zeile: number; grund: string }[] = []
    const hinweise: { zeile: number; text: string }[] = []
    let summeBrutto = 0, summeOffen = 0
    const eintraege: Record<string, unknown>[] = []
    const zeilenNr: number[] = []
    let uebersprungen = 0

    gelesen.rows.forEach((roh, i) => {
      const zeile = i + 1
      const p = pruefeAltrechnung(roh || {})
      if (!p.ok) { fehler.push({ zeile, grund: p.grund }); return }
      const w = p.wert
      const k = (w.kundeNr && kundeByNr.get(w.kundeNr)) || (w.kunde ? kundeByName.get(nameKey(w.kunde)) : undefined)
      if (!k) { fehler.push({ zeile, grund: `Kunde nicht gefunden: ${w.kundeNr ? `Kundennr. ${w.kundeNr}` : ''}${w.kundeNr && w.kunde ? ' / ' : ''}${w.kunde} (zuerst den Kundenstamm importieren)` }); return }
      w.hinweise.forEach((h) => hinweise.push({ zeile, text: h }))
      if (vorhanden.has(w.nummer)) { uebersprungen++; return }
      vorhanden.add(w.nummer)
      const pNr = w.projektNr ? projektByNr.get(w.projektNr) : undefined
      const projectId = pNr?.id ?? (w.baustelle ? projektKey.get(`${k.id}|${nameKey(w.baustelle)}`) ?? null : null)
      if ((w.projektNr || w.baustelle) && !projectId) hinweise.push({ zeile, text: `Baustelle „${w.baustelle ?? w.projektNr}“ nicht gefunden – Rechnung ohne Baustelle übernommen` })
      summeBrutto += w.brutto
      if (w.status === 'offen') summeOffen += Math.max(0, Math.abs(w.brutto) - w.bezahlt)
      eintraege.push({
        invoice_number: w.nummer,
        project_id: projectId,
        customer_id: k.id,
        customer_name: k.name,
        customer_address: [k.street, [k.zip, k.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
        positions: [{ bezeichnung: w.bezeichnung, menge: 1, einheit: 'Pauschale', einzelpreis: w.netto }],
        net_amount: w.netto, tax_rate: w.steuersatz, tax_amount: w.steuer, gross_amount: w.brutto,
        status: w.status, paid_amount: w.bezahlt, invoice_type: w.art,
        invoice_date: w.datum, due_date: w.faelligkeit,
        importiert: true,
      })
      zeilenNr.push(zeile)
    })

    const importiert = gelesen.trockenlauf ? 0 : await importEinfuegen('invoices', eintraege, fehler, zeilenNr)
    await importProtokollieren({ art: 'rechnungen', anfrage: gelesen, importiert, uebersprungen, neu: eintraege.length, fehler, hinweise })
    const r2 = (v: number) => Math.round(v * 100) / 100
    return NextResponse.json({ success: true, trockenlauf: gelesen.trockenlauf, neu: eintraege.length, importiert, uebersprungen, fehler, hinweise, summen: { brutto: r2(summeBrutto), offen: r2(summeOffen) } })
  } catch (e) {
    console.error('import/rechnungen:', e)
    return NextResponse.json({ success: false, error: 'Import fehlgeschlagen' }, { status: 500 })
  }
}
