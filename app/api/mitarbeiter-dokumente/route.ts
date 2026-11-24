import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { pruefeDokumentEingabe } from '@/lib/personal-dokumente';

// ============================================================
// SCAFFOLD OS – Mitarbeiter-Dokumente (Reiter „Dokumente“)
// Personalien, Lehrgänge, G-Untersuchungen, Führer-/Kranscheine mit Gültigkeit. Chef und Disposition.
// Dateien liegen im privaten Bucket employee-documents; Ansehen nur über signed-url.
//
// GET ?employee_id=…  → Dokumente eines Mitarbeiters; ohne employee_id: alle (mit Name) für die Fälligkeitsübersicht
// POST multipart: employee_id, kategorie, bezeichnung, ausgestellt_am?, gueltig_bis?, notiz?, file? (PDF/JPG/PNG, max. 10 MB)
// DELETE ?id=…        → Eintrag und Datei löschen
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });
const ERLAUBT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const FELDER = 'id,employee_id,kategorie,bezeichnung,ausgestellt_am,gueltig_bis,file_name,notiz,created_at';

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  const empId = new URL(req.url).searchParams.get('employee_id');
  if (empId && !UUID.test(empId)) return fehler('employee_id ungültig');
  try {
    const filter = empId ? `&employee_id=eq.${empId}` : '';
    const res = await fetch(`${url}/rest/v1/employee_documents?select=${FELDER}${filter}&order=created_at.desc`, { headers });
    if (!res.ok) throw new Error(await res.text());
    const dokumente = await res.json();
    let namen: Record<string, string> = {};
    if (!empId) {
      const m = await fetch(`${url}/rest/v1/employees?select=id,first_name,last_name`, { headers });
      if (m.ok) for (const e of await m.json()) namen[e.id] = `${e.first_name} ${e.last_name}`;
    }
    return NextResponse.json({ success: true, dokumente: dokumente.map((d: any) => ({ ...d, mitarbeiter: namen[d.employee_id] ?? undefined })) });
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-dokumente/GET');
  }
}

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  let form: FormData;
  try { form = await req.formData(); } catch { return fehler('Ungültige Anfrage'); }
  const employeeId = String(form.get('employee_id') || '');
  if (!UUID.test(employeeId)) return fehler('Bitte einen Mitarbeiter wählen.');
  const p = pruefeDokumentEingabe({
    kategorie: form.get('kategorie'), bezeichnung: form.get('bezeichnung'),
    ausgestellt_am: form.get('ausgestellt_am'), gueltig_bis: form.get('gueltig_bis'), notiz: form.get('notiz'),
  });
  if (!p.ok) return fehler(p.fehler);
  const datei = form.get('file');
  const file = datei instanceof File && datei.size > 0 ? datei : null;
  if (file) {
    if (!ERLAUBT[file.type]) return fehler('Nur PDF, JPG oder PNG erlaubt.');
    if (file.size > 10 * 1024 * 1024) return fehler('Datei zu groß (max. 10 MB).');
  }
  try {
    const emp = await fetch(`${url}/rest/v1/employees?id=eq.${employeeId}&select=id`, { headers });
    if (!emp.ok || (await emp.json()).length === 0) return fehler('Mitarbeiter nicht gefunden', 404);

    let filePath: string | null = null;
    if (file) {
      filePath = `${employeeId}/${crypto.randomUUID()}.${ERLAUBT[file.type]}`;
      const up = await fetch(`${url}/storage/v1/object/employee-documents/${filePath}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': file.type },
        body: Buffer.from(await file.arrayBuffer()),
      });
      if (!up.ok) throw new Error(`Storage-Upload fehlgeschlagen: ${up.status} ${await up.text()}`);
    }
    const ins = await fetch(`${url}/rest/v1/employee_documents`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        employee_id: employeeId, kategorie: p.kategorie, bezeichnung: p.bezeichnung,
        ausgestellt_am: p.ausgestellt_am, gueltig_bis: p.gueltig_bis, notiz: p.notiz,
        file_path: filePath, file_name: file ? file.name.slice(0, 200) : null, created_by: rolle.userId,
      }),
    });
    if (!ins.ok) throw new Error(await ins.text());
    return NextResponse.json({ success: true, dokument: (await ins.json())[0] });
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-dokumente/POST');
  }
}

export async function DELETE(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return fehler('id erforderlich');
  try {
    const sel = await fetch(`${url}/rest/v1/employee_documents?id=eq.${id}&select=file_path`, { headers });
    if (!sel.ok) throw new Error(await sel.text());
    const zeile = (await sel.json())[0];
    if (!zeile) return fehler('Nicht gefunden', 404);
    const del = await fetch(`${url}/rest/v1/employee_documents?id=eq.${id}`, { method: 'DELETE', headers });
    if (!del.ok) throw new Error(await del.text());
    if (zeile.file_path) {
      // Datei-Löschung ist nachrangig: der Eintrag ist weg, ein Rest im Bucket ist ohne Eintrag nicht mehr abrufbar.
      await fetch(`${url}/storage/v1/object/employee-documents/${zeile.file_path}`, { method: 'DELETE', headers }).catch(() => undefined);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-dokumente/DELETE');
  }
}
