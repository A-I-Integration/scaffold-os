import { NextRequest, NextResponse } from 'next/server'
import { UUID_MUSTER } from '@/lib/ansicht-link'
import { importHeaders as headers, importPruefeRolle } from '@/lib/import-auth'
import { dateiLoeschen } from '@/lib/anhang-storage'
import { FAHRZEUG_ARTEN, FRIST_ARTEN, KATEGORIEN, pruefeFristEingabe } from '@/lib/fahrzeug-fristen'

// ============================================================
// SCAFFOLD OS – Fahrzeuge und ihre Prüf-/Wartungsfristen (nur Admin/Disposition)
// GET                                   → Fahrzeuge mit Fristen und Dokumenten
// POST   { typ:'fahrzeug', kategorie?, kennzeichen, bezeichnung?, art?, gesamtgewicht_kg?, erstzulassung?, notiz? }
// POST   { typ:'frist', fahrzeug_id, art, bezeichnung?, letzte_pruefung?, intervall_monate?, faellig_am, notiz? }
// PATCH  { typ:'fahrzeug'|'frist', id, …Felder }      (neue Fälligkeit setzt die Erinnerungen zurück)
// DELETE ?typ=fahrzeug|frist&id=...                    (Dokumente werden mit gelöscht)
// Vor dem Deploy: supabase/phase-fahrzeuge.sql und supabase/phase-fristen-bereiche.sql ausführen.
// „kennzeichen“ ist bei Geräten, Mitarbeitern usw. die Bezeichnung bzw. der Name.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const fehler = (m: string, status = 400) => NextResponse.json({ success: false, error: m }, { status })
const datum = /^\d{4}-\d{2}-\d{2}$/
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const leer = (v: unknown) => v === null || v === undefined || v === ''

async function rest(pfad: string, init?: RequestInit) {
  const r = await fetch(`${url}/rest/v1/${pfad}`, { ...init, headers: { ...headers, ...(init?.headers || {}) } })
  if (!r.ok) throw new Error(await r.text())
  return r
}
const meldungVon = (e: unknown) => (e instanceof Error ? e.message : String(e))
const tabelleFehlt = (e: unknown) => /fahrzeug|relation|schema cache|kategorie|check constraint/i.test(meldungVon(e))
const sqlHinweis = (e?: unknown) => fehler(e && /kategorie|check constraint|violates/i.test(meldungVon(e)) ? 'Die Datenbank ist noch nicht erweitert – bitte supabase/phase-fristen-bereiche.sql im Supabase SQL Editor ausführen.' : 'Die Tabellen fehlen noch – bitte supabase/phase-fahrzeuge.sql im Supabase SQL Editor ausführen.', 500)

function fahrzeugFelder(b: Record<string, unknown>, neu: boolean): { felder?: Record<string, unknown>; fehler?: string } {
  const f: Record<string, unknown> = {}
  if (neu || b.kennzeichen !== undefined) { const k = text(b.kennzeichen, 20); if (!k) return { fehler: 'Bitte das Kennzeichen angeben.' }; f.kennzeichen = k.toUpperCase() }
  if (b.bezeichnung !== undefined) f.bezeichnung = text(b.bezeichnung, 100)
  if (b.art !== undefined) { if (!FAHRZEUG_ARTEN.includes(b.art as never)) return { fehler: 'Unbekannte Fahrzeugart.' }; f.art = b.art }
  // Kategorie nur mitschicken, wenn sie nicht „fahrzeug“ ist: so läuft alles Bisherige auch ohne die Erweiterungs-SQL
  if (b.kategorie !== undefined) { if (!KATEGORIEN.includes(b.kategorie as never)) return { fehler: 'Unbekannte Kategorie.' }; if (b.kategorie !== 'fahrzeug') f.kategorie = b.kategorie }
  if (b.gesamtgewicht_kg !== undefined) {
    if (leer(b.gesamtgewicht_kg)) f.gesamtgewicht_kg = null
    else { const n = Number(b.gesamtgewicht_kg); if (!Number.isInteger(n) || n < 1 || n > 100000) return { fehler: 'Gesamtgewicht in kg ist ungültig.' }; f.gesamtgewicht_kg = n }
  }
  if (b.erstzulassung !== undefined) { if (leer(b.erstzulassung)) f.erstzulassung = null; else if (typeof b.erstzulassung === 'string' && datum.test(b.erstzulassung)) f.erstzulassung = b.erstzulassung; else return { fehler: 'Erstzulassung ist ungültig.' } }
  if (b.notiz !== undefined) f.notiz = text(b.notiz, 1000)
  if (b.aktiv !== undefined) f.aktiv = b.aktiv === true
  return { felder: f }
}

export async function GET() {
  const denied = await importPruefeRolle(); if (denied) return denied
  try {
    const [f, fr, d] = await Promise.all([
      rest('fahrzeuge?select=*&order=kennzeichen.asc'),
      rest('fahrzeug_fristen?select=*&order=faellig_am.asc'),
      rest('fahrzeug_dokumente?select=id,fahrzeug_id,frist_id,file_name,file_type,size_bytes,created_at&bestaetigt_am=not.is.null&order=created_at.asc'),
    ])
    return NextResponse.json({ success: true, fahrzeuge: await f.json(), fristen: await fr.json(), dokumente: await d.json() })
  } catch (e) { console.error('fahrzeuge GET:', e); return tabelleFehlt(e) ? sqlHinweis(e) : fehler('Laden fehlgeschlagen', 500) }
}

export async function POST(req: NextRequest) {
  const denied = await importPruefeRolle(); if (denied) return denied
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  try {
    if (b.typ === 'fahrzeug') {
      const p = fahrzeugFelder(b, true); if (p.fehler) return fehler(p.fehler)
      const r = await rest('fahrzeuge', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(p.felder) })
      return NextResponse.json({ success: true, eintrag: (await r.json())[0] })
    }
    if (b.typ === 'frist') {
      if (!UUID_MUSTER.test(String(b.fahrzeug_id || ''))) return fehler('Fahrzeug fehlt.')
      const f = pruefeFristEingabe(b as never); if (f) return fehler(f)
      const r = await rest('fahrzeug_fristen', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
        fahrzeug_id: b.fahrzeug_id, art: b.art, bezeichnung: text(b.bezeichnung, 100), letzte_pruefung: leer(b.letzte_pruefung) ? null : b.letzte_pruefung,
        intervall_monate: leer(b.intervall_monate) ? null : Number(b.intervall_monate), faellig_am: b.faellig_am, notiz: text(b.notiz, 1000) }) })
      return NextResponse.json({ success: true, eintrag: (await r.json())[0] })
    }
    return fehler('Unbekannter Typ.')
  } catch (e) { console.error('fahrzeuge POST:', e); return tabelleFehlt(e) ? sqlHinweis(e) : fehler('Speichern fehlgeschlagen', 500) }
}

export async function PATCH(req: NextRequest) {
  const denied = await importPruefeRolle(); if (denied) return denied
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  if (!UUID_MUSTER.test(String(b.id || ''))) return fehler('Ungültige ID.')
  try {
    if (b.typ === 'fahrzeug') {
      const p = fahrzeugFelder(b, false); if (p.fehler) return fehler(p.fehler)
      await rest(`fahrzeuge?id=eq.${b.id}`, { method: 'PATCH', body: JSON.stringify(p.felder) })
      return NextResponse.json({ success: true })
    }
    if (b.typ === 'frist') {
      const felder: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (b.art !== undefined) { if (!FRIST_ARTEN.includes(b.art as never)) return fehler('Unbekannte Prüfart.'); felder.art = b.art }
      if (b.bezeichnung !== undefined) felder.bezeichnung = text(b.bezeichnung, 100)
      if (b.notiz !== undefined) felder.notiz = text(b.notiz, 1000)
      if (b.letzte_pruefung !== undefined) { if (leer(b.letzte_pruefung)) felder.letzte_pruefung = null; else if (typeof b.letzte_pruefung === 'string' && datum.test(b.letzte_pruefung)) felder.letzte_pruefung = b.letzte_pruefung; else return fehler('Datum der letzten Prüfung ist ungültig.') }
      if (b.intervall_monate !== undefined) { if (leer(b.intervall_monate)) felder.intervall_monate = null; else { const n = Number(b.intervall_monate); if (!Number.isInteger(n) || n < 1 || n > 120) return fehler('Intervall in Monaten muss zwischen 1 und 120 liegen.'); felder.intervall_monate = n } }
      if (b.faellig_am !== undefined) { if (typeof b.faellig_am !== 'string' || !datum.test(b.faellig_am)) return fehler('Fälligkeitsdatum ist ungültig.'); felder.faellig_am = b.faellig_am }
      await rest(`fahrzeug_fristen?id=eq.${b.id}`, { method: 'PATCH', body: JSON.stringify(felder) })
      return NextResponse.json({ success: true })
    }
    return fehler('Unbekannter Typ.')
  } catch (e) { console.error('fahrzeuge PATCH:', e); return fehler('Speichern fehlgeschlagen', 500) }
}

export async function DELETE(req: NextRequest) {
  const denied = await importPruefeRolle(); if (denied) return denied
  const id = req.nextUrl.searchParams.get('id') || ''
  const typ = req.nextUrl.searchParams.get('typ')
  if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.')
  try {
    const filter = typ === 'frist' ? `frist_id=eq.${id}` : typ === 'fahrzeug' ? `fahrzeug_id=eq.${id}` : ''
    if (!filter) return fehler('Unbekannter Typ.')
    const docs = await (await rest(`fahrzeug_dokumente?${filter}&select=storage_path`)).json()
    for (const d of docs as { storage_path: string }[]) await dateiLoeschen(d.storage_path)
    await rest(`${typ === 'frist' ? 'fahrzeug_fristen' : 'fahrzeuge'}?id=eq.${id}`, { method: 'DELETE' })
    return NextResponse.json({ success: true })
  } catch (e) { console.error('fahrzeuge DELETE:', e); return fehler('Löschen fehlgeschlagen', 500) }
}
