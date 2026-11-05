'use client'
// Draufsicht einer Punktwolke (Höhe als Farbe) zum Anklicken von Punkten: gemeinsam genutzt von „Scans zusammenführen“ und „Punktwolke messen“.
import { useEffect, useMemo, useRef } from 'react'
import type { Draufsicht } from '@/lib/cad/scan-zusammenfuehren'
import type { V3 } from '@/lib/cad/registrierung'

const B = 460, H = 340

export default function Karte({ sicht, marken, aktiv, onKlick, verbinden = null }: { sicht: Draufsicht | null; marken: V3[]; aktiv: boolean; onKlick: (x: number, y: number) => void; verbinden?: 'strecke' | 'flaeche' | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const s = useMemo(() => (sicht ? Math.min(B / (sicht.breite * sicht.zelleM), H / (sicht.hoehe * sicht.zelleM)) : 1), [sicht])
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')
    if (!g) return
    g.fillStyle = '#f5f5f7'; g.fillRect(0, 0, B, H)
    if (!sicht) return
    const off = document.createElement('canvas'); off.width = sicht.breite; off.height = sicht.hoehe
    const og = off.getContext('2d')
    if (!og) return
    const img = og.createImageData(sicht.breite, sicht.hoehe)
    const sp = Math.max(1e-6, sicht.zHoch - sicht.zMin)
    for (let gy = 0; gy < sicht.hoehe; gy++) for (let gx = 0; gx < sicht.breite; gx++) {
      const h = sicht.zMax[gy * sicht.breite + gx]
      const o = ((sicht.hoehe - 1 - gy) * sicht.breite + gx) * 4
      if (Number.isNaN(h)) { img.data[o + 3] = 0; continue }
      const t = (h - sicht.zMin) / sp
      img.data[o] = 40 + 200 * t; img.data[o + 1] = 70 + 120 * t; img.data[o + 2] = 140 - 80 * t; img.data[o + 3] = 255
    }
    og.putImageData(img, 0, 0)
    g.imageSmoothingEnabled = false
    g.drawImage(off, 0, 0, sicht.breite * sicht.zelleM * s, sicht.hoehe * sicht.zelleM * s)
    const bild = (m: V3): [number, number] => [(m[0] - sicht.minX) * s, (sicht.hoehe * sicht.zelleM - (m[1] - sicht.minY)) * s]
    if (verbinden && marken.length > 1) {
      g.strokeStyle = '#e8590c'; g.lineWidth = 2; g.beginPath()
      marken.forEach((m, i) => { const [px, py] = bild(m); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py) })
      if (verbinden === 'flaeche' && marken.length > 2) g.closePath()
      g.stroke()
    }
    marken.forEach((m, i) => {
      const px = (m[0] - sicht.minX) * s, py = (sicht.hoehe * sicht.zelleM - (m[1] - sicht.minY)) * s
      g.fillStyle = '#e8590c'; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#fff'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), px, py + 3)
    })
  }, [sicht, marken, s, verbinden])
  return (
    <canvas ref={ref} width={B} height={H} className={`border rounded-lg bg-[#f5f5f7] max-w-full ${aktiv ? 'cursor-crosshair ring-2 ring-[#e8590c]' : 'opacity-70'}`}
      onClick={(e) => {
        if (!sicht || !aktiv) return
        const r = e.currentTarget.getBoundingClientRect()
        const px = ((e.clientX - r.left) / r.width) * B, py = ((e.clientY - r.top) / r.height) * H
        onKlick(sicht.minX + px / s, sicht.minY + (sicht.hoehe * sicht.zelleM - py / s))
      }} />
  )
}

