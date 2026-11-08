// ============================================================
// SCAFFOLD OS – Herstellerdatenbank: Adapter für die vorhandenen Katalog-JSONs
// (lib/data/mj-katalog.json, layher-katalog.json) plus lib/data/katalog-quellen.json (PDF-Seiten, SHA-256).
// Liste → Hersteller/System/Dokument. ANNAHMEN (nicht aus den Dokumenten): Die Zuordnung "Liste = System" und die Einstufung
// als systemfreies Zubehör folgt dem Listennamen; sie ist im Import-Protokoll nachvollziehbar und änderbar.
// ============================================================

import type { ImportKontext, RohZeile, SeitenStatus, Systemart } from './typen'

export interface BestandArtikel {
  n: string; l: string; g?: string; u?: string; a?: Record<string, string | number | null>; p?: number | null
}
export interface QuellenDatei {
  dokumente: Record<string, { datei: string; sha256: string; seiten: number }>
  artikel: Record<string, { s: number[]; z: 'e' | 'm' | 'n' }>
}

const ZUBEHOER_LISTEN = new Set(['zubehoer', 'sx-zubehoer', 'layher-zubehoer', 'layher-schutz'])

export function herstellerVonListe(liste: string): { schluessel: string; name: string } {
  if (liste.startsWith('sx-')) return { schluessel: 'scafom-rux', name: 'SCAFOM-RUX' }
  if (liste.startsWith('layher-')) return { schluessel: 'layher', name: 'Layher' }
  return { schluessel: 'mj-geruest', name: 'MJ-Gerüst' }
}

export function kontextVonListe(liste: string, quellen: QuellenDatei | null): ImportKontext {
  const h = herstellerVonListe(liste)
  const systemart: Systemart = ZUBEHOER_LISTEN.has(liste) ? 'systemfreies_zubehoer' : 'systemkomponente'
  const dok = quellen?.dokumente[liste]
  return {
    herstellerSchluessel: h.schluessel,
    systemSchluessel: systemart === 'systemfreies_zubehoer' ? null : liste,
    systemart,
    dokumentSha256: dok?.sha256 ?? null,
    dokumentDateiname: dok?.datei ?? null,
  }
}

const SEITEN_STATUS: Record<string, SeitenStatus> = { e: 'eindeutig', m: 'mehrere', n: 'nicht_gefunden' }

export function zeilenAusBestand(artikel: BestandArtikel[], liste: string, quellen: QuellenDatei | null): RohZeile[] {
  const out: RohZeile[] = []
  let i = 0
  for (const a of artikel) {
    if (a.l !== liste) continue
    i++
    const q = quellen?.artikel[`${liste}|${a.n}`]
    out.push({
      zeile: i,
      nummer: a.n,
      bezeichnung: a.u || undefined,
      untertitel: a.u || undefined,
      gruppe: a.g || undefined,
      attribute: { ...(a.a ?? {}) },
      preis: a.p ?? null,
      seiten: q?.s?.length ? q.s : null,
      seitenStatus: q ? SEITEN_STATUS[q.z] ?? 'unbekannt' : 'unbekannt',
    })
  }
  return out
}
