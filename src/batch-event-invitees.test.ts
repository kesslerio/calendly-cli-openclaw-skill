import { describe, expect, test } from 'bun:test';
import { fetchBatchEventInvitees, normalizeBatchEventInviteesQuery } from './batch-event-invitees';

describe('normalizeBatchEventInviteesQuery', () => {
	test('supports a single event URI', () => {
		const query = normalizeBatchEventInviteesQuery({
			eventUri: ['https://api.calendly.com/scheduled_events/evt-1'],
		});
		expect(query.event_uris).toEqual(['https://api.calendly.com/scheduled_events/evt-1']);
		expect(query.count).toBe(100);
	});

	test('dedupes repeated event URIs in deterministic order', () => {
		const query = normalizeBatchEventInviteesQuery({
			eventUri: [
				'https://api.calendly.com/scheduled_events/evt-2',
				'https://api.calendly.com/scheduled_events/evt-1',
				'https://api.calendly.com/scheduled_events/evt-2',
			],
		});
		expect(query.event_uris).toEqual([
			'https://api.calendly.com/scheduled_events/evt-2',
			'https://api.calendly.com/scheduled_events/evt-1',
		]);
	});

	test('keeps raw and flags behavior consistent', () => {
		const fromFlags = normalizeBatchEventInviteesQuery(
			{
				eventUri: [
					'https://api.calendly.com/scheduled_events/evt-1',
					'https://api.calendly.com/scheduled_events/evt-2',
				],
				status: 'active',
				email: 'person@example.com',
				count: 25,
				maxInviteeFetches: 8,
			},
			{}
		);
		const fromRaw = normalizeBatchEventInviteesQuery(
			{},
			{
				event_uris: [
					'https://api.calendly.com/scheduled_events/evt-1',
					'https://api.calendly.com/scheduled_events/evt-2',
				],
				status: 'active',
				email: 'person@example.com',
				count: 25,
				max_invitee_fetches: 8,
			}
		);

		expect(fromFlags).toEqual(fromRaw);
	});

	test('throws for empty input', () => {
		expect(() => normalizeBatchEventInviteesQuery({ eventUri: [] })).toThrow('at least one event_uri is required');
		expect(() => normalizeBatchEventInviteesQuery({}, {})).toThrow('at least one event_uri is required');
	});
});

describe('fetchBatchEventInvitees', () => {
	test('supports multi-event invitee lookup with deterministic ordering', async () => {
		const result = await fetchBatchEventInvitees(
			{
				event_uris: [
					'https://api.calendly.com/scheduled_events/evt-2',
					'https://api.calendly.com/scheduled_events/evt-1',
				],
				status: 'active',
				email: undefined,
				count: 100,
				max_invitee_fetches: 10,
			},
			async (eventUuid) => ({
				collection: [{ email: `${eventUuid}@example.com` }],
			})
		);

		expect(result.collection.map((entry) => entry.event_uuid)).toEqual(['evt-2', 'evt-1']);
		expect(result.collection[0].invitees).toEqual([{ email: 'evt-2@example.com' }]);
		expect(result.meta).toEqual({
			requested: 2,
			processed: 2,
			failed: 0,
			truncated: false,
			max_invitee_fetches: 10,
			fetches_used: 2,
		});
	});

	test('continues with partial failures and reports per-event errors', async () => {
		const result = await fetchBatchEventInvitees(
			{
				event_uris: [
					'https://api.calendly.com/scheduled_events/evt-bad',
					'https://api.calendly.com/scheduled_events/evt-good',
				],
				status: undefined,
				email: undefined,
				count: 100,
				max_invitee_fetches: 10,
			},
			async (eventUuid) => {
				if (eventUuid === 'evt-bad') {
					throw new Error('timeout');
				}
				return { collection: [{ email: 'good@example.com' }] };
			}
		);

		expect(result.collection[0].error).toEqual({
			message: 'timeout',
			reason: 'invitee_fetch_failed',
		});
		expect(result.collection[1].invitees).toEqual([{ email: 'good@example.com' }]);
		expect(result.meta.processed).toBe(1);
		expect(result.meta.failed).toBe(1);
	});

	test('reports truncation metadata when fetch cap is reached', async () => {
		const result = await fetchBatchEventInvitees(
			{
				event_uris: [
					'https://api.calendly.com/scheduled_events/evt-1',
					'https://api.calendly.com/scheduled_events/evt-2',
				],
				status: undefined,
				email: undefined,
				count: 100,
				max_invitee_fetches: 1,
			},
			async (eventUuid, pageToken) => ({
				collection: [{ email: `${eventUuid}-one@example.com` }],
				next_page_token: pageToken ? undefined : 'next',
			})
		);

		expect(result.meta.truncated).toBe(true);
		expect(result.meta.fetches_used).toBe(1);
		expect(result.collection[0].meta.truncated).toBe(true);
		expect(result.collection[1].error).toEqual({
			message: 'max_invitee_fetches reached before event could be processed',
			reason: 'max_invitee_fetches_reached',
		});
	});
});
