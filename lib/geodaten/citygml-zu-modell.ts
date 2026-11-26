// ============================================================
// SCAFFOLD OS – CityGML (LoD2) → neutrales Import-Modell
// Nutzt den vorhandenen Leser (lib/cad/lod2-citygml.ts) für Höhen/Dachform und liest zusätzlich die echte
// Grundfläche (GroundSurface). Rein, ohne Netz. Fehlende Werte bleiben leer, nichts wird geschätzt.
// ============================================================
import { leseLod2Gebaeude } from '@/lib/cad/lod2-citygml'
import { abstandZuPolygon, lokalAusUtm, utmAusWgs84, utmZoneAusEpsg } from '@/lib/geodaten/koordinaten'

/** Anzahl Gebäude im Text (für Diagnose). */
export const zaehleGebaeude = (xml: string): number => (xml.match(/<bldg:Building[\s>]/g) ?? []).length

/**
 * Manche Dienste (z. B. NRW OGC API ohne crs-Parameter) liefern CRS84h: Länge, Breite in Grad, Höhe in m.
 * Dann werden alle posList-Werte nach UTM (Zone nach Länge: 32 bis 12° O, sonst 33) umgerechnet, damit der Leser Meter bekommt.
 * Die Reihenfolge (Länge/Breite oder Breite/Länge) wird an den Werten erkannt. Abweichung zu ETRS89 unter ca. 1 m.
 */
export function gradNachUtm(xml: string): { xml: string; epsg: number } | null {
  const erste = /<gml:posList[^>]*>\s*([-\d.eE+]+)\s+([-\d.eE+]+)/.exec(xml)
  if (!erste) return null
  const a = Number(erste[1]), b = Number(erste[2])
  const lonLat = a >= 5 && a <= 16 && b >= 47 && b <= 56
  const latLon = b >= 5 && b <= 16 && a >= 47 && a <= 56
  if (!lonLat && !latLon) return null
  const lon0 = lonLat ? a : b
  const zone: 32 | 33 = lon0 < 12 ? 32 : 33
  const out = xml.replace(/(<gml:posList[^>]*>)([^<]+)(<\/gml:posList>)/g, (_m, o: string, inhalt: string, c: string) => {
    const v = inhalt.trim().split(/\s+/).map(Number)
    const t: string[] = []
    for (let i = 0; i + 2 < v.length; i += 3) {
      const lon = lonLat ? v[i] : v[i + 1], lat = lonLat ? v[i + 1] : v[i]
      const u = utmAusWgs84(lat, lon, zone)
      t.push(u.ost.toFixed(3), u.nord.toFixed(3), String(v[i + 2]))
    }
    return `${o}${t.join(' ')}${c}`
  })
  return { xml: out, epsg: zone === 32 ? 25832 : 25833 }
}
import { bereinigeUmriss } from '@/lib/geodaten/umriss-bereinigen'
import { baueOberbau, erkenneGiebelKanten, leseFlaechen } from '@/lib/geodaten/oberbau'
import type { GebaeudeImport, Herkunft } from '@/lib/geodaten/typen'

type Ring = [number, number][]

function flaeche(r: Ring): number {
  let s = 0
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1] }
  return Math.abs(s) / 2
}

/** Alle Grundflächen-Ringe (UTM) je Gebäude-ID. */
export function leseGrundflaechen(xml: string): Map<string, Ring[]> {
  const out = new Map<string, Ring[]>()
  const reB = /<bldg:Building\s[^>]*gml:id="([^"]+)"[^>]*>[\s\S]*?<\/bldg:Building>/g
  let m: RegExpExecArray | null
  while ((m = reB.exec(xml))) {
    const ringe: Ring[] = []
    const reG = /<bldg:GroundSurface[\s>][\s\S]*?<\/bldg:GroundSurface>/g
    let g: RegExpExecArray | null
    while ((g = reG.exec(m[0]))) {
      const reP = /<gml:exterior>[\s\S]*?<gml:posList[^>]*>([^<]+)<\/gml:posList>/g
      let p: RegExpExecArray | null
      while ((p = reP.exec(g[0]))) {
        const v = p[1].trim().split(/\s+/).map(Number)
        const r: Ring = []
        for (let i = 0; i + 2 < v.length; i += 3) r.push([v[i], v[i + 1]])
        if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop()
        if (r.length >= 3 && r.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]))) ringe.push(r)
      }
    }
    out.set(m[1], ringe)
  }
  return out
}

/** Koordinatensystem aus srsName ("…EPSG::25832", "…EPSG:25833"); sonst Rückfallwert des Providers. */
export function erkenneEpsg(xml: string, rueckfall: number): number {
  const m = /srsName="[^"]*EPSG:{1,2}(?:\d+\.\d+:)?(\d{4,5})"/.exec(xml.slice(0, 20000))
  return m ? Number(m[1]) : rueckfall
}

export interface KonverterOptionen {
  herkunft: Omit<Herkunft, 'epsg'>
  /** Rückfall-EPSG, falls die Datei keins nennt */
  epsg: number
  /** Suchpunkt (WGS84) zur Abstandsberechnung */
  suchpunkt?: { lat: number; lon: number }
  /** nur Gebäude im Umkreis (m) um den Suchpunkt behalten */
  radiusM?: number
}

export function citygmlZuImport(xmlRoh: string, opt: KonverterOptionen): GebaeudeImport[] {
  const umgerechnet = gradNachUtm(xmlRoh)
  const xml = umgerechnet ? umgerechnet.xml : xmlRoh
  const epsg = umgerechnet ? umgerechnet.epsg : erkenneEpsg(xml, opt.epsg)
  const zone = utmZoneAusEpsg(epsg)
  const alleLoD2 = leseLod2Gebaeude(xml)
  const grund = leseGrundflaechen(xml)
  const dachFl = leseFlaechen(xml, 'RoofSurface')
  const wandFl = leseFlaechen(xml, 'WallSurface')
  const punkt = opt.suchpunkt && zone ? utmAusWgs84(opt.suchpunkt.lat, opt.suchpunkt.lon, zone) : null
  const out: GebaeudeImport[] = []
  for (const g of alleLoD2) {
    const hinweise: string[] = []
    const ringe = (grund.get(g.id) ?? []).slice().sort((a, b) => flaeche(b) - flaeche(a))
    if (!ringe.length) continue
    if (ringe.length > 1) hinweise.push(`Das Gebäude hat ${ringe.length} Grundflächen; angezeigt wird die größte. Bitte prüfen.`)
    const ursprung = { ost: g.mitteOst, nord: g.mitteNord }
    const roh = ringe[0].map(([o, n]) => lokalAusUtm(o, n, ursprung))
    const { punkte: fussabdruck, entfernt } = bereinigeUmriss(roh)
    if (entfernt > 0) hinweise.push(`Umriss vereinfacht: ${entfernt} sehr kurze Kanten bzw. Punkte auf Geraden entfernt (CAD verlangt Kanten ab 0,5 m).`)
    const abstandM = punkt ? abstandZuPolygon(punkt.ost - ursprung.ost, -(punkt.nord - ursprung.nord), fussabdruck) : undefined
    if (opt.radiusM != null && abstandM != null && abstandM > opt.radiusM) continue
    if (!zone) hinweise.push(`Koordinatensystem EPSG:${epsg} wird für die Abstandsberechnung nicht unterstützt.`)
    const traufeM = g.traufeZ - g.bodenZ, firstM = g.firstZ - g.bodenZ
    if (!(firstM > 0)) hinweise.push('Höhe fehlt oder ist nicht plausibel – bitte von Hand eintragen.')
    if (umgerechnet) hinweise.push('Koordinaten wurden aus Grad (WGS84) nach UTM umgerechnet (Abweichung unter ca. 1 m).')
    hinweise.push('LoD2 vereinfacht Dachformen und lässt Türme, Gauben und Anbauten teils weg.')
    const traufeRel = g.traufeZ - g.bodenZ
    const ob = firstM > 0 && g.dachForm !== 'flachdach' && (dachFl.get(g.id)?.length ?? 0) > 0
      ? baueOberbau(dachFl.get(g.id)!, wandFl.get(g.id) ?? [], g.bodenZ, traufeRel, ursprung)
      : null
    const giebel = ob && g.dachForm === 'satteldach' && ob.waendeLokal.length > 0 ? erkenneGiebelKanten(fussabdruck, ob.waendeLokal, traufeRel) : undefined
    out.push({
      id: `${opt.herkunft.provider}:${g.id}`,
      providerObjektId: g.id,
      herkunft: { ...opt.herkunft, epsg },
      georef: { epsg, ursprungOst: ursprung.ost, ursprungNord: ursprung.nord },
      fussabdruck: fussabdruck.map((p) => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 })),
      hoehen: firstM > 0 ? { traufeM: Math.round(traufeM * 100) / 100, firstM: Math.round(firstM * 100) / 100 } : {},
      dachForm: g.dachForm,
      funktion: g.funktion,
      ...(ob && ob.oberbau.length > 0 ? { oberbau: ob.oberbau } : {}),
      ...(giebel ? { giebelKanten: giebel } : {}),
      grundflaecheM2: Math.round(g.grundflaecheM2 * 10) / 10,
      abstandM: abstandM != null ? Math.round(abstandM * 10) / 10 : undefined,
      hinweise,
      status: 'vorschlag',
      korrekturen: [],
    })
  }
  return out.sort((a, b) => (a.abstandM ?? 0) - (b.abstandM ?? 0) || (b.grundflaecheM2 ?? 0) - (a.grundflaecheM2 ?? 0))
}
