import { redirect } from 'next/navigation';

// Die Faktura liegt jetzt im Kundenordner (Reiter „Faktura“). Alte Lesezeichen führen zur Kundenliste.
export default function FakturaWeiterleitung() {
  redirect('/kunden');
}
