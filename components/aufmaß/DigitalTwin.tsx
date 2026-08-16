// ============================================================
// components/aufmaß/DigitalTwin.tsx
// SCAFFOLD OS – Digitaler Zwilling (React Three Fiber)
// ============================================================

'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Text } from '@react-three/drei';
import * as THREE from 'three';

interface Props {
  lengthM: number;
  heightM: number;
  widthM?: number;
  fieldLengthM?: number;
  showMeasurements?: boolean;
}

// --- EINZELNER RAHMEN ---
function ScaffoldFrame({
  position,
  height,
  fieldLength,
  color = '#3b82f6',
}: {
  position: [number, number, number];
  height: number;
  fieldLength: number;
  color?: string;
}) {
  const frameWidth = 0.073;
  const frameDepth = 0.04;

  return (
    <group position={position}>
      {/* Linker Stiel */}
      <mesh position={[-fieldLength / 2 + 0.02, height / 2, 0]}>
        <boxGeometry args={[frameWidth, height, frameDepth]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Rechter Stiel */}
      <mesh position={[fieldLength / 2 - 0.02, height / 2, 0]}>
        <boxGeometry args={[frameWidth, height, frameDepth]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Querriegel unten */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[fieldLength, 0.04, frameDepth]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Querriegel oben */}
      <mesh position={[0, height - 0.05, 0]}>
        <boxGeometry args={[fieldLength, 0.04, frameDepth]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

// --- ARBEITSBÜHNE ---
function ScaffoldDeck({
  position,
  length,
}: {
  position: [number, number, number];
  length: number;
}) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[length - 0.05, 0.73]} />
      <meshStandardMaterial
        color="#f59e0b"
        metalness={0.3}
        roughness={0.7}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// --- GELÄNDER ---
function ScaffoldRailing({
  position,
  length,
  height = 1.0,
}: {
  position: [number, number, number];
  length: number;
  height?: number;
}) {
  return (
    <group position={position}>
      <mesh position={[0, height, 0]}>
        <boxGeometry args={[length, 0.04, 0.04]} />
        <meshStandardMaterial color="#ef4444" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[-length / 2 + 0.02, height / 2, 0]}>
        <boxGeometry args={[0.04, height, 0.04]} />
        <meshStandardMaterial color="#ef4444" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[length / 2 - 0.02, height / 2, 0]}>
        <boxGeometry args={[0.04, height, 0.04]} />
        <meshStandardMaterial color="#ef4444" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

// --- MESS-LINIE (bulletproof mit Zylinder statt <Line>) ---
function MeasurementLine({
  start,
  end,
  label,
  color = '#f59e0b',
}: {
  start: [number, number, number];
  end: [number, number, number];
  label: string;
  color?: string;
}) {
  const startVec = new THREE.Vector3(...start);
  const endVec = new THREE.Vector3(...end);
  const distance = startVec.distanceTo(endVec);
  const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
  
  // Rotation berechnen, damit Zylinder von start nach end zeigt
  const direction = new THREE.Vector3().subVectors(endVec, startVec).normalize();
  const axis = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, direction);

  return (
    <group>
      {/* Linie als dünner Zylinder */}
      <mesh position={[midPoint.x, midPoint.y, midPoint.z]} quaternion={quaternion}>
        <cylinderGeometry args={[0.015, 0.015, distance, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      
      {/* Text */}
      <Text 
        position={[midPoint.x, midPoint.y + 0.3, midPoint.z]} 
        fontSize={0.25} 
        color={color} 
        anchorX="center" 
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}

// --- KOMPLETTES GERÜST ---
function ScaffoldModel({
  lengthM,
  heightM,
  fieldLengthM,
  showMeasurements,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current && state.clock.elapsedTime < 3) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
  });

  const frameHeight = 2.0;
  const levels = Math.max(1, Math.ceil(heightM / frameHeight));
  const fields = Math.max(1, Math.ceil(lengthM / fieldLengthM!));
  const actualLength = fields * fieldLengthM!;
  const actualHeight = levels * frameHeight;

  const frames = useMemo(() => {
    const result: { x: number; y: number }[] = [];
    for (let l = 0; l < levels; l++) {
      for (let f = 0; f < fields; f++) {
        result.push({
          x: f * fieldLengthM! - actualLength / 2 + fieldLengthM! / 2,
          y: l * frameHeight,
        });
      }
    }
    return result;
  }, [levels, fields, fieldLengthM, actualLength]);

  const decks = useMemo(() => {
    const result: { x: number; y: number }[] = [];
    for (let l = 0; l < levels; l++) {
      for (let f = 0; f < fields; f++) {
        result.push({
          x: f * fieldLengthM! - actualLength / 2 + fieldLengthM! / 2,
          y: l * frameHeight + frameHeight,
        });
      }
    }
    return result;
  }, [levels, fields, fieldLengthM, actualLength]);

  return (
    <group ref={groupRef}>
      {frames.map((frame, i) => (
        <ScaffoldFrame
          key={`frame-${i}`}
          position={[frame.x, frame.y, 0]}
          height={frameHeight}
          fieldLength={fieldLengthM!}
        />
      ))}

      {decks.map((deck, i) => (
        <ScaffoldDeck
          key={`deck-${i}`}
          position={[deck.x, deck.y, 0]}
          length={fieldLengthM!}
        />
      ))}

      {Array.from({ length: fields }).map((_, f) => (
        <ScaffoldRailing
          key={`rail-${f}`}
          position={[
            f * fieldLengthM! - actualLength / 2 + fieldLengthM! / 2,
            actualHeight,
            0.4,
          ]}
          length={fieldLengthM!}
        />
      ))}

      {showMeasurements && (
        <>
          <MeasurementLine
            start={[-actualLength / 2 - 0.8, 0, 0]}
            end={[-actualLength / 2 - 0.8, actualHeight, 0]}
            label={`${heightM} m`}
          />
          <MeasurementLine
            start={[-actualLength / 2, -0.8, 0]}
            end={[actualLength / 2, -0.8, 0]}
            label={`${lengthM} m`}
          />
        </>
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[actualLength + 4, 4]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
    </group>
  );
}

// --- HAUPTKOMPONENTE ---
export default function DigitalTwin({
  lengthM,
  heightM,
  fieldLengthM = 2.07,
  showMeasurements = true,
}: Props) {
  const cameraDistance = Math.max(lengthM, heightM) + 5;

  return (
    <div className="w-full h-[500px] rounded-xl overflow-hidden border border-black/10 bg-[#fbfbfd] relative">
      <Canvas
        camera={{ position: [cameraDistance, heightM / 2 + 2, cameraDistance], fov: 50 }}
        shadows
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
        <pointLight position={[-10, 10, -10]} intensity={0.3} color="#3b82f6" />

        <ScaffoldModel
          lengthM={lengthM}
          heightM={heightM}
          fieldLengthM={fieldLengthM}
          showMeasurements={showMeasurements}
        />

        <Grid
          position={[0, -0.02, 0]}
          args={[30, 30]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#334155"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#475569"
          fadeDistance={25}
          fadeStrength={1}
          infiniteGrid
        />

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={3}
          maxDistance={50}
          target={[0, heightM / 2, 0]}
        />
      </Canvas>

      <div className="absolute bottom-4 left-4 bg-white/80 backdrop-blur rounded-xl px-3 py-2 text-xs text-[#424245] border border-black/10 pointer-events-none">
        <p>🖱️ Links: Drehen | Rechts: Verschieben | Scroll: Zoomen</p>
      </div>
    </div>
  );
}