import { useEffect, useState } from 'react';
import { getHealth } from '../api/health';

type State = 'checking' | 'ok' | 'down';

export function HealthBadge() {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    getHealth()
      .then((h) => setState(h.status === 'ok' ? 'ok' : 'down'))
      .catch(() => setState('down'));
  }, []);

  const color = { checking: 'bg-slate-400', ok: 'bg-emerald-500', down: 'bg-rose-500' }[state];
  const label = { checking: 'Checking API…', ok: 'API connected', down: 'API unreachable' }[state];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
