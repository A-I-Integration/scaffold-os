'use client'

import { useCallback, useEffect, useState } from 'react'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { ARBEITSSCHUTZ_KATEGORIEN } from '@/lib/baustellenmappe'

// Arbeitsschutz: Ablage der betrieblichen Unterlagen (Gefährdungsbeurteilungen, Betriebsanweisungen,
// Unterweisungen, Pflichtenübertragungen …). Die Dateien liegen als Firmen-Vorlagen und lassen sich in der
// Baustelle unter „Baustellenmappe“ → „Vorlagen der Firma“ in die jeweilige Baustelle übernehmen.

interface Dok { id: string; name: string; typ: string | null; datum: string | null; url: string; bezeichnung: string | null; kategorie: string | null }

const feld = 'border border-black/30 rounded px-2 py-1.5 bg-white text-black'
const knopf = 'rounded border border-black/30 px-3 py-1.5 bg-[#f0f0f0] text-black hover:bg-[#e4e4e4] disabled:opacity-50'

export default function ArbeitsschutzPage() {
  const [dok, setDok] = useState<Dok[]>([])
  const [kategorie, setKategorie] = useState<string>(ARBEITSSCHUTZ_KATEGORIEN[0])
  const [bezeichnung, setBezeichnung] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState('')
  const [filter, setFilter] = useState('alle')

  const lade = useCallback(async () => {
    try {
      const j = await (await fetch('/api/baustellenmappe?vorlagen=1', { cache: 'no-store' })).json()
      if (!j.success) throw new Error(j.error)
      setDok(j.vorlagen); setFehler('')
    } catch (e) { setFehler(e instanceof Error ? e.message : 'Laden fehlgeschlagen') }
  }, [])
  useEffect(() => { void lade() }, [lade])

  const hochladen = async (datei: File) => {
    setBusy(true); setFehler('')
    try {
      const up = await uploadVertragsdokument(datei, 'unzugeordnet', 'vorlagen')
      const r = await fetch('/api/baustellenmappe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vorlage', storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type, kategorie, bezeichnung }),
      })
      const j = await r.json(); if (!j.success) throw new Error(j.error)
      setBezeichnung(''); await lade()
    } catch (e) { setFehler(e instanceof Error ? e.message : 'Hochladen fehlgeschlagen') }
    setBusy(false)
  }

  const sichtbar = dok.filter(d => filter === 'alle' ? true : (d.kategorie || 'Sonstiges') === filter)

  return (
    <div className="p-4 space-y-5 text-[15px] text-black max-w-4xl">
      <h1 className="text-xl font-bold">Arbeitsschutz</h1>
      <p className="text-black/70">Hier liegen die Arbeitsschutz-Unterlagen eures Betriebs, z. B. Gefährdungsbeurteilung, Betriebsanweisungen, Unterweisungen und Pflichtenübertragungen. Für eine Baustelle übernimmst du sie dort unter „Baustellenmappe“ → „Vorlagen der Firma“. Eine auf die Baustelle zugeschnittene Gefährdungsbeurteilung erstellst du ebenfalls in der Baustellenmappe.</p>
      <p className="text-sm text-black/70">Hinweis: Fremde Veröffentlichungen (z. B. Fachinformationen von Verbänden oder Berufsgenossenschaften) nur ablegen und weitergeben, wenn deren Nutzungsbedingungen das erlauben.</p>
      {fehler && <p className="text-red-600">❌ {fehler}</p>}

      <section className="space-y-2">
        <h2 className="font-bold text-base">Datei ablegen</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select className={feld} value={kategorie} onChange={e => setKategorie(e.target.value)}>
            {ARBEITSSCHUTZ_KATEGORIEN.map(k => <option key={k}>{k}</option>)}
          </select>
          <input className={feld} placeholder="Bezeichnung (optional)" value={bezeichnung} onChange={e => setBezeichnung(e.target.value)} maxLength={120} />
          <label className={`${knopf} cursor-pointer`}>
            {busy ? 'Lädt hoch …' : 'Datei wählen'}
            <input type="file" className="hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void hochladen(f); e.target.value = '' }} />
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold text-base">Abgelegte Unterlagen</h2>
          <select className={feld} value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="alle">Alle Kategorien</option>
            {Array.from(new Set(dok.map(d => d.kategorie || 'Sonstiges'))).map(k => <option key={k}>{k}</option>)}
          </select>
        </div>
        <ul className="space-y-1">
          {sichtbar.map(d => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-black/20 px-3 py-2">
              <span><b>{d.bezeichnung || d.name}</b> · {d.kategorie || 'Sonstiges'}{d.datum ? ` · ${new Date(d.datum).toLocaleDateString('de-DE')}` : ''}</span>
              <a className={knopf} href={d.url} target="_blank" rel="noreferrer">Öffnen</a>
            </li>
          ))}
          {sichtbar.length === 0 && <li className="text-black/70">Noch nichts abgelegt.</li>}
        </ul>
      </section>
    </div>
  )
}
