// ============================================================
// SCAFFOLD OS – minimaler ZIP-Schreiber (ohne Kompression, ohne Zusatzpaket)
//
// Reicht für das Statiker-Paket: wenige Dateien, UTF-8-Dateinamen,
// Methode "stored" (0). Wird von jedem Entpacker geöffnet.
// ============================================================

export interface ZipDatei {
  name: string
  data: Uint8Array | string
}

let crcTabelle: Uint32Array | null = null

export function crc32(daten: Uint8Array): number {
  if (!crcTabelle) {
    crcTabelle = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTabelle[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < daten.length; i++) c = crcTabelle[(c ^ daten[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function alsBytes(d: Uint8Array | string): Uint8Array {
  return typeof d === 'string' ? new TextEncoder().encode(d) : d
}

/** Datum/Zeit im DOS-Format (ZIP). */
function dosZeit(d: Date): { zeit: number; datum: number } {
  const jahr = Math.max(1980, d.getFullYear())
  return {
    zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    datum: ((jahr - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/** Erzeugt ein ZIP-Archiv aus den Dateien (Reihenfolge bleibt erhalten). */
export function erzeugeZip(dateien: ZipDatei[], zeitpunkt: Date = new Date()): Uint8Array {
  const { zeit, datum } = dosZeit(zeitpunkt)
  const teile: Uint8Array[] = []
  const zentral: Uint8Array[] = []
  let offset = 0

  for (const datei of dateien) {
    const name = new TextEncoder().encode(datei.name)
    const bytes = alsBytes(datei.data)
    const crc = crc32(bytes)

    const lokal = new Uint8Array(30 + name.length)
    const lv = new DataView(lokal.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // Version
    lv.setUint16(6, 0x0800, true) // Bit 11: Dateiname ist UTF-8
    lv.setUint16(8, 0, true) // stored
    lv.setUint16(10, zeit, true)
    lv.setUint16(12, datum, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, bytes.length, true)
    lv.setUint32(22, bytes.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    lokal.set(name, 30)
    teile.push(lokal, bytes)

    const z = new Uint8Array(46 + name.length)
    const zv = new DataView(z.buffer)
    zv.setUint32(0, 0x02014b50, true)
    zv.setUint16(4, 20, true)
    zv.setUint16(6, 20, true)
    zv.setUint16(8, 0x0800, true)
    zv.setUint16(10, 0, true)
    zv.setUint16(12, zeit, true)
    zv.setUint16(14, datum, true)
    zv.setUint32(16, crc, true)
    zv.setUint32(20, bytes.length, true)
    zv.setUint32(24, bytes.length, true)
    zv.setUint16(28, name.length, true)
    zv.setUint32(42, offset, true)
    z.set(name, 46)
    zentral.push(z)

    offset += lokal.length + bytes.length
  }

  const zentralGroesse = zentral.reduce((s, z) => s + z.length, 0)
  const ende = new Uint8Array(22)
  const ev = new DataView(ende.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, dateien.length, true)
  ev.setUint16(10, dateien.length, true)
  ev.setUint32(12, zentralGroesse, true)
  ev.setUint32(16, offset, true)

  const alle = [...teile, ...zentral, ende]
  const gesamt = new Uint8Array(alle.reduce((s, t) => s + t.length, 0))
  let pos = 0
  for (const t of alle) { gesamt.set(t, pos); pos += t.length }
  return gesamt
}
