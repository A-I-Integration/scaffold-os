import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// ============================================================
// SCAFFOLD OS – Stripe: Checkout starten (NUR Master-Instanz)
//
// POST { company_name, admin_name, admin_email, plan }
// → Legt eine Stripe-Checkout-Session an (Abo, 3 Tage Test,
//   SEPA-Lastschrift + Kreditkarte) und liefert die URL zurück.
//   Die Kauf-Seite (/kaufen) leitet den Kunden dorthin weiter.
//
// Pakete (plan): starter | priority | enterprise
// Preis-Zuordnung über Env-Variablen:
//   STRIPE_PRICE_ID_STARTER    (Fallback: STRIPE_PRICE_ID)
//   STRIPE_PRICE_ID_PRIORITY
//   STRIPE_PRICE_ID_ENTERPRISE
//
// Nach erfolgreicher Zahlung meldet sich Stripe beim Webhook
// (/api/stripe/webhook) – NICHT hier. Hier startet nur der Kauf.
// ============================================================

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

// Paket → Stripe-Preis-ID. Starter nutzt als Fallback die
// bisherige STRIPE_PRICE_ID, damit bestehende Konfiguration läuft.
function preisIdFuerPlan(plan: string): string | undefined {
  switch (plan) {
    case 'priority':
      return process.env.STRIPE_PRICE_ID_PRIORITY;
    case 'enterprise':
      return process.env.STRIPE_PRICE_ID_ENTERPRISE;
    case 'starter':
    default:
      return process.env.STRIPE_PRICE_ID_STARTER || process.env.STRIPE_PRICE_ID;
  }
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { success: false, error: 'Stripe ist auf dieser Instanz nicht konfiguriert.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const companyName = String(body.company_name || '').trim();
    const adminName = String(body.admin_name || '').trim();
    const adminEmail = String(body.admin_email || '').trim().toLowerCase();
    const plan = ['starter', 'priority', 'enterprise'].includes(body.plan) ? body.plan : 'starter';

    const priceId = preisIdFuerPlan(plan);
    if (!priceId) {
      return NextResponse.json(
        { success: false, error: `Paket "${plan}" ist noch nicht konfiguriert. Bitte kurz später erneut versuchen.` },
        { status: 503 }
      );
    }

    if (!companyName || !adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      return NextResponse.json(
        { success: false, error: 'Bitte Firma und eine gültige E-Mail-Adresse angeben.' },
        { status: 400 }
      );
    }

    const origin = req.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: adminEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      // Zahlungsarten kommen aus dem Stripe-Dashboard (Managed Payments).
      // Dort „SEPA-Lastschrift" aktivieren, wenn gewünscht.
      subscription_data: {
        trial_period_days: 3,
        metadata: { company_name: companyName, admin_email: adminEmail, admin_name: adminName, plan, price_id: priceId },
      },
      metadata: { company_name: companyName, admin_email: adminEmail, admin_name: adminName, plan, price_id: priceId },
      // Firmenname + Rechnungsadresse für die monatliche Rechnung
      billing_address_collection: 'required',
      customer_update: { name: 'auto', address: 'auto' },
      success_url: `${origin}/kaufen/erfolg?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/kaufen?abgebrochen=1`,
      locale: 'de',
    });

    return NextResponse.json({ success: true, url: session.url });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
