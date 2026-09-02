'use client'

import { useMemo, useState } from 'react'
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

// --- MATERIALIEN ---
function SteelMaterial({ color = '#c0c0c0', isSelected = false, hovered = false }: { color?: string; isSelected?: boolean; hovered?: boolean }) {
  const emissiveIntensity = isSelected ? 0.4 : hovered ? 0.15 : 0
  const opacity = isSelected ? 1 : hovered ? 0.95 : 0.9
  return (
    <meshStandardMaterial
      color={color}
      metalness={0.85}
      roughness={0.25}
      transparent
      opacity={opacity}
      emissive={isSelected ? '#ffffff' : color}
      emissiveIntensity={emissiveIntensity}
    />
  )
}

function WoodMaterial({ isSelected = false, hovered = false }: { isSelected?: boolean; hovered?: boolean }) {
  const emissiveIntensity = isSelected ? 0.3 : hovered ? 0.1 : 0
  return (
    <meshStandardMaterial
      color="#d4a574"
      metalness={0.05}
      roughness={0.75}
      transparent
      opacity={isSelected ? 1 : 0.9}
      emissive={isSelected ? '#ffffff' : '#d4a574'}
      emissiveIntensity={emissiveIntensity}
    />
  )
}

function NetMaterial({ isSelected = false }: { isSelected?: boolean }) {
  return (
    <meshStandardMaterial
      color="#e8f4f8"
      transparent
      opacity={0.25}
      side={THREE.DoubleSide}
      emissive={isSelected ? '#ffffff' : '#e8f4f8'}
      emissiveIntensity={isSelected ? 0.3 : 0}
    />
  )
}

// --- ROHR-GEOMETRIE (Ø48,3mm Stahlrohr) ---
function PipeGeometry({ length, radius = 0.024 }: { length: number; radius?: number }) {
  return <cylinderGeometry args={[radius, radius, length, 16]} />
}

// --- EINZELNES 3D-BAUTEIL ---
function ComponentMesh({ comp, isSelected, onClick, visible }: {
  comp: ScaffoldComponent3D
  isSelected: boolean
  onClick: () => void
  visible: boolean
}) {
  const [hovered, setHovered] = useState(false)
  if (!visible) return null

  const handlePointerOver = (e: any) => {
    e.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }
  const handlePointerOut = () => {
    setHovered(false)
    document.body.style.cursor = 'default'
  }

  // Rohr-Radius: Standard Gerüstrohr Ø48,3mm
  const pipeRadius = 0.02415

  switch (comp.type) {
    case 'frame': {
      // Rahmen = 2 vertikale Rohre + 2 horizontale Querrohre
      const [, h] = comp.scale
      const [, , d] = comp.scale
      const width = comp.scale[0]
      return (
        <group position={comp.position} rotation={comp.rotation}>
          <mesh onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
            <PipeGeometry length={h} radius={pipeRadius} />
            <SteelMaterial color={comp.color} isSelected={isSelected} hovered={hovered} />
          </mesh>
          {/* Querriegel oben */}
          <mesh position={[0, h / 2 - 0.05, 0]} rotation={[0, 0, Math.PI / 2]} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
            <PipeGeometry length={width} radius={pipeRadius * 0.7} />
            <SteelMaterial color={comp.color} isSelected={isSelected} hovered={hovered} />
          </mesh>
          {/* Querriegel unten */}
          <mesh position={[0, -h / 2 + 0.05, 0]} rotation={[0, 0, Math.PI / 2]} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
            <PipeGeometry length={width} radius={pipeRadius * 0.7} />
            <SteelMaterial color={comp.color} isSelected={isSelected} hovered={hovered} />
          </mesh>
        </group>
      )
    }

    case 'deck': {
      // Arbeitsbühne = Holzplanken mit Stahlrahmen
      return (
        <group position={comp.position} rotation={comp.rotation}>
          {/* Holzbelag */}
          <mesh scale={comp.scale} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
            <boxGeometry args={[1, 1, 0.02]} />
            <WoodMaterial isSelected={isSelected} hovered={hovered} />
          </mesh>
          {/* Stahlrahmen */}
          <mesh scale={[comp.scale[0], comp.scale[1], 0.025]} position={[0, 0, -0.01]} onClick={(e) => { e.stopPropagation(); onClick() }}>
            <boxGeometry args={[1, 1, 1]} />
            <SteelMaterial color="#5a5a5a" isSelected={isSelected} hovered={hovered} />
          </mesh>
        </group>
      )
    }

    case 'railing': {
      // Geländer = Rohr mit Stäben
      const [, h] = comp.scale
      const width = comp.scale[0]
      return (
        <group position={comp.position} rotation={comp.rotation}>
          {/* Oberes Handlauf-Rohr */}
          <mesh rotation={[0, 0, Math.PI / 2]} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
            <PipeGeometry length={width} radius={pipeRadius * 0.8} />
            <SteelMaterial color={comp.color} isSelected={isSelected} hovered={hovered} />
          </mesh>
          {/* Stäbe alle 50cm */}
          {Array.from({ length: Math.ceil(width / 0.5) + 1 }).map((_, i) => (
            <mesh key={i} position={[(-width / 2) + (i * 0.5), -h / 2, 0]} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
              <PipeGeometry length={h} radius={pipeRadius * 0.5} />
              <SteelMaterial color={comp.color} isSelected={isSelected} hovered={hovered} />
            </mesh>
          ))}
        </group>
      )
    }

    case 'diagonal': {
      // Diagonale = geneigtes Rohr
      return (
        <mesh position={comp.position} rotation={comp.rotation} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
          <PipeGeometry length={comp.scale[1]} radius={pipeRadius * 0.8} />
          <SteelMaterial color={comp.color} isSelected={isSelected} hovered={hovered} />
        </mesh>
      )
    }

    case 'footplate': {
      // Fußplatte = verstellbare Stütze
      return (
        <group position={comp.position} rotation={comp.rotation}>
          {/* Grundplatte */}
          <mesh scale={comp.scale} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
            <cylinderGeometry args={[0.075, 0.075, 0.04, 16]} />
            <SteelMaterial color="#4a4a4a" isSelected={isSelected} hovered={hovered} />
          </mesh>
          {/* Gewindestange */}
          <mesh position={[0, 0.15, 0]} onClick={(e) => { e.stopPropagation(); onClick() }}>
            <cylinderGeometry args={[0.012, 0.012, 0.3, 8]} />
            <SteelMaterial color="#888888" isSelected={isSelected} hovered={hovered} />
          </mesh>
        </group>
      )
    }

    case 'coupling': {
      // Kupplung = Kugel/Rosette
      return (
        <mesh position={comp.position} rotation={comp.rotation} scale={comp.scale} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
          <sphereGeometry args={[1, 16, 16]} />
          <SteelMaterial color="#e8c547" isSelected={isSelected} hovered={hovered} />
        </mesh>
      )
    }

    case 'anchor': {
      // Fassadenanker
      return (
        <group position={comp.position} rotation={comp.rotation}>
          <mesh scale={comp.scale} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
            <cylinderGeometry args={[0.04, 0.04, 0.3, 8]} />
            <SteelMaterial color="#5a5a5a" isSelected={isSelected} hovered={hovered} />
          </mesh>
          {/* Wandplatte */}
          <mesh position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.12, 0.12, 0.02]} />
            <SteelMaterial color="#5a5a5a" isSelected={isSelected} hovered={hovered} />
          </mesh>
        </group>
      )
    }

    case 'console': {
      // Konsole = Auskragung
      return (
        <group position={comp.position} rotation={comp.rotation}>
          <mesh scale={comp.scale} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
            <boxGeometry args={[1, 0.04, 0.3]} />
            <SteelMaterial color={comp.color} isSelected={isSelected} hovered={hovered} />
          </mesh>
          {/* Träger */}
          <mesh position={[0, -0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
            <PipeGeometry length={0.73} radius={pipeRadius} />
            <SteelMaterial color={comp.color} isSelected={isSelected} hovered={hovered} />
          </mesh>
        </group>
      )
    }

    case 'stair': {
      // Treppe mit Stufen
      const [, h] = comp.scale
      return (
        <group position={comp.position} rotation={comp.rotation}>
          {/* Rahmen */}
          <mesh scale={comp.scale} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
            <boxGeometry args={[1, 1, 1]} />
            <SteelMaterial color={comp.color} isSelected={isSelected} hovered={hovered} />
          </mesh>
          {/* Stufen */}
          {Array.from({ length: Math.ceil(h / 0.25) }).map((_, i) => (
            <mesh key={i} position={[0, (-h / 2) + (i * 0.25), 0.1]}>
              <boxGeometry args={[0.7, 0.02, 0.2]} />
              <WoodMaterial isSelected={isSelected} hovered={hovered} />
            </mesh>
          ))}
        </group>
      )
    }

    case 'board': {
      // Bordbrett
      return (
        <mesh position={comp.position} rotation={comp.rotation} scale={comp.scale} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
          <boxGeometry args={[1, 1, 1]} />
          <WoodMaterial isSelected={isSelected} hovered={hovered} />
        </mesh>
      )
    }

    case 'net':
    case 'safety_net': {
      // Fangnetz mit Gitterstruktur
      return (
        <group position={comp.position} rotation={comp.rotation}>
          <mesh scale={comp.scale} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
            <boxGeometry args={[1, 1, 0.005]} />
            <NetMaterial isSelected={isSelected} />
          </mesh>
          {/* Rahmen des Netzes */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[comp.scale[0], comp.scale[1], 0.01]} />
            <meshStandardMaterial color="#2d5016" transparent opacity={0.3} wireframe />
          </mesh>
        </group>
      )
    }

    case 'protection_roof': {
      // Schutzdach
      return (
        <mesh position={comp.position} rotation={comp.rotation} scale={comp.scale} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
          <boxGeometry args={[1, 0.05, 1]} />
          <meshStandardMaterial
            color="#f97316"
            metalness={0.2}
            roughness={0.4}
            transparent
            opacity={0.7}
            side={THREE.DoubleSide}
            emissive={isSelected ? '#ffffff' : '#f97316'}
            emissiveIntensity={isSelected ? 0.3 : 0}
          />
        </mesh>
      )
    }

    case 'load_plate': {
      // Lastverteilplatte
      return (
        <mesh position={comp.position} rotation={comp.rotation} scale={comp.scale} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
          <cylinderGeometry args={[0.15, 0.15, 0.04, 16]} />
          <SteelMaterial color="#4a4a4a" isSelected={isSelected} hovered={hovered} />
        </mesh>
      )
    }

    default:
      return null
  }
}

// --- GEBÄUDE MIT REALISTISCHER FASSADE ---
function Building3D({ building, visible }: { building: CADModel['building']; visible: boolean }) {
  if (!visible) return null
  const { lengthM, heightM, widthM, roofForm, roofHeightM } = building
  const w = widthM || 6
  const roofH = roofHeightM || 0

  return (
    <group position={[0, 0, -w / 2 - 0.5]}>
      {/* Hauptgebäude */}
      <mesh position={[0, heightM / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[lengthM, heightM, w]} />
        <meshStandardMaterial color="#e8e0d5" roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Fassaden-Details: Putz-Struktur */}
      <mesh position={[0, heightM / 2, w / 2 + 0.01]}>
        <boxGeometry args={[lengthM, heightM, 0.02]} />
        <meshStandardMaterial color="#f0ebe3" roughness={0.95} metalness={0.02} />
      </mesh>

      {/* Dach */}
      {roofForm !== 'kein' && roofH > 0 && (
        <group>
          {/* Dachkörper */}
          <mesh position={[0, heightM + roofH / 2, 0]} castShadow>
            <coneGeometry args={[Math.max(lengthM, w) / 2 * 0.95, roofH, 4]} />
            <meshStandardMaterial color="#8b7355" roughness={0.85} metalness={0.1} />
          </mesh>
          {/* Dachziegel-Textur (vereinfacht) */}
          <mesh position={[0, heightM + roofH / 2, 0]}>
            <coneGeometry args={[Math.max(lengthM, w) / 2 * 0.96, roofH * 1.01, 4]} />
            <meshStandardMaterial color="#a08060" roughness={0.9} metalness={0.05} wireframe />
          </mesh>
        </group>
      )}

      {/* Fenster */}
      {Array.from({ length: Math.min(building.windowCount, 12) }).map((_, i) => {
        const row = Math.floor(i / 4)
        const col = i % 4
        const xPos = -lengthM / 2 + (lengthM / 5) * (col + 1)
        const yPos = 2.5 + row * 3.0
        return (
          <group key={`window-${i}`} position={[xPos, yPos, w / 2 + 0.02]}>
            {/* Fensterrahmen */}
            <mesh>
              <boxGeometry args={[1.0, 1.2, 0.06]} />
              <meshStandardMaterial color="#4a5568" metalness={0.6} roughness={0.3} />
            </mesh>
            {/* Glas */}
            <mesh position={[0, 0, 0.02]}>
              <boxGeometry args={[0.85, 1.05, 0.02]} />
              <meshStandardMaterial color="#a5d8ff" transparent opacity={0.6} metalness={0.9} roughness={0.05} />
            </mesh>
            {/* Fensterkreuz */}
            <mesh position={[0, 0, 0.035]}>
              <boxGeometry args={[0.04, 1.05, 0.01]} />
              <meshStandardMaterial color="#4a5568" />
            </mesh>
            <mesh position={[0, 0, 0.035]}>
              <boxGeometry args={[0.85, 0.04, 0.01]} />
              <meshStandardMaterial color="#4a5568" />
            </mesh>
          </group>
        )
      })}

      {/* Türen */}
      {Array.from({ length: Math.min(building.doorCount, 3) }).map((_, i) => (
        <group key={`door-${i}`} position={[-lengthM / 2 + (lengthM / (Math.min(building.doorCount, 3) + 1)) * (i + 1), 1.0, w / 2 + 0.02]}>
          {/* Türöffnung-Rahmen */}
          <mesh>
            <boxGeometry args={[1.1, 2.2, 0.08]} />
            <meshStandardMaterial color="#5a4a3a" roughness={0.8} />
          </mesh>
          {/* Türblatt */}
          <mesh position={[0, 0, 0.02]}>
            <boxGeometry args={[1.0, 2.1, 0.04]} />
            <meshStandardMaterial color="#8b6914" roughness={0.7} metalness={0.1} />
          </mesh>
          {/* Türgriff */}
          <mesh position={[0.35, 0, 0.06]}>
            <boxGeometry args={[0.02, 0.15, 0.02]} />
            <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>
      ))}

      {/* Gesimse/Fensterbänke */}
      {Array.from({ length: Math.min(building.windowCount, 12) }).map((_, i) => {
        const row = Math.floor(i / 4)
        const col = i % 4
        const xPos = -lengthM / 2 + (lengthM / 5) * (col + 1)
        const yPos = 2.5 + row * 3.0 - 0.7
        return (
          <mesh key={`sill-${i}`} position={[xPos, yPos, w / 2 + 0.05]} castShadow>
            <boxGeometry args={[1.1, 0.06, 0.15]} />
            <meshStandardMaterial color="#e8e0d5" roughness={0.9} />
          </mesh>
        )
      })}
    </group>
  )
}

// --- BEMAßUNG ---
function DimensionLines({ model, visible }: { model: CADModel; visible: boolean }) {
  if (!visible) return null
  const { building, totalHeightM } = model
  const offset = 2.0
  const color = '#f59e0b'

  return (
    <group>
      <MeasurementLine start={[-building.lengthM / 2 - offset, 0, 0]} end={[-building.lengthM / 2 - offset, building.heightM, 0]} label={`${building.heightM.toFixed(2)} m`} color={color} />
      <MeasurementLine start={[building.lengthM / 2 + offset, 0, 0]} end={[building.lengthM / 2 + offset, totalHeightM, 0]} label={`${totalHeightM.toFixed(2)} m`} color={color} />
      <MeasurementLine start={[-building.lengthM / 2, -offset, 0]} end={[building.lengthM / 2, -offset, 0]} label={`${building.lengthM.toFixed(2)} m`} color={color} />
      {model.fields[0] && (
        <MeasurementLine start={[model.fields[0].positionX - model.fields[0].lengthM / 2, -offset * 0.7, 0]} end={[model.fields[0].positionX + model.fields[0].lengthM / 2, -offset * 0.7, 0]} label={`${model.fields[0].lengthM.toFixed(2)} m`} color={color} />
      )}
    </group>
  )
}

function MeasurementLine({ start, end, label, color = '#f59e0b' }: { start: [number, number, number]; end: [number, number, number]; label: string; color?: string }) {
  const startVec = useMemo(() => new THREE.Vector3(...start), [start])
  const endVec = useMemo(() => new THREE.Vector3(...end), [end])
  const distance = useMemo(() => startVec.distanceTo(endVec), [startVec, endVec])
  const midPoint = useMemo(() => new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5), [startVec, endVec])
  const direction = useMemo(() => new THREE.Vector3().subVectors(endVec, startVec).normalize(), [startVec, endVec])
  const quaternion = useMemo(() => { const axis = new THREE.Vector3(0, 1, 0); return new THREE.Quaternion().setFromUnitVectors(axis, direction) }, [direction])

  return (
    <group>
      <mesh position={[midPoint.x, midPoint.y, midPoint.z]} quaternion={quaternion}>
        <cylinderGeometry args={[0.02, 0.02, distance, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Pfeilspitzen */}
      <mesh position={[startVec.x, startVec.y, startVec.z]} quaternion={quaternion}>
        <coneGeometry args={[0.04, 0.1, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[endVec.x, endVec.y, endVec.z]} quaternion={quaternion} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.04, 0.1, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <Text position={[midPoint.x, midPoint.y + 0.4, midPoint.z]} fontSize={0.3} color={color} anchorX='center' anchorY='middle' fontWeight='bold'>{label}</Text>
    </group>
  )
}

// --- KAMERA-STEUERUNG ---
function CameraController({ viewMode, target }: { viewMode: string; target: [number, number, number] }) {
  const { camera } = useThree()
  useMemo(() => {
    const dist = Math.max(25, target[1] * 1.5)
    let pos: [number, number, number] = [dist, dist * 0.6, dist]
    switch (viewMode) {
      case 'front': pos = [0, target[1] * 0.5, dist]; break
      case 'back': pos = [0, target[1] * 0.5, -dist]; break
      case 'left': pos = [-dist, target[1] * 0.5, 0]; break
      case 'right': pos = [dist, target[1] * 0.5, 0]; break
      case 'top': pos = [0, dist, 0]; break
      case 'bottom': pos = [0, -dist * 0.3, 0]; break
      default: pos = [dist, dist * 0.6, dist]; break
    }
    camera.position.set(...pos)
    camera.lookAt(target[0], target[1], target[2])
  }, [viewMode, camera, target])
  return null
}

// --- HAUPT-SZENE ---
function Scene({ model, showBuilding, showScaffold, showDimensions, selectedComponent, onSelectComponent, visibleTypes, viewMode }: Props) {
  const target: [number, number, number] = [0, model.building.heightM / 2, 0]

  return (
    <group>
      <CameraController viewMode={viewMode} target={target} />

      {/* Umgebungslicht */}
      <ambientLight intensity={0.6} />

      {/* Haupt-Sonnenlicht */}
      <directionalLight
        position={[15, 20, 10]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {/* Gebäude */}
      <Building3D building={model.building} visible={showBuilding} />

      {/* Gerüst-Bauteile */}
      {showScaffold && model.components3D.map((comp) => (
        <ComponentMesh
          key={comp.id}
          comp={comp}
          isSelected={selectedComponent === comp.id}
          onClick={() => onSelectComponent(comp.id === selectedComponent ? null : comp.id)}
          visible={visibleTypes[comp.type] !== false}
        />
      ))}

      {/* Bemaßung */}
      <DimensionLines model={model} visible={showDimensions} />

      {/* Beton-Boden */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.95} metalness={0.05} />
      </mesh>
    </group>
  )
}

// --- EXPORT ---
export default function Scaffold3D({ model, showBuilding, showScaffold, showDimensions, selectedComponent, onSelectComponent, visibleTypes, viewMode }: Props) {
  const cameraDistance = Math.max(model.building.lengthM, model.building.heightM) * 2 + 8

  return (
    <div className='w-full h-full rounded-xl overflow-hidden border border-black/10 bg-[#f0f4f8] relative'>
      <Canvas shadows camera={{ position: [cameraDistance, cameraDistance * 0.6, cameraDistance], fov: 45 }}>
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
          enablePan
          enableZoom
          enableRotate
          minDistance={5}
          maxDistance={150}
          target={[0, model.building.heightM / 2, 0]}
        />
      </Canvas>

      {/* Hilfe-Overlay */}
      <div className='absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-xl px-3 py-2 text-xs text-[#424245] border border-black/10 pointer-events-none shadow-sm'>
        <p>🖱️ Links: Drehen | Rechts: Verschieben | Scroll: Zoomen</p>
      </div>

      {/* Bauteil-Info-Overlay */}
      {selectedComponent && (
        <div className='absolute top-4 right-4 bg-white/95 backdrop-blur rounded-xl px-4 py-3 text-sm border border-black/10 shadow-lg'>
          <p className='font-semibold text-[#1d1d1f]'>{model.components3D.find((c) => c.id === selectedComponent)?.name}</p>
          <p className='text-xs text-[#86868b] mt-1'>Art.-Nr.: {model.components3D.find((c) => c.id === selectedComponent)?.articleNumber}</p>
          <p className='text-xs text-[#86868b]'>Typ: {model.components3D.find((c) => c.id === selectedComponent)?.type}</p>
        </div>
      )}
    </div>
  )
}
