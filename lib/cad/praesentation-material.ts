// ============================================================
// SCAFFOLD OS – Materialien für den Präsentationsmodus der 3D-Ansicht
//
// Schematische Oberflächen (Backstein, Schiefer, Rasen), prozedural aus Canvas-Rauschen erzeugt – KEINE
// Scan- oder Foto-Daten. Backstein wird in Weltkoordinaten abgebildet (je Wandrichtung), damit die Steine
// auf jeder Wand gleich groß sind, egal wie groß der Quader ist.
// ============================================================
import * as THREE from 'three'

/** Dunkles Stahlblau der Gerüstrohre im Präsentationsmodus */
export const PRAESENTATION_ROHR = '#1e2736'
export const PRAESENTATION_HINTERGRUND = '#ffffff'

/** Größe der Backstein-Kachel in Metern (Quadrat) */
const KACHEL_M = 2

function leinwand(groesse: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = groesse
  const ctx = c.getContext('2d')
  return ctx ? [c, ctx] : null
}

/** Pseudozufall mit festem Startwert (gleiches Bild bei jedem Laden) */
function zufall(start: number): () => number {
  let s = start >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

let backsteinTex: THREE.CanvasTexture | null = null
export function getBacksteinTex(): THREE.CanvasTexture | null {
  if (backsteinTex) return backsteinTex
  const l = leinwand(512)
  if (!l) return null
  const [canvas, ctx] = l
  const rnd = zufall(7)
  ctx.fillStyle = '#b9b2a6' // Fuge
  ctx.fillRect(0, 0, 512, 512)
  // 2 m Kachel: 32 Schichten à 16 px (≈ 6,25 cm), Steine 64 px lang (≈ 25 cm)
  const hoehe = 16, laenge = 64
  for (let reihe = 0; reihe < 32; reihe++) {
    const versatz = reihe % 2 ? laenge / 2 : 0
    for (let x = -versatz; x < 512; x += laenge) {
      const r = 150 + rnd() * 40, g = 60 + rnd() * 25, b = 45 + rnd() * 20
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`
      ctx.fillRect(x + 1, reihe * hoehe + 1, laenge - 2, hoehe - 2)
    }
  }
  backsteinTex = new THREE.CanvasTexture(canvas)
  backsteinTex.wrapS = backsteinTex.wrapT = THREE.RepeatWrapping
  backsteinTex.colorSpace = THREE.SRGBColorSpace
  backsteinTex.anisotropy = 4
  return backsteinTex
}

let grasTex: THREE.CanvasTexture | null = null
export function getGrasTex(): THREE.CanvasTexture | null {
  if (grasTex) return grasTex
  const l = leinwand(256)
  if (!l) return null
  const [canvas, ctx] = l
  const rnd = zufall(11)
  ctx.fillStyle = '#7ea05c'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 6000; i++) {
    const g = 120 + rnd() * 60
    ctx.fillStyle = `rgba(${(60 + rnd() * 40) | 0},${g | 0},${(40 + rnd() * 30) | 0},0.45)`
    ctx.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 3, 2 + rnd() * 3)
  }
  grasTex = new THREE.CanvasTexture(canvas)
  grasTex.wrapS = grasTex.wrapT = THREE.RepeatWrapping
  grasTex.colorSpace = THREE.SRGBColorSpace
  return grasTex
}

let schieferTex: THREE.CanvasTexture | null = null
export function getSchieferTex(): THREE.CanvasTexture | null {
  if (schieferTex) return schieferTex
  const l = leinwand(256)
  if (!l) return null
  const [canvas, ctx] = l
  const rnd = zufall(23)
  ctx.fillStyle = '#4a4f57'
  ctx.fillRect(0, 0, 256, 256)
  // Schieferplatten in versetzten Reihen
  for (let reihe = 0; reihe < 16; reihe++) {
    const versatz = reihe % 2 ? 8 : 0
    for (let x = -versatz; x < 256; x += 16) {
      const v = 62 + rnd() * 24
      ctx.fillStyle = `rgb(${v | 0},${(v + 4) | 0},${(v + 10) | 0})`
      ctx.fillRect(x + 0.5, reihe * 16 + 0.5, 15, 15)
    }
  }
  schieferTex = new THREE.CanvasTexture(canvas)
  schieferTex.wrapS = schieferTex.wrapT = THREE.RepeatWrapping
  schieferTex.colorSpace = THREE.SRGBColorSpace
  schieferTex.repeat.set(3, 3)
  return schieferTex
}

/** Backstein-Material: Weltkoordinaten, je Wandrichtung (x/z) und Dach/Decke (y) abgebildet. */
export function baueBacksteinMaterial(doubleSide = false): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide })
  const tex = getBacksteinTex()
  if (!tex) { m.color.set('#a8553f'); return m }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.backsteinKarte = { value: tex }
    shader.uniforms.kachelM = { value: KACHEL_M }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBsPos;\nvarying vec3 vBsNor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBsPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvBsNor = normalize(mat3(modelMatrix) * normal);')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D backsteinKarte;\nuniform float kachelM;\nvarying vec3 vBsPos;\nvarying vec3 vBsNor;')
      .replace('#include <map_fragment>', `
        vec3 bsN = abs(normalize(vBsNor));
        vec2 bsUV = bsN.x > bsN.z ? vec2(vBsPos.z, vBsPos.y) : vec2(vBsPos.x, vBsPos.y);
        if (bsN.y > max(bsN.x, bsN.z)) bsUV = vec2(vBsPos.x, vBsPos.z);
        diffuseColor *= texture2D(backsteinKarte, bsUV / kachelM);
      `)
  }
  m.customProgramCacheKey = () => 'praesentation-backstein'
  return m
}
