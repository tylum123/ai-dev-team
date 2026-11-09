# Repository Guidelines

## Project Structure & Module Organization

This project is an early Node.js application using native APIs and ES modules, with no external dependencies.

- `server.js`: HTTP routes, task persistence, agent orchestration, Docker tests, and draft PR creation.
- `core.js`: subprocess execution, repository validation, file safeguards, context collection, and AI requests.
- `public/`: reserved for `index.html`, `app.js`, and `style.css`; currently empty, so the dashboard is unfinished.
- `test/`: reserved for automated tests; currently empty.
- `.data/`: generated task history, cloned workspaces, and PR descriptions; ignored by Git.

## Build, Test, and Development Commands

Run commands from `ai-dev-team/` with Node.js 22 or newer:

- `npm start`: start the local server at `http://127.0.0.1:4310`, loading `.env` when present.
- `npm test`: run Node's built-in test runner. An empty suite does not verify functionality.
- `node --check server.js` and `node --check core.js`: validate JavaScript syntax.
- `docker pull node:22-alpine`: prepare the default image for live task tests.

There is no build step, formatter, or lint command configured.

## Coding Style & Naming Conventions

Use ES module imports, `node:` prefixes for built-ins, camelCase identifiers, and descriptive function names. For new or expanded code, use two-space indentation, semicolons, and readable multiline blocks rather than copying the compressed scaffold. Preserve UTF-8 Vietnamese user-facing messages. Avoid unrelated formatting changes.

## Testing Guidelines

Add `test/*.test.js` using `node:test` and `node:assert/strict`. Prioritize path traversal and symlink rejection, repository URL validation, task transitions, and failure handling. Mock AI, GitHub, and subprocess boundaries for routine tests. No coverage threshold is configured; document checks performed and remaining gaps.

## Commit & Pull Request Guidelines

No project-local Git history is available to establish conventions. Use concise imperative subjects, such as `Add task validation tests`. Keep commits focused. PRs should describe behavior changes, reference relevant issues, list validation results, and include screenshots for UI changes. Do not claim simulated tests passed as real execution.

## Security & Configuration

Copy `.env.example` to `.env`; configure `OPENAI_API_KEY` and `OPENAI_MODEL` for live mode. Never commit secrets or `.data/`. Preserve loopback binding, origin checks, file safeguards, and Docker isolation. Live tests currently run offline without installing dependencies. Publishing requires authenticated Git/GitHub CLI access and explicit user initiation; retain draft PR behavior.
