'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ============================================================
// SCAFFOLD OS – Kunden-Import aus CSV/Excel (Phase 44)
//
// Für den Umstieg von einem Altsystem (CP-Pro o.ä.) oder aus einer
// gepflegten Excel-Liste. Da es kein öffentlich dokumentiertes
// Export-Format von CP-Pro gibt, funktioniert dieser Import bewusst
// SPALTEN-UNABHÄNGIG: egal wie die Spalten in der Export-Datei
// heißen, man ordnet sie hier manuell den SCAFFOLD-OS-Feldern zu.
// ============================================================

const ZIEL_FELDER: { key: string; label: string; pflicht?: boolean }[] = [
  { key: 'name', label: 'Firmenname', pflicht: true },
  { key: 'contact_person', label: 'Ansprechpartner' },
  { key: 'email', label: 'E-Mail' },
  { key: 'phone', label: 'Telefon' },
  { key: 'street', label: 'Straße' },
  { key: 'zip', label: 'PLZ' },
  { key: 'city', label: 'Ort' },
  { key: 'notes', label: 'Notizen' },
]

export default function KundenImportPage() {
  const router = useRouter()
  const [spalten, setSpalten] = useState<string[]>([])
  const [zeilen, setZeilen] = useState<Record<string, any>[]>([])
  const [zuordnung, setZuordnung] = useState<Record<string, string>>({})
  const [dateiname, setDateiname] = useState('')
  const [ladeFehler, setLadeFehler] = useState('')
  const [importLaeuft, setImportLaeuft] = useState(false)
  const [ergebnis, setErgebnis] = useState<{ importiert: number; uebersprungen: { zeile: number; grund: string }[] } | null>(null)

  const handleDatei = useCallback(async (file: File) => {
    setLadeFehler('')
    setErgebnis(null)
    setDateiname(file.name)
    try {
      let rows: Record<string, any>[] = []
      if (file.name.toLowerCase().endsWith('.csv')) {
        const Papa = (await import('papaparse')).default
        const text = await file.text()
        const result = Papa.parse(text, { header: true, skipEmptyLines: true })
        if (result.errors?.length) console.warn('CSV-Warnungen:', result.errors)
        rows = result.data as Record<string, any>[]
      } else {
        const XLSX = await import('xlsx')
        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      }
      if (rows.length === 0) { setLadeFehler('Keine Zeilen in der Datei gefunden.'); return }
      const erkannteSpalten = Object.keys(rows[0])
      setSpalten(erkannteSpalten)
      setZeilen(rows)

      // Automatischer Vorschlag: Spaltennamen, die offensichtlich passen
      const autoZuordnung: Record<string, string> = {}
      const kandidaten: Record<string, string[]> = {
        name: ['name', 'firma', 'firmenname', 'kunde', 'kundenname', 'unternehmen'],
        contact_person: ['ansprechpartner', 'kontakt', 'name ansprechpartner'],
        email: ['email', 'e-mail', 'mail'],
        phone: ['telefon', 'tel', 'phone', 'mobil'],
        street: ['strasse', 'straße', 'adresse', 'anschrift'],
        zip: ['plz', 'postleitzahl'],
        city: ['ort', 'stadt', 'city'],
        notes: ['notiz', 'notizen', 'bemerkung', 'anmerkung'],
      }
      for (const [ziel, worte] of Object.entries(kandidaten)) {
        const treffer = erkannteSpalten.find((s) => worte.includes(s.trim().toLowerCase()))
        if (treffer) autoZuordnung[ziel] = treffer
      }
      setZuordnung(autoZuordnung)
    } catch (err: any) {
      setLadeFehler('Datei konnte nicht gelesen werden: ' + err.message)
    }
  }, [])

  const handleImport = useCallback(async () => {
    if (!zuordnung.name) { alert('Bitte mindestens die Spalte für "Firmenname" zuordnen.'); return }
    setImportLaeuft(true)
    setErgebnis(null)
    try {
      const kunden = zeilen.map((zeile) => {
        const k: Record<string, any> = {}
        for (const [ziel, quelle] of Object.entries(zuordnung)) {
          if (quelle) k[ziel] = zeile[quelle]
        }
        return k
      })
      const res = await fetch('/api/kunden/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kunden }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setErgebnis({ importiert: json.importiert, uebersprungen: json.uebersprungen })
    } catch (err: any) {
      alert('❌ ' + err.message)
    }
    setImportLaeuft(false)
  }, [zeilen, zuordnung])

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-bold text-[#1d1d1f] mb-1">📥 Kunden-Import</h1>
        <p className="text-sm text-[#86868b] mb-6">
          Für den Umstieg von einem anderen Programm (z. B. CP-Pro) oder einer Excel-Liste. Egal wie die
          Spalten in der Export-Datei heißen – du ordnest sie hier einmal zu.
        </p>

        {spalten.length === 0 ? (
          <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#e8590c]/40 p-10 text-center cursor-pointer hover:bg-[#fff4ed] transition-colors bg-white">
            <span className="text-3xl">📄</span>
            <span className="text-sm font-semibold text-[#424245]">CSV- oder Excel-Datei hochladen</span>
            <span className="text-xs text-[#86868b]">Export aus eurem alten Programm oder eine gepflegte Excel-Liste</span>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDatei(f) }} />
          </label>
        ) : (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-black/5 p-4">
              <p className="text-sm text-[#424245] mb-3">
                <strong>{dateiname}</strong> – {zeilen.length} Zeile(n) erkannt, {spalten.length} Spalte(n)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ZIEL_FELDER.map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-[#424245] mb-1">
                      {f.label}{f.pflicht && ' *'}
                    </label>
                    <select
                      value={zuordnung[f.key] || ''}
                      onChange={(e) => setZuordnung((z) => ({ ...z, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-sm"
                    >
                      <option value="">– nicht importieren –</option>
                      {spalten.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Vorschau der ersten 5 Zeilen mit aktueller Zuordnung */}
            <div className="bg-white rounded-2xl border border-black/5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#f5f5f7]">
                    {ZIEL_FELDER.map((f) => <th key={f.key} className="px-3 py-2 text-left font-medium text-[#424245]">{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {zeilen.slice(0, 5).map((zeile, i) => (
                    <tr key={i} className="border-t border-black/5">
                      {ZIEL_FELDER.map((f) => <td key={f.key} className="px-3 py-2 text-[#1d1d1f]">{zuordnung[f.key] ? String(zeile[zuordnung[f.key]] ?? '') : '–'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-[#86868b] p-2">Vorschau: erste 5 von {zeilen.length} Zeilen</p>
            </div>

            {ergebnis && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800 space-y-1">
                <p>✅ {ergebnis.importiert} Kunde(n) importiert.</p>
                {ergebnis.uebersprungen.length > 0 && (
                  <details className="text-xs text-emerald-700">
                    <summary className="cursor-pointer">{ergebnis.uebersprungen.length} Zeile(n) übersprungen (Details)</summary>
                    <ul className="mt-1 space-y-0.5">
                      {ergebnis.uebersprungen.map((u, i) => <li key={i}>Zeile {u.zeile}: {u.grund}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setSpalten([]); setZeilen([]); setZuordnung({}); setErgebnis(null) }} className="px-4 py-2.5 bg-black/5 text-[#1d1d1f] text-sm font-medium rounded-xl hover:bg-black/10">
                Andere Datei wählen
              </button>
              <button
                onClick={ergebnis ? () => router.push('/kunden') : handleImport}
                disabled={importLaeuft}
                className="flex-1 py-2.5 bg-[#e8590c] text-white text-sm font-semibold rounded-xl hover:bg-[#d54f0a] disabled:opacity-50"
              >
                {importLaeuft ? 'Wird importiert…' : ergebnis ? '→ Zur Kundenliste' : `${zeilen.length} Kunde(n) importieren`}
              </button>
            </div>
          </div>
        )}
        {ladeFehler && <p className="mt-3 text-sm text-red-600">{ladeFehler}</p>}
      </div>
    </div>
  )
}
