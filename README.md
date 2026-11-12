# The Exchange Realms

A medieval-fantasy visualization of the Vietnamese stock market (HOSE only). Presentation layer over real
financial data. Not a trading product and not investment advice. Project cost target: $0.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Drizzle ORM · Neon Postgres (free) · Vitest · Vercel Hobby.

## Local development

```bash
npm install
cp .env.example .env.local     # then fill in values yourself; never paste secrets into chat
npm run dev                    # http://localhost:3000
```

### Scripts

| Script                                    | Purpose                                           |
| ----------------------------------------- | ------------------------------------------------- |
| `npm run dev`                             | Start the dev server                              |
| `npm run build` / `npm start`             | Production build / serve                          |
| `npm run typecheck`                       | TypeScript check, no emit                         |
| `npm run lint`                            | ESLint                                            |
| `npm test`                                | Vitest unit tests                                 |
| `npm run format` / `npm run format:check` | Prettier                                          |
| `npm run db:generate` / `db:migrate`      | Drizzle migrations (uses `DATABASE_URL_UNPOOLED`) |

### Environment variables

See `.env.example`. `.env.local` is git-ignored. Secrets are read only on the server through
`src/lib/env.ts` and must never reach client code, logs or the repository.

## Project structure

```
src/app/          Next.js routes and layout
src/lib/env.ts    Server-only env access (tested)
src/lib/db/       Drizzle client and schema
docs/             PRD, architecture, decisions, progress, user actions, test results
drizzle/          Generated migrations
```

## Rules that apply to every change

- Cost stays $0. Never add paid services, trials or card entry.
- Never invent financial data. Missing values display as "Chưa có dữ liệu".
- Visual decisions belong to the owner (see `docs/DECISIONS.md`).
