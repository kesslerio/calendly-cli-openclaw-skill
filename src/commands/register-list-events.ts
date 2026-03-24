import { Command } from 'commander';
import {
	eventInviteeCount,
	extractInviteePaginationMeta,
	hydrateInviteesPerEvent,
	normalizeInvitees,
	toCalendlyScheduledEventsParams,
} from '../list-events-invitees';
import { normalizeListEventsQuery } from '../list-events-query';
import { ensureRuntime, getServerProxy, invokeWithTimeout, printMcpResult, SERVER_NAME } from './runtime';

function requireApiKey(): string {
	const apiKey = process.env.CALENDLY_API_KEY;
	if (!apiKey) {
		throw new Error('CALENDLY_API_KEY environment variable is required');
	}
	return apiKey;
}

function parseBooleanFlag(value: string): boolean {
	const normalized = String(value).trim().toLowerCase();
	if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
		return true;
	}
	if (normalized === 'false' || normalized === '0' || normalized === 'no') {
		return false;
	}
	throw new Error(`Invalid boolean value "${value}". Use true or false.`);
}

function shouldIncludeInvitees(args: Record<string, unknown>): boolean {
	if (args.include_invitees === true) {
		return true;
	}
	if (typeof args.expand === 'string') {
		return args.expand
			.split(',')
			.map((entry) => entry.trim().toLowerCase())
			.includes('invitees');
	}
	if (Array.isArray(args.expand)) {
		return args.expand
			.map((entry) => String(entry).trim().toLowerCase())
			.includes('invitees');
	}
	return false;
}

async function calendlyGet(
	url: string,
	apiKey: string,
	timeout: number
): Promise<Record<string, unknown>> {
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

async function fetchEventInviteesPage(
	apiKey: string,
	eventUuid: string,
	timeout: number,
	pageToken?: string
): Promise<{ collection: unknown[]; next_page_token?: string }> {
	const params = new URLSearchParams();
	params.append('count', '100');
	if (pageToken) params.append('page_token', pageToken);
	const data = await calendlyGet(
		`https://api.calendly.com/scheduled_events/${eventUuid}/invitees?${params.toString()}`,
		apiKey,
		timeout
	);
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

async function fetchScheduledEventsWithInvitees(
	query: Record<string, unknown>,
	timeout: number
): Promise<Record<string, unknown>> {
	const apiKey = requireApiKey();
	const params = toCalendlyScheduledEventsParams({
		user_uri: query.user_uri as string | undefined,
		organization_uri: query.organization_uri as string | undefined,
		status: query.status as string | undefined,
		max_start_time: query.max_start_time as string | undefined,
		min_start_time: query.min_start_time as string | undefined,
		count: query.count as number | undefined,
		expand: query.expand as string | string[] | undefined,
		include_invitees: query.include_invitees as boolean | undefined,
		hydrate_invitees: query.hydrate_invitees as boolean | undefined,
		max_invitee_fetches: query.max_invitee_fetches as number | undefined,
	});

	const data = await calendlyGet(
		`https://api.calendly.com/scheduled_events?${params.toString()}`,
		apiKey,
		timeout
	);

	const events = Array.isArray(data.collection) ? data.collection : [];
	const hydrated = await hydrateInviteesPerEvent(
		events,
		{
			hydrate_invitees: query.hydrate_invitees as boolean | undefined,
			max_invitee_fetches: query.max_invitee_fetches as number | undefined,
		},
		(eventUuid, pageToken) => fetchEventInviteesPage(apiKey, eventUuid, timeout, pageToken)
	);

	const currentMeta = data.meta && typeof data.meta === 'object' ? (data.meta as Record<string, unknown>) : {};
	return {
		...data,
		collection: hydrated.collection.map((event: any) => ({
			...event,
			invitees: normalizeInvitees(event?.invitees),
			invitee_count: eventInviteeCount(event),
		})),
		meta: {
			...currentMeta,
			...extractInviteePaginationMeta(data),
			invitee_hydration: hydrated.meta,
		},
	};
}

function printEventsWithInviteesResult(resultData: Record<string, unknown>, format: string): void {
	const events = Array.isArray(resultData?.collection) ? resultData.collection : [];
	if (format === 'json' || format === 'raw') {
		console.log(JSON.stringify(resultData, null, 2));
		return;
	}
	if (format === 'markdown') {
		if (events.length === 0) {
			console.log('No events found.');
			return;
		}
		console.log('## Events with Invitees\n');
		console.log('| Event | Start Time | Status | Invitees |');
		console.log('|-------|------------|--------|----------|');
		for (const event of events as Array<Record<string, any>>) {
			const invitees = normalizeInvitees(event.invitees);
			const inviteeNames =
				invitees.map((i) => i.name || i.email).join(', ') ||
				((event.invitee_count || 0) > 0 ? 'details unavailable' : 'None');
			console.log(
				`| ${event.name} | ${event.start_time} | ${event.status} | ${event.invitee_count || 0} (${inviteeNames}) |`
			);
		}
		return;
	}

	if (events.length === 0) {
		console.log('No events found.');
		return;
	}
	console.log('Events with Invitees:\n');
	for (const event of events as Array<Record<string, any>>) {
		console.log(`Event: ${event.name}`);
		console.log(`  Start: ${event.start_time}`);
		console.log(`  Status: ${event.status}`);
		console.log('  Invitees:');
		const invitees = normalizeInvitees(event.invitees);
		if (invitees.length === 0) {
			console.log((event.invitee_count || 0) > 0 ? '    (details unavailable)' : '    (none)');
		} else {
			for (const invitee of invitees) {
				console.log(`    - ${invitee.name || invitee.email} (${invitee.email})`);
			}
		}
		console.log('');
	}
}

export function registerListEventsCommands(program: Command): void {
	program
		.command('list-events')
		.summary('list-events [--user-uri <user-uri>] [--organization-uri <organization-uri>] [--status <status:active|canceled>] [--max-start-time <max-start-time:iso-8601>] [--min-start-time <min-start-time:iso-8601>] [--include-invitees] [--expand <expand:invitees>] [--hydrate-invitees <hydrate-invitees:boolean>] [--max-invitee-fetches <max-invitee-fetches:number>] [--raw <json>]')
		.description('List scheduled events; use --include-invitees for invitee details in one call')
		.usage('[--user-uri <user-uri>] [--organization-uri <organization-uri>] [--status <status:active|canceled>] [--max-start-time <max-start-time:iso-8601>] [--min-start-time <min-start-time:iso-8601>] [--include-invitees] [--expand <expand:invitees>] [--hydrate-invitees <hydrate-invitees:boolean>] [--max-invitee-fetches <max-invitee-fetches:number>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--user-uri <user-uri>', 'URI of the user whose events to list')
		.option('--organization-uri <organization-uri>', 'URI of the organization to filter events')
		.option('--status <status:active|canceled>', 'Filter events by status (choices: active, canceled; example: active)')
		.option('--max-start-time <max-start-time:iso-8601>', 'Maximum start time for events (ISO 8601 format)')
		.option('--min-start-time <min-start-time:iso-8601>', 'Minimum start time for events (ISO 8601 format)')
		.option('--count <count:number>', 'Number of events to return (default 20, max 100) (example: 1)', (value) => parseFloat(value))
		.option('--include-invitees', 'Include invitee details using Calendly expand=invitees in the same list-events call')
		.option('--expand <expand:invitees>', 'Compatibility expand value; currently supports invitees')
		.option('--hydrate-invitees <hydrate-invitees:boolean>', 'Hydrate missing invitees with per-event fallback calls (default true for include-invitees path)', parseBooleanFlag)
		.option('--max-invitee-fetches <max-invitee-fetches:number>', 'Safety cap for per-event invitee fallback API calls (default 25)', (value) => parseInt(value, 10))
		.alias('list_events')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const args = normalizeListEventsQuery(cmdOpts, cmdOpts.raw ? JSON.parse(cmdOpts.raw) : {});
			if (shouldIncludeInvitees(args)) {
				try {
					const resultData = await fetchScheduledEventsWithInvitees(args, globalOptions.timeout || 30000);
					printEventsWithInviteesResult(resultData, globalOptions.output ?? 'text');
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					console.error(`Error: ${message}`);
					process.exit(1);
				}
				return;
			}

			const runtime = await ensureRuntime();
			const proxy = getServerProxy(runtime) as any;
			try {
				const call = proxy.listEvents(args);
				const result = await invokeWithTimeout(call, globalOptions.timeout || 30000);
				printMcpResult(result, globalOptions.output ?? 'text');
			} finally {
				await runtime.close(SERVER_NAME).catch(() => {});
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + './calendly list-events --status active --include-invitees')
		.addHelpText('afterAll', () => '\n' + '// optional (1): count' + '\n');

	program
		.command('list-events-with-invitees')
		.summary('list-events-with-invitees [--user-uri <user-uri>] [--organization-uri <organization-uri>] [--status <status:active|canceled>] [--max-start-time <max-start-time:iso-8601>] [--min-start-time <min-start-time:iso-8601>] [--count <count:number>] [--hydrate-invitees <hydrate-invitees:boolean>] [--max-invitee-fetches <max-invitee-fetches:number>]')
		.description('Compatibility command: equivalent to list-events --include-invitees')
		.usage('[--user-uri <user-uri>] [--organization-uri <organization-uri>] [--status <status:active|canceled>] [--max-start-time <max-start-time:iso-8601>] [--min-start-time <min-start-time:iso-8601>] [--count <count:number>] [--hydrate-invitees <hydrate-invitees:boolean>] [--max-invitee-fetches <max-invitee-fetches:number>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--user-uri <user-uri>', 'URI of the user whose events to list')
		.option('--organization-uri <organization-uri>', 'URI of the organization to filter events')
		.option('--status <status:active|canceled>', 'Filter events by status (choices: active, canceled; example: active)')
		.option('--max-start-time <max-start-time:iso-8601>', 'Maximum start time for events (ISO 8601 format)')
		.option('--min-start-time <min-start-time:iso-8601>', 'Minimum start time for events (ISO 8601 format)')
		.option('--count <count:number>', 'Number of events to return (default 20, max 100) (example: 1)', (value) => parseInt(value, 10))
		.option('--hydrate-invitees <hydrate-invitees:boolean>', 'Hydrate missing invitees with per-event fallback calls (default true)', parseBooleanFlag)
		.option('--max-invitee-fetches <max-invitee-fetches:number>', 'Safety cap for per-event invitee fallback API calls (default 25)', (value) => parseInt(value, 10))
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			try {
				const args = normalizeListEventsQuery(cmdOpts, cmdOpts.raw ? JSON.parse(cmdOpts.raw) : {});
				args.include_invitees = true;
				args.expand = 'invitees';
				const resultData = await fetchScheduledEventsWithInvitees(args, globalOptions.timeout || 30000);
				printEventsWithInviteesResult(resultData, globalOptions.output ?? 'text');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + './calendly list-events --status active --include-invitees');
}
