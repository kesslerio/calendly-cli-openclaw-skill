import { Command } from 'commander';
import {
	filterInviteesByEmail,
	getCountPageWindow,
	getTeamSearchTruncationReason,
	normalizeTeamSearchOptions,
	toMembershipUserUri,
	toTeamMemberContext,
} from '../search-team-helpers';
import { printResult } from './output';

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

function nextPageTokenFrom(data: Record<string, unknown>): string | undefined {
	const pagination =
		data.pagination && typeof data.pagination === 'object'
			? (data.pagination as Record<string, unknown>)
			: {};
	return typeof pagination.next_page_token === 'string' && pagination.next_page_token.length > 0
		? pagination.next_page_token
		: undefined;
}

export function registerSearchTeamCommands(program: Command): void {
	program
		.command('search-team')
		.summary('search-team --email <email> [--min-start-time <min-start-time:iso-8601>] [--max-start-time <max-start-time:iso-8601>] [--status <status:active|canceled>] [--organization-uri <organization-uri>] [--count <count:number>] [--max-membership-pages <max-membership-pages:number>]')
		.description('Search invitee email across team members by scanning organization memberships and member events')
		.usage('--email <email> [--min-start-time <min-start-time:iso-8601>] [--max-start-time <max-start-time:iso-8601>] [--status <status:active|canceled>] [--organization-uri <organization-uri>] [--count <count:number>] [--max-membership-pages <max-membership-pages:number>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--email <email>', 'Invitee email to search for')
		.option('--min-start-time <min-start-time:iso-8601>', 'Minimum start time for events (ISO 8601 format)')
		.option('--max-start-time <max-start-time:iso-8601>', 'Maximum start time for events (ISO 8601 format)')
		.option('--status <status:active|canceled>', 'Filter events by status (choices: active, canceled; example: active)')
		.option('--organization-uri <organization-uri>', 'Optional organization URI scope')
		.option('--count <count:number>', 'Maximum number of matching events to return (default 20, max 100)', (value) => parseInt(value, 10))
		.option('--max-membership-pages <max-membership-pages:number>', 'Maximum organization membership pages to scan (default 10); results can be truncated when more pages exist', (value) => parseInt(value, 10))
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			try {
				const rawArgs = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
				const query = normalizeTeamSearchOptions(cmdOpts as Record<string, unknown>, rawArgs);
				const apiKey = requireApiKey();
				const timeout = globalOptions.timeout || 30000;
				const memberships: Record<string, unknown>[] = [];
				let membershipPageToken: string | undefined;
				let membershipPagesScanned = 0;
				let membershipPageLimitReached = false;

				do {
					const membershipParams = new URLSearchParams();
					membershipParams.append('count', '100');
					if (query.organization_uri) membershipParams.append('organization', query.organization_uri);
					if (membershipPageToken) membershipParams.append('page_token', membershipPageToken);

					const membershipResponse = await calendlyGet(
						`https://api.calendly.com/organization_memberships?${membershipParams.toString()}`,
						apiKey,
						timeout
					);

					const pageMemberships = Array.isArray(membershipResponse.collection)
						? (membershipResponse.collection as Record<string, unknown>[])
						: [];
					memberships.push(...pageMemberships);
					membershipPageToken = nextPageTokenFrom(membershipResponse);
					membershipPagesScanned += 1;
				} while (membershipPageToken && membershipPagesScanned < query.max_membership_pages);

				if (Boolean(membershipPageToken) && membershipPagesScanned >= query.max_membership_pages) {
					membershipPageLimitReached = true;
				}

				const members = memberships.filter((membership) => Boolean(toMembershipUserUri(membership)));
				const seenMemberUris = new Set<string>();
				const uniqueMembers = members.filter((membership) => {
					const userUri = toMembershipUserUri(membership);
					if (!userUri) return false;
					if (seenMemberUris.has(userUri)) return false;
					seenMemberUris.add(userUri);
					return true;
				});

				const matches: Record<string, unknown>[] = [];
				const { pageSize, maxPages } = getCountPageWindow(query.count);
				let membersScanned = 0;
				let eventPagesScanned = 0;
				let eventsScanned = 0;
				let reachedResultCap = false;
				let memberEventPageLimitReached = false;

				for (const membership of uniqueMembers) {
					if (matches.length >= query.count) {
						reachedResultCap = true;
						break;
					}
					membersScanned += 1;
					const memberUserUri = toMembershipUserUri(membership);
					if (!memberUserUri) continue;
					let pageToken: string | undefined;
					let memberPages = 0;
					let memberEventsScanned = 0;
					const memberEventScanLimit = pageSize * maxPages;

					while (memberPages < maxPages && memberEventsScanned < memberEventScanLimit) {
						const eventParams = new URLSearchParams();
						eventParams.append('count', pageSize.toString());
						eventParams.append('expand', 'invitees');
						eventParams.append('user', memberUserUri);
						if (query.organization_uri) eventParams.append('organization', query.organization_uri);
						if (query.status) eventParams.append('status', query.status);
						if (query.min_start_time) eventParams.append('min_start_time', query.min_start_time);
						if (query.max_start_time) eventParams.append('max_start_time', query.max_start_time);
						if (pageToken) eventParams.append('page_token', pageToken);

						const eventsResponse = await calendlyGet(
							`https://api.calendly.com/scheduled_events?${eventParams.toString()}`,
							apiKey,
							timeout
						);

						const events = Array.isArray(eventsResponse.collection) ? eventsResponse.collection : [];
						memberPages += 1;
						eventPagesScanned += 1;
						memberEventsScanned += events.length;
						eventsScanned += events.length;

						for (const event of events) {
							const eventRecord = event && typeof event === 'object' ? (event as Record<string, unknown>) : {};
							const matchingInvitees = filterInviteesByEmail(eventRecord.invitees, query.email);
							if (matchingInvitees.length > 0) {
								matches.push({
									member: toTeamMemberContext(membership),
									event: eventRecord,
									matching_invitees: matchingInvitees,
								});
								if (matches.length >= query.count) {
									reachedResultCap = true;
									break;
								}
							}
						}
						if (reachedResultCap) break;

						pageToken = nextPageTokenFrom(eventsResponse);
						if (!pageToken) break;
					}

					if (Boolean(pageToken) && memberPages >= maxPages) {
						memberEventPageLimitReached = true;
					}
				}

				const truncationReason = getTeamSearchTruncationReason({
					membershipPageLimitReached,
					memberEventPageLimitReached,
					resultCapReached: reachedResultCap,
				});

				printResult(
					{
						query,
						meta: {
							memberships_scanned: memberships.length,
							members_scanned: membersScanned,
							membership_pages_scanned: membershipPagesScanned,
							event_pages_scanned: eventPagesScanned,
							events_scanned: eventsScanned,
							matches: matches.length,
							has_more: Boolean(truncationReason),
							...(truncationReason ? { truncation_reason: truncationReason } : {}),
						},
						collection: matches.slice(0, query.count),
					},
					globalOptions.output ?? 'text'
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + './calendly search-team --email person@example.com --organization-uri <ORG_URI> --count 25');
}
