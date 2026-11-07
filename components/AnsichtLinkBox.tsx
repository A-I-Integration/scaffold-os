'use client'

import { useCallback, useState } from 'react'
import QRCode from 'qrcode'

// 3D-Link (nur lesend) für ein CAD-Projekt: anlegen, kopieren, widerrufen.
// Der Link zeigt nur Modell, Kennzahlen und Stückliste OHNE Preise.

type Link = { id: string; token: string; label: string | null; created_at: string; expires_at: string; revoked_at: string | null; status: 'aktiv' | 'abgelaufen' | 'widerrufen' }

const STATUS_STIL: Record<Link['status'], string> = {
  aktiv: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40',
  abgelaufen: 'bg-black/5 text-[#86868b] border-black/10',
  widerrufen: 'bg-red-500/10 text-red-700 border-red-500/30',
}

export default function AnsichtLinkBox({ projectId }: { projectId: string }) {
  const [offen, setOffen] = useState(false)
  const [links, setLinks] = useState<Link[]>([])
  const [tage, setTage] = useState('30')
  const [label, setLabel] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [qr, setQr] = useState<{ token: string; bild: string } | null>(null)

  const laden = useCallback(async () => {
    try {
      const j = await fetch(`/api/ansicht-link?project_id=${projectId}`).then((r) => r.json())
      if (j.success) setLinks(j.links)
      else setMeldung(j.error || 'Links konnten nicht geladen werden.')
    } catch { setMeldung('Links konnten nicht geladen werden.') }
  }, [projectId])

  function umschalten() {
    const neu = !offen
    setOffen(neu)
    if (neu) laden()
  }

  const adresse = (token: string) => `${window.location.origin}/ansicht/${token}`

  async function anlegen() {
    setLaeuft(true); setMeldung(null)
    try {
      const j = await fetch('/api/ansicht-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, tage: Number(tage), label: label.trim() || undefined }),
      }).then((r) => r.json())
      if (!j.success) throw new Error(j.error)
      setLabel('')
      try { await navigator.clipboard.writeText(adresse(j.link.token)); setMeldung('Link angelegt und in die Zwischenablage kopiert.') } catch { setMeldung('Link angelegt.') }
      laden()
    } catch (e) { setMeldung('❌ ' + (e instanceof Error ? e.message : 'Link konnte nicht angelegt werden.')) }
    setLaeuft(false)
  }

  async function widerrufen(id: string) {
    if (!window.confirm('Diesen 3D-Link widerrufen? Wer ihn hat, kann das Projekt dann nicht mehr ansehen.')) return
    try {
      const j = await fetch(`/api/ansicht-link?id=${id}`, { method: 'DELETE' }).then((r) => r.json())
      if (!j.success) throw new Error(j.error)
      laden()
    } catch (e) { setMeldung('❌ ' + (e instanceof Error ? e.message : 'Widerruf fehlgeschlagen.')) }
  }

  async function qrZeigen(token: string) {
    if (qr?.token === token) { setQr(null); return }
    try { setQr({ token, bild: await QRCode.toDataURL(adresse(token), { width: 320, margin: 2, errorCorrectionLevel: 'M' }) }) } catch { setMeldung('❌ QR-Code konnte nicht erzeugt werden.') }
  }

  function qrDrucken(l: Link) {
    if (!qr) return
    const w = window.open('', '_blank', 'width=480,height=640')
    if (!w) { setMeldung('Pop-up wurde blockiert: bitte erlauben oder den QR-Code mit Rechtsklick speichern.'); return }
    const titel = (l.label || 'Gerüst 3D-Ansicht').replace(/[<>&"]/g, '')
    w.document.write(`<!doctype html><title>QR-Code</title><body style="font-family:sans-serif;text-align:center;margin:24px"><h2>${titel}</h2><img src="${qr.bild}" width="320" height="320"><p>Mit der Handy-Kamera scannen: 3D-Ansicht des Gerüsts</p><p style="font-size:12px;color:#666">gültig bis ${new Date(l.expires_at).toLocaleDateString('de-DE')}</p><script>window.onload=function(){window.print()}<\/script></body>`)
    w.document.close()
  }

  async function kopieren(token: string) {
    try { await navigator.clipboard.writeText(adresse(token)); setMeldung('Link kopiert.') } catch { setMeldung(adresse(token)) }
  }

  return (
    <div className="px-5 py-3 border-t border-black/5">
      <button onClick={umschalten} className="text-xs font-medium text-[#e8590c] hover:underline">
        {offen ? '▾' : '▸'} 3D-Link teilen (nur Ansicht, ohne Preise)
      </button>
      {offen && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-[#86868b]">Für Statiker, Kunden oder Monteure. Der Link zeigt 3D-Modell, Kennzahlen und Stückliste ohne Preise und lässt sich jederzeit widerrufen.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Für wen? (optional)" className="px-2 py-1.5 border rounded-lg text-xs" />
            <select value={tage} onChange={(e) => setTage(e.target.value)} className="px-2 py-1.5 border rounded-lg text-xs">
              <option value="7">7 Tage</option><option value="30">30 Tage</option><option value="90">90 Tage</option><option value="365">1 Jahr</option>
            </select>
            <button onClick={anlegen} disabled={laeuft} className="text-xs px-3 py-1.5 rounded-lg bg-[#e8590c] text-white font-medium disabled:opacity-50">{laeuft ? 'Wird angelegt…' : 'Link erstellen'}</button>
          </div>
          {meldung && <p className="text-[11px] text-[#424245] break-all">{meldung}</p>}
          {links.length > 0 && (
            <ul className="divide-y divide-black/5">
              {links.map((l) => (
                <li key={l.id} className="py-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STIL[l.status]}`}>{l.status === 'aktiv' ? 'Aktiv' : l.status === 'abgelaufen' ? 'Abgelaufen' : 'Widerrufen'}</span>
                  <span className="text-[#424245]">{l.label || 'ohne Name'}</span>
                  <span className="text-[#86868b]">bis {new Date(l.expires_at).toLocaleDateString('de-DE')}</span>
                  {l.status === 'aktiv' && (
                    <span className="ml-auto flex gap-3">
                      <button onClick={() => kopieren(l.token)} className="text-[#e8590c] hover:underline">Link kopieren</button>
                      <button onClick={() => qrZeigen(l.token)} className="text-[#e8590c] hover:underline">{qr?.token === l.token ? 'QR-Code schließen' : 'QR-Code'}</button>
                      <button onClick={() => widerrufen(l.id)} className="text-red-600 hover:underline">Widerrufen</button>
                    </span>
                  )}
                  {qr?.token === l.token && (
                    <div className="basis-full flex items-center gap-3 pt-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr.bild} alt="QR-Code zum 3D-Link" width={160} height={160} className="border border-black/10 rounded-lg" />
                      <div className="space-y-1">
                        <p className="text-[11px] text-[#86868b]">Mit der Handy-Kamera scannen, dann öffnet sich die 3D-Ansicht. Für die Baustelle ausdrucken oder ins Montageblatt legen.</p>
                        <button onClick={() => qrDrucken(l)} className="text-[#e8590c] hover:underline">QR-Code drucken</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
