// Startpasswort für neue Zugänge: zufällig aus dem Zufallsgenerator des Systems (nicht Math.random, das vorhersagbar ist).
// Ohne leicht verwechselbare Zeichen (0/O, 1/l/I). Rejection Sampling, damit alle Zeichen gleich wahrscheinlich sind.

const ZEICHEN = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function zufallsPasswort(laenge = 12): string {
  const grenze = 256 - (256 % ZEICHEN.length)
  let pw = ''
  while (pw.length < laenge) {
    const bytes = new Uint8Array(laenge * 2)
    crypto.getRandomValues(bytes)
    for (const b of bytes) {
      if (b < grenze && pw.length < laenge) pw += ZEICHEN[b % ZEICHEN.length]
    }
  }
  return pw
}
