'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import KIMaterialResult from '@/components/aufmaß/KIMaterialResult';
import { KIAnalysis } from '@/types/scaffold';
import DispositionResult from '@/components/aufmaß/DispositionResult';
import { DispositionResult as DispositionData } from '@/lib/calculations/disposition';

const DigitalTwin = dynamic(() => import('@/components/aufmaß/DigitalTwin'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] rounded-xl border border-slate-700 bg-slate-800 flex items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
    </div>
  ),
});

export default function Schritt6Page() {
  const router = useRouter();

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

  useEffect(() => {
    const data: Record<string, any> = {};
    for (let i = 1; i <= 5; i++) {
      const raw = localStorage.getItem(`scaffold_step${i}`);
      if (raw) {
        try {
          data[`step${i}`] = JSON.parse(raw);
        } catch {
          data[`step${i}`] = {};
        }
      } else {
        data[`step${i}`] = {};
      }
    }
    setStepData(data);
  }, []);

  const s1 = stepData.step1 || {};
  const s2 = stepData.step2 || {};
  const s3 = stepData.step3 || {};
  const s4 = stepData.step4 || {};
  const s5 = stepData.step5 || {};

  function mapDachform(d: string): string {
    const map: Record<string, string> = {
      Satteldach: 'satteldach',
      Flachdach: 'flachdach',
      Pultdach: 'pultdach',
      Walmdach: 'walmdach',
      Mansarddach: 'mansardendach',
      Zeltdach: 'satteldach',
    };
    return map[d] || 'flachdach';
  }

  function mapFassade(f: string): string {
    const map: Record<string, string> = {
      Klinker: 'mauerwerk',
      WDVS: 'wdvs',
      Beton: 'beton',
      Naturstein: 'mauerwerk',
      Glas: 'glas',
      Holz: 'holz',
      Putz: 'mauerwerk',
      Denkmalschutz: 'denkmal',
    };
    return map[f] || 'mauerwerk';
  }

  function mapHindernisse(step2: any): any[] {
    const list = step2.hindernisse || [];
    const map: Record<string, string> = {
      Erker: 'erker',
      Balkon: 'balkon',
      Wintergarten: 'sonstiges',
      Kamin: 'schornstein',
      Gaube: 'gaube',
      Markise: 'sonstiges',
    };
    const obstacles = list.map((h: string) => ({
      type: map[h] || 'sonstiges',
      count: 1,
      notes: h,
    }));
    if (step2.werbeanlagen) {
      obstacles.push({ type: 'werbeanlage', count: 1, notes: 'Werbeanlage' });
    }
    if (step2.garagen) {
      obstacles.push({ type: 'sonstiges', count: 1, notes: 'Garage/Nebengebäude' });
    }
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
    return {
      customer: s1.name || '',
      address: s1.adresse || '',
      trade: (s1.gewerk || 'allgemein').toLowerCase(),
      projectDurationDays: parseInt(s1.dauer) || 30,
      lengthM: parseFloat(s2.laenge) || 0,
      heightM: parseFloat(s2.hoehe) || 0,
      widthM: parseFloat(s2.breite) || 0,
      eavesHeightM: parseFloat(s2.traufhoehe) || 0,
      roofForm: mapDachform(s2.dachform),
      roofOverhangM: parseFloat(s2.dachueberstand) || 0,
      facadeType: mapFassade(s2.fassade),
      obstacles: mapHindernisse(s2),
      scaffoldType: (s3.geruesttyp || 'rahmen').toLowerCase(),
      deckingType: (s3.belag || 'stahl').toLowerCase(),
      fieldLengthM: parseFloat(s3.feldlänge) || 2.07,
      groundType: (s3.untergrund || 'beton').toLowerCase(),
      anchorType: (s4.anker || 'fassadenanker').toLowerCase(),
      groundCondition: (s4.untergrund || 'beton').toLowerCase(),
      hasSlope: s4.gefaelle || false,
      hasLightShafts: s4.lichtschaechte || false,
      hasBasement: s4.keller || false,
      needsLoadDistribution: s4.lastverteilplatten || false,
      environment: {
        hasPowerLines: s4.freileitungen || false,
        hasVegetation: s4.vegetation || false,
        hasNeighborProperty: s4.nachbargrundstueck || false,
        hasPublicTraffic: s2.durchfahrt || false,
        needsNoParkingZone: s4.halteverbotszone || false,
        needsSpecialUse: s4.sondernutzung || false,
        hasStorageArea: s4.lagerflaeche || false,
        hasTruckAccess: s4.lkw_zufahrt || false,
        needsCrane: s4.kran || false,
        needsProtectionRoof: s4.schutzdach || false,
        needsSafetyNet: s4.fangnetz || false,
      },
      windZone: (parseInt(s4.windzone) as 1 | 2 | 3 | 4) || 1,
      hazards: mapGefahren(s4),
      additionalNotes: s4.zusaetzliche_hinweise || '',
    };
  }

  async function handleKIBerechnung() {
    setKiLoading(true);
    setKiError(null);
    try {
      const payload = buildScaffoldInput();
      if (!payload.lengthM || !payload.heightM) {
        throw new Error('Länge und Höhe fehlen. Bitte zuerst Schritt 2 (Gebäude) ausfüllen.');
      }
      const response = await fetch('/api/ki-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Berechnung fehlgeschlagen');
      }
      const json = await response.json();
      setKiResult(json.data);
    } catch (err: any) {
      setKiError(err.message);
    } finally {
      setKiLoading(false);
    }
  }

  async function handleDisposition() {
    if (!kiResult) {
      alert('Bitte zuerst KI-Materialberechnung durchführen!');
      return;
    }
    setDispLoading(true);
    setDispError(null);
    try {
      const response = await fetch('/api/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialList: kiResult.materialList,
          targetSiteId: s1.id || 'neu',
          targetAddress: s1.adresse || '',
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Disposition fehlgeschlagen');
      }
      const json = await response.json();
      setDispResult(json.data);
    } catch (err: any) {
      setDispError(err.message);
    } finally {
      setDispLoading(false);
    }
  }

  async function handleSpeichern() {
    setIsSaving(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: s1.name || 'Unbenanntes Projekt',
          adresse: s1.adresse || '',
          data: stepData,
          status: 'active',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Speichern fehlgeschlagen');
      }

      const sessionId = localStorage.getItem('scaffold_session_id');
      if (sessionId) {
        try {
          await fetch('/api/attach-photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, projectId: result.id }),
          });
          localStorage.removeItem('scaffold_session_id');
        } catch (photoErr) {
          console.error('Foto-Verknüpfung fehlgeschlagen:', photoErr);
        }
      }

      setSavedProjectId(result.id);
      localStorage.setItem(
        'scaffold_step6',
        JSON.stringify({ kiResult, savedAt: new Date().toISOString() })
      );

      alert('✅ Projekt gespeichert! ID: ' + result.id);
    } catch (err: any) {
      alert('❌ Speichern fehlgeschlagen: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveStueckliste() {
    if (!kiResult) {
      alert('Bitte zuerst KI-Berechnung durchführen!');
      return;
    }
    if (!savedProjectId) {
      alert('Bitte zuerst "Projekt speichern" klicken!');
      return;
    }
    try {
      const res = await fetch('/api/stueckliste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: savedProjectId,
          materialList: kiResult.materialList,
        }),
      });
      if (!res.ok) throw new Error('Fehler');
      alert('✅ Stückliste gespeichert!');
    } catch {
      alert('❌ Fehler beim Speichern der Stückliste');
    }
  }

  function handleManualEdit() {
    if (!kiResult) {
      alert('Bitte zuerst KI-Berechnung durchführen!');
      return;
    }
    if (!editMode) {
      setEditedMaterials(kiResult.materialList.map((item: any) => ({ ...item })));
    } else {
      const updated = {
        ...kiResult,
        materialList: editedMaterials,
        totalMaterialCost: editedMaterials.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0),
        totalCost: 0,
      };
      updated.totalCost = updated.totalMaterialCost + updated.laborCost + updated.transportCost;
      updated.suggestedPrice = updated.totalCost * 1.25;
      updated.margin = updated.suggestedPrice - updated.totalCost;
      updated.marginPercent = 25;
      setKiResult(updated);
    }
    setEditMode(!editMode);
  }

  function handleQuantityChange(index: number, newQty: number) {
    setEditedMaterials((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item.quantity = Math.max(0, newQty);
      item.totalPrice = item.quantity * item.unitPrice;
      updated[index] = item;
      return updated;
    });
  }

  function handlePDF() {
    if (!kiResult) {
      alert('Bitte zuerst KI-Materialberechnung durchführen!');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('SCAFFOLD OS', 14, 18);
    doc.setFontSize(22);
    doc.text('ANGEBOT', pageWidth - 14, 18, { align: 'right' });
    doc.setFontSize(9);
    doc.text('KI-gestützte Gerüstbau-Kalkulation', pageWidth - 14, 26, { align: 'right' });

    let y = 45;
    doc.setFillColor(248, 250, 252);
    doc.rect(14, y, 90, 30, 'F');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('PROJEKT', 18, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.text(`Kunde: ${s1.name || '-'}`, 18, y + 14);
    doc.text(`Adresse: ${s1.adresse || '-'}`, 18, y + 20);
    doc.text(`Gewerk: ${s1.gewerk || '-'}`, 18, y + 26);

    doc.setFillColor(248, 250, 252);
    doc.rect(108, y, 88, 30, 'F');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('ANGEBOTSDATEN', 112, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, 112, y + 14);
    doc.text(`Gültig bis: ${new Date(Date.now() + 30 * 86400000).toLocaleDateString('de-DE')}`, 112, y + 20);
    doc.text(`Gerüstklasse: ${kiResult.scaffoldClass || '-'}`, 112, y + 26);

    y = 82;
    const riskColor = kiResult.riskLevel === 'red' ? [239, 68, 68] : kiResult.riskLevel === 'yellow' ? [245, 158, 11] : [16, 185, 129];
    doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
    doc.circle(pageWidth - 30, y, 5, 'F');
    doc.setTextColor(riskColor[0], riskColor[1], riskColor[2]);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const riskText = kiResult.riskLevel === 'red' ? 'HOCHES RISIKO' : kiResult.riskLevel === 'yellow' ? 'MITTLERES RISIKO' : 'NIEDRIGES RISIKO';
    doc.text(riskText, pageWidth - 14, y + 1, { align: 'right' });

    y = 95;
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Materialliste (KI-berechnet)', 14, y);

    const tableBody = kiResult.materialList.map((item, i) => [
      (i + 1).toString(),
      item.articleNumber,
      item.name,
      item.quantity.toString(),
      item.unit,
      item.unitPrice.toFixed(2) + ' €',
      item.totalPrice.toFixed(2) + ' €',
    ]);

    autoTable(doc, {
      startY: y + 5,
      head: [['Pos.', 'Art.-Nr.', 'Bezeichnung', 'Menge', 'Einh.', 'Einzel', 'Gesamt']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: 15,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 25 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 18, halign: 'right' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 25, halign: 'right' },
        6: { cellWidth: 28, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFillColor(248, 250, 252);
    doc.rect(110, finalY, 86, 75, 'F');
    let cy = finalY + 8;
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.text('Materialkosten', 116, cy);
    doc.text(kiResult.totalMaterialCost.toFixed(2) + ' €', 190, cy, { align: 'right' });
    cy += 10;
    doc.text('Lohnkosten', 116, cy);
    doc.text(`(${kiResult.estimatedLaborHours} h)`, 116, cy + 5);
    doc.text(kiResult.laborCost.toFixed(2) + ' €', 190, cy, { align: 'right' });
    cy += 14;
    doc.text('Transport & Logistik', 116, cy);
    doc.text(kiResult.transportCost.toFixed(2) + ' €', 190, cy, { align: 'right' });
    cy += 12;
    doc.setDrawColor(203, 213, 225);
    doc.line(116, cy, 190, cy);
    cy += 8;
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text('GESAMTKOSTEN', 116, cy);
    doc.text(kiResult.totalCost.toFixed(2) + ' €', 190, cy, { align: 'right' });
    cy += 14;
    doc.setFillColor(236, 253, 245);
    doc.rect(110, cy - 5, 86, 20, 'F');
    doc.setTextColor(4, 120, 87);
    doc.setFontSize(8);
    doc.text('Empfohlener Verkaufspreis', 116, cy + 2);
    doc.setFontSize(12);
    doc.text(kiResult.suggestedPrice.toFixed(2) + ' €', 190, cy + 2, { align: 'right' });
    doc.setFontSize(8);
    doc.text(`Marge: ${kiResult.margin.toFixed(2)} € (${kiResult.marginPercent}%)`, 116, cy + 12);

    if (kiResult.warnings.length > 0 || kiResult.tips.length > 0) {
      let wy = finalY + 8;
      doc.setTextColor(30, 58, 138);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Hinweise & Risiken', 14, wy);
      wy += 10;
      kiResult.warnings.forEach((w) => {
        doc.setTextColor(180, 83, 9);
        doc.setFontSize(8);
        doc.text('! ' + w, 14, wy, { maxWidth: 90 });
        wy += 14;
      });
      kiResult.tips.forEach((t) => {
        doc.setTextColor(3, 105, 161);
        doc.setFontSize(8);
        doc.text('> ' + t, 14, wy, { maxWidth: 90 });
        wy += 14;
      });
    }

    doc.addPage();
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Allgemeine Geschäftsbedingungen', 14, 30);
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const agbText =
      '1. Das Angebot ist 30 Tage ab Ausstellungsdatum gültig.\n' +
      '2. Preise verstehen sich zuzüglich der gesetzlichen Mehrwertsteuer.\n' +
      '3. Liefer- und Leistungszeitpunkt wird individuell vereinbart.\n' +
      '4. Zahlungsziel: 14 Tage nach Rechnungsstellung.\n' +
      '5. Gerüstbau erfolgt nach aktuellen Sicherheitsvorschriften (DGUV).\n' +
      '6. Bei Änderungen der Baustellenverhältnisse behalten wir uns Preisanpassungen vor.';
    doc.text(agbText, 14, 45, { maxWidth: 180, lineHeightFactor: 1.5 });

    doc.setDrawColor(15, 23, 42);
    doc.line(14, 230, 100, 230);
    doc.line(110, 230, 196, 230);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.text('Ort, Datum', 14, 236);
    doc.text('Unterschrift Auftraggeber', 14, 242);
    doc.text('Ort, Datum', 110, 236);
    doc.text('Unterschrift Auftragnehmer', 110, 242);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.text('SCAFFOLD OS • KI-gestützte Gerüstbau-Software • Automatisch generiert', pageWidth / 2, 285, { align: 'center' });

    doc.save(`Angebot_${s1.name?.replace(/\s+/g, '_') || 'Projekt'}_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  function handleZurueck() {
    router.push('/aufmass/schritt5');
  }

  function renderZusammenfassung() {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-700/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-400 mb-2">Schritt 1 – Projekt</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-400">Kunde:</span> <span className="text-white">{s1.name || '–'}</span></div>
            <div><span className="text-slate-400">Adresse:</span> <span className="text-white">{s1.adresse || '–'}</span></div>
            <div><span className="text-slate-400">Gewerk:</span> <span className="text-white">{s1.gewerk || '–'}</span></div>
            <div><span className="text-slate-400">Dauer:</span> <span className="text-white">{s1.dauer || '–'} Tage</span></div>
          </div>
        </div>
        <div className="rounded-lg bg-slate-700/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-400 mb-2">Schritt 2 – Gebäude</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-400">Länge:</span> <span className="text-white">{s2.laenge || '–'} m</span></div>
            <div><span className="text-slate-400">Höhe:</span> <span className="text-white">{s2.hoehe || '–'} m</span></div>
            <div><span className="text-slate-400">Breite:</span> <span className="text-white">{s2.breite || '–'} m</span></div>
            <div><span className="text-slate-400">Traufhöhe:</span> <span className="text-white">{s2.traufhoehe || '–'} m</span></div>
            <div><span className="text-slate-400">Dachform:</span> <span className="text-white">{s2.dachform || '–'}</span></div>
            <div><span className="text-slate-400">Fassade:</span> <span className="text-white">{s2.fassade || '–'}</span></div>
            <div className="col-span-2"><span className="text-slate-400">Hindernisse:</span> <span className="text-white">{(s2.hindernisse || []).join(', ') || 'Keine'}</span></div>
          </div>
        </div>
        <div className="rounded-lg bg-slate-700/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-400 mb-2">Schritt 3 – Gerüstplanung</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-400">Gerüsttyp:</span> <span className="text-white">{s3.geruesttyp || '–'}</span></div>
            <div><span className="text-slate-400">Belag:</span> <span className="text-white">{s3.belag || '–'}</span></div>
            <div><span className="text-slate-400">Feldlänge:</span> <span className="text-white">{s3.feldlänge || '–'} m</span></div>
            <div><span className="text-slate-400">Untergrund:</span> <span className="text-white">{s3.untergrund || '–'}</span></div>
          </div>
        </div>
        <div className="rounded-lg bg-slate-700/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-400 mb-2">Schritt 4 – Sicherheit</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-400">Anker:</span> <span className="text-white">{s4.anker || '–'}</span></div>
            <div><span className="text-slate-400">Windzone:</span> <span className="text-white">{s4.windzone || '–'}</span></div>
            <div className="col-span-2"><span className="text-slate-400">Gefahren:</span> <span className="text-white">{mapGefahren(s4).join(', ') || 'Keine'}</span></div>
          </div>
        </div>
        <div className="rounded-lg bg-slate-700/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-400 mb-2">Schritt 5 – Material & Termine</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-400">Liefertermin:</span> <span className="text-white">{s5.liefertermin || '–'}</span></div>
            <div><span className="text-slate-400">Abholtermin:</span> <span className="text-white">{s5.abholtermin || '–'}</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={handleZurueck} className="text-slate-400 hover:text-white text-sm mb-2">← Zurück</button>
        <h1 className="text-3xl font-bold mb-2">📋 Zusammenfassung & KI-Planung</h1>
        <p className="text-slate-400 mb-6">Baustelle: Schritt 6 von 6</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">Projektdaten</h2>
              {renderZusammenfassung()}
            </div>
            <div className="bg-slate-800 rounded-xl p-6 space-y-3">
              <h2 className="text-lg font-bold text-white mb-2">Aktionen</h2>
              <button 
                onClick={handleSpeichern} 
                disabled={isSaving}
                className="w-full rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed py-3 font-semibold text-white transition-colors"
              >
                {isSaving ? '💾 Wird gespeichert...' : '💾 Projekt speichern'}
              </button>
              <button onClick={handlePDF} className="w-full rounded-lg bg-slate-700 hover:bg-slate-600 py-3 font-semibold text-white transition-colors">📄 PDF erzeugen</button>
              
              {kiResult && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button 
                    onClick={handleSaveStueckliste}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 py-2 text-xs font-bold text-white transition-colors"
                  >
                    💾 Stückliste
                  </button>
                  <button 
                    onClick={handlePDF}
                    className="rounded-lg bg-red-600 hover:bg-red-500 py-2 text-xs font-bold text-white transition-colors"
                  >
                    📄 Angebot PDF
                  </button>
                  <button 
                    onClick={handleManualEdit}
                    className="rounded-lg bg-orange-600 hover:bg-orange-500 py-2 text-xs font-bold text-white transition-colors"
                  >
                    {editMode ? '✅ Fertig' : '✏️ Manuell'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-800 rounded-xl p-6 border border-blue-500/20">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">🤖</span>
                <div>
                  <h2 className="text-xl font-bold text-white">KI-Materialberechnung</h2>
                  <p className="text-sm text-slate-400">Automatische Stückliste, Kostenkalkulation und Risikoanalyse</p>
                </div>
              </div>
              <button onClick={handleKIBerechnung} disabled={kiLoading} className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-4 font-bold text-white transition-colors">
                {kiLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                    KI berechnet Materialliste...
                  </span>
                ) : '🚀 KI Planung starten'}
              </button>
              {kiError && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4"><p className="text-sm font-medium text-red-300">Fehler: {kiError}</p></div>}
            </div>

            {kiResult && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                <KIMaterialResult result={kiResult} loading={kiLoading} />
              </div>
            )}

            {kiResult && editMode && (
              <div className="bg-slate-800 rounded-xl p-6 border border-yellow-500/30 animate-in fade-in slide-in-from-top-2">
                <h3 className="text-lg font-bold text-white mb-4">✏️ Materialliste bearbeiten</h3>
                <div className="space-y-2">
                  {editedMaterials.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-700/50 p-3 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.articleNumber}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleQuantityChange(i, item.quantity - 1)}
                          className="w-8 h-8 rounded bg-slate-600 text-white hover:bg-slate-500"
                        >-</button>
                        <span className="w-12 text-center text-white font-bold">{item.quantity}</span>
                        <button 
                          onClick={() => handleQuantityChange(i, item.quantity + 1)}
                          className="w-8 h-8 rounded bg-slate-600 text-white hover:bg-slate-500"
                        >+</button>
                      </div>
                      <div className="w-20 text-right text-sm text-white">
                        {(item.quantity * item.unitPrice).toFixed(2)} €
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!kiResult && !kiLoading && !kiError && (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/50 p-8 text-center">
                <p className="text-4xl mb-3">📐</p>
                <p className="text-slate-300 font-medium">Noch keine KI-Berechnung durchgeführt</p>
                <p className="text-sm text-slate-500 mt-1">Klicke auf "KI Planung starten", um die automatische Materialliste zu erhalten.</p>
              </div>
            )}

            {kiResult && (
              <div className="space-y-6">
                <div className="bg-slate-800 rounded-xl p-6 border border-emerald-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">🚛</span>
                    <div>
                      <h3 className="text-xl font-bold text-white">KI-Disposition</h3>
                      <p className="text-sm text-slate-400">Prüfe, ob Material von anderen Baustellen direkt geliefert werden kann</p>
                    </div>
                  </div>
                  <button onClick={handleDisposition} disabled={dispLoading} className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed py-4 font-bold text-white transition-colors">
                    {dispLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                        Optimiere Routen...
                      </span>
                    ) : '🚛 Disposition optimieren'}
                  </button>
                  {dispError && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4"><p className="text-sm font-medium text-red-300">Fehler: {dispError}</p></div>}
                </div>
                {dispResult && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <DispositionResult result={dispResult} loading={dispLoading} />
                  </div>
                )}
              </div>
            )}

            {kiResult && (
              <div className="space-y-6">
                <div className="bg-slate-800 rounded-xl p-6 border border-purple-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">🧊</span>
                    <div>
                      <h3 className="text-xl font-bold text-white">Digitaler Zwilling</h3>
                      <p className="text-sm text-slate-400">3D-Visualisierung des geplanten Gerüsts</p>
                    </div>
                  </div>
                  <button onClick={() => setShow3D(!show3D)} className="w-full rounded-lg bg-purple-600 hover:bg-purple-500 py-3 font-bold text-white transition-colors">
                    {show3D ? '🧊 3D-Ansicht schließen' : '🧊 3D-Ansicht öffnen'}
                  </button>
                </div>
                {show3D && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <DigitalTwin
                      lengthM={parseFloat(s2.laenge) || 10}
                      heightM={parseFloat(s2.hoehe) || 8}
                      fieldLengthM={parseFloat(s3.feldlänge) || 2.07}
                      showMeasurements={true}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}