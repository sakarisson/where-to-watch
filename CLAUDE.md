# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal, backend-free React + Vite + TypeScript app that answers one question: in which countries (and on which services) is a given movie or show streamable — i.e. where to point a VPN. Deployed as a static site to GitHub Pages via `.github/workflows/deploy.yml`.

## Commands

- `npm run dev` — dev server
- `npm run build` — type-check and build to `dist/`
- `npm run preview` — serve the production build locally
- `npm run lint` — ESLint

There are no tests.

## Architecture

The browser talks directly to JustWatch's unofficial GraphQL API (`apis.justwatch.com/graphql`) — no auth, CORS is open, so there is no server component at all.

- `src/api.ts` — the only data layer: title search, plus one GraphQL query that fetches offers for every country at once using per-country field aliases.
- `src/countries.ts` — generated list of all JustWatch-supported countries (from `apis.justwatch.com/content/locales/state`); regenerate from that endpoint rather than editing by hand.
- `src/App.tsx` — the whole UI.

The API is unofficial and may change without notice. If queries break, check https://github.com/Electronic-Mango/simple-justwatch-python-api for the current query shapes.
