import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { pruefeRolle, serverErrorResponse, forbiddenResponse } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Stripe: Kundenportal öffnen (NUR Master-Instanz)
//
// POST { email }
// → Sucht den Stripe-Kunden zur E-Mail und öffnet das
//   Stripe-Kundenportal: Abo kündigen, Zahlungsart ändern,
//   Rechnungen herunterladen – ohne dass wir etwas bauen müssen.
//
// Wird von /abo-verwalten genutzt.
// ============================================================

export async function POST(req: NextRequest) {
  // Das Portal erlaubt Kündigung und Zahlungsänderung: nur Admin.
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  try {
    // Nur für die eigene Login-Adresse: sonst könnte ein Admin das Abo eines anderen Kunden kündigen.
    const { data: { user } } = await (await createClient()).auth.getUser();
    const eigene = (user?.email || '').trim().toLowerCase();
    const body = await req.json();
    const email = String(body.email || eigene).trim().toLowerCase();
    if (!eigene || email !== eigene) {
      return forbiddenResponse('Das Kundenportal lässt sich nur für deine eigene Login-E-Mail-Adresse öffnen.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' },
        { status: 400 }
      );
    }

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return NextResponse.json(
        { success: false, error: 'Stripe ist auf dieser Instanz nicht konfiguriert.' },
        { status: 503 }
      );
    }

    const stripe = new Stripe(key);
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0];
    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Zu dieser E-Mail-Adresse wurde kein Abo gefunden.' },
        { status: 404 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${req.nextUrl.origin}/`,
    });

    return NextResponse.json({ success: true, url: session.url });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
