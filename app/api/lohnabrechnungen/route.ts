import { NextRequest, NextResponse } from 'next/server';
import { requireOwnEmployeeOrAdmin, forbiddenResponse, serverErrorResponse } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Lohnabrechnungen (Mitarbeiter-Bereich, Reiter 4)
//
// GET    ?employee_id=...            → Liste der hochgeladenen
//        Lohnabrechnungen (neueste zuerst). Erlaubt: admin/
//        disponent (für jeden Mitarbeiter) ODER der eigene
//        Mitarbeiter-Datensatz (requireOwnEmployeeOrAdmin).
// POST   multipart/form-data:
//        employee_id, month ('YYYY-MM'), file (PDF)
//        → PDF in den privaten Bucket "payroll-documents" hochladen
//        und in payroll_documents ablegen. NUR admin/disponent
//        (das Hochladen der fertigen Abrechnung ist Aufgabe von
//        CEO/Dispo, nicht des Mitarbeiters selbst).
// DELETE ?id=...                     → Eintrag + Datei löschen.
//        NUR admin/disponent.
//
// Ansehen/Download/Versenden laufen über eigene Routen
// (signed-url, send), da dort jeweils zusätzlich geprüft werden
// muss, wessen Dokument es ist.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function checkAdminOrDisponent(): Promise<{ allowed: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false, error: 'Nicht angemeldet.' };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'disponent'].includes(profile.role)) {
    return { allowed: false, error: 'Nur Admin und Disposition dürfen Lohnabrechnungen hochladen/löschen.' };
  }
  return { allowed: true };
}

// ─── GET: Liste für einen Mitarbeiter ───
export async function GET(req: NextRequest) {
  const employeeId = new URL(req.url).searchParams.get('employee_id');
  if (!employeeId) {
    return NextResponse.json({ success: false, error: 'employee_id erforderlich' }, { status: 400 });
  }
  const auth = await requireOwnEmployeeOrAdmin(employeeId);
  if (!auth.allowed) return forbiddenResponse(auth.error);

  try {
    const res = await fetch(
      `${url}/rest/v1/payroll_documents?employee_id=eq.${employeeId}&select=id,month,file_name,uploaded_at,sent_at&order=month.desc`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, documents: await res.json() });
  } catch (err: any) {
    return serverErrorResponse(err, 'lohnabrechnungen/GET');
  }
}

// ─── POST: PDF hochladen (nur admin/disponent) ───
export async function POST(req: NextRequest) {
  const auth = await checkAdminOrDisponent();
  if (!auth.allowed) return forbiddenResponse(auth.error);

  try {
    const form = await req.formData();
    const employeeId = form.get('employee_id') as string;
    const month = form.get('month') as string;
    const file = form.get('file') as File | null;

    if (!employeeId || !month || !file) {
      return NextResponse.json({ success: false, error: 'employee_id, month und file sind erforderlich.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: 'month muss im Format YYYY-MM sein.' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ success: false, error: 'Nur PDF-Dateien erlaubt.' }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'Datei zu groß (max. 15MB).' }, { status: 400 });
    }

    const storagePath = `${employeeId}/${month}.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadRes = await fetch(`${url}/storage/v1/object/payroll-documents/${storagePath}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
      body: buffer,
    });
    if (!uploadRes.ok) {
      return serverErrorResponse(new Error(`Storage-Upload fehlgeschlagen: ${uploadRes.status} ${await uploadRes.text()}`), 'lohnabrechnungen/upload');
    }

    // Erneutes Hochladen für denselben Monat ersetzt den bisherigen Eintrag
    // (unique(employee_id, month) + Prefer: resolution=merge-duplicates).
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();

    const insertRes = await fetch(`${url}/rest/v1/payroll_documents`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({
        employee_id: employeeId,
        month,
        file_path: storagePath,
        file_name: file.name,
        uploaded_by: user?.id || null,
        uploaded_at: new Date().toISOString(),
        sent_at: null,
      }),
    });
    if (!insertRes.ok) throw new Error(await insertRes.text());

    return NextResponse.json({ success: true, document: (await insertRes.json())[0] });
  } catch (err: any) {
    return serverErrorResponse(err, 'lohnabrechnungen/POST');
  }
}

// ─── DELETE: Eintrag + Datei löschen (nur admin/disponent) ───
export async function DELETE(req: NextRequest) {
  const auth = await checkAdminOrDisponent();
  if (!auth.allowed) return forbiddenResponse(auth.error);

  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });

    const getRes = await fetch(`${url}/rest/v1/payroll_documents?id=eq.${id}&select=file_path`, { headers });
    if (!getRes.ok) throw new Error(await getRes.text());
    const rows = await getRes.json();
    if (!rows?.[0]) return NextResponse.json({ success: false, error: 'Nicht gefunden.' }, { status: 404 });

    await fetch(`${url}/storage/v1/object/payroll-documents/${rows[0].file_path}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }).catch(() => {}); // Datei-Löschung ist best effort, Datensatz wird trotzdem entfernt

    const delRes = await fetch(`${url}/rest/v1/payroll_documents?id=eq.${id}`, { method: 'DELETE', headers });
    if (!delRes.ok) throw new Error(await delRes.text());

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return serverErrorResponse(err, 'lohnabrechnungen/DELETE');
  }
}
