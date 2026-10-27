'use client'

import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { KATEGORIEN, mappeUrl } from '@/lib/baustellenmappe'
import Verankerungsprotokoll from '@/components/Verankerungsprotokoll'
import Pruefschild from '@/components/Pruefschild'
import Uebergabeprotokoll from '@/components/Uebergabeprotokoll'
import Gefaehrdungsbeurteilung from '@/components/Gefaehrdungsbeurteilung'
import Unterweisung from '@/components/Unterweisung'
import { Pflichtenuebertragung, Betriebsanweisung } from '@/components/ArbeitsschutzFormulare'

// ============================================================
// SCAFFOLD OS – Baustellenmappe (Reiter in der Baustelle)
// Unterlagen je Baustelle ablegen, für die Mappe freigeben, QR-Code/Link für das
// Gerüst erzeugen (Aushang als PDF) und Firmen-Vorlagen übernehmen.
// ============================================================

interface Dok { id: string; name: string; typ: string | null; datum: string | null; url: string; bezeichnung: string | null; kategorie: string | null; inMappe: boolean }
interface Link { id: string; token: string; label: string | null; created_at: string; status: 'aktiv' | 'abgelaufen' | 'widerrufen' }

const feld = 'border border-black/30 rounded px-2 py-1.5 bg-white text-black'
const knopf = 'rounded border border-black/30 px-3 py-1.5 bg-[#f0f0f0] text-black hover:bg-[#e4e4e4] disabled:opacity-50'

export default function Baustellenmappe({ projectId, projektName, adresse }: { projectId: string; projektName: string; adresse?: string | null }) {
  const [dok, setDok] = useState<Dok[]>([])
  const [vorlagen, setVorlagen] = useState<Dok[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [tabelleFehlt, setTabelleFehlt] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState('')
  const [kategorie, setKategorie] = useState<string>(KATEGORIEN[0])
  const [label, setLabel] = useState('')
  const [qr, setQr] = useState<{ id: string; dataUrl: string; url: string } | null>(null)

  const lade = useCallback(async () => {
    try {
      const r = await fetch(`/api/baustellenmappe?project_id=${projectId}`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error)
      setDok(j.dokumente); setVorlagen(j.vorlagen); setLinks(j.links); setTabelleFehlt(!!j.linkTabelleFehlt); setFehler('')
    } catch (e) { setFehler(e instanceof Error ? e.message : 'Laden fehlgeschlagen') }
  }, [projectId])
  useEffect(() => { void lade() }, [lade])

  const lauf = async (f: () => Promise<void>) => { setBusy(true); setFehler(''); try { await f(); await lade() } catch (e) { setFehler(e instanceof Error ? e.message : 'Fehlgeschlagen') } finally { setBusy(false) } }
  const post = async (body: Record<string, unknown>) => { const r = await fetch('/api/baustellenmappe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!j.success) throw new Error(j.error); return j }
  const patch = async (body: Record<string, unknown>) => { const r = await fetch('/api/baustellenmappe', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!j.success) throw new Error(j.error) }

  const hochladen = (datei: File, alsVorlage: boolean) => lauf(async () => {
    const up = await uploadVertragsdokument(datei, alsVorlage ? 'unzugeordnet' : projectId, alsVorlage ? 'vorlagen' : 'mappe')
    await post({ action: alsVorlage ? 'vorlage' : 'dokument', project_id: projectId, storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type, kategorie })
  })

  const linkAnlegen = () => lauf(async () => { await post({ action: 'link', project_id: projectId, label }); setLabel('') })
  const widerrufen = (id: string) => lauf(async () => {
    if (!confirm('Link widerrufen? Der QR-Code an der Baustelle funktioniert dann nicht mehr.')) return
    const r = await fetch(`/api/baustellenmappe?id=${id}`, { method: 'DELETE' }); const j = await r.json(); if (!j.success) throw new Error(j.error)
    if (qr?.id === id) setQr(null)
  })

  const zeigeQr = async (l: Link) => {
    const url = mappeUrl(window.location.origin, l.token)
    setQr({ id: l.id, url, dataUrl: await QRCode.toDataURL(url, { width: 600, margin: 2, color: { dark: '#000000', light: '#ffffff' } }) })
  }

  // Aushang für die Baustelle: QR-Code groß, mit Baustelle und Hinweis (A4, wetterfest laminierbar)
  const aushangPdf = () => {
    if (!qr) return
    const doc = new jsPDF()
    const w = doc.internal.pageSize.getWidth()
    doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.text('Baustellenunterlagen', w / 2, 30, { align: 'center' })
    doc.setFontSize(18); doc.text(doc.splitTextToSize(projektName, w - 30), w / 2, 46, { align: 'center' })
    if (adresse) { doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.text(doc.splitTextToSize(adresse, w - 30), w / 2, 62, { align: 'center' }) }
    doc.addImage(qr.dataUrl, 'PNG', (w - 130) / 2, 75, 130, 130)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('QR-Code mit dem Handy scannen', w / 2, 218, { align: 'center' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12)
    doc.text('Prüfprotokoll, Kennzeichnung und weitere Unterlagen dieser Baustelle –', w / 2, 228, { align: 'center' })
    doc.text('immer aktuell, auch wenn Papier fehlt oder unleserlich ist.', w / 2, 235, { align: 'center' })
    doc.setFontSize(10); doc.text(qr.url, w / 2, 250, { align: 'center' })
    doc.save(`Aushang-Baustellenunterlagen-${projektName.replace(/[^\w\-]+/g, '_')}.pdf`)
  }

  const aktiveLinks = links.filter((l) => l.status === 'aktiv')

  return (
    <div className="space-y-5 text-[15px] text-black">
      {fehler && <p className="text-red-600">❌ {fehler}</p>}
      {tabelleFehlt && <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2">Die Link-Tabelle fehlt noch. Bitte die SQL „phase-baustellenmappe.sql“ einmalig im Supabase SQL-Editor ausführen.</p>}

      <section className="space-y-2">
        <h3 className="font-bold text-base">1. Unterlagen der Baustelle</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select className={feld} value={kategorie} onChange={(e) => setKategorie(e.target.value)} aria-label="Einordnung">{KATEGORIEN.map((k) => <option key={k}>{k}</option>)}</select>
          <label className={`${knopf} cursor-pointer`}>+ Datei hochladen
            <input type="file" accept="application/pdf,.pdf,.doc,.docx,image/*" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void hochladen(f, false); e.target.value = '' }} />
          </label>
        </div>
        <table className="w-full border-collapse">
          <thead><tr className="text-left" style={{ background: '#f3f3f3' }}><th className="p-2 border border-black/20">Dokument</th><th className="p-2 border border-black/20">Einordnung</th><th className="p-2 border border-black/20">In Mappe (QR)</th></tr></thead>
          <tbody>
            {dok.map((d) => (
              <tr key={d.id}>
                <td className="p-2 border border-black/10"><a href={d.url} target="_blank" rel="noreferrer" className="underline">{d.bezeichnung || d.name}</a></td>
                <td className="p-2 border border-black/10">
                  <select className={feld} value={d.kategorie || ''} disabled={busy} onChange={(e) => lauf(() => patch({ media_id: d.id, kategorie: e.target.value || null }))} aria-label="Einordnung">
                    <option value="">Sonstiges</option>{KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
                  </select>
                </td>
                <td className="p-2 border border-black/10"><label className="flex items-center gap-2"><input type="checkbox" checked={d.inMappe} disabled={busy} onChange={(e) => lauf(() => patch({ media_id: d.id, mappe: e.target.checked }))} /> sichtbar</label></td>
              </tr>
            ))}
            {dok.length === 0 && <tr><td colSpan={3} className="p-3 text-black/70">Noch keine Dokumente. Datei hochladen oder unten eine Vorlage übernehmen.</td></tr>}
          </tbody>
        </table>
        <p className="text-sm text-black/70">Nur Dokumente mit Haken erscheinen über den QR-Code. Verträge und Preise bitte nicht freigeben.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold text-base">2. Vorlagen der Firma</h3>
        <ul className="space-y-1">
          {vorlagen.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 rounded border border-black/20 px-3 py-2">
              <span>{v.bezeichnung || v.name}{v.kategorie ? ` · ${v.kategorie}` : ''}</span>
              <span className="flex gap-2"><a href={v.url} target="_blank" rel="noreferrer" className="underline">Öffnen</a>
                <button className={knopf} disabled={busy} onClick={() => lauf(async () => { await post({ action: 'vorlage-zuordnen', project_id: projectId, media_id: v.id }) })}>Zur Baustelle hinzufügen</button></span>
            </li>
          ))}
          {vorlagen.length === 0 && <li className="text-black/70">Noch keine Vorlagen. Z. B. leeres Prüfprotokoll oder „Plan für den Gebrauch“ einmal hochladen, dann bei jeder Baustelle mit einem Klick übernehmen.</li>}
        </ul>
        <label className={`${knopf} inline-block cursor-pointer`}>+ Vorlage hochladen (Einordnung wie oben)
          <input type="file" accept="application/pdf,.pdf,.doc,.docx" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void hochladen(f, true); e.target.value = '' }} />
        </label>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold text-base">3. QR-Code und Link für das Gerüst</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input className={feld} placeholder="Bezeichnung, z. B. Aushang Nordseite" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
          <button className={knopf} disabled={busy || tabelleFehlt} onClick={linkAnlegen}>QR-Code / Link erstellen</button>
        </div>
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-black/20 px-3 py-2">
              <span>{l.label || 'Link'} · {new Date(l.created_at).toLocaleDateString('de-DE')} · {l.status === 'aktiv' ? 'aktiv' : 'widerrufen'}</span>
              {l.status === 'aktiv' && <span className="flex gap-2">
                <button className={knopf} onClick={() => zeigeQr(l)}>QR-Code anzeigen</button>
                <button className={knopf} onClick={async () => { const u = mappeUrl(window.location.origin, l.token); try { await navigator.clipboard.writeText(u); alert('Link kopiert:\n' + u) } catch { prompt('Link bitte kopieren:', u) } }}>Link kopieren</button>
                <button className={`${knopf} text-red-700`} disabled={busy} onClick={() => widerrufen(l.id)}>Widerrufen</button>
              </span>}
            </li>
          ))}
          {aktiveLinks.length === 0 && <li className="text-black/70">Noch kein aktiver Link.</li>}
        </ul>
        {qr && (
          <div className="rounded border border-black/30 p-4 inline-block bg-white">
            <img src={qr.dataUrl} alt="QR-Code Baustellenunterlagen" width={240} height={240} />
            <p className="text-sm mt-2 break-all max-w-[240px]">{qr.url}</p>
            <button className={`${knopf} mt-2`} onClick={aushangPdf}>Aushang als PDF (A4)</button>
          </div>
        )}
        <p className="text-sm text-black/70">Der Link läuft nicht ab, damit ein gedruckter Code hält. Wer den Code scannt, sieht nur die freigegebenen Unterlagen dieser Baustelle. Bei Verlust oder Missbrauch den Link widerrufen und einen neuen erstellen.</p>
      </section>
      <Verankerungsprotokoll projectId={projectId} onAbgelegt={() => void lade()} />
      <Pruefschild projectId={projectId} onAbgelegt={() => void lade()} />
      <Uebergabeprotokoll projectId={projectId} onAbgelegt={() => void lade()} />
      <Gefaehrdungsbeurteilung projectId={projectId} onAbgelegt={() => void lade()} />
      <Unterweisung projectId={projectId} onAbgelegt={() => void lade()} />
      <Pflichtenuebertragung projectId={projectId} onAbgelegt={() => void lade()} />
      <Betriebsanweisung projectId={projectId} onAbgelegt={() => void lade()} />
    </div>
  )
}
