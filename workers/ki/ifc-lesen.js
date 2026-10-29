// ============================================================
// SCAFFOLD OS – IFC lesen (gemeinsam für Browser-Import UND Hetzner-Worker, Phase 89)
//
// Liest aus einem geöffneten web-ifc-Modell das „Rohmodell“: Geschosse (Elevation in Metern), Zuordnung
// Bauteil → Geschoss, Wände/Decken/Dächer mit ihren Grundriss-Dreiecken. Daraus leitet lib/cad/ifc-einleser.ts
// (leiteIfcAb) Geschosse, Umriss, Gebäudeteile und Höhen ab – diese Ableitung gibt es nur einmal.
// Der Browser ruft diese Funktion mit der WASM-Instanz im Tab auf, der Worker mit der Node-Instanz.
//
// Fehlerverhalten pro Bauteil: Schlägt ein Stapel von Bauteilen fehl, wird jedes Bauteil des Stapels einzeln
// wiederholt; nur die wirklich fehlerhaften landen in `fehlerElemente` – der Rest bleibt erhalten (Teilergebnis
// statt Abbruch).
// Reines CommonJS ohne eigene Abhängigkeiten (web-ifc wird als `W` und `api` hineingegeben).
// ============================================================

const PRAEFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 0.001, MICRO: 1e-6, NANO: 1e-9 }

const fmt = (v) => String(Math.round(v * 100) / 100).replace('.', ',')

function laengenFaktor(W, api, m) {
  try {
    const si = (id) => {
      const u = api.GetLine(m, id)
      const p = u && u.Prefix && u.Prefix.value
      return typeof p === 'string' ? (PRAEFIX[p] ?? 1) : 1
    }
    const sis = api.GetLineIDsWithType(m, W.IFCSIUNIT)
    for (let i = 0; i < sis.size(); i++) {
      const u = api.GetLine(m, sis.get(i))
      if (u && u.UnitType && u.UnitType.value === 'LENGTHUNIT') return { faktor: si(sis.get(i)) }
    }
    const cb = api.GetLineIDsWithType(m, W.IFCCONVERSIONBASEDUNIT)
    for (let i = 0; i < cb.size(); i++) {
      const u = api.GetLine(m, cb.get(i))
      if (!u || !u.UnitType || u.UnitType.value !== 'LENGTHUNIT') continue
      const mw = api.GetLine(m, u.ConversionFactor.value)
      const wert = mw.ValueComponent.value
      const basis = si(mw.UnitComponent.value)
      if (typeof wert === 'number' && wert > 0) return { faktor: wert * basis, hinweis: `Längeneinheit des Modells: „${(u.Name && u.Name.value) ?? 'umgerechnet'}“ (Faktor ${fmt(wert * basis)} m).` }
    }
  } catch { /* weiter mit Vorgabe */ }
  return { faktor: 1, hinweis: 'Die Längeneinheit des Modells wurde nicht gefunden – Meter angenommen (Geschoss-Elevationen bitte prüfen).' }
}

/**
 * Liest das Rohmodell.
 * opt: { stapel = 40, onFortschritt(anteil, text), pause: async () => void, abbruch: () => boolean, bereich = [0.3, 0.85] }
 * Rückgabe: { ok: true, roh, fehlerElemente } oder { ok: false, grund, meldung } (grund: 'keine-geschosse' | 'keine-geometrie' | 'abgebrochen')
 */
async function leseRohmodell(W, api, m, dateiBytes, opt) {
  const o = opt || {}
  const STAPEL = o.stapel || 40
  const meld = o.onFortschritt || (() => {})
  const pause = o.pause || (async () => {})
  const abbruch = o.abbruch || (() => false)
  const [von, bis] = o.bereich || [0.3, 0.85]
  const hinweise = []
  const schema = (() => { try { return String(api.GetModelSchema(m)) } catch { return '' } })()

  // ---- Geschosse
  const einheit = laengenFaktor(W, api, m)
  if (einheit.hinweis) hinweise.push(einheit.hinweis)
  const ids = api.GetLineIDsWithType(m, W.IFCBUILDINGSTOREY)
  const rohGeschosse = []
  for (let i = 0; i < ids.size(); i++) {
    const l = api.GetLine(m, ids.get(i))
    const e = l && l.Elevation && l.Elevation.value
    rohGeschosse.push({ id: ids.get(i), name: String((l && l.Name && l.Name.value) ?? (l && l.LongName && l.LongName.value) ?? `Geschoss ${i + 1}`), elevation: typeof e === 'number' && Number.isFinite(e) ? e * einheit.faktor : null })
  }
  if (rohGeschosse.length === 0) {
    return { ok: false, grund: 'keine-geschosse', meldung: 'Im Modell sind keine Geschosse (IfcBuildingStorey) angelegt – daraus lassen sich keine Höhen lesen. Bitte als DXF/OBJ exportieren oder die Geschosse im BIM-Programm anlegen.' }
  }
  try { if (api.GetLineIDsWithType(m, W.IFCBUILDING).size() > 1) hinweise.push('Das Modell enthält mehrere Gebäude – alle Geschosse werden zusammen ausgewertet. Bitte prüfen, ob es ein Gebäude oder mehrere sind.') } catch { /* egal */ }

  // ---- Zuordnung Bauteil → Geschoss
  const geschossVonBauteil = new Map()
  const idxGeschoss = new Map(rohGeschosse.map((g, i) => [g.id, i]))
  const rel = api.GetLineIDsWithType(m, W.IFCRELCONTAINEDINSPATIALSTRUCTURE)
  for (let i = 0; i < rel.size(); i++) {
    const l = api.GetLine(m, rel.get(i))
    const gi = idxGeschoss.get(l && l.RelatingStructure && l.RelatingStructure.value)
    if (gi === undefined || !Array.isArray(l && l.RelatedElements)) continue
    for (const el of l.RelatedElements) if (el && typeof el.value === 'number') geschossVonBauteil.set(el.value, gi)
  }

  // ---- Bauteile sammeln
  const arten = [
    { art: 'wand', typen: [W.IFCWALL, W.IFCWALLSTANDARDCASE, W.IFCCURTAINWALL] },
    { art: 'decke', typen: [W.IFCSLAB] },
    { art: 'dach', typen: [W.IFCROOF] },
  ]
  const bauteile = new Map()
  for (const a of arten) for (const t of a.typen) {
    const v = api.GetLineIDsWithType(m, t, false)
    for (let i = 0; i < v.size(); i++) if (!bauteile.has(v.get(i))) bauteile.set(v.get(i), { id: v.get(i), art: a.art, typ: t, tris: [], yMin: Infinity, yMax: -Infinity, geschoss: geschossVonBauteil.has(v.get(i)) ? geschossVonBauteil.get(v.get(i)) : -1 })
  }
  const gefunden = { wand: 0, decke: 0, dach: 0 }
  for (const b of bauteile.values()) gefunden[b.art]++
  if (gefunden.wand + gefunden.decke === 0) {
    return { ok: false, grund: 'keine-geometrie', meldung: 'Im Modell wurden weder Wände noch Decken gefunden (IfcWall, IfcSlab). Daraus lässt sich kein Umriss lesen – bitte als DXF/OBJ exportieren.' }
  }

  // ---- Geometrie in Stapeln; bei einem Fehler wird jedes Bauteil des Stapels einzeln wiederholt
  const streame = (liste) => {
    api.StreamMeshes(m, liste, (mesh) => {
      const b = bauteile.get(mesh.expressID)
      if (!b) return
      for (let g = 0; g < mesh.geometries.size(); g++) {
        const pg = mesh.geometries.get(g)
        const geo = api.GetGeometry(m, pg.geometryExpressID)
        try {
          const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize())
          const ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize())
          const t = pg.flatTransformation
          // web-ifc liefert Y oben; die IFC-Grundrissebene ist (x, -z)
          const px = (k) => t[0] * v[k] + t[4] * v[k + 1] + t[8] * v[k + 2] + t[12]
          const py = (k) => t[1] * v[k] + t[5] * v[k + 1] + t[9] * v[k + 2] + t[13]
          const pz = (k) => t[2] * v[k] + t[6] * v[k + 1] + t[10] * v[k + 2] + t[14]
          for (let k = 0; k < v.length; k += 6) { const y = py(k); if (y < b.yMin) b.yMin = y; if (y > b.yMax) b.yMax = y }
          for (let k = 0; k + 2 < ix.length; k += 3) {
            const a = ix[k] * 6, c = ix[k + 1] * 6, d = ix[k + 2] * 6
            b.tris.push(px(a), -pz(a), px(c), -pz(c), px(d), -pz(d))
          }
        } finally { geo.delete() }
      }
    })
  }
  const alle = [...bauteile.keys()]
  const fehlerElemente = []
  for (let s = 0; s < alle.length; s += STAPEL) {
    if (abbruch()) return { ok: false, grund: 'abgebrochen', meldung: 'Import abgebrochen.' }
    const stapel = alle.slice(s, s + STAPEL)
    try { streame(stapel) } catch {
      for (const id of stapel) {
        const b = bauteile.get(id)
        // halb gelesene Reste des fehlgeschlagenen Stapels verwerfen und das Bauteil einzeln neu lesen
        b.tris = []; b.yMin = Infinity; b.yMax = -Infinity
        try { streame([id]) } catch (e) {
          b.tris = []; b.yMin = Infinity; b.yMax = -Infinity
          fehlerElemente.push({ id, art: b.art, meldung: String((e && e.message) || e || 'Geometrie nicht lesbar').slice(0, 200) })
        }
      }
    }
    meld(von + (bis - von) * Math.min(1, (s + STAPEL) / alle.length), `Geometrie wird gelesen … ${Math.min(alle.length, s + STAPEL)} von ${alle.length} Bauteilen`)
    await pause()
  }
  if (fehlerElemente.length > 0) hinweise.push(`${fehlerElemente.length} Bauteile konnten nicht gelesen werden – der Umriss kann unvollständig sein.`)

  const roh = {
    schema, dateiBytes, geschosse: rohGeschosse, gefunden, hinweise,
    bauteile: [...bauteile.values()].filter((b) => b.tris.length > 0).map((b) => ({ id: b.id, art: b.art, geschoss: b.geschoss, tris: b.tris, yMin: b.yMin, yMax: b.yMax })),
  }
  return { ok: true, roh, fehlerElemente }
}

module.exports = { leseRohmodell, laengenFaktor }
