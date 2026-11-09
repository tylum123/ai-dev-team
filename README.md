# AI Dev Team

Local MVP: task → bounded context → exact-match patches → isolated quality gates → diff → manual draft PR approval.

## Run

Node.js 22+, Git. No npm packages required.

```powershell
cd "C:\Users\MyPC\OneDrive\Máy tính\ai-dev-team"
npm start
```

Open http://127.0.0.1:4310. Demo uses a fixed sample, no API calls or actual validation.

## Live configuration

Copy `.env.example` to `.env` and set `OPENAI_API_KEY` and `OPENAI_MODEL`.
Optional `OPENAI_MODEL_FAST` and `OPENAI_MODEL_STRONG` override the default for simple/complex tasks. Use model IDs available to your account that support Responses API JSON output.

Start Docker Desktop and prepare `docker pull node:22-alpine`. Live clones an HTTPS GitHub repository into `.data/` and runs scripts offline inside Docker. The default image supports dependency-free Node repositories. Repositories requiring npm packages need a separately prepared compatible image; the MVP does not install dependencies or enable container network access. Git and `gh` authentication are needed for private repositories and draft PR creation.

`MODEL_PRICES_JSON` optionally maps model IDs to USD per million tokens, e.g. `{"your-model":{"input":1,"cached":0.1,"output":4}}`. These numbers are illustrative, not provider prices. Unknown prices display as unknown. Cache counts come from provider usage, not a guaranteed cache hit.

## Checks

`npm run build` creates a static Vercel dashboard in `dist/`. This online version runs Demo entirely in browser memory (no AI requests, server storage, repository edits or PR publishing). Live remains available through `npm start` on a machine with Docker. The Vercel build disables Live and explicitly labels simulated output. Never configure API keys in static assets.

Deploy with Vercel using the included `vercel.json`, or import the Git repository. No database, paid AI calls or worker is provisioned by this build. Hosting usage remains subject to your Vercel plan. Linux worker setup is documented in [deploy/README.md](deploy/README.md).

```powershell
npm test
node --check server.js
node --check core.js
node --check workflow.js
node --check runner.js
node --check public/app.js
```

Tests use `node:test`, temporary Git repositories and mocked API/container execution. They do not prove real API access, Docker execution or GitHub publishing.

## Implementation

- `workflow.js`: path map, filename ranking, direct-import discovery, bounded retrieval, patch validation, routing, on-demand skills.
- `runner.js`: optional Planner/Reviewer, two edit rounds, quality gates and per-call usage/cost telemetry.
- `core.js`: process execution, paths, Responses API adapter.
- `server.js`, `public/`: loopback API, saved tasks and dashboard.
- `skills/`, `docs/`: focused instructions and architecture decisions.

`AGENTS.md` is preserved as requested; its initial scaffold inventory predates the completed dashboard and tests. This README describes the current state.

See [architecture and limits](docs/architecture.md). Nothing automatically merges a PR.
