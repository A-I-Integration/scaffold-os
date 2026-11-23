import { Suspense } from 'react';
import { RechnungenInhalt } from '@/components/rechnungen/RechnungenInhalt';

// Die Rechnungsliste mit Formular liegt in components/rechnungen/RechnungenInhalt.tsx und läuft auch eingebettet im Kundenordner (Reiter „Faktura“).
export default function RechnungenPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fbfbfd] p-8 text-[#86868b]">Lade…</div>}>
      <RechnungenInhalt />
    </Suspense>
  );
}
