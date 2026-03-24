import { Command } from 'commander';
import { printResult } from './output';
import { ensureRuntime, getServerProxy, invokeWithTimeout, printMcpResult, SERVER_NAME } from './runtime';

function requireApiKey(): string {
	const apiKey = process.env.CALENDLY_API_KEY;
	if (!apiKey) {
		throw new Error('CALENDLY_API_KEY environment variable is required');
	}
	return apiKey;
}

async function calendlyPost(
	url: string,
	apiKey: string,
	timeout: number,
	body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: body ? JSON.stringify(body) : undefined,
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

async function cancelEventViaRest(args: Record<string, unknown>, timeout: number): Promise<Record<string, unknown>> {
	const eventUuid = typeof args.event_uuid === 'string' ? args.event_uuid.trim() : '';
	if (!eventUuid) {
		throw new Error('event_uuid is required');
	}
	const apiKey = requireApiKey();
	const reason = typeof args.reason === 'string' && args.reason.trim() ? args.reason.trim() : undefined;
	return calendlyPost(
		`https://api.calendly.com/scheduled_events/${encodeURIComponent(eventUuid)}/cancellation`,
		apiKey,
		timeout,
		reason ? { reason } : undefined
	);
}

export function registerBasicEventCommands(program: Command): void {
	program
		.command('get-event')
		.summary('get-event --event-uuid <event-uuid> [--raw <json>]')
		.description('Get details of a specific event')
		.usage('--event-uuid <event-uuid> [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.requiredOption('--event-uuid <event-uuid>', 'UUID of the event to retrieve (example: example-id)')
		.alias('get_event')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const runtime = await ensureRuntime();
			const proxy = getServerProxy(runtime) as any;
			try {
				const args = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
				if (cmdOpts.eventUuid !== undefined) args.event_uuid = cmdOpts.eventUuid;
				const call = proxy.getEvent(args);
				const result = await invokeWithTimeout(call, globalOptions.timeout || 30000);
				printMcpResult(result, globalOptions.output ?? 'text');
			} finally {
				await runtime.close(SERVER_NAME).catch(() => {});
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + 'mcporter call calendly.get_event(event_uuid: "example-id")');

	program
		.command('list-event-invitees')
		.summary('list-event-invitees --event-uuid <event-uuid> [--status <status:active|canceled>] [--email <email>] [--count <count:number>] [--raw <json>]')
		.description('List invitees for a specific event')
		.usage('--event-uuid <event-uuid> [--status <status:active|canceled>] [--email <email>] [--count <count:number>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.requiredOption('--event-uuid <event-uuid>', 'UUID of the event (example: example-id)')
		.option('--status <status:active|canceled>', 'Filter invitees by status (choices: active, canceled; example: active)')
		.option('--email <email>', 'Filter invitees by email')
		.option('--count <count:number>', 'Number of invitees to return (default 20, max 100) (example: 1)', (value) => parseFloat(value))
		.alias('list_event_invitees')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const runtime = await ensureRuntime();
			const proxy = getServerProxy(runtime) as any;
			try {
				const args = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
				if (cmdOpts.eventUuid !== undefined) args.event_uuid = cmdOpts.eventUuid;
				if (cmdOpts.status !== undefined) args.status = cmdOpts.status;
				if (cmdOpts.email !== undefined) args.email = cmdOpts.email;
				if (cmdOpts.count !== undefined) args.count = cmdOpts.count;
				const call = proxy.listEventInvitees(args);
				const result = await invokeWithTimeout(call, globalOptions.timeout || 30000);
				printMcpResult(result, globalOptions.output ?? 'text');
			} finally {
				await runtime.close(SERVER_NAME).catch(() => {});
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + 'mcporter call calendly.list_event_invitees(event_uuid: "example-id", status: "active")');

	program
		.command('cancel-event')
		.summary('cancel-event --event-uuid <event-uuid> [--reason <reason>] [--raw <json>]')
		.description('Cancel a specific event')
		.usage('--event-uuid <event-uuid> [--reason <reason>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.requiredOption('--event-uuid <event-uuid>', 'UUID of the event to cancel (example: example-id)')
		.option('--reason <reason>', 'Reason for cancellation')
		.alias('cancel_event')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const timeout = globalOptions.timeout || 30000;
			const args = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
			if (cmdOpts.eventUuid !== undefined) args.event_uuid = cmdOpts.eventUuid;
			if (cmdOpts.reason !== undefined) args.reason = cmdOpts.reason;

			let mcpErrorMessage: string | undefined;
			try {
				const runtime = await ensureRuntime();
				const proxy = getServerProxy(runtime) as any;
				try {
					const call = proxy.cancelEvent(args);
					const result = await invokeWithTimeout(call, timeout);
					printMcpResult(result, globalOptions.output ?? 'text');
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
				const restResult = await cancelEventViaRest(args, timeout);
				printResult(restResult, globalOptions.output ?? 'text');
			} catch (error) {
				let message = error instanceof Error ? error.message : String(error);
				if (mcpErrorMessage) {
					message = `${message} (MCP tool fallback failed: ${mcpErrorMessage})`;
				}
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + 'mcporter call calendly.cancel_event(event_uuid: "example-id")');
}
