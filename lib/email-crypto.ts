// ============================================================
// SCAFFOLD OS – Verschlüsselung für gespeicherte E-Mail-App-Passwörter
// (Phase 48)
//
// AES-256-GCM, Schlüssel aus der Umgebungsvariable EMAIL_ENCRYPTION_KEY
// (32 zufällige Bytes, als Hex oder Base64 hinterlegt). Isoliert
// getestet: verschlüsseln → entschlüsseln liefert exakt den
// Originaltext zurück.
// ============================================================

import crypto from 'crypto'

function ladeSchluessel(): Buffer {
  const roh = process.env.EMAIL_ENCRYPTION_KEY
  if (!roh) throw new Error('EMAIL_ENCRYPTION_KEY fehlt (Vercel → Environment Variables). Mit z.B. `openssl rand -hex 32` erzeugen.')
  const buf = roh.length === 64 ? Buffer.from(roh, 'hex') : Buffer.from(roh, 'base64')
  if (buf.length !== 32) throw new Error('EMAIL_ENCRYPTION_KEY muss 32 Bytes lang sein (64 Hex-Zeichen oder entsprechend Base64).')
  return buf
}

export function verschluesseln(text: string): string {
  const key = ladeSchluessel()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function entschluesseln(payload: string): string {
  const key = ladeSchluessel()
  const buf = Buffer.from(payload, 'base64')
  const iv = buf.subarray(0, 16)
  const tag = buf.subarray(16, 32)
  const enc = buf.subarray(32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
