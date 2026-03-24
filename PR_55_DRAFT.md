## Summary

Closes #55

This PR continues Phase 2 modularization by extracting additional Calendly commands from `src/generated/cli.ts` into handwritten modules and routing them through the modular dispatcher.

### What changed

- Added handwritten command module:
  - `src/commands/register-list-events.ts`
    - `list-events`
    - `list-events-with-invitees`
    - preserved `include_invitees` / `expand=invitees` behavior
    - reused invitee hydration helpers from `src/list-events-invitees.ts`
- Updated dispatcher and signatures:
  - `src/commands/run-cli.ts`
    - routed `list-events` and `list-events-with-invitees`
    - added underscore alias routing compatibility (e.g. `list_events`, `schedule_event`, `cancel_event`, etc.)
    - fixed command detection when global flags come first (e.g. `./calendly -o json cancel-event ...`)
  - `src/commands/program.ts`
    - added signatures for `list-events` and `list-events-with-invitees`
- Added MCP-first + REST fallback for cancel command:
  - `src/commands/register-events-basic.ts`
    - `cancel-event` now falls back to Calendly REST `POST /scheduled_events/{event_uuid}/cancellation` when MCP runtime is unavailable
- Follow-up strict TypeScript/lint fixes:
  - `src/generated/cli.ts`
    - replaced `commandTerm` with typed `subcommandTerm(cmd: Command)` for Commander help config compatibility
    - switched Set dedupe spread to `Array.from(new Set(...))` for downlevel iteration safety
  - `src/list-events-invitees.test.ts`
    - fixed strict indexed access (`result[0]` optional chaining)
  - `src/batch-event-invitees.test.ts`
    - fixed strict indexed access (`result.collection[n]` optional chaining)
  - `src/team-events.test.ts`
    - fixed strict indexed access (`result.collection[n]` optional chaining)
  - `src/organization-memberships.ts`
    - aligned default `env` typing with `process.env` under strict TS

## Behavior/compatibility notes

- Existing command names and aliases are preserved.
- Handwritten dispatcher now properly handles command invocation even when global flags (`-o`, `-t`) appear before command name.
- `cancel-event` remains MCP-first and now reliably works without MCP runtime by falling back to REST.

## Verification

### Required local checks

- `bun test` ✅
- `./calendly --help` ✅
- `./calendly list-events --help` ✅
- `./calendly list-events-with-invitees --help` ✅
- `./calendly cancel-event --help` ✅
- `./calendly -o json cancel-event --help` ✅
- `bunx tsc --noEmit` ✅

### Live smoke checks (non-destructive + synthetic cleanup)

Using `CALENDLY_API_KEY` from `.env`:

- `list-organization-memberships` ✅
- `list-events --include-invitees` ✅
- `list-events-with-invitees` ✅
- `search-invitees` ✅
- `search-team` ✅
- `list-team-events` ✅
- `schedule-event` (synthetic) ✅
- `cancel-event` immediate cleanup ✅

### Live smoke checks re-run in this pass (non-destructive)

Using `CALENDLY_API_KEY` from `.env`:

- `./calendly -o json list-events --user-uri <MARTIN_USER_URI> --count 1` ✅
- `./calendly -o json list-events-with-invitees --user-uri <MARTIN_USER_URI> --count 1` ✅

### Review gate

- `codex review --base main` ✅
- One P1 found during this pass (helper rename mismatch in `src/generated/cli.ts`) and fixed.
- Current codex note is about patch self-containment when diffed against a specific base snapshot; ensure the PR includes all modular files (`src/commands/**` and `src/cli.ts`) in the same branch diff.

## Risks

- Minimal functional risk; changes are additive and scoped to modular routing + command extraction.
- Live smoke confirmed end-to-end scheduling + cancellation with cleanup.
