// ============================================================
// SCAFFOLD OS – Paket-Grenzen (Starter / Priority / Enterprise)
//
// Zentrale Definition der Paketinhalte, wie sie auf der
// Startseite verkauft werden. Die Kunden-Instanz erfährt ihr
// Paket bei der Provisionierung über die Env-Var TENANT_PLAN
// (starter | priority | enterprise).
//
// WICHTIG: Instanzen OHNE TENANT_PLAN (Bestands-/Pilot-Kunden
// „pilot-249", Demo, Master) bekommen bewusst KEINE Grenzen –
// für sie ändert sich nichts.
// ============================================================

export type PlanId = 'starter' | 'priority' | 'enterprise';

export interface PlanGrenzen {
  label: string;
  maxLogins: number | null;                    // null = unbegrenzt
  rollenQuoten: Record<string, number> | null; // Starter: feste Sitze pro Rolle
  erlaubteRollen: string[] | null;             // null = alle Rollen erlaubt
  maxLagerTeile: number | null;                // Summe der Bestände (quantity), null = unbegrenzt
}

export const PLAN_GRENZEN: Record<PlanId, PlanGrenzen> = {
  starter: {
    label: 'Starter',
    maxLogins: 8, // 1× Admin/CEO + 2× Dispo + 5× Mitarbeiter
    rollenQuoten: { admin: 1, disponent: 2, mitarbeiter: 5 },
    erlaubteRollen: ['admin', 'disponent', 'mitarbeiter'], // bauleiter/lager erst ab Priority
    maxLagerTeile: 10000,
  },
  priority: {
    label: 'Priority',
    maxLogins: 20,
    rollenQuoten: null,
    erlaubteRollen: null, // inkl. bauleiter + lager
    maxLagerTeile: 20000,
  },
  enterprise: {
    label: 'Enterprise',
    maxLogins: null,
    rollenQuoten: null,
    erlaubteRollen: null,
    maxLagerTeile: null,
  },
};

// Plan dieser Instanz. null = kein Paket bekannt → keine Grenzen.
export function aktuellerPlan(): { id: PlanId; grenzen: PlanGrenzen } | null {
  const p = (process.env.TENANT_PLAN || '').toLowerCase().trim();
  if (p === 'starter' || p === 'priority' || p === 'enterprise') {
    return { id: p, grenzen: PLAN_GRENZEN[p] };
  }
  return null;
}

export const UPGRADE_HINWEIS =
  'Ein Upgrade ist jederzeit möglich – eine kurze Mail an info@a-i-integration.de genügt.';
