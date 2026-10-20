'use client'

// ============================================================
// SCAFFOLD OS – Umgebung der 3D-Ansicht (Darstellung)
//
// Rasen, Zufahrt, Gehweg mit Fugen, Straße mit Markierung, Hecke, Laternen, Bäume (Laub und Nadel) und ein
// Nachbarhaus mit Fenstern, Tür, Dachüberstand und Schornstein. Die Platzierung kommt aus
// lib/cad/umgebung-layout.ts (getestet). Rein optisch: nicht Teil des Modells, keine Wirkung auf Stückliste
// oder Statik; alles ist per Raycast-Aus anklickbar-durchlässig.
// Instanziert (wenige Draw-Calls), Schattenkarte wird beim Ändern einmal neu berechnet (ShadowFreeze in der Szene).
// ============================================================

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { CADModel } from '@/lib/calculations/cad-engine'
import { berechneUmgebung, mulberry32, type NachbarHaus, type Rechteck } from '@/lib/cad/umgebung-layout'

interface Inst { m: THREE.Matrix4; c?: THREE.Color }

const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
function mat4(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0): THREE.Matrix4 {
  _q.setFromEuler(_e.set(0, ry, 0))
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz))
}
const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l)

// Gemeinsame Geometrien/Materialien (einmal je Seite, nicht je Neuberechnung)
let GEO: { kugel: THREE.IcosahedronGeometry; stamm: THREE.CylinderGeometry; kegel: THREE.ConeGeometry; box: THREE.BoxGeometry; ebene: THREE.PlaneGeometry; giebel: THREE.ShapeGeometry } | null = null
let MAT: { stamm: THREE.MeshStandardMaterial; laub: THREE.MeshStandardMaterial; busch: THREE.MeshStandardMaterial; glas: THREE.MeshStandardMaterial; rahmen: THREE.MeshStandardMaterial; sims: THREE.MeshStandardMaterial; fuge: THREE.MeshStandardMaterial; markierung: THREE.MeshStandardMaterial; mast: THREE.MeshStandardMaterial; leuchte: THREE.MeshStandardMaterial } | null = null
function ressourcen() {
  if (!GEO) {
    const sh = new THREE.Shape()
    sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0, 1); sh.closePath()
    GEO = {
      kugel: new THREE.IcosahedronGeometry(1, 2),
      stamm: new THREE.CylinderGeometry(0.62, 1, 1, 8),
      kegel: new THREE.ConeGeometry(1, 1, 10),
      box: new THREE.BoxGeometry(1, 1, 1),
      ebene: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      giebel: new THREE.ShapeGeometry(sh),
    }
  }
  if (!MAT) {
    MAT = {
      stamm: new THREE.MeshStandardMaterial({ color: '#5e4630', roughness: 1 }),
      laub: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.93 }),
      busch: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.97 }),
      glas: new THREE.MeshStandardMaterial({ color: '#46606f', roughness: 0.12, metalness: 0.55 }),
      rahmen: new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.6 }),
      sims: new THREE.MeshStandardMaterial({ color: '#b8b3a8', roughness: 0.8 }),
      fuge: new THREE.MeshStandardMaterial({ color: '#9d988e', roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      markierung: new THREE.MeshStandardMaterial({ color: '#ece9e1', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      mast: new THREE.MeshStandardMaterial({ color: '#5b6068', roughness: 0.6, metalness: 0.4 }),
      leuchte: new THREE.MeshStandardMaterial({ color: '#f4ecd0', roughness: 0.4, emissive: '#e9dca8', emissiveIntensity: 0.25 }),
    }
  }
  return { geo: GEO, mat: MAT }
}

/** Die Schattenkarte der Szene ist eingefroren: nach Änderungen einmal neu berechnen lassen. */
function schattenNeu(gl: THREE.WebGLRenderer) {
  gl.shadowMap.needsUpdate = true
}

/** Eine InstancedMesh mit Matrix (und optional Farbe) je Eintrag. */
function Instanziert({ geo, mat, items, schatten = true }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: Inst[]; schatten?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const { invalidate, gl } = useThree()
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m)
      if (it.c) mesh.setColorAt(i, it.c)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    schattenNeu(gl)
    invalidate()
  }, [items, gl, invalidate])
  if (items.length === 0) return null
  // key = Anzahl: die Größe einer InstancedMesh ist fest, bei anderer Anzahl neu aufbauen
  return <instancedMesh key={items.length} ref={ref} args={[geo, mat, items.length]} castShadow={schatten} receiveShadow raycast={() => null} frustumCulled={false} />
}

// ── Bäume
function baumInstanzen(baeume: ReturnType<typeof berechneUmgebung>['baeume']) {
  const staemme: Inst[] = []
  const laub: Inst[] = []
  const nadel: Inst[] = []
  for (const b of baeume) {
    const r = mulberry32(b.seed)
    const R = b.kronenRadiusM
    if (b.art === 'laub') {
      const stammH = Math.max(1.8, b.hoeheM - 1.75 * R)
      staemme.push({ m: mat4(b.x, stammH / 2, b.z, b.stammRadiusM, stammH, b.stammRadiusM) })
      const cy = stammH + R * 0.75
      // fünf überlappende Kronenteile, oben heller, unten dunkler
      const teile: [number, number, number, number][] = [[0, 0, 0, 1], [0.6, -0.1, 0.25, 0.72], [-0.55, -0.18, -0.3, 0.7], [0.1, 0.5, -0.15, 0.68], [-0.2, -0.05, 0.6, 0.62]]
      for (const [ox, oy, oz, k] of teile) {
        const jx = (r() - 0.5) * 0.2, jz = (r() - 0.5) * 0.2
        const rad = R * k * (0.95 + r() * 0.12)
        laub.push({
          m: mat4(b.x + (ox + jx) * R, cy + oy * R, b.z + (oz + jz) * R, rad * 1.05, rad * 0.88, rad * 1.05, r() * Math.PI),
          c: hsl(b.farbe + (r() - 0.5) * 0.03, 0.4 + r() * 0.12, Math.min(0.5, Math.max(0.16, b.hell + oy * 0.12 + (r() - 0.5) * 0.05))),
        })
      }
    } else {
      const stammH = b.hoeheM * 0.16
      staemme.push({ m: mat4(b.x, stammH / 2, b.z, b.stammRadiusM * 0.9, stammH, b.stammRadiusM * 0.9) })
      // fünf Stufen, nach oben schmaler
      for (let i = 0; i < 5; i++) {
        const h = b.hoeheM * 0.27
        const rad = R * (1.05 - i * 0.2)
        const base = stammH * 0.55 + i * b.hoeheM * 0.17
        nadel.push({ m: mat4(b.x, base + h / 2, b.z, rad, h, rad, r() * Math.PI), c: hsl(b.farbe, 0.45, Math.max(0.12, b.hell - i * 0.012 + (r() - 0.5) * 0.02)) })
      }
    }
  }
  return { staemme, laub, nadel }
}

// ── Flächen: Rechteck als flache Ebene
function Flaeche({ r, y, farbe, offset = -1, rau = 0.95 }: { r: Rechteck; y: number; farbe: string; offset?: number; rau?: number }) {
  return (
    <mesh position={[(r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}>
      <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
      <meshStandardMaterial color={farbe} roughness={rau} polygonOffset polygonOffsetFactor={offset} polygonOffsetUnits={offset} />
    </mesh>
  )
}

/** Fugen eines Plattenbelags: dünne Linien quer und längs im Abstand `schritt`. */
function fugen(r: Rechteck, schritt: number, y: number): Inst[] {
  const out: Inst[] = []
  const breite = 0.035
  for (let x = r.x0 + schritt; x < r.x1 - 1e-6; x += schritt) out.push({ m: mat4(x, y, (r.z0 + r.z1) / 2, breite, 1, r.z1 - r.z0) })
  for (let z = r.z0 + schritt; z < r.z1 - 1e-6; z += schritt) out.push({ m: mat4((r.x0 + r.x1) / 2, y, z, r.x1 - r.x0, 1, breite) })
  return out
}

// ── Nachbarhaus
function fensterInstanzen(h: NachbarHaus) {
  const hl = h.x1 - h.x0, hd = h.z1 - h.z0
  const rahmen: Inst[] = [], glas: Inst[] = [], sims: Inst[] = []
  const WB = 1.15, WH = 1.4
  const sockel = 0.5
  const fenster = (x: number, y: number, z: number, ry: number) => {
    // Lokale Tiefenachse zeigt nach der Drehung nach außen
    const c = Math.cos(ry), s = Math.sin(ry)
    const aussen = (d: number) => [x + s * d, z + c * d] as const
    const [rx, rz] = aussen(0.03)
    rahmen.push({ m: mat4(rx, y, rz, WB, WH, 0.14, ry) })
    const [gx, gz] = aussen(0.1)
    glas.push({ m: mat4(gx, y, gz, WB - 0.2, WH - 0.2, 0.04, ry) })
    const [sx, sz] = aussen(0.12)
    sims.push({ m: mat4(sx, y - WH / 2 - 0.04, sz, WB + 0.25, 0.07, 0.22, ry) })
  }
  const achsenVorn = Math.max(2, Math.floor((hl - 1.5) / 2.6))
  const achsenSeite = Math.max(1, Math.floor((hd - 1.5) / 2.9))
  for (let f = 0; f < h.geschosse; f++) {
    const y = sockel + f * 2.8 + 1.6
    for (let i = 0; i < achsenVorn; i++) {
      const lokalX = -hl / 2 + (i + 0.5) * (hl / achsenVorn)
      if (!(f === 0 && i === h.tuerIndex)) fenster(lokalX, y, hd / 2, 0)   // Straßenseite, im Erdgeschoss mit Tür
      fenster(lokalX, y, -hd / 2, Math.PI)
    }
    for (let i = 0; i < achsenSeite; i++) {
      const lokalZ = -hd / 2 + (i + 0.5) * (hd / achsenSeite)
      fenster(hl / 2, y, lokalZ, Math.PI / 2)
      fenster(-hl / 2, y, lokalZ, -Math.PI / 2)
    }
  }
  return { rahmen, glas, sims, tuerX: -hl / 2 + (h.tuerIndex + 0.5) * (hl / achsenVorn) }
}

function Nachbarhaus({ haus }: { haus: NachbarHaus }) {
  const { geo, mat } = ressourcen()
  const hl = haus.x1 - haus.x0, hd = haus.z1 - haus.z0
  const cx = (haus.x0 + haus.x1) / 2, cz = (haus.z0 + haus.z1) / 2
  const H = haus.traufeM, rH = haus.dachM
  const f = useMemo(() => fensterInstanzen(haus), [haus])
  const oe = 0.55, og = 0.4                                        // Dachüberstand Traufe / Giebel
  const ang = Math.atan2(rH, hd / 2)
  const slabLen = (hd / 2 + oe) / Math.cos(ang)
  const yEave = H - oe * Math.tan(ang)
  const slabY = (yEave + H + rH) / 2 + 0.07
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, H / 2, 0]} castShadow receiveShadow raycast={() => null}>
        <boxGeometry args={[hl, H, hd]} />
        <meshStandardMaterial color={haus.fassade} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.25, 0]} receiveShadow raycast={() => null}>
        <boxGeometry args={[hl + 0.08, 0.5, hd + 0.08]} />
        <meshStandardMaterial color="#8c877d" roughness={1} />
      </mesh>
      {/* Satteldach mit Überstand, First, Dachrinne, Schornstein */}
      {[1, -1].map((sgn) => (
        <mesh key={sgn} position={[0, slabY, sgn * (hd / 2 + oe) / 2]} rotation={[sgn * ang, 0, 0]} castShadow receiveShadow raycast={() => null}>
          <boxGeometry args={[hl + 2 * og, 0.16, slabLen]} />
          <meshStandardMaterial color={haus.dach} roughness={0.85} />
        </mesh>
      ))}
      {[1, -1].map((sgn) => (
        <mesh key={`g${sgn}`} position={[0, yEave - 0.07, sgn * (hd / 2 + oe)]} raycast={() => null}>
          <boxGeometry args={[hl + 2 * og, 0.1, 0.12]} />
          <meshStandardMaterial color="#6b6f74" roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, H + rH + 0.12, 0]} castShadow raycast={() => null}>
        <boxGeometry args={[hl + 2 * og + 0.05, 0.14, 0.34]} />
        <meshStandardMaterial color={haus.dach} roughness={0.8} />
      </mesh>
      {[-1, 1].map((sgn) => (
        <mesh key={`w${sgn}`} geometry={geo.giebel} position={[sgn * (hl / 2 + 0.002), H, 0]} rotation={[0, Math.PI / 2, 0]} scale={[hd, rH, 1]} raycast={() => null}>
          <meshStandardMaterial color={haus.fassade} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[haus.schornsteinX, H + rH - 0.1, 0.5]} castShadow raycast={() => null}>
        <boxGeometry args={[0.7, 2.1, 0.7]} />
        <meshStandardMaterial color="#8b4a3c" roughness={0.95} />
      </mesh>
      <mesh position={[haus.schornsteinX, H + rH + 0.98, 0.5]} raycast={() => null}>
        <boxGeometry args={[0.86, 0.08, 0.86]} />
        <meshStandardMaterial color="#5a5c60" roughness={0.7} />
      </mesh>
      {/* Eingang: Tür, Stufe, Vordach */}
      <mesh position={[f.tuerX, 0.5 + 1.05, hd / 2 + 0.04]} raycast={() => null}>
        <boxGeometry args={[1.1, 2.1, 0.1]} />
        <meshStandardMaterial color="#4b3526" roughness={0.7} />
      </mesh>
      <mesh position={[f.tuerX, 0.5 + 1.05, hd / 2 + 0.01]} raycast={() => null}>
        <boxGeometry args={[1.3, 2.25, 0.08]} />
        <meshStandardMaterial color="#f1efe9" roughness={0.6} />
      </mesh>
      <mesh position={[f.tuerX, 0.08, hd / 2 + 0.45]} receiveShadow raycast={() => null}>
        <boxGeometry args={[1.8, 0.16, 0.8]} />
        <meshStandardMaterial color="#9a958c" roughness={0.95} />
      </mesh>
      <mesh position={[f.tuerX, 0.5 + 2.55, hd / 2 + 0.55]} castShadow raycast={() => null}>
        <boxGeometry args={[2.0, 0.1, 1.1]} />
        <meshStandardMaterial color="#62666c" roughness={0.6} />
      </mesh>
      {/* Fenster (Rahmen, Glas, Fensterbank): je ein Draw-Call */}
      <Instanziert geo={geo.box} mat={mat.rahmen} items={f.rahmen} schatten={false} />
      <Instanziert geo={geo.box} mat={mat.glas} items={f.glas} schatten={false} />
      <Instanziert geo={geo.box} mat={mat.sims} items={f.sims} schatten={false} />
    </group>
  )
}

export default function Umgebung3D({ model, visible }: { model: CADModel; visible: boolean }) {
  const { invalidate, gl } = useThree()
  const U = useMemo(() => berechneUmgebung(model), [model])
  const { geo, mat } = ressourcen()

  const { staemme, laub, nadel } = useMemo(() => baumInstanzen(U.baeume), [U])
  const hecke = useMemo<Inst[]>(() => U.hecke.map((b) => ({ m: mat4(b.x, b.radiusM * 0.78, b.z, b.radiusM * 1.1, b.radiusM * 0.85, b.radiusM * 1.1), c: hsl(b.farbe, 0.42, b.hell) })), [U])
  const fugenItems = useMemo<Inst[]>(() => [
    ...fugen(U.gehweg, 1.0, -0.0155), ...fugen(U.gegenGehweg, 1.0, -0.0155), ...fugen(U.pave, 1.25, -0.0155),
  ], [U])
  const markierung = useMemo<Inst[]>(() => {
    const mitte = (U.strasse.z0 + U.strasse.z1) / 2
    const out: Inst[] = []
    for (let x = -57; x < 57; x += 7) out.push({ m: mat4(x + 1.5, -0.0155, mitte, 3, 1, 0.14) })
    out.push({ m: mat4(0, -0.0155, U.strasse.z0 + 0.3, 120, 1, 0.12) }, { m: mat4(0, -0.0155, U.strasse.z1 - 0.3, 120, 1, 0.12) })
    return out
  }, [U])
  const masten = useMemo<Inst[]>(() => U.laternen.map((l) => ({ m: mat4(l.x, 3.1, l.z, 0.07, 6.2, 0.07) })), [U])
  const arme = useMemo<Inst[]>(() => U.laternen.map((l) => ({ m: mat4(l.x, 6.15, l.z + 0.8, 0.08, 0.08, 1.6) })), [U])
  const koepfe = useMemo<Inst[]>(() => U.laternen.map((l) => ({ m: mat4(l.x, 6.05, l.z + 1.5, 0.32, 0.12, 0.55) })), [U])

  useEffect(() => {
    schattenNeu(gl)
    invalidate()
  }, [U, visible, gl, invalidate])

  if (!visible) return null
  return (
    <group>
      {/* Rasen des Grundstücks, Zufahrt, Gehwege, Bordstein, Fahrbahn */}
      <Flaeche r={U.grundstueck} y={-0.0195} farbe="#819f6e" offset={-0.5} rau={0.98} />
      <Flaeche r={U.pave} y={-0.017} farbe="#cfcbc2" />
      <Flaeche r={U.weg} y={-0.0165} farbe="#c9c5bb" offset={-2} />
      <Flaeche r={U.gehweg} y={-0.0165} farbe="#c4bfb5" offset={-2} />
      <Flaeche r={U.gegenGehweg} y={-0.0165} farbe="#c4bfb5" offset={-2} />
      <Flaeche r={{ x0: -60, x1: 60, z0: U.gehweg.z1, z1: U.strasse.z0 }} y={-0.0155} farbe="#a8a49b" offset={-3} />
      <Flaeche r={{ x0: -60, x1: 60, z0: U.strasse.z1, z1: U.gegenGehweg.z0 }} y={-0.0155} farbe="#a8a49b" offset={-3} />
      <Flaeche r={{ x0: -60, x1: 60, z0: U.strasse.z0, z1: U.strasse.z1 }} y={-0.017} farbe="#5f646b" offset={-2} rau={0.92} />
      <Instanziert geo={geo.ebene} mat={mat.fuge} items={fugenItems} schatten={false} />
      <Instanziert geo={geo.ebene} mat={mat.markierung} items={markierung} schatten={false} />

      <Nachbarhaus haus={U.haus} />

      {/* Hecke, Bäume, Laternen */}
      <Instanziert geo={geo.kugel} mat={mat.busch} items={hecke} />
      <Instanziert geo={geo.stamm} mat={mat.stamm} items={staemme} />
      <Instanziert geo={geo.kugel} mat={mat.laub} items={laub} />
      <Instanziert geo={geo.kegel} mat={mat.laub} items={nadel} />
      <Instanziert geo={geo.stamm} mat={mat.mast} items={masten} />
      <Instanziert geo={geo.box} mat={mat.mast} items={arme} />
      <Instanziert geo={geo.box} mat={mat.leuchte} items={koepfe} schatten={false} />
    </group>
  )
}
