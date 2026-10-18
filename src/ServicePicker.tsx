import { useEffect, useMemo, useState } from 'react';
import { fetchServices } from './api';

let servicesCache: Promise<string[]> | null = null;

function loadServices(): Promise<string[]> {
  servicesCache ??= fetchServices().catch((err: unknown) => {
    servicesCache = null; // retry on next open
    throw err;
  });
  return servicesCache;
}

interface Props {
  mine: string[];
  onChange: (mine: string[]) => void;
}

export function ServicePicker({ mine, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const mineSet = useMemo(() => new Set(mine), [mine]);

  // The full list is ~130 KB, so only fetch it once someone opens the picker.
  useEffect(() => {
    if (!open || all) return;
    let live = true;
    loadServices()
      .then((s) => live && setAll(s))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Request failed'));
    return () => {
      live = false;
    };
  }, [open, all]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (all ?? []).filter((n) => n.toLowerCase().includes(f));
  }, [all, filter]);

  function toggle(name: string) {
    onChange(mineSet.has(name) ? mine.filter((n) => n !== name) : [...mine, name]);
  }

  function setOpenState(next: boolean) {
    setOpen(next);
    setError(null);
    if (!next) setFilter('');
  }

  return (
    <div className="my-services">
      <div className="my-services-bar">
        <span className="my-services-label">My services</span>
        {mine.length === 0 && <span className="my-services-none">none yet</span>}
        {mine.map((n) => (
          <button key={n} className="chip" onClick={() => toggle(n)} title={`Remove ${n}`}>
            {n} <span aria-hidden>×</span>
          </button>
        ))}
        <button
          className="my-services-edit"
          onClick={() => setOpenState(!open)}
          aria-expanded={open}
        >
          {open ? 'done' : mine.length ? 'edit' : 'choose'}
        </button>
      </div>

      {open && (
        <div className="picker">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpenState(false)}
            placeholder="Filter services…"
            spellCheck={false}
          />
          {error && <p className="status error">{error}</p>}
          {!all && !error && <p className="status blink">loading services…</p>}
          {all && shown.length === 0 && <p className="status">No service matches.</p>}
          {shown.length > 0 && (
            <ul className="picker-list">
              {shown.map((n) => (
                <li key={n}>
                  <label>
                    <input type="checkbox" checked={mineSet.has(n)} onChange={() => toggle(n)} />
                    {n}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
