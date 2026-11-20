'use client'
// Objektinformationen im rechten Bereich: Projekt (ohne Auswahl) oder das ausgewählte Bauteil. Nur Anzeige aus dem Modell.
import { useMemo } from 'react'
import type { CADModel } from '@/lib/calculations/cad-engine'
import { anschlussStatus, ANSCHLUSS_TEXT } from '@/lib/cad/anschluss-status'

const FARBE = { abgeleitet: '#b45309', ungueltig: '#b42318', unbekannt: '#86868b' } as const
const zahl = (v: number, st = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: st, maximumFractionDigits: st })
const grad = (r: number) => zahl((r * 180) / Math.PI, 1) + '°'

export interface ProjektWerte { systemName: string | null; ansicht: string; flaecheM2: number | null; gewichtKg: number | null }

function Zeile({ k, v, farbe }: { k: string; v: string; farbe?: string }) {
  return <div className='flex justify-between gap-3 py-0.5'><dt className='text-[#86868b]'>{k}</dt><dd className='text-right text-[#1d1d1f]' style={farbe ? { color: farbe } : undefined}>{v}</dd></div>
}

export default function ObjektInfo({ model, auswahlId, projekt }: { model: CADModel | null; auswahlId: string | null; projekt: ProjektWerte }) {
  const bauteil = useMemo(() => (model && auswahlId ? model.components3D.find((c) => c.id === auswahlId) ?? null : null), [model, auswahlId])
  const status = useMemo(() => (model && bauteil ? anschlussStatus(bauteil, model.components3D) : null), [model, bauteil])
  if (!model) return <p className='p-3 text-[12px] text-[#86868b]'>Kein Modell – zuerst „Gerüst neu berechnen“.</p>
  if (!bauteil || !status) {
    return (
      <dl className='p-3 text-[12px]' aria-label='Projektinformationen'>
        <Zeile k='Gerüstsystem' v={projekt.systemName ?? '–'} />
        <Zeile k='Bauteile' v={String(model.components3D.length)} />
        {projekt.flaecheM2 !== null && <Zeile k='Gerüstfläche' v={`${zahl(projekt.flaecheM2, 1)} m²`} />}
        {projekt.gewichtKg !== null && projekt.gewichtKg > 0 && <Zeile k='Gesamtgewicht' v={`${zahl(projekt.gewichtKg, 0)} kg`} />}
        <Zeile k='Ansicht' v={projekt.ansicht} />
      </dl>
    )
  }
  return (
    <dl className='p-3 text-[12px]' aria-label='Bauteilinformationen'>
      <Zeile k='Bauteil' v={bauteil.name} />
      <Zeile k='System' v={model.system ? `${model.system.hersteller} ${model.system.systemName}` : '–'} />
      <Zeile k='Artikelnummer' v={bauteil.articleNumber || '–'} />
      <Zeile k='Position X / Y / Z' v={bauteil.position.map((v) => zahl(v)).join(' / ') + ' m'} />
      <Zeile k='Rotation X / Y / Z' v={bauteil.rotation.map(grad).join(' / ')} />
      <Zeile k='Baugruppe' v={bauteil.assemblyId ?? 'Einzelteil'} />
      <Zeile k='Anschlüsse' v={status.punkte > 0 ? `${status.verbunden} von ${status.punkte} verbunden` : '–'} />
      <Zeile k='Anschlussstatus' v={ANSCHLUSS_TEXT[status.zustand]} farbe={FARBE[status.zustand]} />
      {status.konflikte.length > 0 && <p className='mt-1 text-[11px] text-[#b42318]'>{status.konflikte.join('; ')}</p>}
    </dl>
  )
}
