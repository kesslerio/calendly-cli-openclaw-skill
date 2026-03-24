import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_MAX_INVITEE_FETCHES,
	eventInviteeCount,
	extractInviteePaginationMeta,
	hydrateInviteesPerEvent,
	hydrateMissingInvitees,
	normalizeExpandValues,
	normalizeMaxInviteeFetches,
	normalizeInvitees,
	shouldHydrateEventInvitees,
	shouldIncludeInvitees,
	toCalendlyScheduledEventsParams,
} from './list-events-invitees';

describe('normalizeExpandValues', () => {
	test('handles csv, arrays and empty values', () => {
		expect(normalizeExpandValues(' invitees , location ')).toEqual(['invitees', 'location']);
		expect(normalizeExpandValues(['invitees,location', ' questions '])).toEqual(['invitees', 'location', 'questions']);
		expect(normalizeExpandValues(undefined)).toEqual([]);
	});
});

describe('shouldIncludeInvitees', () => {
	test('enables invitees from explicit flag or expand value', () => {
		expect(shouldIncludeInvitees({ include_invitees: true })).toBe(true);
		expect(shouldIncludeInvitees({ expand: 'invitees' })).toBe(true);
		expect(shouldIncludeInvitees({ expand: ['location', 'invitees'] })).toBe(true);
		expect(shouldIncludeInvitees({ expand: 'location' })).toBe(false);
	});
});

describe('toCalendlyScheduledEventsParams', () => {
	test('builds compatibility params without invitee expansion by default', () => {
		const params = toCalendlyScheduledEventsParams({
			user_uri: 'https://api.calendly.com/users/U',
			status: 'active',
			count: 20,
		});
		expect(params.get('user')).toBe('https://api.calendly.com/users/U');
		expect(params.get('status')).toBe('active');
		expect(params.get('count')).toBe('20');
		expect(params.get('expand')).toBeNull();
	});

	test('adds invitee expansion when requested', () => {
		const params = toCalendlyScheduledEventsParams({ include_invitees: true });
		expect(params.get('expand')).toBe('invitees');
	});
});

describe('normalizeInvitees and eventInviteeCount', () => {
	test('parses invitees arrays and ignores invalid values', () => {
		const invitees = normalizeInvitees([
			{ email: 'one@example.com', name: 'One' },
			null,
			'bad',
			{ email: 'two@example.com' },
		]);
		expect(invitees.length).toBe(2);
		expect(invitees[0]?.email).toBe('one@example.com');
		expect(eventInviteeCount({ invitees })).toBe(2);
	});

	test('falls back to invitees_counter.total when invitees are not expanded', () => {
		expect(eventInviteeCount({ invitees: undefined, invitees_counter: { total: 3, active: 2 } })).toBe(3);
		expect(eventInviteeCount({ invitees: [], invitees_counter: { total: '2', active: '1' } })).toBe(2);
		expect(eventInviteeCount({ invitees: [], status: 'canceled', invitees_counter: { total: 4, active: 0 } })).toBe(4);
	});

	test('uses counters instead of partial invitee arrays when hydration is truncated or fails', () => {
		expect(eventInviteeCount({
			status: 'active',
			invitees: [{ email: 'one@example.com' }],
			invitees_counter: { total: 4, active: 3 },
			invitee_hydration: { used: true, truncated: true, reason: 'max_invitee_fetches_reached' },
		})).toBe(3);
		expect(eventInviteeCount({
			status: 'canceled',
			invitees: [{ email: 'one@example.com' }],
			invitees_counter: { total: 4, active: 0 },
			invitee_hydration: { used: true, truncated: false, reason: 'invitee_fetch_failed' },
		})).toBe(4);
	});

	test('returns empty array/count for empty and non-array cases', () => {
		expect(normalizeInvitees(undefined)).toEqual([]);
		expect(normalizeInvitees({})).toEqual([]);
		expect(eventInviteeCount({ invitees: undefined })).toBe(0);
		expect(eventInviteeCount({ invitees: [] })).toBe(0);
	});
});

describe('extractInviteePaginationMeta', () => {
	test('tracks pagination token presence', () => {
		expect(extractInviteePaginationMeta({ pagination: { next_page_token: 'abc' } })).toEqual({
			has_more: true,
			next_page_token: 'abc',
		});
		expect(extractInviteePaginationMeta({ pagination: { next_page_token: '' } })).toEqual({
			has_more: false,
			next_page_token: undefined,
		});
		expect(extractInviteePaginationMeta({})).toEqual({
			has_more: false,
			next_page_token: undefined,
		});
	});
});

describe('shouldHydrateEventInvitees', () => {
	test('hydrates only when active counter is positive and embedded invitees are missing', () => {
		expect(shouldHydrateEventInvitees({ invitees_counter: { active: 1 }, invitees: [] })).toBe(true);
		expect(shouldHydrateEventInvitees({ invitees_counter: { active: 2 }, invitees: undefined })).toBe(true);
		expect(shouldHydrateEventInvitees({ invitees_counter: { active: 0 }, invitees: [] })).toBe(false);
		expect(shouldHydrateEventInvitees({
			invitees_counter: { active: 2 },
			invitees: [{ email: 'embedded@example.com' }],
		})).toBe(false);
	});

	test('hydrates canceled events when total invitees are positive even if active is zero', () => {
		expect(shouldHydrateEventInvitees({ invitees_counter: { total: 2, active: 0 }, invitees: [] })).toBe(true);
	});
});

describe('normalizeMaxInviteeFetches', () => {
	test('defaults and sanitizes invalid values', () => {
		expect(normalizeMaxInviteeFetches(undefined)).toBe(DEFAULT_MAX_INVITEE_FETCHES);
		expect(normalizeMaxInviteeFetches(0)).toBe(DEFAULT_MAX_INVITEE_FETCHES);
		expect(normalizeMaxInviteeFetches(-2)).toBe(DEFAULT_MAX_INVITEE_FETCHES);
		expect(normalizeMaxInviteeFetches('3')).toBe(3);
	});
});

describe('hydrateMissingInvitees', () => {
	test('hydrates missing invitees using paginated fetches', async () => {
		const pages = new Map<string, Array<{ collection: unknown[]; next_page_token?: string }>>([
			['evt-1', [
				{ collection: [{ email: 'one@example.com' }], next_page_token: 'p2' },
				{ collection: [{ email: 'two@example.com' }] },
			]],
		]);
		const calls: Array<{ eventUuid: string; pageToken?: string }> = [];

		const result = await hydrateMissingInvitees(
			[{ uri: 'https://api.calendly.com/scheduled_events/evt-1', invitees_counter: { active: 2 }, invitees: [] }],
			{ hydrate_invitees: true, max_invitee_fetches: 10 },
			async (eventUuid, pageToken) => {
				calls.push({ eventUuid, pageToken });
				const queue = pages.get(eventUuid) ?? [];
				const page = queue.shift() ?? { collection: [] };
				pages.set(eventUuid, queue);
				return page;
			}
		);

		expect(calls).toEqual([
			{ eventUuid: 'evt-1', pageToken: undefined },
			{ eventUuid: 'evt-1', pageToken: 'p2' },
		]);
		expect(result.collection[0].invitees).toEqual([
			{ email: 'one@example.com' },
			{ email: 'two@example.com' },
		]);
		expect(result.collection[0].invitee_hydration).toEqual({ used: true, truncated: false });
		expect(result.meta.fetches_used).toBe(2);
		expect(result.meta.truncated).toBe(false);
	});

	test('stops hydration when max invitee fetch cap is reached', async () => {
		const result = await hydrateMissingInvitees(
			[
				{ uri: 'https://api.calendly.com/scheduled_events/evt-1', invitees_counter: { active: 2 }, invitees: [] },
				{ uri: 'https://api.calendly.com/scheduled_events/evt-2', invitees_counter: { active: 1 }, invitees: [] },
			],
			{ hydrate_invitees: true, max_invitee_fetches: 1 },
			async (eventUuid) => ({
				collection: [{ email: `${eventUuid}@example.com` }],
			})
		);

		expect(result.collection[0].invitees).toEqual([{ email: 'evt-1@example.com' }]);
		expect(result.collection[1].invitees).toEqual([]);
		expect(result.collection[1].invitee_hydration).toEqual({
			used: false,
			truncated: true,
			reason: 'max_invitee_fetches_reached',
		});
		expect(result.meta.fetches_used).toBe(1);
		expect(result.meta.events_skipped_due_to_cap).toBe(1);
		expect(result.meta.truncated).toBe(true);
		expect(result.meta.truncation_reason).toBe('max_invitee_fetches_reached');
	});

	test('marks truncation without counting event as skipped when cap is reached mid-pagination', async () => {
		let calls = 0;
		const result = await hydrateMissingInvitees(
			[{ uri: 'https://api.calendly.com/scheduled_events/evt-1', invitees_counter: { active: 3 }, invitees: [] }],
			{ hydrate_invitees: true, max_invitee_fetches: 1 },
			async () => {
				calls += 1;
				return {
					collection: [{ email: 'first@example.com' }],
					next_page_token: 'next',
				};
			}
		);

		expect(calls).toBe(1);
		expect(result.collection[0].invitees).toEqual([{ email: 'first@example.com' }]);
		expect(result.collection[0].invitee_hydration).toEqual({
			used: true,
			truncated: true,
			reason: 'max_invitee_fetches_reached',
		});
		expect(result.meta.events_skipped_due_to_cap).toBe(0);
		expect(result.meta.truncated).toBe(true);
	});

	test('does not fallback fetch when invitees are already embedded', async () => {
		let fetchCalls = 0;
		const result = await hydrateMissingInvitees(
			[{
				uri: 'https://api.calendly.com/scheduled_events/evt-1',
				invitees_counter: { active: 2 },
				invitees: [{ email: 'embedded@example.com' }],
			}],
			{ hydrate_invitees: true, max_invitee_fetches: 5 },
			async () => {
				fetchCalls += 1;
				return { collection: [] };
			}
		);

		expect(fetchCalls).toBe(0);
		expect(result.collection[0].invitees).toEqual([{ email: 'embedded@example.com' }]);
		expect(result.collection[0].invitee_hydration).toEqual({ used: false, truncated: false });
		expect(result.meta.used).toBe(false);
		expect(result.meta.events_needing_hydration).toBe(0);
	});

	test('isolates per-event hydration failures without failing all events', async () => {
		const result = await hydrateMissingInvitees(
			[
				{ uri: 'https://api.calendly.com/scheduled_events/evt-bad', invitees_counter: { active: 1 }, invitees: [] },
				{ uri: 'https://api.calendly.com/scheduled_events/evt-good', invitees_counter: { active: 1 }, invitees: [] },
			],
			{ hydrate_invitees: true, max_invitee_fetches: 10 },
			async (eventUuid) => {
				if (eventUuid === 'evt-bad') {
					throw new Error('timeout');
				}
				return { collection: [{ email: 'good@example.com' }] };
			}
		);

		expect(result.collection[0].invitee_hydration).toEqual({
			used: true,
			truncated: false,
			reason: 'invitee_fetch_failed',
			error: 'timeout',
		});
		expect(result.collection[0].invitees).toEqual([]);
		expect(result.collection[1].invitees).toEqual([{ email: 'good@example.com' }]);
		expect(result.meta.events_failed).toBe(1);
		expect(result.meta.events_hydrated).toBe(1);
	});

	test('counts failed fallback attempts against max fetch cap', async () => {
		const result = await hydrateMissingInvitees(
			[
				{ uri: 'https://api.calendly.com/scheduled_events/evt-bad', invitees_counter: { active: 1 }, invitees: [] },
				{ uri: 'https://api.calendly.com/scheduled_events/evt-next', invitees_counter: { active: 1 }, invitees: [] },
			],
			{ hydrate_invitees: true, max_invitee_fetches: 1 },
			async (eventUuid) => {
				if (eventUuid === 'evt-bad') throw new Error('rate_limited');
				return { collection: [{ email: 'next@example.com' }] };
			}
		);

		expect(result.meta.fetches_used).toBe(1);
		expect(result.meta.events_failed).toBe(1);
		expect(result.meta.events_skipped_due_to_cap).toBe(1);
		expect(result.meta.truncated).toBe(true);
		expect(result.collection[1].invitee_hydration).toEqual({
			used: false,
			truncated: true,
			reason: 'max_invitee_fetches_reached',
		});
	});

	test('applies max_invitee_fetches independently per listed event', async () => {
		let fetches = 0;
		const result = await hydrateInviteesPerEvent(
			[
				{ uri: 'https://api.calendly.com/scheduled_events/evt-1', invitees_counter: { active: 2, total: 2 }, invitees: [] },
				{ uri: 'https://api.calendly.com/scheduled_events/evt-2', invitees_counter: { active: 2, total: 2 }, invitees: [] },
			],
			{ hydrate_invitees: true, max_invitee_fetches: 1 },
			async (eventUuid) => {
				fetches += 1;
				return { collection: [{ email: `${eventUuid}@example.com` }], next_page_token: 'next' };
			}
		);

		expect(fetches).toBe(2);
		expect(result.collection[0].invitees).toEqual([{ email: 'evt-1@example.com' }]);
		expect(result.collection[1].invitees).toEqual([{ email: 'evt-2@example.com' }]);
		expect(result.collection[0].invitee_hydration).toEqual({
			used: true,
			truncated: true,
			reason: 'max_invitee_fetches_reached',
		});
		expect(result.collection[1].invitee_hydration).toEqual({
			used: true,
			truncated: true,
			reason: 'max_invitee_fetches_reached',
		});
		expect(result.meta).toMatchObject({
			fetches_used: 2,
			max_fetches: 2,
			max_fetches_per_event: 1,
			events_needing_hydration: 2,
			truncated: true,
		});
	});
});
