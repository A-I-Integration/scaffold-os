import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, adresse, data, status } = body;

    if (!name || !adresse) {
      return NextResponse.json({ error: 'Name und Adresse erforderlich' }, { status: 400 });
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        name,
        adresse,
        data: data || {},
        status: status || 'active',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: 500 });
    }

    const result = await response.json();
    return NextResponse.json({ id: result[0].id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}