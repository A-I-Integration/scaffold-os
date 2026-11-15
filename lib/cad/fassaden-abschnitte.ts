// ============================================================
// SCAFFOLD OS – Übergabemodell für einzelne Fassadenabschnitte.
//
// Dieses Modul überführt geprüfte Fassadenflächen in explizite,
// geometrisch beschriebene Abschnitte. Es erzeugt noch KEIN Gerüst
// und verändert nicht die bestehende CAD-Engine.
// ============================================================

import type { FassadenFlaeche } from './fassaden-flaechen'
import type { UmrissPunkt } from '@/lib/calculations/cad-umriss'

export interface FassadenAbschnitt {
  id: string
  geschoss: string
  start: UmrissPunkt
  ende: UmrissPunkt
  unterkanteM: number
  oberkanteM: number
  laengeM: number
  hoeheM: number
  /** Winkel der Fassadenkante in der x/z-Ebene. */
  yawRad: number
  /** Einheitsnormale, vom Gebäude nach außen gerichtet. */
  aussenNormale: [number, number]
  seite: FassadenFlaeche['seite']
  /** Muss vor einer produktiven Gerüstberechnung fachlich geprüft werden. */
  status: 'manuell-zu-pruefen'
}

export type FassadenAbschnittErgebnis =
  | { ok: true; abschnitte: FassadenAbschnitt[] }
  | { ok: false; fehler: string }

const EPS = 1e-6

/**
 * Wandelt sichtbare Fassadenflächen in einzelne, gerichtete Abschnitte um.
 * Die Außen-Normale folgt der Kantenrichtung und der Rasterseiten-Semantik:
 * oben = -z, rechts = +x, unten = +z, links = -x.
 */
export function erzeugeFassadenAbschnitte(
  flaechen: FassadenFlaeche[],
): FassadenAbschnittErgebnis {
  if (!Array.isArray(flaechen) || flaechen.length === 0) {
    return { ok: false, fehler: 'Es wurden keine Fassadenflächen übergeben.' }
  }

  const abschnitte: FassadenAbschnitt[] = []
  for (let i = 0; i < flaechen.length; i++) {
    const f = flaechen[i]
    if (!f || !f.geschoss?.trim()) {
      return { ok: false, fehler: `Fassadenfläche ${i + 1} hat keine Geschosszuordnung.` }
    }
    const werte = [f.von?.x, f.von?.z, f.bis?.x, f.bis?.z, f.untenM, f.obenM]
    if (werte.some((v) => !Number.isFinite(v))) {
      return { ok: false, fehler: `Fassadenfläche ${i + 1} enthält ungültige Koordinaten oder Höhen.` }
    }
    if (f.obenM <= f.untenM + EPS) {
      return { ok: false, fehler: `Fassadenfläche ${i + 1} hat keine positive Höhe.` }
    }

    const dx = f.bis.x - f.von.x
    const dz = f.bis.z - f.von.z
    const laengeM = Math.hypot(dx, dz)
    if (laengeM <= EPS) {
      return { ok: false, fehler: `Fassadenfläche ${i + 1} hat keine positive Länge.` }
    }

    const hoeheM = f.obenM - f.untenM
    // Für die von fassadenFlaechenAusGeschossen gelieferte Laufrichtung
    // zeigt (dz, -dx) nach außen.
    const normalisiereNull = (wert: number) => (Math.abs(wert) < EPS ? 0 : wert)
    const aussenNormale: [number, number] = [
      normalisiereNull(dz / laengeM),
      normalisiereNull(-dx / laengeM),
    ]
    abschnitte.push({
      id: `fassade-${i + 1}`,
      geschoss: f.geschoss,
      start: { x: f.von.x, z: f.von.z },
      ende: { x: f.bis.x, z: f.bis.z },
      unterkanteM: f.untenM,
      oberkanteM: f.obenM,
      laengeM,
      hoeheM,
      yawRad: Math.atan2(-dz, dx),
      aussenNormale,
      seite: f.seite,
      status: 'manuell-zu-pruefen',
    })
  }

  return { ok: true, abschnitte }
}
