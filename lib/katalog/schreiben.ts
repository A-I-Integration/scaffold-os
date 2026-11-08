// ============================================================
// SCAFFOLD OS – Herstellerdatenbank: Schreibpfad (Supabase REST, Service-Rolle)
// Wird nur von den API-Routen nach Rollenprüfung aufgerufen. Legt NUR neue Zeilen an
// (kein Überschreiben vorhandener Artikel, kein Löschen).
// ============================================================

import { eindeutigkeitsSchluessel } from './import'
import type { ArtikelKandidat, ImportBericht, ImportKontext } from './typen'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function get<T>(pfad: string): Promise<T[]> {
  const r = await fetch(`${url}/rest/v1/${pfad}`, { headers: H })
  if (!r.ok) throw new Error(`${pfad}: ${await r.text()}`)
  return (await r.json()) as T[]
}
async function post<T>(tabelle: string, body: unknown, prefer = 'return=representation'): Promise<T[]> {
  const r = await fetch(`${url}/rest/v1/${tabelle}`, { method: 'POST', headers: { ...H, Prefer: prefer }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${tabelle}: ${await r.text()}`)
  return prefer.includes('minimal') ? [] : ((await r.json()) as T[])
}

export interface DokumentInfo { sha256: string; dateiname: string; seiten?: number | null; version?: string | null; version_quelle?: 'dokument' | 'dateiname' | 'code' | null }

/** Schlüssel bereits gespeicherter Artikel eines Herstellers (für den Dublettenschutz im Trockenlauf). */
export async function ladeVorhandeneSchluessel(herstellerSchluessel: string): Promise<Set<string>> {
  const h = (await get<{ id: string }>(`hersteller?schluessel=eq.${encodeURIComponent(herstellerSchluessel)}&select=id`))[0]
  if (!h) return new Set()
  const [systeme, dokumente] = await Promise.all([
    get<{ id: string; schluessel: string }>(`geruestsysteme?hersteller_id=eq.${h.id}&select=id,schluessel`),
    get<{ id: string; sha256: string }>(`katalog_dokumente?hersteller_id=eq.${h.id}&select=id,sha256`),
  ])
  const sys = new Map(systeme.map((s) => [s.id, s.schluessel]))
  const dok = new Map(dokumente.map((d) => [d.id, d.sha256]))
  const out = new Set<string>()
  for (let von = 0; ; von += 1000) {
    const rows = await get<{ system_id: string | null; dokument_id: string | null; artikelnummer_original: string }>(
      `katalog_artikel?hersteller_id=eq.${h.id}&select=system_id,dokument_id,artikelnummer_original&order=id&limit=1000&offset=${von}`)
    for (const r of rows) {
      out.add(eindeutigkeitsSchluessel({
        herstellerSchluessel, systemSchluessel: r.system_id ? sys.get(r.system_id) ?? null : null,
        artikelnummer_original: r.artikelnummer_original, dokumentSha256: r.dokument_id ? dok.get(r.dokument_id) ?? null : null,
      }))
    }
    if (rows.length < 1000) break
  }
  return out
}

export async function schreibeImport(
  bericht: ImportBericht, ctx: ImportKontext, dok: DokumentInfo | null,
  meta: { art: 'bestand' | 'csv' | 'excel'; dateiname?: string | null; sha256?: string | null; userId: string; roh: Map<number, Record<string, unknown>>; herstellerName?: string; systemName?: string },
): Promise<{ importLaufId: string; angelegt: number }> {
  // Stammdaten: Hersteller / System / Dokument (nur anlegen, wenn nicht vorhanden)
  let h = (await get<{ id: string }>(`hersteller?schluessel=eq.${encodeURIComponent(ctx.herstellerSchluessel)}&select=id`))[0]
  if (!h) h = (await post<{ id: string }>('hersteller', { schluessel: ctx.herstellerSchluessel, name: meta.herstellerName ?? ctx.herstellerSchluessel }))[0]
  let systemId: string | null = null
  if (ctx.systemSchluessel) {
    let s = (await get<{ id: string }>(`geruestsysteme?hersteller_id=eq.${h.id}&schluessel=eq.${encodeURIComponent(ctx.systemSchluessel)}&select=id`))[0]
    if (!s) s = (await post<{ id: string }>('geruestsysteme', { hersteller_id: h.id, schluessel: ctx.systemSchluessel, name: meta.systemName ?? ctx.systemSchluessel }))[0]
    systemId = s.id
  }
  let dokumentId: string | null = null
  if (dok) {
    let d = (await get<{ id: string }>(`katalog_dokumente?sha256=eq.${dok.sha256}&select=id`))[0]
    if (!d) d = (await post<{ id: string }>('katalog_dokumente', {
      hersteller_id: h.id, system_id: systemId, dateiname: dok.dateiname, sha256: dok.sha256, seiten: dok.seiten ?? null,
      version: dok.version ?? null, version_quelle: dok.version ? dok.version_quelle ?? 'dateiname' : null,
    }))[0]
    dokumentId = d.id
  }
  const kategorien = new Map((await get<{ id: string; schluessel: string }>('material_kategorien?select=id,schluessel')).map((k) => [k.schluessel, k.id]))

  const lauf = (await post<{ id: string }>('import_laeufe', {
    art: meta.art, status: 'abgeschlossen', hersteller_id: h.id, dateiname: meta.dateiname ?? null, sha256: meta.sha256 ?? null,
    angelegt_von: meta.userId, gesamt: bericht.gesamt, neu: bericht.neu, dubletten: bericht.dubletten, fehler: bericht.fehler, unsicher: bericht.unsicher,
  }))[0]

  const zuSchreiben = bericht.zeilen.filter((z) => (z.ergebnis === 'neu' || z.ergebnis === 'unsicher') && z.artikel)
  const artikelIds = new Map<string, string>()
  for (let von = 0; von < zuSchreiben.length; von += 200) {
    const block = zuSchreiben.slice(von, von + 200)
    const rows = block.map((z) => toRow(z.artikel!, h.id, systemId, dokumentId, lauf.id, kategorien, meta.userId))
    const ids = await post<{ id: string; artikelnummer_original: string }>('katalog_artikel', rows)
    ids.forEach((r) => artikelIds.set(r.artikelnummer_original, r.id))
  }
  // Protokoll: jede Zeile mit Rohdaten (auch Dubletten/Fehler), damit nichts verloren geht
  for (let von = 0; von < bericht.zeilen.length; von += 200) {
    const block = bericht.zeilen.slice(von, von + 200).map((z) => ({
      import_lauf_id: lauf.id, zeile: z.zeile, roh: meta.roh.get(z.zeile) ?? { nummer: z.nummer },
      ergebnis: z.ergebnis, meldungen: z.meldungen,
      katalog_artikel_id: (z.ergebnis === 'neu' || z.ergebnis === 'unsicher') ? artikelIds.get(z.artikel!.artikelnummer_original) ?? null : null,
    }))
    await post('import_zeilen', block, 'return=minimal')
  }
  return { importLaufId: lauf.id, angelegt: zuSchreiben.length }
}

function toRow(a: ArtikelKandidat, herstellerId: string, systemId: string | null, dokumentId: string | null, laufId: string, kategorien: Map<string, string>, userId: string) {
  return {
    hersteller_id: herstellerId, system_id: systemId, dokument_id: dokumentId, import_lauf_id: laufId,
    artikelnummer_original: a.artikelnummer_original, artikelnummer_basis: a.artikelnummer_basis, artikelnummer_suffix: a.artikelnummer_suffix,
    artikelnummer_normalisiert: a.artikelnummer_normalisiert, bezeichnung: a.bezeichnung, gruppe_original: a.gruppe_original,
    kategorie_id: kategorien.get(a.kategorieSchluessel) ?? null, kategorie_sicherheit: a.kategorie_sicherheit, systemart: a.systemart,
    laenge_m: a.laenge_m, breite_m: a.breite_m, hoehe_m: a.hoehe_m, durchmesser_mm: a.durchmesser_mm,
    gewicht_referenz_kg: a.gewicht_referenz_kg, gewichtsart: a.gewichtsart, mengeneinheit: a.mengeneinheit, listenpreis_netto: a.listenpreis_netto,
    attribute_roh: a.attribute_roh, quelle_seiten: a.quelle_seiten, quelle_seite_status: a.quelle_seite_status,
    pruefstatus: 'ungeprueft', freigabestatus: 'nicht_freigegeben', created_by: userId,
  }
}
