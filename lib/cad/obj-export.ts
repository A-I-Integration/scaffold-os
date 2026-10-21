// ============================================================
// SCAFFOLD OS – Dreiecke als OBJ-Text (für die Fehlersuche: „Modell speichern“)
//
// Schreibt die Dreiecks-Suppe (x,y,z je Ecke) als einfache OBJ-Datei; gleiche Eckpunkte werden zusammengelegt,
// damit die Datei klein bleibt. Koordinaten bleiben unverändert (Einheit und „oben“ der Quelle).
// ============================================================
export function dreieckeZuObj(d: Float32Array, kopf = ''): string {
  const index = new Map<string, number>()
  const v: string[] = []
  const f: string[] = []
  for (let t = 0; t + 8 < d.length; t += 9) {
    const ids: number[] = []
    for (let k = 0; k < 3; k++) {
      const key = `${d[t + k * 3]} ${d[t + k * 3 + 1]} ${d[t + k * 3 + 2]}`
      let i = index.get(key)
      if (i === undefined) { i = v.length + 1; index.set(key, i); v.push(`v ${key}`) }
      ids.push(i)
    }
    f.push(`f ${ids[0]} ${ids[1]} ${ids[2]}`)
  }
  return (kopf ? `# ${kopf}\n` : '') + v.join('\n') + '\n' + f.join('\n') + '\n'
}
