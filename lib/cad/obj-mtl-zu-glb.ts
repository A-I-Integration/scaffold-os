// ============================================================
// SCAFFOLD OS – OBJ (+ MTL + Texturbilder) für die Anzeige des echten Gebäudes
//
// Smartphone- und Drohnen-Apps liefern Scans meist als OBJ mit MTL und Fotos (jpg/png). Die Anzeige liest
// bereits GLB mit Texturen. Darum wird der Satz hier im Browser einmal zu GLB umgewandelt (Texturen
// eingebettet) und dann wie eine GLB-Datei weiterbehandelt – inklusive Speichern im Browser.
// Die Datei verändert weder Maße noch Gerüst, sie ist ein Bild des Bestands. Alles läuft im Browser.
// ============================================================
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { aussehenAusDatei, AUSSEHEN_MAX_BYTES, type AussehenErgebnis } from '@/lib/cad/modell-aussehen'

export interface DateiSatz { obj: File | null; mtl: File | null; bilder: File[]; andere: File[] }

const BILD = /\.(jpe?g|png|webp)$/i

/** Gewählte Dateien sortieren: eine OBJ, höchstens eine MTL, Bilder; alles andere ist „andere“ (z. B. GLB, PLY). */
export function sortiereDateien(dateien: { name: string }[]): { obj: number | null; mtl: number | null; bilder: number[]; andere: number[]; mehrereObj: boolean } {
  let obj: number | null = null, mtl: number | null = null
  let mehrereObj = false
  const bilder: number[] = [], andere: number[] = []
  dateien.forEach((d, i) => {
    const n = d.name.toLowerCase()
    if (n.endsWith('.obj')) { if (obj === null) obj = i; else mehrereObj = true }
    else if (n.endsWith('.mtl')) { if (mtl === null) mtl = i }
    else if (BILD.test(n)) bilder.push(i)
    else andere.push(i)
  })
  return { obj, mtl, bilder, andere, mehrereObj }
}

/** Dateiname aus einem Pfad der MTL (Windows- oder Unix-Pfad, evtl. mit Optionen davor) – klein geschrieben. */
export function texturDateiname(pfad: string): string {
  const ohneQuery = pfad.split('?')[0].replace(/\\/g, '/')
  return decodeURIComponent(ohneQuery.slice(ohneQuery.lastIndexOf('/') + 1)).toLowerCase()
}

function warteBis(bedingung: () => boolean, maxMs: number): Promise<void> {
  return new Promise((ok) => {
    const t0 = Date.now()
    const tick = () => { if (bedingung() || Date.now() - t0 > maxMs) ok(); else setTimeout(tick, 50) }
    tick()
  })
}

/**
 * Gewählte Dateien für die Anzeige vorbereiten:
 *  • GLB oder PLY allein → wie bisher
 *  • OBJ (mit MTL und Bildern) → zu GLB umgewandelt
 */
export async function aussehenAusDateien(dateien: File[]): Promise<AussehenErgebnis> {
  const s = sortiereDateien(dateien)
  if (s.obj === null) {
    const f = dateien[s.andere[0] ?? 0]
    if (!f) return { ok: false, meldung: 'Bitte eine GLB-, PLY- oder OBJ-Datei wählen (OBJ am besten zusammen mit der MTL-Datei und den Bildern).' }
    return aussehenAusDatei(await f.arrayBuffer(), f.name)
  }
  if (s.mehrereObj) return { ok: false, meldung: 'Es wurden mehrere OBJ-Dateien gewählt. Bitte nur eine OBJ-Datei mit ihrer MTL-Datei und den Bildern wählen.' }
  const objDatei = dateien[s.obj]
  const gesamt = dateien.reduce((a, d) => a + d.size, 0)
  if (gesamt > AUSSEHEN_MAX_BYTES) return { ok: false, meldung: 'Die Dateien sind zusammen zu groß (max. 120 MB). Bitte das Modell oder die Bilder verkleinern.' }

  const urls: string[] = []
  try {
    const bildUrl = new Map<string, string>()
    for (const i of s.bilder) {
      const u = URL.createObjectURL(dateien[i]); urls.push(u)
      bildUrl.set(dateien[i].name.toLowerCase(), u)
    }
    let offen = 0
    const manager = new THREE.LoadingManager()
    manager.setURLModifier((url) => {
      const n = texturDateiname(url)
      const treffer = bildUrl.get(n)
      return treffer ?? url
    })
    manager.onStart = () => { offen++ }
    let fertig = 0
    manager.onLoad = () => { fertig++ }

    const objText = await objDatei.text()
    const objLader = new OBJLoader(manager)
    let hinweis = ''
    if (s.mtl !== null) {
      const mtlText = await dateien[s.mtl].text()
      const materialien = new MTLLoader(manager).parse(mtlText, '')
      materialien.preload()
      objLader.setMaterials(materialien)
      const fehlend = [...mtlText.matchAll(/^\s*map_(?:Kd|Ka)\s+(.+)$/gim)].map((m) => texturDateiname(m[1].trim().split(/\s+/).pop() ?? '')).filter((n) => n && !bildUrl.has(n))
      if (fehlend.length) hinweis = `Fehlende Bilder zur MTL-Datei: ${[...new Set(fehlend)].slice(0, 3).join(', ')}${new Set(fehlend).size > 3 ? ' …' : ''}. Diese Flächen erscheinen ohne Foto.`
    } else {
      hinweis = 'Ohne MTL-Datei hat das Modell keine Farben und Fotos. Bitte die MTL-Datei und die Bilder mit auswählen.'
    }
    const objekt = objLader.parse(objText)
    let hatFlaeche = false
    objekt.traverse((o) => { if ((o as THREE.Mesh).isMesh) hatFlaeche = true })
    if (!hatFlaeche) return { ok: false, meldung: 'In der OBJ-Datei wurden keine Flächen gefunden (nur Punkte oder Linien).' }
    // Ohne Material (OBJ ohne MTL) neutral grau
    objekt.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && !m.material) m.material = new THREE.MeshStandardMaterial({ color: 0xcfcfcf })
    })
    // Bilder fertig laden lassen, bevor exportiert wird
    await warteBis(() => offen === 0 || fertig > 0, 20000)
    await new Promise((r) => setTimeout(r, 300))

    const glb = await new GLTFExporter().parseAsync(objekt, { binary: true, onlyVisible: false, maxTextureSize: 4096 })
    if (!(glb instanceof ArrayBuffer)) return { ok: false, meldung: 'Die OBJ-Datei konnte nicht umgewandelt werden.' }
    const name = objDatei.name.replace(/\.obj$/i, '') + '.glb'
    const r = aussehenAusDatei(glb, name)
    if (r.ok && hinweis) return { ...r, hinweis }
    return r
  } finally {
    urls.forEach((u) => URL.revokeObjectURL(u))
  }
}
