import { useEffect, useRef, useState } from 'react';
import {
  fetchAvailability,
  searchTitles,
  type CountryOffer,
  type SearchResult,
} from './api';
import { COUNTRIES } from './countries';

const COUNTRY_NAME = new Map(COUNTRIES.map((c) => [c.code, c.name]));

function flag(code: string): string {
  return String.fromCodePoint(
    ...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [availability, setAvailability] = useState<Map<string, CountryOffer[]> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

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
              <ol className="services">
                {[...availability.entries()].map(([service, codes], i) => (
                  <li key={service} style={{ animationDelay: `${i * 70}ms` }}>
                    <div className="service-name">
                      {service}
                      <span className="service-count">{codes.length}</span>
                    </div>
                    <div className="countries">
                      {codes.map(({ code, url }) =>
                        url ? (
                          <a
                            key={code}
                            className="country"
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            title={`${COUNTRY_NAME.get(code)} — open on ${service}`}
                          >
                            {flag(code)} {code}
                          </a>
                        ) : (
                          <span key={code} className="country" title={COUNTRY_NAME.get(code)}>
                            {flag(code)} {code}
                          </span>
                        ),
                      )}
                    </div>
                  </li>
                ))}
              </ol>
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
