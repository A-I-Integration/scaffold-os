import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

export async function GET() {
  try {
    const res = await fetch(`${url}/rest/v1/vehicles?select=*&is_active=eq.true&order=name`, { headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, vehicles: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(`${url}/rest/v1/vehicles`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, vehicle: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    const res = await fetch(`${url}/rest/v1/vehicles?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, vehicle: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}