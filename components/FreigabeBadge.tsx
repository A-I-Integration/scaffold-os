'use client';

import { useEffect, useState } from 'react';
import type { FreigabeStatus } from '@/lib/freigabe-status';

// Lädt den Freigabe-Status für mehrere Baustellen in einem Aufruf.
export function useFreigabeStatus(projectIds: (string | null | undefined)[]): Record<string, FreigabeStatus> {
  const [status, setStatus] = useState<Record<string, FreigabeStatus>>({});
  const schluessel = Array.from(new Set(projectIds.filter((x): x is string => !!x))).sort().join(',');
  useEffect(() => {
    if (!schluessel) { setStatus({}); return; }
    let aktiv = true;
    fetch(`/api/freigabe-status?project_ids=${encodeURIComponent(schluessel)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (aktiv && j.success) setStatus(j.status || {}); })
      .catch(() => { /* Badge bleibt einfach weg */ });
    return () => { aktiv = false; };
  }, [schluessel]);
  return status;
}

export function FreigabeBadge({ status }: { status?: FreigabeStatus }) {
  if (!status) return null;
  const farbe = status.stufe === 'freigegeben' ? 'text-emerald-800 border-emerald-700' : 'text-red-800 border-red-700';
  return (
    <span title={status.grund} className={`inline-block rounded border px-2 py-0.5 text-[11px] font-semibold ${farbe}`}>
      {status.warnung ? '⚠️ ' : '✅ '}{status.label}
    </span>
  );
}
