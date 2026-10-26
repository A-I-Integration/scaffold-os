import { NextRequest, NextResponse } from 'next/server'
import { pruefeAltrechnung } from '@/lib/import-altdaten'
import { importEinfuegen, importHole, importLeseZeilen, importPruefeRolle } from '@/lib/import-auth'

// ============================================================
// SCAFFOLD OS – CSV-Import: Alte Rechnungen und offene Posten
// POST { rows: [{ nummer, kunde, datum, netto|brutto, steuersatz?, faelligkeit?, bezahlt?|offen?|status?, baustelle?, bezeichnung? }] }
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
    const [kunden, projekte, rechnungen] = await Promise.all([
      importHole<{ id: string; name: string; street: string | null; zip: string | null; city: string | null }>('customers?select=id,name,street,zip,city&is_active=eq.true&limit=20000'),
      importHole<{ id: string; name: string | null; customer_id: string | null }>('projects?select=id,name,customer_id&limit=20000'),
      importHole<{ invoice_number: string }>('invoices?select=invoice_number&limit=50000'),
    ])
    const kundeByName = new Map(kunden.map((k) => [nameKey(k.name), k]))
    const projektKey = new Map(projekte.filter((p) => p.customer_id).map((p) => [`${p.customer_id}|${nameKey(p.name)}`, p.id]))
    const vorhanden = new Set(rechnungen.map((r) => r.invoice_number))

    const fehler: { zeile: number; grund: string }[] = []
    const eintraege: Record<string, unknown>[] = []
    const zeilenNr: number[] = []
    let uebersprungen = 0

    gelesen.rows.forEach((roh, i) => {
      const zeile = i + 1
      const p = pruefeAltrechnung(roh || {})
      if (!p.ok) { fehler.push({ zeile, grund: p.grund }); return }
      const w = p.wert
      const k = kundeByName.get(nameKey(w.kunde))
      if (!k) { fehler.push({ zeile, grund: `Kunde nicht gefunden: ${w.kunde} (zuerst den Kundenstamm importieren)` }); return }
      if (vorhanden.has(w.nummer)) { uebersprungen++; return }
      vorhanden.add(w.nummer)
      const projectId = w.baustelle ? projektKey.get(`${k.id}|${nameKey(w.baustelle)}`) ?? null : null
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

    const importiert = await importEinfuegen('invoices', eintraege, fehler, zeilenNr)
    return NextResponse.json({ success: true, importiert, uebersprungen, fehler })
  } catch (e) {
    console.error('import/rechnungen:', e)
    return NextResponse.json({ success: false, error: 'Import fehlgeschlagen' }, { status: 500 })
  }
}
