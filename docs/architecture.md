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

Current retrieval ranks paths and locally searches content in at most 200 safe tracked files, with a scan budget of approximately 2 million characters, before following direct imports. This bounded search can miss matches outside the scan window; it is not an AST symbol/dependency index. Source sent to the model still respects the 10-file and 32,000-character limits. There is no vector database or knowledge graph. Next steps: symbol indexing, measured routing evaluations and aggregate success/cost-per-completed-task metrics; then dependency-prepared sandboxes, resilient publishing and multi-user job storage. Next.js/NestJS/PostgreSQL/Redis migration is deferred until the core workflow is proven.

To evaluate retrieval and routing, record a baseline on the same representative tasks and repository revisions, then compare successful tasks, input/output/cached tokens, elapsed time and total cost per completed task. Include tasks where the relevant function name does not appear in the filename, plus security and multi-file cases. Inspect diffs and real test results; mocked tests and a smaller prompt alone do not establish savings or correctness. API and Docker runs may incur costs, so use an explicit budget and configured prices. Failed or unknown-cost calls must remain visible in the results.

`MAX_TASK_COST_USD` optionally stops a task once its recorded estimated cost reaches the limit. Set `MODEL_PRICES_JSON` for the selected model or the task fails before cloning. The check occurs after each response: a single call can exceed the limit, and failed network calls can incur unknown charges. The provider's billing remains authoritative; this is not a hard spending cap.

The server processes one task at a time and marks interrupted runs on restart. Publishing failures can leave a remote branch; inspect GitHub before retrying manually. Live API, Docker and GitHub integration require a separate configured end-to-end check.

Task cancellation is cooperative and saved as `cancelling` until the current API call, subprocess, or gate returns. No new AI call starts after cancellation is observed; an already running command is not immediately terminated. Hosted Demo does not support cancellation. Sensitive authentication, security, payment and data tasks require review even if simple mode was selected; keyword routing is imperfect and does not replace human review. Docker unavailability is distinguished from test failures where recognizable and does not cause another AI edit round.

Local provider settings support Responses or OpenAI-compatible Chat Completions. The key is stored as plaintext in ignored `.data/provider.json`, never returned by the settings endpoint, and used only for the configured endpoint. Re-enter the key when changing the URL. Redirects are rejected. The host is local-only and settings changes are blocked during an active task. This is a single-user design, not a shared service or encrypted credential vault; selected source and task data are sent to the chosen provider. Provider features and response formats vary, so real integration requires testing the chosen endpoint.
