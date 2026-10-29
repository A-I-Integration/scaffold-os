// ============================================================
// SCAFFOLD OS – IFC-Import im Hetzner-Worker (Phase 89, Jobtyp 'cad-import')
//
// Ablauf eines Jobs:
//   1. IFC aus dem Supabase-Storage laden (Service-Schlüssel), Rahmen und STEP-Syntax prüfen (gemeinsamer Code mit dem
//      Browser: ifc-rahmen.js – web-ifc hängt sonst bei kaputten Klammern in einer Endlosschleife).
//   2. web-ifc (Node) öffnet das Modell. Das Rohmodell (Geschosse, Wände/Decken/Dächer mit Grundriss-Dreiecken) liest
//      derselbe Code wie im Browser (ifc-lesen.js). Die Ableitung (Umriss, Gebäudeteile, Höhen) macht der Browser aus
//      dem Properties-JSON mit derselben Funktion wie beim Browser-Import (lib/cad/ifc-einleser.ts → leiteIfcAb).
//   3. Gesamtgeometrie aller Bauteile → glTF mit Draco-Kompression (ein Knoten je IFC-Element, Eigenschaften in extras).
//   4. Ergebnis in den Storage legen (modell.glb, eigenschaften.json), project_media-Zeilen anlegen, Job auf 'done'.
//
// Fehler pro IFC-Element brechen nichts ab: das Element wird übersprungen und in der Fehlerliste vermerkt
// (Teilergebnis statt Abbruch). Nur eine unbrauchbare Datei (kein IFC, abgeschnitten, keine Geschosse/Wände) beendet den Job.
//
// Hinweis zu web-ifc 0.0.77: Die Einstellung „USE_FAST_BOOLS“ gibt es in dieser Version nicht (weder in den Typen noch im
// Code des Pakets). Es werden nur vorhandene Einstellungen gesetzt.
// ============================================================

const { pruefeIfcRahmen, pruefeStepSyntax } = require('./ifc-rahmen.js')
const { leseRohmodell } = require('./ifc-lesen.js')

const IFC_MAX_BYTES = 150 * 1024 * 1024
const BUCKET_STANDARD = 'project-media'
const STAPEL_GLB = 40

class IfcJobFehler extends Error {
  constructor(grund, meldung) { super(meldung); this.grund = grund; this.endgueltig = true }
}

const pause = () => new Promise((r) => setImmediate(r))
const mb = (b) => (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')

// ---------------------------------------------------------------- Rohmodell für den Transport verkleinern

/**
 * Für das Properties-JSON: Dreiecke ohne Fläche in der Grundrissebene (senkrechte Wandflächen) tragen zum Umriss nichts
 * bei und werden weggelassen; Koordinaten auf 9 gültige Stellen (float32-genau). Das hält das JSON auch bei großen Modellen klein.
 */
function verdichteRoh(roh) {
  // 9 gültige Stellen = float32 verlustfrei. Gröberes Runden (auch 1e-6 m) verschiebt Werte, die genau auf einer Rasterkante
  // liegen, und der Umriss weicht um eine Zelle (4 cm) vom Browser-Import ab (am echten FZK-Haus gemessen).
  const r = (v) => Number(v.toPrecision(9))
  return {
    ...roh,
    bauteile: roh.bauteile.map((b) => {
      const t = b.tris
      const aus = []
      for (let k = 0; k + 5 < t.length; k += 6) {
        const flaeche = Math.abs((t[k + 2] - t[k]) * (t[k + 5] - t[k + 1]) - (t[k + 4] - t[k]) * (t[k + 3] - t[k + 1])) / 2
        if (flaeche < 1e-6) continue
        aus.push(r(t[k]), r(t[k + 1]), r(t[k + 2]), r(t[k + 3]), r(t[k + 4]), r(t[k + 5]))
      }
      return { ...b, tris: aus, yMin: r(b.yMin), yMax: r(b.yMax) }
    }),
  }
}

// ---------------------------------------------------------------- glTF (Draco)

async function baueGlb(W, api, m, onFortschritt, abbruch) {
  const { Document } = require('@gltf-transform/core')
  const { KHRDracoMeshCompression } = require('@gltf-transform/extensions')
  const draco3d = require('draco3dgltf')
  const { NodeIO } = require('@gltf-transform/core')

  const doc = new Document()
  doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
    method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed: 5, decodeSpeed: 5,
  })
  const buffer = doc.createBuffer()
  const szene = doc.createScene('IFC')
  const materialien = new Map()
  const material = (c) => {
    const key = [c.x, c.y, c.z, c.w].map((v) => Math.round(v * 255)).join(',')
    let mat = materialien.get(key)
    if (!mat) {
      mat = doc.createMaterial('m' + materialien.size).setBaseColorFactor([c.x, c.y, c.z, c.w]).setMetallicFactor(0).setRoughnessFactor(0.9).setDoubleSided(true)
      if (c.w < 0.999) mat.setAlphaMode('BLEND')
      materialien.set(key, mat)
    }
    return mat
  }

  const produkte = api.GetLineIDsWithType(m, W.IFCPRODUCT, true)
  const alle = []
  for (let i = 0; i < produkte.size(); i++) alle.push(produkte.get(i))

  const fehler = []
  const elemente = []
  let dreiecke = 0

  const lies = (liste) => {
    api.StreamMeshes(m, liste, (mesh) => {
      const id = mesh.expressID
      const teile = []
      for (let g = 0; g < mesh.geometries.size(); g++) {
        const pg = mesh.geometries.get(g)
        const geo = api.GetGeometry(m, pg.geometryExpressID)
        try {
          const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize())
          const ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize())
          if (!ix.length || !v.length) continue
          const t = pg.flatTransformation
          const n = v.length / 6
          const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3)
          for (let k = 0; k < n; k++) {
            const o = k * 6
            pos[k * 3] = t[0] * v[o] + t[4] * v[o + 1] + t[8] * v[o + 2] + t[12]
            pos[k * 3 + 1] = t[1] * v[o] + t[5] * v[o + 1] + t[9] * v[o + 2] + t[13]
            pos[k * 3 + 2] = t[2] * v[o] + t[6] * v[o + 1] + t[10] * v[o + 2] + t[14]
            const nx = t[0] * v[o + 3] + t[4] * v[o + 4] + t[8] * v[o + 5]
            const ny = t[1] * v[o + 3] + t[5] * v[o + 4] + t[9] * v[o + 5]
            const nz = t[2] * v[o + 3] + t[6] * v[o + 4] + t[10] * v[o + 5]
            const l = Math.hypot(nx, ny, nz) || 1
            nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l
          }
          teile.push({ pos, nor, idx: Uint32Array.from(ix), farbe: pg.color })
        } finally { geo.delete() }
      }
      if (teile.length) elemente.push({ id, teile })
    })
  }
  for (let s = 0; s < alle.length; s += STAPEL_GLB) {
    if (abbruch()) throw new IfcJobFehler('abgebrochen', 'Import abgebrochen.')
    const stapel = alle.slice(s, s + STAPEL_GLB)
    const vorher = elemente.length
    try { lies(stapel) } catch {
      elemente.length = vorher // halb gelesene Reste verwerfen, Elemente des Stapels einzeln wiederholen
      for (const id of stapel) {
        const v2 = elemente.length
        try { lies([id]) } catch (e) {
          elemente.length = v2
          fehler.push({ id, typ: typName(W, api, m, id), meldung: String((e && e.message) || e || 'Geometrie nicht lesbar').slice(0, 200) })
        }
      }
    }
    onFortschritt(0.5 + 0.3 * Math.min(1, (s + STAPEL_GLB) / Math.max(1, alle.length)), `Gesamtmodell wird gelesen … ${Math.min(alle.length, s + STAPEL_GLB)} von ${alle.length} Elementen`)
    await pause()
  }

  const infos = []
  for (const el of elemente) {
    const info = elementInfo(W, api, m, el.id)
    const node = doc.createNode(`${info.typ}_${el.id}`)
    const mesh = doc.createMesh(`${info.typ}_${el.id}`)
    for (const t of el.teile) {
      const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(t.pos).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(t.nor).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(t.idx).setBuffer(buffer))
        .setMaterial(material(t.farbe))
      mesh.addPrimitive(prim)
      dreiecke += t.idx.length / 3
    }
    node.setMesh(mesh).setExtras({ expressID: el.id, ifcTyp: info.typ, name: info.name, globalId: info.globalId })
    szene.addChild(node)
    infos.push({ id: el.id, ...info, dreiecke: el.teile.reduce((s, t) => s + t.idx.length / 3, 0) })
  }
  if (elemente.length === 0) throw new IfcJobFehler('keine-geometrie', 'Das Modell enthält keine lesbare Geometrie.')

  onFortschritt(0.82, 'Modell wird komprimiert (Draco) …')
  await pause()
  const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule() })
  const glb = Buffer.from(await io.writeBinary(doc))
  return { glb, infos, fehler, dreiecke, materialien: materialien.size }
}

function typName(W, api, m, id) {
  try { return api.GetNameFromTypeCode(api.GetLineType(m, id)) } catch { return 'IfcProduct' }
}

function elementInfo(W, api, m, id) {
  let name = '', globalId = ''
  try {
    const l = api.GetLine(m, id)
    name = String((l && l.Name && l.Name.value) ?? '')
    globalId = String((l && l.GlobalId && l.GlobalId.value) ?? '')
  } catch { /* Eigenschaften nicht lesbar – Element bleibt trotzdem im Modell */ }
  return { typ: typName(W, api, m, id), name, globalId }
}

// ---------------------------------------------------------------- Hauptfunktion

/**
 * Verarbeitet eine IFC-Datei vollständig. Wirft IfcJobFehler (endgueltig) bei unbrauchbaren Dateien.
 * Rückgabe: { glb: Buffer, eigenschaften: object, fehlerElemente: [...] }
 */
async function verarbeiteIfc(daten, opt) {
  const meld = (opt && opt.onFortschritt) || (() => {})
  const abbruch = (opt && opt.abbruch) || (() => false)
  const bytes = daten.length
  if (bytes === 0) throw new IfcJobFehler('kein-ifc', 'Die Datei ist leer.')
  if (bytes > IFC_MAX_BYTES) throw new IfcJobFehler('zu-gross', `Die Datei ist zu groß (${mb(bytes)} MB, Limit ${mb(IFC_MAX_BYTES)} MB).`)

  meld(0.03, 'Datei wird geprüft …')
  const rahmen = pruefeIfcRahmen(daten) || pruefeStepSyntax(daten)
  if (rahmen) throw new IfcJobFehler(rahmen.grund, rahmen.meldung)

  const W = require('web-ifc')
  const api = new W.IfcAPI()
  await api.Init()
  try { api.SetLogLevel(W.LogLevel.LOG_LEVEL_OFF) } catch { /* ältere Versionen */ }

  meld(0.08, 'IFC-Modell wird geöffnet …')
  await pause()
  let m = -1
  try {
    m = api.OpenModel(daten, { COORDINATE_TO_ORIGIN: false })
    if (typeof m !== 'number' || m < 0) throw new Error('OpenModel')
  } catch {
    throw new IfcJobFehler('kaputt', 'Die IFC-Datei konnte nicht gelesen werden (beschädigt oder ein nicht unterstütztes Schema).')
  }
  try {
    meld(0.12, 'Geschosse und Bauteile werden gelesen …')
    const roh = await leseRohmodell(W, api, m, bytes, { stapel: 40, onFortschritt: (a, t) => meld(0.12 + 0.38 * ((a - 0.3) / 0.55), t), pause, abbruch, bereich: [0.3, 0.85] })
    if (!roh.ok) throw new IfcJobFehler(roh.grund, roh.meldung)

    const gesamt = await baueGlb(W, api, m, meld, abbruch)
    const fehlerElemente = [
      ...roh.fehlerElemente.map((f) => ({ id: f.id, typ: f.art, meldung: f.meldung, stufe: 'grundriss' })),
      ...gesamt.fehler.map((f) => ({ ...f, stufe: 'gesamtmodell' })),
    ]
    const eigenschaften = {
      version: 1,
      quelle: 'ifc',
      schema: roh.roh.schema,
      dateiBytes: bytes,
      // Rohmodell: speist im Browser dieselbe Ableitung wie der Browser-Import (leiteIfcAb)
      rohmodell: verdichteRoh(roh.roh),
      elemente: gesamt.infos,
      fehlerElemente,
      statistik: {
        elemente: gesamt.infos.length,
        waende: roh.roh.gefunden.wand, decken: roh.roh.gefunden.decke, daecher: roh.roh.gefunden.dach,
        dreiecke: gesamt.dreiecke, materialien: gesamt.materialien, glbBytes: gesamt.glb.length,
      },
    }
    meld(0.9, 'Ergebnis wird gespeichert …')
    return { glb: gesamt.glb, eigenschaften, fehlerElemente }
  } finally {
    try { api.CloseModel(m) } catch { /* schon geschlossen */ }
  }
}

// ---------------------------------------------------------------- Job (Storage, project_media, ki_jobs)

async function verarbeiteCadImportJob(tenant, job, restHeaders) {
  const eingabe = (job.payload && job.payload.input) || {}
  const datei = (eingabe.files || [])[0]
  const bucket = eingabe.bucket || BUCKET_STANDARD
  if (!datei || !datei.storage_path) throw new IfcJobFehler('kein-ifc', 'Dem Auftrag fehlt die Datei.')
  const basis = tenant.supabaseUrl
  const kopf = restHeaders(tenant.serviceKey)
  const start = Date.now()

  // Fortschritt in ki_jobs.payload (höchstens alle 2 s; payload wird dabei vollständig neu geschrieben)
  let letzter = 0
  const schreibeFortschritt = async (anteil, text, erzwingen) => {
    const jetzt = Date.now()
    if (!erzwingen && jetzt - letzter < 2000) return
    letzter = jetzt
    try {
      await fetch(`${basis}/rest/v1/ki_jobs?id=eq.${job.id}`, {
        method: 'PATCH', headers: { ...kopf, Prefer: 'return=minimal' },
        body: JSON.stringify({ payload: { ...job.payload, fortschritt: { anteil: Math.round(anteil * 100) / 100, text } } }),
      })
    } catch { /* Fortschritt ist nur Anzeige */ }
  }
  const meld = (a, t) => { void schreibeFortschritt(a, t, false) }

  const markiereEndgueltig = async (fehler) => {
    await fetch(`${basis}/rest/v1/ki_jobs?id=eq.${job.id}`, {
      method: 'PATCH', headers: { ...kopf, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'error', error: String(fehler.message).slice(0, 1000), result: { grund: fehler.grund || 'fehler' }, versuche: job.versuche + 1, fertig_am: new Date().toISOString() }),
    })
    console.error(`[ki-worker] ${tenant.name}: Job ${job.id} (cad-import) abgelehnt: ${fehler.grund}: ${fehler.message}`)
  }

  try {
    await schreibeFortschritt(0.01, 'Datei wird geladen …', true)
    const dl = await fetch(`${basis}/storage/v1/object/${bucket}/${datei.storage_path}`, { headers: { apikey: tenant.serviceKey, Authorization: `Bearer ${tenant.serviceKey}` } })
    if (!dl.ok) throw new Error(`Storage-Load fehlgeschlagen: ${datei.storage_path} (${dl.status})`)
    const laenge = Number(dl.headers.get('content-length') || 0)
    if (laenge > IFC_MAX_BYTES) throw new IfcJobFehler('zu-gross', `Die Datei ist zu groß (${mb(laenge)} MB, Limit ${mb(IFC_MAX_BYTES)} MB).`)
    const daten = new Uint8Array(await dl.arrayBuffer())

    const erg = await verarbeiteIfc(daten, { onFortschritt: meld })

    // ---- Ablage
    const ordner = (datei.storage_path.replace(/\/[^/]*$/, '')) + `/cad-import/${job.id}`
    const glbPfad = `${ordner}/modell.glb`
    const jsonPfad = `${ordner}/eigenschaften.json`
    const hoch = async (pfad, inhalt, typ) => {
      const r = await fetch(`${basis}/storage/v1/object/${bucket}/${pfad}`, {
        method: 'POST', headers: { apikey: tenant.serviceKey, Authorization: `Bearer ${tenant.serviceKey}`, 'Content-Type': typ, 'x-upsert': 'true' }, body: inhalt,
      })
      if (!r.ok) throw new Error(`Storage-Upload fehlgeschlagen: ${pfad} (${r.status}) ${(await r.text()).slice(0, 200)}`)
    }
    await hoch(glbPfad, erg.glb, 'model/gltf-binary')
    await hoch(jsonPfad, Buffer.from(JSON.stringify(erg.eigenschaften)), 'application/json')

    // ---- project_media (Verknüpfung mit Projekt bzw. Sitzung) – source_format in metadata
    const projectId = eingabe.projectId || null
    const sessionId = eingabe.sessionId || null
    const meta = { bucket, kind: 'cad-import', source_format: 'ifc', job_id: job.id, quelle_datei: datei.storage_path, schema: erg.eigenschaften.schema, fehler_elemente: erg.fehlerElemente.length }
    const zeile = (pfad, name, typ, extra) => ({ project_id: projectId, session_id: projectId ? null : sessionId, storage_path: pfad, file_name: name, file_type: typ, uploaded_by: job.erstellt_von || null, metadata: { ...meta, ...extra } })
    const ins = await fetch(`${basis}/rest/v1/project_media`, {
      method: 'POST', headers: { ...kopf, Prefer: 'return=representation' },
      body: JSON.stringify([
        zeile(glbPfad, 'modell.glb', 'cad/gltf', { bytes: erg.glb.length, dreiecke: erg.eigenschaften.statistik.dreiecke }),
        zeile(jsonPfad, 'eigenschaften.json', 'cad/ifc-eigenschaften', { elemente: erg.eigenschaften.statistik.elemente }),
      ]),
    })
    const medien = ins.ok ? await ins.json() : []
    if (!ins.ok) console.error(`[ki-worker] ${tenant.name}: project_media-Insert fehlgeschlagen (${ins.status}) – Ergebnis bleibt im Job`)

    const teilweise = erg.fehlerElemente.length > 0
    const patch = await fetch(`${basis}/rest/v1/ki_jobs?id=eq.${job.id}`, {
      method: 'PATCH', headers: { ...kopf, Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'done',
        result: {
          glbPfad, eigenschaftenPfad: jsonPfad, bucket, teilweise,
          fehlerAnzahl: erg.fehlerElemente.length, statistik: erg.eigenschaften.statistik,
          mediaIds: medien.map((x) => x.id), dauerS: Math.round((Date.now() - start) / 1000),
        },
        payload: { ...job.payload, fortschritt: { anteil: 1, text: 'Fertig' } },
        versuche: job.versuche + 1, fertig_am: new Date().toISOString(),
      }),
    })
    if (!patch.ok) throw new Error(`Patch done fehlgeschlagen: ${patch.status}`)
    console.log(`[ki-worker] ${tenant.name}: Job ${job.id} (cad-import) fertig – ${erg.eigenschaften.statistik.elemente} Elemente, ${erg.fehlerElemente.length} Fehler, ${mb(erg.glb.length)} MB glb`)
  } catch (e) {
    if (e && e.endgueltig) { await markiereEndgueltig(e); return }
    throw e
  }
}

module.exports = { verarbeiteIfc, verarbeiteCadImportJob, verdichteRoh, IfcJobFehler, IFC_MAX_BYTES }
