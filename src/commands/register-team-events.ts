import { Command } from 'commander';
import { normalizeTeamEventsQuery, printTeamEventsResult, scanTeamEvents } from '../team-events';

function requireApiKey(): string {
	const apiKey = process.env.CALENDLY_API_KEY;
	if (!apiKey) {
		throw new Error('CALENDLY_API_KEY environment variable is required');
	}
	return apiKey;
}

async function calendlyGet(url: string, apiKey: string, timeout: number): Promise<Record<string, unknown>> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			signal: controller.signal,
		});

		const text = await response.text();
		let data: unknown = {};
		if (text) {
			try {
				data = JSON.parse(text);
			} catch {
				data = text;
			}
		}

		if (!response.ok) {
			const message = typeof data === 'string' ? data : JSON.stringify(data);
			throw new Error(`Calendly API request failed (${response.status}): ${message}`);
		}

		return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
	} finally {
		clearTimeout(timer);
	}
}

function toCollectionPage(data: Record<string, unknown>): { collection: unknown[]; next_page_token?: string } {
	const pagination =
		data.pagination && typeof data.pagination === 'object'
			? (data.pagination as Record<string, unknown>)
			: {};
	const nextPageToken =
		typeof pagination.next_page_token === 'string' && pagination.next_page_token.length > 0
			? pagination.next_page_token
			: undefined;
	return {
		collection: Array.isArray(data.collection) ? data.collection : [],
		next_page_token: nextPageToken,
	};
}

export function registerTeamEventsCommands(program: Command): void {
	program
		.command('list-team-events')
		.summary('list-team-events --organization-uri <organization-uri> [--status <status:active|canceled>] [--min-start-time <min-start-time:iso-8601>] [--max-start-time <max-start-time:iso-8601>] [--count <count:number>] [--max-membership-pages <max-membership-pages:number>] [--member-email <member-email>] [--member-uri <member-uri>] [--event-type-name <event-type-name>] [--include-invitees] [--hydrate-invitees <hydrate-invitees:boolean>] [--max-invitee-fetches <max-invitee-fetches:number>] [--raw <json>]')
		.description('List team scheduled events by scanning organization memberships and member calendars')
		.usage('--organization-uri <organization-uri> [--status <status:active|canceled>] [--min-start-time <min-start-time:iso-8601>] [--max-start-time <max-start-time:iso-8601>] [--count <count:number>] [--max-membership-pages <max-membership-pages:number>] [--member-email <member-email>] [--member-uri <member-uri>] [--event-type-name <event-type-name>] [--include-invitees] [--hydrate-invitees <hydrate-invitees:boolean>] [--max-invitee-fetches <max-invitee-fetches:number>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--organization-uri <organization-uri>', 'URI of the organization/team to list events for')
		.option('--status <status:active|canceled>', 'Filter events by status (choices: active, canceled; example: active)')
		.option('--min-start-time <min-start-time:iso-8601>', 'Minimum start time for events (ISO 8601 format)')
		.option('--max-start-time <max-start-time:iso-8601>', 'Maximum start time for events (ISO 8601 format)')
		.option('--count <count:number>', 'Maximum number of events to return (default 20, max 100)', (value) => parseInt(value, 10))
		.option('--max-membership-pages <max-membership-pages:number>', 'Maximum organization membership pages to scan (default 10)', (value) => parseInt(value, 10))
		.option('--member-email <member-email>', 'Optional host/member email filter')
		.option('--member-uri <member-uri>', 'Optional host/member URI filter')
		.option('--event-type-name <event-type-name>', 'Optional event type name filter')
		.option('--include-invitees', 'Include invitee details in team event results')
		.option('--hydrate-invitees <hydrate-invitees:boolean>', 'Hydrate missing invitees with per-event fallback calls (default true when invitees are included)')
		.option('--max-invitee-fetches <max-invitee-fetches:number>', 'Safety cap for per-event invitee fallback API calls (default 25)', (value) => parseInt(value, 10))
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			try {
				const query = normalizeTeamEventsQuery(cmdOpts as Record<string, unknown>, cmdOpts.raw ? JSON.parse(cmdOpts.raw) : {});
				const apiKey = requireApiKey();
				const timeout = globalOptions.timeout || 30000;

				const resultData = await scanTeamEvents(query, {
					fetchMembershipPage: async (pageToken?: string) => {
						const params = new URLSearchParams();
						params.append('count', '100');
						params.append('organization', query.organization_uri);
						if (query.member_email) params.append('email', query.member_email);
						if (query.member_uri) params.append('user', query.member_uri);
						if (pageToken) params.append('page_token', pageToken);
						const data = await calendlyGet(
							`https://api.calendly.com/organization_memberships?${params.toString()}`,
							apiKey,
							timeout
						);
						return toCollectionPage(data);
					},
					fetchMemberEventsPage: async (memberUserUri: string, pageToken?: string, includeInvitees?: boolean, pageSize?: number) => {
						const params = new URLSearchParams();
						params.append('count', String(pageSize ?? 100));
						params.append('sort', 'start_time:asc');
						params.append('user', memberUserUri);
						params.append('organization', query.organization_uri);
						if (query.status) params.append('status', query.status);
						if (query.min_start_time) params.append('min_start_time', query.min_start_time);
						if (query.max_start_time) params.append('max_start_time', query.max_start_time);
						if (includeInvitees) params.append('expand', 'invitees');
						if (pageToken) params.append('page_token', pageToken);
						const data = await calendlyGet(
							`https://api.calendly.com/scheduled_events?${params.toString()}`,
							apiKey,
							timeout
						);
						return toCollectionPage(data);
					},
					fetchOrganizationEventsPage: async (pageToken?: string, includeInvitees?: boolean, pageSize?: number) => {
						const params = new URLSearchParams();
						params.append('count', String(pageSize ?? 100));
						params.append('sort', 'start_time:asc');
						params.append('organization', query.organization_uri);
						if (query.status) params.append('status', query.status);
						if (query.min_start_time) params.append('min_start_time', query.min_start_time);
						if (query.max_start_time) params.append('max_start_time', query.max_start_time);
						if (includeInvitees) params.append('expand', 'invitees');
						if (pageToken) params.append('page_token', pageToken);
						const data = await calendlyGet(
							`https://api.calendly.com/scheduled_events?${params.toString()}`,
							apiKey,
							timeout
						);
						return toCollectionPage(data);
					},
					fetchEventInviteesPage: async (eventUuid: string, pageToken?: string) => {
						const params = new URLSearchParams();
						params.append('count', '100');
						if (pageToken) params.append('page_token', pageToken);
						const data = await calendlyGet(
							`https://api.calendly.com/scheduled_events/${eventUuid}/invitees?${params.toString()}`,
							apiKey,
							timeout
						);
						return toCollectionPage(data);
					},
				});

				printTeamEventsResult(resultData, globalOptions.output ?? 'text');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + './calendly list-team-events --organization-uri <ORG_URI> --min-start-time 2026-01-20T00:00:00Z');
}
