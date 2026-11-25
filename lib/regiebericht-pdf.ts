import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'fs/promises';
import path from 'path';
import { betragMaterial, betragStunden, betragGesamt, summeStunden, type RegieMaterial, type RegieStunde } from './regiebericht';

// ============================================================
// SCAFFOLD OS – Regiebericht als PDF (nur serverseitig; pdf-lib, Schrift eingebettet)
// Zum Ausdrucken und Unterschreiben (Büro-Versand) und als Beleg mit Unterschrift.
// ============================================================

export interface RegiePdfDaten {
  nummer: string; datum: string; anlass?: string | null; beschreibung?: string | null
  stunden: RegieStunde[]; material: RegieMaterial[]; fotos: string[]
  unterschrieben_von?: string | null; unterschrift?: string | null; unterschrieben_am?: string | null
  projektName?: string | null; baustelle?: string | null; kundeName?: string | null
  firma?: { company_name?: string; street?: string; zip?: string; city?: string } | null
  mitPreisen?: boolean
}

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zahl = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
const deDatum = (d: string) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '–');
const dunkel = rgb(15 / 255, 23 / 255, 42 / 255), mittel = rgb(71 / 255, 85 / 255, 105 / 255), hell = rgb(244 / 255, 246 / 255, 249 / 255), akzent = rgb(232 / 255, 89 / 255, 12 / 255), weiss = rgb(1, 1, 1);

function umbrechen(text: string, font: PDFFont, size: number, breite: number): string[] {
  const zeilen: string[] = [];
  for (const absatz of String(text || '').split(/\r?\n/)) {
    let aktuell = '';
    for (const wort of absatz.split(/\s+/).filter(Boolean)) {
      const probe = aktuell ? `${aktuell} ${wort}` : wort;
      if (font.widthOfTextAtSize(probe, size) <= breite) aktuell = probe;
      else { if (aktuell) zeilen.push(aktuell); aktuell = wort; }
    }
    zeilen.push(aktuell);
  }
  return zeilen;
}

function bildBytes(dataUrl: string): { bytes: Uint8Array; typ: 'png' | 'jpg' } | null {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl);
  if (!m) return null; // WebP kann das PDF nicht einbetten; die App wandelt Fotos vorher in JPEG um
  return { bytes: Uint8Array.from(Buffer.from(m[2], 'base64')), typ: m[1] === 'png' ? 'png' : 'jpg' };
}

export async function erzeugeRegiebericht(d: RegiePdfDaten): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const dir = path.join(process.cwd(), 'lib/assets');
  const font = await doc.embedFont(await readFile(path.join(dir, 'LiberationSans-Regular.ttf')));
  const fett = await doc.embedFont(await readFile(path.join(dir, 'LiberationSans-Bold.ttf')));
  const W = 595.28, H = 841.89, R = 40;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H;
  const preise = d.mitPreisen !== false;

  const neueSeite = () => { page = doc.addPage([W, H]); y = H - 50; };
  const platz = (h: number) => { if (y - h < 60) neueSeite(); };
  const text = (t: string, x: number, size = 9, f: PDFFont = font, farbe = dunkel) => page.drawText(t, { x, y, size, font: f, color: farbe });
  const rechts = (t: string, xr: number, size = 9, f: PDFFont = font) => page.drawText(t, { x: xr - f.widthOfTextAtSize(t, size), y, size, font: f, color: dunkel });

  page.drawRectangle({ x: 0, y: H - 38, width: W, height: 38, color: akzent });
  page.drawText(d.firma?.company_name || 'SCAFFOLD OS', { x: R, y: H - 25, size: 15, font: fett, color: weiss });
  const titel = 'REGIEBERICHT';
  page.drawText(titel, { x: W - R - fett.widthOfTextAtSize(titel, 18), y: H - 26, size: 18, font: fett, color: weiss });
  y = H - 62;

  const zeilen: [string, string][] = [['Nummer', d.nummer], ['Datum', deDatum(d.datum)], ['Baustelle', [d.projektName, d.baustelle].filter(Boolean).join(' – ') || '–'], ['Auftraggeber', d.kundeName || '–']];
  page.drawRectangle({ x: R, y: y - 62, width: W - 2 * R, height: 66, color: hell });
  for (const [k, v] of zeilen) { y -= 14; text(k, R + 8, 8, fett, mittel); text(v.slice(0, 90), R + 90, 9.5); }
  y -= 22;

  if (d.anlass) { text('Anlass', R, 8, fett, mittel); y -= 12; for (const z of umbrechen(d.anlass, font, 10, W - 2 * R)) { platz(14); text(z, R, 10); y -= 13; } y -= 4; }
  if (d.beschreibung) {
    text('Ausgeführte Leistung', R, 8, fett, mittel); y -= 12;
    for (const z of umbrechen(d.beschreibung, font, 9.5, W - 2 * R)) { platz(14); text(z, R, 9.5); y -= 12.5; }
    y -= 6;
  }

  if (d.stunden.length) {
    platz(40); text('Arbeitsstunden', R, 8, fett, mittel); y -= 6;
    page.drawRectangle({ x: R, y: y - 14, width: W - 2 * R, height: 15, color: hell }); y -= 11;
    text('Mitarbeiter', R + 4, 8, fett); rechts('Stunden', preise ? 370 : W - R - 4, 8, fett);
    if (preise) { rechts('Satz', 450, 8, fett); rechts('Betrag', W - R - 4, 8, fett); }
    y -= 8;
    for (const z of d.stunden) {
      platz(16); y -= 10; text(z.name.slice(0, 50) || '–', R + 4); rechts(zahl(z.stunden), preise ? 370 : W - R - 4);
      if (preise) { rechts(`${eur(z.satz)} €`, 450); rechts(`${eur(z.stunden * z.satz)} €`, W - R - 4); }
      y -= 4;
    }
    y -= 12; text(`Summe Stunden: ${zahl(summeStunden(d.stunden))}`, R + 4, 9, fett);
    if (preise) rechts(`${eur(betragStunden(d.stunden))} €`, W - R - 4, 9, fett);
    y -= 16;
  }

  if (d.material.length) {
    platz(40); text('Material / Gerüstteile', R, 8, fett, mittel); y -= 6;
    page.drawRectangle({ x: R, y: y - 14, width: W - 2 * R, height: 15, color: hell }); y -= 11;
    text('Bezeichnung', R + 4, 8, fett); rechts('Menge', preise ? 340 : W - R - 4, 8, fett);
    if (preise) { rechts('Preis', 450, 8, fett); rechts('Betrag', W - R - 4, 8, fett); }
    y -= 8;
    for (const m of d.material) {
      platz(16); y -= 10; text(m.bezeichnung.slice(0, 62), R + 4); rechts(`${zahl(m.menge)} ${m.einheit}`, preise ? 340 : W - R - 4);
      if (preise) { rechts(`${eur(m.einzelpreis)} €`, 450); rechts(`${eur(m.menge * m.einzelpreis)} €`, W - R - 4); }
      y -= 4;
    }
    if (preise) { y -= 12; text('Summe Material', R + 4, 9, fett); rechts(`${eur(betragMaterial(d.material))} €`, W - R - 4, 9, fett); }
    y -= 16;
  }

  if (preise && (d.stunden.length || d.material.length)) {
    platz(30); y -= 4; text('Gesamt netto (zzgl. gesetzlicher Umsatzsteuer)', R + 4, 10, fett); rechts(`${eur(betragGesamt(d))} €`, W - R - 4, 10, fett); y -= 22;
  }

  // Fotos: zwei je Zeile
  const bilder = d.fotos.map(bildBytes).filter((b): b is NonNullable<typeof b> => !!b);
  if (bilder.length) {
    platz(40); text('Fotodokumentation', R, 8, fett, mittel); y -= 8;
    const bw = (W - 2 * R - 12) / 2, bh = 150;
    for (let i = 0; i < bilder.length; i += 2) {
      platz(bh + 10); const oben = y;
      for (let j = 0; j < 2 && i + j < bilder.length; j++) {
        try {
          const b = bilder[i + j];
          const img = b.typ === 'png' ? await doc.embedPng(b.bytes) : await doc.embedJpg(b.bytes);
          const s = Math.min(bw / img.width, bh / img.height);
          page.drawImage(img, { x: R + j * (bw + 12), y: oben - img.height * s, width: img.width * s, height: img.height * s });
        } catch { /* beschädigtes Bild überspringen */ }
      }
      y = oben - bh - 8;
    }
    y -= 6;
  }

  // Unterschrift
  platz(110); y -= 6;
  text('Der Auftraggeber bestätigt die oben aufgeführten Leistungen und Materialien.', R, 9, font, mittel); y -= 14;
  const sx = R, bw2 = 230;
  if (d.unterschrift) {
    const b = bildBytes(d.unterschrift);
    if (b) { try { const img = await doc.embedPng(b.bytes); const s = Math.min(bw2 / img.width, 55 / img.height); page.drawImage(img, { x: sx, y: y - 55, width: img.width * s, height: img.height * s }); } catch { /* ohne Bild */ } }
  }
  y -= 62;
  page.drawLine({ start: { x: sx, y }, end: { x: sx + bw2, y }, thickness: 0.7, color: mittel });
  page.drawLine({ start: { x: sx + 260, y }, end: { x: sx + 260 + 180, y }, thickness: 0.7, color: mittel });
  y -= 11;
  text(d.unterschrieben_von ? `${d.unterschrieben_von}` : 'Name, Unterschrift Bauherr / Auftraggeber', sx, 8, font, mittel);
  text(d.unterschrieben_am ? deDatum(d.unterschrieben_am) : 'Ort, Datum', sx + 260, 8, font, mittel);
  return doc.save();
}
