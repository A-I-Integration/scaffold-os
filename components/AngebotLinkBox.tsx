'use client'

import { useCallback, useEffect, useState } from 'react'

// Angebots-Link (Online-Ansicht/Annahme für den Kunden): Status sehen, widerrufen, bei Bedarf neu bereitstellen.

type Link = { token: string; status: 'aktiv' | 'abgelaufen' | 'widerrufen'; expires_at: string | null }

export default function AngebotLinkBox({ projectId }: { projectId: string }) {
  const [link, setLink] = useState<Link | null | undefined>(undefined)
  const [tage, setTage] = useState(60)
  const [meldung, setMeldung] = useState<string | null>(null)

  const laden = useCallback(async () => {
    try {
      const j = await fetch(`/api/access-token?project_id=${projectId}`).then((r) => r.json())
      if (j.success) { setLink(j.link); setTage(j.tage ?? 60) } else setMeldung(j.error || 'Link konnte nicht geladen werden.')
    } catch { setMeldung('Link konnte nicht geladen werden.') }
  }, [projectId])
  useEffect(() => { Promise.resolve().then(laden) }, [laden])

  async function widerrufen() {
    if (!window.confirm('Angebots-Link widerrufen? Der Kunde kann das Angebot online dann nicht mehr ansehen oder annehmen.')) return
    const j = await fetch(`/api/access-token?project_id=${projectId}`, { method: 'DELETE' }).then((r) => r.json()).catch(() => null)
    setMeldung(j?.success ? 'Link widerrufen.' : j?.error || 'Widerruf fehlgeschlagen.')
    laden()
  }
  async function bereitstellen() {
    const j = await fetch('/api/access-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId }) }).then((r) => r.json()).catch(() => null)
    if (j?.success) {
      try { await navigator.clipboard.writeText(`${window.location.origin}/angebot/${j.token}`); setMeldung(`Link gültig für ${tage} Tage, in die Zwischenablage kopiert.`) } catch { setMeldung(`Link gültig für ${tage} Tage.`) }
    } else setMeldung(j?.error || 'Link konnte nicht bereitgestellt werden.')
    laden()
  }

  if (link === undefined) return null
  const farbe = link?.status === 'aktiv' ? 'text-emerald-700' : link?.status === 'widerrufen' ? 'text-red-700' : 'text-[#86868b]'
  return (
    <div className="px-5 py-3 border-t border-black/5 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">Angebots-Link</span>
        {link ? (
          <span className={farbe}>
            {link.status === 'aktiv' ? (link.expires_at ? `gültig bis ${new Date(link.expires_at).toLocaleDateString('de-DE')}` : 'gültig (ohne Ablaufdatum)') : link.status}
          </span>
        ) : <span className="text-[#86868b]">noch keiner versendet</span>}
        <span className="flex-1" />
        <button onClick={bereitstellen} className="text-[#e8590c] hover:underline">{link ? (link.status === 'aktiv' ? `Verlängern (${tage} Tage)` : 'Neu bereitstellen') : 'Anlegen'}</button>
        {link && link.status !== 'widerrufen' && <button onClick={widerrufen} className="text-red-600 hover:underline">Widerrufen</button>}
      </div>
      {meldung && <p className="mt-1 text-xs text-[#86868b]">{meldung}</p>}
    </div>
  )
}
