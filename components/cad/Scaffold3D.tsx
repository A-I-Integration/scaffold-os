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
import { OrbitControls, Grid, Text } from '@react-three/drei'
import * as THREE from 'three'
import { CADModel, ScaffoldComponent3D } from '@/lib/calculations/cad-engine'

interface Props {
  model: CADModel
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
const COLOR_MAP: Record<string, string> = {
  frame: '#3b82f6',
  deck: '#f59e0b',
  railing: '#ef4444',
  diagonal: '#8b5cf6',
  footplate: '#6b7280',
  coupling: '#e8c547',
  anchor: '#10b981',
  console: '#f43f5e',
  stair: '#84cc16',
  net: '#06b6d4',
  board: '#d97706',
  protection_roof: '#f97316',
  load_plate: '#78716c',
  corner_brace: '#6366f1',
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

function getMaterial(type: string, color: THREE.Color): THREE.MeshStandardMaterial {
  const key = `${type}-${color.getHexString()}`
  if (MATERIAL_CACHE.has(key)) return MATERIAL_CACHE.get(key)!
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: type === 'frame' || type === 'diagonal' ? 0.7 : 0.3,
    roughness: type === 'deck' || type === 'board' ? 0.7 : 0.3,
    transparent: type === 'net' || type === 'safety_net',
    opacity: type === 'net' || type === 'safety_net' ? 0.3 : 0.9,
    side: type === 'net' || type === 'safety_net' ? THREE.DoubleSide : THREE.FrontSide,
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
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const baseColor = useMemo(() => new THREE.Color(COLOR_MAP[type] || '#888888'), [type])
  const geometry = useMemo(() => getGeometry(type), [type])
  const material = useMemo(() => getMaterial(type, baseColor), [type, baseColor])

  // ─── FIX 1: Matrizen nur EINMALIG beim Mount setzen ───
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Nur beim ersten Mount

  // ─── FIX 2: Farben nur bei Selection/Hover-Änderung ───
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
  }, [items, selectedComponent, hoveredId, baseColor])

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
// GEBÄUDE
// ═══════════════════════════════════════════════════════════
function Building3D({
  building,
  visible,
}: {
  building: CADModel['building']
  visible: boolean
}) {
  if (!visible) return null
  const { lengthM, heightM, widthM, roofForm, roofHeightM } = building
  const w = widthM || 6
  const roofH = roofHeightM || 0

  return (
    <group position={[0, 0, -w / 2 - 0.5]}>
      <mesh position={[0, heightM / 2, 0]}>
        <boxGeometry args={[lengthM, heightM, w]} />
        <meshStandardMaterial color="#e8e0d5" roughness={0.9} />
      </mesh>
      {roofForm !== 'kein' && roofH > 0 && (
        <mesh position={[0, heightM + roofH / 2, 0]}>
          <coneGeometry args={[Math.max(lengthM, w) / 2 * 0.9, roofH, 4]} />
          <meshStandardMaterial color="#8b7355" roughness={0.9} />
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
// HAUPT-SZENE
// ═══════════════════════════════════════════════════════════
function Scene({
  model,
  showBuilding,
  showScaffold,
  showDimensions,
  selectedComponent,
  onSelectComponent,
  visibleTypes,
  viewMode,
}: Props) {
  const target: [number, number, number] = [0, model.building.heightM / 2, 0]
  return (
    <group>
      <CameraController viewMode={viewMode} target={target} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[15, 20, 10]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Building3D building={model.building} visible={showBuilding} />
      {showScaffold && (
        <AllScaffoldComponents
          components={model.components3D}
          visibleTypes={visibleTypes}
          selectedComponent={selectedComponent}
          onSelectComponent={onSelectComponent}
        />
      )}
      <DimensionLines model={model} visible={showDimensions} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.95} />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════
// EXPORT: HAUPTKOMPONENTE – mit memo() und stabilisiertem camera
// ═══════════════════════════════════════════════════════════
function Scaffold3D({
  model,
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

  // FIX 6: camera-Objekt stabilisieren – verhindert Canvas-Neuinitialisierung
  const cameraConfig = useMemo(
    () => ({
      position: [cameraDistance, cameraDistance * 0.6, cameraDistance] as [number, number, number],
      fov: 45,
    }),
    [cameraDistance]
  )

  return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-black/10 bg-[#f0f4f8] relative">
      <Canvas shadows camera={cameraConfig}>
        <Scene
          model={model}
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
          minDistance={5}
          maxDistance={150}
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
