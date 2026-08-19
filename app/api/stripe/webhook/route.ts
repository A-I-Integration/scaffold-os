import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { runProvision } from '@/lib/provision/orchestrate';
import { pauseSupabaseProject, restoreSupabaseProject } from '@/lib/provision/supabase-mgmt';

// ============================================================
// SCAFFOLD OS – Stripe: Webhook (NUR Master-Instanz)
//
// Stripe ruft diese Adresse bei jedem Zahlungsereignis auf.
// In Stripe eintragen: https://scaffoldos.de/api/stripe/webhook
//
// Ereignisse:
//  checkout.session.completed      → Kunde hat gekauft
//                                    → subscriptions-Eintrag anlegen
//                                    → tenant in Registry anlegen
//                                    → Provisionierung starten
//  customer.subscription.updated   → Status/Trial/Ende nachziehen
//  customer.subscription.deleted   → Kündigung wirksam
//  invoice.payment_failed          → Abbuchung fehlgeschlagen
//
// WICHTIG: Die Signatur wird geprüft (STRIPE_WEBHOOK_SECRET) –
// ohne gültige Stripe-Signatur passiert hier gar nichts.
// ============================================================

// Provisionierung kann 2–4 Minuten dauern (Vercel Pro).
export const maxDuration = 300;

const masterUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const masterKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: masterKey,
  Authorization: `Bearer ${masterKey}`,
  'Content-Type': 'application/json',
};

// Aus dem Firmennamen eine gültige Subdomain bauen (a–z, 0–9, -)
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return base.length >= 3 ? base : `kunde-${Date.now().toString(36)}`;
}

async function freienSlugFinden(base: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const kandidat = i === 0 ? base : `${base}-${i + 1}`;
    const res = await fetch(
      `${masterUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(kandidat)}&select=id,status`,
      { headers }
    );
    const rows = res.ok ? await res.json() : [];
    if (!rows?.length || rows[0].status === 'cancelled') return kandidat;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// subscriptions-Tabelle schreiben/aktualisieren (Upsert über stripe_subscription_id)
async function upsertSubscription(fields: Record<string, any>): Promise<void> {
  const subId = fields.stripe_subscription_id;
  const check = await fetch(
    `${masterUrl}/rest/v1/subscriptions?stripe_subscription_id=eq.${encodeURIComponent(subId)}&select=id`,
    { headers }
  );
  const rows = check.ok ? await check.json() : [];
  if (rows?.length) {
    await fetch(`${masterUrl}/rest/v1/subscriptions?id=eq.${rows[0].id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(fields),
    });
  } else {
    await fetch(`${masterUrl}/rest/v1/subscriptions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(fields),
    });
  }
}

async function tenantStatusSetzen(tenantId: string | null, status: string, msg: string): Promise<void> {
  if (!tenantId) return;
  await fetch(`${masterUrl}/rest/v1/tenants?id=eq.${tenantId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status }),
  });
  console.log(`[stripe-webhook] tenant ${tenantId}: ${msg}`);
}

// ── NEU: E-Mail an uns, sobald jemand „3 Tage kostenlos testen" startet ──
async function benachrichtigeNeuenTestzugang(
  firma: string,
  name: string | null,
  email: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // kein Key konfiguriert → still auslassen

  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const empfaenger = process.env.ANFRAGE_EMPFAENGER || 'info@a-i-integration.de';
  const trialEnde = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: 'SCAFFOLD OS <onboarding@resend.dev>',
    to: [empfaenger],
    replyTo: email,
    subject: `[SCAFFOLD OS] 🎉 Neuer Testzugang: ${firma}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e8590c; margin-bottom: 4px;">Neuer Testzugang gestartet</h2>
        <p style="color: #64748b; margin-top: 0;">„3 Tage kostenlos testen" über scaffoldos.de/kaufen</p>
        <table style="border-collapse: collapse; background: #f8fafc; border-radius: 8px; width: 100%; margin: 16px 0;">
          <tr><td style="padding: 8px 12px; color: #64748b;">Firma</td><td style="padding: 8px 12px; color: #0f172a;"><b>${esc(firma)}</b></td></tr>
          <tr><td style="padding: 8px 12px; color: #64748b;">Name</td><td style="padding: 8px 12px; color: #0f172a;">${esc(name || '–')}</td></tr>
          <tr><td style="padding: 8px 12px; color: #64748b;">E-Mail</td><td style="padding: 8px 12px; color: #0f172a;">${esc(email)}</td></tr>
          <tr><td style="padding: 8px 12px; color: #64748b;">Testphase endet</td><td style="padding: 8px 12px; color: #0f172a;"><b>${trialEnde}</b></td></tr>
        </table>
        <p style="color: #0f172a; background: #fff7ed; border-left: 4px solid #e8590c; padding: 12px; border-radius: 4px;">
          <b>Tipp:</b> Innerhalb der ersten 24 Stunden kurz durchklingeln – Testzugänge,
          die persönlich begrüßt werden, werden deutlich häufiger zahlende Kunden.
        </p>
        <p style="color: #64748b; font-size: 12px;">
          Antworten auf diese Mail geht direkt an den Interessenten.
          Status jederzeit sichtbar unter scaffoldos.de/admin/kunden.
        </p>
      </div>`,
  });
}

// ── Kauf abgeschlossen: Abo speichern + Kundensystem aufsetzen ──
async function kaufAbgeschlossen(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata || {};
  const companyName = meta.company_name || 'Neukunde';
  const adminEmail = (meta.admin_email || session.customer_email || '').toLowerCase();
  const adminName = meta.admin_name || null;
  const stripeCustomerId = String(session.customer || '');
  const stripeSubscriptionId = String(session.subscription || '');

  if (!adminEmail || !stripeSubscriptionId) {
    console.error('[stripe-webhook] checkout ohne E-Mail oder Subscription – übersprungen');
    return;
  }

  // 1) Abo-Eintrag anlegen (price_id kommt aus der Checkout-Session,
  //    damit das gebuchte Paket – starter/priority/enterprise – stimmt)
  await upsertSubscription({
    customer_email: adminEmail,
    company_name: companyName,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    stripe_price_id: meta.price_id || process.env.STRIPE_PRICE_ID || null,
    status: 'trialing',
  });

  // 2) Schon ein tenant für diese Subscription? (Stripe schickt Retries!)
  const vorhanden = await fetch(
    `${masterUrl}/rest/v1/subscriptions?stripe_subscription_id=eq.${encodeURIComponent(stripeSubscriptionId)}&select=tenant_id`,
    { headers }
  );
  const vorhandenRows = vorhanden.ok ? await vorhanden.json() : [];
  if (vorhandenRows?.[0]?.tenant_id) {
    console.log('[stripe-webhook] tenant existiert bereits – kein zweiter Durchlauf');
    return;
  }

  // 3) Registry-Eintrag anlegen (gleiche Felder wie /api/provision)
  const slug = await freienSlugFinden(slugify(companyName));
  const ins = await fetch(`${masterUrl}/rest/v1/tenants`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      slug,
      company_name: companyName,
      admin_email: adminEmail,
      admin_name: adminName,
      status: 'provisioning',
      provision_log: [{ ts: new Date().toISOString(), step: 'stripe', msg: 'Kauf über Stripe Checkout – automatisch angelegt.' }],
    }),
  });
  if (!ins.ok) throw new Error('Registry-Eintrag fehlgeschlagen: ' + (await ins.text()));
  const tenant = (await ins.json())?.[0];
  if (!tenant?.id) throw new Error('Registry-Eintrag angelegt, aber keine ID erhalten.');

  await upsertSubscription({
    stripe_subscription_id: stripeSubscriptionId,
    tenant_id: tenant.id,
  });

  // 3b) NEU: Benachrichtigung an uns – neuer Testzugang gestartet.
  //     Fire-and-forget: Ein Fehler hier darf den Webhook niemals brechen.
  benachrichtigeNeuenTestzugang(companyName, adminName, adminEmail).catch((err) =>
    console.error('[stripe-webhook] Benachrichtigung fehlgeschlagen:', err?.message)
  );

  // 4) Provisionierung anstoßen (Supabase-Projekt + Vercel + Willkommens-Mail)
  //    Schlägt sie fehl oder läuft in ein Timeout, kann sie in der
  //    Admin-Oberfläche (/admin/kunden) per „Fortsetzen" neu gestartet werden.
  try {
    await runProvision(tenant.id);
  } catch (err: any) {
    console.error('[stripe-webhook] Provisionierung fehlgeschlagen:', err.message);
    await tenantStatusSetzen(tenant.id, 'error', 'Provisionierung fehlgeschlagen – in /admin/kunden fortsetzen.');
  }
}

// ── Abo-Statusänderungen auf subscriptions + tenant spiegeln ──
async function aboStatusNachziehen(sub: Stripe.Subscription): Promise<void> {
  const fields: Record<string, any> = {
    stripe_subscription_id: sub.id,
    stripe_customer_id: String(sub.customer || ''),
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
  };
  const trialEnd = (sub as any).trial_end;
  const periodEnd = (sub as any).items?.data?.[0]?.current_period_end ?? (sub as any).current_period_end;
  if (trialEnd) fields.trial_end = new Date(trialEnd * 1000).toISOString();
  if (periodEnd) fields.current_period_end = new Date(periodEnd * 1000).toISOString();

  await upsertSubscription(fields);

  // tenant-Status spiegeln
  const res = await fetch(
    `${masterUrl}/rest/v1/subscriptions?stripe_subscription_id=eq.${encodeURIComponent(sub.id)}&select=tenant_id`,
    { headers }
  );
  const rows = res.ok ? await res.json() : [];
  const tenantId = rows?.[0]?.tenant_id || null;

  // tenant-Datensatz mit Projekt-Ref holen (für Kill-Switch)
  let projektRef: string | null = null;
  let tenantStatus = '';
  if (tenantId) {
    const tRes = await fetch(
      `${masterUrl}/rest/v1/tenants?id=eq.${tenantId}&select=status,supabase_project_ref`,
      { headers }
    );
    const tRows = tRes.ok ? await tRes.json() : [];
    projektRef = tRows?.[0]?.supabase_project_ref || null;
    tenantStatus = tRows?.[0]?.status || '';
  }

  if (sub.status === 'active') {
    await tenantStatusSetzen(tenantId, 'active', 'Abo aktiv.');
    // NEU (Sprint 1): War die Instanz gesperrt, wird sie bei Zahlungseingang reaktiviert
    if (projektRef && tenantStatus === 'gesperrt') {
      try {
        await restoreSupabaseProject(projektRef);
        console.log(`[stripe-webhook] Instanz ${projektRef} reaktiviert (Zahlung eingegangen).`);
      } catch (err: any) {
        console.error('[stripe-webhook] Reaktivierung fehlgeschlagen:', err.message);
      }
    }
  } else if (sub.status === 'past_due' || sub.status === 'unpaid') {
    // Mahnphase: Instanz läuft weiter (Stripe versucht die Abbuchung erneut),
    // aber der Betreiber sieht den Zahlungsverzug in /admin/kunden
    await tenantStatusSetzen(tenantId, 'past_due', 'Zahlung ausstehend/fehlgeschlagen – Stripe versucht es erneut.');
  } else if (sub.status === 'canceled') {
    // NEU (Sprint 1): Automatische Sperrung – Instanz wird pausiert, nichts geht verloren
    await tenantStatusSetzen(tenantId, 'gesperrt', 'Abo beendet – Instanz pausiert (Daten bleiben erhalten).');
    if (projektRef) {
      try {
        await pauseSupabaseProject(projektRef);
        console.log(`[stripe-webhook] Instanz ${projektRef} pausiert (Abo beendet).`);
      } catch (err: any) {
        console.error('[stripe-webhook] Pausieren fehlgeschlagen:', err.message);
      }
    }
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe nicht konfiguriert' }, { status: 503 });
  }

  const stripe = new Stripe(secret);
  const payload = await req.text();
  const signature = req.headers.get('stripe-signature') || '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Ungültige Signatur: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await kaufAbgeschlossen(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await aboStatusNachziehen(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).subscription;
        if (subId) {
          await upsertSubscription({ stripe_subscription_id: String(subId), status: 'past_due' });
        }
        break;
      }
      default:
        // Andere Ereignisse bewusst ignorieren
        break;
    }
  } catch (err: any) {
    console.error(`[stripe-webhook] Fehler bei ${event.type}:`, err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
