import { Command } from 'commander';
import { fetchBatchEventInvitees, normalizeBatchEventInviteesQuery } from '../batch-event-invitees';
import { printResult } from './output';

function requireApiKey(): string {
	const apiKey = process.env.CALENDLY_API_KEY;
	if (!apiKey) {
		throw new Error('CALENDLY_API_KEY environment variable is required');
	}
	return apiKey;
}

async function fetchEventInviteesPage(
	apiKey: string,
	eventUuid: string,
	timeout: number,
	pageToken?: string,
	options?: { status?: string; email?: string; count?: number }
): Promise<{ collection: unknown[]; next_page_token?: string }> {
	const params = new URLSearchParams();
	const normalizedCount =
		typeof options?.count === 'number' && Number.isFinite(options.count)
			? Math.max(1, Math.min(100, Math.trunc(options.count)))
			: 100;
	params.append('count', String(normalizedCount));
	if (typeof options?.status === 'string' && options.status.length > 0) params.append('status', options.status);
	if (typeof options?.email === 'string' && options.email.length > 0) params.append('email', options.email);
	if (pageToken) params.append('page_token', pageToken);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(
			`https://api.calendly.com/scheduled_events/${eventUuid}/invitees?${params.toString()}`,
			{
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				signal: controller.signal,
			}
		);

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

		const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
		const pagination =
			record.pagination && typeof record.pagination === 'object'
				? (record.pagination as Record<string, unknown>)
				: {};
		const nextPageToken =
			typeof pagination.next_page_token === 'string' && pagination.next_page_token.length > 0
				? pagination.next_page_token
				: undefined;
		return {
			collection: Array.isArray(record.collection) ? record.collection : [],
			next_page_token: nextPageToken,
		};
	} finally {
		clearTimeout(timer);
	}
}

async function fetchBatchEventInviteesResult(query: Record<string, unknown>, timeout: number): Promise<unknown> {
	const apiKey = requireApiKey();
	const normalizedQuery = normalizeBatchEventInviteesQuery(
		{
			eventUri: Array.isArray(query.event_uri) ? (query.event_uri as string[]) : undefined,
			status: query.status as 'active' | 'canceled' | undefined,
			email: query.email as string | undefined,
			count: query.count as number | undefined,
			maxInviteeFetches: query.max_invitee_fetches as number | undefined,
		},
		query
	);

	return fetchBatchEventInvitees(normalizedQuery, (eventUuid, pageToken, options) =>
		fetchEventInviteesPage(apiKey, eventUuid, timeout, pageToken, options)
	);
}

function collectRepeatedString(value: string, previous: string[]): string[] {
	return [...previous, value];
}

export function registerBatchEventInviteesCommands(program: Command): void {
	program
		.command('batch-event-invitees')
		.summary(
			'batch-event-invitees --event-uri <event-uri> [--event-uri <event-uri>] [--status <status:active|canceled>] [--email <email>] [--count <count:number>] [--max-invitee-fetches <max-invitee-fetches:number>] [--raw <json>]'
		)
		.description('Batch lookup invitees for multiple scheduled event URIs')
		.usage(
			'--event-uri <event-uri> [--event-uri <event-uri>] [--status <status:active|canceled>] [--email <email>] [--count <count:number>] [--max-invitee-fetches <max-invitee-fetches:number>] [--raw <json>]'
		)
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--event-uri <event-uri>', 'Scheduled event URI; repeat for multiple events', collectRepeatedString, [] as string[])
		.option('--status <status:active|canceled>', 'Filter invitees by status (choices: active, canceled; example: active)')
		.option('--email <email>', 'Optional invitee email filter')
		.option('--count <count:number>', 'Number of invitees per page (default 100, max 100) (example: 25)', (value) => parseFloat(value))
		.option('--max-invitee-fetches <max-invitee-fetches:number>', 'Safety cap for total invitee fetch calls across all events (default 25)', (value) => parseInt(value, 10))
		.alias('batch_event_invitees')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			try {
				const args = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
				if (Array.isArray(cmdOpts.eventUri) && cmdOpts.eventUri.length > 0) args.event_uri = cmdOpts.eventUri;
				if (cmdOpts.status !== undefined) args.status = cmdOpts.status;
				if (cmdOpts.email !== undefined) args.email = cmdOpts.email;
				if (cmdOpts.count !== undefined) args.count = cmdOpts.count;
				if (cmdOpts.maxInviteeFetches !== undefined) args.max_invitee_fetches = cmdOpts.maxInviteeFetches;

				const result = await fetchBatchEventInviteesResult(args, globalOptions.timeout || 30000);
				printResult(result, globalOptions.output ?? 'text');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText(
			'after',
			() =>
				'\nExample:\n  ' +
				'./calendly batch-event-invitees --event-uri https://api.calendly.com/scheduled_events/EVT_1 --event-uri https://api.calendly.com/scheduled_events/EVT_2'
		);
}
