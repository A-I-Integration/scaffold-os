'use client'

import { useState } from 'react'
import { X, Ruler, Box, Users, Warehouse, Truck, ArrowRight, ArrowLeft, PartyPopper, LucideIcon } from 'lucide-react'

// ============================================================
// SCAFFOLD OS – Produkt-Tour für neue Nutzer (Phase 47)
//
// Zeigt beim ersten Login ein Klick-durch-Overlay mit den wichtigsten
// Bereichen (Symbol + kurzer Erklärtext je "Bild"). Echte
// Bildschirmfotos der App wären hier ideal, liegen mir aber nicht
// vor – deshalb bewusst große, farbige Symbol-Illustrationen statt
// erfundener/nicht-echter Screenshots, die die Oberfläche falsch
// darstellen könnten.
//
// "Gesehen"-Status wird pro Nutzer in localStorage gemerkt (kein SQL
// nötig) – zieht bei Browser-Wechsel neu, das ist für eine einmalige
// Willkommens-Tour ein akzeptabler Kompromiss.
// ============================================================

interface Slide {
  icon: LucideIcon
  farbe: string
  titel: string
  text: string
}

const SLIDES: Slide[] = [
  {
    icon: PartyPopper, farbe: '#e8590c',
    titel: 'Willkommen bei SCAFFOLD OS',
    text: 'Kurzer Rundgang durch die wichtigsten Bereiche – dauert unter einer Minute. Du kannst jederzeit überspringen.',
  },
  {
    icon: Ruler, farbe: '#2563eb',
    titel: 'Aufmaß & Angebot',
    text: 'Gebäude erfassen (auch per Foto/Grundriss-Upload, KI liest die Maße aus) – daraus wird automatisch ein Gerüst berechnet und ein Angebot erstellt.',
  },
  {
    icon: Box, farbe: '#7c3aed',
    titel: 'CAD-Planung',
    text: '3D-Ansicht des geplanten Gerüsts, inklusive Stückliste, Montageplan und direktem Weg zu Angebot und Rechnung.',
  },
  {
    icon: Users, farbe: '#059669',
    titel: 'Kunden & Rechnungen',
    text: 'Alle Kunden, Angebote und Rechnungen an einem Ort – GoBD-konform, mit Mahnwesen und E-Rechnung.',
  },
  {
    icon: Warehouse, farbe: '#d97706',
    titel: 'Lager',
    text: 'Bestand im Blick, Material reservieren, nach Demontage wieder einbuchen.',
  },
  {
    icon: Truck, farbe: '#0891b2',
    titel: 'Touren & Team',
    text: 'Mitarbeiter Aufträgen zuweisen, Fahrten mit Material planen – der Mitarbeiter sieht sein Ziel direkt beim Einloggen.',
  },
]

export default function ProductTour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const slide = SLIDES[index]
  const Icon = slide.icon
  const istLetzte = index === SLIDES.length - 1

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10">
          <X className="w-5 h-5" />
        </button>

        {/* "Bild"-Bereich – Symbol-Illustration statt echtem Screenshot */}
        <div className="h-48 flex items-center justify-center" style={{ backgroundColor: `${slide.farbe}15` }}>
          <Icon className="w-20 h-20" style={{ color: slide.farbe }} strokeWidth={1.5} />
        </div>

        <div className="p-6">
          <h2 className="text-lg font-bold text-[#1d1d1f] mb-2">{slide.titel}</h2>
          <p className="text-sm text-[#6e6e73] leading-relaxed">{slide.text}</p>

          {/* Fortschritts-Punkte */}
          <div className="flex gap-1.5 mt-5 mb-5">
            {SLIDES.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-[#e8590c]' : 'w-1.5 bg-black/10'}`} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="flex items-center gap-1 text-sm text-[#86868b] disabled:opacity-0 px-2 py-2"
            >
              <ArrowLeft className="w-4 h-4" /> Zurück
            </button>
            {istLetzte ? (
              <button onClick={onClose} className="flex-1 bg-[#e8590c] hover:bg-[#d9480f] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                Los geht's
              </button>
            ) : (
              <button onClick={() => setIndex((i) => Math.min(SLIDES.length - 1, i + 1))} className="flex-1 flex items-center justify-center gap-1 bg-[#e8590c] hover:bg-[#d9480f] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                Weiter <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
          {!istLetzte && (
            <button onClick={onClose} className="w-full text-center text-xs text-[#86868b] hover:text-[#424245] mt-3">
              Überspringen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
