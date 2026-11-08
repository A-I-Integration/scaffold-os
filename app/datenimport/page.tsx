'use client';

import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, ClipboardPaste, Download, Loader2, CheckCircle2, AlertTriangle, Users, Package, HardHat, Receipt, Info } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Wechsel-Import (Datenübernahme aus Altsoftware wie CP-PRO, WinWorker, SORBA, Excel)
//
// Reihenfolge: 1 Kunden → 2 Baustellen → 3 Rechnungen (Material/Lager unabhängig).
// Jeder Bereich: Datei (CSV/Excel) → Spalten zuordnen → PRÜFUNG (Trockenlauf, nichts wird geschrieben)
// → Importieren → Protokoll zum Herunterladen.
// Kundennummer und Projektnummer der Altsoftware werden gespeichert und verknüpfen Baustellen und Rechnungen
// sicher mit dem richtigen Kunden; ein zweiter Import legt nichts doppelt an.
// Server: /api/import/{kunden|baustellen|rechnungen|material} (nur admin/disponent).
// ============================================================

type ImportArt = 'kunden' | 'material' | 'baustellen' | 'rechnungen';

interface FeldDef {
  key: string;
  label: string;
  pflicht?: boolean;
  /** Mindestens eines der Felder mit derselben Gruppe muss zugeordnet sein (z. B. Kunde: Name ODER Kundennummer) */
  gruppe?: string;
  /** Kurzer Hinweis unter dem Feld */
  hilfe?: string;
  // Header-Namen (kleingeschrieben, ohne Umlaute), die automatisch erkannt werden
  raten: string[];
}

const NR_RATEN = ['kundennummer', 'kundennr', 'kdnr', 'kdnummer', 'kundenr', 'debitorennummer', 'debitornr', 'debitor', 'adressnummer', 'adressnr', 'knr'];

const KUNDEN_FELDER: FeldDef[] = [
  { key: 'alt_nummer', label: 'Kundennummer (Altsoftware)', raten: NR_RATEN, hilfe: 'Empfohlen: Damit werden Baustellen und Rechnungen sicher dem richtigen Kunden zugeordnet.' },
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

const BAUSTELLEN_FELDER: FeldDef[] = [
  { key: 'kunde_nr', label: 'Kundennummer (Altsoftware)', gruppe: 'kunde', raten: NR_RATEN, hilfe: 'Sicherste Zuordnung zum Kunden – Name oder Nummer genügt.' },
  { key: 'kunde', label: 'Kunde (Name wie im Kundenstamm)', gruppe: 'kunde', raten: ['kunde', 'kundenname', 'auftraggeber', 'firma', 'name1'] },
  { key: 'name', label: 'Baustelle / Bauvorhaben', pflicht: true, raten: ['baustelle', 'bauvorhaben', 'projekt', 'objekt', 'projektname', 'bv', 'bezeichnung'] },
  { key: 'nummer', label: 'Baustellen-/Projektnummer', raten: ['projektnummer', 'projektnr', 'baustellennummer', 'baustellennr', 'bvnr', 'bvnummer', 'auftragsnummer', 'auftragsnr', 'objektnummer', 'objektnr'], hilfe: 'Verhindert Doppelanlage bei erneutem Import und verknüpft Rechnungen.' },
  { key: 'adresse', label: 'Adresse der Baustelle', raten: ['adresse', 'baustellenadresse', 'objektadresse', 'anschrift', 'strasse'] },
  { key: 'beginn', label: 'Beginn', raten: ['beginn', 'start', 'von', 'baubeginn'] },
  { key: 'ende', label: 'Ende', raten: ['ende', 'bis', 'bauende'] },
  { key: 'aufbau', label: 'Aufbau (geplant)', raten: ['aufbau', 'aufbaudatum', 'aufbautermin'] },
  { key: 'mietbeginn', label: 'Mietbeginn', raten: ['mietbeginn', 'mietstart', 'mietvon', 'vermietungsbeginn'] },
  { key: 'mietende', label: 'Mietende', raten: ['mietende', 'mietbis', 'vermietungsende', 'abbau', 'abbaudatum'] },
  { key: 'vertragsende', label: 'Vertragsende', raten: ['vertragsende', 'laufzeitende', 'vertragsablauf', 'vertragbis'] },
  { key: 'status', label: 'Status (abgeschlossen / aktiv)', raten: ['status', 'zustand', 'erledigt', 'abgeschlossen'] },
];

const RECHNUNGEN_FELDER: FeldDef[] = [
  { key: 'nummer', label: 'Rechnungsnummer', pflicht: true, raten: ['rechnungsnummer', 'rechnungsnr', 'rechnung', 'renr', 're-nr', 'nummer', 'belegnummer', 'belegnr'] },
  { key: 'kunde_nr', label: 'Kundennummer (Altsoftware)', gruppe: 'kunde', raten: NR_RATEN },
  { key: 'kunde', label: 'Kunde (Name wie im Kundenstamm)', gruppe: 'kunde', raten: ['kunde', 'kundenname', 'firma', 'name1', 'debitor'] },
  { key: 'datum', label: 'Rechnungsdatum', pflicht: true, raten: ['datum', 'rechnungsdatum', 'belegdatum', 'redatum'] },
  { key: 'netto', label: 'Netto', raten: ['netto', 'nettobetrag', 'summe netto', 'nettosumme'] },
  { key: 'brutto', label: 'Brutto', raten: ['brutto', 'bruttobetrag', 'gesamt', 'endbetrag', 'rechnungsbetrag'] },
  { key: 'steuersatz', label: 'USt-Satz (%)', raten: ['ust', 'mwst', 'steuersatz', 'ust-satz', 'mwst-satz'] },
  { key: 'faelligkeit', label: 'Fällig am', raten: ['faelligkeit', 'fallig', 'falligkeit', 'zahlungsziel', 'falligam'] },
  { key: 'offen', label: 'Offener Betrag', raten: ['offen', 'offenerbetrag', 'restbetrag', 'saldo', 'op'] },
  { key: 'bezahlt', label: 'Bezahlt (Betrag)', raten: ['bezahlt', 'gezahlt', 'zahlung', 'zahlbetrag'] },
  { key: 'status', label: 'Status (bezahlt / offen / storniert)', raten: ['status', 'zahlstatus', 'zustand'] },
  { key: 'projekt_nr', label: 'Baustellen-/Projektnummer', raten: ['projektnummer', 'projektnr', 'baustellennummer', 'baustellennr', 'bvnr', 'auftragsnummer', 'auftragsnr'] },
  { key: 'baustelle', label: 'Baustelle', raten: ['baustelle', 'bauvorhaben', 'projekt', 'objekt'] },
  { key: 'bezeichnung', label: 'Leistungstext', raten: ['leistung', 'bezeichnung', 'text', 'betreff'] },
];

const VORLAGEN: Record<ImportArt, string> = {
  kunden: 'Kundennummer;Name;Ansprechpartner;E-Mail;Telefon;Straße;PLZ;Ort;Notizen\n10045;Musterbau GmbH;Herr Müller;info@musterbau.de;02561/12345;Musterstraße 12;48691;Vreden;Stammkunde seit 2020',
  material: 'Bezeichnung;Artikelnummer;Kategorie;Bestand;Einheit;Preis;Mindestbestand;Lieferant;Lagerort\nStahlrahmen 73 1,00 m;SR-73-100;Rahmen;500;Stk;18,50;50;Layher;Halle 1 / Regal A',
  baustellen: 'Kundennummer;Kunde;Projektnummer;Baustelle;Adresse;Beginn;Ende;Aufbau;Mietbeginn;Mietende;Vertragsende;Status\n10045;Musterbau GmbH;P-2026-014;Wohnanlage Nord;Hauptstraße 5, 48691 Vreden;01.03.2026;30.06.2032;15.06.2026;01.07.2026;30.06.2032;31.12.2032;aktiv',
  rechnungen: 'Rechnungsnummer;Kundennummer;Kunde;Projektnummer;Datum;Netto;USt;Fällig am;Offen;Baustelle;Leistung\n2025-0412;10045;Musterbau GmbH;P-2026-014;15.11.2025;12500,00;19;15.12.2025;14875,00;Wohnanlage Nord;Gerüstarbeiten gemäß Auftrag',
};

type Schritt = 'datei' | 'zuordnung' | 'pruefung' | 'ergebnis';

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
  // Deutscher Excel-Export ist oft Windows-1252: Ungültiges UTF-8 wird beim
  // Lesen zum Ersatzzeichen U+FFFD → dann als Windows-1252 neu lesen.
  // (Früher stand hier includes('') – das ist IMMER wahr, dadurch wurden auch
  // gültige UTF-8-Dateien falsch gelesen: „Geländer" → „GelÃ¤nder".)
  if (utf8.includes('\uFFFD')) return alsText('windows-1252');
  return utf8;
}


const FELDER: Record<ImportArt, FeldDef[]> = { kunden: KUNDEN_FELDER, material: MATERIAL_FELDER, baustellen: BAUSTELLEN_FELDER, rechnungen: RECHNUNGEN_FELDER };
const NAMEN: Record<ImportArt, string> = { kunden: 'Kunden', material: 'Artikel', baustellen: 'Baustellen', rechnungen: 'Rechnungen' };
const QUELLEN = ['CP-PRO', 'WinWorker', 'SORBA', 'Excel / andere Software'];

interface Antwort {
  trockenlauf?: boolean;
  neu?: number;
  importiert: number;
  uebersprungen: number;
  fehler: { zeile: number; grund: string }[];
  hinweise?: { zeile: number; text: string }[];
  zeitklassen?: { historisch: number; aktiv: number; geplant: number; unbekannt: number };
  summen?: { brutto: number; offen: number };
}

const SCHRITTE: { art: ImportArt; nr: string; titel: string; text: string; icon: typeof Users }[] = [
  { art: 'kunden', nr: '1', titel: 'Kunden', text: 'Stammdaten, Adressen, Kundennummer', icon: Users },
  { art: 'baustellen', nr: '2', titel: 'Baustellen', text: 'Bauvorhaben mit Mietzeiträumen, auch zukünftige', icon: HardHat },
  { art: 'rechnungen', nr: '3', titel: 'Rechnungen', text: 'Altbestand und offene Posten', icon: Receipt },
  { art: 'material', nr: '+', titel: 'Material / Lager', text: 'Artikel mit Bestand und Preis', icon: Package },
];

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const zahl = (n: number) => n.toLocaleString('de-DE');

export default function DatenimportPage() {
  const [art, setArt] = useState<ImportArt>('kunden');
  const [schritt, setSchritt] = useState<Schritt>('datei');
  const [quelle, setQuelle] = useState(QUELLEN[0]);
  const [dateiname, setDateiname] = useState('');
  const [kopf, setKopf] = useState<string[]>([]);
  const [daten, setDaten] = useState<string[][]>([]);
  const [zuordnung, setZuordnung] = useState<Record<string, number>>({});
  const [einfuegen, setEinfuegen] = useState('');
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState('');
  const [pruefung, setPruefung] = useState<Antwort | null>(null);
  const [ergebnis, setErgebnis] = useState<Antwort | null>(null);
  const [erledigt, setErledigt] = useState<ImportArt[]>([]);
  const dateiInput = useRef<HTMLInputElement>(null);

  const felder = FELDER[art];

  function zuruecksetzen(neueArt?: ImportArt) {
    if (neueArt) setArt(neueArt);
    setSchritt('datei');
    setKopf([]); setDaten([]); setZuordnung({}); setDateiname('');
    setEinfuegen(''); setFehler(''); setPruefung(null); setErgebnis(null);
    if (dateiInput.current) dateiInput.current.value = '';
  }

  function csvVerarbeiten(text: string, name = '') {
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
    // Zuordnung automatisch raten: erst alle genauen Treffer, dann Teil-Treffer in noch freien Spalten
    const auto: Record<string, number> = {};
    const belegt = new Set<number>();
    const normKopf = kopfzeile.map(normalisieren);
    for (const f of felder) {
      auto[f.key] = -1;
      for (const kandidat of f.raten) {
        const idx = normKopf.findIndex((h, i) => !belegt.has(i) && h === normalisieren(kandidat));
        if (idx >= 0) { auto[f.key] = idx; belegt.add(idx); break; }
      }
    }
    for (const f of felder) {
      if (auto[f.key] !== -1) continue;
      const idx = normKopf.findIndex((h, i) => !belegt.has(i) && h.length > 0 && f.raten.some((k) => h.includes(normalisieren(k))));
      if (idx >= 0) { auto[f.key] = idx; belegt.add(idx); }
    }
    setKopf(kopfzeile);
    setDaten(zeilen);
    setZuordnung(auto);
    setDateiname(name);
    setSchritt('zuordnung');
  }

  async function dateiGewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    try {
      if (/\.xlsx?$/i.test(datei.name)) {
        // Excel-Datei: erstes Blatt wie angezeigt als Text lesen
        const XLSX = await import('xlsx');
        const mappe = XLSX.read(await datei.arrayBuffer(), { type: 'array' });
        const blatt = mappe.Sheets[mappe.SheetNames[0]];
        if (!blatt) { setFehler('Die Excel-Datei enthält kein Tabellenblatt.'); return; }
        csvVerarbeiten(XLSX.utils.sheet_to_csv(blatt, { FS: ';', blankrows: false }), datei.name);
        return;
      }
      const text = await dateiLesen(datei);
      csvVerarbeiten(text, datei.name);
    } catch {
      setFehler('Datei konnte nicht gelesen werden.');
    }
  }

  function vorlageHerunterladen() {
    const blob = new Blob(['\uFEFF' + VORLAGEN[art]], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${art}-import-vorlage.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Fehlende Pflichtangaben der Zuordnung; leer = in Ordnung */
  function zuordnungFehler(): string {
    for (const f of felder.filter((x) => x.pflicht)) {
      if ((zuordnung[f.key] ?? -1) < 0) return `Bitte eine Spalte für „${f.label}" zuordnen.`;
    }
    const gruppen = [...new Set(felder.filter((x) => x.gruppe).map((x) => x.gruppe as string))];
    for (const g of gruppen) {
      const mitglieder = felder.filter((x) => x.gruppe === g);
      if (!mitglieder.some((m) => (zuordnung[m.key] ?? -1) >= 0)) return `Bitte mindestens eine Spalte zuordnen: ${mitglieder.map((m) => `„${m.label}"`).join(' oder ')}.`;
    }
    return '';
  }

  async function senden(trockenlauf: boolean) {
    const f = zuordnungFehler();
    if (f) { setFehler(f); return; }
    setFehler('');
    setLaden(true);
    const zeilen = daten.map((z) => {
      const obj: Record<string, string> = {};
      for (const fd of felder) {
        const idx = zuordnung[fd.key];
        if (idx !== undefined && idx >= 0) obj[fd.key] = z[idx] ?? '';
      }
      return obj;
    });
    try {
      const res = await fetch(`/api/import/${art}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: zeilen, dryRun: trockenlauf, quelle, dateiname }),
      });
      const antwort = await res.json().catch(() => ({}));
      if (!res.ok && !antwort.importiert && !antwort.trockenlauf) {
        setFehler(antwort.error || 'Vorgang fehlgeschlagen.');
        setLaden(false);
        return;
      }
      const a: Antwort = {
        trockenlauf: antwort.trockenlauf, neu: antwort.neu, importiert: antwort.importiert || 0, uebersprungen: antwort.uebersprungen || 0,
        fehler: antwort.fehler || [], hinweise: antwort.hinweise || [], zeitklassen: antwort.zeitklassen, summen: antwort.summen,
      };
      if (trockenlauf) { setPruefung(a); setSchritt('pruefung'); }
      else {
        setErgebnis(a); setSchritt('ergebnis');
        setErledigt((e) => (e.includes(art) ? e : [...e, art]));
      }
    } catch {
      setFehler('Verbindungsfehler. Bitte erneut versuchen.');
    }
    setLaden(false);
  }

  function protokollHerunterladen(a: Antwort) {
    const q = (t: string) => `"${t.replace(/"/g, '""')}"`;
    const zeilen = [
      'Zeile;Art;Meldung',
      ...a.fehler.map((f) => `${f.zeile + 1};Fehler;${q(f.grund)}`),
      ...(a.hinweise ?? []).map((h) => `${h.zeile > 0 ? h.zeile + 1 : ''};Hinweis;${q(h.text)}`),
    ];
    const blob = new Blob(['\uFEFF' + zeilen.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `import-protokoll-${art}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const naechster = SCHRITTE.find((s) => s.nr !== '+' && !erledigt.includes(s.art) && s.art !== art);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Wechsel-Import</h1>
      <p className="mt-2 text-[#5d6873] leading-relaxed max-w-3xl">
        Daten aus Ihrer bisherigen Software übernehmen. Exportieren Sie dort die Listen als <strong>Excel oder CSV</strong>,
        laden Sie sie hier in der angegebenen Reihenfolge hoch, prüfen Sie das Ergebnis – erst dann wird importiert.
        Nichts wird überschrieben, Vorhandenes wird übersprungen.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <label className="font-medium" htmlFor="quelle">Bisherige Software</label>
        <select id="quelle" value={quelle} onChange={(e) => setQuelle(e.target.value)} className="rounded border border-[var(--os-linie)] bg-white px-3 py-2">
          {QUELLEN.map((q) => <option key={q}>{q}</option>)}
        </select>
        <span className="text-[#5d6873]">wird im Import-Protokoll vermerkt</span>
      </div>

      {/* Reihenfolge */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SCHRITTE.map((st) => {
          const aktiv = art === st.art;
          const fertig = erledigt.includes(st.art);
          return (
            <button key={st.art} onClick={() => zuruecksetzen(st.art)}
              className={`flex items-start gap-3 rounded-md border p-4 text-left transition ${aktiv ? 'border-[var(--os-akzent)] bg-white ring-2 ring-[var(--os-akzent)]/20' : 'border-[var(--os-linie)] bg-white hover:border-[#8a95a0]'}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-[14px] font-semibold ${fertig ? 'bg-emerald-600 text-white' : aktiv ? 'bg-[#171b20] text-white' : 'bg-[#eef0f3] text-[#303944]'}`}>
                {fertig ? '✓' : st.nr}
              </span>
              <span>
                <span className="block font-semibold">{st.titel}</span>
                <span className="block text-sm text-[#5d6873]">{st.text}</span>
              </span>
            </button>
          );
        })}
      </div>
      {(art === 'baustellen' || art === 'rechnungen') && !erledigt.includes('kunden') && (
        <p className="mt-3 flex items-start gap-2 text-sm text-[#5d6873]"><Info className="mt-0.5 h-4 w-4 shrink-0" /> Importieren Sie zuerst die Kunden – {art === 'baustellen' ? 'Baustellen' : 'Rechnungen'} werden über Kundennummer oder Name zugeordnet.</p>
      )}

      {fehler && (
        <p className="mt-6 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {fehler}
        </p>
      )}

      {/* ─── Schritt 1: Datei ─── */}
      {schritt === 'datei' && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <div className="rounded-md bg-white border border-[var(--os-linie)] p-6">
            <h2 className="font-semibold flex items-center gap-2">
              <Upload className="w-5 h-5 text-[var(--os-akzent)]" /> Excel- oder CSV-Datei hochladen
            </h2>
            <input ref={dateiInput} type="file" accept=".csv,.xlsx,.xls,text/csv,text/plain" onChange={dateiGewaehlt}
              className="mt-4 block w-full text-sm text-[#5d6873] file:mr-4 file:rounded file:border-0 file:bg-[#171b20] file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-[#303944]" />
            <p className="mt-3 text-sm text-[#5d6873]">Die erste Zeile muss die Spaltenüberschriften enthalten. Bei Excel wird das erste Tabellenblatt gelesen.</p>
            <button onClick={vorlageHerunterladen} className="mt-4 inline-flex items-center gap-2 text-sm text-[#b8470a] hover:underline underline-offset-2">
              <Download className="w-4 h-4" /> Muster-Vorlage für {NAMEN[art]} herunterladen
            </button>
          </div>
          <div className="rounded-md bg-white border border-[var(--os-linie)] p-6">
            <h2 className="font-semibold flex items-center gap-2">
              <ClipboardPaste className="w-5 h-5 text-[var(--os-akzent)]" /> Oder direkt einfügen
            </h2>
            <textarea value={einfuegen} onChange={(e) => setEinfuegen(e.target.value)} rows={5}
              placeholder={'Tabelle hier einfügen …\n(erste Zeile = Überschriften)'}
              className="mt-4 w-full rounded border border-[var(--os-linie)] bg-[#f6f7f9] px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-[var(--os-akzent)]/40" />
            <button onClick={() => csvVerarbeiten(einfuegen, 'Eingefügt')} disabled={einfuegen.trim() === ''}
              className="mt-3 rounded bg-[#171b20] text-white text-sm font-semibold px-5 py-2.5 hover:bg-[#303944] disabled:opacity-40 transition">
              Eingefügte Daten übernehmen
            </button>
          </div>
          <div className="md:col-span-2 rounded-md border border-[var(--os-linie)] bg-[#f6f7f9] p-5 text-sm text-[#303944]">
            <b>Wichtig für einen sauberen Wechsel</b>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[#5d6873]">
              <li>Exportieren Sie – wenn möglich – die <b>Kundennummer</b> und bei Baustellen die <b>Projektnummer</b> mit. Damit werden Baustellen und Rechnungen sicher zugeordnet und ein erneuter Import legt nichts doppelt an.</li>
              <li>Bei Baustellen sind <b>Aufbau, Mietbeginn, Mietende und Vertragsende</b> möglich. Laufende und zukünftige Baustellen bleiben dadurch aktiv bzw. geplant und werden nicht als abgeschlossen übernommen.</li>
              <li>Rechnungen bleiben mit ihrer ursprünglichen Nummer erhalten und stören den laufenden Nummernkreis nicht. Offene Beträge bleiben für Mahnwesen und Zahlungsverfolgung erhalten.</li>
            </ul>
          </div>
        </div>
      )}

      {/* ─── Schritt 2: Zuordnung + Vorschau ─── */}
      {schritt === 'zuordnung' && (
        <div className="mt-6 rounded-md bg-white border border-[var(--os-linie)] p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[var(--os-akzent)]" />
              {zahl(daten.length)} Zeilen erkannt{dateiname ? ` (${dateiname})` : ''} – Spalten prüfen
            </h2>
            <button onClick={() => zuruecksetzen()} className="text-sm text-[#5d6873] hover:text-[#171b20]">← Andere Datei wählen</button>
          </div>
          <p className="mt-2 text-sm text-[#5d6873]">Die Zuordnung wurde automatisch erkannt. Bitte kurz kontrollieren und bei Bedarf ändern.</p>

          <div className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-4">
            {felder.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="flex items-center gap-2 font-medium">
                  {f.label}{f.pflicht && <span className="text-[#b8470a]"> *</span>}
                  {f.gruppe && <span className="rounded bg-[#eef0f3] px-1.5 text-[11px] font-normal text-[#5d6873]">eines davon</span>}
                </span>
                <select value={zuordnung[f.key] ?? -1} onChange={(e) => setZuordnung({ ...zuordnung, [f.key]: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-[var(--os-linie)] px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[var(--os-akzent)]/40">
                  <option value={-1}>– nicht übernehmen –</option>
                  {kopf.map((h, i) => <option key={i} value={i}>{h || `Spalte ${i + 1}`}</option>)}
                </select>
                {f.hilfe && <span className="mt-0.5 block text-xs text-[#5d6873]">{f.hilfe}</span>}
              </label>
            ))}
          </div>

          <h3 className="mt-6 font-semibold text-sm text-[#5d6873] uppercase tracking-wide">Vorschau (erste 5 Zeilen)</h3>
          <div className="mt-2 overflow-x-auto rounded border border-[var(--os-linie)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  {felder.filter((f) => (zuordnung[f.key] ?? -1) >= 0).map((f) => <th key={f.key} className="px-3 py-2 whitespace-nowrap">{f.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {daten.slice(0, 5).map((z, zi) => (
                  <tr key={zi} className="border-t border-[var(--os-linie)]">
                    {felder.filter((f) => (zuordnung[f.key] ?? -1) >= 0).map((f) => <td key={f.key} className="px-3 py-2 whitespace-nowrap">{z[zuordnung[f.key]] || '–'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={() => senden(true)} disabled={laden}
            className="mt-6 w-full rounded bg-[var(--os-akzent)] hover:bg-[#d9661f] disabled:opacity-60 text-[#171b20] font-semibold py-3.5 transition flex items-center justify-center gap-2">
            {laden && <Loader2 className="w-4 h-4 animate-spin" />}
            Prüfen, ohne zu importieren
          </button>
          <p className="mt-3 text-center text-xs text-[#5d6873]">Im nächsten Schritt sehen Sie genau, was neu angelegt wird, was übersprungen wird und welche Zeilen Probleme haben. Es wird noch nichts gespeichert.</p>
        </div>
      )}

      {/* ─── Schritt 3: Prüfung (Trockenlauf) ─── */}
      {schritt === 'pruefung' && pruefung && (
        <div className="mt-6 rounded-md bg-white border border-[var(--os-linie)] p-6">
          <h2 className="font-semibold">Prüfung abgeschlossen – es wurde noch nichts gespeichert</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kachel titel="Werden angelegt" wert={zahl(pruefung.neu ?? 0)} farbe="text-emerald-700" />
            <Kachel titel="Bereits vorhanden" wert={zahl(pruefung.uebersprungen)} farbe="text-[#303944]" />
            <Kachel titel="Fehlerhafte Zeilen" wert={zahl(pruefung.fehler.length)} farbe={pruefung.fehler.length ? 'text-red-700' : 'text-[#303944]'} />
            <Kachel titel="Hinweise" wert={zahl(pruefung.hinweise?.length ?? 0)} farbe={pruefung.hinweise?.length ? 'text-[#b8470a]' : 'text-[#303944]'} />
          </div>
          {pruefung.zeitklassen && (
            <p className="mt-4 text-sm text-[#303944]">
              Zeitraum der neuen Baustellen: <b>{pruefung.zeitklassen.aktiv}</b> laufend · <b>{pruefung.zeitklassen.geplant}</b> geplant (Start in der Zukunft) · <b>{pruefung.zeitklassen.historisch}</b> abgeschlossen/Archiv · <b>{pruefung.zeitklassen.unbekannt}</b> ohne Datum
            </p>
          )}
          {pruefung.summen && (
            <p className="mt-4 text-sm text-[#303944]">
              Rechnungssumme (brutto) der neuen Rechnungen: <b>{eur(pruefung.summen.brutto)}</b> · davon noch offen: <b>{eur(pruefung.summen.offen)}</b>. Bitte mit der Auswertung der Altsoftware vergleichen.
            </p>
          )}
          <Meldungen fehler={pruefung.fehler} hinweise={pruefung.hinweise ?? []} />
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => setSchritt('zuordnung')} className="rounded border border-[var(--os-linie)] px-5 py-2.5 text-sm font-semibold hover:bg-[#eef0f3]">← Zuordnung ändern</button>
            {(pruefung.fehler.length > 0 || (pruefung.hinweise?.length ?? 0) > 0) && (
              <button onClick={() => protokollHerunterladen(pruefung)} className="inline-flex items-center gap-2 rounded border border-[var(--os-linie)] px-5 py-2.5 text-sm font-semibold hover:bg-[#eef0f3]"><Download className="h-4 w-4" /> Liste herunterladen</button>
            )}
            <button onClick={() => senden(false)} disabled={laden || (pruefung.neu ?? 0) === 0}
              className="ml-auto inline-flex items-center gap-2 rounded bg-[var(--os-akzent)] px-6 py-2.5 text-sm font-semibold text-[#171b20] hover:bg-[#d9661f] disabled:opacity-40">
              {laden && <Loader2 className="h-4 w-4 animate-spin" />}
              {zahl(pruefung.neu ?? 0)} {NAMEN[art]} jetzt importieren
            </button>
          </div>
          {pruefung.fehler.length > 0 && <p className="mt-3 text-xs text-[#5d6873]">Zeilen mit Fehlern werden nicht importiert. Sie können die Datei korrigieren und erneut prüfen – bereits vorhandene Einträge werden dann automatisch übersprungen.</p>}
        </div>
      )}

      {/* ─── Schritt 4: Ergebnis ─── */}
      {schritt === 'ergebnis' && ergebnis && (
        <div className="mt-6 rounded-md bg-white border border-[var(--os-linie)] p-8">
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h2 className="mt-4 text-xl font-semibold">Import abgeschlossen</h2>
            <p className="mt-2 text-[#5d6873]">
              <strong className="text-emerald-700">{zahl(ergebnis.importiert)}</strong> {NAMEN[art]} importiert
              {ergebnis.uebersprungen > 0 && <> · <strong>{zahl(ergebnis.uebersprungen)}</strong> übersprungen (bereits vorhanden)</>}
              {ergebnis.fehler.length > 0 && <> · <strong className="text-red-700">{zahl(ergebnis.fehler.length)}</strong> mit Fehlern</>}
            </p>
            <p className="mt-1 text-xs text-[#5d6873]">Der Import wurde im Import-Protokoll vermerkt.</p>
          </div>
          <Meldungen fehler={ergebnis.fehler} hinweise={ergebnis.hinweise ?? []} />
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {(ergebnis.fehler.length > 0 || (ergebnis.hinweise?.length ?? 0) > 0) && (
              <button onClick={() => protokollHerunterladen(ergebnis)} className="inline-flex items-center gap-2 rounded border border-[var(--os-linie)] px-5 py-2.5 text-sm font-semibold hover:bg-[#eef0f3]"><Download className="h-4 w-4" /> Protokoll herunterladen</button>
            )}
            {naechster && (
              <button onClick={() => zuruecksetzen(naechster.art)} className="rounded bg-[var(--os-akzent)] px-5 py-2.5 text-sm font-semibold text-[#171b20] hover:bg-[#d9661f]">Weiter mit {naechster.titel}</button>
            )}
            <button onClick={() => zuruecksetzen()} className="rounded border border-[var(--os-linie)] px-5 py-2.5 text-sm font-semibold hover:bg-[#eef0f3]">Weiteren Import starten</button>
            <a href="/datenpflege" className="rounded bg-[#171b20] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#303944]">Daten ansehen</a>
          </div>
        </div>
      )}
    </div>
  );
}

function Kachel({ titel, wert, farbe }: { titel: string; wert: string; farbe: string }) {
  return (
    <div className="rounded border border-[var(--os-linie)] border-t-2 border-t-[#171b20] p-4">
      <p className="text-xs uppercase tracking-wide text-[#5d6873]">{titel}</p>
      <p className={`mt-1 text-2xl font-semibold ${farbe}`}>{wert}</p>
    </div>
  );
}

function Meldungen({ fehler, hinweise }: { fehler: { zeile: number; grund: string }[]; hinweise: { zeile: number; text: string }[] }) {
  return (
    <>
      {fehler.length > 0 && (
        <div className="mt-5 max-h-56 overflow-y-auto rounded border border-red-200 bg-red-50 p-4 text-left text-sm text-red-700">
          <p className="mb-1 font-semibold">Fehler (diese Zeilen werden nicht importiert)</p>
          {fehler.slice(0, 100).map((f, i) => <p key={i}>Zeile {f.zeile + 1}: {f.grund}</p>)}
          {fehler.length > 100 && <p>… und {fehler.length - 100} weitere (siehe Download)</p>}
        </div>
      )}
      {hinweise.length > 0 && (
        <div className="mt-4 max-h-56 overflow-y-auto rounded border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
          <p className="mb-1 font-semibold">Hinweise (bitte ansehen, die Zeilen werden trotzdem importiert)</p>
          {hinweise.slice(0, 100).map((h, i) => <p key={i}>{h.zeile > 0 ? `Zeile ${h.zeile + 1}: ` : ''}{h.text}</p>)}
          {hinweise.length > 100 && <p>… und {hinweise.length - 100} weitere (siehe Download)</p>}
        </div>
      )}
    </>
  );
}
