import { Command } from 'commander';

const commandSignatures: Record<string, string> = {
	'list-webhook-subscriptions':
		'function list_webhook_subscriptions(organization_uri?: string, scope?: "user" | "organization", count?: number);',
	'get-webhook-subscription':
		'function get_webhook_subscription(webhook_subscription_uri: string);',
	'create-webhook-subscription':
		'function create_webhook_subscription(url: string, events: string, organization_uri: string, scope?: "user" | "organization", user_uri?: string, signing_key?: string);',
	'delete-webhook-subscription':
		'function delete_webhook_subscription(webhook_subscription_uri: string);',
	'list-organization-memberships':
		'function list_organization_memberships(user_uri?: string, organization_uri?: string, email?: string, count?: number);',
	'get-current-user': 'function get_current_user();',
	'list-events':
		'function list_events(user_uri?: string, organization_uri?: string, status?: "active" | "canceled", max_start_time?: string, min_start_time?: string, include_invitees?: boolean, expand?: string, count?: number, hydrate_invitees?: boolean, max_invitee_fetches?: number);',
	'list-events-with-invitees':
		'function list_events_with_invitees(user_uri?: string, organization_uri?: string, status?: "active" | "canceled", max_start_time?: string, min_start_time?: string, count?: number, hydrate_invitees?: boolean, max_invitee_fetches?: number);',
	'get-oauth-url': 'function get_oauth_url(redirect_uri: string, state?: string);',
	'exchange-code-for-tokens': 'function exchange_code_for_tokens(code: string, redirect_uri: string);',
	'refresh-access-token': 'function refresh_access_token(refresh_token: string);',
	'create-event-type':
		'function create_event_type(owner: string, name: string, duration?: number, duration_options?: number[], active?: boolean, description?: string, locations?: { kind: string, location?: string, additional_info?: string, phone_number?: string }[], color?: string, locale?: "de" | "en" | "es" | "fr" | "it" | "nl" | "pt" | "uk");',
	'list-event-types': 'function list_event_types(user?: string, organization?: string, count?: number);',
	'get-event-type': 'function get_event_type(event_type: string);',
	'update-event-type':
		'function update_event_type(event_type: string, name?: string, description?: string, duration?: number, active?: boolean, secret?: boolean, dry_run?: boolean);',
	'get-event-type-availability':
		'function get_event_type_availability(event_type: string, start_time: string, end_time: string, timezone?: string);',
	'get-event': 'function get_event(event_uuid: string);',
	'list-event-invitees': 'function list_event_invitees(event_uuid: string, status?: "active" | "canceled", email?: string, count?: number);',
	'cancel-event': 'function cancel_event(event_uuid: string, reason?: string);',
	'batch-event-invitees':
		'function batch_event_invitees(event_uri: string[], status?: "active" | "canceled", email?: string, count?: number, max_invitee_fetches?: number);',
	'search-invitees':
		'function search_invitees(email: string, user_uri?: string, organization_uri?: string, status?: "active" | "canceled", min_start_time?: string, max_start_time?: string, page_size?: number, max_pages?: number);',
	'list-team-events':
		'function list_team_events(organization_uri: string, status?: "active" | "canceled", min_start_time?: string, max_start_time?: string, count?: number, max_membership_pages?: number, member_email?: string, member_uri?: string, event_type_name?: string, include_invitees?: boolean, hydrate_invitees?: boolean, max_invitee_fetches?: number);',
	'search-team':
		'function search_team(email: string, min_start_time?: string, max_start_time?: string, status?: "active" | "canceled", organization_uri?: string, count?: number, max_membership_pages?: number);',
	'schedule-event':
		'function schedule_event(event_type: string, start_time: string, invitee_email: string, invitee_timezone: string, invitee_name?: string, invitee_first_name?: string, invitee_last_name?: string, invitee_phone?: string, location_kind?: string, location_details?: string, event_guests?: string[], questions_and_answers?: {question: string, answer: string, position: number}[], utm_source?: string, utm_campaign?: string, utm_medium?: string);',
	'reschedule-event':
		'function reschedule_event(new_start_time: string, event_uuid?: string, invitee_uuid?: string, reschedule_url?: string, new_end_time?: string, event_type?: string, reason?: string);',
};

export function createProgram(): Command {
	const program = new Command();
	program.name('calendly');
	program.description('calendly-mcp-server');
	program.option('-t, --timeout <ms>', 'Call timeout in milliseconds', (value) => parseInt(value, 10), 30000);
	program.option('-o, --output <format>', 'Output format: text|markdown|json|raw', 'text');
	const configurableProgram = program as Command & {
		configureHelp?: (configuration: { subcommandTerm(cmd: Command): string }) => void;
		showSuggestionAfterError?: (enabled?: boolean) => Command;
	};
	if (typeof configurableProgram.configureHelp === 'function') {
		configurableProgram.configureHelp({
			subcommandTerm(cmd: Command) {
				const term = cmd.name();
				return commandSignatures[term] ?? cmd.name();
			},
		});
	}
	if (typeof configurableProgram.showSuggestionAfterError === 'function') {
		configurableProgram.showSuggestionAfterError(true);
	}
	return program;
}
