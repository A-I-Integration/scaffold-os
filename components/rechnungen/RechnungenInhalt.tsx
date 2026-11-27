'use client';

import { berechneForderung, statusJe, FORDERUNGSSTATUS_LABEL, type ForderungsStatus } from '@/lib/forderung';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchRechnungAnlegen } from '@/lib/rechnung-anlegen-client'
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { WIN } from '@/components/win/Win';
import { useRechnungVersenden } from '@/components/RechnungVersendenDialog';
import { versandJeRechnung, versandStandFuer, type VersandEintrag } from '@/lib/versand-status';
import {
  generateInvoicePDF, fmtEur, fmtDate,
  type Invoice, type Position,
} from '@/lib/invoice-pdf';
import {
  FileText, Plus, X, Download, Trash2, Check, Euro, Mail, AlertTriangle, Link2, Paperclip,
} from 'lucide-react';
import { lokalesDatumIso, datumPlusTage } from '@/lib/datum';
import AnhangDialog from '@/components/rechnung/AnhangDialog';
import RechnungAktionen from '@/components/RechnungAktionen';
import { manuelleAktionen, mahnStatusText, tageUeberfaellig, AKTION_LABEL } from '@/lib/mahnung-steuerung';
import PositionDetails from '@/components/rechnung/PositionDetails';
import { ENTSCHEIDUNG_LABEL, type PruefEntscheidung } from '@/lib/rechnung-pruefung';
import { preisMitFaktor } from '@/lib/rechnung-position';
import { korrekturkette } from '@/lib/abrechnung-pruefung';
import { steuerVorschlagFuerBaustelle } from '@/lib/land';
import { RegieUebernahme } from '@/components/RegieberichtBlock';
import AbzurechnenUebernahme, { type UebernommenerPosten } from '@/components/baustelle/AbzurechnenUebernahme';
import { aufRechnungVorhanden } from '@/lib/abrechnungsposten';
import { fetchMitSchluessel } from '@/lib/idempotenz-client'

// ============================================================
// SCAFFOLD OS – Rechnungsmodul (Phase 13)
//
// Für admin / disponent (wird zusätzlich in /api/invoices erzwungen).
//
// • Rechnungen aus Angebot oder manuell anlegen
// • Fortlaufende Rechnungsnummern aus der Datenbank (RE-2026-0001 …)
// • §14-UStG-PDF im Angebots-Design (blauer Kopf, autoTable)
// • Status: offen / bezahlt / überfällig / storniert
// • DATEV-Buchungsstapel-Export (EXTF-CSV, Formatversion 700)
//
// DATEV-Hinweis: Berater-/Mandantennummer und Kontenrahmen
// (SKR 03: Erlöskonto 8400 / SKR 04: 4400) unten als Konstanten –
// bitte mit dem Steuerberater abstimmen.
// ============================================================

// ─── DATEV-Konfiguration (mit Steuerberater abstimmen!) ───
const DATEV_BERATER_NR = '1000';      // Beraternummer
const DATEV_MANDANT_NR = '1';         // Mandantennummer
const DATEV_DEBITOR_START = 10000;    // Debitoren-Sammelkonto
const DATEV_ERLOESKONTO_19 = '8400';  // Erlöse 19 % USt (SKR 03)
const DATEV_ERLOESKONTO_7 = '8300';   // Erlöse 7 % USt (SKR 03)
// FIX (Bug-Report): Für 0 % USt gibt es in SKR 03 mehrere mögliche Konten
// je nach Grund der Steuerfreiheit (z.B. innergemeinschaftlich, Export,
// §13b-Bauleistung/Reverse-Charge – bei Gerüstbau nicht unüblich). Ohne
// Rücksprache mit dem Steuerberater KEIN Konto raten – 0%-Rechnungen
// werden daher beim Export ausgeschlossen und der Anwenderin explizit
// gemeldet, statt ein möglicherweise falsches Konto zu bebuchen.
const DATEV_SACHKONTENLAENGE = '4';

const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen',
  bezahlt: 'Bezahlt',
  ueberfaellig: 'Überfällig',
  storniert: 'Storniert',
};

const STATUS_BADGE: Record<string, string> = {
  offen: 'bg-amber-500/20 text-[#e8590c] border-amber-500/40',
  bezahlt: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  ueberfaellig: 'bg-red-500/20 text-red-300 border-red-500/40',
  storniert: 'bg-black/5 text-[#86868b] border-black/20/40',
};


// FIX (Bug-Report): liefert das korrekte SKR-03-Erlöskonto je USt-Satz,
// oder null, wenn der Satz (noch) keinem Konto zugeordnet ist – vorher
// wurde hier unabhängig vom Steuersatz IMMER das 19%-Konto 8400
// zurückgegeben (Ternary mit identischem Wert in beiden Zweigen).
function erloeskontoFuer(taxRate: number): string | null {
  if (taxRate === 19) return DATEV_ERLOESKONTO_19;
  if (taxRate === 7) return DATEV_ERLOESKONTO_7;
  return null; // z.B. 0 % – Grund der Steuerfreiheit nicht automatisch bekannt
}

// ─── DATEV-Buchungsstapel (EXTF-CSV, Formatversion 700) ───
// Rückgabe: csv-Text plus die Rechnungen, die NICHT exportiert werden
// konnten, weil ihr USt-Satz keinem Konto zugeordnet ist (siehe
// erloeskontoFuer) – der Aufrufer meldet diese explizit statt sie
// stillschweigend wegzulassen oder falsch zu buchen.
// FIX (Bug-Report, Phase 95, "Sammeldebitor"): bisher wurde JEDER Kunde auf
// dasselbe feste Debitoren-Sammelkonto (DATEV_DEBITOR_START) gebucht – DATEV
// kann offene Posten dann nicht einem einzelnen Kunden zuordnen. Neu: optionaler
// zweiter Parameter kontenProKunde (customer_id -> vom Steuerberater vergebene
// Einzeldebitoren-Kontonummer, siehe customers.datev_konto). Ist für den Kunden
// einer Rechnung ein Konto hinterlegt, wird darauf gebucht; ist keins hinterlegt
// (Feld leer/nicht gepflegt), bleibt exakt das bisherige Sammelkonto-Verhalten
// erhalten – keine bestehende Buchung ändert sich stillschweigend.
function buildDatevEXTF(invoices: Invoice[], kontenProKunde: Record<string, string> = {}): { csv: string; uebersprungen: Invoice[] } {
  const now = new Date();
  const stamp =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const wjBeginn = now.getFullYear() + '0101';
  const datevon = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + '01';

  const header =
    '"EXTF";700;21;"Buchungsstapel";12;;;;;;;"' + stamp + '";;"DE";;;"' +
    DATEV_BERATER_NR + '";"' + DATEV_MANDANT_NR + '";"' + wjBeginn + '";' +
    DATEV_SACHKONTENLAENGE + ';"' + datevon + '";"";"Buchungsstapel";;0;0;"EUR";;;;;;';

  const columns =
    '"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";"WKZ Umsatz";"Kurs";' +
    '"Basis-Umsatz";"WKZ Basis-Umsatz";"Konto";"Gegenkonto (ohne BU-Schlüssel)";' +
    '"BU-Schlüssel";"Belegdatum";"Belegfeld 1";"Belegfeld 2";"Skonto";"Buchungstext"';

  const q = (s: string) => '"' + s.replace(/"/g, '""') + '"';
  const eur = (n: number) => fmtEur(n); // Komma-Dezimal, DATEV-konform

  const uebersprungen: Invoice[] = [];
  const rows: string[] = [];
  for (const inv of invoices) {
    const gegenkonto = erloeskontoFuer(Number(inv.tax_rate));
    if (!gegenkonto) { uebersprungen.push(inv); continue; }
    const d = new Date(inv.invoice_date + 'T00:00:00');
    const belegdatum = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0');
    // Individuelles Debitorenkonto, falls beim Kunden hinterlegt – sonst
    // weiterhin das Sammelkonto (mit Steuerberater abstimmen).
    const eigenesKonto = inv.customer_id ? kontenProKunde[inv.customer_id] : undefined;
    const konto = (eigenesKonto && eigenesKonto.trim()) || String(DATEV_DEBITOR_START);
    // FIX (Bug-Report): das EXTF-"Umsatz"-Feld muss laut DATEV-Format
    // IMMER positiv sein - das Vorzeichen wird ausschließlich über das
    // separate Soll/Haben-Kennzeichen ausgedrückt, nie über eine negative
    // Zahl. Gutschriften haben in unserer DB einen negativen gross_amount
    // (siehe app/api/invoices/route.ts) und wurden bisher trotzdem mit
    // negativem Betrag UND festem "S" (Soll) exportiert - laut EXTF-Spec
    // kein gültiger Datensatz. Normale Rechnung: Debitor Soll, Erlöskonto
    // Haben -> "S" auf dem Debitorenkonto. Gutschrift kehrt das um -> "H".
    const betragNetto = Number(inv.gross_amount);
    const sollHaben = betragNetto < 0 ? 'H' : 'S';
    rows.push([
      q(eur(Math.abs(betragNetto))), q(sollHaben), '"EUR"', '', '', '',
      q(konto), q(gegenkonto), '', q(belegdatum), q(inv.invoice_number), '', '',
      q((inv.invoice_type === 'gutschrift' ? 'Gutschrift ' : 'Rechnung ') + inv.customer_name),
    ].join(';'));
  }

  const csv = '﻿' + header + '\r\n' + columns + '\r\n' + rows.join('\r\n') + '\r\n';
  return { csv, uebersprungen };
}

// Eingebettet im Kundenordner (Reiter „Faktura“): gleiche Liste und gleiches Formular, aber nur für diesen Kunden (und die gewählte Baustelle).
export interface RechnungenUmfang { kundeId: string; kundeName: string; kundeAdresse: string; projektIds: string[]; projektId?: string | null }
/** Zusatzaktionen, die nur die Kundenakte kennt (Neue Version, Gutschrift zur Rechnung, Teilabbau, ZUGFeRD, XRechnung). */
export interface ZeilenZusatz { onNeueVersion?: () => void; onGutschrift?: () => void; onTeilabbau?: () => void; onZugferd?: () => void; onXrechnung?: () => void; zugferdLaeuft?: boolean }
export interface RechnungenInhaltProps { umfang?: RechnungenUmfang; neuSignal?: number; entwurfId?: string | null; onGeaendert?: () => void; zusatzAktionen?: (inv: Invoice) => ZeilenZusatz; entwuerfe?: { anzahl: number; inhalt: React.ReactNode } }

export function RechnungenInhalt({ umfang, neuSignal = 0, entwurfId: entwurfVonAussen = null, onGeaendert, zusatzAktionen, entwuerfe }: RechnungenInhaltProps = {}) {
  const eingebettet = !!umfang;
  const [filter, setFilter] = useState<'alle' | 'offen' | 'bezahlt' | 'ueberfaellig' | 'entwuerfe'>('alle');
  const searchParams = useSearchParams();
  const [alleInvoices, setInvoices] = useState<Invoice[]>([]);
  // Offener Betrag je Rechnung zentral (lib/forderung.ts), identisch zu Kundenakte, Auftragsstand, Faktura-Übersicht und Zahlungsabgleich
  // Gutschriften werden über ihre Bezugsnummer über ALLE geladenen Rechnungen aufgelöst, nicht nur über die gerade sichtbaren
  const forderungAlle = useMemo(() => berechneForderung(alleInvoices as never[]), [alleInvoices]);
  const offenJe = forderungAlle.je;
  const statusAbgeleitet = useMemo(() => statusJe(alleInvoices as never[]), [alleInvoices]);
  const offenVon = (i: { id: string; status?: string; invoice_type?: string; gross_amount: number | string; paid_amount?: number | string | null }) =>
    i.status === 'storniert' || i.invoice_type === 'gutschrift' ? 0 : (offenJe.get(String(i.id)) ?? (Number(i.gross_amount) - Number(i.paid_amount || 0)));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const umfangKunde = umfang?.kundeId, umfangProjekt = umfang?.projektId, umfangProjektIds = umfang?.projektIds;
  const invoices = useMemo(() => {
    if (!umfangKunde) return alleInvoices;
    const ids = new Set(umfangProjektIds ?? []);
    return alleInvoices.filter((i) => (umfangProjekt ? i.project_id === umfangProjekt : i.customer_id === umfangKunde || (!!i.project_id && ids.has(i.project_id))));
  }, [alleInvoices, umfangKunde, umfangProjekt, umfangProjektIds]);
  const [versandEintraege, setVersandEintraege] = useState<VersandEintrag[]>([]);
  const versandKarte = useMemo(() => versandJeRechnung(versandEintraege), [versandEintraege]);
  const [showForm, setShowForm] = useState(false);
  const [anhangFuer, setAnhangFuer] = useState<Invoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [companyMissing, setCompanyMissing] = useState(false);
  // NEU (Phase 95, DATEV-Sammeldebitor-Fix): customer_id -> optionale
  // Einzeldebitoren-Kontonummer, für den DATEV-Export (siehe buildDatevEXTF).
  const [kundenKonten, setKundenKonten] = useState<Record<string, string>>({});

  // Phase 14: Hinweis, wenn das Firmenprofil noch nicht ausgefüllt ist
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/company');
        const json = await res.json();
        if (json.success) setCompanyMissing(!json.company?.company_name);
      } catch { /* Banner optional */ }
    })();
  }, []);

  // NEU (Phase 95): Kunden-Debitorenkonten für den DATEV-Export laden.
  // Rein optional (siehe buildDatevEXTF) – schlägt der Fetch fehl, bleibt
  // die Map leer und der Export nutzt für alle das Sammelkonto wie bisher.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/kunden');
        const json = await res.json();
        if (json.success) {
          const map: Record<string, string> = {};
          for (const k of json.kunden || []) {
            if (k.datev_konto && String(k.datev_konto).trim()) map[k.id] = String(k.datev_konto).trim();
          }
          setKundenKonten(map);
        }
      } catch { /* Export fällt sonst auf Sammelkonto zurück */ }
    })();
  }, []);

  // Formular-State
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [positions, setPositions] = useState<Position[]>([
    { bezeichnung: '', menge: 1, einheit: 'Stk.', einzelpreis: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(19);
  const [invoiceType, setInvoiceType] = useState<'standard' | 'abschlag' | 'schluss'>('standard'); // Phase 15
  const [invoiceDate, setInvoiceDate] = useState(lokalesDatumIso());
  const [dueDate, setDueDate] = useState(
    datumPlusTage(14)
  );
  const [notes, setNotes] = useState('');
  const [grundstuecksbezug, setGrundstuecksbezug] = useState(true);
  const [steuerbehandlung, setSteuerbehandlung] = useState<'regel' | '13b' | 'kleinunternehmer' | 'ig_lieferung'>('regel');
  const [geruestNr, setGeruestNr] = useState('');
  const [leistungsdatum, setLeistungsdatum] = useState('');
  const [detailOffen, setDetailOffen] = useState<Record<number, boolean>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  // Steuervorschlag nach dem Land der Baustelle (Luxemburg → 17 % TVA); wird nie über eine Eingabe von Hand gelegt
  const [steuerHinweis, setSteuerHinweis] = useState('');
  const [regieIds, setRegieIds] = useState<string[]>([]);
  const [abzPosten, setAbzPosten] = useState<UebernommenerPosten[]>([]); // „Noch abzurechnen“-Posten, die in dieser Rechnung stehen (gelten erst nach dem Anlegen als abgerechnet)
  const steuerManuell = useRef(false);
  const entwurfGeladen = useRef(false);
  const [lvId, setLvId] = useState<string | null>(null); // Rechnung aus gespeichertem LV → danach „abgerechnet“
  const [entwurfId, setEntwurfId] = useState<string | null>(null); // geöffneter Rechnungsentwurf (Faktura), wird beim Festschreiben gelöscht
  const [kundeId, setKundeId] = useState<string | null>(null);
  const [entwurfSpeichert, setEntwurfSpeichert] = useState(false);

  // Phase 18: E-Mail-Öffnungen (Tracking-Pixel)
  const [opens, setOpens] = useState<Record<string, { anzahl: number; zuletzt: string }>>({});

  // Eingebettet: nach jeder Änderung (neue Rechnung, Zahlung, Storno …) den Kundenordner informieren, damit Kennzahlen und Reiter aktuell bleiben.
  const erstesLaden = useRef(true);
  const onGeaendertRef = useRef(onGeaendert);
  useEffect(() => { onGeaendertRef.current = onGeaendert; });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Laden fehlgeschlagen');
      setInvoices(json.invoices);
      setError(null);
      if (erstesLaden.current) erstesLaden.current = false; else onGeaendertRef.current?.();

      // Versandprotokoll dazuladen (blockiert die Liste nicht; fehlt die Tabelle noch, bleibt der Versandstand einfach leer)
      try {
        const vRes = await fetch('/api/invoice-dispatches' + (umfangKunde ? `?customer_id=${encodeURIComponent(umfangKunde)}` : ''));
        const vJson = await vRes.json();
        if (vJson.success) setVersandEintraege(vJson.eintraege as VersandEintrag[]);
      } catch { /* Versandstand optional */ }

      // Öffnungen dazuladen (blockiert die Liste nicht)
      try {
        const tRes = await fetch('/api/track/status');
        const tJson = await tRes.json();
        if (tJson.success) {
          const map: Record<string, { anzahl: number; zuletzt: string }> = {};
          for (const o of tJson.opens) {
            if (!map[o.ref] || o.zuletzt > map[o.ref].zuletzt) {
              map[o.ref] = { anzahl: (map[o.ref]?.anzahl || 0) + o.anzahl, zuletzt: o.zuletzt };
            }
          }
          setOpens(map);
        }
      } catch { /* Tracking optional */ }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!projectId || entwurfGeladen.current) { setSteuerHinweis(''); return; }
    let aktiv = true;
    (async () => {
      try {
        const j = await fetch('/api/projects?id=' + encodeURIComponent(projectId)).then((r) => r.json());
        if (!aktiv || !j?.success) return;
        const v = steuerVorschlagFuerBaustelle(j.project?.land ?? j.project?.data?.step1?.land);
        if (!v) { setSteuerHinweis(''); return; }
        setSteuerHinweis(v.text);
        if (!steuerManuell.current) setTaxRate(v.taxRate);
      } catch { /* Vorschlag ist optional */ }
    })();
    return () => { aktiv = false; };
  }, [projectId]);

  // Eingebettet: „Neue Rechnung“ aus der Faktura-Übersicht öffnet das Formular hier, mit dem Kunden schon eingetragen.
  const kundeVorbelegen = useCallback(() => {
    if (!umfang) return;
    entwurfGeladen.current = false; steuerManuell.current = false; setRegieIds([]); setAbzPosten([]);
    setEntwurfId(null); setKundeId(umfang.kundeId); setCustomerName(umfang.kundeName); setCustomerAddress(umfang.kundeAdresse);
    setProjectId(umfang.projektId ?? null); setShowForm(true);
  }, [umfang]);
  // Neues Signal von außen → Formular öffnen (Zustand wird beim Rendern angeglichen, kein Effekt nötig)
  const [letztesSignal, setLetztesSignal] = useState(neuSignal);
  if (neuSignal !== letztesSignal) { setLetztesSignal(neuSignal); if (neuSignal > 0) kundeVorbelegen(); }

  // Entwurf aus dem Angebot (schritt6 → „Rechnung erstellen")
  useEffect(() => {
    if (searchParams.get('neu') !== '1') return;
    try {
      const raw = sessionStorage.getItem('scaffold_invoice_draft');
      if (!raw) { setShowForm(true); return; }
      const draft = JSON.parse(raw);
      setCustomerName(draft.customer_name || '');
      setCustomerAddress(draft.customer_address || '');
      if (draft.notes) setNotes(draft.notes);
      if (Array.isArray(draft.positions) && draft.positions.length) {
        setPositions(draft.positions);
      }
      setProjectId(draft.project_id || null);
      setLvId(draft.lv_id || null);
      setShowForm(true);
      sessionStorage.removeItem('scaffold_invoice_draft');
    } catch {
      setShowForm(true);
    }
  }, [searchParams]);

  // Gespeicherten Rechnungsentwurf öffnen (Faktura → Entwürfe → Bearbeiten): /rechnungen?entwurf=<id>
  const entwurfParam = eingebettet ? entwurfVonAussen : searchParams.get('entwurf');
  useEffect(() => {
    if (!entwurfParam) return;
    let aktiv = true;
    (async () => {
      try {
        const res = await fetch('/api/invoice-drafts?id=' + encodeURIComponent(entwurfParam));
        const json = await res.json();
        if (!aktiv) return;
        if (!json.success) { alert('❌ ' + (json.error || 'Entwurf konnte nicht geladen werden')); return; }
        const d = json.entwurf?.payload || {};
        setEntwurfId(json.entwurf.id); entwurfGeladen.current = true; steuerManuell.current = true;
        setCustomerName(d.customer_name || ''); setCustomerAddress(d.customer_address || '');
        setNotes(d.notes || ''); setProjectId(d.project_id || null); setLvId(d.lv_id || null); setKundeId(d.customer_id || null);
        setInvoiceType(d.invoice_type === 'abschlag' || d.invoice_type === 'schluss' ? d.invoice_type : 'standard');
        setTaxRate(Number.isFinite(Number(d.tax_rate)) ? Number(d.tax_rate) : 19);
        setSteuerbehandlung(d.steuerfall === '13b' || d.steuerfall === 'kleinunternehmer' || d.steuerfall === 'ig_lieferung' ? d.steuerfall : 'regel');
        setGrundstuecksbezug(d.grundstuecksbezug !== false);
        setGeruestNr(d.geruest_nr || ''); setLeistungsdatum(d.leistungsdatum || ''); setRegieIds(Array.isArray(d.regiebericht_ids) ? d.regiebericht_ids : []);
        setPositions(Array.isArray(d.positions) && d.positions.length ? d.positions : [{ bezeichnung: '', menge: 1, einheit: 'Stk.', einzelpreis: 0 }]);
        // Rechnungsdatum und Fälligkeit bleiben auf den heutigen Standardwerten: sie gelten erst beim Festschreiben
        setShowForm(true);
      } catch { if (aktiv) alert('❌ Entwurf konnte nicht geladen werden'); }
    })();
    return () => { aktiv = false; };
  }, [entwurfParam]);

  // Überfällig automatisch markieren (Anzeige – Statuswechsel bleibt manuell)
  const isOverdue = (inv: Invoice) =>
    inv.status === 'offen' && inv.due_date && new Date(inv.due_date) < new Date() && offenVon(inv) > 0.005;

  const kette = korrekturkette(invoices as any);
  const sichtbar = invoices.filter((i) => {
    if (filter === 'offen') return (i.status === 'offen' || i.status === 'ueberfaellig') && i.invoice_type !== 'gutschrift' && offenVon(i) > 0.005;
    if (filter === 'bezahlt') return i.status === 'bezahlt' || ['bezahlt', 'ausgeglichen'].includes(statusAbgeleitet.get(String(i.id)) ?? '');
    if (filter === 'ueberfaellig') return (i.status === 'ueberfaellig' && offenVon(i) > 0.005) || !!isOverdue(i);
    return true;
  });
  const anzahlFilter = {
    alle: invoices.length,
    offen: invoices.filter((i) => (i.status === 'offen' || i.status === 'ueberfaellig') && i.invoice_type !== 'gutschrift' && offenVon(i) > 0.005).length,
    bezahlt: invoices.filter((i) => i.status === 'bezahlt' || ['bezahlt', 'ausgeglichen'].includes(statusAbgeleitet.get(String(i.id)) ?? '')).length,
    ueberfaellig: invoices.filter((i) => (i.status === 'ueberfaellig' && offenVon(i) > 0.005) || !!isOverdue(i)).length,
  };

  // Mahnwesen: ein einziger Weg (derselbe wie der automatische Lauf) – Zahlungserinnerung, 1./2. Mahnung, Pause
  const [mahnBusy, setMahnBusy] = useState<string | null>(null);
  const [mahnMeldung, setMahnMeldung] = useState<{ text: string; fehler: boolean } | null>(null);
  async function mahnPost(id: string, body: object, ok: (j: any) => string) {
    setMahnBusy(id); setMahnMeldung(null);
    try {
      const res = await fetch('/api/mahnung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_id: id, ...body }) });
      const j = await res.json().catch(() => ({}));
      if (!j.success) throw new Error(j.error || 'Fehlgeschlagen');
      setMahnMeldung({ text: ok(j), fehler: false });
      await load();
    } catch (e) { setMahnMeldung({ text: e instanceof Error ? e.message : 'Fehlgeschlagen', fehler: true }); }
    finally { setMahnBusy(null); }
  }
  function mahnEintraegeFuer(inv: Invoice) {
    if (inv.status === 'storniert' || inv.status === 'bezahlt' || inv.invoice_type === 'gutschrift') return [];
    const e: { key: string; titel: string; hinweis?: string; onClick: () => void }[] = [];
    if (tageUeberfaellig(inv.due_date) > 0) {
      for (const a of manuelleAktionen({ stufe: inv.reminder_level || 0, erinnerungAm: (inv as any).erinnerung_am })) {
        e.push({ key: `mahn-${a}`, titel: `${AKTION_LABEL[String(a)]} senden`, hinweis: 'Geht per E-Mail an den Kunden.', onClick: () => {
          if (!confirm(`${AKTION_LABEL[String(a)]} für Rechnung ${inv.invoice_number} jetzt per E-Mail an den Kunden senden?`)) return;
          void mahnPost(inv.id, { aktion: a }, (j) => `${AKTION_LABEL[String(a)]} an ${j.an} gesendet.`);
        } });
      }
    }
    const pausiert = !!(inv as any).mahnung_pausiert;
    e.push({ key: 'mahn-pause', titel: pausiert ? 'Mahnung fortsetzen' : 'Mahnung pausieren', hinweis: pausiert ? 'Die automatische Mahnung läuft wieder.' : 'Keine automatische Mahnung für diese Rechnung.', onClick: () => {
      if (pausiert) { void mahnPost(inv.id, { pause: false }, () => `Mahnung für ${inv.invoice_number} läuft wieder automatisch.`); return; }
      const grund = prompt('Mahnung für diese Rechnung pausieren. Grund (nur intern sichtbar, optional):');
      if (grund === null) return;
      void mahnPost(inv.id, { pause: true, grund }, () => `Mahnung für ${inv.invoice_number} ist pausiert.`);
    } });
    return e;
  }

  const net = positions.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0), 0);
  const tax = Math.round(net * taxRate) / 100;

  const TEXTFELDER: (keyof Position)[] = ['bezeichnung', 'einheit', 'art', 'mitarbeiter', 'taetigkeit', 'geruestId', 'bemerkung'];
  function updatePosition(i: number, field: keyof Position, value: string) {
    setPositions((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        const neu: any = { ...p, [field]: TEXTFELDER.includes(field) ? value : Number(value.replace(',', '.')) || 0 };
        if ((field === 'art' || field === 'geruestId' || field === 'bemerkung') && !value) delete neu[field];
        // Listenpreis × Faktor ergibt den Einzelpreis (Gesamtpreis bleibt Menge × Einzelpreis)
        if ((field === 'listenpreis' || field === 'faktorProzent') && Number(neu.listenpreis) > 0) {
          neu.einzelpreis = preisMitFaktor(Number(neu.listenpreis), Number(neu.faktorProzent) || 100);
        }
        return neu;
      })
    );
  }

  async function speichereEntwurf() {
    setEntwurfSpeichert(true);
    try {
      const res = await fetch('/api/invoice-drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entwurfId || undefined, customer_name: customerName, customer_address: customerAddress, customer_id: kundeId, project_id: projectId, lv_id: lvId,
          invoice_type: invoiceType, positions, tax_rate: taxRate, steuerfall: taxRate === 17 ? 'lu_tva' : taxRate === 0 ? steuerbehandlung : 'regel', grundstuecksbezug,
          notes, geruest_nr: geruestNr, leistungsdatum: leistungsdatum || undefined, regiebericht_ids: regieIds,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Entwurf konnte nicht gespeichert werden');
      setEntwurfId(json.entwurf.id);
      alert('✅ Entwurf gespeichert. Es wurde noch keine Rechnungsnummer vergeben. Du findest ihn unter Faktura → Entwürfe.');
    } catch (err: any) {
      alert('❌ ' + err.message);
    } finally {
      setEntwurfSpeichert(false);
    }
  }

  async function handleSave(overrideGrund?: string) {
    if (!customerName.trim()) { alert('Bitte Kundenname eingeben!'); return; }
    const valid = positions.filter((p) => p.bezeichnung.trim() && p.menge > 0);
    if (!valid.length) { alert('Bitte mindestens eine Position mit Bezeichnung und Menge eintragen!'); return; }
    setSaving(true);
    try {
      const res = await fetchRechnungAnlegen('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          customer_id: kundeId || undefined,
          customer_name: customerName.trim(),
          customer_address: customerAddress.trim() || null,
          positions: valid,
          tax_rate: taxRate,
          invoice_date: invoiceDate,
          due_date: dueDate,
          notes: notes.trim() || null,
          steuerfall: taxRate === 17 ? 'lu_tva' : taxRate === 0 ? steuerbehandlung : 'regel',
          grundstuecksbezug,
          geruest_nr: geruestNr.trim() || undefined,
          leistungsdatum: leistungsdatum || undefined,
          invoice_type: invoiceType,
          regiebericht_ids: regieIds.length ? regieIds : undefined,
          override_grund: overrideGrund || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        if (json.code === 'REGIE_NICHT_IN_RECHNUNG') { setRegieIds((prev) => prev.filter((x) => !(json.regie_ids || []).includes(x))); }
        // Phase 27: Pflicht-Verknüpfung Prüfung/Freigabe → Rechnung.
        // Admin bekommt die Möglichkeit, mit Begründung zu überschreiben.
        if (json.code === 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH') {
          const grund = prompt(json.error + '\n\nBegründung für die Überschreibung eingeben:');
          if (grund && grund.trim()) { setSaving(false); await handleSave(grund.trim()); return; }
          setSaving(false); return;
        }
        throw new Error(json.error || 'Speichern fehlgeschlagen');
      }
      if (lvId) {
        // Leistungsverzeichnis als abgerechnet markieren (Fehler hier verhindern die Rechnung nicht)
        try { await fetch('/api/projekt-lv', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lvId, status: 'abgerechnet' }) }); } catch { /* Status lässt sich im LV-Reiter nachtragen */ }
        setLvId(null);
      }
      let abzRest = '';
      if (abzPosten.length && json.invoice?.id) {
        // Nur Posten, die nach dem Bearbeiten wirklich noch als Position auf der Rechnung stehen, gelten als abgerechnet
        const ids = aufRechnungVorhanden(abzPosten, positions);
        if (ids.length) {
          try { const ar = await fetch('/api/abrechnungsposten', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, abgerechnet_invoice_id: json.invoice.id }) }); const aj = await ar.json(); if (!aj.success) throw new Error('x'); }
          catch { abzRest = '\n\nHinweis: Die übernommenen Posten konnten nicht als abgerechnet markiert werden. Bitte im Reiter „Noch abzurechnen“ prüfen, damit sie nicht doppelt abgerechnet werden.'; }
        }
        setAbzPosten([]);
      }
      let entwurfRest = '';
      if (entwurfId) {
        // Entwurf ist jetzt festgeschrieben: löschen. Scheitert das, bleibt die Rechnung gültig, der Entwurf wird nur gemeldet.
        try { const dr = await fetch('/api/invoice-drafts?id=' + entwurfId, { method: 'DELETE' }); const dj = await dr.json(); if (!dj.success) throw new Error('x'); }
        catch { entwurfRest = '\n\nHinweis: Der Entwurf konnte nicht gelöscht werden. Bitte unter Faktura → Entwürfe von Hand löschen, damit er nicht doppelt verwendet wird.'; }
        setEntwurfId(null);
      }
      setKundeId(null);
      setShowForm(false);
      setCustomerName(''); setCustomerAddress(''); setNotes(''); setSteuerbehandlung('regel'); setProjectId(null); setGeruestNr(''); setLeistungsdatum(''); setDetailOffen({}); setRegieIds([]); setAbzPosten([]);
      setInvoiceType('standard');
      setPositions([{ bezeichnung: '', menge: 1, einheit: 'Stk.', einzelpreis: 0 }]);
      await load();
      alert('✅ Rechnung ' + json.invoice.invoice_number + ' angelegt!' + entwurfRest + abzRest + (json.warnung ? '\n\n⚠️ ' + json.warnung : '') + (json.regie_warnung ? '\n\n⚠️ ' + json.regie_warnung : '') + (json.regie_hinweis ? '\n\nHinweis: ' + json.regie_hinweis : '') + (json.steuer_warnungen?.length ? '\n\n⚠️ Steuer prüfen:\n• ' + json.steuer_warnungen.join('\n• ') : ''));
    } catch (err: any) {
      alert('❌ ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(inv: Invoice, status: string) {
    try {
      const res = await fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // NEU (Phase 38): paid_amount konsistent mit dem Status halten.
        body: JSON.stringify({ id: inv.id, status, paid_amount: status === 'bezahlt' ? Number(inv.gross_amount) : 0 }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await load();
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  }

  // NEU (Phase 38): Teilzahlung oder vollständige Zahlung erfassen
  const [zahlungOffen, setZahlungOffen] = useState<Invoice | null>(null);
  const [zahlungBetrag, setZahlungBetrag] = useState('');
  const [zahlungDatum, setZahlungDatum] = useState(lokalesDatumIso());
  const [zahlungLaeuft, setZahlungLaeuft] = useState(false);

  async function erfasseZahlung() {
    if (!zahlungOffen) return;
    const betrag = Number(String(zahlungBetrag).replace(',', '.'));
    if (!betrag || betrag <= 0) { alert('Bitte einen Betrag > 0 eingeben.'); return; }
    setZahlungLaeuft(true);
    try {
      const res = await fetchMitSchluessel('/api/invoice-payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: zahlungOffen.id, amount: betrag, payment_date: zahlungDatum }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      alert(json.vollstaendig_bezahlt ? '✅ Vollständig bezahlt.' : `✅ Teilzahlung erfasst. Noch offen: ${Math.max(0, offenVon(zahlungOffen) - (json.paid_amount - Number(zahlungOffen.paid_amount || 0))).toFixed(2)} €`);
      setZahlungOffen(null); setZahlungBetrag('');
      await load();
    } catch (err: any) { alert('❌ ' + err.message); }
    setZahlungLaeuft(false);
  }

  async function handleDelete(inv: Invoice) {
    if (!confirm(`Rechnung ${inv.invoice_number} wirklich löschen?`)) return;
    try {
      const res = await fetch('/api/invoices?id=' + inv.id, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await load();
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  }

  function handlePDF(inv: Invoice) {
    const doc = generateInvoicePDF(inv);
    doc.save(`Rechnung_${inv.invoice_number}.pdf`);
  }

  // Phase 15: Rechnung per E-Mail versenden (PDF im Anhang)
  // NEU: E-Mail-Adresse wird vorgeschlagen, damit sie nicht jedes Mal neu
  // eingetippt werden muss – Priorität: 1. Ansprechpartner-E-Mail aus
  // Schritt 1 des zugehörigen Aufmaß-Projekts, 2. falls dort keine hinterlegt
  // ist, die im Kundenkonto gespeicherte E-Mail. Schlägt beides fehl (kein
  // project_id/customer_id, Fetch-Fehler, keine E-Mail hinterlegt), bleibt
  // das Feld leer – es wird nie eine Adresse erfunden.
  async function ermittleVorgeschlageneEmail(inv: Invoice): Promise<string> {
    try {
      if (inv.project_id) {
        const pRes = await fetch('/api/projects?id=' + inv.project_id);
        const pJson = await pRes.json();
        const step1Email = pJson?.project?.data?.step1?.ansprechpartnerEmail;
        if (step1Email && String(step1Email).includes('@')) return String(step1Email);
      }
    } catch {
      // Vorbelegung ist nur Komfort – bei Fehler einfach weiter zum Fallback.
    }
    try {
      if (inv.customer_id) {
        const kRes = await fetch('/api/kunden?id=' + inv.customer_id);
        const kJson = await kRes.json();
        const kundenEmail = kJson?.kunden?.[0]?.email;
        if (kundenEmail && String(kundenEmail).includes('@')) return String(kundenEmail);
      }
    } catch {
      // Auch hier: kein Fehler nach außen, nur keine Vorbelegung.
    }
    return '';
  }

  // Prüflink für den Auftraggeber anlegen und in die Zwischenablage kopieren
  async function handlePruefLink(inv: Invoice) {
    try {
      const res = await fetch('/api/invoices/pruef-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: inv.id, tage: 30 }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Link konnte nicht erstellt werden.');
      const link = `${window.location.origin}/rechnung-pruefen/${json.link.token}`;
      try { await navigator.clipboard.writeText(link); alert('✅ Prüflink (30 Tage gültig) in die Zwischenablage kopiert:\n\n' + link); }
      catch { prompt('Prüflink (30 Tage gültig) – bitte kopieren:', link); }
    } catch (err: any) { alert('❌ ' + err.message); }
  }

  // Versand über den zentralen Dialog (Empfänger, Anhang, Vorschau, Ergebnis)
  const versand = useRechnungVersenden(() => { void load(); });
  async function handleSendMail(inv: Invoice) {
    versand.starten(inv, await ermittleVorgeschlageneEmail(inv));
  }

  function handleDatevExport() {
    const exportable = invoices.filter((i) => i.status !== 'storniert' && !i.importiert); // Altbestand wurde im Altsystem verbucht
    if (!exportable.length) { alert('Keine Rechnungen zum Exportieren vorhanden.'); return; }
    const { csv, uebersprungen } = buildDatevEXTF(exportable, kundenKonten);
    // FIX (Bug-Report): vorher wurden 0%-Rechnungen mitexportiert, aber
    // fälschlich auf das 19%-Konto gebucht. Jetzt werden sie
    // ausgeschlossen und der Anwenderin explizit gemeldet, statt
    // stillschweigend falsch oder gar nicht zu erscheinen.
    if (uebersprungen.length > 0) {
      const liste = uebersprungen.map((i) => `${i.invoice_number} (${i.customer_name})`).join('\n');
      alert(
        `⚠️ ${uebersprungen.length} Rechnung(en) mit 0 % USt wurden NICHT exportiert, ` +
        `weil das passende DATEV-Konto vom Steuerberater festgelegt werden muss:\n\n${liste}\n\n` +
        `Diese bitte manuell/gesondert buchen oder erst nach Klärung des Kontos hier exportieren.`
      );
    }
    if (uebersprungen.length === exportable.length) return; // ausschließlich 0%-Rechnungen ausgewählt, nichts zu exportieren
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `EXTF_Buchungsstapel_${lokalesDatumIso()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // Summe der Ansicht aus den zentral berechneten Beträgen aller Rechnungen (Gutschriften außerhalb der Ansicht zählen mit)
  const summeOffen = invoices.reduce((x, i) => x + (offenJe.get(String(i.id)) ?? 0), 0);

  // Phase 15b: Bei Schlussrechnung die bisherigen Abschläge desselben Kunden zeigen
  const abschlaegeKunde = invoiceType === 'schluss' && customerName.trim()
    ? invoices.filter((i) =>
        i.invoice_type === 'abschlag' &&
        i.status !== 'storniert' &&
        i.customer_name.trim().toLowerCase() === customerName.trim().toLowerCase()
      )
    : [];
  const abschlagSumme = abschlaegeKunde.reduce((s, i) => s + Number(i.gross_amount), 0);

  return (
    <div className={eingebettet ? '' : 'min-h-full'} style={eingebettet ? undefined : { background: WIN.grund }}>
      <div className={eingebettet ? 'flex items-center gap-3 mb-3' : 'flex items-center gap-3 px-3 h-9 text-white sticky top-0 z-20'} style={eingebettet ? undefined : { background: '#171b20' }}>
        {!eingebettet && (<>
        <FileText className="h-4 w-4" />
        <h1 className="text-[14px] font-bold">Rechnungen</h1>
        <span className="text-xs opacity-80">{invoices.length} Rechnungen · {loading || error ? 'Offen: …' : `${fmtEur(summeOffen)} € offen`}</span>
        </>)}
        <span className="ml-auto flex gap-1.5">
          {!eingebettet && <button onClick={handleDatevExport} className="flex items-center gap-1 rounded px-3 py-1 text-xs font-semibold bg-white/15 hover:bg-white/25"><Download className="h-3.5 w-3.5" /> DATEV-Buchungsstapel</button>}
          <button onClick={() => { if (!showForm && eingebettet) { kundeVorbelegen(); return; } if (!showForm) { setEntwurfId(null); setKundeId(null); } setShowForm(!showForm); }} className="flex items-center gap-1 rounded px-3 py-1 text-xs font-semibold text-white" style={{ background: WIN.akzent }}>{showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{showForm ? 'Abbrechen' : 'Neue Rechnung'}</button>
        </span>
      </div>
      <div className={eingebettet ? 'space-y-4' : 'p-4 space-y-4'}>
        {/* Phase 14: Firmenprofil-Hinweis */}
        {companyMissing && (
          <div className="rounded-xl border border-[#e8590c]/40 bg-[#e8590c]/10 p-4 text-sm text-amber-800">
            <strong>Wichtig:</strong> Noch kein Firmenprofil hinterlegt – ohne Anschrift, Steuer-Nr. und Bankverbindung
            sind Rechnungen nicht vollständig (§ 14 UStG).{' '}
            <Link href="/einstellungen" className="underline font-semibold hover:text-amber-100">
              Jetzt unter Einstellungen ausfüllen →
            </Link>
          </div>
        )}

        {/* Neue Rechnung */}
        {showForm && (
          <div className="bg-[#f5f5f7] rounded-xl p-6 border border-blue-500/20 space-y-4">
            <h2 className="text-lg font-bold text-[#1d1d1f]">Neue Rechnung</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Kundenname *</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                  placeholder="Bauunternehmen Mustermann GmbH"
                />
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Adresse</label>
                <input
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                  placeholder="Musterstraße 1, 12345 Musterstadt"
                />
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Rechnungsdatum</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Zahlbar bis</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Gerüstnummer</label>
                <input
                  value={geruestNr}
                  onChange={(e) => setGeruestNr(e.target.value)}
                  placeholder="z. B. G-2026-014"
                  className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Leistungsdatum</label>
                <input
                  type="date"
                  value={leistungsdatum}
                  onChange={(e) => setLeistungsdatum(e.target.value)}
                  className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                />
              </div>
            </div>

            {projectId && (
              <RegieUebernahme
                projectId={projectId}
                uebernommen={regieIds}
                onUebernehmen={(neu, ids) => {
                  // Leere Startzeile ersetzen, sonst anhängen
                  setPositions((prev) => [...prev.filter((p) => p.bezeichnung.trim() || p.einzelpreis > 0), ...neu.map((n) => ({ bezeichnung: n.bezeichnung, menge: n.menge, einheit: n.einheit, einzelpreis: n.einzelpreis }))]);
                  setRegieIds((prev) => [...new Set([...prev, ...ids])]);
                }}
              />
            )}

            {projectId && (
              <AbzurechnenUebernahme
                projectId={projectId}
                uebernommen={abzPosten.map((x) => x.id)}
                onUebernehmen={(neu, posten) => {
                  setPositions((prev) => [...prev.filter((p) => p.bezeichnung.trim() || p.einzelpreis > 0), ...neu]);
                  setAbzPosten((prev) => [...prev, ...posten]);
                }}
              />
            )}

            {/* Positionen */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-[#86868b]">Positionen *</label>
                <button
                  onClick={() => setPositions([...positions, { bezeichnung: '', menge: 1, einheit: 'Stk.', einzelpreis: 0 }])}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Position hinzufügen
                </button>
              </div>
              <div className="space-y-2">
                <datalist id="geruest-ids">
                  {Array.from(new Set(positions.map((x) => x.geruestId).filter((x): x is string => !!x))).map((g) => <option key={g} value={g} />)}
                </datalist>
                {positions.map((p, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      value={p.bezeichnung}
                      onChange={(e) => updatePosition(i, 'bezeichnung', e.target.value)}
                      placeholder="Bezeichnung"
                      className="col-span-5 px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                    />
                    <input
                      value={String(p.menge)}
                      onChange={(e) => updatePosition(i, 'menge', e.target.value)}
                      placeholder="Menge"
                      className="col-span-2 px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] text-right focus:outline-none focus:border-[#e8590c]"
                    />
                    <input
                      value={p.einheit}
                      onChange={(e) => updatePosition(i, 'einheit', e.target.value)}
                      placeholder="Einh."
                      className="col-span-2 px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                    />
                    <input
                      value={String(p.einzelpreis)}
                      onChange={(e) => updatePosition(i, 'einzelpreis', e.target.value)}
                      placeholder="Einzel €"
                      className="col-span-2 px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] text-right focus:outline-none focus:border-[#e8590c]"
                    />
                    <button
                      onClick={() => setPositions(positions.filter((_, idx) => idx !== i))}
                      className="col-span-1 text-[#86868b] hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="col-span-12 -mt-1">
                      <button
                        type="button"
                        onClick={() => setDetailOffen((d) => ({ ...d, [i]: !d[i] }))}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        {detailOffen[i] ? 'Details ausblenden' : 'Details (Gerüst, Bemerkung, Art, Maße, Faktor, Stundenlohn)'}
                      </button>
                    </div>
                    {detailOffen[i] && (
                      <PositionDetails p={p} geruestListeId="geruest-ids" onFeld={(f, w) => updatePosition(i, f as keyof Position, w)} onMenge={(menge, einheit) => setPositions((prev) => prev.map((x, idx) => (idx === i ? { ...x, menge, einheit } : x)))} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="text-xs text-[#86868b]">Typ</label>
                <select
                  value={invoiceType}
                  onChange={(e) => setInvoiceType(e.target.value as any)}
                  className="px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                >
                  <option value="standard">Vollrechnung</option>
                  <option value="abschlag">Abschlagsrechnung</option>
                  <option value="schluss">Schlussrechnung</option>
                </select>
                <label className="text-xs text-[#86868b]">USt-Satz</label>
                <select
                  value={taxRate}
                  onChange={(e) => { steuerManuell.current = true; setTaxRate(Number(e.target.value)); }}
                  className="px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                >
                  <option value={19}>19 %</option>
                  <option value={7}>7 %</option>
                  <option value={17}>17 % TVA (Luxemburg)</option>
                  <option value={0}>0 %</option>
                </select>
                {steuerHinweis && <p data-testid="steuer-vorschlag" className="text-xs text-[#86868b] w-full">{steuerHinweis}</p>}
                {taxRate === 0 && (
                  <select
                    aria-label="Steuerbehandlung bei 0 %"
                    value={steuerbehandlung}
                    onChange={(e) => setSteuerbehandlung(e.target.value as 'regel' | '13b' | 'kleinunternehmer' | 'ig_lieferung')}
                    title="§ 13b nur, wenn der Kunde selbst Bauleistungen erbringt (USt 1 TG liegt vor). Im Zweifel den Steuerberater fragen."
                    className="px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c] max-w-xs"
                  >
                    <option value="regel">0 % – Grund bitte unter Hinweis angeben</option>
                    <option value="13b">Steuerschuldner ist der Leistungsempfänger (§ 13b UStG)</option>
                    <option value="kleinunternehmer">Kleinunternehmer (§ 19 UStG)</option>
                    <option value="ig_lieferung">Steuerfreie Lieferung ins EU-Ausland (z. B. Luxemburg, TVA-Nr. des Kunden Pflicht)</option>
                  </select>
                )}
                <label className="flex items-center gap-2 text-xs text-[#1d1d1f] max-w-xs" title="Bei Privatkunden steht dann der Hinweis auf die zweijährige Aufbewahrung auf der Rechnung (§ 14b Abs. 1 Satz 5 UStG).">
                  <input type="checkbox" checked={grundstuecksbezug} onChange={(e) => setGrundstuecksbezug(e.target.checked)} />
                  Leistung an einem Grundstück (Aufbewahrungshinweis bei Privatkunden)
                </label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Hinweis (optional)"
                  className="px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                />
              </div>
              <div className="text-right">
                <p className="text-xs text-[#86868b]">
                  Netto {fmtEur(net)} € · USt {fmtEur(tax)} €
                </p>
                <p className="text-xl font-bold text-[#1d1d1f] flex items-center gap-1 justify-end">
                  <Euro className="h-5 w-5 text-[#e8590c]" /> {fmtEur(net + tax)}
                </p>
              </div>
            </div>

            {/* Phase 15b: Hinweis bei Schlussrechnung */}
            {invoiceType === 'schluss' && abschlaegeKunde.length > 0 && (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-800">
                <strong>Hinweis zur Schlussrechnung:</strong> Für diesen Kunden gibt es bereits{' '}
                {abschlaegeKunde.length} Abschlagsrechnung{abschlaegeKunde.length > 1 ? 'en' : ''} über insgesamt{' '}
                {fmtEur(abschlagSumme)} € brutto ({abschlaegeKunde.map((i) => i.invoice_number).join(', ')}).
                Diese bitte als eigene Position mit negativem Betrag abziehen.
              </div>
            )}

            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="w-full rounded-xl bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 py-3 font-bold text-white transition-colors"
            >
              {saving ? 'Speichert…' : 'Rechnung anlegen (Nummer wird automatisch vergeben)'}
            </button>
            <button
              type="button"
              onClick={speichereEntwurf}
              disabled={entwurfSpeichert || saving}
              data-testid="als-entwurf-speichern"
              className="w-full rounded-xl border border-black/15 bg-white hover:bg-black/5 disabled:opacity-50 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-colors"
            >
              {entwurfSpeichert ? 'Speichert…' : entwurfId ? 'Entwurf aktualisieren (ohne Rechnungsnummer)' : 'Als Entwurf speichern (ohne Rechnungsnummer)'}
            </button>
          </div>
        )}

        {/* Filter */}
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Rechnungen filtern">
          {([['alle', 'Alle'], ['offen', 'Offen'], ['bezahlt', 'Bezahlt'], ['ueberfaellig', 'Überfällig'], ...(entwuerfe ? [['entwuerfe', 'Entwürfe']] : [])] as [typeof filter, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${filter === k ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]' : 'bg-white text-[#424245] border-black/10 hover:bg-black/5'}`}>
              {l} <span className="opacity-70">({k === 'entwuerfe' ? (entwuerfe?.anzahl ?? 0) : anzahlFilter[k as keyof typeof anzahlFilter]})</span>
            </button>
          ))}
        </div>
        {mahnMeldung && <p className={`text-sm ${mahnMeldung.fehler ? 'text-red-700' : 'text-emerald-700'}`} role="status">{mahnMeldung.text}</p>}

        {filter === 'entwuerfe' && entwuerfe ? (
          <div className="rounded-xl border border-black/10 bg-white">{entwuerfe.anzahl === 0 ? <p className="p-4 text-sm text-[#86868b]">Keine Entwürfe.</p> : entwuerfe.inhalt}</div>
        ) : (
        /* Liste */
        <div className="bg-[#f5f5f7] rounded-xl border border-blue-500/20 overflow-hidden">
          {loading ? (
            <p className="p-6 text-[#86868b]">Lade Rechnungen…</p>
          ) : error ? (
            <p className="p-6 text-red-600">Fehler: {error}</p>
          ) : invoices.length === 0 ? (
            <p className="p-6 text-[#86868b]">
              Noch keine Rechnungen. Erstelle die erste über „Neue Rechnung" – oder direkt aus einem angenommenen Angebot (Aufmaß → Schritt 6).
            </p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[#86868b] border-b" style={{ background: WIN.grund, borderColor: WIN.rand }}>
                  <th className="px-3 py-2.5">Nummer</th>
                  <th className="px-3 py-2.5">Kunde</th>
                  <th className="px-3 py-2.5">Datum</th>
                  <th className="px-3 py-2.5 text-right">Betrag</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {sichtbar.map((inv) => {
                  const effStatus = isOverdue(inv) ? 'ueberfaellig' : inv.status;
                  return (
                    <tr key={inv.id} className="border-b border-black/10/50 hover:bg-black/10/30">
                      <td className="px-3 py-2.5 font-mono text-[#e8590c]">
                        <Link href={`/rechnungen/${inv.id}`} className="hover:underline">{inv.invoice_number}</Link>
                        {(inv.invoice_type === 'abschlag' || inv.invoice_type === 'schluss') && (
                          <span className="ml-2 text-[10px] font-sans px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 border border-blue-500/40">
                            {inv.invoice_type === 'abschlag' ? 'Abschlag' : 'Schluss'}
                          </span>
                        )}
                        {inv.invoice_type === 'gutschrift' && (
                          <span className="ml-2 text-[10px] font-sans px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 border border-purple-500/30">Gutschrift</span>
                        )}
                        {(() => { const k = kette.get(inv.id); return (
                          <>
                            {inv.status === 'storniert' && k && k.ersetztDurch.length > 0 && <span data-testid="kette" className="ml-1 text-[10px] font-sans text-[#86868b]">storniert, ersetzt durch {k.ersetztDurch.join(', ')}</span>}
                            {inv.status !== 'storniert' && k && k.ersetztDurch.length > 0 && <span data-testid="kette" className="ml-1 text-[10px] font-sans text-[#86868b]">ersetzt durch {k.ersetztDurch.join(', ')}</span>}
                            {k?.ersetzt && <span data-testid="kette" className="ml-1 text-[10px] font-sans text-[#86868b]">ersetzt {k.ersetzt}</span>}
                            {k && k.gutschriften.length > 0 && <span data-testid="kette" className="ml-1 text-[10px] font-sans text-[#86868b]">Gutschrift: {k.gutschriften.join(', ')}</span>}
                            {k?.bezug ? <span data-testid="kette" className="ml-1 text-[10px] font-sans text-[#86868b]">zu {k.bezug}</span>
                              : inv.reference_invoice_number && !k?.ersetzt && <span className="ml-1 text-[10px] font-sans text-[#86868b]">zu {inv.reference_invoice_number}</span>}
                          </>
                        ) })()}
                        {(inv as any).mahnung_pausiert && (
                          <span className="ml-1 text-[10px] font-sans px-1.5 py-0.5 rounded bg-black/5 text-[#6e6e73] border border-black/10" title={(inv as any).mahnung_pause_grund || undefined}>Mahnung pausiert</span>
                        )}
                        {inv.importiert && (
                          <span className="ml-2 text-[10px] font-sans px-1.5 py-0.5 rounded bg-black/5 text-[#6e6e73] border border-black/10">Altbestand</span>
                        )}
                        {(inv.reminder_level || 0) > 0 && (
                          <span className="ml-1 text-[10px] font-sans px-1.5 py-0.5 rounded bg-red-500/20 text-red-700 border border-red-500/40">
                            {inv.reminder_level}. Mahnung
                          </span>
                        )}
                        {(() => {
                          const v = versandStandFuer(versandKarte, inv);
                          if (v.stand === 'keiner') return null;
                          const ok = v.stand === 'versendet';
                          return (
                            <span data-testid="versand-badge" className={`ml-1 text-[10px] font-sans px-1.5 py-0.5 rounded border ${ok ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40' : 'bg-red-500/20 text-red-700 border-red-500/40'}`}
                              title={`${ok ? 'Versendet' : 'Versand fehlgeschlagen'}${v.an ? ' an ' + v.an : ''}${v.zuletzt ? ' am ' + new Date(v.zuletzt).toLocaleString('de-DE') : ''}${v.format ? ' · ' + (v.format === 'zugferd' ? 'mit E-Rechnung (ZUGFeRD)' : v.format === 'xrechnung' ? 'als XRechnung' : 'normale PDF') : ''}`}>
                              {ok ? '✉ versendet' : '✉ Fehler'}
                            </span>
                          );
                        })()}
                        {inv.pruef_status && (
                          <span
                            className={`ml-1 text-[10px] font-sans px-1.5 py-0.5 rounded border ${inv.pruef_status === 'akzeptiert' ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40' : 'bg-amber-500/15 text-amber-700 border-amber-500/40'}`}
                            title={`Geprüft von ${inv.geprueft_von || '–'}${inv.geprueft_am ? ' am ' + new Date(inv.geprueft_am).toLocaleDateString('de-DE') : ''}`}
                          >
                            {ENTSCHEIDUNG_LABEL[inv.pruef_status as PruefEntscheidung] || inv.pruef_status}
                          </span>
                        )}
                        {opens[inv.invoice_number] && (
                          <span
                            className="ml-1 text-[10px] font-sans px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 border border-emerald-500/40"
                            title={`E-Mail geöffnet (${opens[inv.invoice_number].anzahl}×, zuletzt ${new Date(opens[inv.invoice_number].zuletzt).toLocaleString('de-DE')})`}
                          >
                            👁 Gesehen
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[#1d1d1f]">{inv.customer_name}</td>
                      <td className="px-3 py-2.5 text-[#424245]">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-3 py-2.5 text-right text-[#1d1d1f]">
                        {fmtEur(Number(inv.gross_amount))} €
                        {Number(inv.paid_amount) > 0 && inv.status !== 'bezahlt' && (
                          <div className="text-[10px] text-blue-700">Teilzahlung {fmtEur(Number(inv.paid_amount))} € · offen {fmtEur(offenVon(inv))} €</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={inv.status}
                          onChange={(e) => handleStatus(inv, e.target.value)}
                          className={`px-2 py-1 rounded-full text-xs font-semibold border bg-transparent ${STATUS_BADGE[effStatus]}`}
                        >
                          {Object.entries(STATUS_LABEL).map(([v, l]) => (
                            <option key={v} value={v} className="bg-[#f5f5f7] text-[#1d1d1f]">
                              {l}
                            </option>
                          ))}
                        </select>
                        {(() => {
                          // Stand nach Zahlungen UND Gutschriften (zentral): zeigt „ausgeglichen“/„teilweise gutgeschrieben“, wo der gespeicherte Status allein täuscht
                          const st: ForderungsStatus | undefined = statusAbgeleitet.get(String(inv.id));
                          if (!st || loading || error || !['ausgeglichen', 'teilausgeglichen', 'teilbezahlt', 'bezahlt'].includes(st) || (st === 'bezahlt' && inv.status === 'bezahlt')) return null;
                          return <div data-testid="status-abgeleitet" className="text-[10px] mt-0.5 text-blue-700">{FORDERUNGSSTATUS_LABEL[st]}</div>;
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end">
                          {(() => {
                            const z = zusatzAktionen?.(inv) ?? {};
                            const gs = inv.invoice_type === 'gutschrift';
                            return (
                              <RechnungAktionen
                                gutschrift={gs} storniert={inv.status === 'storniert'} bezahlt={inv.status === 'bezahlt'}
                                zugferdLaeuft={z.zugferdLaeuft}
                                onPdf={() => handlePDF(inv)}
                                onSenden={() => handleSendMail(inv)}
                                onZahlung={() => { setZahlungOffen(inv); setZahlungBetrag(String(offenVon(inv))); setZahlungDatum(lokalesDatumIso()) }}
                                onNeueVersion={z.onNeueVersion} onGutschrift={z.onGutschrift} onTeilabbau={z.onTeilabbau}
                                onZugferd={z.onZugferd} onXrechnung={z.onXrechnung}
                                onBezahltToggle={() => handleStatus(inv, inv.status === 'bezahlt' ? 'offen' : 'bezahlt')}
                                onAnhang={() => setAnhangFuer(inv)}
                                onPruefLink={() => handlePruefLink(inv)}
                                mahnEintraege={mahnBusy === inv.id ? [] : mahnEintraegeFuer(inv)}
                                onLoeschen={inv.status === 'offen' ? () => handleDelete(inv) : undefined}
                              />
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
        )}

        <p className="text-xs text-[#86868b]">
          DATEV-Export: Buchungsstapel im EXTF-Format (Formatversion 700, SKR 03, Erlöskonto {DATEV_ERLOESKONTO_19} für 19&nbsp;%, {DATEV_ERLOESKONTO_7} für 7&nbsp;%; 0&nbsp;%-Rechnungen werden nicht mitexportiert).
          Kunden ohne eigene DATEV-Kontonummer (siehe Kundenstamm) laufen über das Sammelkonto {DATEV_DEBITOR_START}.
          Berater-/Mandantennummer und Konten bitte vor dem ersten Import mit dem Steuerberater abstimmen.
        </p>

        {/* ─── NEU (Phase 38): Zahlung erfassen (voll oder teilweise) ─── */}
        {zahlungOffen && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#1d1d1f]">Zahlung erfassen: {zahlungOffen.invoice_number}</h3>
                <button onClick={() => setZahlungOffen(null)} className="p-1 rounded-lg hover:bg-black/5"><X className="h-4 w-4" /></button>
              </div>
              <p className="text-[11px] text-[#86868b]">
                Rechnungsbetrag {fmtEur(Number(zahlungOffen.gross_amount))} € · bisher eingegangen {fmtEur(Number(zahlungOffen.paid_amount || 0))} € · offen {fmtEur(offenVon(zahlungOffen))} €
              </p>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Betrag (€)</label>
                <input value={zahlungBetrag} onChange={(e) => setZahlungBetrag(e.target.value)} className="w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm" />
                <p className="text-[10px] text-[#86868b] mt-1">Vorausgefüllt mit dem offenen Betrag – für eine Teilzahlung einfach anpassen.</p>
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Datum</label>
                <input type="date" value={zahlungDatum} onChange={(e) => setZahlungDatum(e.target.value)} className="w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={erfasseZahlung} disabled={zahlungLaeuft} className="px-4 py-2 rounded-xl bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 text-white text-sm font-semibold">{zahlungLaeuft ? 'Speichert…' : 'Zahlung erfassen'}</button>
                <button onClick={() => setZahlungOffen(null)} className="px-4 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-sm font-medium">Abbrechen</button>
              </div>
            </div>
          </div>
        )}
        {versand.dialog}
        {anhangFuer && <AnhangDialog invoiceId={anhangFuer.id} rechnungsNr={anhangFuer.invoice_number} positionen={anhangFuer.positions || []} onClose={() => setAnhangFuer(null)} />}
      </div>
    </div>
  );
}
