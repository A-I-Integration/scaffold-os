// ============================================================
// components/dashboard/AlertFeed.tsx
// SCAFFOLD OS – CEO-Warnungs-Feed
// ============================================================

'use client';

import { useRouter } from 'next/navigation';

interface Alert {
  severity: 'critical' | 'warning' | 'info';
  icon: string;
  title: string;
  message: string;
  action: string;
  actionLabel: string;
}

interface Props {
  alerts: Alert[];
}

export default function AlertFeed({ alerts }: Props) {
  const router = useRouter();

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
        <p className="text-3xl mb-2">✅</p>
        <p className="text-emerald-700 font-medium">Keine kritischen Warnungen</p>
        <p className="text-sm text-emerald-600/60">Alles im grünen Bereich</p>
      </div>
    );
  }

  const severityConfig = {
    critical: {
      border: 'border-red-500/30',
      bg: 'bg-red-500/10',
      iconBg: 'bg-red-500/20',
      titleColor: 'text-red-300',
      textColor: 'text-red-200/70',
      button: 'bg-red-600 hover:bg-red-500',
    },
    warning: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      iconBg: 'bg-amber-500/20',
      titleColor: 'text-[#e8590c]',
      textColor: 'text-amber-200/70',
      button: 'bg-[#e8590c] hover:bg-[#d9480f] text-white',
    },
    info: {
      border: 'border-blue-500/30',
      bg: 'bg-blue-500/10',
      iconBg: 'bg-blue-500/20',
      titleColor: 'text-blue-300',
      textColor: 'text-blue-200/70',
      button: 'bg-blue-600 hover:bg-blue-500',
    },
  };

  return (
    <div className="space-y-3">
      {alerts.map((alert, i) => {
        const config = severityConfig[alert.severity];
        return (
          <div
            key={i}
            className={`rounded-xl border ${config.border} ${config.bg} p-4 flex items-start gap-4`}
          >
            <div className={`rounded-xl ${config.iconBg} p-2 text-xl shrink-0`}>
              {alert.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className={`font-bold text-sm ${config.titleColor}`}>{alert.title}</h4>
              <p className={`text-sm mt-1 ${config.textColor}`}>{alert.message}</p>
            </div>
            <button
              onClick={() => router.push(alert.action)}
              className={`${config.button} text-[#1d1d1f] text-xs font-semibold px-3 py-2 rounded-xl shrink-0 transition-colors`}
            >
              {alert.actionLabel}
            </button>
          </div>
        );
      })}
    </div>
  );
}