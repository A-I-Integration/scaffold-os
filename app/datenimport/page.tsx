'use client';

import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, ClipboardPaste, Download, Loader2, CheckCircle2, AlertTriangle, Users, Package } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Datenimport (CSV)
// Für Wechsler aus Altsoftware (CP-PRO, WinWorker, Excel …):
// Kundenstamm und Material/Lager per CSV übernehmen.
//
// Ablauf: Datei wählen/einfügen → Spalten zuordnen (auto-erraten)
// → Vorschau → Importieren → Ergebnis mit Fehlerliste.
// Server: /api/import/kunden bzw. /api/import/material
// (nur admin/disponent, Dubletten werden übersprungen).
// ============================================================

interface FeldDef {
  key: string;
  label: string;
  pflicht?: boolean;
  // Header-Namen (kleingeschrieben, ohne Umlaute), die automatisch erkannt werden
  raten: string[];
}

const KUNDEN_FELDER: FeldDef[] = [
  { key: 'name', label: 'Name / Firma', pflicht: true, raten: ['name', 'firma', 'kunde', 'kundenname', 'unternehmen', 'firmenname', 'adresse1'] },
  { key: 'contact_person', label: 'Ansprechpartner', raten: ['ansprechpartner', 'kontakt', 'kontaktperson', 'ansprechperson'] },
  { key: 'email', label: 'E-Mail', raten: ['email', 'e-mail', 'emailadresse', 'mail'] },
  { key: 'phone', label: 'Telefon', raten: ['telefon', 'tel', 'phone', 'telefonnummer', 'fon', 'telefon1'] },
  { key: 'street', label: 'Straße', raten: ['strasse', 'street', 'adresse', 'anschrift'] },
  { key: 'zip', label: 'PLZ', raten: ['plz', 'zip', 'postleitzahl'] },
  { key: 'city', label: 'Ort', raten: ['ort', 'stadt', 'city', 'wohnort'] },
  { key: 'notes', label: 'Notizen', raten: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'notes', 'kommentar'] },
];

const MATERIAL_FELDER: FeldDef[] = [
  { key: 'name', label: 'Bezeichnung', pflicht: true, raten: ['bezeichnung', 'name', 'artikel', 'artikelbezeichnung', 'artikelname', 'bez'] },
  { key: 'sku', label: 'Artikelnummer / SKU', raten: ['sku', 'artikelnummer', 'art-nr', 'artnr', 'artikelnr', 'nummer', 'artikel-nr'] },
  { key: 'category', label: 'Kategorie', raten: ['kategorie', 'category', 'warengruppe', 'gruppe'] },
  { key: 'quantity', label: 'Bestand (Menge)', raten: ['menge', 'bestand', 'quantity', 'anzahl', 'lagerbestand', 'stuck', 'stuckzahl'] },
  { key: 'unit', label: 'Einheit', raten: ['einheit', 'unit', 'me', 'mengeneinheit'] },
  { key: 'unit_price', label: 'Preis (netto)', raten: ['preis', 'einzelpreis', 'ek', 'einkaufspreis', 'unitprice', 'netto', 'ek-preis'] },
  { key: 'min_stock', label: 'Mindestbestand', raten: ['mindestbestand', 'minstock', 'mindest'] },
  { key: 'supplier', label: 'Lieferant', raten: ['lieferant', 'supplier', 'hersteller'] },
  { key: 'location_in_warehouse', label: 'Lagerort', raten: ['lagerort', 'platz', 'regal', 'location', 'lagerplatz'] },
  { key: 'barcode', label: 'Barcode / EAN', raten: ['barcode', 'ean', 'gtin'] },
  { key: 'description', label: 'Beschreibung', raten: ['beschreibung', 'description', 'langtext', 'text'] },
];

const VORLAGEN: Record<'kunden' | 'material', string> = {
  kunden: 'Name;Ansprechpartner;E-Mail;Telefon;Straße;PLZ;Ort;Notizen\nMusterbau GmbH;Herr Müller;info@musterbau.de;02561/12345;Musterstraße 12;48691;Vreden;Stammkunde seit 2020',
  material: 'Bezeichnung;Artikelnummer;Kategorie;Bestand;Einheit;Preis;Mindestbestand;Lieferant;Lagerort\nStahlrahmen 73 1,00 m;SR-73-100;Rahmen;500;Stk;18,50;50;Layher;Halle 1 / Regal A',
};

type ImportArt = 'kunden' | 'material';
type Schritt = 'datei' | 'zuordnung' | 'ergebnis';

// ─── CSV-Hilfsfunktionen ───
function trennerRaten(ersteZeile: string): string {
  const kandidaten = [';', ',', '\t'];
  let bester = ';';
  let max = 0;
  for (const k of kandidaten) {
    const n = ersteZeile.split(k).length;
    if (n > max) { max = n; bester = k; }
  }
  return bester;
}

function parseCsv(text: string, trenner: string): string[][] {
  const zeilen: string[][] = [];
  let feld = '';
  let zeile: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { feld += '"'; i++; } else { inQuotes = false; }
      } else feld += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === trenner) {
      zeile.push(feld); feld = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      zeile.push(feld); feld = '';
      if (zeile.some((z) => z.trim() !== '')) zeilen.push(zeile);
      zeile = [];
    } else feld += c;
  }
  if (feld !== '' || zeile.length > 0) {
    zeile.push(feld);
    if (zeile.some((z) => z.trim() !== '')) zeilen.push(zeile);
  }
  return zeilen;
}

function normalisieren(h: string): string {
  return h.toLowerCase().trim()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

async function dateiLesen(datei: File): Promise<string> {
  const alsText = (encoding: string) =>
    new Promise<string>((ok, fehler) => {
      const r = new FileReader();
      r.onload = () => ok(r.result as string);
      r.onerror = () => fehler(r.error);
      r.readAsText(datei, encoding);
    });
  const utf8 = await alsText('utf-8');
  // Deutscher Excel-Export ist oft Windows-1252 → Ersatzzeichen? Dann neu lesen.
  if (utf8.includes('')) return alsText('windows-1252');
  return utf8;
}

export default function DatenimportPage() {
  const [art, setArt] = useState<ImportArt>('kunden');
  const [schritt, setSchritt] = useState<Schritt>('datei');
  const [kopf, setKopf] = useState<string[]>([]);
  const [daten, setDaten] = useState<string[][]>([]);
  const [zuordnung, setZuordnung] = useState<Record<string, number>>({});
  const [einfuegen, setEinfuegen] = useState('');
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState('');
  const [ergebnis, setErgebnis] = useState<{ importiert: number; uebersprungen: number; fehler: { zeile: number; grund: string }[] } | null>(null);
  const dateiInput = useRef<HTMLInputElement>(null);

  const felder = art === 'kunden' ? KUNDEN_FELDER : MATERIAL_FELDER;

  function zuruecksetzen(neueArt?: ImportArt) {
    if (neueArt) setArt(neueArt);
    setSchritt('datei');
    setKopf([]); setDaten([]); setZuordnung({});
    setEinfuegen(''); setFehler(''); setErgebnis(null);
    if (dateiInput.current) dateiInput.current.value = '';
  }

  function csvVerarbeiten(text: string) {
    setFehler('');
    const ersteZeile = text.split(/\r?\n/, 1)[0] || '';
    const trenner = trennerRaten(ersteZeile);
    const alle = parseCsv(text, trenner);
    if (alle.length < 2) {
      setFehler('Keine Datenzeilen gefunden. Die erste Zeile muss die Überschriften enthalten, danach je Zeile ein Datensatz.');
      return;
    }
    const kopfzeile = alle[0].map((h) => h.trim());
    const zeilen = alle.slice(1);
    // Zuordnung automatisch raten
    const auto: Record<string, number> = {};
    const normKopf = kopfzeile.map(normalisieren);
    for (const f of felder) {
      auto[f.key] = -1;
      for (const kandidat of f.raten) {
        const idx = normKopf.findIndex((h) => h === normalisieren(kandidat));
        if (idx >= 0) { auto[f.key] = idx; break; }
      }
      // Teil-Treffer (z.B. „kundenname (pflicht)") als Fallback
      if (auto[f.key] === -1) {
        const idx = normKopf.findIndex((h) => f.raten.some((k) => h.includes(normalisieren(k))));
        if (idx >= 0) auto[f.key] = idx;
      }
    }
    setKopf(kopfzeile);
    setDaten(zeilen);
    setZuordnung(auto);
    setSchritt('zuordnung');
  }

  async function dateiGewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    try {
      const text = await dateiLesen(datei);
      csvVerarbeiten(text);
    } catch {
      setFehler('Datei konnte nicht gelesen werden.');
    }
  }

  function vorlageHerunterladen() {
    const blob = new Blob(['﻿' + VORLAGEN[art]], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = art === 'kunden' ? 'kunden-import-vorlage.csv' : 'material-import-vorlage.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importieren() {
    const pflicht = felder.filter((f) => f.pflicht);
    for (const f of pflicht) {
      if (zuordnung[f.key] === undefined || zuordnung[f.key] < 0) {
        setFehler(`Bitte eine Spalte für „${f.label}" zuordnen.`);
        return;
      }
    }
    setFehler('');
    setLaden(true);
    const zeilen = daten.map((z) => {
      const obj: Record<string, string> = {};
      for (const f of felder) {
        const idx = zuordnung[f.key];
        if (idx !== undefined && idx >= 0) obj[f.key] = z[idx] ?? '';
      }
      return obj;
    });
    try {
      const res = await fetch(`/api/import/${art}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: zeilen }),
      });
      const antwort = await res.json().catch(() => ({}));
      if (!res.ok && !antwort.importiert) {
        setFehler(antwort.error || 'Import fehlgeschlagen.');
        setLaden(false);
        return;
      }
      setErgebnis({
        importiert: antwort.importiert || 0,
        uebersprungen: antwort.uebersprungen || 0,
        fehler: antwort.fehler || [],
      });
      setSchritt('ergebnis');
    } catch {
      setFehler('Verbindungsfehler. Bitte erneut versuchen.');
    }
    setLaden(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Datenimport</h1>
      <p className="mt-2 text-[#6e6e73] leading-relaxed">
        Stammdaten aus Ihrer bisherigen Software übernehmen – z. B. CP-PRO, WinWorker oder Excel.
        In der Altsoftware als <strong>CSV exportieren</strong> (Excel: „Speichern unter → CSV (Trennzeichen-getrennt)"),
        hier hochladen, Spalten kurz prüfen, fertig.
      </p>

      {/* Art wählen */}
      <div className="mt-8 grid grid-cols-2 gap-3">
        <button
          onClick={() => zuruecksetzen('kunden')}
          className={`flex items-center gap-3 rounded-2xl border p-5 text-left transition
            ${art === 'kunden' ? 'border-[#e8590c] ring-2 ring-[#e8590c]/20 bg-white' : 'border-black/10 bg-white hover:border-black/25'}`}
        >
          <Users className={`w-6 h-6 ${art === 'kunden' ? 'text-[#e8590c]' : 'text-[#86868b]'}`} />
          <span>
            <span className="block font-semibold">Kunden</span>
            <span className="block text-sm text-[#86868b]">Kundenstamm mit Adressen & Kontakten</span>
          </span>
        </button>
        <button
          onClick={() => zuruecksetzen('material')}
          className={`flex items-center gap-3 rounded-2xl border p-5 text-left transition
            ${art === 'material' ? 'border-[#e8590c] ring-2 ring-[#e8590c]/20 bg-white' : 'border-black/10 bg-white hover:border-black/25'}`}
        >
          <Package className={`w-6 h-6 ${art === 'material' ? 'text-[#e8590c]' : 'text-[#86868b]'}`} />
          <span>
            <span className="block font-semibold">Material / Lager</span>
            <span className="block text-sm text-[#86868b]">Artikel mit Bestand, Preis, Lieferant</span>
          </span>
        </button>
      </div>

      {fehler && (
        <p className="mt-6 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {fehler}
        </p>
      )}

      {/* ─── Schritt 1: Datei ─── */}
      {schritt === 'datei' && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white border border-black/10 p-6">
            <h2 className="font-semibold flex items-center gap-2">
              <Upload className="w-5 h-5 text-[#e8590c]" /> CSV-Datei hochladen
            </h2>
            <input
              ref={dateiInput}
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={dateiGewaehlt}
              className="mt-4 block w-full text-sm text-[#6e6e73] file:mr-4 file:rounded-full file:border-0 file:bg-[#e8590c] file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-[#d14e06] file:cursor-pointer"
            />
            <button
              onClick={vorlageHerunterladen}
              className="mt-5 inline-flex items-center gap-2 text-sm text-[#e8590c] hover:underline underline-offset-2"
            >
              <Download className="w-4 h-4" /> Muster-Vorlage herunterladen
            </button>
          </div>
          <div className="rounded-2xl bg-white border border-black/10 p-6">
            <h2 className="font-semibold flex items-center gap-2">
              <ClipboardPaste className="w-5 h-5 text-[#e8590c]" /> Oder direkt einfügen
            </h2>
            <textarea
              value={einfuegen}
              onChange={(e) => setEinfuegen(e.target.value)}
              rows={5}
              placeholder={'CSV-Inhalt hier einfügen …\n(erste Zeile = Überschriften)'}
              className="mt-4 w-full rounded-xl border border-black/10 bg-[#fbfbfd] px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-[#e8590c]/40"
            />
            <button
              onClick={() => csvVerarbeiten(einfuegen)}
              disabled={einfuegen.trim() === ''}
              className="mt-3 rounded-full bg-[#1d1d1f] text-white text-sm font-semibold px-5 py-2.5 hover:bg-black disabled:opacity-40 transition"
            >
              Eingefügte Daten übernehmen
            </button>
          </div>
        </div>
      )}

      {/* ─── Schritt 2: Zuordnung + Vorschau ─── */}
      {schritt === 'zuordnung' && (
        <div className="mt-6 rounded-2xl bg-white border border-black/10 p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#e8590c]" />
              {daten.length.toLocaleString('de-DE')} Zeilen erkannt – Spalten prüfen
            </h2>
            <button onClick={() => zuruecksetzen()} className="text-sm text-[#86868b] hover:text-[#1d1d1f]">
              ← Andere Datei wählen
            </button>
          </div>

          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            {felder.map((f) => (
              <label key={f.key} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 font-medium">
                  {f.label}{f.pflicht && <span className="text-[#e8590c]"> *</span>}
                </span>
                <select
                  value={zuordnung[f.key] ?? -1}
                  onChange={(e) => setZuordnung({ ...zuordnung, [f.key]: Number(e.target.value) })}
                  className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm bg-[#fbfbfd] outline-none focus:ring-2 focus:ring-[#e8590c]/40"
                >
                  <option value={-1}>– nicht übernehmen –</option>
                  {kopf.map((h, i) => (
                    <option key={i} value={i}>{h || `Spalte ${i + 1}`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* Vorschau */}
          <h3 className="mt-6 font-semibold text-sm text-[#86868b] uppercase tracking-wide">Vorschau (erste 5 Zeilen)</h3>
          <div className="mt-2 overflow-x-auto rounded-xl border border-black/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f5f7] text-left">
                  {felder.filter((f) => (zuordnung[f.key] ?? -1) >= 0).map((f) => (
                    <th key={f.key} className="px-3 py-2 font-semibold whitespace-nowrap">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {daten.slice(0, 5).map((z, zi) => (
                  <tr key={zi} className="border-t border-black/5">
                    {felder.filter((f) => (zuordnung[f.key] ?? -1) >= 0).map((f) => (
                      <td key={f.key} className="px-3 py-2 whitespace-nowrap">{z[zuordnung[f.key]] || '–'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={importieren}
            disabled={laden}
            className="mt-6 w-full rounded-full bg-[#e8590c] hover:bg-[#d14e06] disabled:opacity-60 text-white font-semibold py-3.5 transition flex items-center justify-center gap-2"
          >
            {laden && <Loader2 className="w-4 h-4 animate-spin" />}
            {daten.length.toLocaleString('de-DE')} {art === 'kunden' ? 'Kunden' : 'Artikel'} importieren
          </button>
          <p className="mt-3 text-center text-xs text-[#86868b]">
            Bereits vorhandene Einträge (gleiche Artikelnummer bzw. gleicher Name+PLZ+Ort) werden automatisch übersprungen.
          </p>
        </div>
      )}

      {/* ─── Schritt 3: Ergebnis ─── */}
      {schritt === 'ergebnis' && ergebnis && (
        <div className="mt-6 rounded-2xl bg-white border border-black/10 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h2 className="mt-4 text-xl font-semibold">Import abgeschlossen</h2>
          <p className="mt-2 text-[#6e6e73]">
            <strong className="text-emerald-600">{ergebnis.importiert.toLocaleString('de-DE')}</strong> importiert
            {ergebnis.uebersprungen > 0 && (
              <> · <strong>{ergebnis.uebersprungen.toLocaleString('de-DE')}</strong> übersprungen (bereits vorhanden)</>
            )}
            {ergebnis.fehler.length > 0 && (
              <> · <strong className="text-red-600">{ergebnis.fehler.length.toLocaleString('de-DE')}</strong> mit Fehlern</>
            )}
          </p>
          {ergebnis.fehler.length > 0 && (
            <div className="mt-4 max-h-48 overflow-y-auto rounded-xl bg-red-50 border border-red-200 p-4 text-left text-sm text-red-700">
              {ergebnis.fehler.slice(0, 50).map((f, i) => (
                <p key={i}>Zeile {f.zeile + 1}: {f.grund}</p>
              ))}
              {ergebnis.fehler.length > 50 && <p>… und {ergebnis.fehler.length - 50} weitere</p>}
            </div>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => zuruecksetzen()}
              className="rounded-full border border-black/15 px-5 py-2.5 text-sm font-semibold hover:border-black/40 transition"
            >
              Weiteren Import starten
            </button>
            <a
              href="/datenpflege"
              className="rounded-full bg-[#1d1d1f] text-white px-5 py-2.5 text-sm font-semibold hover:bg-black transition"
            >
              Daten in der Datenpflege ansehen
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
