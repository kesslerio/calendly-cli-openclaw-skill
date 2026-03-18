import { normalizeDateRange } from './date-range';
import { getCountPageWindow, getTeamSearchTruncationReason, toMembershipUserUri, toTeamMemberContext, type TeamMemberContext } from './search-team-helpers';
import { eventInviteeCount, hydrateMissingInvitees, normalizeInvitees } from './list-events-invitees';

export type TeamEventsCmdOptions = {
	raw?: string;
	organizationUri?: string;
	status?: 'active' | 'canceled';
	minStartTime?: string;
	maxStartTime?: string;
	count?: number;
	maxMembershipPages?: number;
	memberEmail?: string;
	memberUri?: string;
	eventTypeName?: string;
	includeInvitees?: boolean;
	hydrateInvitees?: boolean;
	maxInviteeFetches?: number;
};

export type TeamEventsQuery = {
	organization_uri: string;
	status?: 'active' | 'canceled';
	min_start_time?: string;
	max_start_time?: string;
	count: number;
	max_membership_pages: number;
	member_email?: string;
	member_uri?: string;
	event_type_name?: string;
	include_invitees?: boolean;
	hydrate_invitees?: boolean;
	max_invitee_fetches?: number;
};

export type TeamMembershipPage = {
	collection: unknown;
	next_page_token?: string;
};

export type TeamEventsPage = {
	collection: unknown;
	next_page_token?: string;
};

export type TeamEventInviteesPage = {
	collection: unknown;
	next_page_token?: string;
};

export type TeamEventFetchers = {
	fetchMembershipPage: (pageToken?: string) => Promise<TeamMembershipPage>;
	fetchMemberEventsPage: (memberUserUri: string, pageToken?: string, includeInvitees?: boolean) => Promise<TeamEventsPage>;
	fetchEventInviteesPage: (eventUuid: string, pageToken?: string) => Promise<TeamEventInviteesPage>;
};

export type TeamEventRecord = {
	member: TeamMemberContext;
	event: any;
	invitees: ReturnType<typeof normalizeInvitees>;
	invitee_count: number;
};

export type TeamEventsResult = {
	query: TeamEventsQuery;
	meta: {
		memberships_scanned: number;
		members_scanned: number;
		membership_pages_scanned: number;
		event_pages_scanned: number;
		events_scanned: number;
		events_returned: number;
		has_more: boolean;
		truncation_reason?: string;
		include_invitees: boolean;
		invitee_hydration?: unknown;
	};
	collection: TeamEventRecord[];
};

function normalizeRequiredString(value: unknown, fieldName: string, requiredMessage: string): string {
	if (value === undefined || value === null) {
		throw new Error(requiredMessage);
	}
	if (typeof value !== 'string') {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	return trimmed;
}

function normalizeOptionalString(value: unknown, fieldName: string): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value !== 'string') {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}
	return trimmed;
}

function normalizeBoolean(value: unknown): boolean | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
		if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
	}
	throw new Error('boolean flags must be true or false');
}

function normalizeCount(value: unknown, fieldName: string, fallback: number): number {
	const numeric = typeof value === 'number' ? value : Number(value ?? fallback);
	if (!Number.isFinite(numeric)) {
		throw new Error(`${fieldName} must be a valid number`);
	}
	return Math.max(1, Math.min(100, Math.trunc(numeric)));
}

function normalizePositiveInt(value: unknown, fieldName: string, fallback: number): number {
	const numeric = typeof value === 'number' ? value : Number(value ?? fallback);
	if (!Number.isFinite(numeric)) {
		throw new Error(`${fieldName} must be a valid number`);
	}
	return Math.max(1, Math.trunc(numeric));
}

function normalizeEventTypeName(value: unknown): string | undefined {
	return normalizeOptionalString(value, 'event_type_name');
}

function matchesEventTypeName(event: any, eventTypeName?: string): boolean {
	if (!eventTypeName) {
		return true;
	}
	const needle = eventTypeName.toLowerCase();
	const candidates = [
		event?.name,
		event?.event_type_name,
		event?.event_type?.name,
		event?.event_type?.slug,
		event?.event_type?.uri,
	];
	return candidates.some((candidate) => typeof candidate === 'string' && candidate.toLowerCase().includes(needle));
}

function matchesMemberScope(member: TeamMemberContext, query: TeamEventsQuery): boolean {
	if (query.member_email && typeof member.user_email === 'string') {
		if (member.user_email.toLowerCase() !== query.member_email.toLowerCase()) {
			return false;
		}
	}
	if (query.member_email && typeof member.user_email !== 'string') {
		return false;
	}
	if (query.member_uri && member.user_uri !== query.member_uri) {
		return false;
	}
	return true;
}

function toRecordCollection(value: unknown): any[] {
	return Array.isArray(value) ? value.filter((entry) => Boolean(entry) && typeof entry === 'object') as any[] : [];
}

export function normalizeTeamEventsQuery(
	cmdOpts: TeamEventsCmdOptions,
	defaults: Record<string, unknown> = {},
	env: NodeJS.ProcessEnv = process.env,
): TeamEventsQuery {
	const rawOrganization =
		cmdOpts.organizationUri ??
		defaults.organization_uri ??
		defaults.organizationUri ??
		env.CALENDLY_ORGANIZATION_URI;
	const organization_uri = normalizeRequiredString(
		rawOrganization,
		'organization_uri',
		'organization_uri is required (use --organization-uri or --raw {"organization_uri":"..."})'
	);

	const rawStatus = cmdOpts.status ?? defaults.status;
	if (rawStatus !== undefined && rawStatus !== 'active' && rawStatus !== 'canceled') {
		throw new Error('status must be either "active" or "canceled"');
	}

	const count = normalizeCount(cmdOpts.count ?? defaults.count, 'count', 20);
	const max_membership_pages = normalizePositiveInt(cmdOpts.maxMembershipPages ?? defaults.max_membership_pages, 'max_membership_pages', 10);
	const member_email = normalizeOptionalString(cmdOpts.memberEmail ?? defaults.member_email ?? defaults.memberEmail, 'member_email');
	const member_uri = normalizeOptionalString(cmdOpts.memberUri ?? defaults.member_uri ?? defaults.memberUri, 'member_uri');
	const event_type_name = normalizeEventTypeName(cmdOpts.eventTypeName ?? defaults.event_type_name ?? defaults.eventTypeName);
	const include_invitees = normalizeBoolean(cmdOpts.includeInvitees ?? defaults.include_invitees ?? defaults.includeInvitees);
	const hydrate_invitees = normalizeBoolean(cmdOpts.hydrateInvitees ?? defaults.hydrate_invitees ?? defaults.hydrateInvitees);
	const max_invitee_fetches = cmdOpts.maxInviteeFetches ?? defaults.max_invitee_fetches ?? defaults.maxInviteeFetches;

	const { min_start_time, max_start_time } = normalizeDateRange({
		min_start_time: cmdOpts.minStartTime ?? defaults.min_start_time ?? defaults.minStartTime,
		max_start_time: cmdOpts.maxStartTime ?? defaults.max_start_time ?? defaults.maxStartTime,
	});

	return {
		organization_uri,
		...(rawStatus ? { status: rawStatus } : {}),
		...(min_start_time ? { min_start_time } : {}),
		...(max_start_time ? { max_start_time } : {}),
		count,
		max_membership_pages,
		...(member_email ? { member_email } : {}),
		...(member_uri ? { member_uri } : {}),
		...(event_type_name ? { event_type_name } : {}),
		...(include_invitees !== undefined ? { include_invitees } : {}),
		...(hydrate_invitees !== undefined ? { hydrate_invitees } : {}),
		...(max_invitee_fetches !== undefined ? { max_invitee_fetches: normalizePositiveInt(max_invitee_fetches, 'max_invitee_fetches', 25) } : {}),
	};
}

export async function scanTeamEvents(
	query: TeamEventsQuery,
	fetchers: TeamEventFetchers,
): Promise<TeamEventsResult> {
	const memberships: unknown[] = [];
	let membershipPageToken: string | undefined;
	let membershipPagesScanned = 0;
	let membershipPageLimitReached = false;

	do {
		const page = await fetchers.fetchMembershipPage(membershipPageToken);
		const pageMemberships = toRecordCollection(page?.collection);
		memberships.push(...pageMemberships);
		membershipPageToken = page?.next_page_token;
		membershipPagesScanned += 1;
	} while (membershipPageToken && membershipPagesScanned < query.max_membership_pages);

	if (Boolean(membershipPageToken) && membershipPagesScanned >= query.max_membership_pages) {
		membershipPageLimitReached = true;
	}

	const matchingMembers = memberships
		.map((membership) => ({ membership, userUri: toMembershipUserUri(membership) }))
		.filter(({ membership, userUri }) => Boolean(userUri) && matchesMemberScope(toTeamMemberContext(membership), query))
		.map(({ membership, userUri }) => ({ membership, userUri: userUri as string }));

	const seenMemberUris = new Set<string>();
	const uniqueMembers = matchingMembers.filter(({ userUri }) => {
		if (seenMemberUris.has(userUri)) {
			return false;
		}
		seenMemberUris.add(userUri);
		return true;
	});

	const { pageSize, maxPages } = getCountPageWindow(query.count);
	const collected: Array<{ member: TeamMemberContext; event: any }> = [];
	let membersScanned = 0;
	let eventPagesScanned = 0;
	let eventsScanned = 0;
	let reachedResultCap = false;
	let memberEventPageLimitReached = false;

	for (const { membership, userUri } of uniqueMembers) {
		if (collected.length >= query.count) {
			reachedResultCap = true;
			break;
		}
		membersScanned += 1;
		const memberContext = toTeamMemberContext(membership);
		let pageToken: string | undefined;
		let memberPages = 0;
		let memberEventsScanned = 0;
		const memberEventScanLimit = pageSize * maxPages;

		while (memberPages < maxPages && memberEventsScanned < memberEventScanLimit) {
			const page = await fetchers.fetchMemberEventsPage(userUri, pageToken, query.include_invitees === true);
			const events = toRecordCollection(page?.collection);
			memberPages += 1;
			eventPagesScanned += 1;
			memberEventsScanned += events.length;
			eventsScanned += events.length;

			for (const event of events) {
				if (!matchesEventTypeName(event, query.event_type_name)) {
					continue;
				}
				collected.push({ member: memberContext, event });
				if (collected.length >= query.count) {
					reachedResultCap = true;
					break;
				}
			}
			if (reachedResultCap) {
				break;
			}

			pageToken = page?.next_page_token;
			if (!pageToken) {
				break;
			}
		}

		if (Boolean(pageToken) && memberPages >= maxPages) {
			memberEventPageLimitReached = true;
		}
	}

	let hydratedEvents = collected.map((entry) => entry.event);
	let inviteeHydration: unknown = undefined;
	if (query.include_invitees === true && query.hydrate_invitees !== false) {
		const hydrated = await hydrateMissingInvitees(
			hydratedEvents,
			{
				hydrate_invitees: true,
				max_invitee_fetches: query.max_invitee_fetches,
			},
			fetchers.fetchEventInviteesPage,
		);
		hydratedEvents = hydrated.collection;
		inviteeHydration = hydrated.meta;
	}

	const collection = collected.map((entry, index) => {
		const event = hydratedEvents[index] ?? entry.event;
		const invitees = normalizeInvitees(event?.invitees);
		return {
			member: entry.member,
			event,
			invitees,
			invitee_count: eventInviteeCount(event),
		};
	});

	const truncationReason = getTeamSearchTruncationReason({
		membershipPageLimitReached,
		memberEventPageLimitReached,
		resultCapReached: reachedResultCap,
	});

	return {
		query,
		meta: {
			memberships_scanned: memberships.length,
			members_scanned: membersScanned,
			membership_pages_scanned: membershipPagesScanned,
			event_pages_scanned: eventPagesScanned,
			events_scanned: eventsScanned,
			events_returned: collection.length,
			has_more: Boolean(truncationReason),
			...(truncationReason ? { truncation_reason: truncationReason } : {}),
			include_invitees: query.include_invitees === true,
			...(inviteeHydration ? { invitee_hydration: inviteeHydration } : {}),
		},
		collection,
	};
}

export function createTeamEventsTextLabel(record: TeamEventRecord): string {
	const memberLabel = record.member.user_name ?? record.member.user_email ?? record.member.user_uri ?? 'Unknown member';
	const eventLabel = record.event?.name ?? record.event?.event_type?.name ?? record.event?.event_type_name ?? 'Unnamed event';
	return `${memberLabel} — ${eventLabel}`;
}

export function printTeamEventsResult(resultData: TeamEventsResult, format: string): void {
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
		console.log('## Team Events\n');
		console.log('| Member | Event | Start Time | Status | Invitees |');
		console.log('|--------|-------|------------|--------|----------|');
		for (const record of events) {
			const inviteeNames = normalizeInvitees(record.invitees).map((invitee: any) => invitee.name || invitee.email).join(', ') || 'None';
			console.log(`| ${record.member.user_name || record.member.user_email || record.member.user_uri || 'Unknown member'} | ${record.event?.name || 'Unnamed event'} | ${record.event?.start_time || ''} | ${record.event?.status || ''} | ${record.invitee_count || 0} (${inviteeNames}) |`);
		}
		return;
	}

	if (events.length === 0) {
		console.log('No events found.');
		return;
	}

	console.log('Team Events:\n');
	for (const record of events) {
		console.log(`Event: ${record.event?.name || 'Unnamed event'}`);
		console.log(`  Member: ${record.member.user_name || record.member.user_email || record.member.user_uri || 'Unknown member'}`);
		console.log(`  Start: ${record.event?.start_time || ''}`);
		console.log(`  Status: ${record.event?.status || ''}`);
		console.log(`  Label: ${createTeamEventsTextLabel(record)}`);
		console.log('  Invitees:');
		const invitees = normalizeInvitees(record.event?.invitees);
		if (invitees.length === 0) {
			console.log('    (none)');
		} else {
			for (const invitee of invitees) {
				console.log(`    - ${invitee.name || invitee.email || 'Unknown invitee'}${invitee.email ? ` <${invitee.email}>` : ''}`);
			}
		}
	}
}
