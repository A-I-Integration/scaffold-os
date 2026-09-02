// ============================================================
// lib/export/pdf-export.ts
// SCAFFOLD OS – PDF Export Service
// ============================================================

import { CADModel } from '@/lib/calculations/cad-engine'
import { MaterialItem } from '@/types/scaffold'

export interface PDFExportOptions {
  include3D: boolean
  include2D: boolean
  includeBOM: boolean
  includeChecks: boolean
  companyName: string
  projectName: string
  date: string
}

export function generatePDFHTML(model: CADModel, materials: MaterialItem[], options: PDFExportOptions): string {
  const totalWeight = materials.reduce((s, i) => s + i.weightKg * i.quantity, 0)
  const totalPrice = materials.reduce((s, i) => s + i.totalPrice, 0)

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Gerüstbau-Dokumentation – ${options.projectName}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #1d1d1f; }
    .page { page-break-after: always; padding: 20px; }
    .page:last-child { page-break-after: auto; }
    
    /* Titelseite */
    .cover { text-align: center; padding-top: 100px; }
    .cover h1 { font-size: 28pt; color: #e8590c; margin-bottom: 10px; }
    .cover .subtitle { font-size: 14pt; color: #86868b; margin-bottom: 40px; }
    .cover .meta { font-size: 11pt; color: #424245; line-height: 2; }
    .cover .logo-placeholder { width: 120px; height: 120px; background: #f5f5f7; border-radius: 20px; margin: 0 auto 30px; display: flex; align-items: center; justify-content: center; font-size: 10pt; color: #86868b; }
    
    /* Überschriften */
    h2 { font-size: 16pt; color: #1d1d1f; margin: 25px 0 15px; padding-bottom: 8px; border-bottom: 2px solid #e8590c; }
    h3 { font-size: 12pt; color: #424245; margin: 20px 0 10px; }
    
    /* Tabellen */
    table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 9pt; }
    th { background: #f5f5f7; padding: 8px 6px; text-align: left; font-weight: 600; border-bottom: 2px solid #d1d1d6; }
    td { padding: 6px; border-bottom: 1px solid #e5e5ea; }
    tr:nth-child(even) { background: #fafafa; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    
    /* Info-Boxen */
    .info-box { background: #f5f5f7; border-left: 4px solid #e8590c; padding: 12px 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }
    .warning-box { background: #fff8e6; border-left: 4px solid #f59e0b; padding: 12px 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }
    .error-box { background: #fff0f0; border-left: 4px solid #ef4444; padding: 12px 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }
    
    /* Zusammenfassung */
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin: 20px 0; }
    .summary-card { background: #f5f5f7; padding: 15px; border-radius: 12px; text-align: center; }
    .summary-card .value { font-size: 20pt; font-weight: 700; color: #e8590c; }
    .summary-card .label { font-size: 9pt; color: #86868b; text-transform: uppercase; margin-top: 5px; }
    
    /* Zeichnungs-Platzhalter */
    .drawing-placeholder { width: 100%; height: 400px; background: #f0f4f8; border: 2px dashed #c7c7cc; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #86868b; font-size: 11pt; margin: 15px 0; }
    
    /* Footer */
    .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #e5e5ea; font-size: 8pt; color: #86868b; text-align: center; }
    
    /* Seitenumbruch */
    .page-break { page-break-before: always; }
  </style>
</head>
<body>

<!-- TITELSEITE -->
<div class="page cover">
  <div class="logo-placeholder">LOGO</div>
  <h1>Gerüstbau-Dokumentation</h1>
  <p class="subtitle">Technische Planung & Stückliste</p>
  <div class="meta">
    <p><strong>Projekt:</strong> ${options.projectName}</p>
    <p><strong>Auftraggeber:</strong> ${options.companyName}</p>
    <p><strong>Datum:</strong> ${options.date}</p>
    <p><strong>System:</strong> ${model.system?.hersteller || ''} ${model.system?.systemName || ''}</p>
  </div>
</div>

<!-- PROJEKTÜBERSICHT -->
<div class="page">
  <h2>Projektübersicht</h2>
  
  <div class="summary-grid">
    <div class="summary-card">
      <div class="value">${model.building.lengthM.toFixed(1)} × ${model.building.widthM.toFixed(1)} m</div>
      <div class="label">Gebäudegrundfläche</div>
    </div>
    <div class="summary-card">
      <div class="value">${model.building.heightM.toFixed(1)} m</div>
      <div class="label">Gebäudehöhe</div>
    </div>
    <div class="summary-card">
      <div class="value">${model.totalAreaM2.toFixed(1)} m²</div>
      <div class="label">Gerüstfläche</div>
    </div>
    <div class="summary-card">
      <div class="value">${model.fieldCount}</div>
      <div class="label">Felder</div>
    </div>
    <div class="summary-card">
      <div class="value">${model.levelCount}</div>
      <div class="label">Lagen</div>
    </div>
    <div class="summary-card">
      <div class="value">${model.components3D.length}</div>
      <div class="label">Bauteile</div>
    </div>
  </div>

  <h3>Gebäudeparameter</h3>
  <table>
    <tr><th>Parameter</th><th>Wert</th></tr>
    <tr><td>Länge</td><td>${model.building.lengthM.toFixed(2)} m</td></tr>
    <tr><td>Breite</td><td>${model.building.widthM.toFixed(2)} m</td></tr>
    <tr><td>Höhe</td><td>${model.building.heightM.toFixed(2)} m</td></tr>
    <tr><td>Traufenhöhe</td><td>${model.building.eavesHeightM.toFixed(2)} m</td></tr>
    <tr><td>Dachhöhe</td><td>${model.building.roofHeightM.toFixed(2)} m</td></tr>
    <tr><td>Dachform</td><td>${model.building.roofForm}</td></tr>
    <tr><td>Geschosse</td><td>${model.building.floors}</td></tr>
    <tr><td>Fenster</td><td>${model.building.windowCount}</td></tr>
    <tr><td>Türen</td><td>${model.building.doorCount}</td></tr>
  </table>

  <h3>Gerüstsystem</h3>
  <div class="info-box">
    <strong>${model.system?.hersteller || ''} ${model.system?.systemName || ''}</strong><br>
    Bauart: ${model.system?.bauart || ''} | Rasterhöhe: ${model.system?.rasterHoeheM || ''} m<br>
    Feldlängen: ${model.system?.feldlangenM.join(', ') || ''} m<br>
    Rahmenbreiten: ${model.system?.rahmenBreitenM.join(', ') || ''} m
  </div>
</div>

<!-- STÜCKLISTE -->
<div class="page">
  <h2>Stückliste (BOM)</h2>
  
  <div class="summary-grid" style="grid-template-columns: 1fr 1fr;">
    <div class="summary-card">
      <div class="value">${totalWeight.toLocaleString('de-DE', {maximumFractionDigits: 0})} kg</div>
      <div class="label">Gesamtgewicht</div>
    </div>
    <div class="summary-card">
      <div class="value">${totalPrice.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})}</div>
      <div class="label">Materialkosten (geschätzt)</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Pos.</th>
        <th>Art.-Nr.</th>
        <th>Bauteil</th>
        <th>Kategorie</th>
        <th class="text-right">Menge</th>
        <th>Einheit</th>
        <th class="text-right">Gewicht (kg)</th>
        <th class="text-right">Preis (€)</th>
      </tr>
    </thead>
    <tbody>
      ${materials.map((item, idx) => `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td>${item.articleNumber}</td>
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td class="text-right">${item.quantity}</td>
        <td>${item.unit}</td>
        <td class="text-right">${(item.weightKg * item.quantity).toFixed(1)}</td>
        <td class="text-right">${item.totalPrice.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})}</td>
      </tr>
      `).join('')}
    </tbody>
  </table>
</div>

<!-- PLAUSIBILITÄT -->
<div class="page">
  <h2>Technische Plausibilität</h2>
  
  <h3>Warnungen & Hinweise</h3>
  ${model.warnings.length > 0 ? model.warnings.map(w => `
  <div class="${w.type === 'error' ? 'error-box' : w.type === 'warning' ? 'warning-box' : 'info-box'}">
    <strong>${w.type === 'error' ? '⛔' : w.type === 'warning' ? '⚠️' : 'ℹ️'} ${w.code}</strong><br>
    ${w.message}
  </div>
  `).join('') : '<div class="info-box">✅ Keine Warnungen – Modell ist plausibel.</div>'}

  <h3>Bauteil-Verteilung</h3>
  <table>
    <tr><th>Kategorie</th><th class="text-right">Anzahl</th><th class="text-right">Gewicht (kg)</th></tr>
    ${Object.entries(materials.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = { count: 0, weight: 0 }
      acc[item.category].count += item.quantity
      acc[item.category].weight += item.weightKg * item.quantity
      return acc
    }, {} as Record<string, { count: number; weight: number }>)).map(([cat, data]) => `
    <tr><td>${cat}</td><td class="text-right">${data.count}</td><td class="text-right">${data.weight.toFixed(1)}</td></tr>
    `).join('')}
  </table>
</div>

<!-- ZEICHNUNGEN -->
${options.include2D ? `
<div class="page">
  <h2>Zeichnungen</h2>
  <h3>Grundriss</h3>
  <div class="drawing-placeholder">[Grundriss – Maßstab 1:100]<br>Maße: ${model.building.lengthM.toFixed(1)} × ${model.building.widthM.toFixed(1)} m</div>
  
  <h3>Ansicht</h3>
  <div class="drawing-placeholder">[Ansicht von vorne – Maßstab 1:100]<br>Höhe: ${model.building.heightM.toFixed(1)} m | Lagen: ${model.levelCount}</div>
</div>
` : ''}

<div class="footer">
  Erstellt mit SCAFFOLD OS CAD | ${options.companyName} | ${options.date}<br>
  Diese Dokumentation ist verbindlich. Änderungen bedürfen der schriftlichen Genehmigung.
</div>

</body>
</html>`
}

export function downloadPDF(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace('.pdf', '.html')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
