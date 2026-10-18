import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAvailability,
  searchTitles,
  type CountryOffer,
  type SearchResult,
} from './api';
import { COUNTRIES } from './countries';
import { ServicePicker } from './ServicePicker';
import { TIMEZONE_COUNTRY } from './timezones';

const COUNTRY_NAME = new Map(COUNTRIES.map((c) => [c.code, c.name]));

const HOME_KEY = 'where-to-watch:home-country';

/** Best guess at where the user physically is, or '' if unknown/unsupported. */
function detectHome(): string {
  try {
    const fromTz = TIMEZONE_COUNTRY[Intl.DateTimeFormat().resolvedOptions().timeZone];
    if (fromTz) return fromTz;
    for (const lang of navigator.languages ?? []) {
      const region = new Intl.Locale(lang).region;
      if (region && COUNTRY_NAME.has(region)) return region;
    }
  } catch {
    // fall through
  }
  return '';
}

/** 'auto', or a country code the user picked explicitly. */
function loadHomeSetting(): string {
  try {
    const v = localStorage.getItem(HOME_KEY);
    if (v && COUNTRY_NAME.has(v)) return v;
  } catch {
    // storage unavailable
  }
  return 'auto';
}

const MY_SERVICES_KEY = 'where-to-watch:my-services';

function loadMyServices(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(MY_SERVICES_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function flag(code: string): string {
  return String.fromCodePoint(
    ...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

export default function App() {
  const [query, setQuery] = useState(
    () => new URLSearchParams(window.location.search).get('q') ?? '',
  );
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [availability, setAvailability] = useState<Map<string, CountryOffer[]> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const [myServices, setMyServices] = useState(loadMyServices);
  const mine = useMemo(() => new Set(myServices), [myServices]);

  useEffect(() => {
    try {
      localStorage.setItem(MY_SERVICES_KEY, JSON.stringify(myServices));
    } catch {
      // storage unavailable (private mode etc.); the choice just won't persist
    }
  }, [myServices]);

  const detectedHome = useMemo(detectHome, []);
  const [homeSetting, setHomeSetting] = useState(loadHomeSetting);
  const home = homeSetting === 'auto' ? detectedHome : homeSetting;

  function changeHome(value: string) {
    setHomeSetting(value);
    try {
      // Only an explicit choice is stored, so "auto" keeps following you around.
      if (value === 'auto') localStorage.removeItem(HOME_KEY);
      else localStorage.setItem(HOME_KEY, value);
    } catch {
      // storage unavailable
    }
  }

  function toggleService(service: string) {
    setMyServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service],
    );
  }

  // Mirror the search box into ?q= so a search can be bookmarked or shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    if (url.href !== window.location.href) {
      window.history.replaceState(null, '', url);
    }
  }, [query]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      searchTitles(q)
        .then((r) => {
          if (searchSeq.current === seq) setResults(r);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function pick(title: SearchResult) {
    setSelected(title);
    setResults([]);
    setQuery('');
    setAvailability(null);
    setError(null);
    setLoading(true);
    try {
      setAvailability(await fetchAvailability(title.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  const countryCount = availability
    ? new Set([...availability.values()].flat().map((o) => o.code)).size
    : 0;

  // Your services first; sort is stable, so each group keeps its
  // most-countries-first order.
  const services = availability
    ? [...availability.entries()].sort(
        ([a], [b]) => Number(mine.has(b)) - Number(mine.has(a)),
      )
    : [];
  const onMine = services.some(([s]) => mine.has(s));
  const homeName = COUNTRY_NAME.get(home);
  const servicesAtHome = services
    .filter(([, offers]) => offers.some((o) => o.code === home))
    .map(([s]) => s);
  const mineAtHome = servicesAtHome.filter((s) => mine.has(s));

  // "No VPN needed" only holds if it's on a service you actually have.
  function homeNote(): string {
    if (!servicesAtHome.length) return `Not streaming in ${homeName} — you'll need a VPN.`;
    if (mineAtHome.length) {
      return `No VPN needed — streaming in ${homeName} on ${mineAtHome.join(', ')}.`;
    }
    const where = `Streaming in ${homeName} on ${servicesAtHome.join(', ')}`;
    return myServices.length
      ? `${where}, but not on any of your services.`
      : `${where}. Star the services you have to see whether you need a VPN.`;
  }

  return (
    <div className="board">
      <header>
        <h1>Where·to·Watch</h1>
        <p className="tagline">international streaming departures</p>
      </header>

      <div className="search">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a movie or show…"
          spellCheck={false}
        />
        {results.length > 0 && (
          <ul className="results">
            {results.map((r) => (
              <li key={r.id}>
                <button onClick={() => pick(r)}>
                  {r.posterUrl ? (
                    <img src={r.posterUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="poster-blank" />
                  )}
                  <span className="result-title">{r.title}</span>
                  <span className="result-meta">
                    {r.type === 'SHOW' ? 'TV' : 'FILM'}
                    {r.year ? ` · ${r.year}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ServicePicker mine={myServices} onChange={setMyServices} />

      <div className="here-bar">
        <label>
          <span className="my-services-label">I'm in</span>
          <select value={homeSetting} onChange={(e) => changeHome(e.target.value)}>
            <option value="auto">
              {detectedHome ? `${COUNTRY_NAME.get(detectedHome)} (detected)` : 'Unknown — pick one'}
            </option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selected && (
        <section className="departures">
          <div className="departures-head">
            <h2>{selected.title}</h2>
            {availability && (
              <span className="summary">
                {countryCount > 0
                  ? `streaming in ${countryCount} of ${COUNTRIES.length} countries`
                  : 'not streaming anywhere'}
              </span>
            )}
          </div>

          {loading && <p className="status blink">querying 139 countries…</p>}
          {error && <p className="status error">{error}</p>}

          {availability &&
            (availability.size === 0 ? (
              <p className="status">
                No subscription streams found in any country. Sorry.
              </p>
            ) : (
              <>
                {homeName && (
                  <p className={mineAtHome.length ? 'here-note ok' : 'here-note'}>
                    {flag(home)} {homeNote()}
                  </p>
                )}
                {myServices.length > 0 && !onMine && (
                  <p className="status">Not on any of your services — other options below.</p>
                )}
                <ol className="services">
                  {services.map(([service, codes], i) => (
                    <li
                      key={service}
                      className={mine.has(service) ? 'mine' : undefined}
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      <div className="service-name">
                        <span>
                          <button
                            className="mine-toggle"
                            onClick={() => toggleService(service)}
                            aria-pressed={mine.has(service)}
                            title={
                              mine.has(service)
                                ? `Remove ${service} from your services`
                                : `I have ${service}`
                            }
                          >
                            {mine.has(service) ? '★' : '☆'}
                          </button>
                          {service}
                        </span>
                        <span className="service-count">{codes.length}</span>
                      </div>
                      <div className="countries">
                        {[...codes]
                          .sort((a, b) => Number(b.code === home) - Number(a.code === home))
                          .map(({ code, url }) =>
                            url ? (
                              <a
                                key={code}
                                className={code === home ? 'country here' : 'country'}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                title={`${COUNTRY_NAME.get(code)} — open on ${service}`}
                              >
                                {flag(code)} {code}
                              </a>
                            ) : (
                              <span
                                key={code}
                                className={code === home ? 'country here' : 'country'}
                                title={COUNTRY_NAME.get(code)}
                              >
                                {flag(code)} {code}
                              </span>
                            ),
                          )}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ))}
        </section>
      )}

      {!selected && (
        <p className="hint">
          Find out which country to point your VPN at.
          <br />
          139 countries checked in one go.
        </p>
      )}
    </div>
  );
}
