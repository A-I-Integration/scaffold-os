import { NextRequest, NextResponse } from 'next/server';
import { runSqlOnProject } from '@/lib/provision/supabase-mgmt';

// ============================================================
// SCAFFOLD OS – Cron: Datenhygiene (NUR Master-Instanz)
//
// Löscht GPS-Positionsdaten, die älter als 90 Tage sind –
// auf ALLEN Kundeninstanzen und auf der Master-Instanz selbst.
//
// Hintergrund: Der AVV (§ 10) verspricht Kunden eine automatische
// Löschung der GPS-Verläufe nach 90 Tagen. Dieser Job macht das
// wahr – er läuft täglich um 03:00 Uhr (vercel.json).
//
// Sicherheit: Vercel Cron schickt den CRON_SECRET als Bearer-Token
// mit. Ohne gültiges Secret passiert nichts.
// ============================================================

export const maxDuration = 300;

const GPS_LOESCH_SQL = `delete from public.gps_tracking where created_at < now() - interval '90 days'`;

const masterUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const masterKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: masterKey,
  Authorization: `Bearer ${masterKey}`,
  'Content-Type': 'application/json',
};

export async function GET(req: NextRequest) {
  // 1) Nur Master-Instanz darf diesen Job ausführen
  if (process.env.MASTER_INSTANCE !== 'true') {
    return NextResponse.json({ error: 'Nur auf der Master-Instanz.' }, { status: 403 });
  }

  // 2) Vercel-Cron-Secret prüfen (falls gesetzt)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Ungültiges Cron-Secret.' }, { status: 401 });
    }
  }

  const ergebnis: { instanz: string; ok: boolean; info: string }[] = [];

  // 3) Master-Instanz selbst bereinigen
  try {
    const res = await fetch(
      `${masterUrl}/rest/v1/gps_tracking?created_at=lt.${new Date(Date.now() - 90 * 86400000).toISOString()}`,
      { method: 'DELETE', headers }
    );
    ergebnis.push({
      instanz: 'master',
      ok: res.ok,
      info: res.ok ? 'GPS-Daten > 90 Tage gelöscht' : await res.text(),
    });
  } catch (err: any) {
    ergebnis.push({ instanz: 'master', ok: false, info: err.message });
  }

  // 4) Alle Kundeninstanzen bereinigen
  try {
    const tRes = await fetch(
      `${masterUrl}/rest/v1/tenants?supabase_project_ref=not.is.null&status=in.("active","past_due")&select=slug,supabase_project_ref`,
      { headers }
    );
    if (!tRes.ok) throw new Error(await tRes.text());
    const tenants = await tRes.json();

    for (const t of tenants) {
      try {
        await runSqlOnProject(t.supabase_project_ref, GPS_LOESCH_SQL);
        ergebnis.push({ instanz: t.slug, ok: true, info: 'GPS-Daten > 90 Tage gelöscht' });
      } catch (err: any) {
        // Einzelne Instanz darf den Gesamtlauf nicht stoppen
        ergebnis.push({ instanz: t.slug, ok: false, info: err.message });
        console.error(`[cron-datenhygiene] ${t.slug}: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.error('[cron-datenhygiene] Tenant-Liste fehlgeschlagen:', err.message);
    return NextResponse.json({ success: false, error: err.message, teilergebnis: ergebnis }, { status: 500 });
  }

  const fehler = ergebnis.filter((e) => !e.ok);
  console.log(`[cron-datenhygiene] fertig: ${ergebnis.length - fehler.length} ok, ${fehler.length} Fehler`);
  return NextResponse.json({ success: fehler.length === 0, ergebnis });
}
