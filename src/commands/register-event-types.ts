import { createCallResult } from 'mcporter';
import { Command } from 'commander';
import { normalizeEventTypeAvailabilityQuery, shapeEventTypeAvailabilityResult } from '../event-type-availability';
import { extractEventTypeUuid, normalizeGetEventTypeQuery, shapeGetEventTypeResult } from '../get-event-type';
import { normalizeListEventTypesQuery, shapeListEventTypesResult, toListEventTypesMcpArgs } from '../list-event-types';
import { printResult } from './output';
import { ensureRuntime, getServerProxy, invokeWithTimeout, printMcpResult, SERVER_NAME } from './runtime';

function requireApiKey(): string {
	const apiKey = process.env.CALENDLY_API_KEY;
	if (!apiKey) {
		throw new Error('CALENDLY_API_KEY environment variable is required');
	}
	return apiKey;
}

function parseIntegerFlag(value: string, optionName: string): number {
	const trimmed = String(value).trim();
	if (!/^-?\d+$/.test(trimmed)) {
		throw new Error(`Invalid ${optionName} value "${value}". Use an integer.`);
	}
	return Number.parseInt(trimmed, 10);
}

async function calendlyGet(url: string, apiKey: string, timeout: number): Promise<unknown> {
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

		return data;
	} finally {
		clearTimeout(timer);
	}
}

async function fetchGetEventTypeResult(query: Record<string, unknown>, timeout: number): Promise<unknown> {
	const apiKey = requireApiKey();
	const eventTypeUuid = extractEventTypeUuid(String(query.event_type_uri));
	const data = await calendlyGet(`https://api.calendly.com/event_types/${encodeURIComponent(eventTypeUuid)}`, apiKey, timeout);
	return shapeGetEventTypeResult(data as Record<string, unknown>, query as any);
}

async function fetchListEventTypesResult(query: Record<string, unknown>, timeout: number): Promise<unknown> {
	const apiKey = requireApiKey();
	const params = new URLSearchParams();
	if (typeof query.user_uri === 'string' && query.user_uri.length > 0) {
		params.append('user', query.user_uri);
	}
	if (typeof query.organization_uri === 'string' && query.organization_uri.length > 0) {
		params.append('organization', query.organization_uri);
	}
	if (typeof query.count === 'number' && Number.isFinite(query.count)) {
		params.append('count', String(query.count));
	}

	const data = await calendlyGet(`https://api.calendly.com/event_types?${params.toString()}`, apiKey, timeout);
	return shapeListEventTypesResult(data as Record<string, unknown>, query as any);
}

async function fetchEventTypeAvailabilityResult(query: Record<string, unknown>, timeout: number): Promise<unknown> {
	const apiKey = requireApiKey();
	const params = new URLSearchParams();
	params.append('event_type', String(query.event_type_uri));
	params.append('start_time', String(query.start_time));
	params.append('end_time', String(query.end_time));
	if (typeof query.timezone === 'string' && query.timezone.length > 0) {
		params.append('timezone', query.timezone);
	}

	const data = await calendlyGet(`https://api.calendly.com/event_type_available_times?${params.toString()}`, apiKey, timeout);
	return shapeEventTypeAvailabilityResult(data as Record<string, unknown>, query as any);
}

export function registerEventTypeCommands(program: Command): void {
	program
		.command('list-event-types')
		.summary('list-event-types (--user-uri <user-uri> | --organization-uri <organization-uri>) [--count <count:number>] [--raw <json>]')
		.description('List available event types for scheduling meetings')
		.usage('(--user-uri <user-uri> | --organization-uri <organization-uri>) [--count <count:number>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--user-uri <user-uri>', 'URI of the user whose event types to list')
		.option('--organization-uri <organization-uri>', 'URI of the organization to filter event types')
		.option('--count <count:number>', 'Number of event types to return (default 20, max 100) (example: 20)', (value) => parseIntegerFlag(value, 'count'))
		.alias('list_event_types')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const timeout = globalOptions.timeout || 30000;
			const rawArgs = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
			const query = normalizeListEventTypesQuery(cmdOpts, rawArgs) as unknown as Record<string, unknown>;
			let mcpResult: unknown;
			let mcpErrorMessage: string | undefined;
			try {
				const runtime = await ensureRuntime();
				const proxy = getServerProxy(runtime) as any;
				try {
					const call = proxy.listEventTypes(toListEventTypesMcpArgs(query as any));
					mcpResult = await invokeWithTimeout(call, timeout);
					const mcpRaw = createCallResult(mcpResult).raw as Record<string, unknown> | undefined;
					if (mcpRaw && Array.isArray(mcpRaw.collection)) {
						printResult(shapeListEventTypesResult(mcpRaw, query as any), globalOptions.output ?? 'text');
						return;
					}
				} catch (error) {
					mcpErrorMessage = error instanceof Error ? error.message : String(error);
				} finally {
					await runtime.close(SERVER_NAME).catch(() => {});
				}
			} catch (error) {
				mcpErrorMessage = error instanceof Error ? error.message : String(error);
			}
			try {
				const restResult = await fetchListEventTypesResult(query, timeout);
				printResult(restResult, globalOptions.output ?? 'text');
			} catch (error) {
				if (mcpResult !== undefined) {
					printMcpResult(mcpResult, globalOptions.output ?? 'text');
					return;
				}
				let message = error instanceof Error ? error.message : String(error);
				if (mcpErrorMessage) {
					message = `${message} (MCP tool fallback failed: ${mcpErrorMessage})`;
				}
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + './calendly list-event-types --organization-uri https://api.calendly.com/organizations/ORG_123 --count 20');

	program
		.command('get-event-type')
		.summary('get-event-type --event-type-uri <event-type-uri> [--raw <json>]')
		.description('Get details of a specific event type')
		.usage('--event-type-uri <event-type-uri> [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--event-type-uri <event-type-uri>', 'URI of the event type to retrieve')
		.alias('get_event_type')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const timeout = globalOptions.timeout || 30000;
			const rawArgs = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
			const query = normalizeGetEventTypeQuery(cmdOpts, rawArgs) as unknown as Record<string, unknown>;
			let mcpResult: unknown;
			let mcpErrorMessage: string | undefined;
			try {
				const runtime = await ensureRuntime();
				const proxy = getServerProxy(runtime) as any;
				try {
					const call = proxy.getEventType({
						event_type: query.event_type_uri,
					});
					mcpResult = await invokeWithTimeout(call, timeout);
					const mcpRaw = createCallResult(mcpResult).raw as Record<string, unknown> | undefined;
					if (mcpRaw) {
						const shaped = shapeGetEventTypeResult(mcpRaw, query as any);
						const found = Boolean((shaped.meta as Record<string, unknown> | undefined)?.found);
						if (found) {
							printResult(shaped, globalOptions.output ?? 'text');
							return;
						}
					}
				} catch (error) {
					mcpErrorMessage = error instanceof Error ? error.message : String(error);
				} finally {
					await runtime.close(SERVER_NAME).catch(() => {});
				}
			} catch (error) {
				mcpErrorMessage = error instanceof Error ? error.message : String(error);
			}
			try {
				const restResult = await fetchGetEventTypeResult(query, timeout);
				printResult(restResult, globalOptions.output ?? 'text');
			} catch (error) {
				if (mcpResult !== undefined) {
					printMcpResult(mcpResult, globalOptions.output ?? 'text');
					return;
				}
				let message = error instanceof Error ? error.message : String(error);
				if (mcpErrorMessage) {
					message = `${message} (MCP tool fallback failed: ${mcpErrorMessage})`;
				}
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + './calendly get-event-type --event-type-uri https://api.calendly.com/event_types/ET_123');

	program
		.command('get-event-type-availability')
		.summary('get-event-type-availability --event-type-uri <event-type-uri> --start-time <start-time:iso-8601> --end-time <end-time:iso-8601> [--timezone <timezone>] [--raw <json>]')
		.description('Get available time slots for a specific event type')
		.usage('--event-type-uri <event-type-uri> --start-time <start-time:iso-8601> --end-time <end-time:iso-8601> [--timezone <timezone>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--event-type-uri <event-type-uri>', 'Event type URI to check availability for')
		.option('--start-time <start-time:iso-8601>', 'Start time for availability window (ISO 8601 format)')
		.option('--end-time <end-time:iso-8601>', 'End time for availability window (ISO 8601 format)')
		.option('--timezone <timezone>', 'Optional IANA timezone (example: America/New_York)')
		.alias('get_event_type_availability')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const timeout = globalOptions.timeout || 30000;
			const rawArgs = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
			const query = normalizeEventTypeAvailabilityQuery(cmdOpts, rawArgs) as unknown as Record<string, unknown>;
			let mcpResult: unknown;
			let mcpErrorMessage: string | undefined;
			try {
				const runtime = await ensureRuntime();
				const proxy = getServerProxy(runtime) as any;
				try {
					const mcpArgs: Record<string, unknown> = {
						event_type: query.event_type_uri,
						start_time: query.start_time,
						end_time: query.end_time,
					};
					if (query.timezone) {
						mcpArgs.timezone = query.timezone;
					}
					const call = proxy.getEventTypeAvailability(mcpArgs);
					mcpResult = await invokeWithTimeout(call, timeout);
					const mcpRaw = createCallResult(mcpResult).raw as Record<string, unknown> | undefined;
					if (mcpRaw && Array.isArray(mcpRaw.collection)) {
						printResult(shapeEventTypeAvailabilityResult(mcpRaw, query as any), globalOptions.output ?? 'text');
						return;
					}
				} catch (error) {
					mcpErrorMessage = error instanceof Error ? error.message : String(error);
				} finally {
					await runtime.close(SERVER_NAME).catch(() => {});
				}
			} catch (error) {
				mcpErrorMessage = error instanceof Error ? error.message : String(error);
			}
			try {
				const restResult = await fetchEventTypeAvailabilityResult(query, timeout);
				printResult(restResult, globalOptions.output ?? 'text');
			} catch (error) {
				if (mcpResult !== undefined) {
					printMcpResult(mcpResult, globalOptions.output ?? 'text');
					return;
				}
				let message = error instanceof Error ? error.message : String(error);
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
				'./calendly get-event-type-availability --event-type-uri https://api.calendly.com/event_types/ET_123 --start-time 2026-03-01T00:00:00Z --end-time 2026-03-02T00:00:00Z --timezone America/New_York'
		);
}
