import { NextRequest, NextResponse } from 'next/server'
import { pruefeBaustelle } from '@/lib/import-altdaten'
import { importEinfuegen, importHole, importLeseZeilen, importPruefeRolle, importProtokollieren } from '@/lib/import-auth'

// ============================================================
// SCAFFOLD OS – Import: Baustellen (Projekte) je Kunde
// POST { rows: [{ kunde?, kunde_nr?, nummer?, name, adresse?, beginn?, ende?, aufbau?, mietbeginn?, mietende?,
//                 vertragsende?, status? }], dryRun?, quelle?, dateiname? }
// Der Kunde muss schon existieren (Kundenstamm zuerst importieren). Zuordnung zuerst über die Kundennummer der
// Altsoftware (kunde_nr), sonst über den Namen. Dubletten: gleiche Projektnummer (nummer) oder gleicher Kunde + Name.
// Zeiträume (Aufbau, Mietbeginn/-ende, Vertragsende) werden getrennt gespeichert; die Zeitklasse
// (historisch / aktiv / geplant) wird aus den Daten berechnet.
// dryRun = true: nur prüfen und zählen, nichts schreiben.
// ============================================================

const nameKey = (v: unknown) => String(v ?? '').trim().toLowerCase()

type Projekt = { name: string | null; customer_id: string | null; alt_nummer?: string | null }
type Kunde = { id: string; name: string; alt_nummer?: string | null }

/** Liest mit alt_nummer; fehlt die Spalte (phase-106 nicht ausgeführt), ohne. */
async function holeMitAltNummer<T>(pfadMit: string, pfadOhne: string): Promise<{ daten: T[]; mitNummer: boolean }> {
  try { return { daten: await importHole<T>(pfadMit), mitNummer: true } } catch { return { daten: await importHole<T>(pfadOhne), mitNummer: false } }
}

export async function POST(req: NextRequest) {
  const denied = await importPruefeRolle()
  if (denied) return denied
  const gelesen = await importLeseZeilen(req)
  if (gelesen instanceof NextResponse) return gelesen

  try {
    const [k, p] = await Promise.all([
      holeMitAltNummer<Kunde>('customers?select=id,name,alt_nummer&is_active=eq.true&limit=50000', 'customers?select=id,name&is_active=eq.true&limit=50000'),
      holeMitAltNummer<Projekt>('projects?select=name,customer_id,alt_nummer&limit=50000', 'projects?select=name,customer_id&limit=50000'),
    ])
    const mitNummer = k.mitNummer && p.mitNummer
    const kundeByName = new Map(k.daten.map((x) => [nameKey(x.name), x]))
    const kundeByNr = new Map(k.daten.filter((x) => x.alt_nummer).map((x) => [String(x.alt_nummer).trim(), x]))
    const vorhanden = new Set(p.daten.filter((x) => x.customer_id).map((x) => `${x.customer_id}|${nameKey(x.name)}`))
    const vorhandenNr = new Set(p.daten.filter((x) => x.alt_nummer).map((x) => String(x.alt_nummer).trim()))

    const fehler: { zeile: number; grund: string }[] = []
    const hinweise: { zeile: number; text: string }[] = []
    const eintraege: Record<string, unknown>[] = []
    const zeilenNr: number[] = []
    const klassen = { historisch: 0, aktiv: 0, geplant: 0, unbekannt: 0 }
    let uebersprungen = 0

    gelesen.rows.forEach((roh, i) => {
      const zeile = i + 1
      const pr = pruefeBaustelle(roh || {})
      if (!pr.ok) { fehler.push({ zeile, grund: pr.grund }); return }
      const w = pr.wert
      const kunde = (w.kundeNr && kundeByNr.get(w.kundeNr)) || (w.kunde ? kundeByName.get(nameKey(w.kunde)) : undefined)
      if (!kunde) {
        fehler.push({ zeile, grund: `Kunde nicht gefunden: ${w.kundeNr ? `Kundennr. ${w.kundeNr}` : ''}${w.kundeNr && w.kunde ? ' / ' : ''}${w.kunde} (zuerst den Kundenstamm importieren)` })
        return
      }
      if (w.kundeNr && !kundeByNr.has(w.kundeNr)) hinweise.push({ zeile, text: `Kundennr. ${w.kundeNr} unbekannt, über den Namen „${w.kunde}“ zugeordnet` })
      w.hinweise.forEach((h) => hinweise.push({ zeile, text: h }))
      if (w.nummer && vorhandenNr.has(w.nummer)) { uebersprungen++; return }
      const key = `${kunde.id}|${nameKey(w.name)}`
      if (vorhanden.has(key)) { uebersprungen++; return }
      vorhanden.add(key)
      if (w.nummer) vorhandenNr.add(w.nummer)
      klassen[w.zeitklasse]++
      eintraege.push({
        name: w.name,
        adresse: w.adresse || '(Adresse nachtragen)',
        customer_id: kunde.id,
        status: w.abgeschlossen ? 'completed' : 'active',
        ...(w.nummer && mitNummer ? { alt_nummer: w.nummer } : {}),
        data: {
          step1: { name: kunde.name, adresse: w.adresse || '', ...(w.beginn ? { projektbeginn: w.beginn } : {}), ...(w.ende ? { projektende: w.ende } : {}) },
          zeitachse: {
            ...(w.aufbau ? { aufbau: w.aufbau } : {}), ...(w.mietbeginn ? { mietbeginn: w.mietbeginn } : {}),
            ...(w.mietende ? { mietende: w.mietende } : {}), ...(w.vertragsende ? { vertragsende: w.vertragsende } : {}),
            klasse: w.zeitklasse,
          },
          importiert: true,
        },
      })
      zeilenNr.push(zeile)
    })
    if (!mitNummer && gelesen.rows.some((r) => r && (r.nummer || r.kunde_nr))) {
      hinweise.push({ zeile: 0, text: 'Alt-Nummern wurden nicht gespeichert: Die Datenbank-Erweiterung phase-106-wechsel-import.sql fehlt noch.' })
    }

    const importiert = gelesen.trockenlauf ? 0 : await importEinfuegen('projects', eintraege, fehler, zeilenNr)
    await importProtokollieren({ art: 'baustellen', anfrage: gelesen, importiert, uebersprungen, neu: eintraege.length, fehler, hinweise })
    return NextResponse.json({ success: true, trockenlauf: gelesen.trockenlauf, neu: eintraege.length, importiert, uebersprungen, fehler, hinweise, zeitklassen: klassen })
  } catch (e) {
    console.error('import/baustellen:', e)
    return NextResponse.json({ success: false, error: 'Import fehlgeschlagen' }, { status: 500 })
  }
}
