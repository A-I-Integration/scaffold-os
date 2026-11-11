'use client'
// ============================================================
// SCAFFOLD OS – Offline-Unterstützung: meldet den Service Worker an (nur Produktion) und zeigt eine Leiste, solange kein Netz da ist.
// Die Leiste sagt ehrlich, was geht: CAD-Rechnen ja, Server-Funktionen (Speichern im Projekt, KI, Mail) erst wieder mit Netz.
// ============================================================
import { useEffect, useState, useSyncExternalStore } from 'react'
import { speichereEntwurf } from '@/lib/aufmass-entwurf'
import { speichereSchrittAuto } from '@/lib/aufmass-autosave'
import { anzahlAusstehend, leseAusstehend, sendeAusstehend, NACHSENDEN_EREIGNIS } from '@/lib/offline/nachsenden'
import { sendeBefehl } from '@/lib/offline/befehle-senden'
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
  befehl: (b) => sendeBefehl(b),
})

export default function OfflineUnterstuetzung() {
  // Auf dem Server (und im ersten Render) gilt „online“, damit sich nichts verschiebt
  const offline = useSyncExternalStore(abonniere, () => !navigator.onLine, () => false)

  // Zahl der noch nicht gesendeten Auto-Speicherungen (als Text, damit der Vergleich stabil bleibt)
  const offen = useSyncExternalStore(abonniereOffen, () => String(anzahlAusstehend(leseAusstehend())), () => '0')

  // Der Service Worker meldet, wenn statt Serverdaten eine gespeicherte Kopie gezeigt wird (ältester Stand zählt)
  const [kopieStand, setKopieStand] = useState<number | null>(null)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const bei = (e: MessageEvent) => {
      if (e.data?.typ !== 'offline-kopie') return
      const t = Number(e.data.stand) || 0
      setKopieStand((alt) => (alt === null ? t : Math.min(alt, t || alt)))
    }
    navigator.serviceWorker.addEventListener('message', bei)
    return () => navigator.serviceWorker.removeEventListener('message', bei)
  }, [])
  // Sobald wieder Netz da ist, gilt der Hinweis nicht mehr
  useEffect(() => {
    const online = () => setKopieStand(null)
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [])
  const kopieText = kopieStand === null ? '' : ` Projektdaten stammen vom gespeicherten Stand${kopieStand ? ` (${new Date(kopieStand).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : ''} – Änderungen anderer Geräte fehlen.`

  // Was der Server endgültig abgelehnt hat (z. B. Nachtrag existiert nicht mehr): sichtbar melden, damit nichts still verschwindet
  const [abgelehnt, setAbgelehnt] = useState<string[]>([])

  // Beim Start und sobald wieder Netz da ist: Offenes nachsenden
  useEffect(() => {
    const los = () => {
      if (!navigator.onLine) return
      void sendeOffenes().then((r) => { if (r.verworfen.length) setAbgelehnt((a) => [...a, ...r.verworfen.map((v) => `${v.titel}: ${v.grund}`)]) })
    }
    los()
    window.addEventListener('online', los)
    return () => window.removeEventListener('online', los)
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => { /* ohne Worker läuft alles wie bisher */ })
    }
  }, [])

  const abgelehntBox = abgelehnt.length > 0 && (
    <div role='alert' className='fixed bottom-14 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] rounded-xl bg-[#b42318] text-white text-xs px-3 py-2 shadow-lg'>
      <p className='font-semibold'>Diese Änderungen konnten nicht übernommen werden:</p>
      {abgelehnt.map((t, i) => <p key={i}>• {t}</p>)}
      <button type='button' className='mt-1 underline' onClick={() => setAbgelehnt([])}>Verstanden</button>
    </div>
  )
  if (!offline && offen === '0') return abgelehntBox || null
  if (!offline) {
    return (
      <>
        {abgelehntBox}
        <div role='status' className='fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] rounded-xl bg-[#1d1d1f] text-white text-xs px-3 py-2 shadow-lg'>
          {offen} Änderung{offen === '1' ? '' : 'en'} wird{offen === '1' ? '' : 'en'} gesendet …
        </div>
      </>
    )
  }
  return (
    <>
      {abgelehntBox}
      <div role='status' className='fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] rounded-xl bg-[#1d1d1f] text-white text-xs px-3 py-2 shadow-lg'>
        Kein Netz – CAD und Berechnungen laufen weiter. Auto-Speichern, Speichern in Schritt 6, Nachträge (ohne Fotos) und Materialabschnitte werden gemerkt{offen !== '0' ? ` (${offen} offen)` : ''} und mit Verbindung gesendet; KI und E-Mail gehen erst wieder mit Netz.{kopieText}
      </div>
    </>
  )
}
