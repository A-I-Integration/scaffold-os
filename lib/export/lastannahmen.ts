// ============================================================
// SCAFFOLD OS – Lastannahmen-Blatt für den Statiker
//
// Ein kompaktes Blatt (ein bis zwei A4-Seiten) mit den Eingangsdaten für die Statik: Gerüstsystem, Geometrie,
// Lastklasse, Bekleidung, Wind-Angaben, Untergrund, Verankerung, Sonderlasten.
// Alle Werte sind ANGABEN des Planers bzw. Geometrie aus dem Modell.
// Es wird nichts berechnet und keine Windlast abgeleitet; fehlende Angaben
// werden sichtbar als "nicht angegeben" markiert. Kein Nachweis, keine Abnahme.
// ============================================================

import type { CADModel } from '@/lib/calculations/cad-engine'
import {
  BEKLEIDUNGEN, GELAENDEKATEGORIEN, SONDERLASTEN, fehlendeStatikAngaben, type StatikDaten,
} from '@/lib/statik-daten'
import { statikPruefpunkte } from '@/lib/statik-pruefpunkte'

export interface LastannahmenOptionen {
  projektName: string
  firma: string
  datum: string
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const NICHT_ANGEGEBEN = '<span class="fehlt">nicht angegeben</span>'

function zahl(n: number, stellen = 2): string {
  return (Math.round(n * 10 ** stellen) / 10 ** stellen).toLocaleString('de-DE', { maximumFractionDigits: stellen })
}

function datumDe(iso?: string): string {
  if (!iso) return NICHT_ANGEGEBEN
  const [j, m, t] = iso.split('-')
  return `${t}.${m}.${j}`
}

function zeile(label: string, wert: string | undefined): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${wert ?? NICHT_ANGEGEBEN}</td></tr>`
}

export function generateLastannahmenHTML(model: CADModel, statik: StatikDaten, opt: LastannahmenOptionen): string {
  const b = model.building
  const sys = model.system
  const fehlend = fehlendeStatikAngaben(statik)
  const punkte = statikPruefpunkte(model, statik)
  const abschnitte = b.sections && b.sections.length >= 2 ? b.sections : null
  const meldungen = model.warnings.filter((w) => w.type === 'error' || w.type === 'warning')
  const gelaende = GELAENDEKATEGORIEN.find((g) => g.id === statik.gelaende)
  const bekleidung = BEKLEIDUNGEN.find((x) => x.id === statik.bekleidung)
  const sonder = (statik.sonderlasten ?? []).map((id) => SONDERLASTEN.find((s) => s.id === id)?.text ?? id)
  const seiten = b.sides.map((s) => ({ front: 'Vorne', back: 'Hinten', left: 'Links', right: 'Rechts' }[s])).join(', ')

  const abschnittZeilen = abschnitte
    ? abschnitte.map((s, i) => `<tr><td>${i + 1}</td><td>${zahl(s.laengeM, 1)} m</td><td>${zahl(s.hoeheM, 1)} m</td><td>${s.geruest === false ? 'nein' : 'ja'}</td></tr>`).join('')
    : ''

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Lastannahmen – ${escapeHtml(opt.projektName)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #1d1d1f; line-height: 1.35; }
  h1 { font-size: 16pt; margin: 0 0 2px; color: #e8590c; }
  h2 { font-size: 10.5pt; margin: 10px 0 4px; padding-bottom: 2px; border-bottom: 1.5px solid #e8590c; break-after: avoid; }
  li, tr { break-inside: avoid; }
  .sign { break-inside: avoid; }
  .kopf { color: #555; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 2px; }
  th, td { text-align: left; padding: 2.5px 6px; border-bottom: 1px solid #e5e5ea; vertical-align: top; }
  th { width: 38%; font-weight: 600; color: #424245; }
  table.raster th { width: auto; }
  .fehlt { color: #b42318; font-weight: 600; }
  .box { border-left: 4px solid #f59e0b; background: #fff8e6; padding: 6px 10px; margin: 8px 0; }
  .box.rot { border-color: #ef4444; background: #fff0f0; }
  ul { margin: 2px 0 0 16px; padding: 0; }
  .sign { display: flex; gap: 24px; margin-top: 18px; }
  .sign div { flex: 1; border-top: 1px solid #1d1d1f; padding-top: 3px; font-size: 8.5pt; color: #555; }
  .klein { font-size: 8.5pt; color: #555; }
</style>
</head>
<body>
<h1>Lastannahmen &amp; Eingangsdaten für die Statik</h1>
<div class="kopf">${escapeHtml(opt.projektName)} · ${escapeHtml(opt.firma)} · Stand ${escapeHtml(opt.datum)}</div>

<div class="box"><strong>Wichtig:</strong> Dieses Blatt enthält Angaben des Planers und Geometrie aus dem Modell. Es wurde nichts nachgerechnet, keine Windlast abgeleitet und kein Standsicherheitsnachweis erstellt. Den Nachweis führt der Statiker.</div>

${fehlend.length > 0 ? `<div class="box rot"><strong>Noch nicht angegeben (${fehlend.length}):</strong> ${escapeHtml(fehlend.join(', '))}</div>` : ''}

<h2>1. Gerüstsystem</h2>
<table>
${zeile('Hersteller / System', sys ? escapeHtml(`${sys.hersteller} ${sys.systemName}`) : undefined)}
${zeile('Bauart', sys ? escapeHtml(sys.bauart) : undefined)}
${zeile('Gerüstbreite', sys ? `${zahl(b.geruestOptionen?.breiteM ?? sys.rahmenBreitenM[0])} m` : undefined)}
${zeile('Höhenraster', sys ? `${zahl(sys.rasterHoeheM)} m` : undefined)}
${zeile('Lastklasse (DIN EN 12811-1)', b.lastklasse ? String(b.lastklasse) : undefined)}
${zeile('Mischsysteme', statik.systemmischung ? '<span class="fehlt">ja – gesonderter Nachweis nötig</span>' : 'nein / nicht angegeben')}
</table>

<h2>2. Geometrie (aus dem Modell)</h2>
<table>
${zeile('Gerüsthöhe', `${zahl(model.totalHeightM, 1)} m`)}
${zeile('Gerüstlänge', `${zahl(model.totalLengthM, 1)} m`)}
${zeile('Gerüstfläche', `${zahl(model.totalAreaM2, 1)} m²`)}
${zeile('Felder / Lagen', `${model.fieldCount} Felder · ${model.levelCount} Lagen`)}
${zeile('Eingerüstete Seiten', escapeHtml(seiten) || undefined)}
${zeile('Anker im Modell', String(model.anchors.length))}
${zeile('Gebäude (L × B × H)', `${zahl(b.lengthM, 1)} × ${zahl(b.widthM, 1)} × ${zahl(b.heightM, 1)} m`)}
${zeile('Wandabstand', b.geruestOptionen?.wandabstandM !== undefined ? `${zahl(b.geruestOptionen.wandabstandM)} m` : 'Standardwert des Systems')}
</table>
${abschnitte ? `<table class="raster"><tr><th>Abschnitt</th><th>Länge</th><th>Höhe</th><th>Eingerüstet</th></tr>${abschnittZeilen}</table>` : ''}

<h2>3. Wind &amp; Bekleidung (Angaben des Planers)</h2>
<table>
${zeile('Windnorm', statik.windnorm ? escapeHtml(statik.windnorm) : undefined)}
${zeile('Windzone', statik.windzone ? `Zone ${escapeHtml(statik.windzone)}` : undefined)}
${zeile('Referenzwindgeschwindigkeit', statik.vrefMs !== undefined ? `${zahl(statik.vrefMs, 1)} m/s` : undefined)}
${zeile('Geländekategorie', gelaende ? escapeHtml(gelaende.text) : undefined)}
${zeile('Bekleidung', bekleidung ? escapeHtml(bekleidung.text) : undefined)}
</table>

<h2>4. Lagerung &amp; Verankerung (Angaben des Planers)</h2>
<table>
${zeile('Untergrund / Fußpunkte', statik.untergrund ? escapeHtml(statik.untergrund) : undefined)}
${zeile('Verankerungsgrund', statik.verankerungsgrund ? escapeHtml(statik.verankerungsgrund) : undefined)}
</table>

<h2>5. Nutzung, Zeitraum, Sonderlasten</h2>
<table>
${zeile('Nutzung', statik.nutzung ? (statik.nutzung === 'oeffentlich' ? 'Öffentlich zugänglich' : 'Privat / nicht öffentlich') : undefined)}
${zeile('Aufbau', datumDe(statik.aufbau))}
${zeile('Abbau', datumDe(statik.abbau))}
${zeile('Sonderlasten', sonder.length > 0 ? escapeHtml(sonder.join('; ')) : 'keine angegeben')}
${statik.notiz ? zeile('Notiz', escapeHtml(statik.notiz)) : ''}
</table>

${meldungen.length > 0 ? `<h2>6. Hinweise aus der Planung</h2><ul>${meldungen.map((w) => `<li>${escapeHtml(w.message)}</li>`).join('')}</ul>` : ''}

${punkte.length > 0 ? `<h2>${meldungen.length > 0 ? '7' : '6'}. Prüfpunkte für den Statiker (Hinweise, keine Nachweise)</h2><ul>${punkte.map((p) => `<li><strong>${escapeHtml(p.thema)}:</strong> ${escapeHtml(p.text)}</li>`).join('')}</ul>` : ''}

<div class="sign">
  <div>Ort, Datum</div>
  <div>Unterschrift Gerüstbauer / Planer</div>
  <div>Unterschrift Statiker</div>
</div>
<p class="klein">Erzeugt mit SCAFFOLD OS. Die fachliche Verantwortung für Planung, Nachweis und Abnahme liegt beim Fachbetrieb bzw. beim Statiker.</p>
</body>
</html>`
}
