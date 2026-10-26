import { NextRequest, NextResponse } from 'next/server'
import { pruefeBaustelle } from '@/lib/import-altdaten'
import { importEinfuegen, importHole, importLeseZeilen, importPruefeRolle } from '@/lib/import-auth'

// ============================================================
// SCAFFOLD OS – CSV-Import: Baustellen (Projekte) je Kunde
// POST { rows: [{ kunde, name, adresse?, beginn?, ende?, status? }] }
// Der Kunde muss schon existieren (Kundenstamm zuerst importieren) – Zuordnung über den Namen.
// Dubletten (gleicher Kunde + gleicher Baustellenname) werden übersprungen.
// ============================================================

const nameKey = (v: unknown) => String(v ?? '').trim().toLowerCase()

export async function POST(req: NextRequest) {
  const denied = await importPruefeRolle()
  if (denied) return denied
  const gelesen = await importLeseZeilen(req)
  if (gelesen instanceof NextResponse) return gelesen

  try {
    const [kunden, projekte] = await Promise.all([
      importHole<{ id: string; name: string }>('customers?select=id,name&is_active=eq.true&limit=20000'),
      importHole<{ name: string | null; customer_id: string | null }>('projects?select=name,customer_id&limit=20000'),
    ])
    const kundeId = new Map(kunden.map((k) => [nameKey(k.name), k.id]))
    const vorhanden = new Set(projekte.filter((p) => p.customer_id).map((p) => `${p.customer_id}|${nameKey(p.name)}`))

    const fehler: { zeile: number; grund: string }[] = []
    const eintraege: Record<string, unknown>[] = []
    const zeilenNr: number[] = []
    let uebersprungen = 0

    gelesen.rows.forEach((roh, i) => {
      const zeile = i + 1
      const p = pruefeBaustelle(roh || {})
      if (!p.ok) { fehler.push({ zeile, grund: p.grund }); return }
      const w = p.wert
      const cid = kundeId.get(nameKey(w.kunde))
      if (!cid) { fehler.push({ zeile, grund: `Kunde nicht gefunden: ${w.kunde} (zuerst den Kundenstamm importieren)` }); return }
      const key = `${cid}|${nameKey(w.name)}`
      if (vorhanden.has(key)) { uebersprungen++; return }
      vorhanden.add(key)
      eintraege.push({
        name: w.name,
        adresse: w.adresse || '(Adresse nachtragen)',
        customer_id: cid,
        status: w.abgeschlossen ? 'completed' : 'active',
        data: { step1: { name: w.kunde, adresse: w.adresse || '', ...(w.beginn ? { projektbeginn: w.beginn } : {}), ...(w.ende ? { projektende: w.ende } : {}) }, importiert: true },
      })
      zeilenNr.push(zeile)
    })

    const importiert = await importEinfuegen('projects', eintraege, fehler, zeilenNr)
    return NextResponse.json({ success: true, importiert, uebersprungen, fehler })
  } catch (e) {
    console.error('import/baustellen:', e)
    return NextResponse.json({ success: false, error: 'Import fehlgeschlagen' }, { status: 500 })
  }
}
