# Workflow and engineering decisions

## Acceptance criteria

Only selected files and direct local imports enter Coder context (10 files, 32,000 characters). Planner sees at most 200 paths; Reviewer sees the diff and gate results. Each request is bounded to 60,000 serialized characters and 5,000 output tokens. Character bounds are deterministic approximations, not exact input token counts.

Existing-file edits require an exact, unique search match and prior context access. Validate all patches before writing. Reject traversal, Windows special paths, symlinks, credentials, lockfiles and AGENTS.md edits. Manifest dependency and script changes require manual editing. This reduces scope but is not a proof that generated code or tests are correct.

Simple tasks use Coder and deterministic gates; complex tasks add Planner and Reviewer. Routing is a keyword heuristic with a dashboard override, not a measured classifier. Reviewer runs only after gates pass. Stop after two edit rounds and six total AI calls. Each task has a separate branch and workspace. Only explicit approval pushes a branch and creates a draft PR; no automatic merge.

## Validation

Discover `format:check`, `lint`, `typecheck`, `test`, `build` in the target package.json. Run configured scripts with Docker timeout, no network, read-only source, limited memory/CPU/processes and no added capabilities. Missing scripts are skipped, never passed. A passing test script is mandatory before approval. Detect common zero-test output; arbitrary custom test commands cannot be fully classified. Inspect actual logs and diff.

This JavaScript MVP has Node syntax checks and node:test. It has no ESLint, TypeScript or formatter dependencies. Target repositories can supply those scripts. Never describe unconfigured checks as successful.

## Telemetry and remaining stages

Record input, output, cached tokens, model, role, round and latency per successful API response, including invalid JSON output. HTTP/network failures may have unknown billable usage. Costs require explicit per-model prices; provider billing is authoritative. Responses usage reference: https://developers.openai.com/api/docs/guides/prompt-caching

Current retrieval uses paths and direct-import regexes, not an AST symbol/dependency index. There is no vector database or knowledge graph. Next steps: symbol indexing, measured routing evaluations and aggregate success/cost-per-completed-task metrics; then dependency-prepared sandboxes, resilient publishing and multi-user job storage. Next.js/NestJS/PostgreSQL/Redis migration is deferred until the core workflow is proven.

The server processes one task at a time and marks interrupted runs on restart. Publishing failures can leave a remote branch; inspect GitHub before retrying manually. Live API, Docker and GitHub integration require a separate configured end-to-end check.
