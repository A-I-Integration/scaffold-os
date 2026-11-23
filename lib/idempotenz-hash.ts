import { createHash } from 'node:crypto';

// Hash der Nutzdaten einer Anfrage (Schlüssel sortiert, damit die Reihenfolge der Felder keine Rolle spielt).
// Derselbe Idempotenzschlüssel mit anderen Nutzdaten wird dadurch als Konflikt erkannt (supabase/phase-130/131).
function stabil(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stabil);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stabil((v as Record<string, unknown>)[k])]));
  return v;
}

export function nutzdatenHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(stabil(body))).digest('hex');
}
