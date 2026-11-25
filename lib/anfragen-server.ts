// ============================================================
// SCAFFOLD OS – Externe Anfragen: Server-Helfer (Datenbank per REST, Speicher, Benachrichtigung)
// Reihenfolge-Regel: Erst wird die Anfrage gespeichert, dann benachrichtigt. Ein Mailfehler macht nie die Anfrage kaputt.
// ============================================================

import { STATUS_LABEL } from '@/lib/anfragen'

export const BUCKET = 'anfragen'
export const MIGRATION = 'Die Datenbank-Erweiterung für externe Anfragen fehlt noch (supabase/phase-144-externe-anfragen.sql im Supabase SQL-Editor ausführen).'

export const sbUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const sbKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!
export const sbHeaders = () => ({ 'Content-Type': 'application/json', apikey: sbKey(), Authorization: `Bearer ${sbKey()}` })
export const tabelleFehlt = (t: string) => /externe_anfragen|anfrage_zugaenge|PGRST205|42P01|does not exist|schema cache/i.test(t)

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export async function schreibeProtokoll(anfrageId: string, e: { benutzerId?: string | null; benutzerName?: string | null; aktion: string; von?: string | null; nach?: string | null; text?: string | null }) {
  try {
    await fetch(`${sbUrl()}/rest/v1/externe_anfragen_protokoll`, {
      method: 'POST', headers: sbHeaders(),
      body: JSON.stringify({ anfrage_id: anfrageId, benutzer_id: e.benutzerId || null, benutzer_name: e.benutzerName || null, aktion: e.aktion, von_status: e.von || null, nach_status: e.nach || null, text: e.text || null }),
    })
  } catch (err) { console.error('[anfragen] Protokoll', err) }
}

export async function benutzerName(userId: string): Promise<string> {
  try {
    const r = await fetch(`${sbUrl()}/rest/v1/profiles?id=eq.${userId}&select=full_name,email`, { headers: sbHeaders() })
    const p = r.ok ? (await r.json())?.[0] : null
    return p?.full_name || p?.email || 'Büro'
  } catch { return 'Büro' }
}

// ─── Speicher (privat) ───
export async function signierteUploadUrl(pfad: string): Promise<string | null> {
  const r = await fetch(`${sbUrl()}/storage/v1/object/upload/sign/${BUCKET}/${pfad}`, { method: 'POST', headers: sbHeaders(), body: '{}' })
  if (!r.ok) return null
  const j = await r.json().catch(() => null)
  return j?.url ? `${sbUrl()}/storage/v1${j.url}` : null
}

export async function signierteDownloadUrl(pfad: string, sekunden = 600): Promise<string | null> {
  const r = await fetch(`${sbUrl()}/storage/v1/object/sign/${BUCKET}/${pfad}`, { method: 'POST', headers: sbHeaders(), body: JSON.stringify({ expiresIn: sekunden }) })
  if (!r.ok) return null
  const j = await r.json().catch(() => null)
  return j?.signedURL ? `${sbUrl()}/storage/v1${j.signedURL}` : null
}

/** Größe und erste Bytes der hochgeladenen Datei (Range-Abruf mit Service-Schlüssel). */
export async function leseDateikopf(pfad: string): Promise<{ groesse: number; kopf: Uint8Array } | null> {
  const r = await fetch(`${sbUrl()}/storage/v1/object/${BUCKET}/${pfad}`, { headers: { apikey: sbKey(), Authorization: `Bearer ${sbKey()}`, Range: 'bytes=0-15' } })
  if (!r.ok) return null
  const kopf = new Uint8Array(await r.arrayBuffer()).slice(0, 16)
  const cr = /\/(\d+)$/.exec(r.headers.get('content-range') || '')
  const groesse = cr ? Number(cr[1]) : Number(r.headers.get('content-length') || 0)
  return { groesse, kopf }
}

export async function loescheDatei(pfad: string) {
  try { await fetch(`${sbUrl()}/storage/v1/object/${BUCKET}/${pfad}`, { method: 'DELETE', headers: sbHeaders() }) } catch { /* best effort */ }
}

// ─── Benachrichtigung ans Büro (vorhandener Mailversand über Resend) ───
export async function benachrichtige(anfrageId: string): Promise<{ ok: boolean; fehler?: string }> {
  let versuche = 0
  try {
    const ar = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${anfrageId}&select=*`, { headers: sbHeaders() })
    const a = ar.ok ? (await ar.json())?.[0] : null
    if (!a) return { ok: false, fehler: 'Anfrage nicht gefunden.' }
    versuche = Number(a.benachrichtigung_versuche || 0) + 1
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('E-Mail-Versand ist nicht eingerichtet (RESEND_API_KEY fehlt).')
    const pr = await fetch(`${sbUrl()}/rest/v1/profiles?role=in.(admin,disponent)&select=email`, { headers: sbHeaders() })
    if (!pr.ok) throw new Error('Empfänger konnten nicht geladen werden.')
    const empfaenger = ((await pr.json()) as { email?: string }[]).map((p) => p.email).filter((x): x is string => !!x)
    if (empfaenger.length === 0) throw new Error('Keine Empfänger (Admin/Disposition ohne E-Mail).')
    const link = `${process.env.NEXT_PUBLIC_APP_URL || ''}/externe-anfragen`
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: process.env.MAIL_FROM || 'SCAFFOLD OS <onboarding@resend.dev>',
      to: empfaenger,
      subject: `[SCAFFOLD OS] Neue Kundenanfrage ${a.nummer || ''}: ${a.absender_firma || a.absender_name}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#f59e0b;margin-bottom:4px">SCAFFOLD OS</h2><h3 style="margin-top:0">Neue Kundenanfrage ${esc(a.nummer || '')}</h3>
        <div style="background:#f8fafc;padding:16px 20px;border-radius:8px">
          <p style="margin:0 0 8px"><strong>Von:</strong> ${esc(a.absender_name)}${a.absender_firma ? ` (${esc(a.absender_firma)})` : ''}</p>
          ${a.baustelle_adresse ? `<p style="margin:0 0 8px"><strong>Baustelle:</strong> ${esc(a.baustelle_adresse)}</p>` : ''}
          ${a.beschreibung ? `<p style="margin:0 0 8px;white-space:pre-wrap">${esc(String(a.beschreibung).slice(0, 600))}</p>` : ''}
          <p style="margin:16px 0 0"><a href="${link}" style="background:#f59e0b;color:#0f172a;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold">Anfrage öffnen</a></p>
        </div></div>`,
    })
    if (error) throw new Error(error.message)
    await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${anfrageId}`, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ benachrichtigt_am: new Date().toISOString(), benachrichtigung_fehler: null, benachrichtigung_versuche: versuche }) })
    return { ok: true }
  } catch (err: any) {
    const text = String(err?.message || err).slice(0, 300)
    console.error('[anfragen] Benachrichtigung fehlgeschlagen', text)
    try { await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${anfrageId}`, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ benachrichtigung_fehler: text, benachrichtigung_versuche: versuche || 1 }) }) } catch { /* Anfrage bleibt trotzdem gespeichert */ }
    return { ok: false, fehler: text }
  }
}

export { STATUS_LABEL }
