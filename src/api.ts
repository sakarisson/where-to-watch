import { COUNTRIES } from './countries';

const API_URL = 'https://apis.justwatch.com/graphql';

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`JustWatch API returned ${res.status}`);
  const json = await res.json();
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
