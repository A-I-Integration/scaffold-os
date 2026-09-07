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
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, Text, Sky, AdaptiveDpr, AdaptiveEvents, Environment } from '@react-three/drei'
import * as THREE from 'three'
import { CADModel, ScaffoldComponent3D, BuildingFeature3D } from '@/lib/calculations/cad-engine'

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
}

// ═══════════════════════════════════════════════════════════
// FARBPALETTE (einmalig, außerhalb der Komponente)
// ═══════════════════════════════════════════════════════════
// FIX (Optik-Überarbeitung): vorher hatte jeder Bauteiltyp eine eigene,
// grelle Kennfarbe (Blau/Orange/Rot/Lila usw.) – gut zum Debuggen, sieht
// aber aus wie ein Spielzeug-Baukasten, nicht wie echtes Gerüst. Echtes
// Stahlgerüst ist fast durchgehend verzinkt (silbrig-grau glänzend), nur
// Holzbeläge/Bordbretter sind bräunlich. Jetzt entsprechend angepasst.
const COLOR_MAP: Record<string, string> = {
  frame: '#c3c9cf',        // Rahmen – verzinkter Stahl
  deck: '#a8adb3',         // Stahl-Beläge – etwas dunkler/matter als die Rahmen
  railing: '#c3c9cf',       // Geländer – gleiches verzinktes Rohr wie die Rahmen
  diagonal: '#c3c9cf',      // Diagonalen – verzinkter Stahl
  footplate: '#8a8f94',    // Fußplatten – dunklerer, matterer Stahl (Bodenkontakt)
  coupling: '#6e7378',     // Kupplungen – Guss/dunkler Stahl
  anchor: '#6e7378',       // Anker – dunkler Stahl
  console: '#c3c9cf',      // Konsolen – verzinkter Stahl
  stair: '#a8adb3',        // Treppen – Stahl, ähnlich den Belägen
  net: '#3b6fa0',          // Schutznetz – klassisches Blau, halbtransparent
  board: '#8a6d4f',        // Bordbretter – Holz
  protection_roof: '#7a828a', // Schutzdach – Well-/Stahlblech, gedeckter Grauton
  load_plate: '#5c4a38',   // Lastverteilplatten – Holz, dunkler
  corner_brace: '#c3c9cf', // Eckverbindungen – verzinkter Stahl
}

// ═══════════════════════════════════════════════════════════
// GEOMETRIE-CACHE (einmalig pro Typ, nicht pro Render)
// ═══════════════════════════════════════════════════════════
const GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>()

function getGeometry(type: string): THREE.BufferGeometry {
  if (GEOMETRY_CACHE.has(type)) return GEOMETRY_CACHE.get(type)!
  let geo: THREE.BufferGeometry
  switch (type) {
    case 'frame':
    case 'railing':
    case 'board':
    case 'console':
    case 'stair':
    case 'protection_roof':
      geo = new THREE.BoxGeometry(1, 1, 1)
      break
    case 'deck':
      geo = new THREE.BoxGeometry(1, 1, 0.02)
      break
    case 'diagonal':
    case 'corner_brace':
      geo = new THREE.CylinderGeometry(0.015, 0.015, 1, 8)
      break
    case 'footplate':
    case 'load_plate':
      geo = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 8)
      break
    case 'coupling':
      geo = new THREE.SphereGeometry(0.04, 8, 8)
      break
    case 'anchor':
      geo = new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8)
      break
    case 'net':
    case 'safety_net':
      geo = new THREE.PlaneGeometry(1, 1)
      break
    default:
      geo = new THREE.BoxGeometry(1, 1, 1)
  }
  GEOMETRY_CACHE.set(type, geo)
  return geo
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
  const mat = new THREE.MeshStandardMaterial({
    color,
    // Verzinkter Stahl: hohe Metallizität, mittlere Rauheit (mattes, nicht
    // spiegelndes Glänzen – "Feuerverzinkung", keine Hochglanz-Chromoptik).
    // Holz: kein Metall, deutlich rauer.
    metalness: istMetall ? 0.85 : istHolz ? 0.0 : 0.3,
    roughness: istMetall ? 0.4 : istHolz ? 0.85 : 0.5,
    transparent: type === 'net' || type === 'safety_net',
    opacity: type === 'net' || type === 'safety_net' ? 0.35 : 1,
    side: type === 'net' || type === 'safety_net' ? THREE.DoubleSide : THREE.FrontSide,
    envMapIntensity: istMetall ? 1.4 : 0.5,
  })
  MATERIAL_CACHE.set(key, mat)
  return mat
}

// ═══════════════════════════════════════════════════════════
// INSTANCED BAUTEILE (Performance-optimiert)
// ═══════════════════════════════════════════════════════════
function InstancedBauteile({
  type,
  items,
  selectedComponent,
  hoveredId,
  onSelect,
  onHover,
}: {
  type: string
  items: ScaffoldComponent3D[]
  selectedComponent: string | null
  hoveredId: string | null
  onSelect: (id: string | null) => void
  onHover: (id: string | null) => void
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const { invalidate } = useThree()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const baseColor = useMemo(() => new THREE.Color(COLOR_MAP[type] || '#888888'), [type])
  const geometry = useMemo(() => getGeometry(type), [type])
  const material = useMemo(() => getMaterial(type, baseColor), [type, baseColor])

  // ─── Matrizen setzen (bei Modell-Änderung neu, nicht pro Frame) ───
  useEffect(() => {
    if (!meshRef.current) return
    const mesh = meshRef.current
    items.forEach((item, i) => {
      dummy.position.set(...item.position)
      dummy.rotation.set(...item.rotation)
      dummy.scale.set(...item.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    invalidate() // frameloop="demand": Neuzeichnen anstoßen
  }, [items, dummy, invalidate])

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
        onSelect(items[e.instanceId].id)
      }
    },
    [items, onSelect]
  )

  const handlePointerOver = useCallback(
    (e: any) => {
      e.stopPropagation()
      if (e.instanceId !== undefined && items[e.instanceId]) {
        onHover(items[e.instanceId].id)
        document.body.style.cursor = 'pointer'
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
}: {
  components: ScaffoldComponent3D[]
  visibleTypes: Record<string, boolean>
  selectedComponent: string | null
  onSelectComponent: (id: string | null) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const groups: Record<string, ScaffoldComponent3D[]> = {}
    components.forEach((comp) => {
      if (visibleTypes[comp.type] === false) return
      if (!groups[comp.type]) groups[comp.type] = []
      groups[comp.type].push(comp)
    })
    return groups
  }, [components, visibleTypes])

  return (
    <group>
      {Object.entries(grouped).map(([type, items]) => (
        <InstancedBauteile
          key={type}
          type={type}
          items={items}
          selectedComponent={selectedComponent}
          hoveredId={hoveredId}
          onSelect={onSelectComponent}
          onHover={setHoveredId}
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
  const { lengthM, heightM, widthM, roofForm, roofHeightM } = building
  const w = widthM || 6
  const roofH = roofHeightM || 0

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
        <meshStandardMaterial color="#e6dfd3" roughness={0.85} />
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
        <mesh position={[0, heightM + roofH / 2, 0]} castShadow>
          <coneGeometry args={[Math.max(lengthM, w) / 2 * 0.95, roofH, 4]} />
          <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
        </mesh>
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
// HAUPT-SZENE
// ═══════════════════════════════════════════════════════════
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
}: Props) {
  const target: [number, number, number] = [0, model.building.heightM / 2, 0]
  // Schatten-Kamera eng ans Modell anpassen (Standardwerte sind viel zu groß
  // und verschwenden Auflösung).
  const extent = Math.max(model.building.lengthM, model.building.widthM || 6, model.totalHeightM) * 0.8 + 5
  const modelKey = `${model.fieldCount}-${model.levelCount}-${model.totalHeightM}-${(features || []).length}`
  return (
    <group>
      <ShadowFreeze modelKey={modelKey} />
      <CameraController viewMode={viewMode} target={target} />
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
      <Building3D building={model.building} features={features || []} visible={showBuilding} />
      {showScaffold && (
        <AllScaffoldComponents
          components={model.components3D}
          visibleTypes={visibleTypes}
          selectedComponent={selectedComponent}
          onSelectComponent={onSelectComponent}
        />
      )}
      <DimensionLines model={model} visible={showDimensions} />
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
}: Props) {
  const cameraDistance =
    Math.max(model.building.lengthM, model.building.heightM) * 2 + 8

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
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <AdaptiveDpr pixelated />
        <AdaptiveEvents />
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
        />
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
        <p>🖱️ Links: Drehen | Rechts: Verschieben | Scroll: Zoomen</p>
      </div>
      {selectedComponent && (
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur rounded-xl px-4 py-3 text-sm border border-black/10 shadow-lg z-50">
          <p className="font-semibold text-[#1d1d1f]">
            {model.components3D.find((c) => c.id === selectedComponent)?.name}
          </p>
          <p className="text-xs text-[#86868b] mt-1">
            Art.-Nr.:{' '}
            {
              model.components3D.find((c) => c.id === selectedComponent)
                ?.articleNumber
            }
          </p>
        </div>
      )}
    </div>
  )
}

export default memo(Scaffold3D)
