'use client';

import { useCallback, useEffect, useState } from 'react';
import SignaturePad from '@/components/aufmaß/SignaturePad';
import {
  REGIE_STATUS_LABEL, MAX_FOTOS, betragGesamt, summeStunden, regieHinweise, regieAlsPositionen, istAbgerechnet,
  type RegieStunde, type RegieMaterial, type RegieStatus, type RegieZeileRechnung,
} from '@/lib/regiebericht';

// ============================================================
// SCAFFOLD OS – Regiebericht (Paket 10)
// RegieberichtBlock: anlegen, auf der Baustelle unterschreiben lassen, per Mail zum Ausdrucken schicken (Büro), Rücklauf markieren.
// RegieUebernahme: im Rechnungsformular offene Berichte auswählen und als Positionen übernehmen.
// ============================================================

export interface Bericht {
  id: string; nummer: string; project_id: string; datum: string; anlass: string | null; beschreibung: string | null
  stunden: RegieStunde[]; material: RegieMaterial[]; fotos: string[]; status: RegieStatus
  unterschrieben_von: string | null; unterschrieben_am: string | null; versendet_an: string | null; versendet_am: string | null; zurueck_am: string | null
  rechnung_id: string | null; rechnung_nummer: string | null; abgerechnet_am: string | null
}
interface Entwurf { id?: string; datum: string; anlass: string; beschreibung: string; stunden: RegieStunde[]; material: RegieMaterial[]; fotos: string[] }

const heute = () => new Date().toISOString().slice(0, 10);
const de = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '–');
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const num = (v: string): number => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
const eingabe = 'w-full px-2 py-1.5 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';
const knopf = 'px-3 py-1.5 rounded-lg border border-black/15 bg-white text-xs text-[#1d1d1f] hover:bg-black/5 disabled:opacity-50';
const knopfHaupt = 'px-3 py-1.5 rounded-lg bg-[#e8590c] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50';
const STATUS_FARBE: Record<RegieStatus, string> = { entwurf: 'bg-black/5 text-[#424245]', unterschrieben: 'bg-green-100 text-green-800', versendet: 'bg-amber-100 text-amber-800', zurueck: 'bg-green-100 text-green-800' };

/** Foto im Browser verkleinern (JPEG, längste Seite 1100 px), damit der Bericht klein bleibt. */
async function fotoVerkleinern(datei: File): Promise<string> {
  const url = URL.createObjectURL(datei);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('Bild nicht lesbar')); i.src = url; });
    const s = Math.min(1, 1100 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.72, 0.55, 0.4]) { const d = c.toDataURL('image/jpeg', q); if (d.length <= 380_000) return d; }
    throw new Error('Bild zu groß');
  } finally { URL.revokeObjectURL(url); }
}

export default function RegieberichtBlock({ projectId, kundeEmail = '' }: { projectId: string; kundeEmail?: string }) {
  const [liste, setListe] = useState<Bericht[]>([]);
  const [preise, setPreise] = useState(false);
  const [buero, setBuero] = useState(false);
  const [fehlt, setFehlt] = useState(false);
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState('');
  const [ed, setEd] = useState<Entwurf | null>(null);
  const [satzStandard, setSatzStandard] = useState(0);
  const [unterschrift, setUnterschrift] = useState<Bericht | null>(null);
  const [unterName, setUnterName] = useState('');
  const [mailAn, setMailAn] = useState<{ b: Bericht; to: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const lade = useCallback(async () => {
    try {
      const j = await fetch(`/api/regieberichte?project_id=${projectId}`, { cache: 'no-store' }).then((r) => r.json());
      if (j.success) { setListe(j.berichte || []); setPreise(!!j.preiseSichtbar); setBuero(!!j.buero); setFehlt(!!j.tabelleFehlt); } else setMeldung(j.error || 'Regieberichte konnten nicht geladen werden.');
    } catch { setMeldung('Regieberichte konnten nicht geladen werden.'); } finally { setLaedt(false); }
  }, [projectId]);
  useEffect(() => { void lade(); }, [lade]);
  useEffect(() => { fetch('/api/company').then((r) => r.json()).then((j) => { const s = Number(j?.company?.calc_hourly_rate); if (Number.isFinite(s) && s > 0) setSatzStandard(s); }).catch(() => {}); }, []);

  async function senden(url: string, method: string, body?: unknown): Promise<any> {
    setLaeuft(true); setMeldung('');
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.success === false) { setMeldung(j.error || 'Das hat nicht geklappt.'); return null; }
      return j;
    } catch { setMeldung('Keine Verbindung. Bitte noch einmal versuchen.'); return null; } finally { setLaeuft(false); }
  }

  function neu() { setEd({ datum: heute(), anlass: '', beschreibung: '', stunden: [{ name: '', stunden: 0, satz: preise ? satzStandard : 0 }], material: [], fotos: [] }); setMeldung(''); }
  function bearbeiten(b: Bericht) { setEd({ id: b.id, datum: b.datum, anlass: b.anlass || '', beschreibung: b.beschreibung || '', stunden: b.stunden.map((z) => ({ ...z })), material: b.material.map((m) => ({ ...m })), fotos: [...b.fotos] }); setMeldung(''); }

  async function speichern() {
    if (!ed) return;
    const daten = { datum: ed.datum, anlass: ed.anlass, beschreibung: ed.beschreibung, stunden: ed.stunden, material: ed.material, fotos: ed.fotos };
    const j = ed.id ? await senden('/api/regieberichte', 'PATCH', { id: ed.id, aktion: 'speichern', ...daten }) : await senden('/api/regieberichte', 'POST', { project_id: projectId, ...daten });
    if (j) { setEd(null); setMeldung(`Regiebericht ${j.bericht?.nummer || ''} gespeichert.`); await lade(); }
  }
  async function unterschreiben(bild: string) {
    if (!unterschrift) return;
    const j = await senden('/api/regieberichte', 'PATCH', { id: unterschrift.id, aktion: 'unterschreiben', unterschrieben_von: unterName, unterschrift: bild });
    if (j) { setUnterschrift(null); setUnterName(''); setMeldung('Unterschrift gespeichert.'); await lade(); }
  }
  async function versenden() {
    if (!mailAn) return;
    const j = await senden('/api/regieberichte/versand', 'POST', { id: mailAn.b.id, to: mailAn.to });
    if (j) { setMailAn(null); setMeldung(`Regiebericht an ${mailAn.to} gesendet.`); await lade(); }
  }
  async function aktion(b: Bericht, a: 'zurueck' | 'zuruecksetzen') { const j = await senden('/api/regieberichte', 'PATCH', { id: b.id, aktion: a }); if (j) await lade(); }
  async function loeschen(b: Bericht) { if (!window.confirm(`Regiebericht ${b.nummer} löschen?`)) return; const j = await senden(`/api/regieberichte?id=${b.id}`, 'DELETE'); if (j) await lade(); }

  async function fotosWaehlen(dateien: FileList | null) {
    if (!dateien || !ed) return;
    const neue: string[] = [];
    for (const f of Array.from(dateien)) { if (ed.fotos.length + neue.length >= MAX_FOTOS) { setMeldung(`Höchstens ${MAX_FOTOS} Fotos je Bericht.`); break; } try { neue.push(await fotoVerkleinern(f)); } catch { setMeldung('Ein Foto konnte nicht verarbeitet werden.'); } }
    setEd((e) => (e ? { ...e, fotos: [...e.fotos, ...neue] } : e));
  }

  if (laedt) return <p className="text-xs text-[#86868b]">Regieberichte werden geladen …</p>;
  const hinweise = ed ? regieHinweise({ stunden: ed.stunden.filter((z) => z.name || z.stunden > 0), material: ed.material.filter((m) => m.bezeichnung || m.menge > 0), beschreibung: ed.beschreibung, anlass: ed.anlass }) : [];

  return (
    <section data-testid="regie-block" className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[#1d1d1f]">Regieberichte</h3>
        {!ed && !fehlt && <button data-testid="regie-neu" className={knopfHaupt} onClick={neu}>+ Neuer Regiebericht</button>}
      </div>
      {fehlt && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">Regieberichte sind noch nicht eingerichtet: bitte phase-143-regieberichte.sql in Supabase ausführen.</p>}
      {meldung && <p data-testid="regie-meldung" className="text-xs text-[#424245] bg-[#f5f5f7] rounded-lg p-2">{meldung}</p>}

      {ed && (
        <div data-testid="regie-editor" className="rounded-lg border border-[#e8590c]/30 bg-orange-50/40 p-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs">Datum<input type="date" className={eingabe} value={ed.datum} onChange={(e) => setEd({ ...ed, datum: e.target.value })} /></label>
            <label className="text-xs sm:col-span-2">Anlass<input className={eingabe} value={ed.anlass} placeholder="z. B. Zusätzliche Verankerung auf Wunsch des Bauherrn" onChange={(e) => setEd({ ...ed, anlass: e.target.value })} /></label>
          </div>
          <label className="block text-xs">Beschreibung der Leistung<textarea rows={3} className={eingabe} value={ed.beschreibung} onChange={(e) => setEd({ ...ed, beschreibung: e.target.value })} /></label>

          <div>
            <p className="text-xs font-semibold mb-1">Stunden je Mitarbeiter</p>
            {ed.stunden.map((z, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_5rem_2rem] gap-1 mb-1 items-center">
                <input aria-label="Mitarbeiter" className={eingabe} placeholder="Name" value={z.name} onChange={(e) => setEd({ ...ed, stunden: ed.stunden.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input aria-label="Stunden" className={eingabe} inputMode="decimal" placeholder="Std." value={z.stunden || ''} onChange={(e) => setEd({ ...ed, stunden: ed.stunden.map((x, j) => (j === i ? { ...x, stunden: num(e.target.value) } : x)) })} />
                {preise ? <input aria-label="Stundensatz" className={eingabe} inputMode="decimal" placeholder="€/Std." value={z.satz || ''} onChange={(e) => setEd({ ...ed, stunden: ed.stunden.map((x, j) => (j === i ? { ...x, satz: num(e.target.value) } : x)) })} /> : <span />}
                <button aria-label="Zeile entfernen" className="text-[#86868b]" onClick={() => setEd({ ...ed, stunden: ed.stunden.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button className={knopf} onClick={() => setEd({ ...ed, stunden: [...ed.stunden, { name: '', stunden: 0, satz: preise ? satzStandard : 0 }] })}>+ Mitarbeiter</button>
          </div>

          <div>
            <p className="text-xs font-semibold mb-1">Material / Gerüstteile</p>
            {ed.material.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_4.5rem_4rem_5rem_2rem] gap-1 mb-1 items-center">
                <input aria-label="Bezeichnung" className={eingabe} placeholder="Bezeichnung" value={m.bezeichnung} onChange={(e) => setEd({ ...ed, material: ed.material.map((x, j) => (j === i ? { ...x, bezeichnung: e.target.value } : x)) })} />
                <input aria-label="Menge" className={eingabe} inputMode="decimal" placeholder="Menge" value={m.menge || ''} onChange={(e) => setEd({ ...ed, material: ed.material.map((x, j) => (j === i ? { ...x, menge: num(e.target.value) } : x)) })} />
                <input aria-label="Einheit" className={eingabe} placeholder="Einh." value={m.einheit} onChange={(e) => setEd({ ...ed, material: ed.material.map((x, j) => (j === i ? { ...x, einheit: e.target.value } : x)) })} />
                {preise ? <input aria-label="Einzelpreis" className={eingabe} inputMode="decimal" placeholder="€/Einh." value={m.einzelpreis || ''} onChange={(e) => setEd({ ...ed, material: ed.material.map((x, j) => (j === i ? { ...x, einzelpreis: num(e.target.value) } : x)) })} /> : <span />}
                <button aria-label="Zeile entfernen" className="text-[#86868b]" onClick={() => setEd({ ...ed, material: ed.material.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button className={knopf} onClick={() => setEd({ ...ed, material: [...ed.material, { bezeichnung: '', menge: 0, einheit: 'Stk.', einzelpreis: 0 }] })}>+ Material</button>
          </div>

          <div>
            <p className="text-xs font-semibold mb-1">Fotos ({ed.fotos.length}/{MAX_FOTOS})</p>
            <div className="flex flex-wrap gap-2 mb-1">
              {ed.fotos.map((f, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f} alt={`Foto ${i + 1}`} className="h-16 w-16 object-cover rounded-lg border border-black/10" />
                  <button aria-label="Foto entfernen" className="absolute -top-1 -right-1 bg-white border rounded-full w-5 h-5 text-xs" onClick={() => setEd({ ...ed, fotos: ed.fotos.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
            </div>
            <input data-testid="regie-fotos" type="file" accept="image/*" multiple capture="environment" onChange={(e) => { void fotosWaehlen(e.target.files); e.target.value = ''; }} className="text-xs" />
          </div>

          {preise && <p className="text-sm font-semibold" data-testid="regie-summe">Summe netto: {eur(betragGesamt({ stunden: ed.stunden, material: ed.material }))} · {summeStunden(ed.stunden).toLocaleString('de-DE')} Std.</p>}
          {hinweise.length > 0 && <ul className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2 list-disc pl-5">{hinweise.map((h) => <li key={h}>{h}</li>)}</ul>}
          <div className="flex gap-2">
            <button data-testid="regie-speichern" className={knopfHaupt} disabled={laeuft} onClick={speichern}>Speichern</button>
            <button className={knopf} onClick={() => setEd(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {unterschrift && (
        <div data-testid="regie-unterschrift" className="rounded-lg border border-black/10 p-3 space-y-2">
          <p className="text-sm font-semibold">Unterschrift Bauherr: {unterschrift.nummer}</p>
          <p className="text-xs text-[#86868b]">Nach der Unterschrift lässt sich der Bericht nicht mehr ändern.</p>
          <label className="block text-xs">Name des Unterzeichnenden<input className={eingabe} value={unterName} onChange={(e) => setUnterName(e.target.value)} /></label>
          <SignaturePad onSave={(d) => void unterschreiben(d)} onCancel={() => { setUnterschrift(null); setUnterName(''); }} />
        </div>
      )}

      {mailAn && (
        <div data-testid="regie-mail" className="rounded-lg border border-black/10 p-3 space-y-2">
          <p className="text-sm font-semibold">{mailAn.b.nummer} per Mail zum Ausdrucken senden</p>
          <label className="block text-xs">E-Mail-Adresse<input type="email" className={eingabe} value={mailAn.to} onChange={(e) => setMailAn({ ...mailAn, to: e.target.value })} /></label>
          <div className="flex gap-2"><button className={knopfHaupt} disabled={laeuft || !mailAn.to} onClick={versenden}>Senden</button><button className={knopf} onClick={() => setMailAn(null)}>Abbrechen</button></div>
        </div>
      )}

      {!liste.length && !fehlt && <p className="text-xs text-[#86868b]">Noch keine Regieberichte für diese Baustelle.</p>}
      <ul data-testid="regie-liste" className="space-y-2">
        {liste.map((b) => (
          <li key={b.id} className="rounded-lg border border-black/10 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{b.nummer}</span><span className="text-[#86868b]">{de(b.datum)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_FARBE[b.status]}`}>{REGIE_STATUS_LABEL[b.status]}</span>
              {istAbgerechnet(b)
                ? <span data-testid="regie-abgerechnet" className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Abgerechnet in {b.rechnung_nummer || 'Rechnung'}</span>
                : <span data-testid="regie-offen" className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Noch nicht abgerechnet</span>}
              {preise && <span className="ml-auto text-sm">{eur(betragGesamt(b))}</span>}
            </div>
            {(b.anlass || b.beschreibung) && <p className="text-xs text-[#424245] mt-1">{b.anlass || b.beschreibung}</p>}
            <p className="text-xs text-[#86868b] mt-1">
              {summeStunden(b.stunden).toLocaleString('de-DE')} Std. · {b.material.length} Materialposition(en) · {b.fotos.length} Foto(s)
              {b.unterschrieben_von ? ` · unterschrieben von ${b.unterschrieben_von}${b.unterschrieben_am ? ` am ${de(b.unterschrieben_am)}` : ''}` : ''}
              {b.versendet_an ? ` · gesendet an ${b.versendet_an} am ${de(b.versendet_am)}` : ''}{b.zurueck_am ? ` · Rücklauf am ${de(b.zurueck_am)}` : ''}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <a className={knopf} href={`/api/regieberichte/pdf?id=${b.id}`} target="_blank" rel="noreferrer">PDF</a>
              {b.status === 'entwurf' && !istAbgerechnet(b) && <>
                <button className={knopf} onClick={() => bearbeiten(b)}>Bearbeiten</button>
                <button data-testid="regie-unterschreiben" className={knopfHaupt} onClick={() => { setUnterschrift(b); setMeldung(''); }}>Unterschrift vor Ort</button>
              </>}
              {buero && !istAbgerechnet(b) && (b.status === 'entwurf' || b.status === 'versendet') && <button data-testid="regie-mail-knopf" className={knopf} onClick={() => setMailAn({ b, to: b.versendet_an || kundeEmail })}>{b.status === 'versendet' ? 'Erneut per Mail' : 'Per Mail zum Unterschreiben'}</button>}
              {buero && !istAbgerechnet(b) && b.status === 'versendet' && <button data-testid="regie-zurueck" className={knopf} disabled={laeuft} onClick={() => void aktion(b, 'zurueck')}>Unterschriebener Rücklauf eingegangen</button>}
              {buero && !istAbgerechnet(b) && b.status === 'zurueck' && <button className={knopf} disabled={laeuft} onClick={() => void aktion(b, 'zuruecksetzen')}>Rücklauf zurücknehmen</button>}
              {b.status === 'entwurf' && !istAbgerechnet(b) && <button className={knopf} onClick={() => void loeschen(b)}>Löschen</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Rechnungsformular: offene (noch nicht abgerechnete) Regieberichte der Baustelle auswählen und als Positionen übernehmen. */
export function RegieUebernahme({ projectId, uebernommen, onUebernehmen }: { projectId: string; uebernommen: string[]; onUebernehmen: (positionen: RegieZeileRechnung[], ids: string[]) => void }) {
  const [offen, setOffen] = useState<Bericht[]>([]);
  const [wahl, setWahl] = useState<string[]>([]);
  const [meldung, setMeldung] = useState('');
  useEffect(() => {
    let aktiv = true;
    fetch(`/api/regieberichte?project_id=${projectId}&offen=1`, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (aktiv && j.success) setOffen(j.berichte || []); }).catch(() => {});
    return () => { aktiv = false; };
  }, [projectId]);
  const frei = offen.filter((b) => !uebernommen.includes(b.id));
  if (!offen.length) return null;
  return (
    <div data-testid="regie-uebernahme" className="rounded-lg border border-[#e8590c]/30 bg-orange-50/40 p-3 space-y-2">
      <p className="text-sm font-semibold">Regieberichte dieser Baustelle (noch nicht abgerechnet)</p>
      {frei.length === 0 && <p className="text-xs text-[#86868b]">Alle offenen Regieberichte sind schon in dieser Rechnung.</p>}
      {frei.map((b) => (
        <label key={b.id} className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={wahl.includes(b.id)} onChange={(e) => setWahl(e.target.checked ? [...wahl, b.id] : wahl.filter((x) => x !== b.id))} />
          <span><strong>{b.nummer}</strong> vom {de(b.datum)} · {eur(betragGesamt(b))} · {REGIE_STATUS_LABEL[b.status]}{b.anlass ? ` · ${b.anlass}` : ''}{b.status === 'entwurf' || b.status === 'versendet' ? ' (noch ohne Unterschrift)' : ''}</span>
        </label>
      ))}
      {meldung && <p className="text-xs text-amber-800">{meldung}</p>}
      {frei.length > 0 && <button type="button" data-testid="regie-uebernehmen" disabled={!wahl.length} className={knopfHaupt} onClick={() => {
        const gewaehlt = offen.filter((b) => wahl.includes(b.id));
        const alle = gewaehlt.map((b) => regieAlsPositionen(b));
        const pos = alle.flatMap((x) => x.positionen);
        const ohne = alle.flatMap((x) => x.ohnePreis);
        setMeldung(ohne.length ? `Ohne Preis nicht übernommen: ${ohne.join('; ')}. Bitte im Regiebericht den Preis nachtragen oder die Position von Hand ergänzen.` : '');
        // Nur Berichte, aus denen wirklich Positionen entstanden sind, werden der Rechnung zugeordnet (sonst gälten sie als abgerechnet, ohne dass etwas auf der Rechnung steht)
        const ids = gewaehlt.filter((_, i) => alle[i].positionen.length > 0).map((b) => b.id);
        if (pos.length) onUebernehmen(pos, ids);
        setWahl([]);
      }}>Ausgewählte in die Rechnung übernehmen</button>}
    </div>
  );
}
