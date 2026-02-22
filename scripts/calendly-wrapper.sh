#!/usr/bin/env bash
# Compatibility wrapper for older calendly CLI command patterns
# Usage: Call this instead of direct calendly CLI
#   events list --event-type "ShapeScale Virtual Demo" --limit 5 --json
#   -> list-events with client-side filtering

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CALENDLY_BIN="$SCRIPT_DIR/../calendly"

# Check if this is a legacy command pattern
if [[ $# -ge 2 && "$1" == "events" && "$2" == "list" ]]; then
    # Legacy: calendly events list --event-type "X" --limit N --json
    event_type=""
    limit="20"
    json_mode=false
    shift 2  # skip "events list"
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --event-type)
                event_type="$2"
                shift 2
                ;;
            --limit)
                limit="$2"
                shift 2
                ;;
            --json)
                json_mode=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    # Build command (list-events doesn't support --count, handle limit client-side)
    args=("list-events" "--status" "active")
    if [[ "$json_mode" == true ]]; then
        args+=("-o" "json")
    fi
    
    output=$("$CALENDLY_BIN" "${args[@]}" 2>&1)
    
    # Filter by event type first (before limit), so limit applies to matching results
    if [[ -n "$event_type" && "$json_mode" == true ]]; then
        # Handle both array responses and object responses with collection/data
        output=$(echo "$output" | jq --arg et "$event_type" \
            'if type == "array" then [.[] | select(.name // .event.name // .event_type // "" | contains($et))] 
             elif has("collection") then (.collection // [] | [.[] | select(.name // .event.name // .event_type // "" | contains($et))])
             elif has("data") then (.data // [] | [.[] | select(.name // .event.name // .event_type // "" | contains($et))])
             else . end' 2>/dev/null || echo "$output")
    elif [[ -n "$event_type" ]]; then
        # Text mode - just grep
        echo "$output" | grep -i "$event_type" || true
        exit 0
    fi
    
    # Apply limit client-side AFTER filtering (limit applies to filtered results)
    if [[ -n "$limit" && "$json_mode" == true ]]; then
        output=$(echo "$output" | jq --argjson lim "$limit" 'if type == "array" then .[:$lim]
             elif has("collection") then .collection = (.collection[:$lim])
             elif has("data") then .data = (.data[:$lim])
             else . end' 2>/dev/null || echo "$output")
    fi
    
    echo "$output"
    exit 0
fi

if [[ $# -ge 2 && "$1" == "invitees" && "$2" == "list" ]]; then
    # Legacy: calendly invitees list --event UUID --json
    event_uuid=""
    json_mode=false
    shift 2
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --event)
                event_uuid="$2"
                shift 2
                ;;
            --json)
                json_mode=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    if [[ -z "$event_uuid" ]]; then
        echo "ERROR: --event UUID required" >&2
        exit 1
    fi
    
    args=("list-event-invitees" "--event-uuid" "$event_uuid")
    if [[ "$json_mode" == true ]]; then
        args+=("-o" "json")
    fi
    
    exec "$CALENDLY_BIN" "${args[@]}"
fi

if [[ $# -ge 2 && ( "$1" == "webhook-subscriptions" || "$1" == "webhooks" ) ]]; then
    action="$2"
    shift 2

    case "$action" in
        list)
            if [[ $# -ge 1 && ( "$1" == "--help" || "$1" == "-h" ) ]]; then
                cat <<'EOF'
Usage: webhook-subscriptions list [--organization-uri URI] [--scope user|organization] [--count N] [--json]
EOF
                exit 0
            fi

            organization_uri=""
            scope=""
            count=""
            json_mode=false

            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --organization-uri)
                        organization_uri="$2"
                        shift 2
                        ;;
                    --scope)
                        scope="$2"
                        shift 2
                        ;;
                    --count)
                        count="$2"
                        shift 2
                        ;;
                    --json)
                        json_mode=true
                        shift
                        ;;
                    *)
                        shift
                        ;;
                esac
            done

            args=("list-webhook-subscriptions")
            if [[ -n "$organization_uri" ]]; then
                args+=("--organization-uri" "$organization_uri")
            fi
            if [[ -n "$scope" ]]; then
                args+=("--scope" "$scope")
            fi
            if [[ -n "$count" ]]; then
                args+=("--count" "$count")
            fi
            if [[ "$json_mode" == true ]]; then
                args+=("-o" "json")
            fi

            exec "$CALENDLY_BIN" "${args[@]}"
            ;;
        get)
            if [[ $# -ge 1 && ( "$1" == "--help" || "$1" == "-h" ) ]]; then
                cat <<'EOF'
Usage: webhook-subscriptions get --webhook-subscription-uri URI [--json]
EOF
                exit 0
            fi

            webhook_subscription_uri=""
            json_mode=false

            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --webhook-subscription-uri)
                        webhook_subscription_uri="$2"
                        shift 2
                        ;;
                    --json)
                        json_mode=true
                        shift
                        ;;
                    *)
                        shift
                        ;;
                esac
            done

            if [[ -z "$webhook_subscription_uri" ]]; then
                echo "ERROR: --webhook-subscription-uri required" >&2
                exit 1
            fi

            args=("get-webhook-subscription" "--webhook-subscription-uri" "$webhook_subscription_uri")
            if [[ "$json_mode" == true ]]; then
                args+=("-o" "json")
            fi

            exec "$CALENDLY_BIN" "${args[@]}"
            ;;
        create)
            if [[ $# -ge 1 && ( "$1" == "--help" || "$1" == "-h" ) ]]; then
                cat <<'EOF'
Usage: webhook-subscriptions create --url URL --events EVENT1,EVENT2 --organization-uri URI [--scope user|organization] [--signing-key KEY] [--json]
EOF
                exit 0
            fi

            url=""
            events=""
            organization_uri=""
            scope=""
            signing_key=""
            json_mode=false

            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --url)
                        url="$2"
                        shift 2
                        ;;
                    --events)
                        events="$2"
                        shift 2
                        ;;
                    --organization-uri)
                        organization_uri="$2"
                        shift 2
                        ;;
                    --scope)
                        scope="$2"
                        shift 2
                        ;;
                    --signing-key)
                        signing_key="$2"
                        shift 2
                        ;;
                    --json)
                        json_mode=true
                        shift
                        ;;
                    *)
                        shift
                        ;;
                esac
            done

            if [[ -z "$url" || -z "$events" || -z "$organization_uri" ]]; then
                echo "ERROR: --url, --events, and --organization-uri are required" >&2
                exit 1
            fi

            args=(
                "create-webhook-subscription"
                "--url" "$url"
                "--events" "$events"
                "--organization-uri" "$organization_uri"
            )
            if [[ -n "$scope" ]]; then
                args+=("--scope" "$scope")
            fi
            if [[ -n "$signing_key" ]]; then
                args+=("--signing-key" "$signing_key")
            fi
            if [[ "$json_mode" == true ]]; then
                args+=("-o" "json")
            fi

            exec "$CALENDLY_BIN" "${args[@]}"
            ;;
        delete)
            if [[ $# -ge 1 && ( "$1" == "--help" || "$1" == "-h" ) ]]; then
                cat <<'EOF'
Usage: webhook-subscriptions delete --webhook-subscription-uri URI [--json]
EOF
                exit 0
            fi

            webhook_subscription_uri=""
            json_mode=false

            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --webhook-subscription-uri)
                        webhook_subscription_uri="$2"
                        shift 2
                        ;;
                    --json)
                        json_mode=true
                        shift
                        ;;
                    *)
                        shift
                        ;;
                esac
            done

            if [[ -z "$webhook_subscription_uri" ]]; then
                echo "ERROR: --webhook-subscription-uri required" >&2
                exit 1
            fi

            args=("delete-webhook-subscription" "--webhook-subscription-uri" "$webhook_subscription_uri")
            if [[ "$json_mode" == true ]]; then
                args+=("-o" "json")
            fi

            exec "$CALENDLY_BIN" "${args[@]}"
            ;;
        *)
            echo "ERROR: unsupported webhook action '$action' (use: list|get|create|delete)" >&2
            exit 1
            ;;
    esac
fi

# Passthrough for normal commands
exec "$CALENDLY_BIN" "$@"
