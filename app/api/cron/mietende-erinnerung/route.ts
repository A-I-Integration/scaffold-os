import { NextRequest, NextResponse } from 'next/server';
import { wirksamesMietende, faelligeErinnerung, tageBis, MietErinnerungen } from '@/lib/miete';

// ============================================================
// SCAFFOLD OS – Cron: Erinnerung an das Mietende (14 / 7 Tage vorher)
//
// Läuft täglich (vercel.json). Schickt EINE interne E-Mail an die in den
// Firmeneinstellungen hinterlegte Adresse (company_settings.email) –
// NICHT an Kunden. Je Projekt und Enddatum wird jede Stufe nur einmal
// gesendet (data.mietErinnerungen). Wird die Mail nicht versendet
// (kein Empfänger, kein RESEND_API_KEY, Fehler), wird nichts als
// gesendet markiert und es wird am nächsten Tag erneut versucht.
// Ändert das Projektende nie.
// ============================================================

export const maxDuration = 60;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

function heuteIso(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
}
function deutsch(iso: string): string {
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
function parseData(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
    }
  }

  const ergebnis = { faellig: [] as string[], versendet: false, grund: '' as string };
  try {
    const heute = heuteIso();
    const res = await fetch(`${url}/rest/v1/projects?status=eq.active&select=id,name,adresse,data`, { headers });
    if (!res.ok) throw new Error(await res.text());
    const projekte = await res.json();

    const faellig: { p: any; data: any; ende: string; stufe: 14 | 7; kunde: string }[] = [];
    for (const p of projekte) {
      const data = parseData(p.data);
      const ende = wirksamesMietende(data?.step1?.projektende, data?.mietVerlaengertBis);
      if (!ende) continue;
      const gesendet = (data?.mietErinnerungen as MietErinnerungen | undefined)?.[ende];
      const stufe = faelligeErinnerung(ende, heute, gesendet);
      if (stufe) faellig.push({ p, data, ende, stufe, kunde: data?.step1?.name || p.name || '–' });
    }
    ergebnis.faellig = faellig.map((f) => `${f.p.name || f.p.id} (${f.stufe} Tage, Ende ${f.ende})`);
    if (faellig.length === 0) { ergebnis.grund = 'nichts fällig'; return NextResponse.json({ success: true, ...ergebnis }); }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) { ergebnis.grund = 'RESEND_API_KEY nicht konfiguriert'; return NextResponse.json({ success: true, ...ergebnis }); }

    const cRes = await fetch(`${url}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=email,company_name`, { headers });
    const firma = cRes.ok ? (await cRes.json())?.[0] : null;
    const empfaenger: string | undefined = firma?.email;
    if (!empfaenger || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empfaenger)) {
      ergebnis.grund = 'keine Firmen-E-Mail in den Einstellungen hinterlegt';
      return NextResponse.json({ success: true, ...ergebnis });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://scaffold-os.vercel.app';
    const zeilen = faellig
      .sort((a, b) => tageBis(a.ende, heute) - tageBis(b.ende, heute))
      .map((f) => `<li><strong>${esc(f.kunde)}</strong>${f.p.adresse ? ` – ${esc(f.p.adresse)}` : ''}: Mietende <strong>${deutsch(f.ende)}</strong> (in ${tageBis(f.ende, heute)} Tagen)</li>`)
      .join('');
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const { error: mailFehler } = await resend.emails.send({
      from: 'SCAFFOLD OS <onboarding@resend.dev>',
      to: empfaenger,
      subject: `Mietende in Kürze: ${faellig.length} Gerüst${faellig.length === 1 ? '' : 'e'}`,
      html: `<p>Bei folgenden Aufbauten endet die Mietzeit bald:</p><ul>${zeilen}</ul><p>Verlängern können Sie mit einem Klick im <a href="${appUrl}/dashboard">Dashboard</a>. Nach dem Mietende läuft die automatische Standzeit-Nachberechnung.</p>`,
    });
    if (mailFehler) { ergebnis.grund = `Versand fehlgeschlagen: ${mailFehler.message}`; return NextResponse.json({ success: false, ...ergebnis }, { status: 502 }); }

    // Erst nach erfolgreichem Versand als gesendet markieren
    for (const f of faellig) {
      const alt: MietErinnerungen = f.data?.mietErinnerungen || {};
      const eintrag = { ...(alt[f.ende] || {}), [f.stufe === 14 ? 't14' : 't7']: heute };
      if (f.stufe === 7) (eintrag as any).t14 = (eintrag as any).t14 || heute; // 7 deckt 14 mit ab
      await fetch(`${url}/rest/v1/projects?id=eq.${f.p.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ data: { ...f.data, mietErinnerungen: { ...alt, [f.ende]: eintrag } } }),
      });
    }
    ergebnis.versendet = true;
    return NextResponse.json({ success: true, ...ergebnis });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, ...ergebnis }, { status: 500 });
  }
}
