import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// ============================================================
// SCAFFOLD OS – Stripe: Checkout starten (NUR Master-Instanz)
//
// POST { company_name, admin_name, admin_email }
// → Legt eine Stripe-Checkout-Session an (Abo, 3 Tage Test,
//   SEPA-Lastschrift + Kreditkarte) und liefert die URL zurück.
//   Die Kauf-Seite (/kaufen) leitet den Kunden dorthin weiter.
//
// Nach erfolgreicher Zahlung meldet sich Stripe beim Webhook
// (/api/stripe/webhook) – NICHT hier. Hier startet nur der Kauf.
// ============================================================

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!stripe || !priceId) {
      return NextResponse.json(
        { success: false, error: 'Stripe ist auf dieser Instanz nicht konfiguriert.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const companyName = String(body.company_name || '').trim();
    const adminName = String(body.admin_name || '').trim();
    const adminEmail = String(body.admin_email || '').trim().toLowerCase();

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
      payment_method_types: ['card', 'sepa_debit'],
      subscription_data: {
        trial_period_days: 3,
        metadata: { company_name: companyName, admin_email: adminEmail, admin_name: adminName },
      },
      metadata: { company_name: companyName, admin_email: adminEmail, admin_name: adminName },
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
