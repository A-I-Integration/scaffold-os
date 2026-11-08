import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { bereiteImportVor, berichtAlsCsv } from '@/lib/katalog/import'
import { kontextVonListe, herstellerVonListe, zeilenAusBestand, type BestandArtikel, type QuellenDatei } from '@/lib/katalog/adapter-bestand'
import { zeilenAusTabelle } from '@/lib/katalog/adapter-tabelle'
import { versionAusDateiname } from '@/lib/katalog/normalisieren'
import { ladeVorhandeneSchluessel, schreibeImport } from '@/lib/katalog/schreiben'
import type { ImportKontext, RohZeile } from '@/lib/katalog/typen'

// ============================================================
// SCAFFOLD OS – Herstellerdatenbank: Import (Admin + Disposition)
// POST { quelle: 'bestand', liste, dryRun? }
// POST { quelle: 'tabelle', matrix, hersteller, system?, systemart?, dokument?: {sha256, dateiname, seiten}, dryRun? }
// Standard ist der Trockenlauf (dryRun !== false): es wird NICHTS geschrieben. Importierte Gewichte sind immer
// ungeprüft und nicht freigegeben; die Freigabe gibt es nur über /api/katalog/freigabe (nur Admin).
// ============================================================

export const maxDuration = 60
const bad = (m: string, status = 400) => NextResponse.json({ success: false, error: m }, { status })
const MAX_ZEILEN = 20000

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = await req.json().catch(() => null) as Record<string, any> | null
    if (!b) return bad('Ungültige Anfrage.')
    const dryRun = b.dryRun !== false

    let zeilen: RohZeile[]
    let ctx: ImportKontext
    let dok: { sha256: string; dateiname: string; seiten?: number | null; version?: string | null; version_quelle?: 'dateiname' } | null = null
    let herstellerName: string | undefined
    let art: 'bestand' | 'csv' | 'excel' = 'bestand'
    let quellenSha: string | null = null

    if (b.quelle === 'bestand') {
      const liste = String(b.liste || '')
      const [mj, layher, quellen] = await Promise.all([
        import('@/lib/data/mj-katalog.json').then((m) => m.default as unknown as BestandArtikel[]),
        import('@/lib/data/layher-katalog.json').then((m) => m.default as unknown as BestandArtikel[]),
        import('@/lib/data/katalog-quellen.json').then((m) => m.default as unknown as QuellenDatei),
      ])
      const alle = [...mj, ...layher]
      if (!alle.some((a) => a.l === liste)) return bad('Unbekannte Liste.')
      ctx = kontextVonListe(liste, quellen)
      herstellerName = herstellerVonListe(liste).name
      zeilen = zeilenAusBestand(alle, liste, quellen)
      const d = quellen.dokumente[liste]
      if (d) { dok = { sha256: d.sha256, dateiname: d.datei, seiten: d.seiten, version: versionAusDateiname(d.datei), version_quelle: 'dateiname' }; quellenSha = d.sha256 }
    } else if (b.quelle === 'tabelle') {
      if (!Array.isArray(b.matrix)) return bad('matrix fehlt.')
      if (b.matrix.length > MAX_ZEILEN) return bad(`Maximal ${MAX_ZEILEN} Zeilen.`)
      const hersteller = String(b.hersteller || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      if (!hersteller) return bad('Hersteller fehlt.')
      const t = zeilenAusTabelle(b.matrix)
      if (t.fehler) return bad(t.fehler)
      zeilen = t.zeilen
      art = b.art === 'excel' ? 'excel' : 'csv'
      const sha = typeof b.dokument?.sha256 === 'string' && /^[0-9a-f]{64}$/.test(b.dokument.sha256) ? b.dokument.sha256 : null
      ctx = {
        herstellerSchluessel: hersteller, systemSchluessel: b.systemart === 'systemfreies_zubehoer' ? null : (String(b.system || '').trim().toLowerCase() || null),
        systemart: b.systemart === 'systemfreies_zubehoer' ? 'systemfreies_zubehoer' : 'systemkomponente', dokumentSha256: sha, dokumentDateiname: b.dokument?.dateiname ?? null,
      }
      herstellerName = String(b.hersteller).trim()
      if (sha) { dok = { sha256: sha, dateiname: String(b.dokument.dateiname || 'unbekannt'), seiten: Number(b.dokument.seiten) || null, version: versionAusDateiname(b.dokument.dateiname), version_quelle: 'dateiname' }; quellenSha = sha }
    } else return bad('quelle muss "bestand" oder "tabelle" sein.')

    const vorhanden = await ladeVorhandeneSchluessel(ctx.herstellerSchluessel)
    const bericht = bereiteImportVor(zeilen, ctx, vorhanden)
    const zusammenfassung = { gesamt: bericht.gesamt, neu: bericht.neu, dubletten: bericht.dubletten, fehler: bericht.fehler, unsicher: bericht.unsicher }

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, ...zusammenfassung, zeilen: bericht.zeilen.filter((z) => z.ergebnis !== 'neu' || z.meldungen.length > 0).slice(0, 500).map((z) => ({ zeile: z.zeile, nummer: z.nummer, ergebnis: z.ergebnis, meldungen: z.meldungen })), protokollCsv: berichtAlsCsv(bericht) })
    }
    if (b.bestaetigt !== true) return bad('Import nur nach Bestätigung (bestaetigt: true) nach dem Trockenlauf.')
    const rohMap = new Map(zeilen.map((z) => [z.zeile, { nummer: z.nummer, bezeichnung: z.bezeichnung ?? null, gruppe: z.gruppe ?? null, attribute: z.attribute, preis: z.preis ?? null, seiten: z.seiten ?? null } as Record<string, unknown>]))
    const res = await schreibeImport(bericht, ctx, dok, { art, dateiname: dok?.dateiname ?? null, sha256: quellenSha, userId: r.userId, roh: rohMap, herstellerName })
    return NextResponse.json({ success: true, dryRun: false, ...zusammenfassung, ...res })
  } catch (err) { return serverErrorResponse(err, 'katalog import') }
}
