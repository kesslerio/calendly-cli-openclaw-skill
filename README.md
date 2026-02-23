# Calendly Moltbot Skill

Moltbot skill for Calendly integration. List events, check availability, manage meetings via the Calendly API.

## Features

- **User Info**: Get authenticated user details
- **Event Management**: List, view, schedule, reschedule, and cancel events
- **Invitee Management**: View event invitees
- **Organization**: List organization memberships

> **Note:** This CLI includes `schedule-event` and `reschedule-event` with strict validation and MCP-first execution. If the MCP tool is unavailable, each command safely falls back to Calendly REST.

## Installation

```bash
# Clone the repo
git clone https://github.com/kesslerio/calendly-moltbot-skill.git
cd calendly-moltbot-skill

# The CLI is self-contained (generated via mcporter from MCP server)
chmod +x calendly
```

## Configuration

Add your Calendly Personal Access Token to your environment:

```bash
export CALENDLY_API_KEY="your-pat-token"
```

Get your token from: https://calendly.com/integrations/api_webhooks

## Usage

### Get Your Profile

```bash
./calendly get-current-user
```

### List Events

```bash
./calendly list-events \
  --user-uri "<YOUR_USER_URI>" \
  --min-start-time "2026-01-20T00:00:00Z" \
  --max-start-time "2026-01-27T23:59:59Z"
```

### List Events with Invitees (Single Call)

```bash
./calendly list-events --status active --include-invitees
```

This command first fetches events with Calendly `expand=invitees`. When Calendly reports `invitees_counter.active > 0` but embedded `invitees` are missing/empty, CLI falls back to `scheduled_events/{event_uuid}/invitees` for those events.
Fallback controls:
- `--hydrate-invitees <true|false>`: enable/disable fallback (default: `true` on include-invitees path)
- `--max-invitee-fetches <number>`: hard cap for fallback invitee fetch calls (default: `25`)

Response metadata includes `meta.invitee_hydration` with fallback usage and truncation signals such as `truncated`, `events_skipped_due_to_cap`, and `truncation_reason`.
Backward-compatible alias still works: `./calendly list-events-with-invitees --status active`.

Date-range validation rules for `list-events`, `list-events-with-invitees`, `search-invitees`, and `search-team`:
- `--min-start-time` and `--max-start-time` must be ISO-8601 timestamps (example: `2026-01-20T00:00:00Z`)
- when both are set, `min-start-time` must be less than or equal to `max-start-time`
- validation is identical for normal flags and `--raw` JSON input

### Search Invitees by Email

```bash
./calendly search-invitees --email "person@example.com" --organization-uri "<YOUR_ORG_URI>"
```

Supports pagination with `--page-size` and `--max-pages` for large orgs.

### Search Team Calendars by Invitee Email

```bash
./calendly search-team --email "person@example.com" --organization-uri "<YOUR_ORG_URI>" --count 25 --max-membership-pages 10
```

This command resolves team members from organization memberships, scans each member's events in bounded pages, and returns matching events with member context.
`--max-membership-pages` defaults to `10`; if more data exists than the configured scan limits allow, output meta includes `has_more: true` and a `truncation_reason`.

### Batch Invitee Lookup by Event URI

```bash
./calendly batch-event-invitees \
  --event-uri "https://api.calendly.com/scheduled_events/<EVENT_UUID_1>" \
  --event-uri "https://api.calendly.com/scheduled_events/<EVENT_UUID_2>" \
  --max-invitee-fetches 25
```

Supports repeated `--event-uri` flags plus `--raw` JSON (`event_uri` or `event_uris`), dedupes duplicate URIs in stable order, and returns normalized output:
- `collection`: one entry per requested event URI, with per-event `error` when lookup fails
- `meta.requested`: number of deduped input event URIs
- `meta.processed`: successful events
- `meta.failed`: failed events
- `meta.truncated`: `true` when the global fetch cap prevented full completion

### Get Event Type Availability

```bash
./calendly get-event-type-availability \
  --event-type-uri "https://api.calendly.com/event_types/<EVENT_TYPE_UUID>" \
  --start-time "2026-03-01T00:00:00Z" \
  --end-time "2026-03-02T00:00:00Z" \
  --timezone "America/New_York" \
  -o json
```

Validation rules:
- `--event-type-uri`, `--start-time`, and `--end-time` are required (also enforced for `--raw` JSON).
- `--start-time`/`--end-time` must be ISO-8601 timestamps.
- `start-time` must be less than or equal to `end-time`.
- availability window must be 7 days or less.
- `--timezone` is optional and must be a valid IANA timezone.

### List Event Types

```bash
./calendly list-event-types \
  --organization-uri "https://api.calendly.com/organizations/<ORG_UUID>" \
  --count 20 \
  -o json
```

Validation rules:
- at least one scope is required: `--user-uri` or `--organization-uri` (same in `--raw` mode)
- `--count` is optional; when set, it must be an integer between 1 and 100

### Get Event Type Details

```bash
./calendly get-event-type \
  --event-type-uri "https://api.calendly.com/event_types/<EVENT_TYPE_UUID>" \
  -o json
```

Validation rules:
- `--event-type-uri` is required (also enforced for `--raw` JSON).

### Schedule Event

```bash
./calendly schedule-event \
  --event-type "https://api.calendly.com/event_types/<EVENT_TYPE_UUID>" \
  --start-time "2099-03-01T15:00:00Z" \
  --invitee-email "invitee@example.com" \
  --invitee-name "Invitee Name" \
  --invitee-timezone "America/New_York" \
  --questions '{"Company":"Acme"}' \
  -o json
```

Validation rules:
- required args match upstream `calendly-mcp-server` scheduling branch signature: `event_type`, `start_time`, `invitee_email`, `invitee_timezone`
- `--start-time` must be ISO-8601 and in the future
- `--event-type` must be a Calendly event type URI
- `--invitee-email` and optional `--event-guest` values must be valid emails
- `--invitee-timezone` must be a valid IANA timezone
- use either `--invitee-name` or `--invitee-first-name`/`--invitee-last-name`, not both
- `--questions-and-answers` / `--questions` must be valid JSON object/array

Optional scheduling fields:
- `--invitee-phone` (E.164)
- `--location-kind` and `--location-details`
- repeated `--event-guest` (up to 10)
- `--utm-source`, `--utm-campaign`, `--utm-medium`

Response includes normalized booking details when available:
- `resource.event_uuid`
- `resource.meeting_link`
- `resource.add_to_calendar_links`
- `resource.status`

### Reschedule Event

```bash
./calendly reschedule-event \
  --event-uuid "<EVENT_UUID>" \
  --new-start-time "2099-03-02T16:00:00Z" \
  --reason "Conflict with another meeting" \
  -o json
```

Alternative identifier inputs:
- `--event-uri "https://api.calendly.com/scheduled_events/<EVENT_UUID>"`
- `--invitee-uuid "<INVITEE_UUID>"` or `--invitee-uri "https://api.calendly.com/invitees/<INVITEE_UUID>"`
- `--reschedule-url "https://calendly.com/reschedulings/<INVITEE_UUID>?..."`

Validation and behavior:
- requires at least one identifier source: event UUID/URI, invitee UUID/URI, or reschedule URL
- `--new-start-time` is required, must be ISO-8601, and must be in the future
- `--new-end-time` is optional; when omitted, CLI derives it from the existing event duration
- `--event-type` is optional; when omitted, CLI derives it from the existing event
- `--reason` is optional and capped to 1000 characters

Response includes normalized reschedule details when available:
- `resource.event_uuid`
- `resource.previous_event_uuid`
- `resource.invitee_uuid`
- `resource.new_start_time`
- `resource.new_end_time`

### Get Event Details

```bash
./calendly get-event --event-uuid "<EVENT_UUID>"
```

### Cancel Event

```bash
./calendly cancel-event --event-uuid "<EVENT_UUID>" --reason "Rescheduling needed"
```

### Webhook Subscriptions

```bash
# Create
./calendly create-webhook-subscription \
  --url "https://example.com/calendly/webhooks" \
  --events "invitee.created,invitee.canceled" \
  --organization-uri "https://api.calendly.com/organizations/<ORG_UUID>" \
  --scope organization \
  --signing-key "$CALENDLY_WEBHOOK_SIGNING_KEY"

# List
./calendly list-webhook-subscriptions \
  --organization-uri "https://api.calendly.com/organizations/<ORG_UUID>"

# Get
./calendly get-webhook-subscription \
  --webhook-subscription-uri "https://api.calendly.com/webhook_subscriptions/<SUBSCRIPTION_UUID>"

# Delete
./calendly delete-webhook-subscription \
  --webhook-subscription-uri "https://api.calendly.com/webhook_subscriptions/<SUBSCRIPTION_UUID>"
```

Store webhook secrets in env vars and verify signatures in your receiver:

```bash
export CALENDLY_WEBHOOK_SIGNING_KEY="<long-random-secret>"
```

Signing secret handling guidance:
- Treat `CALENDLY_WEBHOOK_SIGNING_KEY` as sensitive credential material and keep it out of git.
- Inject it at runtime from your secret manager (or secure environment), not from hardcoded files.
- Rotate the key if leaked and recreate affected subscriptions with the new key.
- If you set `--scope user`, also pass `--user-uri "https://api.calendly.com/users/<USER_UUID>"`.

### Event Management

- `get-current-user` - Get authenticated user details
- `list-events` - List scheduled events (`--include-invitees` for expand + bounded fallback invitee hydration)
- `list-events-with-invitees` - Compatibility alias for include-invitees path
- `get-event` - Get event details
- `list-event-types` - List available event types for scheduling (requires at least one of `--user-uri` or `--organization-uri`)
- `get-event-type` - Get details for a specific event type (requires `--event-type-uri`)
- `get-event-type-availability` - Get available time slots for a specific event type
- `schedule-event` - Schedule a meeting for an invitee on an organizer's event type
- `reschedule-event` - Reschedule an existing scheduled event to a new start time
- `cancel-event` - Cancel an event
- `list-event-invitees` - List invitees for a specific event
- `search-invitees` - Search events by invitee email across paginated results
- `search-team` - Search invitee email across team member calendars
- `batch-event-invitees` - Batch lookup invitees for multiple scheduled event URIs
- `list-organization-memberships` - List organization memberships

### OAuth
- `get-oauth-url` - Generate OAuth authorization URL
- `exchange-code-for-tokens` - Exchange authorization code for tokens
- `refresh-access-token` - Refresh access token

## Integration with Moltbot

Add to your Moltbot skills configuration:

```bash
# Copy or symlink to your Moltbot skills directory
ln -s $(pwd) /path/to/your/moltbot/skills/calendly

# Or add to your moltbot.json config:
{
  "skills": [
    {
      "name": "calendly",
      "path": "/path/to/calendly-moltbot-skill"
    }
  ]
}
```

Then use in conversations:
- "What meetings do I have?"
- "Cancel my 2pm meeting"
- "Who's attending my next call?"

## Scheduling Notes

- `schedule-event` requires a paid Calendly plan (Standard or higher). Free plans receive `403`.
- `reschedule-event` requires paid-plan API access and can fail with clear messages for invalid identifiers, unavailable target slots, or payload validation.
- Safe error messages are returned for common failures: invalid event type, unavailable slot, custom question validation, and plan restrictions.
- For the most reliable bookings, fetch slots first via `get-event-type-availability` and then schedule exactly one returned `start_time`.

## Development

This skill wraps the [calendly-mcp-server](https://github.com/meAmitPatil/calendly-mcp-server) MCP server via [mcporter](https://github.com/steipete/mcporter).

To regenerate the CLI (if the upstream MCP server updates):

```bash
# Uses mcporter.json config (not tracked in git)
cat > mcporter.json <<EOF
{
  "mcpServers": {
    "calendly": {
      "command": "npx",
      "args": ["-y", "calendly-mcp-server"],
      "env": {
        "CALENDLY_API_KEY": "\${CALENDLY_API_KEY}"
      }
    }
  }
}
EOF

# Generate CLI
MCPORTER_CONFIG=./mcporter.json npx mcporter@latest generate-cli --server calendly --output calendly
```

## License

MIT

## Credits

- MCP Server: [meAmitPatil/calendly-mcp-server](https://github.com/meAmitPatil/calendly-mcp-server)
- CLI Generator: [mcporter](https://github.com/steipete/mcporter)
- Moltbot: [moltbot.io](https://moltbot.io)
