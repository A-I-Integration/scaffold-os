import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verschluesseln } from '@/lib/email-crypto';
import { ImapFlow } from 'imapflow';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

// GET – eigenes Konto UND alle gemeinsamen Konten (z.B. info@) sichtbar,
// damit klar ist, welche Postfächer beim E-Mails-Register durchsucht werden.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

    const res = await fetch(`${url}/rest/v1/email_accounts?or=(employee_id.eq.${user.id},employee_id.is.null)&select=id,email_address,imap_host,imap_port,smtp_host,smtp_port,employee_id,bezeichnung,created_at`, { headers });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({
      success: true,
      eigenes: rows.find((r: any) => r.employee_id === user.id) || null,
      gemeinsame: rows.filter((r: any) => r.employee_id === null),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST – Postfach verbinden (eigenes ODER, nur als Admin, gemeinsames wie
// info@). Testet die IMAP-Verbindung ECHT, BEVOR gespeichert wird.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

    const { email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, password, geteilt, bezeichnung } = await req.json();
    if (!email_address || !imap_host || !imap_port || !smtp_host || !smtp_port || !password) {
      return NextResponse.json({ success: false, error: 'Bitte alle Felder ausfüllen.' }, { status: 400 });
    }

    if (geteilt) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') return NextResponse.json({ success: false, error: 'Nur Admin darf ein gemeinsames Postfach (z.B. info@) verbinden.' }, { status: 403 });
    }

    // Echter Verbindungstest
    const client = new ImapFlow({
      host: imap_host, port: Number(imap_port), secure: imap_secure !== false,
      auth: { user: email_address, pass: password }, logger: false,
    });
    try {
      await client.connect();
      await client.logout();
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `IMAP-Verbindung fehlgeschlagen: ${e.message}. Bitte Server/Port/Passwort (App-Passwort, nicht das normale Konto-Passwort) prüfen.` }, { status: 400 });
    }

    const encrypted_password = verschluesseln(password);
    const res = await fetch(`${url}/rest/v1/email_accounts`, {
      method: 'POST',
      headers: { ...headers, Prefer: geteilt ? 'return=representation' : 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        employee_id: geteilt ? null : user.id,
        bezeichnung: geteilt ? (bezeichnung || email_address) : null,
        email_address,
        imap_host, imap_port: Number(imap_port), imap_secure: imap_secure !== false,
        smtp_host, smtp_port: Number(smtp_port), smtp_secure: smtp_secure !== false,
        encrypted_password,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE ?id=... – eigenes oder (als Admin) ein gemeinsames Postfach trennen
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

    const id = new URL(req.url).searchParams.get('id');
    let ziel = `employee_id=eq.${user.id}`;
    if (id) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') return NextResponse.json({ success: false, error: 'Nur Admin darf gemeinsame Postfächer trennen.' }, { status: 403 });
      ziel = `id=eq.${id}`;
    }
    const res = await fetch(`${url}/rest/v1/email_accounts?${ziel}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
