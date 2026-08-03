import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, projectId } = await req.json();

    if (!sessionId || !projectId) {
      return NextResponse.json({ error: 'sessionId und projectId erforderlich' }, { status: 400 });
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from('project_media')
      .update({
        project_id: projectId,
        session_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId)
      .is('project_id', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}