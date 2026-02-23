# AGENTS.md — calendly-cli-openclaw-skill

## Scope
This repo wraps Calendly capabilities for OpenClaw via a generated CLI + targeted custom command logic.

## Branch / PR Rules
- Default branch: `main`.
- One issue per PR branch.
- PR body must include issue linkage: `Closes #N` / `Fixes #N` / `Resolves #N`.
- Do not mark work "done" until PR is merged and issue state verified.

## Required PR Quality Gate
1. Run tests and command help checks.
2. Run `codex review --base main`.
3. Fix all P0/P1/P2 findings.
4. Re-run tests/review as needed.
5. Merge only when clean.

## Calendly Live Validation Policy
For new/changed Calendly commands, run live API smoke tests before merge whenever safe.
- Use `CALENDLY_API_KEY` from env.
- Prefer non-destructive checks first (`list*`, `get*`, availability queries).
- For destructive/scheduling E2E tests, use synthetic test identities and immediately clean up (cancel test events).

## Safety / Secrets
- Never hardcode API keys, IDs, or personal data.
- Use environment variables and placeholders in docs/examples.
- Keep error messages informative but safe (no token leakage).

## Compatibility Policy
- Preserve existing command aliases unless intentionally deprecated.
- If behavior changes, update README + SKILL docs in the same PR.

## Implementation Notes
- Follow existing pattern: MCP-first execution with REST fallback where applicable.
- Keep validation in dedicated `src/*` helpers with focused unit tests.
- Prefer additive changes over breaking changes.

## Minimum Verification Commands
- `bun test`
- `./calendly --help`
- `./calendly <changed-command> --help`
- live API smoke test for changed command(s)
