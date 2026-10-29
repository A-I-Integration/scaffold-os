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

export interface Szene { dispose: () => void; resize: () => void }
/** Ein Abschnitt: Kapitelnummer 0–6, das Zeichenfeld, sein Rahmen und der Abschnitt selbst (für den Scrollfortschritt) */
export interface Slot { ci: number; canvas: HTMLCanvasElement; rahmen: HTMLElement; abschnitt: HTMLElement; pin: HTMLElement }

const W = 14.2, D = 8, HE = 7.2, HR = 2.6, OFF = 0.9, LEV = 4, LH = 2
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const smooth = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const de = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

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

export function starteSzene(slots: Slot[], reduce: boolean, kopfHoehe: () => number): Szene | null {
  let renderer: THREE.WebGLRenderer
  const glCanvas = document.createElement('canvas')
  try { renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' }) } catch { return null }
  // Farben wie entworfen (Hexwerte direkt), Lichter entsprechend kräftiger
  THREE.ColorManagement.enabled = false
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.localClippingEnabled = true
  const $ = (id: string) => document.getElementById(id) as HTMLElement
  const set = (id: string, v: string) => { const e = $(id); if (e && e.textContent !== v) e.textContent = v }

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf1f3f7)
  scene.fog = new THREE.Fog(0xf1f3f7, 45, 140)
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400)
  const k = Math.PI // Lichtstärke wie im Entwurf (ohne die frühere π-Umrechnung)
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbcc4d0, 0.68 * k))
  const sun = new THREE.DirectionalLight(0xfff4e6, 0.8 * k); sun.position.set(30, 40, 20); sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 })
  scene.add(sun); scene.add(sun.target)
  const rim = new THREE.DirectionalLight(0xffd9bd, 0.18 * k); rim.position.set(-30, 15, -25); scene.add(rim)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0xdde2e9, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)

  // Gebäude: Wände, Satteldach, Fenster. Eine Schnittebene lässt es beim Scan von unten nach oben entstehen.
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
  const house = new THREE.Group()
  const walls = new THREE.Mesh(new THREE.BoxGeometry(W, HE, D), new THREE.MeshStandardMaterial({ color: 0xf3efe8, roughness: 0.92, clippingPlanes: [plane] }))
  walls.position.y = HE / 2; walls.castShadow = true; walls.receiveShadow = true; house.add(walls)
  const shape = new THREE.Shape(); shape.moveTo(-D / 2 - 0.3, 0); shape.lineTo(D / 2 + 0.3, 0); shape.lineTo(0, HR); shape.closePath()
  const rg = new THREE.ExtrudeGeometry(shape, { depth: W + 0.6, bevelEnabled: false })
  const roof = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0xa9482a, roughness: 0.85, clippingPlanes: [plane] }))
  roof.castShadow = true
  roof.rotation.y = Math.PI / 2; roof.position.set(-(W + 0.6) / 2, HE, 0); house.add(roof)
  const winMat = new THREE.MeshStandardMaterial({ color: 0x2c3a4c, emissive: 0x3d5878, emissiveIntensity: 0.18, roughness: 0.2, metalness: 0.3, clippingPlanes: [plane] })
  for (let f = 0; f < 2; f++) for (let kk = 0; kk < 5; kk++) {
    const wf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 0.1), winMat); wf.position.set(-5.4 + kk * 2.7, 2 + f * 3.3, D / 2 + 0.02); house.add(wf)
    const wb = wf.clone(); wb.position.z = -D / 2 - 0.02; house.add(wb)
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x5a4636, clippingPlanes: [plane] })); door.position.set(0, 1.1, D / 2 + 0.03); house.add(door)
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xe8590c, transparent: true, opacity: 0.9 })
  const e1 = new THREE.LineSegments(new THREE.EdgesGeometry(walls.geometry), edgeMat); e1.position.copy(walls.position); house.add(e1)
  const e2 = new THREE.LineSegments(new THREE.EdgesGeometry(rg), edgeMat); e2.position.copy(roof.position); e2.rotation.copy(roof.rotation); house.add(e2)
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
  teile.forEach((it) => { it.k = counts[it.t]++; it.j = Math.random() * 0.12 })
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

  /** Scrollfortschritt 0–1 eines Abschnitts. Breit: der Abschnitt bleibt stehen (sticky), der Fortschritt läuft über die Standstrecke. Schmal: nach der Lage des Feldes im Fenster. */
  const fortschritt = (s: Slot): number => {
    const vh = window.innerHeight
    if (window.matchMedia('(min-width: 900px)').matches) {
      const r = s.abschnitt.getBoundingClientRect()
      const stand = Math.max(1, r.height - s.pin.clientHeight)
      const vor = vh * 0.35
      return clamp((kopfHoehe() + vor - r.top) / ((stand + vor) * 0.78), 0, 1)
    }
    const r = s.canvas.getBoundingClientRect()
    return clamp((vh * 0.9 - r.top) / (vh * 0.6), 0, 1)
  }

  const zeichneSlot = (s: Slot, p: number): void => {
    const ci = s.ci, t = clampT(p), rahmen = s.canvas
    const w = Math.round(s.canvas.clientWidth), h = Math.round(s.canvas.clientHeight)
    if (!w || !h) return
    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 2)
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr)
    if (glCanvas.width !== pw || glCanvas.height !== ph) renderer.setSize(pw, ph, false)
    renderer.setPixelRatio(1)
    camera.aspect = w / h; camera.fov = w / h < 0.8 ? 58 : 42; camera.updateProjectionMatrix()
    // Sonne und Schattenfeld folgen dem Ort der Szene (Lager liegt weit rechts)
    const sx = ci === 4 || ci === 5 ? 56 : 0
    sun.position.set(30 + sx, 40, 20); sun.target.position.set(sx, 0, 0); sun.target.updateMatrixWorld()

    // Kamera
    if (ci === 0) {
      const ang = lerp(0.62, 2.5, smooth(t)); const r = 31
      camera.position.set(Math.sin(ang) * r, lerp(10, 12, t), Math.cos(ang) * r); camera.lookAt(0, 4, 0)
      if (t > 0.85) { const kk = smooth((t - 0.85) / 0.15); const a0 = camera.position.clone(); camera.position.lerpVectors(a0, new THREE.Vector3(WP[1].p[0], WP[1].p[1], WP[1].p[2]), kk); camera.lookAt(0, 4.2, 0) }
    } else {
      placeCamera(ci, t)
      if (ci === 6) { const a2 = t * 1.2; camera.position.set(lerp(camera.position.x, Math.sin(a2 + 0.8) * 44, 0.5), camera.position.y, lerp(camera.position.z, Math.cos(a2 + 0.8) * 44, 0.5)); camera.lookAt(0, 3.5, 0) }
    }
    if (camera.aspect < 0.8) { camera.getWorldDirection(back); camera.position.addScaledVector(back, -14) } // Hochformat: Kamera zurück
    else if (camera.aspect < 1.3) { camera.getWorldDirection(back); camera.position.addScaledVector(back, ci === 0 ? -13 : (ci === 4 || ci === 5) ? -13 : -5) } // fast quadratisches Feld: etwas zurück (Lager breiter)

    // Scan und Gebäude
    const scanY = ci === 0 ? clamp(t / 0.8, 0, 1) * (HE + HR + 0.2) : 99
    plane.constant = scanY; sweep.position.y = Math.min(scanY, HE + HR + 0.2); sweep.visible = ci === 0 && t < 0.8
    edgeMat.opacity = ci === 0 ? 0.9 : (ci < 3 ? 0.5 : 0.12)

    // Drohne
    const da = lerp(0.62, 2.5, smooth(Math.min(t, 1))) + 0.9
    const dAng = ci === 0 ? da + t * 6.0 : 8
    drone.visible = ci === 0
    drone.position.set(Math.sin(dAng) * 13, 9 + Math.sin(t * 12) * 0.6 - clamp((t - 0.85) / 0.15, 0, 1) * 18, Math.cos(dAng) * 13 * 0.75)
    drone.rotation.y = dAng + Math.PI / 2; drone.rotation.z = 0.12
    if (!reduce) rotors.forEach((r2) => { r2.rotation.y += 0.6 })

    // Gerüst
    let cnt = { post: 0, deck: 0, rail: 0 }
    const zeigeGeruest = ci >= 2
    Object.values(pools).forEach((p) => { p.visible = zeigeGeruest })
    if (ci === 2) cnt = updateGeruest(1, true)
    else if (ci === 3) cnt = updateGeruest(clamp(t * 1.15, 0, 1), false)
    else if (ci > 3) cnt = updateGeruest(1, false)

    // Karten
    const e1k = smooth(clamp(t * 1.6, 0, 1))
    if (ci === 0) {
      const s = clamp(t * 1.2, 0, 1)
      set('sf-sPts', de(Math.round(s * 4820000))); set('sf-sTeile', de(Math.round(s * 3)))
      const bar = $('sf-sBar'); if (bar) bar.style.width = (s * 100) + '%'
    } else if (ci === 1) {
      set('sf-aL', de(14.2 * e1k, 2) + ' m'); set('sf-aH', de(7.2 * e1k, 2) + ' m'); set('sf-aF', de(Math.round(2 * (W + D) * 8.4 * e1k)) + ' m²')
    } else if (ci === 2) {
      const m = 6480, a = 3150, v = 880, g = 0.18
      const mm = Math.round(m * e1k), aa = Math.round(a * clamp(t * 2 - 0.2, 0, 1)), vv = Math.round(v * clamp(t * 2 - 0.4, 0, 1)), sc = mm + aa + vv
      const gg = g * clamp(t * 2 - 0.6, 0, 1)
      set('sf-qM', de(mm) + ' €'); set('sf-qA', de(aa) + ' €'); set('sf-qV', de(vv) + ' €'); set('sf-qS', de(sc) + ' €')
      set('sf-qG', de(gg * 100) + ' %'); set('sf-qP', de(Math.round(sc * (1 + gg))) + ' €')
    } else if (ci === 3) {
      const bp = clamp(t * 1.15, 0, 1)
      set('sf-bL', Math.min(LEV, Math.ceil(bp * LEV - 1e-6)) + ' von ' + LEV)
      set('sf-bP', de(cnt.post) + ' / ' + de(counts.post)); set('sf-bD', de(cnt.deck) + ' / ' + de(counts.deck))
      set('sf-bR', de(cnt.rail) + ' / ' + de(counts.tube + counts.diag))
      const bar = $('sf-bBar'); if (bar) bar.style.width = (bp * 100) + '%'
    } else if (ci === 4) {
      const e4 = smooth(clamp(t * 1.4, 0, 1))
      set('sf-lR', de(Math.round(412 - 96 * e4))); set('sf-lB', de(Math.round(530 - 120 * e4))); set('sf-lD', de(Math.round(260 - 44 * e4)))
      set('sf-lX', de(Math.round(e4 * 100)) + ' %')
      const bar = $('sf-lBar'); if (bar) bar.style.width = (e4 * 100) + '%'
    } else if (ci === 5) {
      const mins = Math.round(lerp(0, 8 * 60 + 12, clamp(t / 0.55, 0, 1)))
      set('sf-zA', t > 0.55 ? '16:04' : 'läuft …'); set('sf-zD', Math.floor(mins / 60) + ' h ' + ('0' + (mins % 60)).slice(-2) + ' min')
    } else if (ci === 6) {
      const e6 = smooth(clamp(t * 2, 0, 1))
      set('sf-tA', String(Math.round(7 * e6))); set('sf-tB', String(Math.round(12 * e6))); set('sf-tC', String(Math.round(5 * e6))); set('sf-tD', String(Math.round(18 * e6)))
    }

    // Lager und Mitarbeiter
    const fz = ci === 4 ? lerp(-8, 8, t) : ci < 4 ? -8 : 8
    forklift.position.set(-4 + Math.sin((ci === 4 ? t : 0) * 3) * 1.2, 0, fz)
    load.visible = ci === 4 && t < 0.7
    const wv = ci === 5 ? smooth(clamp(t * 3, 0, 1)) : (ci === 6 ? 1 : 0)
    worker.scale.setScalar(Math.max(wv, 0.0001)); worker.position.y = ci === 5 ? Math.abs(Math.sin(t * 20)) * 0.04 : 0

    // Maßketten nur im ersten Kapitel
    camera.updateMatrixWorld()
    if (ci === 0) {
    pin($('sf-dimL'), rahmen, 0, 0.2, D / 2 + 1.6, ci === 0 && t > 0.5)
    pin($('sf-dimH'), rahmen, -W / 2 - 1.4, HE / 2, D / 2 + 0.6, ci === 0 && t > 0.65)
    }

    renderer.render(scene, camera)
    const ctx = s.canvas.getContext('2d')
    if (!ctx) return
    if (s.canvas.width !== pw || s.canvas.height !== ph) { s.canvas.width = pw; s.canvas.height = ph }
    ctx.drawImage(glCanvas, 0, 0)
  }

  // ---------- Schleife: nur solange mindestens ein Abschnitt im Bild ist ----------
  // Kein Nachlaufen: das Bild gehört immer genau zum aktuellen Scrollstand. Gezeichnet wird nur, wenn sich etwas geändert hat.
  const zuletzt = slots.map(() => -1)
  const groesse = slots.map(() => '')
  const imBild = new Set<number>()
  let raf = 0, läuft = false, weg = false
  const frame = () => {
    if (weg || !läuft) return
    raf = requestAnimationFrame(frame)
    imBild.forEach((i) => {
      const s = slots[i], ziel = fortschritt(s)
      const g = s.canvas.clientWidth + 'x' + s.canvas.clientHeight + '@' + (window.devicePixelRatio || 1)
      if (Math.abs(ziel - zuletzt[i]) < 0.0004 && g === groesse[i]) return
      zuletzt[i] = ziel; groesse[i] = g
      zeichneSlot(s, ziel)
    })
  }
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      const i = slots.findIndex((s) => s.abschnitt === e.target)
      if (i < 0) continue
      if (e.isIntersecting) { imBild.add(i); zuletzt[i] = -1 } else imBild.delete(i)
    }
    if (imBild.size > 0 && !läuft && !weg) { läuft = true; raf = requestAnimationFrame(frame) }
    if (imBild.size === 0) { läuft = false; cancelAnimationFrame(raf) }
  }, { rootMargin: '150px 0px' })
  slots.forEach((s) => io.observe(s.abschnitt))

  const dispose = () => {
    weg = true; läuft = false; cancelAnimationFrame(raf); io.disconnect()
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else if (mat) mat.dispose()
    })
    renderer.dispose()
  }
  const resize = () => { slots.forEach((_, i) => { zuletzt[i] = -1 }) }
  return { dispose, resize }
}
