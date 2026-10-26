// Server-seitige Helfer für den privaten Bucket (Service-Rolle). Nur in API-Routen verwenden.
import { ANHANG_BUCKET } from '@/lib/rechnung-anhang'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const kopf = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }
const pfad = (p: string) => p.split('/').map(encodeURIComponent).join('/')

/** Token für einen direkten Browser-Upload (umgeht das 4,5-MB-Limit der Serverfunktionen). */
export async function uploadToken(storagePath: string): Promise<string> {
  const r = await fetch(`${url}/storage/v1/object/upload/sign/${ANHANG_BUCKET}/${pfad(storagePath)}`, { method: 'POST', headers: kopf, body: '{}' })
  if (!r.ok) throw new Error(await r.text())
  const token = new URL((await r.json()).url, url).searchParams.get('token')
  if (!token) throw new Error('Kein Upload-Token erhalten')
  return token
}

/** Kurzlebiger Download-Link (60 s), erzwingt „Speichern unter“ mit dem Originalnamen. */
export async function downloadLink(storagePath: string, dateiname: string): Promise<string> {
  const r = await fetch(`${url}/storage/v1/object/sign/${ANHANG_BUCKET}/${pfad(storagePath)}`, { method: 'POST', headers: kopf, body: JSON.stringify({ expiresIn: 60, download: dateiname }) })
  if (!r.ok) throw new Error(await r.text())
  return `${url}/storage/v1${(await r.json()).signedURL}`
}

export async function dateiLoeschen(storagePath: string): Promise<void> {
  await fetch(`${url}/storage/v1/object/${ANHANG_BUCKET}/${pfad(storagePath)}`, { method: 'DELETE', headers: kopf }).catch(() => undefined)
}

export async function dateiVorhanden(storagePath: string): Promise<boolean> {
  const r = await fetch(`${url}/storage/v1/object/info/${ANHANG_BUCKET}/${pfad(storagePath)}`, { headers: kopf })
  return r.ok
}
