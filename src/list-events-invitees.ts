export type ListEventsInviteesQuery = {
	user_uri?: string;
	organization_uri?: string;
	status?: string;
	max_start_time?: string;
	min_start_time?: string;
	count?: number;
	expand?: string | string[];
	include_invitees?: boolean;
	hydrate_invitees?: boolean;
	max_invitee_fetches?: number;
};

export type Invitee = {
	email?: string;
	name?: string;
};

export type InviteePaginationMeta = {
	has_more: boolean;
	next_page_token?: string;
};

export type InviteesPage = {
	collection: unknown;
	next_page_token?: string;
};

export type InviteesPageFetcher = (eventUuid: string, pageToken?: string) => Promise<InviteesPage>;

export type InviteeHydrationMeta = {
	enabled: boolean;
	used: boolean;
	max_fetches: number;
	fetches_used: number;
	events_needing_hydration: number;
	events_hydrated: number;
	events_failed: number;
	events_skipped_missing_uuid: number;
	events_skipped_due_to_cap: number;
	truncated: boolean;
	truncation_reason?: string;
};

export const DEFAULT_MAX_INVITEE_FETCHES = 25;

export function normalizeExpandValues(expand: unknown): string[] {
	if (Array.isArray(expand)) {
		return expand
			.flatMap((entry) => String(entry).split(','))
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean);
	}
	if (typeof expand === 'string') {
		return expand
			.split(',')
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean);
	}
	return [];
}

export function shouldIncludeInvitees(options: ListEventsInviteesQuery): boolean {
	if (options.include_invitees === true) {
		return true;
	}
	const expands = normalizeExpandValues(options.expand);
	return expands.includes('invitees');
}

export function toCalendlyScheduledEventsParams(options: ListEventsInviteesQuery): URLSearchParams {
	const params = new URLSearchParams();
	if (options.user_uri) params.append('user', options.user_uri);
	if (options.organization_uri) params.append('organization', options.organization_uri);
	if (options.status) params.append('status', options.status);
	if (options.max_start_time) params.append('max_start_time', options.max_start_time);
	if (options.min_start_time) params.append('min_start_time', options.min_start_time);
	if (options.count !== undefined) params.append('count', String(options.count));
	if (shouldIncludeInvitees(options)) params.append('expand', 'invitees');
	return params;
}

export function normalizeInvitees(invitees: unknown): Invitee[] {
	if (!Array.isArray(invitees)) {
		return [];
	}
	return invitees.filter((invitee) => Boolean(invitee) && typeof invitee === 'object') as Invitee[];
}

export function eventActiveInviteeCounter(event: any): number {
	const active = event?.invitees_counter?.active;
	const numeric = typeof active === 'number' ? active : Number(active);
	if (!Number.isFinite(numeric)) {
		return 0;
	}
	return Math.max(0, Math.trunc(numeric));
}

export function eventTotalInviteeCounter(event: any): number {
	const total = event?.invitees_counter?.total;
	const numeric = typeof total === 'number' ? total : Number(total);
	if (!Number.isFinite(numeric)) {
		return eventActiveInviteeCounter(event);
	}
	return Math.max(0, Math.trunc(numeric));
}

export function shouldHydrateEventInvitees(event: any): boolean {
	if (normalizeInvitees(event?.invitees).length > 0) {
		return false;
	}
	return eventTotalInviteeCounter(event) > 0;
}

export function normalizeMaxInviteeFetches(input: unknown, fallback: number = DEFAULT_MAX_INVITEE_FETCHES): number {
	const numeric = typeof input === 'number' ? input : Number(input);
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return fallback;
	}
	return Math.max(1, Math.trunc(numeric));
}

function parseEventUuidFromUri(uri: unknown): string | undefined {
	if (typeof uri !== 'string' || uri.length === 0) {
		return undefined;
	}
	const parts = uri.split('/').filter(Boolean);
	const maybeUuid = parts[parts.length - 1];
	return typeof maybeUuid === 'string' && maybeUuid.length > 0 ? maybeUuid : undefined;
}

export function getEventUuid(event: any): string | undefined {
	const direct = event?.uuid;
	if (typeof direct === 'string' && direct.length > 0) {
		return direct;
	}
	return parseEventUuidFromUri(event?.uri);
}

export async function hydrateMissingInvitees(
	events: unknown,
	options: Pick<ListEventsInviteesQuery, 'hydrate_invitees' | 'max_invitee_fetches'>,
	fetchInviteesPage: InviteesPageFetcher
): Promise<{ collection: any[]; meta: InviteeHydrationMeta }> {
	const collection = Array.isArray(events) ? events : [];
	const enabled = options.hydrate_invitees !== false;
	const maxFetches = normalizeMaxInviteeFetches(options.max_invitee_fetches, DEFAULT_MAX_INVITEE_FETCHES);
	let fetchesUsed = 0;
	let eventsNeedingHydration = 0;
	let eventsHydrated = 0;
	let eventsFailed = 0;
	let eventsSkippedMissingUuid = 0;
	let eventsSkippedDueToCap = 0;
	let truncated = false;

	const hydratedEvents: any[] = [];
	for (const event of collection) {
		const baseInvitees = normalizeInvitees(event?.invitees);
		const baseEvent = {
			...event,
			invitees: baseInvitees,
		};

		if (!enabled || !shouldHydrateEventInvitees(baseEvent)) {
			hydratedEvents.push({
				...baseEvent,
				invitee_hydration: { used: false, truncated: false },
			});
			continue;
		}

		eventsNeedingHydration += 1;
		if (fetchesUsed >= maxFetches) {
			eventsSkippedDueToCap += 1;
			truncated = true;
			hydratedEvents.push({
				...baseEvent,
				invitee_hydration: { used: false, truncated: true, reason: 'max_invitee_fetches_reached' },
			});
			continue;
		}

		const eventUuid = getEventUuid(baseEvent);
		if (!eventUuid) {
			eventsSkippedMissingUuid += 1;
			hydratedEvents.push({
				...baseEvent,
				invitee_hydration: { used: false, truncated: false, reason: 'missing_event_uuid' },
			});
			continue;
		}

		const hydratedInvitees: Invitee[] = [];
		let pageToken: string | undefined;
		let eventTruncated = false;
		let eventErrorMessage: string | undefined;
		while (true) {
			if (fetchesUsed >= maxFetches) {
				truncated = true;
				eventTruncated = true;
				break;
			}
			fetchesUsed += 1;
			let page: InviteesPage;
			try {
				page = await fetchInviteesPage(eventUuid, pageToken);
			} catch (error) {
				eventsFailed += 1;
				eventErrorMessage = error instanceof Error ? error.message : String(error);
				break;
			}
			hydratedInvitees.push(...normalizeInvitees(page?.collection));
			pageToken = typeof page?.next_page_token === 'string' && page.next_page_token.length > 0
				? page.next_page_token
				: undefined;
			if (!pageToken) {
				break;
			}
		}

		if (!eventErrorMessage) {
			eventsHydrated += 1;
		}
		hydratedEvents.push({
			...baseEvent,
			invitees: hydratedInvitees,
			invitee_hydration: {
				used: true,
				truncated: eventTruncated,
				...(eventTruncated ? { reason: 'max_invitee_fetches_reached' } : {}),
				...(eventErrorMessage ? { reason: 'invitee_fetch_failed', error: eventErrorMessage } : {}),
			},
		});
	}

	return {
		collection: hydratedEvents,
		meta: {
			enabled,
			used: enabled && eventsNeedingHydration > 0,
			max_fetches: maxFetches,
			fetches_used: fetchesUsed,
			events_needing_hydration: eventsNeedingHydration,
			events_hydrated: eventsHydrated,
			events_failed: eventsFailed,
			events_skipped_missing_uuid: eventsSkippedMissingUuid,
			events_skipped_due_to_cap: eventsSkippedDueToCap,
			truncated,
			...(truncated ? { truncation_reason: 'max_invitee_fetches_reached' } : {}),
		},
	};
}

export async function hydrateInviteesPerEvent(
	events: unknown,
	options: Pick<ListEventsInviteesQuery, 'hydrate_invitees' | 'max_invitee_fetches'>,
	fetchInviteesPage: InviteesPageFetcher
): Promise<{ collection: any[]; meta: InviteeHydrationMeta & { max_fetches_per_event: number } }> {
	const collection = Array.isArray(events) ? events : [];
	const maxFetchesPerEvent = normalizeMaxInviteeFetches(options.max_invitee_fetches, DEFAULT_MAX_INVITEE_FETCHES);
	const aggregated: InviteeHydrationMeta & { max_fetches_per_event: number } = {
		enabled: options.hydrate_invitees !== false,
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

	const hydratedEvents: any[] = [];
	for (const event of collection) {
		const hydrated = await hydrateMissingInvitees(
			[event],
			options,
			fetchInviteesPage,
		);
		hydratedEvents.push(hydrated.collection[0] ?? event);
		aggregated.used = aggregated.used || hydrated.meta.used;
		aggregated.fetches_used += hydrated.meta.fetches_used;
		aggregated.events_needing_hydration += hydrated.meta.events_needing_hydration;
		aggregated.events_hydrated += hydrated.meta.events_hydrated;
		aggregated.events_failed += hydrated.meta.events_failed;
		aggregated.events_skipped_missing_uuid += hydrated.meta.events_skipped_missing_uuid;
		aggregated.events_skipped_due_to_cap += hydrated.meta.events_skipped_due_to_cap;
		aggregated.truncated = aggregated.truncated || hydrated.meta.truncated;
	}

	aggregated.max_fetches = aggregated.events_needing_hydration * maxFetchesPerEvent;
	if (aggregated.truncated) {
		aggregated.truncation_reason = 'max_invitee_fetches_reached';
	}

	return {
		collection: hydratedEvents,
		meta: aggregated,
	};
}

export function eventInviteeCount(event: any): number {
	const embeddedInvitees = normalizeInvitees(event?.invitees);
	const hydration = event?.invitee_hydration;
	const hydrationPartial = hydration?.used === true && (hydration?.truncated === true || hydration?.reason === 'invitee_fetch_failed');
	if (hydrationPartial) {
		if (event?.status === 'active') {
			return eventActiveInviteeCounter(event);
		}
		return eventTotalInviteeCounter(event);
	}
	if (embeddedInvitees.length > 0) {
		return embeddedInvitees.length;
	}
	if (event?.status === 'active') {
		return eventActiveInviteeCounter(event);
	}
	return eventTotalInviteeCounter(event);
}

export function extractInviteePaginationMeta(responseData: any): InviteePaginationMeta {
	const token = responseData?.pagination?.next_page_token;
	const nextPageToken = typeof token === 'string' && token.length > 0 ? token : undefined;
	return {
		has_more: Boolean(nextPageToken),
		next_page_token: nextPageToken,
	};
}
