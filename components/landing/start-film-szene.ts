// ============================================================
// SCAFFOLD OS – Startseite: 3D-Szene für die Wechsel-Abschnitte (Scroll-Animation)
//
// Eine einzige WebGL-Szene bedient alle sieben Abschnitte: Jeder Abschnitt hat ein eigenes 2D-Zeichenfeld (Slot). Je Bild
// wird die Szene für jeden sichtbaren Abschnitt mit dessen Scrollfortschritt (0–1) gezeichnet und in das Zeichenfeld kopiert.
// So gibt es nur einen WebGL-Kontext (wichtig für Handys), und das Bild scrollt ohne Versatz mit der Seite.
// Alle Zahlen in den Karten sind Demo-Daten (im Text der Karten so gekennzeichnet).
//
// Läuft nur im Browser und wird erst geladen, wenn die Abschnitte im Bild sind (dynamischer Import in StartFilm.tsx).
// Gezeichnet wird nur, solange mindestens ein Abschnitt im Bild ist.
// ============================================================
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface Szene { dispose: () => void; resize: () => void }
/** Die eine Bühne: das Zeichenfeld (steht beim Scrollen fest im Bild), sein Behälter (für die Maßketten), der Behälter aller Textabschnitte und die Abschnitte selbst */
export interface Buehne { canvas: HTMLCanvasElement; behaelter: HTMLElement; wurzel: HTMLElement; abschnitte: HTMLElement[] }

const W = 14.2, D = 8, HE = 7.2, HR = 2.6, OFF = 0.9, LEV = 4, LH = 2
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const smooth = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

type Teil = { t: 'post' | 'tube' | 'deck' | 'diag'; L: number; pos: [number, number, number]; rot: number; tilt?: number; sc: [number, number, number]; d: number; k: number; j: number }

const WP = [
  { p: [26, 10, 27], t: [0, 4, 0] },
  { p: [-20, 9, 25], t: [0, 4.5, 0] },
  { p: [15, 7, 21], t: [0, 4.5, 0] },
  { p: [-13, 11, 23], t: [0, 4.5, 0] },
  { p: [22, 12, 19], t: [0, 4.5, 0] },
  { p: [74, 15, 30], t: [56, 3, 0] },
  { p: [19, 2.8, 15], t: [6, 2.6, 0] },
  { p: [34, 26, 34], t: [0, 3.5, 0] },
]

export function starteSzene(buehne: Buehne, reduce: boolean, kopfHoehe: () => number): Szene | null {
  let renderer: THREE.WebGLRenderer
  try { renderer = new THREE.WebGLRenderer({ canvas: buehne.canvas, antialias: true, powerPreference: 'high-performance' }) } catch { return null }
  // Physikalische Farben und Tone-Mapping sorgen für glaubwürdige Materialien statt flacher CAD-Flächen.
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.localClippingEnabled = true
  const $ = (id: string) => document.getElementById(id) as HTMLElement

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4f5f8)
  scene.fog = new THREE.Fog(0xf4f5f8, 28, 105)
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400)
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // Umgebungsreflexionen (weiches Studiolicht) für Glas, Metall und Putz
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
  scene.environment = envRT.texture; scene.environmentIntensity = 0.48

  // Prozedurale, reproduzierbare Oberflächen: keine externen Downloads, keine zufällig wechselnden Bilder.
  const zufall = (() => { let z = 7; return () => { z = (z * 16807) % 2147483647; return z / 2147483647 } })()
  const anisotropie = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const leinwand = (w: number, h: number, malen: (c: CanvasRenderingContext2D) => void, farbe = true) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const c = cv.getContext('2d'); if (c) malen(c)
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = anisotropie; t.colorSpace = farbe ? THREE.SRGBColorSpace : THREE.NoColorSpace
    return t
  }
  const rauschen = (c: CanvasRenderingContext2D, w: number, h: number, n: number, a: number) => {
    for (let i = 0; i < n; i++) { const g = Math.round(zufall() * 255); c.fillStyle = `rgba(${g},${g},${g},${a})`; c.fillRect(zufall() * w, zufall() * h, 1 + zufall() * 2, 1 + zufall() * 2) }
  }
  const putzBump = leinwand(512, 512, (c) => { c.fillStyle = '#808080'; c.fillRect(0, 0, 512, 512); rauschen(c, 512, 512, 11000, 0.34) }, false)
  const putzMap = leinwand(512, 512, (c) => { c.fillStyle = '#e7e2d8'; c.fillRect(0, 0, 512, 512); rauschen(c, 512, 512, 6500, 0.026) })
  const ziegelMap = leinwand(512, 512, (c) => {
    c.fillStyle = '#67382c'; c.fillRect(0, 0, 512, 512)
    for (let r = 0; r < 8; r++) for (let q = -1; q < 9; q++) {
      const x = q * 64 + (r % 2 ? 32 : 0), y = r * 64, v = Math.round(139 + zufall() * 35)
      const g = c.createLinearGradient(0, y, 0, y + 64)
      g.addColorStop(0, `rgb(${v + 30},${Math.round(v * 0.50)},${Math.round(v * 0.35)})`)
      g.addColorStop(0.82, `rgb(${v + 12},${Math.round(v * 0.40)},${Math.round(v * 0.28)})`)
      g.addColorStop(1, '#573128')
      c.fillStyle = g; c.fillRect(x + 1, y + 1, 62, 62)
      c.fillStyle = 'rgba(255,220,190,.12)'; c.fillRect(x + 3, y + 3, 57, 2)
    }
  })
  const ziegelBump = leinwand(512, 512, (c) => {
    c.fillStyle = '#353535'; c.fillRect(0, 0, 512, 512)
    for (let r = 0; r < 8; r++) for (let q = -1; q < 9; q++) {
      const x = q * 64 + (r % 2 ? 32 : 0), y = r * 64, g = c.createLinearGradient(0, y, 0, y + 64)
      g.addColorStop(0, '#d8d8d8'); g.addColorStop(0.72, '#a8a8a8'); g.addColorStop(1, '#424242')
      c.fillStyle = g; c.fillRect(x + 1, y + 1, 62, 62)
    }
  }, false)
  const bodenMap = leinwand(512, 512, (c) => { c.fillStyle = '#c4cad4'; c.fillRect(0, 0, 512, 512); rauschen(c, 512, 512, 7000, 0.05) })
  const bodenBump = leinwand(512, 512, (c) => { c.fillStyle = '#808080'; c.fillRect(0, 0, 512, 512); rauschen(c, 512, 512, 9000, 0.12) }, false)
  bodenMap.repeat.set(80, 80); bodenBump.repeat.set(80, 80)
  putzMap.repeat.set(5, 3); putzBump.repeat.set(5, 3)
  ziegelMap.repeat.set(2.4, 1.3); ziegelBump.repeat.set(2.4, 1.3)

  scene.add(new THREE.HemisphereLight(0xf5f8ff, 0x9b9387, 1.15))
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.1); sun.position.set(30, 40, 20); sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 })
  scene.add(sun); scene.add(sun.target)
  const rim = new THREE.DirectionalLight(0xdbe8ff, 0.65); rim.position.set(-30, 15, -25); scene.add(rim)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: bodenMap, bumpMap: bodenBump, bumpScale: 0.018, roughness: 0.96 }))
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)

  // Gebäude: echte Dachhaut statt dreieckigem Vollblock, Laibungen, Fensterrahmen, Sockel,
  // Eingang, Dachrinnen und Nebengebäude-Details. Alle Teile reagieren auf die Scan-Schnittebene.
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
  const house = new THREE.Group()
  const archMat = <T extends THREE.Material>(m: T): T => { m.clippingPlanes = [plane]; return m }
  const putz = archMat(new THREE.MeshStandardMaterial({ map: putzMap, bumpMap: putzBump, bumpScale: 0.022, roughness: 0.91 }))
  const materialen = {
    putz,
    dach: archMat(new THREE.MeshStandardMaterial({ map: ziegelMap, bumpMap: ziegelBump, bumpScale: 0.055, roughness: 0.76 })),
    rahmen: archMat(new THREE.MeshStandardMaterial({ color: 0xf2f0e9, roughness: 0.38, metalness: 0.04 })),
    glas: archMat(new THREE.MeshPhysicalMaterial({ color: 0x293d4b, roughness: 0.10, metalness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.95 })),
    laibung: archMat(new THREE.MeshStandardMaterial({ color: 0x343b40, roughness: 0.82 })),
    rollo: archMat(new THREE.MeshStandardMaterial({ color: 0xb4a993, roughness: 0.94 })),
    sockel: archMat(new THREE.MeshStandardMaterial({ color: 0x777973, bumpMap: putzBump, bumpScale: 0.035, roughness: 0.93 })),
    beton: archMat(new THREE.MeshStandardMaterial({ color: 0xb7b5ad, bumpMap: putzBump, bumpScale: 0.018, roughness: 0.88 })),
    metall: archMat(new THREE.MeshStandardMaterial({ color: 0x50585b, roughness: 0.34, metalness: 0.72 })),
    tuer: archMat(new THREE.MeshStandardMaterial({ color: 0x493b32, roughness: 0.48, metalness: 0.03 })),
    licht: archMat(new THREE.MeshStandardMaterial({ color: 0xffd39a, emissive: 0xffa43a, emissiveIntensity: 0.65, roughness: 0.35 })),
  }
  type ArchKey = keyof typeof materialen
  const archGeometrien = new Map<ArchKey, THREE.BufferGeometry[]>()
  const archGeo = (key: ArchKey, original: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
    const geo = original.index ? original.toNonIndexed() : original
    if (geo !== original) original.dispose()
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(1, 1, 1),
    )
    geo.applyMatrix4(matrix)
    const liste = archGeometrien.get(key) || []; liste.push(geo); archGeometrien.set(key, liste)
  }
  const archBox = (key: ArchKey, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
    archGeo(key, new THREE.BoxGeometry(w, h, d), [x, y, z], [rx, ry, rz])
  const archZylinder = (key: ArchKey, r: number, laenge: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
    archGeo(key, new THREE.CylinderGeometry(r, r, laenge, 16), [x, y, z], [rx, ry, rz])

  const walls = new THREE.Mesh(new THREE.BoxGeometry(W, HE, D), putz)
  walls.position.y = HE / 2; walls.castShadow = true; walls.receiveShadow = true; house.add(walls)

  // Fundament, umlaufende Belagsplatte und eine zurückhaltende Gesimsgliederung.
  archBox('beton', W + 1.7, 0.12, D + 1.7, 0, 0.06, 0)
  archBox('sockel', W + 0.07, 0.48, D + 0.07, 0, 0.29, 0)
  for (const y of [3.62, HE - 0.10]) {
    archBox('beton', W + 0.10, 0.12, 0.10, 0, y, D / 2 + 0.035)
    archBox('beton', W + 0.10, 0.12, 0.10, 0, y, -D / 2 - 0.035)
    archBox('beton', 0.10, 0.12, D, W / 2 + 0.035, y, 0)
    archBox('beton', 0.10, 0.12, D, -W / 2 - 0.035, y, 0)
  }

  // Fenster werden als komplette Familie erzeugt und anschließend nach Material zusammengeführt.
  const fenster = (x: number, y: number, z: number, ry: number, w = 1.30, h = 1.56) => {
    const co = Math.cos(ry), si = Math.sin(ry)
    const b = (key: ArchKey, bw: number, bh: number, bd: number, lx: number, ly: number, lz: number) =>
      archBox(key, bw, bh, bd, x + lx * co + lz * si, y + ly, z - lx * si + lz * co, 0, ry, 0)
    b('laibung', w + 0.16, h + 0.16, 0.045, 0, 0, 0.015)
    b('glas', w - 0.12, h - 0.12, 0.035, 0, 0, 0.055)
    if (zufall() > 0.48) {
      const rh = h * (0.16 + zufall() * 0.30)
      b('rollo', w - 0.19, rh, 0.018, 0, h / 2 - 0.10 - rh / 2, 0.038)
    }
    for (const sx of [-1, 1]) b('rahmen', 0.065, h, 0.085, sx * (w / 2 - 0.033), 0, 0.095)
    for (const sy of [-1, 1]) b('rahmen', w, 0.065, 0.085, 0, sy * (h / 2 - 0.033), 0.095)
    b('rahmen', 0.045, h - 0.12, 0.075, 0, 0, 0.105)
    b('rahmen', w - 0.12, 0.042, 0.07, 0, 0.17, 0.105)
    b('beton', w + 0.28, 0.09, 0.30, 0, -h / 2 - 0.075, 0.11)
  }
  for (let f = 0; f < 2; f++) for (const x of [-5.4, -2.7, 0, 2.7, 5.4]) {
    if (!(f === 0 && x === 0)) fenster(x, 2.02 + f * 3.28, D / 2 + 0.012, 0)
    fenster(x, 2.02 + f * 3.28, -D / 2 - 0.012, Math.PI)
  }
  for (const seite of [-1, 1]) {
    for (let f = 0; f < 2; f++) for (const z of [-2.15, 2.15]) fenster(seite * (W / 2 + 0.012), 2.02 + f * 3.28, z, seite * Math.PI / 2, 1.18, 1.50)
    fenster(seite * (W / 2 + 0.018), HE + 0.78, 0, seite * Math.PI / 2, 0.92, 0.92)
  }

  // Hauseingang mit Rahmen, Paneelen, Verglasung, Griff, Vordach und zwei Stufen.
  archBox('laibung', 1.58, 2.42, 0.07, 0, 1.25, D / 2 + 0.025)
  archBox('tuer', 1.34, 2.26, 0.10, 0, 1.20, D / 2 + 0.085)
  for (const x of [-0.72, 0.72]) archBox('rahmen', 0.08, 2.38, 0.10, x, 1.24, D / 2 + 0.105)
  archBox('rahmen', 1.52, 0.08, 0.10, 0, 2.43, D / 2 + 0.105)
  archBox('glas', 0.88, 0.76, 0.025, 0, 1.77, D / 2 + 0.145)
  for (const y of [0.48, 0.92]) archBox('tuer', 0.98, 0.31, 0.025, 0, y, D / 2 + 0.15)
  archZylinder('metall', 0.025, 0.42, 0.47, 1.19, D / 2 + 0.19)
  archBox('beton', 2.15, 0.13, 0.96, 0, 2.63, D / 2 + 0.46)
  archBox('beton', 1.92, 0.13, 0.72, 0, 0.13, D / 2 + 0.53)
  archBox('beton', 2.12, 0.12, 0.94, 0, 0.06, D / 2 + 0.72)
  archBox('metall', 0.20, 0.27, 0.15, 1.12, 2.12, D / 2 + 0.11)
  archBox('licht', 0.13, 0.17, 0.025, 1.12, 2.12, D / 2 + 0.20)

  // Zwei separate Dachflächen mit Überstand; die Giebel bleiben verputzt.
  const dachUeberstand = 0.34, dachLauf = D / 2 + dachUeberstand, dachAnstieg = HR + 0.02
  const dachWinkel = Math.atan2(dachAnstieg, dachLauf), dachLaenge = Math.hypot(dachLauf, dachAnstieg) + 0.08
  archBox('dach', W + 0.76, 0.15, dachLaenge, 0, HE + HR / 2, dachLauf / 2, dachWinkel)
  archBox('dach', W + 0.76, 0.15, dachLaenge, 0, HE + HR / 2, -dachLauf / 2, -dachWinkel)
  for (const seite of [-1, 1]) {
    const giebel = new THREE.Shape(); giebel.moveTo(-D / 2, 0); giebel.lineTo(D / 2, 0); giebel.lineTo(0, HR - 0.08); giebel.closePath()
    archGeo('putz', new THREE.ExtrudeGeometry(giebel, { depth: 0.16, bevelEnabled: false }), [seite === 1 ? W / 2 : -W / 2 - 0.16, HE, 0], [0, Math.PI / 2, 0])
    archBox('rahmen', 0.13, 0.16, dachLaenge, seite * (W / 2 + 0.38), HE + HR / 2, dachLauf / 2, dachWinkel)
    archBox('rahmen', 0.13, 0.16, dachLaenge, seite * (W / 2 + 0.38), HE + HR / 2, -dachLauf / 2, -dachWinkel)
  }
  archZylinder('dach', 0.12, W + 0.80, 0, HE + HR + 0.045, 0, 0, 0, Math.PI / 2)
  for (const z of [-dachLauf, dachLauf]) {
    archBox('rahmen', W + 0.76, 0.17, 0.10, 0, HE - 0.07, z)
    archZylinder('metall', 0.075, W + 0.78, 0, HE - 0.10, z + Math.sign(z) * 0.08, 0, 0, Math.PI / 2)
  }
  for (const x of [-W / 2 + 0.17, W / 2 - 0.17]) for (const z of [-D / 2 - 0.13, D / 2 + 0.13]) {
    archZylinder('metall', 0.052, HE - 0.32, x, HE / 2, z)
    for (const y of [1.1, 3.6, 6.1]) archBox('metall', 0.16, 0.035, 0.12, x, y, z)
  }

  // Schornstein mit Dachanschluss, Kappe und zwei Abgasrohren.
  const schornsteinZ = -1.05, schornsteinY = HE + HR * (1 - Math.abs(schornsteinZ) / dachLauf)
  archBox('putz', 0.76, 1.48, 0.70, -3.25, schornsteinY + 0.63, schornsteinZ)
  archBox('sockel', 0.90, 0.16, 0.84, -3.25, schornsteinY - 0.02, schornsteinZ)
  archBox('beton', 0.91, 0.13, 0.85, -3.25, schornsteinY + 1.40, schornsteinZ)
  for (const x of [-3.43, -3.08]) archZylinder('metall', 0.085, 0.29, x, schornsteinY + 1.58, schornsteinZ)

  // Wenige zusammengeführte Meshes statt Hunderter einzelner Fenster- und Rahmen-Drawcalls.
  archGeometrien.forEach((geos, key) => {
    const merged = mergeGeometries(geos, false); geos.forEach((g) => g.dispose())
    if (!merged) return
    const mesh = new THREE.Mesh(merged, materialen[key]); mesh.castShadow = key !== 'glas' && key !== 'licht'; mesh.receiveShadow = true; house.add(mesh)
  })
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xe8590c, transparent: true, opacity: 0.9 })
  const e1 = new THREE.LineSegments(new THREE.EdgesGeometry(walls.geometry), edgeMat); e1.position.copy(walls.position); house.add(e1)
  const outline = new THREE.Shape(); outline.moveTo(-D / 2 - 0.3, 0); outline.lineTo(D / 2 + 0.3, 0); outline.lineTo(0, HR); outline.closePath()
  const rg = new THREE.ExtrudeGeometry(outline, { depth: W + 0.6, bevelEnabled: false })
  const e2 = new THREE.LineSegments(new THREE.EdgesGeometry(rg), edgeMat); e2.position.set(-(W + 0.6) / 2, HE, 0); e2.rotation.y = Math.PI / 2; house.add(e2)
  scene.add(house)

  // Scan-Ebene
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(W + 3, D + 3), new THREE.MeshBasicMaterial({ color: 0xe8590c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }))
  sweep.rotation.x = -Math.PI / 2; scene.add(sweep)
  sweep.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(W + 3, D + 3)), new THREE.LineBasicMaterial({ color: 0xffa060 })))

  const box = (w: number, h: number, d: number, color: number) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 }))

  // Drohne
  const drone = new THREE.Group(); const rotors: THREE.Mesh[] = []
  drone.add(box(0.9, 0.25, 0.9, 0x1c232c))
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), new THREE.MeshBasicMaterial({ color: 0xe8590c })); lamp.position.set(0, -0.18, 0.35); drone.add(lamp)
  ;([[1, 1], [-1, 1], [1, -1], [-1, -1]] as const).forEach((s) => {
    const arm = box(1, 0.08, 0.08, 0x2a323d); arm.position.set(s[0] * 0.5, 0.05, s[1] * 0.5); arm.rotation.y = s[0] * s[1] * Math.PI / 4; drone.add(arm)
    const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 20), new THREE.MeshBasicMaterial({ color: 0x9fb4d0, transparent: true, opacity: 0.25 }))
    rot.position.set(s[0] * 0.85, 0.14, s[1] * 0.85); drone.add(rot); rotors.push(rot)
  })
  scene.add(drone)

  // Gerüst: Instanzen je Teilart, jede gehört zu einer Lage und fliegt beim Aufbau ein
  const xs = W / 2 + OFF, zs = D / 2 + OFF
  const sides = [
    { a: [-xs, zs], b: [xs, zs], n: 6, nx: 0, nz: 1 },
    { a: [xs, zs], b: [xs, -zs], n: 4, nx: 1, nz: 0 },
    { a: [xs, -zs], b: [-xs, -zs], n: 6, nx: 0, nz: -1 },
    { a: [-xs, -zs], b: [-xs, zs], n: 4, nx: -1, nz: 0 },
  ]
  const teile: Teil[] = []
  sides.forEach((s, si) => {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, bay = len / s.n
    const ang = Math.atan2(-uz, ux)
    for (let L = 0; L < LEV; L++) {
      for (let i = 0; i <= s.n; i++) {
        if (i === s.n && si !== 3) continue // Eckstiel gehört zur nächsten Seite
        teile.push({ t: 'post', L, pos: [s.a[0] + ux * bay * i, L * LH + LH / 2, s.a[1] + uz * bay * i], rot: 0, sc: [0.07, LH, 0.07], d: 0, k: 0, j: 0 })
      }
      for (let j = 0; j < s.n; j++) {
        const cx = s.a[0] + ux * bay * (j + 0.5), cz = s.a[1] + uz * bay * (j + 0.5)
        const inx = cx - s.nx * 0.7, inz = cz - s.nz * 0.7
        teile.push({ t: 'tube', L, pos: [cx, (L + 1) * LH, cz], rot: ang, sc: [bay, 0.05, 0.05], d: 0.22, k: 0, j: 0 })
        teile.push({ t: 'tube', L, pos: [inx, (L + 1) * LH, inz], rot: ang, sc: [bay, 0.05, 0.05], d: 0.26, k: 0, j: 0 })
        teile.push({ t: 'deck', L, pos: [(cx + inx) / 2, (L + 1) * LH - 0.06, (cz + inz) / 2], rot: ang, sc: [bay - 0.06, 0.045, 0.64], d: 0.4, k: 0, j: 0 })
        teile.push({ t: 'tube', L, pos: [cx, L * LH + 1.0, cz], rot: ang, sc: [bay, 0.05, 0.05], d: 0.55, k: 0, j: 0 })
        teile.push({ t: 'tube', L, pos: [cx, L * LH + 1.5, cz], rot: ang, sc: [bay, 0.05, 0.05], d: 0.6, k: 0, j: 0 })
        const diag = Math.hypot(bay, LH - 0.15), da = Math.atan2(LH - 0.15, bay) * ((j + L) % 2 ? 1 : -1)
        teile.push({ t: 'diag', L, pos: [cx, L * LH + LH / 2, cz], rot: ang, tilt: da, sc: [diag, 0.04, 0.04], d: 0.7, k: 0, j: 0 })
      }
    }
  })
  const counts = { post: 0, tube: 0, deck: 0, diag: 0 }
  teile.forEach((it) => { it.k = counts[it.t]++; it.j = zufall() * 0.12 })
  const unit = new THREE.BoxGeometry(1, 1, 1)
  const steel = new THREE.MeshStandardMaterial({ color: 0x77828f, roughness: 0.42, metalness: 0.55, transparent: true })
  const wood = new THREE.MeshStandardMaterial({ color: 0xc08a52, roughness: 0.9, transparent: true })
  const pools = {
    post: new THREE.InstancedMesh(unit, steel, counts.post), tube: new THREE.InstancedMesh(unit, steel, counts.tube),
    diag: new THREE.InstancedMesh(unit, steel, counts.diag), deck: new THREE.InstancedMesh(unit, wood, counts.deck),
  }
  ;(Object.values(pools)).forEach((p) => { p.frustumCulled = false; p.castShadow = true; scene.add(p) })
  const dummy = new THREE.Object3D()
  const updateGeruest = (buildP: number, blueprint: boolean) => {
    const cnt = { post: 0, deck: 0, rail: 0 }
    for (const it of teile) {
      const u = blueprint ? 1 : clamp((buildP * LEV - it.L - it.d - it.j) / 0.45, 0, 1), e = smooth(u)
      dummy.position.set(it.pos[0], it.pos[1] + (1 - e) * 3.5, it.pos[2])
      dummy.rotation.set(0, it.rot, 0)
      if (it.tilt) dummy.rotateZ(it.tilt)
      dummy.scale.set(it.sc[0] * (e > 0 ? 1 : 0), it.sc[1] * e, it.sc[2] * e)
      dummy.updateMatrix(); pools[it.t].setMatrixAt(it.k, dummy.matrix)
      if (u >= 1) { if (it.t === 'post') cnt.post++; else if (it.t === 'deck') cnt.deck++; else cnt.rail++ }
    }
    Object.values(pools).forEach((p) => { p.instanceMatrix.needsUpdate = true })
    if (blueprint) { steel.color.set(0x2f7de1); steel.opacity = 0.6; wood.color.set(0x2f7de1); wood.opacity = 0.35 }
    else { steel.color.set(0x77828f); steel.opacity = 1; wood.color.set(0xc08a52); wood.opacity = 1 }
    return cnt
  }

  // Lager
  const lager = new THREE.Group(); lager.position.set(56, 0, 0)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(34, 0.2, 22), new THREE.MeshStandardMaterial({ color: 0xd9dfe7, roughness: 0.9 })); floor.position.y = 0.1; floor.receiveShadow = true; lager.add(floor)
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.5, metalness: 0.4 })
  const palMat = new THREE.MeshStandardMaterial({ color: 0x9aa6b4, roughness: 0.5, metalness: 0.6 })
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xe8590c, roughness: 0.6 })
  for (let r = 0; r < 3; r++) {
    const z = -7 + r * 7
    for (let b = 0; b < 5; b++) {
      const x = -12 + b * 5.6
      ;([[-2.4, -0.6], [2.4, -0.6], [-2.4, 0.6], [2.4, 0.6]] as const).forEach((p) => { const s = box(0.12, 6, 0.12, 0x2f6fd0); s.material = frameMat; s.position.set(x + p[0], 3.2, z + p[1]); lager.add(s) })
      for (let lv = 0; lv < 3; lv++) {
        const beam = box(5, 0.14, 0.14, 0xe8590c); beam.material = orangeMat; beam.position.set(x, 1 + lv * 2, z + 0.6); lager.add(beam)
        const beam2 = beam.clone(); beam2.position.z = z - 0.6; lager.add(beam2)
        if ((b + lv + r) % 4 !== 0) {
          const pal = box(4.4, 1.3, 1.0, 0xc9d3de); pal.material = palMat; pal.position.set(x, 1.8 + lv * 2, z); lager.add(pal)
          for (let q = 0; q < 6; q++) { const tube = box(0.06, 1.2, 0.06, 0x6f7c8b); tube.position.set(x - 2 + q * 0.8, 1.8 + lv * 2, z + 0.52); lager.add(tube) }
        }
      }
    }
  }
  const forklift = new THREE.Group()
  const fb = box(1.3, 0.9, 2.2, 0xe8590c), cab = box(1.1, 1.0, 1.0, 0x1c232c); cab.position.set(0, 1.0, -0.2)
  const mast = box(0.15, 3.2, 0.15, 0x2a323d); mast.position.set(0, 1.6, 1.2)
  const fork = box(0.9, 0.08, 1.3, 0x2a323d); fork.position.set(0, 0.3, 1.7)
  const load = box(0.9, 0.9, 0.9, 0xc9d3de); load.position.set(0, 0.85, 1.7)
  forklift.add(fb, cab, mast, fork, load); fb.position.y = 0.55; lager.add(forklift); scene.add(lager)
  lager.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== floor) o.castShadow = true })

  // Mitarbeiter
  const worker = new THREE.Group()
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xe8590c, roughness: 0.7 })); torso.position.y = 1.0
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.6, 12), new THREE.MeshStandardMaterial({ color: 0x1c232c })); legs.position.y = 0.3
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 14), new THREE.MeshStandardMaterial({ color: 0xd9b99b })); head.position.y = 1.65
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 })); helm.position.y = 1.7
  worker.add(torso, legs, head, helm); worker.position.set(10.4, 0, 6.4); worker.scale.setScalar(0); worker.traverse((o) => { o.castShadow = true }); scene.add(worker)

  // ---------- Steuerung ----------
  const clampT = (x: number) => clamp(x, 0, 0.99999)
  const camP = new THREE.Vector3(), camT = new THREE.Vector3(), v3 = new THREE.Vector3(), back = new THREE.Vector3()
  const placeCamera = (ci: number, t: number) => {
    const a = WP[ci], b = WP[ci + 1], e = smooth(ci === 4 ? clamp(t / 0.35, 0, 1) : ci === 5 ? clamp(t / 0.5, 0, 1) : t)
    camP.set(lerp(a.p[0], b.p[0], e), lerp(a.p[1], b.p[1], e), lerp(a.p[2], b.p[2], e))
    camT.set(lerp(a.t[0], b.t[0], e), lerp(a.t[1], b.t[1], e), lerp(a.t[2], b.t[2], e))
    if (ci === 5) camP.y += Math.sin(t * Math.PI) * 4
    camera.position.copy(camP); camera.lookAt(camT)
  }
  const pin = (el: HTMLElement | null, rahmen: HTMLElement, x: number, y: number, z: number, show: boolean) => {
    if (!el) return
    v3.set(x, y, z).project(camera)
    const vis = show && v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1
    el.style.opacity = vis ? '1' : '0'
    if (vis) { el.style.left = ((v3.x + 1) / 2 * rahmen.clientWidth) + 'px'; el.style.top = ((1 - v3.y) / 2 * rahmen.clientHeight) + 'px' }
  }

  /** Gesamtfortschritt 0–7: ganze Zahl = Kapitel, Rest = Fortschritt im Kapitel. Das Kapitel ist bei 0,5 genau in der Mitte des Bildes. */
  const fortschritt = (): number => {
    const vh = window.innerHeight, kopf = kopfHoehe()
    const r = buehne.wurzel.getBoundingClientRect()
    const hoehe = buehne.abschnitte[0]?.offsetHeight || 1
    return clamp((kopf + (vh - kopf) / 2 - r.top) / hoehe, 0, 6.9999)
  }

  const zeichne = (g: number): void => {
    const ci = Math.min(6, Math.floor(g)), t = clampT(g - ci), rahmen = buehne.behaelter
    const w = Math.round(buehne.canvas.clientWidth), h = Math.round(buehne.canvas.clientHeight)
    if (!w || !h) return
    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 2)
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr)
    if (buehne.canvas.width !== pw || buehne.canvas.height !== ph) renderer.setSize(pw, ph, false)
    renderer.setPixelRatio(1)
    camera.aspect = w / h; camera.fov = w / h < 0.8 ? 58 : 42
    // Das Motiv wechselt die Seite wie der Text: Kapitel 0 links, 1 rechts, … (sanft, ohne Sprung). Auf dem Handy rutscht es nach oben, der Text steht unten.
    const schmal = w < 900
    const seite = -Math.cos(Math.PI * (g - 0.5))
    camera.setViewOffset(w, h, schmal ? 0 : -seite * w * 0.2, schmal ? h * 0.2 : 0, w, h)
    // Sonne und Schattenfeld folgen dem Ort der Szene (Lager liegt weit rechts)
    const sx = 56 * (smooth((g - 4.1) / 0.3) - smooth((g - 5.0) / 0.5))
    sun.position.set(30 + sx, 40, 20); sun.target.position.set(sx, 0, 0); sun.target.updateMatrixWorld()

    // Kamera
    if (ci === 0) {
      const ang = lerp(0.62, 2.5, smooth(t)); const r = 31
      camera.position.set(Math.sin(ang) * r, lerp(10, 12, t), Math.cos(ang) * r); camera.lookAt(0, 4, 0)
      if (t > 0.85) { const kk = smooth((t - 0.85) / 0.15); const a0 = camera.position.clone(); camera.position.lerpVectors(a0, new THREE.Vector3(WP[1].p[0], WP[1].p[1], WP[1].p[2]), kk); camera.lookAt(0, 4.2, 0) }
    } else {
      placeCamera(ci, t)
      if (ci >= 1 && ci <= 5) {
        // Kamera kreist während des Scrollens um das Motiv und fährt dabei näher heran bzw. wieder weg (an den Kapitelgrenzen stetig)
        const dir = ci % 2 ? 1 : -1, ang = dir * lerp(-0.7, 0.7, smooth(t)), zoom = ci % 2 ? lerp(1.08, 0.88, smooth(t)) : lerp(0.88, 1.08, smooth(t))
        v3.copy(camera.position).sub(camT); const c = Math.cos(ang), sn = Math.sin(ang)
        camera.position.set(camT.x + (v3.x * c + v3.z * sn) * zoom, camera.position.y, camT.z + (-v3.x * sn + v3.z * c) * zoom)
        camera.lookAt(camT)
      }
      if (ci === 6) { const a2 = t * 1.2; camera.position.set(lerp(camera.position.x, Math.sin(a2 + 0.8) * 44, 0.5), camera.position.y, lerp(camera.position.z, Math.cos(a2 + 0.8) * 44, 0.5)); camera.lookAt(0, 3.5, 0) }
    }
    if (camera.aspect < 0.8) { camera.getWorldDirection(back); camera.position.addScaledVector(back, -14) } // Hochformat: Kamera zurück
    else if (camera.aspect < 1.3) { camera.getWorldDirection(back); camera.position.addScaledVector(back, -8) }
    else { const lw = smooth((g - 4) / 0.35) * (1 - smooth((g - 5) / 0.5)); camera.getWorldDirection(back); camera.position.addScaledVector(back, -8 - 8 * lw) } // breit: etwas zurück, im Lager weiter

    // Lager nur zeigen, wo es gebraucht wird
    lager.visible = g > 3.8 && g < 5.9

    // Scan und Gebäude
    const scanY = ci === 0 ? clamp(t / 0.8, 0, 1) * (HE + HR + 0.2) : 99
    plane.constant = scanY; sweep.position.y = Math.min(scanY, HE + HR + 0.2); sweep.visible = ci === 0 && t < 0.8
    edgeMat.opacity = lerp(lerp(0.9, 0.5, clamp((g - 0.8) / 0.4, 0, 1)), 0.12, clamp((g - 2.8) / 0.4, 0, 1))

    // Drohne
    const da = lerp(0.62, 2.5, smooth(Math.min(t, 1))) + 0.9
    const dAng = ci === 0 ? da + t * 6.0 : 8
    drone.visible = ci === 0
    drone.position.set(Math.sin(dAng) * 13, 9 + Math.sin(t * 12) * 0.6 - clamp((t - 0.85) / 0.15, 0, 1) * 18, Math.cos(dAng) * 13 * 0.75)
    drone.rotation.y = dAng + Math.PI / 2; drone.rotation.z = 0.12
    if (!reduce) rotors.forEach((r2) => { r2.rotation.y += 0.6 })

    // Gerüst
    const zeigeGeruest = ci >= 2
    Object.values(pools).forEach((p) => { p.visible = zeigeGeruest })
    if (ci === 2) updateGeruest(1, true)
    else if (ci === 3) updateGeruest(clamp(t * 1.15, 0, 1), false)
    else if (ci > 3) updateGeruest(1, false)

    // Lager und Mitarbeiter
    const fz = ci === 4 ? lerp(-8, 8, t) : ci < 4 ? -8 : 8
    forklift.position.set(-4 + Math.sin((ci === 4 ? t : 0) * 3) * 1.2, 0, fz)
    load.visible = ci === 4 && t < 0.7
    const wv = ci === 5 ? smooth(clamp(t * 3, 0, 1)) : (ci === 6 ? 1 : 0)
    worker.scale.setScalar(Math.max(wv, 0.0001)); worker.position.y = ci === 5 ? Math.abs(Math.sin(t * 20)) * 0.04 : 0

    // Maßketten nur im ersten Kapitel
    camera.updateMatrixWorld()
    pin($('sf-dimL'), rahmen, 0, 0.2, D / 2 + 1.6, ci === 0 && t > 0.5)
    pin($('sf-dimH'), rahmen, -W / 2 - 1.4, HE / 2, D / 2 + 0.6, ci === 0 && t > 0.65)

    renderer.render(scene, camera)
  }

  /** Texte blenden weich ein und aus: voll sichtbar in der Mitte ihres Kapitels, davor und danach laufen sie mit dem Scrollen weg */
  const textStand = (g: number): void => {
    buehne.abschnitte.forEach((a, i) => {
      const d = g - (i + 0.5), v = 1 - smooth((Math.abs(d) - 0.3) / 0.25)
      const kopie = a.firstElementChild as HTMLElement | null
      if (!kopie) return
      kopie.style.setProperty('--v', v.toFixed(3))
      kopie.style.setProperty('--dy', ((d > 0 ? -1 : 1) * (1 - v) * 50).toFixed(1) + 'px')
      kopie.style.visibility = v < 0.02 ? 'hidden' : ''
    })
  }

  // ---------- Schleife: nur solange die Abschnitte im Bild sind ----------
  // Kein Nachlaufen: das Bild gehört immer genau zum aktuellen Scrollstand. Gezeichnet wird nur, wenn sich etwas geändert hat.
  let zuletzt = NaN, groesse = ''
  let raf = 0, läuft = false, weg = false
  const frame = () => {
    if (weg || !läuft) return
    raf = requestAnimationFrame(frame)
    const g = fortschritt()
    const gr = buehne.canvas.clientWidth + 'x' + buehne.canvas.clientHeight + '@' + (window.devicePixelRatio || 1)
    if (Math.abs(g - zuletzt) < 0.0003 && gr === groesse) return
    zuletzt = g; groesse = gr
    zeichne(g); textStand(g)
  }
  const io = new IntersectionObserver((es) => {
    const sichtbar = es.some((e) => e.isIntersecting)
    if (sichtbar && !läuft && !weg) { läuft = true; zuletzt = NaN; raf = requestAnimationFrame(frame) }
    if (!sichtbar) { läuft = false; cancelAnimationFrame(raf) }
  }, { rootMargin: '150px 0px' })
  io.observe(buehne.wurzel)

  const dispose = () => {
    weg = true; läuft = false; cancelAnimationFrame(raf); io.disconnect()
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else if (mat) mat.dispose()
    })
    envRT.dispose(); pmrem.dispose(); renderer.dispose()
  }
  const resize = () => { zuletzt = NaN }
  return { dispose, resize }
}
