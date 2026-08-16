// ============================================================
// components/dashboard/StatsGrid.tsx
// SCAFFOLD OS – CEO-Statistiken-Kacheln
// ============================================================

'use client';

interface Stats {
  inventoryValue: number;
  criticalStockCount: number;
  activeProjectsCount: number;
  stalledProjectsCount: number;
  avgMargin: number;
  materialWithoutRevenue: number;
  absentEmployees: number;
  pendingTransports: number;
}

interface Props {
  stats: Stats;
}

export default function StatsGrid({ stats }: Props) {
  const cards = [
    {
      label: 'Aktive Projekte',
      value: stats.activeProjectsCount,
      unit: '',
      color: 'text-blue-600',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      icon: '🏗️',
    },
    {
      label: 'Kritische Bestände',
      value: stats.criticalStockCount,
      unit: 'Artikel',
      color: stats.criticalStockCount > 0 ? 'text-red-600' : 'text-emerald-600',
      bg: stats.criticalStockCount > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10',
      border: stats.criticalStockCount > 0 ? 'border-red-500/20' : 'border-emerald-500/20',
      icon: stats.criticalStockCount > 0 ? '⚠️' : '✅',
    },
    {
      label: 'Material ohne Umsatz',
      value: stats.materialWithoutRevenue,
      unit: '€',
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/20',
      icon: '💰',
      format: 'currency',
    },
    {
      label: 'Durchschnittsmarge',
      value: stats.avgMargin,
      unit: '%',
      color: stats.avgMargin < 15 ? 'text-red-600' : stats.avgMargin < 25 ? 'text-amber-600' : 'text-emerald-600',
      bg: stats.avgMargin < 15 ? 'bg-red-500/10' : stats.avgMargin < 25 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
      border: stats.avgMargin < 15 ? 'border-red-500/20' : stats.avgMargin < 25 ? 'border-amber-500/20' : 'border-emerald-500/20',
      icon: '📊',
    },
    {
      label: 'Stillstand > 30 Tage',
      value: stats.stalledProjectsCount,
      unit: 'Projekte',
      color: stats.stalledProjectsCount > 0 ? 'text-red-600' : 'text-[#86868b]',
      bg: stats.stalledProjectsCount > 0 ? 'bg-red-500/10' : 'bg-black/5',
      border: stats.stalledProjectsCount > 0 ? 'border-red-500/20' : 'border-black/10',
      icon: '🛑',
    },
    {
      label: 'Abwesende Mitarbeiter',
      value: stats.absentEmployees,
      unit: '',
      color: stats.absentEmployees > 0 ? 'text-amber-600' : 'text-emerald-600',
      bg: stats.absentEmployees > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
      border: stats.absentEmployees > 0 ? 'border-amber-500/20' : 'border-emerald-500/20',
      icon: stats.absentEmployees > 0 ? '🤒' : '👥',
    },
    {
      label: 'Ausstehende Transporte',
      value: stats.pendingTransports,
      unit: '',
      color: stats.pendingTransports > 0 ? 'text-blue-600' : 'text-[#86868b]',
      bg: stats.pendingTransports > 0 ? 'bg-blue-500/10' : 'bg-black/5',
      border: stats.pendingTransports > 0 ? 'border-blue-500/20' : 'border-black/10',
      icon: '🚛',
    },
    {
      label: 'Lagerwert',
      value: stats.inventoryValue,
      unit: '€',
      color: 'text-emerald-600',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      icon: '📦',
      format: 'currency',
    },
  ];

  function formatValue(value: number, format?: string) {
    if (format === 'currency') {
      return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    }
    return value.toLocaleString('de-DE');
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <div
          key={i}
          className={`rounded-xl border ${card.border} ${card.bg} p-4 transition-all hover:brightness-110`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">{card.icon}</span>
            {card.unit && card.unit !== '€' && (
              <span className="text-xs text-[#86868b]">{card.unit}</span>
            )}
          </div>
          <p className={`text-2xl font-bold ${card.color}`}>
            {formatValue(card.value, card.format)}
          </p>
          <p className="text-xs text-[#86868b] mt-1">{card.label}</p>
        </div>
      ))}
    </div>
  );
}