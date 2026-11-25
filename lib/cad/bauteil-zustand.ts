// ============================================================
// SCAFFOLD OS – Zustand einzelner Bauteile im CAD: gesperrt, ausgeblendet, isoliert.
//
// Reine Logik ohne React. Der Zustand liegt NEBEN dem Modell (wie die manuellen Änderungen) und verändert es nie:
//  - gesperrt:     das Bauteil darf nicht verschoben, gedreht, ersetzt, kopiert, entfernt werden.
//  - ausgeblendet: das Bauteil wird im 3D nicht gezeigt und kann nicht angeklickt werden. Stückliste und Kosten bleiben unverändert
//                  (ausgeblendet ist NICHT entfernt).
//  - isoliert:     nur diese Bauteile werden gezeigt, alle anderen sind verborgen. Leer = keine Isolierung.
// Sichtbar ist ein Bauteil, wenn es nicht ausgeblendet ist und (keine Isolierung aktiv ist oder es zur Isolierung gehört).
// ============================================================

import type { CADModel } from '@/lib/calculations/cad-engine'

export interface BauteilZustand { gesperrt: string[]; ausgeblendet: string[]; isoliert: string[] }
export const KEIN_ZUSTAND: BauteilZustand = { gesperrt: [], ausgeblendet: [], isoliert: [] }

const mit = (liste: string[], ids: readonly string[]): string[] => [...new Set([...liste, ...ids])]
const ohne = (liste: string[], ids: readonly string[]): string[] => { const w = new Set(ids); return liste.filter((i) => !w.has(i)) }

export const istGesperrt = (z: BauteilZustand, id: string): boolean => z.gesperrt.includes(id)
export const istSichtbar = (z: BauteilZustand, id: string): boolean => !z.ausgeblendet.includes(id) && (z.isoliert.length === 0 || z.isoliert.includes(id))

export function setzeGesperrt(z: BauteilZustand, ids: readonly string[], an: boolean): BauteilZustand {
  return { ...z, gesperrt: an ? mit(z.gesperrt, ids) : ohne(z.gesperrt, ids) }
}

/** Ausblenden nimmt die Teile auch aus einer Isolierung; Einblenden blendet sie nur ein (eine Isolierung bleibt bestehen). */
export function setzeAusgeblendet(z: BauteilZustand, ids: readonly string[], an: boolean): BauteilZustand {
  if (an) return { ...z, ausgeblendet: mit(z.ausgeblendet, ids), isoliert: ohne(z.isoliert, ids) }
  return { ...z, ausgeblendet: ohne(z.ausgeblendet, ids) }
}

/** Nur diese Bauteile zeigen. Ausgeblendete Teile unter den gewählten werden dabei wieder eingeblendet (man isoliert, was man sehen will). */
export function isoliere(z: BauteilZustand, ids: readonly string[]): BauteilZustand {
  if (ids.length === 0) return z
  return { ...z, isoliert: [...new Set(ids)], ausgeblendet: ohne(z.ausgeblendet, ids) }
}
export const hebeIsolierungAuf = (z: BauteilZustand): BauteilZustand => (z.isoliert.length ? { ...z, isoliert: [] } : z)
/** Alles wieder zeigen (Sperren bleiben). */
export const zeigeAlle = (z: BauteilZustand): BauteilZustand => (z.ausgeblendet.length || z.isoliert.length ? { ...z, ausgeblendet: [], isoliert: [] } : z)

/** Ids, die durch Ausblenden oder Isolieren gerade nicht gezeigt werden (nur Ids, die es im Modell gibt). */
export function verborgeneIds(model: CADModel, z: BauteilZustand): string[] {
  return model.components3D.filter((c) => !istSichtbar(z, c.id)).map((c) => c.id)
}

/** Modell nur für die 3D-Anzeige: ohne verborgene Bauteile. Ohne Ausblenden/Isolierung kommt dasselbe Objekt zurück. */
export function sichtbaresModell(model: CADModel, z: BauteilZustand): CADModel {
  if (z.ausgeblendet.length === 0 && z.isoliert.length === 0) return model
  return { ...model, components3D: model.components3D.filter((c) => istSichtbar(z, c.id)) }
}

/** Ids der Auswahl, die gesperrt sind. */
export const gesperrteIn = (z: BauteilZustand, ids: readonly string[]): string[] => ids.filter((i) => z.gesperrt.includes(i))

/** Nur noch Ids, die es im Modell gibt (nach Neuberechnung, Entfernen). Ohne Änderung kommt dasselbe Objekt zurück. */
export function bereinige(z: BauteilZustand, vorhandene: ReadonlySet<string>): BauteilZustand {
  const g = z.gesperrt.filter((i) => vorhandene.has(i)), a = z.ausgeblendet.filter((i) => vorhandene.has(i)), s = z.isoliert.filter((i) => vorhandene.has(i))
  return g.length === z.gesperrt.length && a.length === z.ausgeblendet.length && s.length === z.isoliert.length ? z : { gesperrt: g, ausgeblendet: a, isoliert: s }
}
