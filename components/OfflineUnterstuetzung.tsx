'use client'
// ============================================================
// SCAFFOLD OS – Offline-Unterstützung: meldet den Service Worker an (nur Produktion) und zeigt eine Leiste, solange kein Netz da ist.
// Die Leiste sagt ehrlich, was geht: CAD-Rechnen ja, Server-Funktionen (Speichern im Projekt, KI, Mail) erst wieder mit Netz.
// ============================================================
import { useEffect, useSyncExternalStore } from 'react'
import { speichereEntwurf } from '@/lib/aufmass-entwurf'
import { speichereSchrittAuto } from '@/lib/aufmass-autosave'
import { anzahlAusstehend, leseAusstehend, sendeAusstehend, NACHSENDEN_EREIGNIS } from '@/lib/offline/nachsenden'
import type { AutosaveSchritt } from '@/lib/aufmass-autosave-regeln'

function abonniere(rueckruf: () => void): () => void {
  window.addEventListener('online', rueckruf)
  window.addEventListener('offline', rueckruf)
  return () => { window.removeEventListener('online', rueckruf); window.removeEventListener('offline', rueckruf) }
}

function abonniereOffen(rueckruf: () => void): () => void {
  window.addEventListener(NACHSENDEN_EREIGNIS, rueckruf)
  return () => window.removeEventListener(NACHSENDEN_EREIGNIS, rueckruf)
}
const sendeOffenes = () => sendeAusstehend({
  entwurf: () => speichereEntwurf(),
  schritt: (id, schritt, form) => speichereSchrittAuto(id, schritt as AutosaveSchritt, form),
})

export default function OfflineUnterstuetzung() {
  // Auf dem Server (und im ersten Render) gilt „online“, damit sich nichts verschiebt
  const offline = useSyncExternalStore(abonniere, () => !navigator.onLine, () => false)

  // Zahl der noch nicht gesendeten Auto-Speicherungen (als Text, damit der Vergleich stabil bleibt)
  const offen = useSyncExternalStore(abonniereOffen, () => String(anzahlAusstehend(leseAusstehend())), () => '0')

  // Beim Start und sobald wieder Netz da ist: Offenes nachsenden
  useEffect(() => {
    const los = () => { if (navigator.onLine) void sendeOffenes() }
    los()
    window.addEventListener('online', los)
    return () => window.removeEventListener('online', los)
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => { /* ohne Worker läuft alles wie bisher */ })
    }
  }, [])

  if (!offline && offen === '0') return null
  if (!offline) {
    return (
      <div role='status' className='fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] rounded-xl bg-[#1d1d1f] text-white text-xs px-3 py-2 shadow-lg'>
        Änderungen werden gesendet …
      </div>
    )
  }
  return (
    <div role='status' className='fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] rounded-xl bg-[#1d1d1f] text-white text-xs px-3 py-2 shadow-lg'>
      Kein Netz – CAD und Berechnungen laufen weiter. Auto-Speichern im Aufmaß wird nachgesendet; endgültiges Speichern, KI und E-Mail gehen erst wieder mit Verbindung.
    </div>
  )
}
