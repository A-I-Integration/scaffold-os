import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, adresse, data, status } = body;

    if (!name || !adresse) {
      return NextResponse.json({ error: 'Name und Adresse erforderlich' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        name,
        adresse,
        data: data || {},
        status: status || 'active',
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: project.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}