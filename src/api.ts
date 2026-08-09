import { COUNTRIES } from './countries';

// JustWatch only returns CORS headers to *.justwatch.com, to localhost, and to
// the opaque "null" origin, so a page served from GitHub Pages cannot call the
// API directly. A sandboxed iframe (no allow-same-origin) has that null origin,
// so requests are relayed through public/jw-proxy.html over postMessage.
const PROXY_PATH = 'jw-proxy.html';
const PROXY_LOAD_TIMEOUT_MS = 15_000;

let proxy: Promise<Window> | null = null;

function loadProxy(): Promise<Window> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.src = new URL(PROXY_PATH, document.baseURI).href;

    const timer = setTimeout(() => {
      done();
      frame.remove();
      reject(new Error('Timed out loading the JustWatch proxy'));
    }, PROXY_LOAD_TIMEOUT_MS);

    function done() {
      clearTimeout(timer);
      removeEventListener('message', onReady);
    }

    function onReady(event: MessageEvent) {
      if (event.source !== frame.contentWindow || !event.data?.ready) return;
      done();
      resolve(frame.contentWindow as Window);
    }

    // Listen before appending, so a fast-loading frame cannot beat us to it.
    addEventListener('message', onReady);
    document.body.append(frame);
  });
}

function proxyWindow(): Promise<Window> {
  proxy ??= loadProxy().catch((err: unknown) => {
    proxy = null; // let the next search retry rather than caching the failure
    throw err;
  });
  return proxy;
}

interface ProxyReply {
  id: number;
  status?: number;
  text?: string;
  error?: string;
}

interface GqlResponse<T> {
  data: T;
  errors?: { message: string }[];
}

let lastRequestId = 0;

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const frame = await proxyWindow();
  const id = ++lastRequestId;

  const json = await new Promise<GqlResponse<T>>((resolve, reject) => {
    function onMessage(event: MessageEvent<ProxyReply>) {
      if (event.source !== frame || event.data?.id !== id) return;
      removeEventListener('message', onMessage);

      const { status, text, error } = event.data;
      if (error) return reject(new Error(error));
      if (status === undefined || status < 200 || status >= 300) {
        return reject(new Error(`JustWatch API returned ${status}`));
      }
      try {
        resolve(JSON.parse(text ?? '') as GqlResponse<T>);
      } catch {
        reject(new Error('JustWatch returned a malformed response'));
      }
    }

    addEventListener('message', onMessage);
    // The frame's origin is opaque, so "*" is the only possible target.
    frame.postMessage({ id, body: JSON.stringify({ query, variables }) }, '*');
  });

  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export interface SearchResult {
  id: string;
  title: string;
  year: number | null;
  type: 'MOVIE' | 'SHOW';
  posterUrl: string | null;
}

const SEARCH_QUERY = `
query Search($q: String!) {
  popularTitles(country: US, first: 8, filter: { searchQuery: $q }) {
    edges {
      node {
        id
        objectType
        content(country: US, language: "en") {
          title
          originalReleaseYear
          posterUrl
        }
      }
    }
  }
}`;

interface SearchResponse {
  popularTitles: {
    edges: {
      node: {
        id: string;
        objectType: 'MOVIE' | 'SHOW';
        content: {
          title: string;
          originalReleaseYear: number | null;
          posterUrl: string | null;
        };
      };
    }[];
  };
}

export async function searchTitles(q: string): Promise<SearchResult[]> {
  const data = await gql<SearchResponse>(SEARCH_QUERY, { q });
  return data.popularTitles.edges.map(({ node }) => ({
    id: node.id,
    title: node.content.title,
    year: node.content.originalReleaseYear,
    type: node.objectType,
    posterUrl: node.content.posterUrl
      ? 'https://images.justwatch.com' +
        node.content.posterUrl.replace('{profile}', 's166').replace('{format}', 'webp')
      : null,
  }));
}

// One aliased offers field per country, so a single request covers all of them.
const OFFERS_QUERY = `
query Offers($id: ID!) {
  node(id: $id) {
    ... on MovieOrShow {
      ${COUNTRIES.map(
        (c) =>
          `${c.code}: offers(country: ${c.code}, platform: WEB, filter: { monetizationTypes: [FLATRATE] }) { standardWebURL package { clearName } }`,
      ).join('\n      ')}
    }
  }
}`;

interface OffersResponse {
  node: Record<
    string,
    { standardWebURL: string | null; package: { clearName: string } }[]
  > | null;
}

export interface CountryOffer {
  code: string;
  url: string | null;
}

/** Map of service name -> countries where the title streams on it, with offer links. */
export async function fetchAvailability(id: string): Promise<Map<string, CountryOffer[]>> {
  const data = await gql<OffersResponse>(OFFERS_QUERY, { id });
  const byService = new Map<string, CountryOffer[]>();
  for (const { code } of COUNTRIES) {
    const urlByService = new Map<string, string | null>();
    for (const offer of data.node?.[code] ?? []) {
      const service = offer.package.clearName;
      if (!urlByService.get(service)) {
        urlByService.set(service, offer.standardWebURL);
      }
    }
    for (const [service, url] of urlByService) {
      const list = byService.get(service) ?? [];
      list.push({ code, url });
      byService.set(service, list);
    }
  }
  return new Map(
    [...byService.entries()].sort((a, b) => b[1].length - a[1].length),
  );
}
