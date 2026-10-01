'use client'

// Scaffold3D.tsx – v2.1 Performance-Fix (CTO-Approval)
//
// Fixes:
// 1. useFrame()-Killer entfernt → Matrizen nur einmalig beim Mount setzen
// 2. Farben nur bei Selection/Hover-Änderung aktualisieren
// 3. CameraController: useEffect statt useMemo (verhindert Kamera-Reset)
// 4. OrbitControls: makeDefault hinzugefügt
// 5. useCallback für Event-Handler (verhindert unnötige Re-Renders)
// 6. camera-Objekt mit useMemo stabilisiert (verhindert Canvas-Neuinitialisierung)
// 7. memo() für Scaffold3D und AllScaffoldComponents (verhindert Re-Render bei Parent-Changes)
// ============================================================

import { useMemo, useState, useRef, useEffect, useCallback, memo } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, Text, Sky, AdaptiveDpr, AdaptiveEvents, Environment, ContactShadows, Edges } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CADModel, ScaffoldComponent3D, BuildingFeature3D, berechneGebaeudeSegmente } from '@/lib/calculations/cad-engine'
import type { CADNote } from '@/types/cad-notes'
import type { CustomDimension } from '@/types/cad-dimensions'

interface Props {
  model: CADModel
  features?: BuildingFeature3D[]
  showBuilding: boolean
  showScaffold: boolean
  showDimensions: boolean
  selectedComponent: string | null
  onSelectComponent: (id: string | null) => void
  visibleTypes: Record<string, boolean>
  viewMode: 'perspective' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
  // NEU (Marktvergleich-Lücke 3): erlaubt der aufrufenden Seite, die
  // 3D-Ansicht als Bild für die Angebots-Anlage zu erfassen.
  onCanvasReady?: (canvas: HTMLCanvasElement) => void
  // NEU: Brücken-Zugangsgerüst – ersetzt den Gebäude-Baukörper durch
  // eine Brückendeck-Kante mit Hängekonsolen (siehe BridgeDeck3D).
  bridgeMode?: boolean
  // NEU (CP-Pro-Marktvergleich, "Notizen"-Lücke): optional, rein additiv –
  // ohne diese Props verhält sich die Komponente exakt wie vorher.
  notes?: CADNote[]
  onAddNote?: (componentId: string, componentName: string, componentType: string, text: string) => void
  // NEU (CP-Pro-Marktvergleich, "Ebenen"-Lücke): optional, rein additiv –
  // ohne diese Props verhält sich die Komponente exakt wie vorher.
  hiddenSides?: Set<string>
  hiddenLevels?: Set<number>
  // NEU (CP-Pro-Marktvergleich, "Klick-Platzierung"): optional, rein additiv.
  placementType?: string | null
  onPlacementClick?: (type: string, position: [number, number, number], side: string, levelIndex: number) => void
  // NEU (CP-Pro-Marktvergleich, "Freie Bemaßung"-Lücke): optional, rein additiv.
  measureMode?: boolean
  onMeasurePoint?: (point: [number, number, number], componentName?: string) => void
  customDimensions?: CustomDimension[]
  pendingMeasurePoint?: [number, number, number] | null
}

// ═══════════════════════════════════════════════════════════
// FARBPALETTE (einmalig, außerhalb der Komponente)
// ═══════════════════════════════════════════════════════════
// FIX (Optik-Überarbeitung): vorher hatte jeder Bauteiltyp eine eigene,
// grelle Kennfarbe (Blau/Orange/Rot/Lila usw.) – gut zum Debuggen, sieht
// aber aus wie ein Spielzeug-Baukasten, nicht wie echtes Gerüst. Echtes
// Stahlgerüst ist fast durchgehend verzinkt (silbrig-grau glänzend), nur
// Holzbeläge/Bordbretter sind bräunlich. Jetzt entsprechend angepasst.
// Phase 72 (Referenz-Optik wie Profi-Gerüstplanung): echtes Feuerverzinken
// ist HELL silbrig und MATT - nicht dunkel spiegelnd. Rote Horizontale
// (Riegel/Belagskanten) wie im Referenz-Rendering, Holz heller.
const COLOR_MAP: Record<string, string> = {
  frame: '#dde2e7',        // Rahmen – helles verzinktes Rohr
  deck: '#c9402e',         // Beläge – rot (Riegel-Akzent wie Referenz)
  railing: '#d5dade',      // Geländer – verzinkt
  diagonal: '#cfd4d9',     // Diagonalen – verzinkt
  footplate: '#aab0b6',    // Fußplatten – etwas dunkler
  coupling: '#8d9399',     // Kupplungen – Gussgrau
  anchor: '#8d9399',       // Anker
  console: '#dde2e7',      // Konsolen – verzinkt
  stair: '#c2c7cc',        // Treppen
  net: '#4a80b8',          // Schutznetz – Blau, halbtransparent
  board: '#b08a5e',        // Bordbretter – helles Holz
  protection_roof: '#9aa2a9', // Schutzdach
  load_plate: '#7a6248',   // Lastverteilplatten – Holz
  corner_brace: '#cfd4d9', // Eckverbindungen
}

// ═══════════════════════════════════════════════════════════
// GEOMETRIE-CACHE (einmalig pro Typ, nicht pro Render)
// ═══════════════════════════════════════════════════════════
const GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>()

// ─── Realistik-Update: EINHEITSFORMEN ───
// Konvention: `item.scale` enthält die ECHTEN Maße des Bauteils in Metern
// (so erzeugt es cad-engine.ts, auch bei manuell platzierten Bauteilen).
// Die Basisformen müssen deshalb Einheitsformen sein (Ausdehnung 1 pro
// Achse) – vorher waren sie zusätzlich verkleinert (z. B. Belag 0,02 × 0,02 m
// = 0,4 mm dick, Diagonale Radius 0,45 mm) und damit praktisch unsichtbar.

/** Rohr-Typen: Zylinder entlang der LÄNGSTEN scale-Achse, Durchmesser fix
 *  (ANNAHME: übliche Gerüstrohr-Durchmesser, rein optisch). */
const TUBE_DIAMETER_M: Record<string, number> = {
  frame: 0.048,
  diagonal: 0.034,
  corner_brace: 0.034,
  anchor: 0.03,
  railing: 0.048, // nur Variante 'post' (Treppengeländer-Pfosten)
}

/** Variante je Bauteil: gleicher Typ, aber unterschiedliche Bauform. */
function getVariant(item: ScaffoldComponent3D): string {
  if (item.type === 'railing') {
    // Feld-Geländer: [Länge, 1.0, 0.04] → offener Rahmen aus Rohren.
    // Treppen-Geländer: [0.04, Höhe, 0.04] → senkrechtes Rohr.
    const [sx, sy, sz] = item.scale
    return sy > sx * 5 && sy > sz * 5 ? 'post' : 'rail'
  }
  return 'default'
}

function isTube(type: string, variant: string): boolean {
  if (type === 'railing') return variant === 'post'
  return type in TUBE_DIAMETER_M
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged ?? new THREE.BoxGeometry(1, 1, 1)
}

function getGeometry(type: string, variant: string = 'default'): THREE.BufferGeometry {
  const cacheKey = `${type}|${variant}`
  if (GEOMETRY_CACHE.has(cacheKey)) return GEOMETRY_CACHE.get(cacheKey)!
  let geo: THREE.BufferGeometry
  if (isTube(type, variant)) {
    // Einheitszylinder: Durchmesser 1, Länge 1, Achse = Y. Durchmesser und
    // Länge setzt die Instanz-Matrix (siehe InstancedBauteile).
    geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)
  } else {
    switch (type) {
      case 'railing': {
        // Offenes Geländer in der Einheitsbox [Länge, 1.0 m, 0.04 m]:
        // 3 Rohre (Handlauf, Knieleiste, unten) statt massiver Platte.
        // y-Skala ist bei Feld-Geländern immer 1.0 m, z-Skala 0.04 m →
        // Durchmesser 0.04 in y-Einheiten bzw. 1 in z-Einheiten ergibt
        // ein rundes Rohr von 4 cm.
        const parts = [0.46, 0.0, -0.46].map((y) => {
          const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8)
          g.rotateZ(Math.PI / 2) // Achse Y → X
          g.scale(1, 0.04, 1)
          g.translate(0, y, 0)
          return g
        })
        geo = mergeParts(parts)
        break
      }
      case 'stair': {
        // Treppenturm in der Einheitsbox [0.8, Höhe, 0.8]: 4 Eckrohre
        // statt massivem Block (Stufen + Geländer sind eigene Bauteile).
        const parts = ([[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const).map(([x, z]) => {
          const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8)
          g.scale(0.05, 1, 0.05) // ≈ 4 cm Durchmesser bei 0.8 m Breite
          g.translate(x, 0, z)
          return g
        })
        geo = mergeParts(parts)
        break
      }
      case 'footplate':
        geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16)
        break
      case 'coupling':
        // Rosette: flache Scheibe (scale ist 0.05 → Ø ≈ 12 cm, ≈ 1 cm dick)
        geo = new THREE.CylinderGeometry(1.2, 1.2, 0.2, 16)
        break
      case 'net':
      case 'safety_net':
        geo = new THREE.PlaneGeometry(1, 1)
        break
      case 'frame':
      case 'board':
      case 'console':
      case 'deck':
      case 'load_plate':
      case 'protection_roof':
      default:
        geo = new THREE.BoxGeometry(1, 1, 1)
    }
  }
  GEOMETRY_CACHE.set(cacheKey, geo)
  return geo
}

// ─── Kantenlinien (Stufe 2, "technische Zeichnung") ───
// Nur für kantige Bauteile; Rohre/Netze/Rosetten brauchen keine Kanten
// (Rundungen wirken durch Shading, Linien an Zylindern würden flimmern).
const EDGE_TYPES = new Set(['deck', 'board', 'console', 'load_plate', 'protection_roof'])

let boxEdgePositions: Float32Array | null = null
function getBoxEdgePositions(): Float32Array {
  if (!boxEdgePositions) {
    const box = new THREE.BoxGeometry(1, 1, 1)
    const edges = new THREE.EdgesGeometry(box)
    boxEdgePositions = new Float32Array(edges.attributes.position.array as ArrayLike<number>)
    box.dispose()
    edges.dispose()
  }
  return boxEdgePositions
}

/** Baut EINE Linien-Geometrie für alle Kanten-Bauteile (ein Draw-Call).
 *  Wird nur bei Modell-/Filteränderung neu berechnet, nicht pro Frame. */
function buildEdgeGeometry(items: ScaffoldComponent3D[]): THREE.BufferGeometry | null {
  if (items.length === 0) return null
  const base = getBoxEdgePositions()
  const perItem = base.length
  const out = new Float32Array(items.length * perItem)
  const obj = new THREE.Object3D()
  const v = new THREE.Vector3()
  items.forEach((item, n) => {
    obj.position.set(...item.position)
    obj.rotation.set(...item.rotation)
    obj.scale.set(...item.scale)
    obj.updateMatrix()
    for (let i = 0; i < perItem; i += 3) {
      v.set(base[i], base[i + 1], base[i + 2]).applyMatrix4(obj.matrix)
      const o = n * perItem + i
      out[o] = v.x
      out[o + 1] = v.y
      out[o + 2] = v.z
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3))
  return geo
}

function ScaffoldEdges({ items }: { items: ScaffoldComponent3D[] }) {
  const { invalidate } = useThree()
  const geometry = useMemo(() => buildEdgeGeometry(items), [items])
  useEffect(() => {
    invalidate()
    return () => { geometry?.dispose() }
  }, [geometry, invalidate])
  if (!geometry) return null
  return (
    // raycast deaktiviert: Linien dürfen Klicks (Auswahl, Messen,
    // Platzieren) nicht abfangen.
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color="#2b3138" transparent opacity={0.55} />
    </lineSegments>
  )
}

// Netz-Textur: feines Gitter auf transparentem Grund (SSR-sicher, lazy).
let netTexCache: THREE.CanvasTexture | null = null
function getNetTex(): THREE.CanvasTexture | null {
  if (typeof window === 'undefined') return null
  if (!netTexCache) {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 10
    ctx.strokeRect(0, 0, size, size)
    netTexCache = new THREE.CanvasTexture(canvas)
    netTexCache.wrapS = netTexCache.wrapT = THREE.RepeatWrapping
    netTexCache.repeat.set(14, 7) // ≈ 18 × 21 cm Maschen bei 2,5 × 1,5 m
    netTexCache.anisotropy = 4
  }
  return netTexCache
}

// ═══════════════════════════════════════════════════════════
// MATERIAL-CACHE (einmalig pro Typ)
// ═══════════════════════════════════════════════════════════
const MATERIAL_CACHE = new Map<string, THREE.MeshStandardMaterial>()

const METALL_TYPEN = new Set(['frame', 'diagonal', 'railing', 'corner_brace', 'console', 'coupling', 'anchor', 'footplate', 'deck', 'stair'])
const HOLZ_TYPEN = new Set(['board', 'load_plate'])

function getMaterial(type: string, color: THREE.Color): THREE.MeshStandardMaterial {
  const key = `${type}-${color.getHexString()}`
  if (MATERIAL_CACHE.has(key)) return MATERIAL_CACHE.get(key)!
  const istMetall = METALL_TYPEN.has(type)
  const istHolz = HOLZ_TYPEN.has(type)
  // Phase 72: Feuerverzinkung wirkt nur hell, wenn das Licht diffus
  // gestreut wird. Vorher: metalness 0.85 + envMapIntensity 1.4 ->
  // die Environment wurde gespiegelt und die Flächen sahen DUNKEL aus
  // (der "schwarze Balken"-Effekt). Jetzt: mattes, helles Silber.
  const istRot = type === 'deck' // rote Belags-Riegel
  const istNetz = type === 'net' || type === 'safety_net'
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: istHolz ? 0.0 : istRot ? 0.3 : 0.55,
    roughness: istHolz ? 0.8 : istRot ? 0.55 : 0.55,
    transparent: istNetz,
    // Netz: Gitter-Textur (Linien deckend, Maschen durchsichtig)
    map: istNetz ? getNetTex() : null,
    alphaTest: istNetz ? 0.08 : 0,
    opacity: 1,
    side: istNetz ? THREE.DoubleSide : THREE.FrontSide,
    envMapIntensity: istHolz ? 0.4 : 0.8,
    // Box-Bauteile bekommen Kantenlinien (ScaffoldEdges): Flächen minimal
    // nach hinten versetzen, damit die Linien nicht mit ihnen flackern.
    polygonOffset: EDGE_TYPES.has(type),
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  MATERIAL_CACHE.set(key, mat)
  return mat
}

// ═══════════════════════════════════════════════════════════
// INSTANCED BAUTEILE (Performance-optimiert)
// ═══════════════════════════════════════════════════════════
// Hilfsobjekte für die Rohr-Ausrichtung (einmalig, nicht pro Instanz)
const TUBE_Q_ITEM = new THREE.Quaternion()
const TUBE_Q_FIX = new THREE.Quaternion()
const TUBE_EULER = new THREE.Euler()
const TUBE_Q_Y_TO_X = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
const TUBE_Q_Y_TO_Z = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)

function InstancedBauteile({
  type,
  variant = 'default',
  items,
  selectedComponent,
  hoveredId,
  onSelect,
  onHover,
  measureMode,
  onMeasurePoint,
  placementType,
  onPlacementClick,
}: {
  type: string
  variant?: string
  items: ScaffoldComponent3D[]
  selectedComponent: string | null
  hoveredId: string | null
  onSelect: (id: string | null) => void
  onHover: (id: string | null) => void
  measureMode?: boolean
  onMeasurePoint?: (point: [number, number, number], componentName?: string) => void
  placementType?: string | null
  onPlacementClick?: (type: string, position: [number, number, number], side: string, levelIndex: number) => void
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const { invalidate } = useThree()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const baseColor = useMemo(() => new THREE.Color(COLOR_MAP[type] || '#888888'), [type])
  const geometry = useMemo(() => getGeometry(type, variant), [type, variant])
  const material = useMemo(() => getMaterial(type, baseColor), [type, baseColor])
  const tube = isTube(type, variant)

  // ─── Matrizen setzen (bei Modell-Änderung neu, nicht pro Frame) ───
  useEffect(() => {
    if (!meshRef.current) return
    const mesh = meshRef.current
    items.forEach((item, i) => {
      dummy.position.set(...item.position)
      if (tube) {
        // Rohr: Einheitszylinder (Achse Y) entlang der längsten scale-Achse
        // legen, Durchmesser fix, Länge = Maß dieser Achse. Reihenfolge:
        // erst Achsen-Korrektur (lokal), dann die Bauteil-Rotation.
        const [sx, sy, sz] = item.scale
        const d = TUBE_DIAMETER_M[type] ?? 0.048
        TUBE_Q_ITEM.setFromEuler(TUBE_EULER.set(item.rotation[0], item.rotation[1], item.rotation[2]))
        if (sx >= sy && sx >= sz) {
          TUBE_Q_FIX.copy(TUBE_Q_Y_TO_X)
          dummy.scale.set(d, sx, d)
        } else if (sz >= sy) {
          TUBE_Q_FIX.copy(TUBE_Q_Y_TO_Z)
          dummy.scale.set(d, sz, d)
        } else {
          TUBE_Q_FIX.identity()
          dummy.scale.set(d, sy, d)
        }
        dummy.quaternion.copy(TUBE_Q_ITEM.multiply(TUBE_Q_FIX))
      } else {
        dummy.rotation.set(...item.rotation)
        dummy.scale.set(...item.scale)
      }
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    invalidate() // frameloop="demand": Neuzeichnen anstoßen
  }, [items, dummy, invalidate, tube, type])

  // ─── Farben nur bei Selection/Hover-Änderung ───
  useEffect(() => {
    if (!meshRef.current) return
    const mesh = meshRef.current
    items.forEach((item, i) => {
      const isSelected = selectedComponent === item.id
      const isHovered = hoveredId === item.id
      const col = baseColor.clone()
      if (isSelected) col.multiplyScalar(1.5).add(new THREE.Color(0.3, 0.3, 0.3))
      else if (isHovered) col.multiplyScalar(1.2)
      mesh.setColorAt(i, col)
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    invalidate()
  }, [items, selectedComponent, hoveredId, baseColor, invalidate])

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation()
      if (e.instanceId !== undefined && items[e.instanceId]) {
        // NEU (Klick-Platzierung): Im Platzierungs-Modus den Klick-Punkt
        // als Position für das Bauteil verwenden
        if (placementType && onPlacementClick && e.point) {
          const item = items[e.instanceId]
          // Seite und Ebene aus der fieldId ableiten
          let side = 'front'
          let levelIndex = 0
          if (item.fieldId) {
            const parts = item.fieldId.split('-')
            if (parts.length >= 3) {
              side = parts[1]
              levelIndex = parseInt(parts[2], 10) || 0
            }
          }
          onPlacementClick(
            placementType,
            [e.point.x, e.point.y, e.point.z],
            side,
            levelIndex
          )
          return
        }
        // NEU (Freie Bemaßung): Im Mess-Modus den 3D-Punkt melden
        // statt den Bauteil zu selektieren
        if (measureMode && onMeasurePoint && e.point) {
          onMeasurePoint(
            [e.point.x, e.point.y, e.point.z],
            items[e.instanceId].name
          )
          return
        }
        onSelect(items[e.instanceId].id)
      }
    },
    [items, onSelect, measureMode, onMeasurePoint, placementType, onPlacementClick]
  )

  const handlePointerOver = useCallback(
    (e: any) => {
      e.stopPropagation()
      if (e.instanceId !== undefined && items[e.instanceId]) {
        onHover(items[e.instanceId].id)
        document.body.style.cursor = placementType ? 'cell' : measureMode ? 'crosshair' : 'pointer'
      }
    },
    [items, onHover]
  )

  const handlePointerOut = useCallback(() => {
    onHover(null)
    document.body.style.cursor = 'default'
  }, [onHover])

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, items.length]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      castShadow
      receiveShadow
    />
  )
}

// ═══════════════════════════════════════════════════════════
// ALLE BAUTEILE (Gruppierung nach Typ) – mit memo()
// ═══════════════════════════════════════════════════════════
const AllScaffoldComponents = memo(function AllScaffoldComponents({
  components,
  visibleTypes,
  selectedComponent,
  onSelectComponent,
  lodLevel,
  hiddenSides,
  hiddenLevels,
  measureMode,
  onMeasurePoint,
  placementType,
  onPlacementClick,
}: {
  components: ScaffoldComponent3D[]
  visibleTypes: Record<string, boolean>
  selectedComponent: string | null
  onSelectComponent: (id: string | null) => void
  lodLevel: 0 | 1 | 2
  hiddenSides?: Set<string>
  hiddenLevels?: Set<number>
  measureMode?: boolean
  onMeasurePoint?: (point: [number, number, number], componentName?: string) => void
  placementType?: string | null
  onPlacementClick?: (type: string, position: [number, number, number], side: string, levelIndex: number) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // NEU: LOD (Level of Detail) – bei größerer Kameradistanz werden
  // Bauteile mit viel Instanzen, aber wenig visuellem Gewicht aus der
  // Nähe (Kupplungen, Lastverteilplatten, Netze) ausgeblendet. Reine
  // Zeichenlast-Reduktion, keine Geometrie-Vereinfachung nötig, da die
  // Grundformen ohnehin schon einfache Primitive sind (siehe getGeometry).
  const LOD_AUSBLENDEN: Record<number, string[]> = {
    0: [],
    1: ['coupling'],
    2: ['coupling', 'load_plate', 'net', 'safety_net', 'protection_roof'],
  }

  const grouped = useMemo(() => {
    const ausgeblendet = new Set(LOD_AUSBLENDEN[lodLevel] || [])
    // Gruppiert nach Typ UND Bauform (z. B. Geländer 'rail' vs. 'post'),
    // damit jede Gruppe mit EINER Geometrie als InstancedMesh gezeichnet wird.
    const groups: Record<string, { type: string; variant: string; items: ScaffoldComponent3D[] }> = {}
    components.forEach((comp) => {
      if (visibleTypes[comp.type] === false) return
      if (ausgeblendet.has(comp.type)) return
      // NEU (Ebenen/Layers): Bauteil nach Seite/Lage filtern.
      // fieldId-Format: "field-{side}-{levelIndex}-{fieldIndex}"
      // Bauteile OHNE fieldId (globale Anker, Dächer etc.) passieren immer.
      if (comp.fieldId && (hiddenSides?.size || hiddenLevels?.size)) {
        const parts = comp.fieldId.split('-') // ["field", side, levelIndex, fieldIndex]
        if (parts.length >= 3) {
          const side = parts[1]
          const levelIdx = parseInt(parts[2], 10)
          if (hiddenSides?.has(side)) return
          if (!isNaN(levelIdx) && hiddenLevels?.has(levelIdx)) return
        }
      }
      const variant = getVariant(comp)
      const key = `${comp.type}|${variant}`
      if (!groups[key]) groups[key] = { type: comp.type, variant, items: [] }
      groups[key].items.push(comp)
    })
    return groups
  }, [components, visibleTypes, lodLevel, hiddenSides, hiddenLevels])

  // Kanten-Bauteile (aus denselben gefilterten Gruppen → Ebenen-/Typ-Filter
  // und LOD gelten automatisch auch für die Linien).
  const edgeItems = useMemo(
    () => Object.values(grouped).filter((g) => EDGE_TYPES.has(g.type)).flatMap((g) => g.items),
    [grouped]
  )

  return (
    <group>
      <ScaffoldEdges items={edgeItems} />
      {Object.entries(grouped).map(([key, { type, variant, items }]) => (
        <InstancedBauteile
          key={key}
          type={type}
          variant={variant}
          items={items}
          selectedComponent={selectedComponent}
          hoveredId={hoveredId}
          onSelect={onSelectComponent}
          onHover={setHoveredId}
          measureMode={measureMode}
          onMeasurePoint={onMeasurePoint}
          placementType={placementType}
          onPlacementClick={onPlacementClick}
        />
      ))}
    </group>
  )
})

// ═══════════════════════════════════════════════════════════
// GEBÄUDE – jetzt mit echten Fenstern, Türen, Balkonen (CAD v4)
// Das Gebäude steht mit seiner Vorderseite bei z = -w/2 - 0.5,
// das Gerüst davor. Merkmale werden je Fassadenseite auf die
// jeweilige Außenfläche gesetzt.
// ═══════════════════════════════════════════════════════════

// NEU: echte, pro Dachform unterschiedliche Geometrie (vorher: IMMER
// derselbe Kegel, unabhängig von der gewählten Dachform). Satteldach/
// Pultdach als geneigte Kastenflächen (einfache, robuste Geometrie +
// Rotation statt Extrude – leichter nachvollziehbar korrekt zu bauen).
// Walmdach/Mansardendach bleiben als Kegel-Näherung (für ein Walmdach
// optisch bereits recht plausibel).
function RoofMesh({ roofForm, laengeM, breiteM, roofH }: { roofForm: string; laengeM: number; breiteM: number; roofH: number }) {
  if (roofForm === 'kein' || roofForm === 'flachdach' || roofH <= 0) return null

  if (roofForm === 'satteldach') {
    const halbeBreite = breiteM / 2
    const hangLaenge = Math.sqrt(halbeBreite * halbeBreite + roofH * roofH)
    const neigungRad = Math.atan2(roofH, halbeBreite)
    const dicke = 0.08
    return (
      <group>
        {[1, -1].map((seite) => (
          <mesh key={seite} position={[0, roofH / 2, (seite * halbeBreite) / 2]} rotation={[seite * neigungRad, 0, 0]} castShadow>
            <boxGeometry args={[laengeM, dicke, hangLaenge]} />
            <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
          </mesh>
        ))}
      </group>
    )
  }

  if (roofForm === 'pultdach') {
    const hangLaenge = Math.sqrt(breiteM * breiteM + roofH * roofH)
    const neigungRad = Math.atan2(roofH, breiteM)
    return (
      <mesh position={[0, roofH / 2, 0]} rotation={[neigungRad, 0, 0]} castShadow>
        <boxGeometry args={[laengeM, 0.08, hangLaenge]} />
        <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
      </mesh>
    )
  }

  // Walmdach / Mansardendach / Fallback: Kegel-Näherung (unverändert
  // zum bisherigen Verhalten).
  return (
    <mesh position={[0, roofH / 2, 0]} castShadow>
      <coneGeometry args={[Math.max(laengeM, breiteM) / 2 * 0.95, roofH, 4]} />
      <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
    </mesh>
  )
}

function Building3D({
  building,
  features,
  visible,
}: {
  building: CADModel['building']
  features: BuildingFeature3D[]
  visible: boolean
}) {
  if (!visible) return null
  const { lengthM, heightM, widthM, roofForm, roofHeightM, sections } = building
  const w = widthM || 6
  const roofH = roofHeightM || 0

  // NEU: mehrteiliges Gebäude (unterschiedliche Höhen/Ecken) – wenn 2+
  // Abschnitte angegeben sind, wird die Form daraus aufgebaut statt aus
  // der einzelnen lengthM/heightM. Fenster/Türen/Balkone bleiben für
  // diesen ersten Schritt bewusst nur beim Einzelgebäude aktiv (siehe
  // Lieferhinweis) – das Gebäudevolumen selbst ist aber schon korrekt.
  if (sections && sections.length >= 2) {
    const segmente = berechneGebaeudeSegmente(sections)
    return (
      <group>
        {segmente.map((seg, i) => (
          <group key={i} position={[seg.mitteX, 0, seg.mitteZ]} rotation={[0, seg.rotationYRad, 0]}>
            <mesh position={[0, seg.hoeheM / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[seg.laengeM, seg.hoeheM, w]} />
              <Edges threshold={15} color="#8f8676" />
              <meshStandardMaterial color="#e6dfd3" roughness={0.9} map={getPutzTex()} bumpMap={getPutzTex()} bumpScale={0.12} />
            </mesh>
            {/* NEU: Dach je Abschnitt – eigene Dachform, falls angegeben,
                sonst die globale Dachform des Gebäudes. Vorher hatte ein
                mehrteiliges Gebäude überhaupt kein Dach. */}
            <group position={[0, seg.hoeheM, 0]}>
              <RoofMesh roofForm={seg.roofForm || roofForm} laengeM={seg.laengeM} breiteM={w} roofH={seg.roofHoeheM ?? roofH} />
            </group>
          </group>
        ))}
      </group>
    )
  }

  // Weltposition eines Fassaden-Merkmals aus seiner Seite + Offset
  const featureTransform = (f: BuildingFeature3D): { pos: [number, number, number]; rot: [number, number, number] } => {
    const y = f.bottomY + f.heightM / 2
    const out = f.type === 'balcony' ? f.depthM / 2 : 0.02
    switch (f.side) {
      case 'front':  return { pos: [f.offsetAlongM, y, w / 2 + out], rot: [0, 0, 0] }
      case 'back':   return { pos: [f.offsetAlongM, y, -w / 2 - out], rot: [0, Math.PI, 0] }
      case 'left':   return { pos: [-lengthM / 2 - out, y, f.offsetAlongM], rot: [0, -Math.PI / 2, 0] }
      case 'right':  return { pos: [lengthM / 2 + out, y, f.offsetAlongM], rot: [0, Math.PI / 2, 0] }
    }
  }

  return (
    <group position={[0, 0, -w / 2 - 0.5]}>
      {/* Baukörper */}
      <mesh position={[0, heightM / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[lengthM, heightM, w]} />
        <Edges threshold={15} color="#8f8676" />
        <meshStandardMaterial color="#e6dfd3" roughness={0.9} map={getPutzTex()} bumpMap={getPutzTex()} bumpScale={0.12} />
      </mesh>

      {/* Fenster / Türen / Balkone */}
      {features.map((f) => {
        const { pos, rot } = featureTransform(f)
        if (f.type === 'balcony') {
          return (
            <group key={f.id} position={pos} rotation={rot}>
              {/* Balkonplatte */}
              <mesh position={[0, -f.heightM / 2 + 0.08, 0]} castShadow>
                <boxGeometry args={[f.widthM, 0.16, f.depthM]} />
                <meshStandardMaterial color="#b8b0a4" roughness={0.9} />
              </mesh>
              {/* Brüstung */}
              <mesh position={[0, 0.05, f.depthM / 2 - 0.03]}>
                <boxGeometry args={[f.widthM, f.heightM - 0.2, 0.06]} />
                <meshStandardMaterial color="#7a8290" roughness={0.6} metalness={0.3} />
              </mesh>
            </group>
          )
        }
        const istTuer = f.type === 'door'
        return (
          <group key={f.id} position={pos} rotation={rot}>
            {/* Laibung (dunkel, leicht eingesetzt) */}
            <mesh>
              <boxGeometry args={[f.widthM, f.heightM, 0.06]} />
              <meshStandardMaterial color={istTuer ? '#4a3a2c' : '#2b3a4a'} roughness={istTuer ? 0.7 : 0.2} metalness={istTuer ? 0.05 : 0.5} />
            </mesh>
            {/* Rahmen */}
            <mesh position={[0, 0, 0.035]}>
              <boxGeometry args={[f.widthM + 0.08, f.heightM + 0.08, 0.02]} />
              <meshStandardMaterial color="#f4f1ea" roughness={0.6} />
            </mesh>
            {/* Fensterkreuz */}
            {!istTuer && (
              <>
                <mesh position={[0, 0, 0.04]}><boxGeometry args={[0.03, f.heightM, 0.02]} /><meshStandardMaterial color="#f4f1ea" /></mesh>
                <mesh position={[0, 0, 0.04]}><boxGeometry args={[f.widthM, 0.03, 0.02]} /><meshStandardMaterial color="#f4f1ea" /></mesh>
              </>
            )}
          </group>
        )
      })}

      {/* Dach */}
      {roofForm !== 'kein' && roofH > 0 && (
        <group position={[0, heightM, 0]}>
          <RoofMesh roofForm={roofForm} laengeM={lengthM} breiteM={w} roofH={roofH} />
        </group>
      )}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════
// BEMAßUNG
// ═══════════════════════════════════════════════════════════
function DimensionLines({ model, visible }: { model: CADModel; visible: boolean }) {
  if (!visible) return null
  const { building, totalHeightM } = model
  const offset = 2.0
  return (
    <group>
      <MeasurementLine
        start={[-building.lengthM / 2 - offset, 0, 0]}
        end={[-building.lengthM / 2 - offset, building.heightM, 0]}
        label={`${building.heightM.toFixed(2)} m`}
      />
      <MeasurementLine
        start={[building.lengthM / 2 + offset, 0, 0]}
        end={[building.lengthM / 2 + offset, totalHeightM, 0]}
        label={`${totalHeightM.toFixed(2)} m`}
      />
      <MeasurementLine
        start={[-building.lengthM / 2, -offset, 0]}
        end={[building.lengthM / 2, -offset, 0]}
        label={`${building.lengthM.toFixed(2)} m`}
      />
    </group>
  )
}

function MeasurementLine({
  start,
  end,
  label,
}: {
  start: [number, number, number]
  end: [number, number, number]
  label: string
}) {
  const mid = useMemo(
    () =>
      new THREE.Vector3()
        .addVectors(new THREE.Vector3(...start), new THREE.Vector3(...end))
        .multiplyScalar(0.5),
    [start, end]
  )
  return (
    <group>
      <mesh position={[mid.x, mid.y, mid.z]}>
        <cylinderGeometry
          args={[
            0.02,
            0.02,
            new THREE.Vector3(...start).distanceTo(new THREE.Vector3(...end)),
            8,
          ]}
        />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <Text
        position={[mid.x, mid.y + 0.4, mid.z]}
        fontSize={0.3}
        color="#f59e0b"
        anchorX="center"
      >
        {label}
      </Text>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════
// FREIE BEMASSUNG: Maßlinie für beliebige Winkel + Marker
// ═══════════════════════════════════════════════════════════
function FreeMeasurementLine({
  start,
  end,
  label,
}: {
  start: [number, number, number]
  end: [number, number, number]
  label: string
}) {
  const startV = useMemo(() => new THREE.Vector3(...start), [start])
  const endV = useMemo(() => new THREE.Vector3(...end), [end])
  const mid = useMemo(() => startV.clone().add(endV).multiplyScalar(0.5), [startV, endV])
  const dir = useMemo(() => endV.clone().sub(startV), [startV, endV])
  const len = useMemo(() => dir.length(), [dir])
  // Quaternion um den Zylinder (Y-Achse) in Richtung start→end zu drehen
  const quat = useMemo(() => {
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
    return q
  }, [dir])
  // Euler-Winkel aus dem Quaternion für die group-Rotation
  const euler = useMemo(() => new THREE.Euler().setFromQuaternion(quat), [quat])

  return (
    <group>
      {/* Linie */}
      <mesh position={[mid.x, mid.y, mid.z]} rotation={euler}>
        <cylinderGeometry args={[0.03, 0.03, len, 8]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      {/* Endkugeln */}
      <mesh position={start}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <mesh position={end}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      {/* Label */}
      <Text
        position={[mid.x, mid.y + 0.5, mid.z]}
        fontSize={0.35}
        color="#f59e0b"
        anchorX="center"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        {label}
      </Text>
    </group>
  )
}

/** Orangener Punkt am ersten angeklickten Messpunkt */
function PendingMeasureMarker({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null)
  // Sanftes Pulsieren für visuelles Feedback
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const s = 0.12 + Math.sin(clock.elapsedTime * 3) * 0.03
      meshRef.current.scale.setScalar(s / 0.12)
    }
  })
  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
    </mesh>
  )
}

/** Rendert alle benutzerdefinierten Maßlinien + optionalen Pending-Marker */
function CustomDimensionLines({
  dimensions,
  pendingPoint,
}: {
  dimensions?: CustomDimension[]
  pendingPoint?: [number, number, number] | null
}) {
  return (
    <group>
      {(dimensions || []).map((dim) => (
        <FreeMeasurementLine
          key={dim.id}
          start={dim.start}
          end={dim.end}
          label={`${dim.distanceM.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`}
        />
      ))}
      {pendingPoint && <PendingMeasureMarker position={pendingPoint} />}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════
// KAMERA-CONTROLLER (FIX 3: useEffect statt useMemo)
// ═══════════════════════════════════════════════════════════
function CameraController({
  viewMode,
  target,
}: {
  viewMode: string
  target: [number, number, number]
}) {
  const { camera } = useThree()
  const prevViewMode = useRef(viewMode)

  useEffect(() => {
    if (prevViewMode.current === viewMode) return
    prevViewMode.current = viewMode

    const dist = Math.max(25, target[1] * 1.5)
    let pos: [number, number, number] = [dist, dist * 0.6, dist]
    switch (viewMode) {
      case 'front':
        pos = [0, target[1] * 0.5, dist]
        break
      case 'back':
        pos = [0, target[1] * 0.5, -dist]
        break
      case 'left':
        pos = [-dist, target[1] * 0.5, 0]
        break
      case 'right':
        pos = [dist, target[1] * 0.5, 0]
        break
      case 'top':
        pos = [0, dist, 0]
        break
      case 'bottom':
        pos = [0, -dist * 0.3, 0]
        break
    }
    camera.position.set(...pos)
    camera.lookAt(target[0], target[1], target[2])
  }, [viewMode, camera, target])

  return null
}

// ═══════════════════════════════════════════════════════════
// SCHATTEN EINFRIEREN (Performance): das Gerüstmodell ist statisch –
// die Schattenkarte muss nur neu berechnet werden, wenn sich das
// Modell ändert, nicht bei jeder Kamerabewegung.
// ═══════════════════════════════════════════════════════════
function ShadowFreeze({ modelKey }: { modelKey: string }) {
  const { gl, invalidate } = useThree()
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [gl, invalidate, modelKey])
  return null
}

// ═══════════════════════════════════════════════════════════
// Phase 70 (CTO Visual-Upgrade):
// 1. AutoFraming – Kamera richtet sich am Modell aus: 5-m-Häuschen
//    und 60-m-Halle fuellen den Ausschnitt gleich gut (vorher: fixe
//    Ecke -> Modell klein in der Bildmitte-ferne).
// 2. GroundingShadow – weicher Kontaktschatten am Boden: Gerüst und
//    Gebäude STEHEN statt zu schweben.
// 3. Putz-Textur – prozedurale Oberfläche (Canvas-Noise, kein Asset)
//    statt einfarbiger Plastik-Wand.
// ═══════════════════════════════════════════════════════════

// Feiner Putz-Noise (Canvas-generiert, lazily, SSR-sicher).
let putzTexCache: THREE.CanvasTexture | null = null
function getPutzTex(): THREE.CanvasTexture | null {
  if (typeof window === 'undefined') return null // SSR: erst clientseitig erzeugen
  if (!putzTexCache) {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#e6dfd3'
    ctx.fillRect(0, 0, size, size)
    const img = ctx.getImageData(0, 0, size, size)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 16
      img.data[i] += n
      img.data[i + 1] += n
      img.data[i + 2] += n
    }
    ctx.putImageData(img, 0, 0)
    putzTexCache = new THREE.CanvasTexture(canvas)
    putzTexCache.wrapS = putzTexCache.wrapT = THREE.RepeatWrapping
    putzTexCache.repeat.set(3, 2)
  }
  return putzTexCache
}

function AutoFraming({ targetRef, modelKey }: { targetRef: { current: THREE.Group | null }; modelKey: string }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as any
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const target = targetRef.current
      if (!target) return
      const box = new THREE.Box3().setFromObject(target, true)
      if (box.isEmpty()) return
      const sphere = box.getBoundingSphere(new THREE.Sphere())
      const center = sphere.center
      const radius = Math.max(sphere.radius, 1)
      const cam = camera as THREE.PerspectiveCamera
      const fitDist = (radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.12
      camera.position.set(center.x + fitDist * 0.72, center.y + fitDist * 0.45, center.z + fitDist * 0.72)
      cam.near = Math.max(0.1, radius / 200)
      cam.far = Math.max(400, radius * 60)
      cam.updateProjectionMatrix()
      if (controls) {
        controls.target.copy(center)
        controls.update()
      }
      invalidate()
    })
    return () => cancelAnimationFrame(id)
  }, [modelKey, targetRef, camera, controls, invalidate])
  return null
}

function GroundingShadow({ targetRef, modelKey }: { targetRef: { current: THREE.Group | null }; modelKey: string }) {
  const invalidate = useThree((s) => s.invalidate)
  const [cfg, setCfg] = useState<{ pos: [number, number, number]; scale: number; far: number } | null>(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const target = targetRef.current
      if (!target) return
      const box = new THREE.Box3().setFromObject(target, true)
      if (box.isEmpty()) return
      const c = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      setCfg({
        pos: [c.x, 0.02, c.z],
        scale: Math.max(size.x, size.z) * 1.5 + 8,
        far: Math.max(size.y * 1.4, 6),
      })
      invalidate()
    })
    return () => cancelAnimationFrame(id)
  }, [modelKey, targetRef, invalidate])
  if (!cfg) return null
  return (
    <ContactShadows
      key={modelKey}
      position={cfg.pos}
      scale={cfg.scale}
      far={cfg.far}
      opacity={0.5}
      blur={2.4}
      resolution={512}
      color="#16222e"
      frames={1}
    />
  )
}

// NEU (CP-Pro-Marktvergleich, "Notizen"-Lücke): kleine, eigenständige
// Eingabekomponente mit eigenem lokalem State – wird im Info-Kasten mit
// key={bauteilId} gerendert, damit React den Entwurfstext beim
// Bauteilwechsel durch Neumontage zurücksetzt (kein setState in useEffect
// im Elternteil nötig).
function NoteInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Notiz zu diesem Bauteil…"
        rows={2}
        className="w-full text-xs border rounded-lg px-2 py-1 resize-none"
      />
      <button
        type="button"
        disabled={!text.trim()}
        onClick={() => {
          if (!text.trim()) return
          onSubmit(text.trim())
          setText('')
        }}
        className="w-full mt-1 py-1 bg-[#e8590c] text-white text-[11px] font-medium rounded-lg hover:bg-[#d14e0a] disabled:bg-gray-300 transition-colors"
      >
        + Notiz hinzufügen
      </button>
    </>
  )
}

// ═══════════════════════════════════════════════════════════
// HAUPT-SZENE
// ═══════════════════════════════════════════════════════════
// NEU: Brücken-Zugangsgerüst (Marktvergleich, "Brücken" – nur das
// Zugangsgerüst AN der Brücke, NICHT das Traggerüst/Lehrgerüst unter
// einer Brücke – das ist eine andere Norm, immer statisch
// einzelnachzuweisen, dafür gibt es bewusst kein CAD-Tool). Ersetzt
// beim Bauwerkstyp "Brücke" den Gebäude-Baukörper durch eine einfache
// Brückendeck-Kante mit Hängekonsolen – das Gerüst selbst (Rahmen,
// Beläge, Geländer) kommt unverändert aus derselben, bereits
// geprüften InstancedBauteile-Pipeline wie beim Gebäude.
function BridgeDeck3D({ building, visible }: { building: CADModel['building']; visible: boolean }) {
  if (!visible) return null
  const { lengthM, heightM, widthM } = building
  const w = widthM || 6
  const deckDicke = 0.6
  const konsolenAbstandM = 3
  const anzahlKonsolen = Math.max(2, Math.round(lengthM / konsolenAbstandM) + 1)

  return (
    <group position={[0, 0, -w / 2 - 0.5]}>
      {/* Brückendeck – eine Platte auf Höhe der Gerüst-Oberkante */}
      <mesh position={[0, heightM + deckDicke / 2, w / 2]} castShadow receiveShadow>
        <boxGeometry args={[lengthM + 1, deckDicke, w * 2]} />
        <meshStandardMaterial color="#8c8f94" roughness={0.85} />
      </mesh>
      {/* Hängekonsolen: verbinden Deck-Unterkante mit dem Gerüst darunter */}
      {Array.from({ length: anzahlKonsolen }).map((_, i) => {
        const x = -lengthM / 2 + (i * lengthM) / (anzahlKonsolen - 1)
        return (
          <mesh key={i} position={[x, heightM - 0.15, w / 4]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, w / 2, 8]} />
            <meshStandardMaterial color="#3a3f47" roughness={0.5} metalness={0.7} />
          </mesh>
        )
      })}
    </group>
  )
}

// NEU: LOD-Steuerung – prüft die Kameradistanz und meldet nur bei
// tatsächlicher Stufen-Änderung zurück (kein State-Update pro Frame,
// das war genau das Problem, das der frühere useFrame-Killer behoben
// hat – hier wird bewusst nur bei echter Änderung neu gerendert).
function LODController({ target, onLevelChange }: { target: [number, number, number]; onLevelChange: (level: 0 | 1 | 2) => void }) {
  const { camera } = useThree()
  const letzteStufe = useRef<0 | 1 | 2>(0)
  useFrame(() => {
    const dx = camera.position.x - target[0]
    const dy = camera.position.y - target[1]
    const dz = camera.position.z - target[2]
    const distanz = Math.sqrt(dx * dx + dy * dy + dz * dz)
    // Relativ zur nutzbaren Zoom-Spanne (OrbitControls: minDistance=5,
    // maxDistance=150) statt absoluter Meter – so lösen Standard-Ansichten
    // bei GROSSEN Gebäuden (die von Haus aus einen größeren Startabstand
    // brauchen) nicht sofort eine LOD-Reduktion aus. Reduktion greift erst,
    // wenn wirklich nah am Zoom-Limit "rausgezoomt" wird.
    const zoomAnteil = (distanz - 5) / (150 - 5)
    const stufe: 0 | 1 | 2 = zoomAnteil > 0.8 ? 2 : zoomAnteil > 0.55 ? 1 : 0
    if (stufe !== letzteStufe.current) {
      letzteStufe.current = stufe
      onLevelChange(stufe)
    }
  })
  return null
}

function Scene({
  model,
  features,
  showBuilding,
  showScaffold,
  showDimensions,
  selectedComponent,
  onSelectComponent,
  visibleTypes,
  viewMode,
  bridgeMode,
  hiddenSides,
  hiddenLevels,
  measureMode,
  onMeasurePoint,
  customDimensions,
  pendingMeasurePoint,
  placementType,
  onPlacementClick,
}: Props) {
  const target: [number, number, number] = [0, model.building.heightM / 2, 0]
  // Schatten-Kamera eng ans Modell anpassen (Standardwerte sind viel zu groß
  // und verschwenden Auflösung).
  const extent = Math.max(model.building.lengthM, model.building.widthM || 6, model.totalHeightM) * 0.8 + 5
  const modelKey = `${model.fieldCount}-${model.levelCount}-${model.totalHeightM}-${(features || []).length}`
  const [lodLevel, setLodLevel] = useState<0 | 1 | 2>(0)
  return (
    <group>
      <ShadowFreeze modelKey={modelKey} />
      <CameraController viewMode={viewMode} target={target} />
      <LODController target={target} onLevelChange={setLodLevel} />
      <Sky sunPosition={[40, 30, 20]} turbidity={6} rayleigh={2} />
      {/* NEU (Optik-Überarbeitung): sorgt für echte Umgebungsreflexionen auf
          dem verzinkten Stahl – ohne das sieht Metall matt/plastikartig aus,
          egal wie gut die Grundfarbe gewählt ist. background={false}: nur
          für Reflexionen/Beleuchtung genutzt, der sichtbare Himmel bleibt <Sky>. */}
      <Environment preset="city" background={false} resolution={256} environmentIntensity={0.6} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#dfe9f5', '#8c7a63', 0.35]} />
      <directionalLight
        position={[25, 35, 18]}
        intensity={1.3}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={1}
        shadow-camera-far={150}
        shadow-bias={-0.0005}
      />
      {/* NEU: sanftes Gegenlicht von der anderen Seite – vermeidet komplett
          schwarze/unlesbare Schattenseiten am Gerüst, wie es bei echten
          Baustellenfotos durch Streulicht ohnehin nie vorkommt. */}
      <directionalLight position={[-20, 15, -15]} intensity={0.35} color="#dce8f5" />
      <Building3D building={model.building} features={features || []} visible={showBuilding && !bridgeMode} />
      <BridgeDeck3D building={model.building} visible={showBuilding && !!bridgeMode} />
      {showScaffold && (
        <AllScaffoldComponents
          components={model.components3D}
          visibleTypes={visibleTypes}
          selectedComponent={selectedComponent}
          onSelectComponent={onSelectComponent}
          lodLevel={lodLevel}
          hiddenSides={hiddenSides}
          hiddenLevels={hiddenLevels}
          measureMode={measureMode}
          onMeasurePoint={onMeasurePoint}
          placementType={placementType}
          onPlacementClick={onPlacementClick}
        />
      )}
      <DimensionLines model={model} visible={showDimensions} />
      <CustomDimensionLines dimensions={customDimensions} pendingPoint={pendingMeasurePoint} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#b9c0c8" roughness={0.95} />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════
// EXPORT: HAUPTKOMPONENTE – frameloop="demand": es wird nur dann neu
// gezeichnet, wenn sich wirklich etwas ändert (Kamera, Auswahl, Modell),
// nicht dauerhaft mit voller Bildrate. Das ist der wichtigste Schalter
// gegen "3D lässt sich nicht flüssig bewegen".
// ═══════════════════════════════════════════════════════════
function Scaffold3D({
  model,
  features,
  showBuilding,
  showScaffold,
  showDimensions,
  selectedComponent,
  onSelectComponent,
  visibleTypes,
  viewMode,
  onCanvasReady,
  bridgeMode,
  notes,
  onAddNote,
  hiddenSides,
  hiddenLevels,
  placementType,
  onPlacementClick,
  measureMode,
  onMeasurePoint,
  customDimensions,
  pendingMeasurePoint,
}: Props) {
  const cameraDistance =
    Math.max(model.building.lengthM, model.building.heightM) * 2 + 8

  const contentRef = useRef<THREE.Group>(null)

  const modelKey = useMemo(
    () => `${model.building.lengthM}x${model.building.widthM}x${model.building.heightM}:${model.components3D.length}`,
    [model],
  )
  const cameraConfig = useMemo(
    () => ({
      position: [cameraDistance, cameraDistance * 0.6, cameraDistance] as [number, number, number],
      fov: 45,
    }),
    [cameraDistance]
  )

  return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-black/10 bg-[#dfe7ef] relative">
      <Canvas
        shadows
        camera={cameraConfig}
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        onCreated={({ gl }) => { onCanvasReady?.(gl.domElement) }}
      >
        <AdaptiveDpr pixelated />
        <AdaptiveEvents />
        <group ref={contentRef}>
          <Scene
            model={model}
            features={features}
            showBuilding={showBuilding}
            showScaffold={showScaffold}
            showDimensions={showDimensions}
            selectedComponent={selectedComponent}
            onSelectComponent={onSelectComponent}
            visibleTypes={visibleTypes}
            viewMode={viewMode}
            bridgeMode={bridgeMode}
            hiddenSides={hiddenSides}
            hiddenLevels={hiddenLevels}
            measureMode={measureMode}
            onMeasurePoint={onMeasurePoint}
            customDimensions={customDimensions}
            pendingMeasurePoint={pendingMeasurePoint}
            placementType={placementType}
            onPlacementClick={onPlacementClick}
          />
        </group>
        <AutoFraming targetRef={contentRef} modelKey={modelKey} />
        <GroundingShadow targetRef={contentRef} modelKey={modelKey} />
        <Grid
          position={[0, -0.01, 0]}
          args={[80, 80]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#94a3b8"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#64748b"
          fadeDistance={60}
          fadeStrength={1}
          infiniteGrid
        />
        <OrbitControls
          makeDefault
          enablePan
          enableZoom
          enableRotate
          enableDamping
          dampingFactor={0.08}
          minDistance={5}
          maxDistance={150}
          maxPolarAngle={Math.PI / 2 - 0.02}
          target={[0, model.building.heightM / 2, 0]}
        />
      </Canvas>
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-xl px-3 py-2 text-xs text-[#424245] border border-black/10 pointer-events-none shadow-sm">
        <p>
          {placementType
            ? '🧩 Platzierungsmodus: auf das Gerüst klicken, um das Bauteil zu setzen'
            : '🖱️ Links: Drehen | Rechts: Verschieben | Scroll: Zoomen'}
        </p>
      </div>
      {selectedComponent && (() => {
        const comp = model.components3D.find((c) => c.id === selectedComponent)
        // NEU (CP-Pro-Marktvergleich, "Notizen"-Lücke): Notiz-Eingabe direkt
        // am ausgewählten Bauteil, additiv im bestehenden Info-Kasten –
        // nur sichtbar, wenn die aufrufende Seite notes/onAddNote übergibt.
        const bauteilNotizen = (notes || []).filter((n) => n.componentId === selectedComponent)
        return (
          <div className="absolute top-4 right-4 bg-white/95 backdrop-blur rounded-xl px-4 py-3 text-sm border border-black/10 shadow-lg z-50 max-w-[240px]">
            <p className="font-semibold text-[#1d1d1f]">{comp?.name}</p>
            <p className="text-xs text-[#86868b] mt-1">Art.-Nr.: {comp?.articleNumber}</p>
            {onAddNote && comp && (
              <div className="mt-2 pt-2 border-t border-black/10">
                {bauteilNotizen.length > 0 && (
                  <div className="space-y-1 mb-2 max-h-24 overflow-y-auto">
                    {bauteilNotizen.map((n) => (
                      <p key={n.id} className="text-[11px] text-[#424245] bg-[#f5f5f7] rounded-lg px-2 py-1 whitespace-pre-wrap">{n.text}</p>
                    ))}
                  </div>
                )}
                {/* key=comp.id: eigener State pro Bauteil, React setzt ihn beim
                    Bauteilwechsel durch Neumontage automatisch zurück – ohne
                    einen zusätzlichen setState-in-useEffect. */}
                <NoteInput key={comp.id} onSubmit={(text) => onAddNote(comp.id, comp.name, comp.type, text)} />
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

export default memo(Scaffold3D)
