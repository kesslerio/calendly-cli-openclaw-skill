import { createCallResult } from 'mcporter';
import { Command } from 'commander';
import {
	normalizeRescheduleEventQuery,
	shapeRescheduleEventResult,
	toRescheduleEventMcpArgs,
	toRescheduleEventRestBody,
	toSafeRescheduleEventError,
} from '../reschedule-event';
import {
	normalizeScheduleEventQuery,
	shapeScheduleEventResult,
	toSafeScheduleEventError,
	toScheduleEventMcpArgs,
	toScheduleEventRestBody,
} from '../schedule-event';
import { printResult } from './output';
import { ensureRuntime, getServerProxy, invokeWithTimeout, printMcpResult, SERVER_NAME } from './runtime';

function requireApiKey(): string {
	const apiKey = process.env.CALENDLY_API_KEY;
	if (!apiKey) {
		throw new Error('CALENDLY_API_KEY environment variable is required');
	}
	return apiKey;
}

function collectRepeatedString(value: string, previous: string[]): string[] {
	return [...previous, value];
}

async function fetchJson(url: string, timeout: number, init: RequestInit = {}): Promise<Record<string, unknown>> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, { ...init, signal: controller.signal });
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
	pageToken?: string,
	options?: { status?: string; count?: number }
): Promise<{ collection: unknown[]; next_page_token?: string }> {
	const params = new URLSearchParams();
	const normalizedCount =
		typeof options?.count === 'number' && Number.isFinite(options.count)
			? Math.max(1, Math.min(100, Math.trunc(options.count)))
			: 100;
	params.append('count', String(normalizedCount));
	if (typeof options?.status === 'string' && options.status.length > 0) params.append('status', options.status);
	if (pageToken) params.append('page_token', pageToken);
	const data = await fetchJson(
		`https://api.calendly.com/scheduled_events/${eventUuid}/invitees?${params.toString()}`,
		timeout,
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
		}
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

function toObjectRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};
}

function pickStringValue(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) {
			return value;
		}
	}
	return undefined;
}

function parseUuidFromSegment(uri: string | undefined, segment: string): string | undefined {
	if (!uri) {
		return undefined;
	}
	const regex = new RegExp(`/${segment}/([^/?#]+)(?:[/?#]|$)`);
	const match = uri.match(regex);
	return match && match[1] ? match[1] : undefined;
}

async function fetchBookingInviteeResource(inviteeUuid: string, timeout: number): Promise<Record<string, unknown>> {
	const response = await fetchJson(
		`https://calendly.com/api/booking/invitees/${encodeURIComponent(inviteeUuid)}`,
		timeout,
		{
			headers: {
				'Content-Type': 'application/json',
			},
		}
	);
	return toObjectRecord(response);
}

function extractInviteeUuid(value: unknown): string | undefined {
	const record = toObjectRecord(value);
	const inviteeUri = pickStringValue(record.uri, record.invitee_uri, toObjectRecord(record.invitee).uri);
	return parseUuidFromSegment(inviteeUri, 'invitees') ?? pickStringValue(record.uuid);
}

async function resolveInviteeUuidFromEvent(
	apiKey: string,
	eventUuid: string,
	timeout: number
): Promise<string | undefined> {
	const collectInviteeUuids = (collection: unknown[]): string[] => {
		const uuids = collection
			.map((entry) => extractInviteeUuid(entry))
			.filter((value): value is string => typeof value === 'string' && value.length > 0);
		return [...new Set(uuids)];
	};

	const activeInvitees = await fetchEventInviteesPage(apiKey, eventUuid, timeout, undefined, {
		status: 'active',
		count: 2,
	});
	const activeUuids = collectInviteeUuids(Array.isArray(activeInvitees.collection) ? activeInvitees.collection : []);
	if (activeUuids.length > 1) {
		throw new Error('Multiple active invitees found for --event-uuid. Provide --invitee-uuid or --invitee-uri.');
	}
	if (activeUuids.length === 1) {
		return activeUuids[0];
	}

	const anyInvitees = await fetchEventInviteesPage(apiKey, eventUuid, timeout, undefined, {
		count: 2,
	});
	const anyUuids = collectInviteeUuids(Array.isArray(anyInvitees.collection) ? anyInvitees.collection : []);
	if (anyUuids.length > 1) {
		throw new Error('Multiple invitees found for --event-uuid. Provide --invitee-uuid or --invitee-uri.');
	}
	return anyUuids[0];
}

async function resolveRescheduleEventQuery(
	query: Record<string, unknown>,
	apiKey: string,
	timeout: number
): Promise<Record<string, unknown>> {
	let inviteeUuid = pickStringValue(query.invitee_uuid);
	const eventUuid = pickStringValue(query.event_uuid);

	if (!inviteeUuid && eventUuid) {
		inviteeUuid = await resolveInviteeUuidFromEvent(apiKey, eventUuid, timeout);
	}
	if (!inviteeUuid) {
		throw new Error(
			'Unable to determine invitee_uuid for rescheduling. Provide --invitee-uuid/--invitee-uri, --reschedule-url, or an event with invitees.'
		);
	}

	const inviteeResource = await fetchBookingInviteeResource(inviteeUuid, timeout);
	const inviteeTimezone = pickStringValue(inviteeResource.timezone);
	const inviteeTimeNotation = pickStringValue(inviteeResource.time_notation);
	if (!inviteeTimezone || !inviteeTimeNotation) {
		throw new Error('Unable to determine invitee timezone/time notation for rescheduling.');
	}
	const resolvedInviteeUuid = extractInviteeUuid(inviteeResource) ?? inviteeUuid;
	const inviteeEventUri = pickStringValue(
		toObjectRecord(inviteeResource.event).uri,
		inviteeResource.event_uri,
		inviteeResource.event
	);
	const eventUuidFromInvitee = parseUuidFromSegment(inviteeEventUri, 'scheduled_events');
	if (eventUuid && eventUuidFromInvitee && eventUuid !== eventUuidFromInvitee) {
		throw new Error('Provided --event-uuid does not match the event linked to --invitee-uuid/--reschedule-url.');
	}

	return {
		...query,
		invitee_uuid: resolvedInviteeUuid,
		...(eventUuid ?? eventUuidFromInvitee ? { event_uuid: eventUuid ?? eventUuidFromInvitee } : {}),
		invitee_timezone: inviteeTimezone,
		invitee_time_notation: inviteeTimeNotation,
		is_publisher: false,
	};
}

async function fetchScheduleEventResult(query: Record<string, unknown>, timeout: number): Promise<unknown> {
	const apiKey = requireApiKey();
	const response = await fetchJson('https://api.calendly.com/invitees', timeout, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(toScheduleEventRestBody(query as any)),
	});
	return shapeScheduleEventResult(response, query as any);
}

async function fetchRescheduleEventResult(query: Record<string, unknown>, timeout: number): Promise<unknown> {
	const apiKey = requireApiKey();
	const resolvedQuery = await resolveRescheduleEventQuery(query, apiKey, timeout);
	const inviteeUuid = String(resolvedQuery.invitee_uuid);
	const response = await fetchJson(
		`https://calendly.com/api/booking/invitees/${encodeURIComponent(inviteeUuid)}`,
		timeout,
		{
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				'Booking-Request-ID': `reschedule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
			},
			body: JSON.stringify(toRescheduleEventRestBody(resolvedQuery as any)),
		}
	);
	return shapeRescheduleEventResult(response, resolvedQuery as any);
}

export function registerSchedulingCommands(program: Command): void {
	program
		.command('schedule-event')
		.summary('schedule-event --event-type <event-type-uri> --start-time <start-time:iso-8601> --invitee-email <invitee-email> --invitee-timezone <invitee-timezone> [--invitee-name <invitee-name>] [--invitee-first-name <invitee-first-name>] [--invitee-last-name <invitee-last-name>] [--invitee-phone <invitee-phone:e164>] [--location-kind <location-kind>] [--location-details <location-details>] [--event-guest <event-guest>] [--questions-and-answers <questions-and-answers:json>] [--questions <questions:json>] [--utm-source <utm-source>] [--utm-campaign <utm-campaign>] [--utm-medium <utm-medium>] [--raw <json>]')
		.description('Schedule a meeting by creating an invitee for a specific event type and time')
		.usage('--event-type <event-type-uri> --start-time <start-time:iso-8601> --invitee-email <invitee-email> --invitee-timezone <invitee-timezone> [--invitee-name <invitee-name>] [--invitee-first-name <invitee-first-name>] [--invitee-last-name <invitee-last-name>] [--invitee-phone <invitee-phone:e164>] [--location-kind <location-kind>] [--location-details <location-details>] [--event-guest <event-guest>] [--questions-and-answers <questions-and-answers:json>] [--questions <questions:json>] [--utm-source <utm-source>] [--utm-campaign <utm-campaign>] [--utm-medium <utm-medium>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--event-type <event-type-uri>', 'Event type URI to schedule')
		.option('--start-time <start-time:iso-8601>', 'Start time for the event (ISO 8601 format; must be in the future)')
		.option('--invitee-email <invitee-email>', 'Email address of the invitee')
		.option('--invitee-timezone <invitee-timezone>', 'Invitee timezone (IANA, example: America/New_York)')
		.option('--invitee-name <invitee-name>', 'Invitee full name (alternative to first/last name)')
		.option('--invitee-first-name <invitee-first-name>', 'Invitee first name')
		.option('--invitee-last-name <invitee-last-name>', 'Invitee last name')
		.option('--invitee-phone <invitee-phone:e164>', 'Invitee phone for SMS reminders in E.164 format')
		.option('--location-kind <location-kind>', 'Meeting location kind (zoom_conference, google_conference, physical, ask_invitee, etc.)')
		.option('--location-details <location-details>', 'Optional location details; requires --location-kind')
		.option('--event-guest <event-guest>', 'Additional guest email; repeat up to 10 entries', collectRepeatedString, [] as string[])
		.option('--questions-and-answers <questions-and-answers:json>', 'JSON array/object for booking questions (e.g. "[{\"question\":\"Company\",\"answer\":\"Acme\",\"position\":1}]")')
		.option('--questions <questions:json>', 'Compatibility alias for --questions-and-answers (JSON object or array)')
		.option('--utm-source <utm-source>', 'Optional UTM source')
		.option('--utm-campaign <utm-campaign>', 'Optional UTM campaign')
		.option('--utm-medium <utm-medium>', 'Optional UTM medium')
		.alias('schedule_event')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const timeout = globalOptions.timeout || 30000;
			const rawArgs = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
			const query = normalizeScheduleEventQuery(cmdOpts, rawArgs);
			let mcpErrorMessage: string | undefined;
			try {
				const runtime = await ensureRuntime();
				const proxy = getServerProxy(runtime) as any;
				try {
					const call = proxy.scheduleEvent(toScheduleEventMcpArgs(query));
					const mcpResult = await invokeWithTimeout(call, timeout);
					const mcpRaw = createCallResult(mcpResult).raw as Record<string, unknown> | undefined;
					if (mcpRaw && (mcpRaw.resource || mcpRaw.uri || mcpRaw.event)) {
						printResult(shapeScheduleEventResult(mcpRaw, query), globalOptions.output ?? 'text');
						return;
					}
					printMcpResult(mcpResult, globalOptions.output ?? 'text');
					return;
				} catch (error) {
					mcpErrorMessage = error instanceof Error ? error.message : String(error);
				} finally {
					await runtime.close(SERVER_NAME).catch(() => {});
				}
			} catch (error) {
				mcpErrorMessage = error instanceof Error ? error.message : String(error);
			}

			try {
				const restResult = await fetchScheduleEventResult(query, timeout);
				printResult(restResult, globalOptions.output ?? 'text');
			} catch (error) {
				let message = toSafeScheduleEventError(error);
				if (mcpErrorMessage) {
					message = `${message} (MCP tool fallback failed: ${mcpErrorMessage})`;
				}
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () =>
			'\nExample:\n  ' +
			`./calendly schedule-event --event-type https://api.calendly.com/event_types/ET_123 --start-time 2099-03-01T15:00:00Z --invitee-email invitee@example.com --invitee-name "Jane Doe" --invitee-timezone America/New_York --questions '{"Company":"Acme"}'`
		);

	program
		.command('reschedule-event')
		.summary('reschedule-event (--event-uuid <event-uuid> | --invitee-uuid <invitee-uuid> | --reschedule-url <reschedule-url>) --new-start-time <new-start-time:iso-8601> [--event-type <event-type-uri>] [--new-end-time <new-end-time:iso-8601>] [--reason <reason>] [--event-uri <event-uri>] [--invitee-uri <invitee-uri>] [--raw <json>]')
		.description('Reschedule an existing meeting to a new start time (MCP-first with REST fallback)')
		.usage('(--event-uuid <event-uuid> | --invitee-uuid <invitee-uuid> | --reschedule-url <reschedule-url>) --new-start-time <new-start-time:iso-8601> [--event-type <event-type-uri>] [--new-end-time <new-end-time:iso-8601>] [--reason <reason>] [--event-uri <event-uri>] [--invitee-uri <invitee-uri>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--event-uuid <event-uuid>', 'Scheduled event UUID to reschedule')
		.option('--event-uri <event-uri>', 'Scheduled event URI (alternative to --event-uuid)')
		.option('--invitee-uuid <invitee-uuid>', 'Invitee UUID (alternative identifier when event UUID is unknown)')
		.option('--invitee-uri <invitee-uri>', 'Invitee URI (alternative identifier when event UUID is unknown)')
		.option('--reschedule-url <reschedule-url>', 'Calendly reschedule URL to extract event/invitee identifiers')
		.option('--new-start-time <new-start-time:iso-8601>', 'New event start time (ISO 8601; must be in the future)')
		.option('--start-time <start-time:iso-8601>', 'Compatibility alias for --new-start-time')
		.option('--new-end-time <new-end-time:iso-8601>', 'Optional explicit new end time (otherwise derived from current event duration)')
		.option('--event-type <event-type-uri>', 'Optional event type URI override (normally derived from existing event)')
		.option('--reason <reason>', 'Optional reason included in reschedule notifications')
		.alias('reschedule_event')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const timeout = globalOptions.timeout || 30000;
			const rawArgs = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
			const query = normalizeRescheduleEventQuery(cmdOpts, rawArgs);
			let mcpErrorMessage: string | undefined;
			try {
				const runtime = await ensureRuntime();
				const proxy = getServerProxy(runtime) as any;
				try {
					const call = proxy.rescheduleEvent(toRescheduleEventMcpArgs(query));
					const mcpResult = await invokeWithTimeout(call, timeout);
					const mcpRaw = createCallResult(mcpResult).raw as Record<string, unknown> | undefined;
					if (mcpRaw && (mcpRaw.resource || mcpRaw.uri || mcpRaw.event || mcpRaw.scheduled_event)) {
						printResult(shapeRescheduleEventResult(mcpRaw, query), globalOptions.output ?? 'text');
						return;
					}
					printMcpResult(mcpResult, globalOptions.output ?? 'text');
					return;
				} catch (error) {
					mcpErrorMessage = error instanceof Error ? error.message : String(error);
				} finally {
					await runtime.close(SERVER_NAME).catch(() => {});
				}
			} catch (error) {
				mcpErrorMessage = error instanceof Error ? error.message : String(error);
			}

			try {
				const restResult = await fetchRescheduleEventResult(query, timeout);
				printResult(restResult, globalOptions.output ?? 'text');
			} catch (error) {
				let message = toSafeRescheduleEventError(error);
				if (mcpErrorMessage) {
					message = `${message} (MCP tool fallback failed: ${mcpErrorMessage})`;
				}
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText(
			'after',
			() =>
				'\nExample:\n  ' +
				'./calendly reschedule-event --event-uuid EVT_123 --new-start-time 2099-03-02T16:00:00Z --reason "Conflict with another meeting"'
		);
}
