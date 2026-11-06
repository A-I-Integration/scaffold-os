'use client'
// ============================================================
// SCAFFOLD OS – Offline-Unterstützung: meldet den Service Worker an (nur Produktion) und zeigt eine Leiste, solange kein Netz da ist.
// Die Leiste sagt ehrlich, was geht: CAD-Rechnen ja, Server-Funktionen (Speichern im Projekt, KI, Mail) erst wieder mit Netz.
// ============================================================
import { useEffect, useSyncExternalStore } from 'react'

function abonniere(rueckruf: () => void): () => void {
  window.addEventListener('online', rueckruf)
  window.addEventListener('offline', rueckruf)
  return () => { window.removeEventListener('online', rueckruf); window.removeEventListener('offline', rueckruf) }
}

export default function OfflineUnterstuetzung() {
  // Auf dem Server (und im ersten Render) gilt „online“, damit sich nichts verschiebt
  const offline = useSyncExternalStore(abonniere, () => !navigator.onLine, () => false)

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => { /* ohne Worker läuft alles wie bisher */ })
    }
  }, [])

  if (!offline) return null
  return (
    <div role='status' className='fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] rounded-xl bg-[#1d1d1f] text-white text-xs px-3 py-2 shadow-lg'>
      Kein Netz – CAD und Berechnungen laufen weiter. Speichern im Projekt, KI und E-Mail gehen erst wieder mit Verbindung.
    </div>
  )
}
