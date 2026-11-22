'use client'
// Dialoge „Analyse“ (Kennzahlen aus dem Modell) und „Hilfe“ (Kurzübersicht der Symbolleiste).
import type { Analyse } from '@/lib/cad/analyse'

function Rahmen({ titel, onZu, children }: { titel: string; onZu: () => void; children: React.ReactNode }) {
  return (
    <div role='dialog' aria-label={titel} className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
      <div className='max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-4 text-sm text-[#1d1d1f] shadow-xl'>
        <div className='mb-3 flex items-center justify-between'>
          <h2 className='text-base font-semibold'>{titel}</h2>
          <button type='button' onClick={onZu} className='text-sm text-gray-500 hover:text-gray-900'>Schließen</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function AnalyseDialog({ analyse, onZu }: { analyse: Analyse; onZu: () => void }) {
  return (
    <Rahmen titel='Gerüstanalyse' onZu={onZu}>
      <table className='w-full'><tbody>{analyse.kennzahlen.map((k) => (
        <tr key={k.label} className='border-t border-black/10'><td className='py-1 pr-3 text-gray-600'>{k.label}</td><td className='py-1 text-right font-medium'>{k.wert}</td></tr>
      ))}</tbody></table>
      <h3 className='mb-1 mt-4 text-sm font-semibold'>Bauteile</h3>
      <div className='grid grid-cols-2 gap-x-6 gap-y-0.5'>{analyse.bauteile.map((b) => <div key={b.typ} className='flex justify-between'><span>{b.typ}</span><span className='font-medium'>{b.anzahl}</span></div>)}</div>
      {analyse.hinweise.length > 0 && (
        <>
          <h3 className='mb-1 mt-4 text-sm font-semibold'>Hinweise aus der Berechnung</h3>
          <ul className='list-disc space-y-1 pl-5 text-xs'>{analyse.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </>
      )}
      <p className='mt-4 text-xs text-gray-500'>Kennzahlen aus dem berechneten Modell. Kein Standsicherheitsnachweis.</p>
    </Rahmen>
  )
}

const HILFE: [string, string][] = [
  ['Datei', 'Neu startet leer, Öffnen lädt eine Projektdatei, Speichern schreibt sie. Versionen und Projekte im Konto liegen ebenfalls hier.'],
  ['Gebäude', 'Gebäudedaten, Umriss zeichnen, Wände (Höhe je Wand), Geschosse (Anzahl und Höhen) und Dach (Form, Traufe, Dachhöhe, Überstand).'],
  ['Gerüst', 'Automatik berechnet das Gerüst neu. Feld, Aufstocken, Teilabbau und Stück entfernen ändern Bereiche von Hand. Treppe, Konsole, Netz und Schutzdach werden gesetzt.'],
  ['Bauteile', 'Bauteil wählen, dann ins 3D-Modell klicken. Gesetzte Teile lassen sich anklicken, verschieben, drehen und löschen.'],
  ['Messen und Bemaßung', 'Abstand, Höhe, Winkel, Fläche und Koordinaten im Modell messen. Bemaßung blendet die Maße ein oder aus.'],
  ['Analyse, Prüfung, Auswertung', 'Analyse zeigt Kennzahlen, Prüfung die Regelprüfung, Auswertung Stückliste, Leistungsverzeichnis und Dokumente.'],
  ['Ansicht', '3D, 2D, Schnitt und die Ansichten. Seiten, Lagen und Bauteilarten lassen sich ein- und ausblenden.'],
  ['Tastatur', 'Strg/Cmd+Z macht die letzte Änderung rückgängig, Strg/Cmd+Umschalt+Z stellt sie wieder her. Esc beendet den Auswahlrahmen.'],
]
export function HilfeDialog({ onZu }: { onZu: () => void }) {
  return (
    <Rahmen titel='Hilfe' onZu={onZu}>
      <dl className='space-y-2'>{HILFE.map(([t, x]) => <div key={t}><dt className='font-semibold'>{t}</dt><dd className='text-gray-700'>{x}</dd></div>)}</dl>
    </Rahmen>
  )
}
