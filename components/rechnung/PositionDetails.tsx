'use client'

import { POSITION_ARTEN, POSITION_ART_LABEL, mengenVorschlaege, type PositionArt, type StrukturPosition } from '@/lib/rechnung-position'

// Detailfelder einer Rechnungsposition: Gerüst-ID, Bemerkung, Art (Modul, Rollgerüst, Hängegerüst, Konsolen …),
// Maße L × B × H mit Mengenvorschlag, Listenpreis × Faktor, bei Stundenlohn Mitarbeiter und Tätigkeit.
// Gemeinsam genutzt in „Neue Rechnung“, im Rechnungsdialog der Baustelle und in der Rechnungsakte.

const feld = 'px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f]'

export default function PositionDetails({ p, onFeld, onMenge, geruestListeId }: {
  p: Partial<StrukturPosition>
  onFeld: (f: keyof StrukturPosition, wert: string) => void
  onMenge: (menge: number, einheit: string) => void
  /** id einer <datalist> mit bereits benutzten Gerüst-IDs (optional) */
  geruestListeId?: string
}) {
  const vorschlaege = mengenVorschlaege(p)
  return (
    <div className="col-span-12 grid grid-cols-12 gap-2 rounded-xl bg-black/5 p-3">
      <input list={geruestListeId} value={p.geruestId || ''} onChange={(e) => onFeld('geruestId', e.target.value)} placeholder="Gerüst-ID (z. B. Hauptgebäude Süd, Nebengebäude Ost)" className={`col-span-12 ${feld}`} />
      <textarea value={p.bemerkung || ''} onChange={(e) => onFeld('bemerkung', e.target.value)} rows={2} maxLength={1000}
        placeholder="Bemerkung / Begründung (z. B. Schultertransport, weil der Zugang nicht anfahrbar war)" className={`col-span-12 ${feld}`} />
      <select value={p.art || ''} onChange={(e) => onFeld('art', e.target.value)} className={`col-span-12 sm:col-span-4 ${feld}`}>
        <option value="">Art der Position</option>
        {POSITION_ARTEN.map((a: PositionArt) => <option key={a} value={a}>{POSITION_ART_LABEL[a]}</option>)}
      </select>
      {([['laengeM', 'L (m)'], ['breiteM', 'B (m)'], ['hoeheM', 'H (m)']] as [keyof StrukturPosition, string][]).map(([f, label]) => (
        <input key={f} value={p[f] != null ? String(p[f]) : ''} onChange={(e) => onFeld(f, e.target.value)} placeholder={label} aria-label={label} className={`col-span-4 sm:col-span-2 text-right ${feld}`} />
      ))}
      {vorschlaege.length > 0 && (
        <div className="col-span-12 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#86868b]">Menge aus Maßen übernehmen:</span>
          {vorschlaege.map((v) => (
            <button key={v.label} type="button" onClick={() => onMenge(v.menge, v.einheit)} className="px-2 py-1 rounded-lg border border-black/20 bg-white hover:bg-[#f0f0f0]">{v.label}</button>
          ))}
        </div>
      )}
      <input value={p.listenpreis != null ? String(p.listenpreis) : ''} onChange={(e) => onFeld('listenpreis', e.target.value)} placeholder="Listenpreis €" className={`col-span-6 sm:col-span-3 text-right ${feld}`} />
      <input value={p.faktorProzent != null ? String(p.faktorProzent) : ''} onChange={(e) => onFeld('faktorProzent', e.target.value)} placeholder="Faktor % (z. B. 80)" className={`col-span-6 sm:col-span-3 text-right ${feld}`} />
      {p.art === 'regie' && (
        <>
          <input value={p.mitarbeiter || ''} onChange={(e) => onFeld('mitarbeiter', e.target.value)} placeholder="Mitarbeiter (Name)" className={`col-span-12 sm:col-span-4 ${feld}`} />
          <input value={p.taetigkeit || ''} onChange={(e) => onFeld('taetigkeit', e.target.value)} placeholder="Beschreibung der Tätigkeit" className={`col-span-12 sm:col-span-8 ${feld}`} />
        </>
      )}
    </div>
  )
}
