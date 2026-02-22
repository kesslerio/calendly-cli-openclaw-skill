import { DEFAULT_MAX_INVITEE_FETCHES, getEventUuid, normalizeInvitees, normalizeMaxInviteeFetches } from './list-events-invitees';

export type BatchEventInviteesCmdOptions = {
	eventUri?: string[];
	status?: 'active' | 'canceled';
	email?: string;
	count?: number;
	maxInviteeFetches?: number;
};

export type BatchEventInviteesQuery = {
	event_uris: string[];
	status?: 'active' | 'canceled';
	email?: string;
	count: number;
	max_invitee_fetches: number;
};

export type BatchEventInviteesResultItem = {
	event_uri: string;
	event_uuid: string;
	invitees: unknown[];
	meta: {
		fetches_used: number;
		has_more: boolean;
		truncated: boolean;
	};
	error?: {
		message: string;
		reason: 'invitee_fetch_failed' | 'invalid_event_uri' | 'max_invitee_fetches_reached';
	};
};

export type BatchEventInviteesResult = {
	collection: BatchEventInviteesResultItem[];
	meta: {
		requested: number;
		processed: number;
		failed: number;
		truncated: boolean;
		max_invitee_fetches: number;
		fetches_used: number;
	};
};

export type EventInviteesPage = {
	collection: unknown;
	next_page_token?: string;
};

export type EventInviteesPageFetcher = (
	eventUuid: string,
	pageToken: string | undefined,
	options: Pick<BatchEventInviteesQuery, 'status' | 'email' | 'count'>
) => Promise<EventInviteesPage>;

const DEFAULT_PER_PAGE_COUNT = 100;

function normalizeEventUris(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.flatMap((entry) => normalizeEventUris(entry));
	}
	if (typeof value !== 'string') {
		return [];
	}
	const trimmed = value.trim();
	return trimmed ? [trimmed] : [];
}

function dedupeStable(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		if (seen.has(value)) {
			continue;
		}
		seen.add(value);
		result.push(value);
	}
	return result;
}

function normalizeStatus(value: unknown): 'active' | 'canceled' | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}
	if (value === 'active' || value === 'canceled') {
		return value;
	}
	throw new Error('status must be either "active" or "canceled"');
}

function normalizeCount(value: unknown): number {
	if (value === undefined || value === null || value === '') {
		return DEFAULT_PER_PAGE_COUNT;
	}
	const numeric = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(numeric)) {
		throw new Error('count must be a valid number');
	}
	return Math.max(1, Math.min(100, Math.trunc(numeric)));
}

export function normalizeBatchEventInviteesQuery(
	cmdOpts: BatchEventInviteesCmdOptions,
	defaults: Record<string, unknown> = {}
): BatchEventInviteesQuery {
	const defaultEventUris = dedupeStable([
		...normalizeEventUris(defaults.event_uri),
		...normalizeEventUris(defaults.event_uris),
	]);

	const query: BatchEventInviteesQuery = {
		event_uris: defaultEventUris,
		status: normalizeStatus(defaults.status),
		email: typeof defaults.email === 'string' && defaults.email.trim().length > 0 ? defaults.email.trim() : undefined,
		count: normalizeCount(defaults.count),
		max_invitee_fetches: normalizeMaxInviteeFetches(defaults.max_invitee_fetches, DEFAULT_MAX_INVITEE_FETCHES),
	};

	if (Array.isArray(cmdOpts.eventUri) && cmdOpts.eventUri.length > 0) {
		query.event_uris = dedupeStable(normalizeEventUris(cmdOpts.eventUri));
	}
	if (cmdOpts.status !== undefined) query.status = normalizeStatus(cmdOpts.status);
	if (cmdOpts.email !== undefined) query.email = cmdOpts.email.trim() || undefined;
	if (cmdOpts.count !== undefined) query.count = normalizeCount(cmdOpts.count);
	if (cmdOpts.maxInviteeFetches !== undefined) {
		query.max_invitee_fetches = normalizeMaxInviteeFetches(cmdOpts.maxInviteeFetches, DEFAULT_MAX_INVITEE_FETCHES);
	}

	if (query.event_uris.length === 0) {
		throw new Error('at least one event_uri is required');
	}
	return query;
}

export async function fetchBatchEventInvitees(
	query: BatchEventInviteesQuery,
	fetchInviteesPage: EventInviteesPageFetcher
): Promise<BatchEventInviteesResult> {
	const collection: BatchEventInviteesResultItem[] = [];
	let processed = 0;
	let failed = 0;
	let fetchesUsed = 0;
	let truncated = false;

	for (const eventUri of query.event_uris) {
		const eventUuid = getEventUuid({ uri: eventUri });
		if (!eventUuid) {
			failed += 1;
			collection.push({
				event_uri: eventUri,
				event_uuid: '',
				invitees: [],
				meta: { fetches_used: 0, has_more: false, truncated: false },
				error: {
					message: 'unable to parse event UUID from event_uri',
					reason: 'invalid_event_uri',
				},
			});
			continue;
		}

		if (fetchesUsed >= query.max_invitee_fetches) {
			truncated = true;
			failed += 1;
			collection.push({
				event_uri: eventUri,
				event_uuid: eventUuid,
				invitees: [],
				meta: { fetches_used: 0, has_more: true, truncated: true },
				error: {
					message: 'max_invitee_fetches reached before event could be processed',
					reason: 'max_invitee_fetches_reached',
				},
			});
			continue;
		}

		const invitees: unknown[] = [];
		let pageToken: string | undefined;
		let eventTruncated = false;
		let eventFetches = 0;
		let eventError: Error | undefined;

		while (true) {
			if (fetchesUsed >= query.max_invitee_fetches) {
				truncated = true;
				eventTruncated = true;
				break;
			}

			fetchesUsed += 1;
			eventFetches += 1;
			try {
				const page = await fetchInviteesPage(eventUuid, pageToken, query);
				invitees.push(...normalizeInvitees(page?.collection));
				const nextPageToken = typeof page?.next_page_token === 'string' && page.next_page_token.length > 0
					? page.next_page_token
					: undefined;
				if (!nextPageToken) {
					break;
				}
				pageToken = nextPageToken;
			} catch (error) {
				eventError = error instanceof Error ? error : new Error(String(error));
				break;
			}
		}

		const hasMore = Boolean(pageToken) || eventTruncated;
		if (eventError) {
			failed += 1;
		} else {
			processed += 1;
		}
		collection.push({
			event_uri: eventUri,
			event_uuid: eventUuid,
			invitees,
			meta: {
				fetches_used: eventFetches,
				has_more: hasMore,
				truncated: eventTruncated,
			},
			...(eventError
				? {
					error: {
						message: eventError.message,
						reason: 'invitee_fetch_failed' as const,
					},
				}
				: {}),
		});
	}

	return {
		collection,
		meta: {
			requested: query.event_uris.length,
			processed,
			failed,
			truncated,
			max_invitee_fetches: query.max_invitee_fetches,
			fetches_used: fetchesUsed,
		},
	};
}
