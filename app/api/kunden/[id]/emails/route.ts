import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { entschluesseln } from '@/lib/email-crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { serverErrorResponse } from '@/lib/auth';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

// GET /api/kunden/[id]/emails – durchsucht ALLE zugänglichen Postfächer
// (eigenes + gemeinsame wie info@) nach E-Mails mit der Kunden-Adresse,
// speichert neu gefundene dauerhaft in customer_emails (dedupliziert über
// email_account_id+imap_uid), und gibt dann die GESAMTE gespeicherte
// Historie für diesen Kunden zurück – nicht nur den aktuellen IMAP-Stand.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

    const kundeRes = await fetch(`${url}/rest/v1/customers?id=eq.${id}&select=email`, { headers });
    if (!kundeRes.ok) throw new Error(await kundeRes.text());
    const kunde = (await kundeRes.json())?.[0];
    if (!kunde?.email) return NextResponse.json({ success: false, error: 'Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.' }, { status: 400 });

    // Alle zugänglichen Postfächer: eigenes + gemeinsame (z.B. info@)
    const kontenRes = await fetch(`${url}/rest/v1/email_accounts?or=(employee_id.eq.${user.id},employee_id.is.null)&select=*`, { headers });
    if (!kontenRes.ok) throw new Error(await kontenRes.text());
    const konten = await kontenRes.json();
    if (konten.length === 0) return NextResponse.json({ success: false, error: 'Kein E-Mail-Konto verbunden.', code: 'KEIN_KONTO' }, { status: 400 });

    const fehlerJeKonto: string[] = [];
    for (const konto of konten) {
      try {
        const passwort = entschluesseln(konto.encrypted_password);
        const client = new ImapFlow({
          host: konto.imap_host, port: konto.imap_port, secure: konto.imap_secure,
          auth: { user: konto.email_address, pass: passwort }, logger: false,
        });
        await client.connect();
        try {
          // NEU: Nicht nur INBOX, auch den "Gesendet"-Ordner durchsuchen –
          // sonst fehlen Antworten, die über das normale Mail-Programm
          // (nicht über den "Antworten"-Knopf in der App) verschickt wurden.
          // imapflow erkennt den Ordner über die SPECIAL-USE-Erweiterung
          // bzw. bekannte Namen (auch "Gesendet" bei deutschen Anbietern) –
          // zuverlässiger als einen Namen selbst zu raten.
          const mailboxen = await client.list();
          const gesendetOrdner = mailboxen.find((m) => m.specialUse === '\\Sent');
          const zuDurchsuchendeOrdner = ['INBOX', ...(gesendetOrdner ? [gesendetOrdner.path] : [])];

          for (const ordner of zuDurchsuchendeOrdner) {
            const lock = await client.getMailboxLock(ordner);
            try {
              const [vonKunde, anKunde] = await Promise.all([
                client.search({ from: kunde.email }, { uid: true }),
                client.search({ to: kunde.email }, { uid: true }),
              ]);
              const uids = Array.from(new Set([...(vonKunde || []), ...(anKunde || [])])).slice(-50);
              if (uids.length > 0) {
                const neueDatensaetze: any[] = [];
                for await (const msg of client.fetch(uids, { envelope: true, uid: true, source: true }, { uid: true })) {
                  const parsed = await simpleParser(msg.source as Buffer);
                  const vonAdresse = (parsed.from?.value || []).map((a: any) => a.address).join(',')
                  neueDatensaetze.push({
                    customer_id: id, email_account_id: konto.id, imap_uid: msg.uid, imap_mailbox: ordner,
                    richtung: vonAdresse.toLowerCase().includes(kunde.email.toLowerCase()) ? 'eingehend' : 'ausgehend',
                    betreff: parsed.subject || '(kein Betreff)',
                    von: parsed.from?.text || '',
                    an: Array.isArray(parsed.to) ? parsed.to.map((t: any) => t.text).join(', ') : parsed.to?.text || '',
                    datum: parsed.date || new Date(),
                    text: parsed.text || '',
                  })
                }
                if (neueDatensaetze.length > 0) {
                  // Dauerhaft speichern – Duplikate (gleiches Postfach+UID,
                  // schon vorher gespeichert) werden über den UNIQUE-Index
                  // in der Datenbank automatisch übersprungen.
                  await fetch(`${url}/rest/v1/customer_emails`, {
                    method: 'POST',
                    headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
                    body: JSON.stringify(neueDatensaetze),
                  })
                }
              }
            } finally {
              lock.release();
            }
          }
        } finally {
          await client.logout();
        }
      } catch (e: any) {
        fehlerJeKonto.push(`${konto.bezeichnung || konto.email_address}: ${e.message}`);
      }
    }

    // Gesamte gespeicherte Historie für diesen Kunden zurückgeben
    const historieRes = await fetch(`${url}/rest/v1/customer_emails?customer_id=eq.${id}&select=*&order=datum.desc`, { headers });
    if (!historieRes.ok) throw new Error(await historieRes.text());
    const historie = await historieRes.json();

    return NextResponse.json({
      success: true, emails: historie,
      durchsuchtePostfaecher: konten.map((k: any) => k.bezeichnung || k.email_address),
      fehler: fehlerJeKonto.length > 0 ? fehlerJeKonto : undefined,
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
