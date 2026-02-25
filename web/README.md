# Project Cairo Dashboard

Web dashboard for the SB Manifest Bot. Browse games, view DLC statistics, download manifests, and manage game files — all from the browser.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
copy .env.local.example .env.local
# Then edit .env.local with your GitHub token

# 3. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | ✅ | GitHub PAT with read access to `SB_manifest_DB` |
| `GITHUB_REPO_OWNER` | ✅ | Repository owner (default: `SPIN0ZAi`) |
| `GITHUB_REPO_NAME` | ✅ | Repository name (default: `SB_manifest_DB`) |
| `API_SECRET_KEY` | Optional | Secret for protecting mutation API endpoints |

## Deploy to Vercel

1. Push this code to a GitHub repository
2. Import the `web/` directory in [Vercel](https://vercel.com/new)
3. Set the **Root Directory** to `web`
4. Add environment variables in Vercel's dashboard
5. Deploy!

## Project Structure

```
web/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Home (stats overview + search)
│   │   ├── layout.tsx          # Root layout with Navbar
│   │   ├── globals.css         # Global styles + Tailwind
│   │   ├── app/[appid]/        # Game detail page
│   │   ├── search/             # Search results page
│   │   ├── stats/              # DLC statistics dashboard
│   │   └── api/                # API routes (serverless)
│   │       ├── app/[appid]/    # GET game data, POST regenerate/sync, GET download
│   │       ├── search/         # GET search
│   │       └── stats/overview/ # GET aggregate stats
│   ├── components/             # React components
│   │   ├── Navbar.tsx
│   │   ├── SearchBar.tsx
│   │   ├── GameCard.tsx
│   │   └── StatsCard.tsx
│   └── lib/                    # Server-side utilities
│       ├── github.ts           # Octokit GitHub API client
│       ├── steam.ts            # Steam Store API client
│       ├── manifest-parser.ts  # Parse depot JSON, compute DLC stats
│       └── types.ts            # TypeScript interfaces
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── next.config.js
└── .env.local.example
```

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/app/[appid]` | Full game data (depots, manifest, stats) |
| `POST` | `/api/app/[appid]/regenerate` | Trigger manifest regeneration |
| `POST` | `/api/app/[appid]/sync` | Force GitHub branch sync |
| `GET` | `/api/app/[appid]/download` | Download branch files as ZIP |
| `GET` | `/api/stats/overview` | Aggregate statistics |
| `GET` | `/api/search?q=...` | Search by AppID or name |
