'use client'

export default function CADPage() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#fbfbfd] text-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8 max-w-md">
        <div className="text-4xl mb-4">🚧</div>
        <h1 className="text-xl font-semibold text-[#1d1d1f] mb-2">
          CAD-Funktion wird überarbeitet
        </h1>
        <p className="text-sm text-[#86868b] mb-6">
          Die 3D-Gerüstplanung ist temporär nicht verfügbar. 
          Wir arbeiten an einer Performance-Optimierung.
        </p>
        <a 
          href="/" 
          className="inline-block px-4 py-2 bg-[#e8590c] text-white text-sm font-medium rounded-xl hover:bg-[#d14d0b] transition-colors"
        >
          Zurück zur Übersicht
        </a>
      </div>
    </div>
  )
}
