---
name: calendly
description: Calendly scheduling integration. List events, check availability, manage meetings via Calendly API.
---

# Calendly Skill

Interact with Calendly scheduling via MCP-generated CLI.

> **Note:** Scheduling API features (list-event-types, get-event-type-availability, schedule-event) will be available once calendly-mcp-server v2.0.0 is published to npm. Current CLI uses v1.0.0 for portability.

## Quick Start

```bash
# Get your Calendly profile (returns user URI)
calendly get-current-user

# List RECENT events (always use --min-start-time for recent queries!)
calendly list-events --user-uri "<YOUR_USER_URI>" --min-start-time "2026-01-20T00:00:00Z"

# Get event details
calendly get-event --event-uuid <UUID>

# Cancel an event
calendly cancel-event --event-uuid <UUID> --reason "Rescheduling needed"
```

## Available Commands

### User Info
- `get-current-user` - Get authenticated user details

### Events
- `list-events` - List scheduled events (requires --user-uri); add `--include-invitees` for expand + bounded fallback invitee hydration
- `list-events-with-invitees` - Compatibility alias for include-invitees path
- `get-event` - Get event details (requires --event-uuid)
- `cancel-event` - Cancel an event (requires --event-uuid, optional --reason)

### Invitees
- `list-event-invitees` - List invitees for an event (requires --event-uuid)
- `search-invitees` - Search events by invitee email across paginated results

### Organization
- `list-organization-memberships` - List organization memberships

### Webhooks
- `list-webhook-subscriptions` - List webhook subscriptions
- `get-webhook-subscription` - Get webhook subscription details
- `create-webhook-subscription` - Create webhook subscription
- `delete-webhook-subscription` - Delete webhook subscription

## Configuration

API key can be stored in your environment or `.env` file:
```bash
export CALENDLY_API_KEY="<your-pat-token>"
# Or in ~/.moltbot/.env or ~/.clawdbot/.env
```

Get your Personal Access Token from: https://calendly.com/integrations/api_webhooks

## Usage in Moltbot

When user asks about:
- "What meetings do I have?" → `list-events` with `--min-start-time` (use recent date!)
- "Show me all demos this week with who booked them" → `list-events --include-invitees` (expand first; fallback hydrate only when needed)
- "Cancel my 2pm meeting" → Find with `list-events` (time-filtered), then `cancel-event`
- "Who's attending X meeting?" → `list-events --include-invitees` (with fallback) or `list-event-invitees`

**Note:** First time, run `calendly get-current-user` to obtain your User URI.

## Getting Your User URI

Run `calendly get-current-user` to get your user URI. Example:
```json
{
  "resource": {
    "uri": "https://api.calendly.com/users/<YOUR_USER_UUID>",
    "scheduling_url": "https://calendly.com/<your-username>"
  }
}
```

## Examples

```bash
# List next 10 events
calendly list-events \
  --user-uri "<YOUR_USER_URI>" \
  -o json | jq .

# List events with invitees (expand first, then fallback hydrate if needed)
calendly list-events \
  --user-uri "<YOUR_USER_URI>" \
  --include-invitees \
  --max-invitee-fetches 25 \
  --status active

# Get event details
calendly get-event \
  --event-uuid "<EVENT_UUID>" \
  -o json

# Cancel with reason
calendly cancel-event \
  --event-uuid "<EVENT_UUID>" \
  --reason "Rescheduling due to conflict"

# Create webhook subscription (with signing key)
calendly create-webhook-subscription \
  --url "https://example.com/calendly/webhooks" \
  --events "invitee.created,invitee.canceled" \
  --organization-uri "https://api.calendly.com/organizations/<ORG_UUID>" \
  --scope organization \
  --signing-key "$CALENDLY_WEBHOOK_SIGNING_KEY"

# List webhook subscriptions
calendly list-webhook-subscriptions \
  --organization-uri "https://api.calendly.com/organizations/<ORG_UUID>"

# Get webhook subscription details
calendly get-webhook-subscription \
  --webhook-subscription-uri "https://api.calendly.com/webhook_subscriptions/<SUBSCRIPTION_UUID>"

# Delete webhook subscription
calendly delete-webhook-subscription \
  --webhook-subscription-uri "https://api.calendly.com/webhook_subscriptions/<SUBSCRIPTION_UUID>"
```

Webhook signing secret guidance:
- Keep `CALENDLY_WEBHOOK_SIGNING_KEY` in secure runtime config (env/secret manager), never committed.
- Use a long random value and rotate it if exposed.
- Verify Calendly webhook signatures in your receiver with the same secret used at subscription creation.
- If using `--scope user`, include `--user-uri "https://api.calendly.com/users/<USER_UUID>"`.

## Coming Soon: Scheduling API (v2.0)

Once calendly-mcp-server v2.0.0 is published, these commands will be available:

### Scheduling Workflow
```bash
# 1. List available event types
calendly list-event-types

# 2. Check availability for a specific event type
calendly get-event-type-availability --event-type "<EVENT_TYPE_URI>"

# 3. Schedule a meeting (requires paid Calendly plan)
calendly schedule-event \
  --event-type "<EVENT_TYPE_URI>" \
  --start-time "2026-01-25T19:00:00Z" \
  --invitee-email "client@company.com" \
  --invitee-name "John Smith" \
  --invitee-timezone "America/New_York"
```

**Scheduling API Requirements:**
- calendly-mcp-server v2.0.0+ (unreleased as of 2026-01-21)
- Paid Calendly plan (Standard or higher)

To upgrade when v2.0 is published:
```bash
cd ~/clawd/skills/calendly
MCPORTER_CONFIG=./mcporter.json npx mcporter@latest generate-cli --server calendly --output calendly
```

## Important: Time Filtering

**Always use `--min-start-time` when querying recent events!**

The API returns events oldest-first by default and doesn't support pagination via CLI. Without a time filter, you'll get events from years ago.

For invitees with events, use `list-events --include-invitees`. It uses `expand=invitees` first and only falls back per event when `invitees_counter.active > 0` but embedded invitees are missing.
Control fallback cost with:
- `--hydrate-invitees <true|false>` (default `true` for include-invitees path)
- `--max-invitee-fetches <number>` (default `25`)

When capped, output metadata includes `meta.invitee_hydration.truncated` and `truncation_reason`.

```bash
# Last 7 days
calendly list-events --user-uri "<URI>" --min-start-time "$(date -u -d '7 days ago' +%Y-%m-%dT00:00:00Z)"

# This week with invitees (expand first; bounded fallback)
calendly list-events \
  --user-uri "<URI>" \
  --include-invitees \
  --max-invitee-fetches 25 \
  --min-start-time "2026-01-20T00:00:00Z" \
  --max-start-time "2026-01-27T23:59:59Z"

# Future events only
calendly list-events --user-uri "<URI>" --min-start-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## Notes

- All times in API responses are UTC (convert to Pacific for display)
- Event UUIDs are found in `list-events` output
- OAuth tools available but not needed with Personal Access Token
- No pagination support in CLI - use time filters instead

---

**Generated:** 2026-01-20  
**Updated:** 2026-02-22 (Webhook lifecycle guidance + invitee hydration fallback controls)
**Source:** meAmitPatil/calendly-mcp-server via mcporter
