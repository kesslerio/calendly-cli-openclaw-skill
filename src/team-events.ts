import { normalizeDateRange } from './date-range';
import { getCountPageWindow, getTeamSearchTruncationReason, toMembershipUserUri, toTeamMemberContext, type TeamMemberContext } from './search-team-helpers';
import { eventInviteeCount, getEventUuid, hydrateMissingInvitees, normalizeInvitees, type InviteeHydrationMeta } from './list-events-invitees';

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
	fetchMemberEventsPage: (memberUserUri: string, pageToken?: string, includeInvitees?: boolean, pageSize?: number) => Promise<TeamEventsPage>;
	fetchOrganizationEventsPage?: (pageToken?: string, includeInvitees?: boolean, pageSize?: number) => Promise<TeamEventsPage>;
	fetchEventInviteesPage: (eventUuid: string, pageToken?: string) => Promise<TeamEventInviteesPage>;
};

export type TeamEventRecord = {
	member: TeamMemberContext;
	members: TeamMemberContext[];
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
	];
	return candidates.some((candidate) => typeof candidate === 'string' && candidate.toLowerCase().includes(needle));
}

function matchesMemberScope(member: TeamMemberContext, query: TeamEventsQuery): boolean {
	if (query.member_email && typeof member.user_email === 'string') {
		if (member.user_email.toLowerCase() !== query.member_email.toLowerCase()) {
			return false;
		}
	}
	if (query.member_uri && member.user_uri !== query.member_uri) {
		return false;
	}
	return true;
}

function toEventMemberContexts(event: any): TeamMemberContext[] {
	const memberships = Array.isArray(event?.event_memberships) ? event.event_memberships : [];
	return memberships
		.filter((membership: any) => Boolean(membership) && typeof membership === 'object')
		.map((membership: any) => {
			const nestedUser = typeof membership?.user === 'object' && membership.user !== null ? membership.user : undefined;
			const userUri = typeof membership?.user === 'string'
				? membership.user
				: (typeof nestedUser?.uri === 'string' ? nestedUser.uri : undefined);
			const userEmail = typeof membership?.user_email === 'string'
				? membership.user_email
				: (typeof membership?.email === 'string'
					? membership.email
					: (typeof nestedUser?.email === 'string' ? nestedUser.email : undefined));
			const userName = typeof membership?.user_name === 'string'
				? membership.user_name
				: (typeof nestedUser?.name === 'string' ? nestedUser.name : undefined);
			return {
				user_uri: userUri,
				user_email: userEmail,
				user_name: userName,
				organization_uri: typeof membership?.organization === 'string' ? membership.organization : undefined,
			} satisfies TeamMemberContext;
		});
}

function matchesOrgFallbackScope(event: any, query: TeamEventsQuery): boolean {
	if (!query.member_email && !query.member_uri) {
		return true;
	}
	const eventMembers = toEventMemberContexts(event);
	if (eventMembers.length === 0) {
		return false;
	}
	return eventMembers.some((member) => matchesMemberScope(member, query));
}

function getTeamEventDedupKey(event: any): string | undefined {
	const eventUuid = getEventUuid(event);
	if (eventUuid) {
		return `uuid:${eventUuid}`;
	}
	if (typeof event?.uri === 'string' && event.uri.length > 0) {
		return `uri:${event.uri}`;
	}
	return undefined;
}

function toEventTimeSortKey(event: any): number {
	const raw = event?.start_time;
	if (typeof raw !== 'string' || raw.length === 0) {
		return Number.POSITIVE_INFINITY;
	}
	const parsed = Date.parse(raw);
	return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function sameMember(left: TeamMemberContext, right: TeamMemberContext): boolean {
	if (left.user_uri && right.user_uri) {
		return left.user_uri === right.user_uri;
	}
	if (left.user_email && right.user_email) {
		return left.user_email.toLowerCase() === right.user_email.toLowerCase();
	}
	return false;
}

function createMemberDisplayLabel(member: TeamMemberContext): string {
	return member.user_name ?? member.user_email ?? member.user_uri ?? 'Unknown member';
}

function createMembersDisplayLabel(members: TeamMemberContext[]): string {
	const labels = members.map(createMemberDisplayLabel);
	return labels.join(', ');
}

function createUnattributedMemberContext(organizationUri: string, userName: string = 'Former or unknown member'): TeamMemberContext {
	return {
		organization_uri: organizationUri,
		user_name: userName,
	};
}

function toRecordCollection(value: unknown): any[] {
	return Array.isArray(value) ? value.filter((entry) => Boolean(entry) && typeof entry === 'object') as any[] : [];
}

async function hydrateTeamEventInvitees(
	events: any[],
	maxInviteeFetches: number | undefined,
	fetchInviteesPage: TeamEventFetchers['fetchEventInviteesPage'],
): Promise<{ collection: any[]; meta: InviteeHydrationMeta & { max_fetches_per_event: number } }> {
	const maxFetchesPerEvent = maxInviteeFetches ?? 25;
	const aggregated: InviteeHydrationMeta & { max_fetches_per_event: number } = {
		enabled: true,
		used: false,
		max_fetches: 0,
		max_fetches_per_event: maxFetchesPerEvent,
		fetches_used: 0,
		events_needing_hydration: 0,
		events_hydrated: 0,
		events_failed: 0,
		events_skipped_missing_uuid: 0,
		events_skipped_due_to_cap: 0,
		truncated: false,
	};

	const collection: any[] = [];
	for (const event of events) {
		const hydrated = await hydrateMissingInvitees(
			[event],
			{
				hydrate_invitees: true,
				max_invitee_fetches: maxInviteeFetches,
			},
			fetchInviteesPage,
		);
		collection.push(hydrated.collection[0] ?? event);
		aggregated.used = aggregated.used || hydrated.meta.used;
		aggregated.fetches_used += hydrated.meta.fetches_used;
		aggregated.events_needing_hydration += hydrated.meta.events_needing_hydration;
		aggregated.events_hydrated += hydrated.meta.events_hydrated;
		aggregated.events_failed += hydrated.meta.events_failed;
		aggregated.events_skipped_missing_uuid += hydrated.meta.events_skipped_missing_uuid;
		aggregated.events_skipped_due_to_cap += hydrated.meta.events_skipped_due_to_cap;
		aggregated.truncated = aggregated.truncated || hydrated.meta.truncated;
	}

	if (aggregated.truncated) {
		aggregated.truncation_reason = 'max_invitee_fetches_reached';
	}
	aggregated.max_fetches = aggregated.events_needing_hydration * maxFetchesPerEvent;

	return { collection, meta: aggregated };
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
	const max_membership_pages = normalizePositiveInt(cmdOpts.maxMembershipPages ?? defaults.max_membership_pages ?? defaults.maxMembershipPages, 'max_membership_pages', 10);
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
	const collected: Array<{ member: TeamMemberContext; members: TeamMemberContext[]; event: any; scanIndex: number }> = [];
	const seenEventKeys = new Set<string>();
	const seenEventIndexByKey = new Map<string, number>();
	let nextScanIndex = 0;
	let membersScanned = 0;
	let eventPagesScanned = 0;
	let eventsScanned = 0;
	let reachedResultCap = false;
	let memberEventPageLimitReached = false;
	const shouldRunOrganizationFallback = Boolean(fetchers.fetchOrganizationEventsPage) && (
		membershipPageLimitReached ||
		uniqueMembers.length === 0 ||
		Boolean(query.member_email) ||
		Boolean(query.member_uri) ||
		Boolean(query.min_start_time) ||
		Boolean(query.max_start_time) ||
		query.status === 'canceled'
	);

	for (const { membership, userUri } of uniqueMembers) {
		membersScanned += 1;
		const memberContext = toTeamMemberContext(membership);
		let pageToken: string | undefined;
		let memberPages = 0;
		let memberEventsScanned = 0;
		const memberEventScanLimit = pageSize * maxPages;

		while (memberPages < maxPages && memberEventsScanned < memberEventScanLimit) {
			const page = await fetchers.fetchMemberEventsPage(userUri, pageToken, query.include_invitees === true, pageSize);
			const events = toRecordCollection(page?.collection);
			memberPages += 1;
			eventPagesScanned += 1;
			memberEventsScanned += events.length;
			eventsScanned += events.length;

			for (const event of events) {
				if (!matchesEventTypeName(event, query.event_type_name)) {
					continue;
				}
				const dedupKey = getTeamEventDedupKey(event);
				if (dedupKey && seenEventKeys.has(dedupKey)) {
					const existingIndex = seenEventIndexByKey.get(dedupKey);
					if (existingIndex !== undefined) {
						const existing = collected[existingIndex];
						if (existing && !existing.members.some((member) => sameMember(member, memberContext))) {
							existing.members.push(memberContext);
						}
					}
					continue;
				}
				if (dedupKey) {
					seenEventKeys.add(dedupKey);
					seenEventIndexByKey.set(dedupKey, collected.length);
				}
				collected.push({ member: memberContext, members: [memberContext], event, scanIndex: nextScanIndex });
				nextScanIndex += 1;
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

	if (shouldRunOrganizationFallback && fetchers.fetchOrganizationEventsPage) {
		const unattributedMember = createUnattributedMemberContext(
			query.organization_uri,
			membershipPageLimitReached ? 'Unscanned, former, or unknown member' : 'Former or unknown member'
		);
		let pageToken: string | undefined;
		let orgPages = 0;
		let orgEventsScanned = 0;
		const orgEventScanLimit = pageSize * maxPages;

		while (orgPages < maxPages && orgEventsScanned < orgEventScanLimit) {
			const page = await fetchers.fetchOrganizationEventsPage(pageToken, query.include_invitees === true, pageSize);
			const events = toRecordCollection(page?.collection);
			orgPages += 1;
			eventPagesScanned += 1;
			orgEventsScanned += events.length;
			eventsScanned += events.length;

			for (const event of events) {
				if (!matchesEventTypeName(event, query.event_type_name)) {
					continue;
				}
				if (!matchesOrgFallbackScope(event, query)) {
					continue;
				}
				const dedupKey = getTeamEventDedupKey(event);
				if (dedupKey && seenEventKeys.has(dedupKey)) {
					continue;
				}
				if (dedupKey) {
					seenEventKeys.add(dedupKey);
					seenEventIndexByKey.set(dedupKey, collected.length);
				}
				collected.push({ member: unattributedMember, members: [unattributedMember], event, scanIndex: nextScanIndex });
				nextScanIndex += 1;
			}

			pageToken = page?.next_page_token;
			if (!pageToken) {
				break;
			}
		}

		if (Boolean(pageToken) && orgPages >= maxPages) {
			memberEventPageLimitReached = true;
		}
	}

	const orderedCollected = collected
		.slice()
		.sort((left, right) => {
			const startDiff = toEventTimeSortKey(left.event) - toEventTimeSortKey(right.event);
			if (startDiff !== 0) {
				return startDiff;
			}
			return left.scanIndex - right.scanIndex;
		});

	reachedResultCap = orderedCollected.length > query.count;
	const limitedCollected = orderedCollected.slice(0, query.count);

	let hydratedEvents = limitedCollected.map((entry) => entry.event);
	let inviteeHydration: unknown = undefined;
	if (query.include_invitees === true && query.hydrate_invitees !== false) {
		const hydrated = await hydrateTeamEventInvitees(
			hydratedEvents,
			query.max_invitee_fetches,
			fetchers.fetchEventInviteesPage,
		);
		hydratedEvents = hydrated.collection;
		inviteeHydration = hydrated.meta;
	}

	const collection = limitedCollected.map((entry, index) => {
		const event = hydratedEvents[index] ?? entry.event;
		const invitees = normalizeInvitees(event?.invitees);
		return {
			member: entry.member,
			members: entry.members,
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
	const memberLabel = createMembersDisplayLabel(record.members);
	const eventLabel = record.event?.name ?? record.event?.event_type?.name ?? record.event?.event_type_name ?? 'Unnamed event';
	return `${memberLabel} — ${eventLabel}`;
}

function createInviteeDisplayLabel(record: TeamEventRecord): string {
	const inviteeNames = normalizeInvitees(record.invitees).map((invitee: any) => invitee.name || invitee.email).filter(Boolean);
	if (inviteeNames.length > 0) {
		return `${record.invitee_count || inviteeNames.length} (${inviteeNames.join(', ')})`;
	}
	if ((record.invitee_count || 0) > 0) {
		return `${record.invitee_count} (details unavailable)`;
	}
	return '0 (None)';
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
			console.log(`| ${createMembersDisplayLabel(record.members)} | ${record.event?.name || 'Unnamed event'} | ${record.event?.start_time || ''} | ${record.event?.status || ''} | ${createInviteeDisplayLabel(record)} |`);
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
		console.log(`  Member: ${createMembersDisplayLabel(record.members)}`);
		console.log(`  Start: ${record.event?.start_time || ''}`);
		console.log(`  Status: ${record.event?.status || ''}`);
		console.log(`  Label: ${createTeamEventsTextLabel(record)}`);
		console.log('  Invitees:');
		const invitees = normalizeInvitees(record.event?.invitees);
		if (invitees.length === 0) {
			console.log((record.invitee_count || 0) > 0 ? '    (details unavailable)' : '    (none)');
		} else {
			for (const invitee of invitees) {
				console.log(`    - ${invitee.name || invitee.email || 'Unknown invitee'}${invitee.email ? ` <${invitee.email}>` : ''}`);
			}
		}
	}
}
