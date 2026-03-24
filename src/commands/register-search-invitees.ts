import { Command } from 'commander';
import { normalizeDateRange } from '../date-range';
import { printResult } from './output';

function requireApiKey(): string {
	const apiKey = process.env.CALENDLY_API_KEY;
	if (!apiKey) {
		throw new Error('CALENDLY_API_KEY environment variable is required');
	}
	return apiKey;
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

export function registerSearchInviteesCommands(program: Command): void {
	program
		.command('search-invitees')
		.summary('search-invitees --email <email> [--user-uri <user-uri>] [--organization-uri <organization-uri>] [--status <status:active|canceled>] [--min-start-time <min-start-time:iso-8601>] [--max-start-time <max-start-time:iso-8601>] [--page-size <page-size:number>] [--max-pages <max-pages:number>]')
		.description('Search invitees by email across paginated organization events')
		.usage('--email <email> [--user-uri <user-uri>] [--organization-uri <organization-uri>] [--status <status:active|canceled>] [--min-start-time <min-start-time:iso-8601>] [--max-start-time <max-start-time:iso-8601>] [--page-size <page-size:number>] [--max-pages <max-pages:number>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--email <email>', 'Invitee email to search for')
		.option('--user-uri <user-uri>', 'Optional user URI scope')
		.option('--organization-uri <organization-uri>', 'Optional organization URI scope')
		.option('--status <status:active|canceled>', 'Filter events by status (choices: active, canceled; example: active)')
		.option('--min-start-time <min-start-time:iso-8601>', 'Minimum start time for events (ISO 8601 format)')
		.option('--max-start-time <max-start-time:iso-8601>', 'Maximum start time for events (ISO 8601 format)')
		.option('--page-size <page-size:number>', 'Events page size (default 100, max 100)', (value) => parseInt(value, 10))
		.option('--max-pages <max-pages:number>', 'Maximum number of pages to scan (default 20)', (value) => parseInt(value, 10))
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			try {
				const args = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
				const email = cmdOpts.email ?? args.email;
				if (!email) throw new Error('email is required (use --email or --raw {"email":"..."})');
				const userUri = cmdOpts.userUri ?? args.user_uri;
				const organizationUri = cmdOpts.organizationUri ?? args.organization_uri;
				const status = cmdOpts.status ?? args.status;
				const { min_start_time: minStartTime, max_start_time: maxStartTime } = normalizeDateRange({
					min_start_time: cmdOpts.minStartTime ?? args.min_start_time,
					max_start_time: cmdOpts.maxStartTime ?? args.max_start_time,
				});
				const apiKey = requireApiKey();
				const pageSizeInput = Number(cmdOpts.pageSize ?? args.page_size ?? 100);
				const maxPagesInput = Number(cmdOpts.maxPages ?? args.max_pages ?? 20);
				if (!Number.isFinite(pageSizeInput) || !Number.isFinite(maxPagesInput)) {
					throw new Error('page-size and max-pages must be valid numbers');
				}
				const pageSize = Math.max(1, Math.min(100, Math.trunc(pageSizeInput)));
				const maxPages = Math.max(1, Math.trunc(maxPagesInput));
				const normalizedEmail = String(email).trim().toLowerCase();
				let pageToken: string | undefined;
				let scannedPages = 0;
				let scannedEvents = 0;
				const matches: Record<string, unknown>[] = [];

				while (scannedPages < maxPages) {
					const params = new URLSearchParams();
					params.append('count', pageSize.toString());
					params.append('expand', 'invitees');
					if (userUri) params.append('user', String(userUri));
					if (organizationUri) params.append('organization', String(organizationUri));
					if (status) params.append('status', String(status));
					if (minStartTime) params.append('min_start_time', String(minStartTime));
					if (maxStartTime) params.append('max_start_time', String(maxStartTime));
					if (pageToken) params.append('page_token', pageToken);

					const response = await calendlyGet(
						`https://api.calendly.com/scheduled_events?${params.toString()}`,
						apiKey,
						globalOptions.timeout || 30000
					);

					const events = Array.isArray(response.collection) ? response.collection : [];
					scannedPages += 1;
					scannedEvents += events.length;

					for (const event of events) {
						const eventRecord = event && typeof event === 'object' ? (event as Record<string, unknown>) : {};
						const invitees = Array.isArray(eventRecord.invitees) ? eventRecord.invitees : [];
						const matchingInvitees = invitees.filter((invitee) => {
							if (!invitee || typeof invitee !== 'object') return false;
							const emailValue = (invitee as Record<string, unknown>).email;
							return typeof emailValue === 'string' && emailValue.toLowerCase() === normalizedEmail;
						});
						if (matchingInvitees.length > 0) {
							matches.push({ event: eventRecord, matching_invitees: matchingInvitees });
						}
					}

					const pagination =
						response.pagination && typeof response.pagination === 'object'
							? (response.pagination as Record<string, unknown>)
							: {};
					pageToken =
						typeof pagination.next_page_token === 'string' && pagination.next_page_token.length > 0
							? pagination.next_page_token
							: undefined;
					if (!pageToken) break;
				}

				printResult(
					{
						query: {
							email: normalizedEmail,
							user_uri: userUri,
							organization_uri: organizationUri,
							status,
							min_start_time: minStartTime,
							max_start_time: maxStartTime,
							page_size: pageSize,
							max_pages: maxPages,
						},
						meta: {
							pages_scanned: scannedPages,
							events_scanned: scannedEvents,
							matches: matches.length,
							has_more: scannedPages >= maxPages && Boolean(pageToken),
						},
						collection: matches,
					},
					globalOptions.output ?? 'text'
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + './calendly search-invitees --email person@example.com --organization-uri <ORG_URI>');
}
