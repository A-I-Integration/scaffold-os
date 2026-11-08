'use client'

import { createElement, useEffect, useRef, useState } from 'react'
import type { Object3D } from 'three'

// ============================================================
// SCAFFOLD OS – Gerüst im Kamerabild (AR), Versuchsfunktion
//
// Das Gerüstmodell wird im Browser als GLB exportiert und über das Web-Bauteil <model-viewer> (Google, vom CDN
// geladen) angezeigt. Auf Android öffnet es AR über WebXR oder Scene Viewer, auf dem iPhone über Quick Look.
// Maßstab 1:1 (Meter). Ob AR startet, hängt vom Gerät ab; model-viewer zeigt den AR-Knopf nur, wenn es geht.
// ============================================================

const MV_URL = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js'

function ladeModelViewer(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.customElements?.get('model-viewer')) return Promise.resolve()
  return new Promise((ok, fehler) => {
    const s = document.createElement('script')
    s.type = 'module'; s.src = MV_URL
    s.onload = () => ok(); s.onerror = () => fehler(new Error('AR-Bauteil konnte nicht geladen werden (Internetverbindung?).'))
    document.head.appendChild(s)
  })
}

export default function ArAnsicht({ inhalt, name }: { inhalt: Object3D | null; name: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const alt = useRef<string | null>(null)
  useEffect(() => () => { if (alt.current) URL.revokeObjectURL(alt.current) }, [])

  async function starten() {
    if (!inhalt) { setFehler('Das 3D-Modell ist noch nicht geladen.'); return }
    setLaeuft(true); setFehler(null)
    try {
      const [{ GLTFExporter }] = await Promise.all([import('three/examples/jsm/exporters/GLTFExporter.js'), ladeModelViewer()])
      const glb = await new Promise<ArrayBuffer>((ok, nein) => {
        new GLTFExporter().parse(inhalt, (r) => (r instanceof ArrayBuffer ? ok(r) : nein(new Error('Unerwartetes Exportformat'))), (e) => nein(e instanceof Error ? e : new Error(String(e))), { binary: true, onlyVisible: true })
      })
      if (alt.current) URL.revokeObjectURL(alt.current)
      alt.current = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }))
      setUrl(alt.current)
    } catch (e) { setFehler(e instanceof Error ? e.message : 'AR-Ansicht konnte nicht vorbereitet werden.') }
    setLaeuft(false)
  }

  return (
    <div className='px-3 pb-3'>
      <button onClick={starten} disabled={laeuft || !inhalt} className='text-xs px-3 py-1.5 rounded-lg border border-black/10 bg-white text-[#424245] disabled:opacity-50'>
        {laeuft ? 'Wird vorbereitet…' : '📱 Gerüst in AR ansehen (Test)'}
      </button>
      {fehler && <p className='mt-1 text-[11px] text-red-700'>{fehler}</p>}
      {url && (
        <div className='mt-2'>
          {createElement('model-viewer', {
            src: url, alt: name, ar: true, 'ar-modes': 'webxr scene-viewer quick-look', 'ar-scale': 'fixed', 'camera-controls': true, 'touch-action': 'pan-y', 'shadow-intensity': '1',
            style: { width: '100%', height: 320, background: '#eef2f6', borderRadius: 12, position: 'relative', display: 'block' },
          }, createElement('button', { slot: 'ar-button', className: 'absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-[#e8590c] text-white text-sm font-medium' }, 'Im Raum ansehen (AR)'))}
          <p className='mt-1 text-[11px] text-[#86868b]'>Der AR-Knopf erscheint nur auf Geräten, die AR können (aktuelles Android mit Chrome, iPhone mit Safari). Modell in Originalgröße, ohne Maßketten.</p>
        </div>
      )}
    </div>
  )
}
