'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import KIMaterialResult from '@/components/aufmaß/KIMaterialResult';
import KiHinweis from '@/components/KiHinweis';
import SignaturePad from '@/components/aufmaß/SignaturePad';
import DinCheck from '@/components/aufmaß/DinCheck';
import { KIAnalysis } from '@/types/scaffold';
import { systemAnzeigename } from '@/lib/calculations/geruest-systeme';
import DispositionResult from '@/components/aufmaß/DispositionResult';
import { DispositionResult as DispositionData } from '@/lib/calculations/disposition';
import { generateInvoicePDF, fmtDate as fmtRechnungsDatum, type Invoice } from '@/lib/invoice-pdf';

const DigitalTwin = dynamic(() => import('@/components/aufmaß/DigitalTwin'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] rounded-xl border border-black/10 bg-[#f5f5f7] flex items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
    </div>
  ),
});

function Schritt6Content() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stepData, setStepData] = useState<Record<string, any>>({});
  const [kiResult, setKiResult] = useState<KIAnalysis | null>(null);
  const [kiLoading, setKiLoading] = useState(false);
  const [kiError, setKiError] = useState<string | null>(null);
  const [dispResult, setDispResult] = useState<DispositionData | null>(null);
  const [dispLoading, setDispLoading] = useState(false);
  const [dispError, setDispError] = useState<string | null>(null);
  const [show3D, setShow3D] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedMaterials, setEditedMaterials] = useState<any[]>([]);

  // ═══════════════════════════════════════════════════════════
  // NEU: Phase 1 Features
  // ═══════════════════════════════════════════════════════════
  const [showSignature, setShowSignature] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [showQR, setShowQR] = useState(false);
  const [angebotsStatus, setAngebotsStatus] = useState<'erstellt' | 'versendet' | 'gelesen' | 'angenommen'>('erstellt');
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState('');

  // ═══════════════════════════════════════════════════════════
  // NEU: Angebot-Anpassungen (Skonto, Mietverlängerung, Nachtrag, Sonderrabatt)
  // Alle Felder manuell steuerbar – rechnet auf den KI-Verkaufspreis auf.
  // ═══════════════════════════════════════════════════════════
  const [anpassungen, setAnpassungen] = useState({
    skonto: false,
    miete: { aktiv: false, wochen: '', preisProWoche: '' },
    nachtrag: { aktiv: false, text: '', betrag: '' },
    rabatt: { aktiv: false, betrag: '' },
  });

  // NEU (Phase 30): Preisbasis wählbar – KI-Kalkulation oder Festpreis pro m².
  const [preisModus, setPreisModus] = useState<'ki' | 'festpreis'>('ki');
  const [festpreisProM2, setFestpreisProM2] = useState('');
  useEffect(() => {
    fetch('/api/company').then(r => r.json()).then(j => {
      const v = j.company?.calc_festpreis_pro_m2;
      if (v != null && v !== '') setFestpreisProM2(String(v));
    }).catch(() => {});
  }, []);

  // NEU (Phase 31): Rechnung direkt anlegen + Versand-Dialog inline in Schritt 6
  const [rechnungErstellenLaeuft, setRechnungErstellenLaeuft] = useState(false);
  const [rechnungErstellt, setRechnungErstellt] = useState<Invoice | null>(null);
  const [zeigeVersandDialog, setZeigeVersandDialog] = useState(false);
  const [rechnungEmail, setRechnungEmail] = useState('');
  const [rechnungSendenLaeuft, setRechnungSendenLaeuft] = useState(false);
  const [rechnungVersendet, setRechnungVersendet] = useState(false);
  const [rechnungFehler, setRechnungFehler] = useState('');

  // Live-Kalkulation: Basis = KI-Verkaufspreis ODER Festpreis/m² × Fläche, dann Zu-/Abschläge
  function calcAngebot() {
    const flaeche = kiResult?.totalAreaM2 ?? 0;
    const basis = preisModus === 'festpreis'
      ? (parseFloat(festpreisProM2.replace(',', '.')) || 0) * flaeche
      : (kiResult?.suggestedPrice ?? 0);
    const mieteBetrag = anpassungen.miete.aktiv
      ? (parseFloat(anpassungen.miete.wochen) || 0) * (parseFloat(anpassungen.miete.preisProWoche) || 0)
      : 0;
    const nachtragBetrag = anpassungen.nachtrag.aktiv ? parseFloat(anpassungen.nachtrag.betrag) || 0 : 0;
    const rabattBetrag = anpassungen.rabatt.aktiv ? parseFloat(anpassungen.rabatt.betrag) || 0 : 0;
    const endpreis = Math.max(0, basis + mieteBetrag + nachtragBetrag - rabattBetrag);
    const skontoBetrag = anpassungen.skonto ? endpreis * 0.02 : 0;
    return { basis, mieteBetrag, nachtragBetrag, rabattBetrag, endpreis, skontoBetrag };
  }
  const eur = (n: number) => n.toFixed(2) + ' €';

  // NEU: Projekt aus dem Dashboard öffnen (?id=...) → Daten aus der Datenbank laden
  useEffect(() => {
    const projectId = searchParams.get('id');
    if (!projectId) return;
    (async () => {
      try {
        const res = await fetch('/api/projects?id=' + projectId);
        const json = await res.json();
        if (!json.success || !json.project) throw new Error(json.error || 'Projekt nicht gefunden');
        const p = json.project;
        const d = p.data || {};
        const { angebotAnpassungen, kiResult: savedKi, angebotsStatus: savedStatus, preisModus: savedPreisModus, festpreisProM2: savedFestpreis, ...steps } = d;
        setStepData(steps);
        if (angebotAnpassungen) setAnpassungen(angebotAnpassungen);
        // NEU (Prio-2-Sprint): KI-Ergebnis und Angebotsstatus wiederherstellen
        if (savedKi) setKiResult(savedKi);
        if (savedStatus) setAngebotsStatus(savedStatus);
        // NEU (Phase 30): gewählte Preisbasis wiederherstellen
        if (savedPreisModus) setPreisModus(savedPreisModus);
        if (savedFestpreis) setFestpreisProM2(savedFestpreis);
        setSavedProjectId(p.id);
      } catch (err: any) {
        console.error('Projekt-Laden fehlgeschlagen:', err);
        setKiError('Projekt konnte nicht geladen werden: ' + err.message);
      }
    })();
  }, [searchParams]);

  useEffect(() => {
    // Wenn ein Projekt per ?id= geöffnet wurde, kommen die Daten aus der DB (s. o.)
    if (searchParams.get('id')) return;
    const data: Record<string, any> = {};
    for (let i = 1; i <= 5; i++) {
      const raw = localStorage.getItem(`scaffold_step${i}`);
      if (raw) {
        try { data[`step${i}`] = JSON.parse(raw); } catch { data[`step${i}`] = {}; }
      } else { data[`step${i}`] = {}; }
    }
    // LiDAR-Maße und KI-Foto-Analyse aus Schritt 1 mit ins Projekt übernehmen
    const lidarRaw = localStorage.getItem('scaffold_lidar_measurements');
    if (lidarRaw) {
      try { data.lidarMeasurements = JSON.parse(lidarRaw); } catch { /* ignore */ }
    }
    const fotoAnalyse = localStorage.getItem('scaffold_foto_analyse');
    if (fotoAnalyse) data.fotoAnalyse = fotoAnalyse;
    const fotoDatenRaw = localStorage.getItem('scaffold_foto_daten');
    if (fotoDatenRaw) {
      try { data.fotoAnalyseStrukturiert = JSON.parse(fotoDatenRaw); } catch { /* ignore */ }
    }
    // KI-Grundriss-Analyse aus Schritt 1 mit ins Projekt übernehmen
    const grundrissAnalyse = localStorage.getItem('scaffold_grundriss_analyse');
    if (grundrissAnalyse) data.grundrissAnalyse = grundrissAnalyse;
    const grundrissDatenRaw = localStorage.getItem('scaffold_grundriss_daten');
    if (grundrissDatenRaw) {
      try { data.grundrissAnalyseStrukturiert = JSON.parse(grundrissDatenRaw); } catch { /* ignore */ }
    }
    setStepData(data);
    // Kunden-E-Mail aus Schritt 1 laden
    if (data.step1?.ansprechpartnerEmail) setCustomerEmail(data.step1.ansprechpartnerEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s1 = stepData.step1 || {};
  const s2 = stepData.step2 || {};
  const s3 = stepData.step3 || {};
  const s4 = stepData.step4 || {};
  const s5 = stepData.step5 || {};

  // ═══════════════════════════════════════════════════════════
  // BESTEHENDE HELPER (unverändert)
  // ═══════════════════════════════════════════════════════════
  function mapDachform(d: string): string {
    const map: Record<string, string> = { Satteldach: 'satteldach', Flachdach: 'flachdach', Pultdach: 'pultdach', Walmdach: 'walmdach', Mansarddach: 'mansardendach', Zeltdach: 'satteldach' };
    return map[d] || 'flachdach';
  }
  function mapFassade(f: string): string {
    const map: Record<string, string> = { Klinker: 'mauerwerk', WDVS: 'wdvs', Beton: 'beton', Naturstein: 'mauerwerk', Glas: 'glas', Holz: 'holz', Putz: 'mauerwerk', Denkmalschutz: 'denkmal' };
    return map[f] || 'mauerwerk';
  }
  function mapHindernisse(step2: any): any[] {
    const list = step2.hindernisse || [];
    const map: Record<string, string> = { Erker: 'erker', Balkon: 'balkon', Wintergarten: 'sonstiges', Kamin: 'schornstein', Gaube: 'gaube', Markise: 'sonstiges' };
    const obstacles = list.map((h: string) => ({ type: map[h] || 'sonstiges', count: 1, notes: h }));
    if (step2.werbeanlagen) obstacles.push({ type: 'werbeanlage', count: 1, notes: 'Werbeanlage' });
    if (step2.garagen) obstacles.push({ type: 'sonstiges', count: 1, notes: 'Garage/Nebengebäude' });
    return obstacles;
  }
  function mapGefahren(step4: any): string[] {
    const hazards: string[] = [];
    if (step4.hochspannung) hazards.push('hochspannung');
    if (step4.bahnstrecke) hazards.push('bahnstrecke');
    if (step4.oeffentlicher_weg) hazards.push('oeffentlicher_weg');
    if (step4.glasfassade) hazards.push('glasfassade');
    if (step4.denkmalschutz) hazards.push('denkmalschutz');
    if (step4.nachbargrundstueck) hazards.push('nachbargrundstueck');
    return hazards;
  }
  function buildScaffoldInput() {
    // NEU: Brücken-Aufmaß – Spannweiten werden wie Abschnitte behandelt
    // (jede Spannweite = eine Sektion für die Mengenberechnung), aber mit
    // eigener Breite je Feld statt einer einzigen Gebäudebreite.
    if (s1.projektart === 'bruecke' && s2.bruecke) {
      const spannweiten = (s2.bruecke.spannweiten || []).filter((sp: any) => parseFloat(sp.spannweiteM) > 0)
      const hoehe = parseFloat(s2.bruecke.hoeheUeberGrundM) || 0
      const breite = parseFloat(spannweiten[0]?.breiteM) || parseFloat(s2.breite) || 2
      const sections = spannweiten.map((sp: any, i: number) => ({ bezeichnung: sp.bezeichnung || `Feld ${i + 1}`, lengthM: parseFloat(sp.spannweiteM), heightM: hoehe }))
      return {
        customer: s1.name || '', address: s1.adresse || '', trade: 'bruecke',
        projectDurationDays: parseInt(s1.dauer) || 30, lengthM: sections.reduce((s: number, x: any) => s + x.lengthM, 0), heightM: hoehe,
        widthM: breite, eavesHeightM: hoehe, roofForm: 'kein' as const,
        roofOverhangM: 0, facadeType: 'putz' as const, obstacles: [],
        sections,
        scaffoldType: (s3.geruesttyp === 'trag' ? 'rahmen' : 'rahmen') as any, deckingType: (s3.belag || 'stahl').toLowerCase(),
        fieldLengthM: parseFloat(s3.feldlänge || s3.feldlange) || 2.07, groundType: (s3.untergrund || s3.boden || 'beton').toLowerCase(),
        manufacturer: systemAnzeigename(s3.system, s3.customSystem) || undefined,
        anchorType: (s4.anker || 'fassadenanker').toLowerCase(), groundCondition: (s4.untergrund || 'beton').toLowerCase(),
        hasSlope: false, hasLightShafts: false, hasBasement: false, needsLoadDistribution: s2.bruecke.untergrundArt === 'gewaesser' || s2.bruecke.untergrundArt === 'gelaende',
        environment: { hasPowerLines: false, hasVegetation: false, hasNeighborProperty: false, hasPublicTraffic: s2.bruecke.untergrundArt === 'strasse', needsNoParkingZone: s2.bruecke.verkehrEinschraenkungNoetig, needsSpecialUse: s2.bruecke.verkehrEinschraenkungNoetig, hasStorageArea: false, hasTruckAccess: false, needsCrane: false, needsProtectionRoof: false, needsSafetyNet: s2.bruecke.untergrundArt === 'strasse' || s2.bruecke.untergrundArt === 'schiene' || s2.bruecke.untergrundArt === 'gewaesser' },
        windZone: (parseInt(s4.windzone) as 1 | 2 | 3 | 4) || 2, hazards: s2.bruecke.untergrundArt === 'strasse' ? ['oeffentlicher_weg'] : s2.bruecke.untergrundArt === 'schiene' ? ['bahnstrecke'] : [], additionalNotes: s4.zusaetzliche_hinweise || '',
        bruecke: { aufhaengung: s2.bruecke.aufhaengung, untergrundArt: s2.bruecke.untergrundArt, verkehrEinschraenkungNoetig: s2.bruecke.verkehrEinschraenkungNoetig },
      }
    }
    // NEU: Mehrere Abschnitte (unterschiedliche Höhen/ums Eck) aus Schritt 2,
    // falls vorhanden. Abschnitt 1 = die Haupt-Länge/Höhe oben im Formular.
    const zusatzAbschnitte = Array.isArray(s2.abschnitte) ? s2.abschnitte : [];
    const gueltigeZusatzAbschnitte = zusatzAbschnitte
      .filter((a: any) => parseFloat(a.laenge) > 0 && parseFloat(a.hoehe) > 0)
      .map((a: any, i: number) => ({ bezeichnung: a.bezeichnung || `Abschnitt ${i + 2}`, lengthM: parseFloat(a.laenge), heightM: parseFloat(a.hoehe) }));
    const sections = gueltigeZusatzAbschnitte.length > 0
      ? [{ bezeichnung: 'Abschnitt 1', lengthM: parseFloat(s2.laenge) || 0, heightM: parseFloat(s2.hoehe) || 0 }, ...gueltigeZusatzAbschnitte]
      : undefined;

    return {
      customer: s1.name || '', address: s1.adresse || '', trade: (s1.gewerk || 'allgemein').toLowerCase(),
      projectDurationDays: parseInt(s1.dauer) || 30, lengthM: parseFloat(s2.laenge) || 0, heightM: parseFloat(s2.hoehe) || 0,
      widthM: parseFloat(s2.breite) || 0, eavesHeightM: parseFloat(s2.traufhoehe) || 0, roofForm: mapDachform(s2.dachform),
      roofOverhangM: parseFloat(s2.dachueberstand) || 0, facadeType: mapFassade(s2.fassade), obstacles: mapHindernisse(s2),
      sections,
      scaffoldType: (s3.geruesttyp || 'rahmen').toLowerCase(), deckingType: (s3.belag || 'stahl').toLowerCase(),
      fieldLengthM: parseFloat(s3.feldlänge || s3.feldlange) || 2.07, groundType: (s3.untergrund || s3.boden || 'beton').toLowerCase(),
      manufacturer: systemAnzeigename(s3.system, s3.customSystem) || undefined,
      anchorType: (s4.anker || 'fassadenanker').toLowerCase(), groundCondition: (s4.untergrund || 'beton').toLowerCase(),
      hasSlope: s4.gefaelle || false, hasLightShafts: s4.lichtschaechte || false, hasBasement: s4.keller || false,
      needsLoadDistribution: s4.lastverteilplatten || false,
      environment: { hasPowerLines: s4.freileitungen || false, hasVegetation: s4.vegetation || false, hasNeighborProperty: s4.nachbargrundstueck || false, hasPublicTraffic: s2.durchfahrt || false, needsNoParkingZone: s4.halteverbotszone || false, needsSpecialUse: s4.sondernutzung || false, hasStorageArea: s4.lagerflaeche || false, hasTruckAccess: s4.lkw_zufahrt || false, needsCrane: s4.kran || false, needsProtectionRoof: s4.schutzdach || false, needsSafetyNet: s4.fangnetz || false },
      windZone: (parseInt(s4.windzone) as 1|2|3|4) || 1, hazards: mapGefahren(s4), additionalNotes: s4.zusaetzliche_hinweise || '',
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BESTEHENDE HANDLER (unverändert)
  // ═══════════════════════════════════════════════════════════
  async function handleKIBerechnung() {
    setKiLoading(true); setKiError(null);
    try {
      const payload = buildScaffoldInput();
      if (!payload.lengthM || !payload.heightM) throw new Error('Länge und Höhe fehlen. Bitte zuerst Schritt 2 ausfüllen.');
      const response = await fetch('/api/ki-material', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Berechnung fehlgeschlagen'); }
      const json = await response.json();
      setKiResult(json.data);
    } catch (err: any) { setKiError(err.message); } finally { setKiLoading(false); }
  }
  async function handleDisposition() {
    if (!kiResult) { alert('Bitte zuerst KI-Materialberechnung durchführen!'); return; }
    setDispLoading(true); setDispError(null);
    try {
      const response = await fetch('/api/disposition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materialList: kiResult.materialList, targetSiteId: s1.id || 'neu', targetAddress: s1.adresse || '' }) });
      if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Disposition fehlgeschlagen'); }
      const json = await response.json(); setDispResult(json.data);
    } catch (err: any) { setDispError(err.message); } finally { setDispLoading(false); }
  }
  async function handleSpeichern() {
    setIsSaving(true);
    try {
      // NEU (Prio-2-Sprint): KI-Ergebnis und Angebotsstatus mit ins Projekt speichern,
      // damit sie beim Öffnen aus dem Dashboard wieder da sind
      // Phase 25 – WICHTIGER FIX: Bisher wurde hier IMMER POST aufgerufen, auch wenn
      // das Projekt schon existierte (savedProjectId gesetzt) – dadurch entstand bei
      // jedem erneuten Speichern ein komplett neues, doppeltes Projekt statt einer
      // Aktualisierung. Jetzt: existiert savedProjectId schon, wird PATCH verwendet
      // (aktualisiert das bestehende Projekt UND sichert automatisch eine Version
      // des bisherigen Stands, siehe /api/projects PATCH).
      const gespeicherteDaten = { ...stepData, angebotAnpassungen: anpassungen, kiResult, angebotsStatus, preisModus, festpreisProM2 };
      let result: any;
      if (savedProjectId) {
        const response = await fetch('/api/projects', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: savedProjectId, name: s1.name || 'Unbenanntes Projekt', adresse: s1.adresse || '', data: gespeicherteDaten, customer_id: s1.customerId || null }),
        });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || 'Speichern fehlgeschlagen');
        result = { id: savedProjectId };
      } else {
        const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: s1.name || 'Unbenanntes Projekt', adresse: s1.adresse || '', data: gespeicherteDaten, status: 'active', customer_id: s1.customerId || null }) });
        result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Speichern fehlgeschlagen');
      }
      const sessionId = localStorage.getItem('scaffold_session_id');
      if (sessionId) {
        try { await fetch('/api/attach-photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, projectId: result.id }) }); localStorage.removeItem('scaffold_session_id'); } catch (photoErr) { console.error('Foto-Verknüpfung fehlgeschlagen:', photoErr); }
      }
      setSavedProjectId(result.id);
      // Temporäre Upload-/KI-Daten aufräumen, damit sie nicht ins nächste Projekt rutschen
      localStorage.removeItem('scaffold_lidar_measurements');
      localStorage.removeItem('scaffold_foto_analyse');
      localStorage.removeItem('scaffold_foto_daten');
      localStorage.removeItem('scaffold_grundriss_analyse');
      localStorage.removeItem('scaffold_grundriss_daten');
      localStorage.setItem('scaffold_step6', JSON.stringify({ kiResult, savedAt: new Date().toISOString() }));
      alert('✅ Projekt gespeichert! ID: ' + result.id);
    } catch (err: any) { alert('❌ Speichern fehlgeschlagen: ' + err.message); } finally { setIsSaving(false); }
  }
  async function handleSaveStueckliste() {
    if (!kiResult) { alert('Bitte zuerst KI-Berechnung durchführen!'); return; }
    if (!savedProjectId) { alert('Bitte zuerst "Projekt speichern" klicken!'); return; }
    try { const res = await fetch('/api/stueckliste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: savedProjectId, materialList: kiResult.materialList }) }); if (!res.ok) throw new Error('Fehler'); alert('✅ Stückliste gespeichert!'); } catch { alert('❌ Fehler beim Speichern der Stückliste'); }
  }
  function handleManualEdit() {
    if (!kiResult) { alert('Bitte zuerst KI-Berechnung durchführen!'); return; }
    if (!editMode) { setEditedMaterials(kiResult.materialList.map((item: any) => ({ ...item }))); } else {
      const updated = { ...kiResult, materialList: editedMaterials, totalMaterialCost: editedMaterials.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0), totalCost: 0 };
      updated.totalCost = updated.totalMaterialCost + updated.laborCost + updated.transportCost;
      updated.suggestedPrice = updated.totalCost * 1.25; updated.margin = updated.suggestedPrice - updated.totalCost; updated.marginPercent = 25;
      setKiResult(updated);
    }
    setEditMode(!editMode);
  }
  function handleQuantityChange(index: number, newQty: number) {
    setEditedMaterials((prev) => { const updated = [...prev]; const item = { ...updated[index] }; item.quantity = Math.max(0, newQty); item.totalPrice = item.quantity * item.unitPrice; updated[index] = item; return updated; });
  }
  function handleZurueck() { router.push('/aufmass/schritt5'); }

  // ═══════════════════════════════════════════════════════════
  // NEU: E-MAIL, QR, UNTERSCHRIFT HANDLER
  // ═══════════════════════════════════════════════════════════

  // PDF generieren UND als Base64 speichern (für E-Mail)
  function generatePDFBase64(): string | null {
    if (!kiResult) return null;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 58, 138); doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.text('SCAFFOLD OS', 14, 18);
    doc.setFontSize(22); doc.text('ANGEBOT', pageWidth - 14, 18, { align: 'right' });
    doc.setFontSize(9); doc.text('KI-gestützte Gerüstbau-Kalkulation', pageWidth - 14, 26, { align: 'right' });
    let y = 45;
    const sysName = systemAnzeigename(s3.system, s3.customSystem);
    const projBoxH = sysName ? 38 : 30;
    doc.setFillColor(248, 250, 252); doc.rect(14, y, 90, projBoxH, 'F');
    doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('PROJEKT', 18, y + 6);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); doc.setFontSize(9);
    doc.text(`Kunde: ${s1.name || '-'}`, 18, y + 14); doc.text(`Adresse: ${s1.adresse || '-'}`, 18, y + 20);
    doc.text(`Gewerk: ${s1.gewerk || '-'}`, 18, y + 26);
    if (sysName) doc.text(`System: ${sysName}`, 18, y + 32);
    doc.setFillColor(248, 250, 252); doc.rect(108, y, 88, 30, 'F');
    doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('ANGEBOTSDATEN', 112, y + 6);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); doc.setFontSize(9);
    doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, 112, y + 14); doc.text(`Gültig bis: ${new Date(Date.now() + 30 * 86400000).toLocaleDateString('de-DE')}`, 112, y + 20); doc.text(`Gerüstklasse: ${kiResult.scaffoldClass || '-'}`, 112, y + 26);
    y = 82 + (projBoxH - 30);
    const riskColor = kiResult.riskLevel === 'red' ? [239, 68, 68] : kiResult.riskLevel === 'yellow' ? [245, 158, 11] : [16, 185, 129];
    doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]); doc.circle(pageWidth - 30, y, 5, 'F');
    doc.setTextColor(riskColor[0], riskColor[1], riskColor[2]); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    const riskText = kiResult.riskLevel === 'red' ? 'HOCHES RISIKO' : kiResult.riskLevel === 'yellow' ? 'MITTLERES RISIKO' : 'NIEDRIGES RISIKO';
    doc.text(riskText, pageWidth - 14, y + 1, { align: 'right' });
    y = 95; doc.setTextColor(30, 58, 138); doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('Materialliste (KI-berechnet)', 14, y);
    const tableBody = kiResult.materialList.map((item, i) => [(i + 1).toString(), item.articleNumber, item.name, item.quantity.toString(), item.unit, item.unitPrice.toFixed(2) + ' €', item.totalPrice.toFixed(2) + ' €']);
    autoTable(doc, { startY: y + 5, head: [['Pos.', 'Art.-Nr.', 'Bezeichnung', 'Menge', 'Einh.', 'Einzel', 'Gesamt']], body: tableBody, theme: 'grid', headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8, fontStyle: 'bold' }, bodyStyles: { fontSize: 8, textColor: 15 }, alternateRowStyles: { fillColor: [248, 250, 252] }, columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 25 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 18, halign: 'right' }, 4: { cellWidth: 18, halign: 'center' }, 5: { cellWidth: 25, halign: 'right' }, 6: { cellWidth: 28, halign: 'right' } }, margin: { left: 14, right: 14 } });
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFillColor(248, 250, 252); doc.rect(110, finalY, 86, 75, 'F'); let cy = finalY + 8;
    doc.setFontSize(9); doc.setTextColor(71, 85, 105); doc.setFont('helvetica', 'normal');
    doc.text('Materialkosten', 116, cy); doc.text(kiResult.totalMaterialCost.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 10;
    doc.text('Lohnkosten', 116, cy); doc.text(`(${kiResult.estimatedLaborHours} h)`, 116, cy + 5); doc.text(kiResult.laborCost.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 14;
    doc.text('Transport & Logistik', 116, cy); doc.text(kiResult.transportCost.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 12;
    doc.setDrawColor(203, 213, 225); doc.line(116, cy, 190, cy); cy += 8;
    doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.text('GESAMTKOSTEN', 116, cy); doc.text(kiResult.totalCost.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 14;
    doc.setFillColor(236, 253, 245); doc.rect(110, cy - 5, 86, 20, 'F'); doc.setTextColor(4, 120, 87); doc.setFontSize(8); doc.text('Empfohlener Verkaufspreis', 116, cy + 2); doc.setFontSize(12); doc.text(kiResult.suggestedPrice.toFixed(2) + ' €', 190, cy + 2, { align: 'right' }); doc.setFontSize(8); doc.text(`Marge: ${kiResult.margin.toFixed(2)} € (${kiResult.marginPercent}%)`, 116, cy + 12);
    // NEU: Angebot-Anpassungen (Skonto, Mietverlängerung, Nachtrag, Sonderrabatt)
    const ang = calcAngebot();
    const hatAnpassungen = anpassungen.skonto || anpassungen.miete.aktiv || anpassungen.nachtrag.aktiv || anpassungen.rabatt.aktiv;
    if (hatAnpassungen) {
      cy += 22;
      if (cy > 235) { doc.addPage(); cy = 30; } // Platz-Sicherung bei langen Materiallisten
      doc.setTextColor(30, 58, 138); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text('Angebots-Anpassungen', 110, cy); cy += 8;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
      doc.text('Basispreis (KI-Kalkulation)', 116, cy); doc.text(ang.basis.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 9;
      if (anpassungen.miete.aktiv && ang.mieteBetrag > 0) {
        doc.text(`Mietverlängerung (${anpassungen.miete.wochen} Wo.)`, 116, cy);
        doc.text('+' + ang.mieteBetrag.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 9;
      }
      if (anpassungen.nachtrag.aktiv && ang.nachtragBetrag > 0) {
        doc.text(`Nachtrag: ${(anpassungen.nachtrag.text || 'gem. Vereinbarung').slice(0, 30)}`, 116, cy);
        doc.text('+' + ang.nachtragBetrag.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 9;
      }
      if (anpassungen.rabatt.aktiv && ang.rabattBetrag > 0) {
        doc.text('Sonderrabatt', 116, cy);
        doc.text('-' + ang.rabattBetrag.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 9;
      }
      doc.setDrawColor(203, 213, 225); doc.line(116, cy - 4, 190, cy - 4);
      doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text('ENDPREIS', 116, cy + 4); doc.text(ang.endpreis.toFixed(2) + ' €', 190, cy + 4, { align: 'right' }); cy += 14;
      if (anpassungen.skonto) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(4, 120, 87);
        doc.text('Bei Zahlung innerhalb von 14 Tagen: 2 % Skonto', 116, cy);
        doc.text('-' + ang.skontoBetrag.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('Skonto-Preis', 116, cy); doc.text((ang.endpreis - ang.skontoBetrag).toFixed(2) + ' €', 190, cy, { align: 'right' });
      }
    }
    if (kiResult.warnings.length > 0 || kiResult.tips.length > 0) { let wy = finalY + 8; doc.setTextColor(30, 58, 138); doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Hinweise & Risiken', 14, wy); wy += 10; kiResult.warnings.forEach((w) => { doc.setTextColor(180, 83, 9); doc.setFontSize(8); doc.text('! ' + w, 14, wy, { maxWidth: 90 }); wy += 14; }); kiResult.tips.forEach((t) => { doc.setTextColor(3, 105, 161); doc.setFontSize(8); doc.text('> ' + t, 14, wy, { maxWidth: 90 }); wy += 14; }); }
    doc.addPage(); doc.setTextColor(30, 58, 138); doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('Allgemeine Geschäftsbedingungen', 14, 30); doc.setTextColor(71, 85, 105); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    const agbText = '1. Das Angebot ist 30 Tage ab Ausstellungsdatum gültig.\n2. Preise verstehen sich zuzüglich der gesetzlichen Mehrwertsteuer.\n3. Liefer- und Leistungszeitpunkt wird individuell vereinbart.\n4. Zahlungsziel: 14 Tage nach Rechnungsstellung.\n5. Gerüstbau erfolgt nach aktuellen Sicherheitsvorschriften (DGUV).\n6. Bei Änderungen der Baustellenverhältnisse behalten wir uns Preisanpassungen vor.'
      + (anpassungen.skonto ? '\n7. Bei Zahlung innerhalb von 14 Tagen ab Rechnungsdatum gewähren wir 2 % Skonto auf den Endpreis.' : '');
    doc.text(agbText, 14, 45, { maxWidth: 180, lineHeightFactor: 1.5 });
    doc.setDrawColor(15, 23, 42); doc.line(14, 230, 100, 230); doc.line(110, 230, 196, 230); doc.setTextColor(15, 23, 42); doc.setFontSize(9); doc.text('Ort, Datum', 14, 236); doc.text('Unterschrift Auftraggeber', 14, 242); doc.text('Ort, Datum', 110, 236); doc.text('Unterschrift Auftragnehmer', 110, 242);
    doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.text('SCAFFOLD OS • KI-gestützte Gerüstbau-Software • Automatisch generiert', pageWidth / 2, 285, { align: 'center' });
    return doc.output('datauristring');
  }

  // NEU: PDF + Download
  function handlePDF() {
    if (!kiResult) { alert('Bitte zuerst KI-Materialberechnung durchführen!'); return; }
    const base64 = generatePDFBase64();
    if (!base64) return;
    setPdfBase64(base64);
    // Download
    const link = document.createElement('a');
    link.href = base64;
    link.download = `Angebot_${s1.name?.replace(/\s+/g, '_') || 'Projekt'}_${new Date().toISOString().split('T')[0]}.pdf`;
    link.click();
    setAngebotsStatus('erstellt');
  }

  // NEU (Prio-2-Sprint): Angebotsstatus dauerhaft im Projekt sichern
  async function persistAngebotsStatus(status: string) {
    if (!savedProjectId) return;
    try {
      await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: savedProjectId, data: { angebotsStatus: status } }),
      });
    } catch { /* Status-Speicherung optional, UI bleibt führend */ }
  }

  // NEU: E-Mail senden
  async function handleEmailSend() {
    if (!kiResult || !savedProjectId) { alert('Bitte zuerst KI-Berechnung durchführen und Projekt speichern!'); return; }
    if (!customerEmail) { alert('Bitte E-Mail-Adresse des Kunden eingeben!'); return; }
    setEmailStatus('sending');
    try {
      const base64 = pdfBase64 || generatePDFBase64();
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: customerEmail,
          projectName: s1.name || 'Projekt',
          projectId: savedProjectId,
          customerName: s1.name || 'Kunde',
          pdfBase64: base64,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setEmailStatus('sent');
      setAngebotsStatus('versendet');
      persistAngebotsStatus('versendet');
      alert('✅ E-Mail erfolgreich versendet!');
    } catch (err: any) {
      setEmailStatus('error');
      alert('❌ E-Mail fehlgeschlagen: ' + err.message);
    }
  }

  // NEU: Unterschrift speichern
  async function handleSignatureSave(dataUrl: string) {
    setSignatureData(dataUrl);
    setShowSignature(false);
    if (savedProjectId) {
      try {
        // Unterschrift als Base64 in project_media speichern
        const res = await fetch('/api/attach-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: savedProjectId,
            signatureData: dataUrl,
            type: 'signature',
          }),
        });
        if (!res.ok) throw new Error('Fehler beim Speichern');
        alert('✅ Unterschrift gespeichert!');
        setAngebotsStatus('angenommen');
        persistAngebotsStatus('angenommen');
      } catch (err: any) {
        console.error('Unterschrift speichern fehlgeschlagen:', err);
        alert('⚠️ Unterschrift lokal gespeichert (Server-Fehler)');
      }
    } else {
      alert('⚠️ Projekt zuerst speichern, damit die Unterschrift dauerhaft gespeichert wird.');
    }
  }

  // NEU (Phase 13): Rechnung aus angenommenem Angebot erstellen
  function handleRechnung() {
    if (!kiResult || !savedProjectId) return;
    erstelleUndOeffneVersand();
  }

  // NEU (Phase 31): 1 Klick in Schritt 6 → Rechnung wird direkt angelegt UND
  // der Versand-Dialog öffnet sich hier, ohne zu /rechnungen zu navigieren.
  // Sendet nichts automatisch – Versand bleibt ein bewusster, zweiter Klick.
  async function erstelleUndOeffneVersand(overrideGrund?: string) {
    if (!kiResult || !savedProjectId) return;
    const ang = calcAngebot();
    const flaeche = kiResult.totalAreaM2;
    const positions: { bezeichnung: string; menge: number; einheit: string; einzelpreis: number }[] = [];

    positions.push({
      bezeichnung: preisModus === 'festpreis'
        ? `Gerüstbau gemäß Angebot (${flaeche ?? '–'} m² × ${festpreisProM2.replace('.', ',')} €/m²)`
        : 'Gerüstbau gemäß Angebot (Material, Arbeit, Transport)',
      menge: 1, einheit: 'Pauschale', einzelpreis: Math.round(ang.basis * 100) / 100,
    });
    if (anpassungen.miete.aktiv && ang.mieteBetrag > 0) {
      positions.push({ bezeichnung: `Mietverlängerung ${anpassungen.miete.wochen} Wo. à ${anpassungen.miete.preisProWoche} €`, menge: 1, einheit: 'Pauschale', einzelpreis: ang.mieteBetrag });
    }
    if (anpassungen.nachtrag.aktiv && ang.nachtragBetrag > 0) {
      positions.push({ bezeichnung: anpassungen.nachtrag.text?.trim() || 'Nachtrag', menge: 1, einheit: 'Pauschale', einzelpreis: ang.nachtragBetrag });
    }
    if (anpassungen.rabatt.aktiv && ang.rabattBetrag > 0) {
      positions.push({ bezeichnung: 'Sonderrabatt', menge: 1, einheit: 'Pauschale', einzelpreis: -ang.rabattBetrag });
    }

    setRechnungErstellenLaeuft(true);
    setRechnungFehler('');
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: savedProjectId,
          customer_name: s1.name || '',
          customer_address: s1.adresse || '',
          notes: anpassungen.skonto ? '2% Skonto bei Zahlung innerhalb von 8 Tagen.' : undefined,
          positions,
          override_grund: overrideGrund || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        if (json.code === 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH') {
          const grund = prompt(json.error + '\n\nBegründung für die Überschreibung eingeben:');
          setRechnungErstellenLaeuft(false);
          if (grund && grund.trim()) { await erstelleUndOeffneVersand(grund.trim()); }
          return;
        }
        throw new Error(json.error || 'Rechnung konnte nicht angelegt werden.');
      }
      setRechnungErstellt(json.invoice);
      setRechnungEmail(s1.ansprechpartnerEmail || s1.bauleiterEmail || '');
      setZeigeVersandDialog(true);
    } catch (err: any) {
      setRechnungFehler(err.message);
    }
    setRechnungErstellenLaeuft(false);
  }

  async function handleRechnungVersenden() {
    if (!rechnungErstellt || !rechnungEmail.trim() || !rechnungEmail.includes('@')) {
      setRechnungFehler('Bitte eine gültige E-Mail-Adresse eingeben.');
      return;
    }
    setRechnungSendenLaeuft(true);
    setRechnungFehler('');
    try {
      const doc = generateInvoicePDF(rechnungErstellt);
      const pdfBase64 = doc.output('datauristring');
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'rechnung', to: rechnungEmail.trim(), projectId: savedProjectId,
          projectName: s1.name, customerName: s1.name,
          invoiceNumber: rechnungErstellt.invoice_number, grossAmount: Number(rechnungErstellt.gross_amount),
          dueDate: fmtRechnungsDatum(rechnungErstellt.due_date), pdfBase64,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Versand fehlgeschlagen.');
      setRechnungVersendet(true);
    } catch (err: any) {
      setRechnungFehler(err.message);
    }
    setRechnungSendenLaeuft(false);
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER ZUSAMMENFASSUNG (unverändert)
  // ═══════════════════════════════════════════════════════════
  function renderZusammenfassung() {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-black/10/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#e8590c] mb-2">Schritt 1 – Projekt</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-[#86868b]">Kunde:</span> <span className="text-[#1d1d1f]">{s1.name || '–'}</span></div>
            <div><span className="text-[#86868b]">Adresse:</span> <span className="text-[#1d1d1f]">{s1.adresse || '–'}</span></div>
            <div><span className="text-[#86868b]">Gewerk:</span> <span className="text-[#1d1d1f]">{s1.gewerk || '–'}</span></div>
            <div><span className="text-[#86868b]">Dauer:</span> <span className="text-[#1d1d1f]">{s1.dauer || '–'} Tage</span></div>
            {s1.ansprechpartnerName && <div className="col-span-2"><span className="text-[#86868b]">Ansprechpartner:</span> <span className="text-[#1d1d1f]">{s1.ansprechpartnerName} {s1.ansprechpartnerTelefon} {s1.ansprechpartnerEmail}</span></div>}
            {s1.bauleiterName && <div className="col-span-2"><span className="text-[#86868b]">Bauleiter:</span> <span className="text-[#1d1d1f]">{s1.bauleiterName} {s1.bauleiterTelefon} {s1.bauleiterEmail}</span></div>}
            {s1.projektbeginn && <div><span className="text-[#86868b]">Beginn:</span> <span className="text-[#1d1d1f]">{s1.projektbeginn}</span></div>}
            {s1.arbeitszeiten && <div><span className="text-[#86868b]">Arbeitszeiten:</span> <span className="text-[#1d1d1f]">{s1.arbeitszeiten}</span></div>}
            {s1.gpsPosition && <div className="col-span-2"><span className="text-[#86868b]">GPS-Standort:</span> <span className="text-[#1d1d1f] font-mono text-xs">{s1.gpsPosition}</span></div>}
            {s1.projektende && <div><span className="text-[#86868b]">Ende:</span> <span className="text-[#1d1d1f]">{s1.projektende}</span></div>}
          </div>
        </div>
        <div className="rounded-xl bg-black/10/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#e8590c] mb-2">Schritt 2 – Gebäude</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-[#86868b]">Länge:</span> <span className="text-[#1d1d1f]">{s2.laenge || '–'} m</span></div>
            <div><span className="text-[#86868b]">Höhe:</span> <span className="text-[#1d1d1f]">{s2.hoehe || '–'} m</span></div>
            <div><span className="text-[#86868b]">Breite:</span> <span className="text-[#1d1d1f]">{s2.breite || '–'} m</span></div>
            <div><span className="text-[#86868b]">Traufhöhe:</span> <span className="text-[#1d1d1f]">{s2.traufhoehe || '–'} m</span></div>
            <div><span className="text-[#86868b]">Dachform:</span> <span className="text-[#1d1d1f]">{s2.dachform || '–'}</span></div>
            <div><span className="text-[#86868b]">Fassade:</span> <span className="text-[#1d1d1f]">{s2.fassade || '–'}</span></div>
            <div className="col-span-2"><span className="text-[#86868b]">Hindernisse:</span> <span className="text-[#1d1d1f]">{(s2.hindernisse || []).join(', ') || 'Keine'}</span></div>
          </div>
        </div>
        <div className="rounded-xl bg-black/10/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#e8590c] mb-2">Schritt 3 – Gerüstplanung</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-[#86868b]">Gerüsttyp:</span> <span className="text-[#1d1d1f]">{s3.geruesttyp || '–'}</span></div>
            <div><span className="text-[#86868b]">System:</span> <span className="text-[#1d1d1f]">{systemAnzeigename(s3.system, s3.customSystem) || 'Hersteller-neutral'}</span></div>
            <div><span className="text-[#86868b]">Belag:</span> <span className="text-[#1d1d1f]">{s3.belag || '–'}</span></div>
            <div><span className="text-[#86868b]">Feldlänge:</span> <span className="text-[#1d1d1f]">{s3.feldlänge || s3.feldlange || '–'} m</span></div>
            <div><span className="text-[#86868b]">Untergrund:</span> <span className="text-[#1d1d1f]">{s3.untergrund || s3.boden || '–'}</span></div>
          </div>
        </div>
        <div className="rounded-xl bg-black/10/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#e8590c] mb-2">Schritt 4 – Sicherheit</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-[#86868b]">Anker:</span> <span className="text-[#1d1d1f]">{s4.anker || '–'}</span></div>
            <div><span className="text-[#86868b]">Windzone:</span> <span className="text-[#1d1d1f]">{s4.windzone || '–'}</span></div>
            <div className="col-span-2"><span className="text-[#86868b]">Gefahren:</span> <span className="text-[#1d1d1f]">{mapGefahren(s4).join(', ') || 'Keine'}</span></div>
          </div>
        </div>
        <div className="rounded-xl bg-black/10/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#e8590c] mb-2">Schritt 5 – Material & Termine</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-[#86868b]">Liefertermin:</span> <span className="text-[#1d1d1f]">{s5.liefertermin || '–'}</span></div>
            <div><span className="text-[#86868b]">Abholtermin:</span> <span className="text-[#1d1d1f]">{s5.abholtermin || '–'}</span></div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] p-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={handleZurueck} className="text-[#86868b] hover:text-[#1d1d1f] text-sm mb-2">← Zurück</button>
        <h1 className="text-3xl font-bold mb-2">📋 Zusammenfassung & KI-Planung</h1>
        <p className="text-[#86868b] mb-6">Baustelle: Schritt 6 von 6</p>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ANGEBOTSSTATUS-TRACKER */}
        {savedProjectId && (
          <div className="mb-6 bg-[#f5f5f7] rounded-xl border border-black/10 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-[#e8590c] uppercase tracking-wider">Angebotsstatus</h3>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                angebotsStatus === 'angenommen' ? 'bg-green-500 text-green-950' :
                angebotsStatus === 'gelesen' ? 'bg-blue-500 text-blue-950' :
                angebotsStatus === 'versendet' ? 'bg-amber-500 text-amber-950' :
                'bg-black/10 text-[#424245]'
              }`}>
                {angebotsStatus === 'erstellt' ? '✏️ Erstellt' :
                 angebotsStatus === 'versendet' ? '📧 Versendet' :
                 angebotsStatus === 'gelesen' ? '👁️ Gelesen' :
                 '✅ Angenommen'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {['erstellt', 'versendet', 'gelesen', 'angenommen'].map((status, i) => (
                <div key={status} className="flex items-center gap-2 flex-1">
                  <div className={`h-2 flex-1 rounded-full ${
                    ['erstellt', 'versendet', 'gelesen', 'angenommen'].indexOf(angebotsStatus) >= i
                      ? status === 'angenommen' ? 'bg-green-500' : 'bg-amber-500'
                      : 'bg-black/10'
                  }`} />
                  {i < 3 && <div className="w-2 h-2 rounded-full bg-black/20" />}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1 text-xs text-[#86868b]">
              <span>Erstellt</span><span>Versendet</span><span>Gelesen</span><span>Angenommen</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-[#f5f5f7] rounded-xl p-6">
              <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Projektdaten</h2>
              {renderZusammenfassung()}
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* AKTIONEN – ERWEITERT */}
            <div className="bg-[#f5f5f7] rounded-xl p-6 space-y-3">
              <h2 className="text-lg font-bold text-[#1d1d1f] mb-2">Aktionen</h2>

              <button onClick={handleSpeichern} disabled={isSaving} className="w-full rounded-xl bg-black/10 hover:bg-black/15 disabled:opacity-50 disabled:cursor-not-allowed py-3 font-semibold text-[#1d1d1f] transition-colors">
                {isSaving ? '💾 Wird gespeichert...' : '💾 Projekt speichern'}
              </button>

              <button onClick={handlePDF} className="w-full rounded-xl bg-black/10 hover:bg-black/15 py-3 font-semibold text-[#1d1d1f] transition-colors">
                📄 PDF erzeugen & herunterladen
              </button>

              {/* NEU: E-Mail */}
              {savedProjectId && kiResult && (
                <div className="space-y-2 pt-2 border-t border-black/10">
                  <label className="block text-xs text-[#86868b]">E-Mail Kunde</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                    placeholder="kunde@beispiel.de"
                    className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#e8590c]"
                  />
                  <button
                    onClick={handleEmailSend}
                    disabled={emailStatus === 'sending' || !customerEmail}
                    className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 font-semibold text-white transition-colors"
                  >
                    {emailStatus === 'sending' ? '📧 Wird gesendet...' :
                     emailStatus === 'sent' ? '✅ E-Mail versendet' :
                     emailStatus === 'error' ? '❌ Fehler – erneut versuchen' :
                     '📧 Angebot per E-Mail senden'}
                  </button>
                </div>
              )}

              {/* NEU: QR-Code */}
              {savedProjectId && (
                <div className="pt-2 border-t border-black/10">
                  <button onClick={() => setShowQR(!showQR)} className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 py-3 font-semibold text-white transition-colors">
                    {showQR ? '📱 QR-Code ausblenden' : '📱 QR-Code anzeigen'}
                  </button>
                  {showQR && (
                    <div className="mt-3 bg-white rounded-xl p-4 text-center">
                      <img
                        src={`/api/qr?projectId=${savedProjectId}&size=200`}
                        alt="QR-Code"
                        className="mx-auto"
                      />
                      <p className="text-xs text-[#86868b] mt-2">Scanne für Projekt-Details</p>
                      <p className="text-xs text-[#86868b]">ID: {savedProjectId}</p>
                    </div>
                  )}
                </div>
              )}

              {/* NEU (Phase 18): DIN EN 12811 KI-Check */}
              <DinCheck projektId={savedProjectId} />

              {/* NEU: Unterschrift */}
              {savedProjectId && (
                <div className="pt-2 border-t border-black/10">
                  <button onClick={() => setShowSignature(!showSignature)} className="w-full rounded-xl bg-green-600 hover:bg-green-500 py-3 font-semibold text-white transition-colors">
                    {showSignature ? '✍️ Unterschrift schließen' : signatureData ? '✅ Unterschrift vorhanden' : '✍️ Kunden-Unterschrift'}
                  </button>
                  {showSignature && (
                    <div className="mt-3">
                      <SignaturePad
                        onSave={handleSignatureSave}
                        onCancel={() => setShowSignature(false)}
                      />
                    </div>
                  )}
                  {signatureData && !showSignature && (
                    <div className="mt-3 bg-white rounded-xl p-2">
                      <img src={signatureData} alt="Unterschrift" className="h-16 mx-auto" />
                    </div>
                  )}
                </div>
              )}

              {/* NEU (Phase 13/31): Rechnung erstellen, sobald Angebot angenommen –
                  1 Klick legt die Rechnung direkt an und öffnet den Versand-Dialog hier. */}
              {angebotsStatus === 'angenommen' && savedProjectId && kiResult && !zeigeVersandDialog && (
                <div className="pt-2 border-t border-black/10">
                  <button onClick={handleRechnung} disabled={rechnungErstellenLaeuft} className="w-full rounded-xl bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 py-3 font-bold text-white transition-colors">
                    {rechnungErstellenLaeuft ? '⏳ Rechnung wird angelegt…' : '🧾 Rechnung erstellen'}
                  </button>
                  {rechnungFehler && <p className="text-xs text-red-600 mt-2">❌ {rechnungFehler}</p>}
                </div>
              )}

              {/* NEU (Phase 31): Versand-Dialog direkt hier, kein Sprung zu /rechnungen */}
              {zeigeVersandDialog && rechnungErstellt && (
                <div className="pt-2 border-t border-black/10">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-3">
                    <p className="text-sm font-semibold text-emerald-800">✅ Rechnung {rechnungErstellt.invoice_number} angelegt ({Number(rechnungErstellt.gross_amount).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €)</p>
                    {!rechnungVersendet ? (
                      <>
                        <div>
                          <label className="block text-xs text-[#86868b] mb-1">An welche E-Mail-Adresse senden?</label>
                          <input
                            value={rechnungEmail}
                            onChange={(e) => setRechnungEmail(e.target.value)}
                            placeholder="kunde@beispiel.de"
                            className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-sm text-[#1d1d1f]"
                          />
                        </div>
                        {rechnungFehler && <p className="text-xs text-red-600">❌ {rechnungFehler}</p>}
                        <div className="flex gap-2">
                          <button onClick={handleRechnungVersenden} disabled={rechnungSendenLaeuft} className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 font-bold text-white text-sm transition-colors">
                            {rechnungSendenLaeuft ? '⏳ Wird gesendet…' : '📧 Jetzt senden'}
                          </button>
                          <button onClick={() => { const doc = generateInvoicePDF(rechnungErstellt); doc.save(`Rechnung_${rechnungErstellt.invoice_number}.pdf`); }} className="rounded-xl bg-black/5 hover:bg-black/10 px-4 py-2.5 text-sm font-medium">📄 PDF</button>
                        </div>
                        <button onClick={() => router.push('/rechnungen')} className="text-xs text-[#86868b] hover:underline">Später versenden – zu allen Rechnungen</button>
                      </>
                    ) : (
                      <p className="text-sm text-emerald-800">📧 Versendet an {rechnungEmail}.</p>
                    )}
                  </div>
                </div>
              )}

              {kiResult && (
                <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-black/10">
                  <button onClick={handleSaveStueckliste} className="rounded-xl bg-blue-600 hover:bg-blue-500 py-2 text-xs font-bold text-white transition-colors">💾 Stückliste</button>
                  <button onClick={handlePDF} className="rounded-xl bg-red-600 hover:bg-red-500 py-2 text-xs font-bold text-white transition-colors">📄 Angebot PDF</button>
                  <button onClick={handleManualEdit} className="rounded-xl bg-orange-600 hover:bg-orange-500 py-2 text-xs font-bold text-white transition-colors">{editMode ? '✅ Fertig' : '✏️ Manuell'}</button>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {/* KI-Berechnung (unverändert) */}
            <div className="bg-[#f5f5f7] rounded-xl p-6 border border-blue-500/20">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">🤖</span>
                <div>
                  <h2 className="text-xl font-bold text-[#1d1d1f]">KI-Materialberechnung</h2>
                  <p className="text-sm text-[#86868b]">Automatische Stückliste, Kostenkalkulation und Risikoanalyse</p>
                  <KiHinweis text="KI-gestützte Berechnung (Mistral). Materialliste und Preis sind Vorschläge – bitte fachlich prüfen, bevor das Angebot rausgeht." />
                </div>
              </div>
              <button onClick={handleKIBerechnung} disabled={kiLoading} className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-4 font-bold text-white transition-colors">
                {kiLoading ? <span className="flex items-center justify-center gap-2"><span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>KI berechnet Materialliste...</span> : '🚀 KI Planung starten'}
              </button>
              {kiError && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4"><p className="text-sm font-medium text-red-700">Fehler: {kiError}</p></div>}
            </div>

            {kiResult && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                {kiResult.sectionBreakdown && kiResult.sectionBreakdown.length > 1 && (
                  <div className="bg-[#f5f5f7] rounded-xl p-4 mb-4 border border-black/10">
                    <p className="text-sm font-semibold text-[#1d1d1f] mb-2">📐 Abschnitte ({kiResult.sectionBreakdown.length}, Gesamtfläche {kiResult.totalAreaM2} m²)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {kiResult.sectionBreakdown.map((s: any, i: number) => (
                        <div key={i} className="bg-white rounded-lg px-3 py-2 text-xs border border-black/5">
                          <span className="font-medium text-[#1d1d1f]">{s.bezeichnung}</span>
                          <span className="text-[#86868b]"> · {s.areaM2} m² · {s.fields} Felder × {s.levels} Ebenen</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <KIMaterialResult result={kiResult} loading={kiLoading} onSaveStueckliste={handleSaveStueckliste} onGeneratePDF={handlePDF} onManualEdit={handleManualEdit} />
              </div>
            )}

            {/* ═══ NEU: Angebot anpassen (Skonto / Mietverlängerung / Nachtrag / Sonderrabatt) ═══ */}
            {kiResult && (() => {
              const a = calcAngebot();
              const toggleCls = (on: boolean) =>
                `rounded-lg border px-3 py-1.5 text-xs font-bold transition ${on ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-[#f5f5f7] border-black/10 text-[#86868b] hover:border-black/20'}`;
              const inputCls = 'w-full bg-[#f5f5f7] border border-black/10 rounded-lg px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#e8590c]';
              return (
                <div className="bg-[#f5f5f7] rounded-xl p-6 border border-[#e8590c]/20 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">💶</span>
                    <div>
                      <h3 className="text-xl font-bold text-[#1d1d1f]">Angebot anpassen</h3>
                      <p className="text-sm text-[#86868b]">Skonto, Mietverlängerung, Nachtrag und Sonderrabatt – fließt automatisch ins PDF</p>
                    </div>
                  </div>

                  {/* ─── Skonto: 1 Klick ─── */}
                  <div className="flex items-center justify-between bg-black/10/40 rounded-xl p-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-[#1d1d1f]">2 % Skonto</p>
                      <p className="text-xs text-[#86868b]">Wird als Skonto-Klausel und Skonto-Preis im Angebot ausgewiesen</p>
                    </div>
                    <button onClick={() => setAnpassungen((p) => ({ ...p, skonto: !p.skonto }))} className={toggleCls(anpassungen.skonto)}>
                      {anpassungen.skonto ? '✅ Aktiv' : 'Aktivieren'}
                    </button>
                  </div>

                  {/* ─── NEU (Phase 30): Preisbasis – KI-Kalkulation oder Festpreis/m² ─── */}
                  <div className="bg-white rounded-xl p-4 mb-4 border border-black/10">
                    <p className="text-sm font-semibold text-[#1d1d1f] mb-2">Preisbasis für dieses Angebot</p>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button onClick={() => setPreisModus('ki')} className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${preisModus === 'ki' ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-[#f5f5f7] border-black/10 text-[#86868b]'}`}>
                        🧮 KI-Kalkulation
                      </button>
                      <button onClick={() => setPreisModus('festpreis')} className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${preisModus === 'festpreis' ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-[#f5f5f7] border-black/10 text-[#86868b]'}`}>
                        📐 Festpreis pro m²
                      </button>
                    </div>
                    {preisModus === 'festpreis' && (
                      <div className="flex items-center gap-2">
                        <input
                          value={festpreisProM2}
                          onChange={(e) => setFestpreisProM2(e.target.value)}
                          placeholder="z.B. 18,50"
                          className={inputCls + ' w-32'}
                        />
                        <span className="text-xs text-[#86868b]">€/m² × {kiResult.totalAreaM2 ?? '–'} m² = <strong>{((parseFloat(festpreisProM2.replace(',', '.')) || 0) * (kiResult.totalAreaM2 ?? 0)).toFixed(2)} €</strong></span>
                      </div>
                    )}
                    <p className="text-[10px] text-[#86868b] mt-1.5">Material-/Kostenaufstellung unten zeigt weiterhin die KI-Kalkulation (für die eigene Kalkulation) – der Angebotspreis an den Kunden folgt der hier gewählten Basis.</p>
                  </div>

                  <div className="bg-black/10/40 rounded-xl p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#1d1d1f]">Länger mieten (Option)</p>
                        <p className="text-xs text-[#86868b]">Zusatzwochen und Preis pro Woche selbst eintragen</p>
                      </div>
                      <button onClick={() => setAnpassungen((p) => ({ ...p, miete: { ...p.miete, aktiv: !p.miete.aktiv } }))} className={toggleCls(anpassungen.miete.aktiv)}>
                        {anpassungen.miete.aktiv ? '✅ Aktiv' : 'Aktivieren'}
                      </button>
                    </div>
                    {anpassungen.miete.aktiv && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="block text-xs text-[#86868b] mb-1">Zusätzliche Wochen</label>
                          <input type="number" min="0" value={anpassungen.miete.wochen}
                            onChange={(e) => setAnpassungen((p) => ({ ...p, miete: { ...p.miete, wochen: e.target.value } }))}
                            placeholder="z. B. 4" className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-xs text-[#86868b] mb-1">Preis pro Woche (€)</label>
                          <input type="number" min="0" step="0.01" value={anpassungen.miete.preisProWoche}
                            onChange={(e) => setAnpassungen((p) => ({ ...p, miete: { ...p.miete, preisProWoche: e.target.value } }))}
                            placeholder="z. B. 180" className={inputCls} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ─── Nachtrag ─── */}
                  <div className="bg-black/10/40 rounded-xl p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#1d1d1f]">Nachtrag</p>
                        <p className="text-xs text-[#86868b]">Zusatzleistung mit eigenem Betrag</p>
                      </div>
                      <button onClick={() => setAnpassungen((p) => ({ ...p, nachtrag: { ...p.nachtrag, aktiv: !p.nachtrag.aktiv } }))} className={toggleCls(anpassungen.nachtrag.aktiv)}>
                        {anpassungen.nachtrag.aktiv ? '✅ Aktiv' : 'Aktivieren'}
                      </button>
                    </div>
                    {anpassungen.nachtrag.aktiv && (
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div className="col-span-2">
                          <label className="block text-xs text-[#86868b] mb-1">Beschreibung</label>
                          <input type="text" value={anpassungen.nachtrag.text}
                            onChange={(e) => setAnpassungen((p) => ({ ...p, nachtrag: { ...p.nachtrag, text: e.target.value } }))}
                            placeholder="z. B. Fangnetz Giebelseite" className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-xs text-[#86868b] mb-1">Betrag (€)</label>
                          <input type="number" min="0" step="0.01" value={anpassungen.nachtrag.betrag}
                            onChange={(e) => setAnpassungen((p) => ({ ...p, nachtrag: { ...p.nachtrag, betrag: e.target.value } }))}
                            placeholder="z. B. 250" className={inputCls} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ─── Sonderrabatt ─── */}
                  <div className="bg-black/10/40 rounded-xl p-3 mb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#1d1d1f]">Sonderrabatt</p>
                        <p className="text-xs text-[#86868b]">Händischer Nachlass in €, wird vom Preis abgezogen</p>
                      </div>
                      <button onClick={() => setAnpassungen((p) => ({ ...p, rabatt: { ...p.rabatt, aktiv: !p.rabatt.aktiv } }))} className={toggleCls(anpassungen.rabatt.aktiv)}>
                        {anpassungen.rabatt.aktiv ? '✅ Aktiv' : 'Aktivieren'}
                      </button>
                    </div>
                    {anpassungen.rabatt.aktiv && (
                      <div className="mt-3">
                        <label className="block text-xs text-[#86868b] mb-1">Rabatt (€)</label>
                        <input type="number" min="0" step="0.01" value={anpassungen.rabatt.betrag}
                          onChange={(e) => setAnpassungen((p) => ({ ...p, rabatt: { ...p.rabatt, betrag: e.target.value } }))}
                          placeholder="z. B. 500" className={inputCls} />
                      </div>
                    )}
                  </div>

                  {/* ─── Live-Endpreis ─── */}
                  <div className="rounded-xl bg-white/80 border border-black/10 p-4 space-y-1.5 text-sm">
                    <div className="flex justify-between text-[#86868b]"><span>Basispreis (KI)</span><span className="text-[#1d1d1f]">{eur(a.basis)}</span></div>
                    {a.mieteBetrag > 0 && <div className="flex justify-between text-[#86868b]"><span>+ Mietverlängerung</span><span className="text-[#1d1d1f]">{eur(a.mieteBetrag)}</span></div>}
                    {a.nachtragBetrag > 0 && <div className="flex justify-between text-[#86868b]"><span>+ Nachtrag</span><span className="text-[#1d1d1f]">{eur(a.nachtragBetrag)}</span></div>}
                    {a.rabattBetrag > 0 && <div className="flex justify-between text-[#86868b]"><span>− Sonderrabatt</span><span className="text-red-600">−{eur(a.rabattBetrag)}</span></div>}
                    <div className="border-t border-black/10 pt-2 flex justify-between font-bold text-base">
                      <span className="text-[#e8590c]">Endpreis</span>
                      <span className="text-[#e8590c]">{eur(a.endpreis)}</span>
                    </div>
                    {anpassungen.skonto && (
                      <div className="flex justify-between text-xs text-emerald-600">
                        <span>Skonto-Preis (−2 % bei Zahlung in 14 Tagen)</span>
                        <span>{eur(a.endpreis - a.skontoBetrag)}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-[#86868b] pt-1">Alle Angaben netto zzgl. MwSt. Die Anpassungen werden mit dem Projekt gespeichert und ins Angebots-PDF übernommen.</p>
                  </div>
                </div>
              );
            })()}

            {kiResult && editMode && (
              <div className="bg-[#f5f5f7] rounded-xl p-6 border border-yellow-500/30 animate-in fade-in slide-in-from-top-2">
                <h3 className="text-lg font-bold text-[#1d1d1f] mb-4">✏️ Materialliste bearbeiten</h3>
                <div className="space-y-2">
                  {editedMaterials.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 bg-black/10/50 p-3 rounded-xl">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#1d1d1f]">{item.name}</p>
                        <p className="text-xs text-[#86868b]">{item.articleNumber}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleQuantityChange(i, item.quantity - 1)} className="w-8 h-8 rounded bg-black/10 text-[#1d1d1f] hover:bg-black/15">-</button>
                        <span className="w-12 text-center text-[#1d1d1f] font-bold">{item.quantity}</span>
                        <button onClick={() => handleQuantityChange(i, item.quantity + 1)} className="w-8 h-8 rounded bg-black/10 text-[#1d1d1f] hover:bg-black/15">+</button>
                      </div>
                      <div className="w-20 text-right text-sm text-[#1d1d1f]">{(item.quantity * item.unitPrice).toFixed(2)} €</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!kiResult && !kiLoading && !kiError && (
              <div className="rounded-xl border border-dashed border-black/10 bg-black/5 p-8 text-center">
                <p className="text-4xl mb-3">📐</p>
                <p className="text-[#424245] font-medium">Noch keine KI-Berechnung durchgeführt</p>
                <p className="text-sm text-[#86868b] mt-1">Klicke auf "KI Planung starten", um die automatische Materialliste zu erhalten.</p>
              </div>
            )}

            {kiResult && (
              <div className="space-y-6">
                <div className="bg-[#f5f5f7] rounded-xl p-6 border border-emerald-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">🚛</span>
                    <div>
                      <h3 className="text-xl font-bold text-[#1d1d1f]">KI-Disposition</h3>
                      <p className="text-sm text-[#86868b]">Prüfe, ob Material von anderen Baustellen direkt geliefert werden kann</p>
                    </div>
                  </div>
                  <button onClick={handleDisposition} disabled={dispLoading} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed py-4 font-bold text-white transition-colors">
                    {dispLoading ? <span className="flex items-center justify-center gap-2"><span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>Optimiere Routen...</span> : '🚛 Disposition optimieren'}
                  </button>
                  {dispError && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4"><p className="text-sm font-medium text-red-700">Fehler: {dispError}</p></div>}
                </div>
                {dispResult && <div className="animate-in fade-in slide-in-from-top-4 duration-500"><DispositionResult result={dispResult} loading={dispLoading} /></div>}
              </div>
            )}

            {kiResult && (
              <div className="space-y-6">
                <div className="bg-[#f5f5f7] rounded-xl p-6 border border-purple-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">🧊</span>
                    <div>
                      <h3 className="text-xl font-bold text-[#1d1d1f]">Digitaler Zwilling</h3>
                      <p className="text-sm text-[#86868b]">3D-Visualisierung des geplanten Gerüsts</p>
                    </div>
                  </div>
                  <button onClick={() => setShow3D(!show3D)} className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 py-3 font-bold text-white transition-colors">{show3D ? '🧊 3D-Ansicht schließen' : '🧊 3D-Ansicht öffnen'}</button>
                </div>
                {show3D && <div className="animate-in fade-in slide-in-from-top-4 duration-500"><DigitalTwin lengthM={parseFloat(s2.laenge) || 10} heightM={parseFloat(s2.hoehe) || 8} fieldLengthM={parseFloat(s3.feldlänge) || 2.07} showMeasurements={true} /></div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// useSearchParams braucht in Next eine Suspense-Grenze (Prerendering)
export default function Schritt6Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fbfbfd] p-8 text-[#86868b]">Lade Angebot…</div>}>
      <Schritt6Content />
    </Suspense>
  );
}
