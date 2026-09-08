// ============================================================
// SCAFFOLD OS – IFC-Export (Marktvergleich, Architektur-Dokument
// Punkt 5: BIM/IFC-Export)
//
// Nutzt web-ifc (WASM, Teil des "That Open Company"-Projekts / früher
// ifc.js – dieselbe Bibliothek, auf der viele BIM-Web-Viewer basieren).
// VOR dem Einbau hier ausführlich isoliert getestet: Modell erzeugen,
// Bauteile mit echter, extrudierter Geometrie + Rotation schreiben,
// speichern, mit DERSELBEN Bibliothek wieder einlesen und die 3D-
// Geometrie erfolgreich extrahieren (echter Rundlauf-Test, nicht nur
// "compiliert").
//
// Bewusste Vereinfachung: jedes Bauteil wird als Box (rechteckiges,
// extrudiertes Profil) dargestellt, nicht als exakte Rohr-/Kupplungs-
// form – für die BIM-Koordination mit anderen Gewerken (Kollisions-
// prüfung, Platzbedarf) ist das der übliche, ausreichende Detailgrad.
// Web-ifc selbst ist offiziell "pre-alpha" für den Schreibfall –
// deshalb hier bewusst nur einfache, robuste Konstrukte verwendet.
// ============================================================

import type { CADModel } from '@/lib/calculations/cad-engine'
import * as THREE from 'three'

let wasmInitialisiert: Promise<any> | null = null

async function ladeIfcApi() {
  if (!wasmInitialisiert) {
    wasmInitialisiert = (async () => {
      const WebIFC = await import('web-ifc')
      const ifcApi = new WebIFC.IfcAPI()
      ifcApi.SetWasmPath('/wasm/')
      await ifcApi.Init()
      return { WebIFC, ifcApi }
    })()
  }
  return wasmInitialisiert
}

function guid(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
  let s = ''
  for (let i = 0; i < 22; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

// Grobe Bauteil-Abmessungen (m) für die Box-Näherung je Typ –
// entspricht den in Scaffold3D.tsx verwendeten Grundformen.

export async function generateIFC(model: CADModel, projektName: string): Promise<Uint8Array> {
  const { WebIFC, ifcApi } = await ladeIfcApi()
  const modelID = ifcApi.CreateModel({ schema: WebIFC.Schemas.IFC4, name: projektName, authors: ['SCAFFOLD OS'], organizations: ['SCAFFOLD OS'] })
  const L = (v: number) => new WebIFC.IFC4.IfcLengthMeasure(v)
  const write = (obj: any) => { ifcApi.WriteLine(modelID, obj); return obj }

  // ─── Einheiten (Meter) ───
  const laengeneinheit = write(new WebIFC.IFC4.IfcSIUnit(null, WebIFC.IFC4.IfcUnitEnum.LENGTHUNIT, null, WebIFC.IFC4.IfcSIUnitName.METRE))
  const unitAssignment = write(new WebIFC.IFC4.IfcUnitAssignment([laengeneinheit]))

  // ─── Welt-Koordinatenkontext ───
  const originPunkt = write(new WebIFC.IFC4.IfcCartesianPoint([L(0), L(0), L(0)]))
  const weltPlacement = write(new WebIFC.IFC4.IfcAxis2Placement3D(originPunkt, null, null))
  const geoContext = write(new WebIFC.IFC4.IfcGeometricRepresentationContext(null, new WebIFC.IFC4.IfcLabel('Model'), new WebIFC.IFC4.IfcDimensionCount(3), null, weltPlacement, null))

  // ─── Projekt/Standort/Gebäude/Geschoss-Hierarchie ───
  const project = write(new WebIFC.IFC4.IfcProject(new WebIFC.IFC4.IfcGloballyUniqueId(guid()), null, new WebIFC.IFC4.IfcLabel(projektName), null, null, null, null, [geoContext], unitAssignment))
  const site = write(new WebIFC.IFC4.IfcSite(new WebIFC.IFC4.IfcGloballyUniqueId(guid()), null, new WebIFC.IFC4.IfcLabel('Baustelle'), null, null, null, null, null, null, null, null, null, null, null))
  const building = write(new WebIFC.IFC4.IfcBuilding(new WebIFC.IFC4.IfcGloballyUniqueId(guid()), null, new WebIFC.IFC4.IfcLabel('Gerüst'), null, null, null, null, null, null, null, null, null))
  const storey = write(new WebIFC.IFC4.IfcBuildingStorey(new WebIFC.IFC4.IfcGloballyUniqueId(guid()), null, new WebIFC.IFC4.IfcLabel('Ebene 0'), null, null, null, null, null, null, L(0)))

  write(new WebIFC.IFC4.IfcRelAggregates(new WebIFC.IFC4.IfcGloballyUniqueId(guid()), null, null, null, project, [site]))
  write(new WebIFC.IFC4.IfcRelAggregates(new WebIFC.IFC4.IfcGloballyUniqueId(guid()), null, null, null, site, [building]))
  write(new WebIFC.IFC4.IfcRelAggregates(new WebIFC.IFC4.IfcGloballyUniqueId(guid()), null, null, null, building, [storey]))

  // ─── Je Bauteil: Box-Geometrie mit korrekter Position + Rotation ───
  // Rotation über THREE.js-Matrizen bestimmt (statt eigener Trigonometrie),
  // um Achsen-/Vorzeichenfehler zu vermeiden – liefert die lokale X- und
  // Z-Achse des rotierten Bauteils, die IFC als refDirection/axis erwartet.
  const bauteilIds: number[] = []
  const m4 = new THREE.Matrix4()
  const euler = new THREE.Euler()
  const xAchse = new THREE.Vector3()
  const zAchse = new THREE.Vector3()

  for (const comp of model.components3D) {
    // FIX: ursprünglich wurde angenommen, "Skalierung entlang Y" sei immer
    // die Bauteil-Länge – stimmt für stehende Rahmen, aber NICHT für z.B.
    // Querriegel (liegend, Länge auf X: scale=[lengthM, 0.04, 0.04]).
    // Robuster: einfach alle drei Skalierungswerte 1:1 als Box-Maße nehmen
    // (genau wie Three.js' BoxGeometry(1,1,1).scale(...) es tut) – keine
    // Annahme nötig, welche Achse "die lange" ist.
    const [sx, sy, sz] = comp.scale

    euler.set(comp.rotation[0], comp.rotation[1], comp.rotation[2])
    m4.makeRotationFromEuler(euler)
    xAchse.setFromMatrixColumn(m4, 0)
    zAchse.setFromMatrixColumn(m4, 2)

    const punkt = write(new WebIFC.IFC4.IfcCartesianPoint([L(comp.position[0]), L(comp.position[2]), L(comp.position[1])]))
    const axisRichtung = write(new WebIFC.IFC4.IfcDirection([zAchse.x, zAchse.z, zAchse.y]))
    const refRichtung = write(new WebIFC.IFC4.IfcDirection([xAchse.x, xAchse.z, xAchse.y]))
    const placement3d = write(new WebIFC.IFC4.IfcAxis2Placement3D(punkt, axisRichtung, refRichtung))
    const localPlacement = write(new WebIFC.IFC4.IfcLocalPlacement(null, placement3d))

    const profilPunkt = write(new WebIFC.IFC4.IfcCartesianPoint([L(0), L(0)]))
    const profilPlacement = write(new WebIFC.IFC4.IfcAxis2Placement2D(profilPunkt, null))
    const profil = write(new WebIFC.IFC4.IfcRectangleProfileDef(WebIFC.IFC4.IfcProfileTypeEnum.AREA, null, profilPlacement, L(Math.max(sx, 0.01)), L(Math.max(sy, 0.01))))
    const extrudeAxisPunkt = write(new WebIFC.IFC4.IfcCartesianPoint([L(0), L(0), L(0)]))
    const extrudeAxis = write(new WebIFC.IFC4.IfcAxis2Placement3D(extrudeAxisPunkt, null, null))
    const richtung = write(new WebIFC.IFC4.IfcDirection([0, 0, 1]))
    const solid = write(new WebIFC.IFC4.IfcExtrudedAreaSolid(profil, extrudeAxis, richtung, L(Math.max(sz, 0.01))))

    const shapeRep = write(new WebIFC.IFC4.IfcShapeRepresentation(geoContext, new WebIFC.IFC4.IfcLabel('Body'), new WebIFC.IFC4.IfcLabel('SweptSolid'), [solid]))
    const prodShape = write(new WebIFC.IFC4.IfcProductDefinitionShape(null, null, [shapeRep]))

    const proxy = write(new WebIFC.IFC4.IfcBuildingElementProxy(
      new WebIFC.IFC4.IfcGloballyUniqueId(guid()), null,
      new WebIFC.IFC4.IfcLabel(comp.type), null, null,
      localPlacement, prodShape, null, null,
    ))
    bauteilIds.push(proxy)
  }

  if (bauteilIds.length > 0) {
    // In Blöcken von 500 zuordnen (IFC-Relationen vertragen zwar große
    // Listen, aber kleinere Blöcke sind robuster/einfacher zu debuggen).
    for (let i = 0; i < bauteilIds.length; i += 500) {
      write(new WebIFC.IFC4.IfcRelContainedInSpatialStructure(
        new WebIFC.IFC4.IfcGloballyUniqueId(guid()), null, null, null,
        bauteilIds.slice(i, i + 500), storey,
      ))
    }
  }

  const daten = ifcApi.SaveModel(modelID)
  ifcApi.CloseModel(modelID)
  return daten
}

export function downloadIFC(daten: Uint8Array, dateiname: string) {
  const blob = new Blob([new Uint8Array(daten)], { type: 'application/x-step' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = dateiname
  a.click()
  URL.revokeObjectURL(a.href)
}
