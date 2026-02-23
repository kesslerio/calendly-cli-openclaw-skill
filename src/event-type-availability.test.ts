import { describe, expect, test } from 'bun:test';
import {
	normalizeEventTypeAvailabilityQuery,
	shapeEventTypeAvailabilityResult,
} from './event-type-availability';

describe('normalizeEventTypeAvailabilityQuery', () => {
	test('normalizes required args from flags', () => {
		const query = normalizeEventTypeAvailabilityQuery({
			eventTypeUri: ' https://api.calendly.com/event_types/AAA ',
			startTime: '2026-03-01T00:00:00Z',
			endTime: '2026-03-02T00:00:00Z',
		});
		expect(query).toEqual({
			event_type_uri: 'https://api.calendly.com/event_types/AAA',
			event_type: 'https://api.calendly.com/event_types/AAA',
			start_time: '2026-03-01T00:00:00Z',
			end_time: '2026-03-02T00:00:00Z',
		});
	});

	test('uses raw fallback and flag override', () => {
		const query = normalizeEventTypeAvailabilityQuery(
			{
				startTime: '2026-03-03T00:00:00Z',
				endTime: '2026-03-04T00:00:00Z',
			},
			{
				event_type_uri: 'https://api.calendly.com/event_types/RAW',
				start_time: '2026-03-01T00:00:00Z',
				end_time: '2026-03-02T00:00:00Z',
				timezone: 'America/New_York',
			}
		);
		expect(query).toEqual({
			event_type_uri: 'https://api.calendly.com/event_types/RAW',
			event_type: 'https://api.calendly.com/event_types/RAW',
			start_time: '2026-03-03T00:00:00Z',
			end_time: '2026-03-04T00:00:00Z',
			timezone: 'America/New_York',
		});
	});

	test('rejects missing required args', () => {
		expect(() => normalizeEventTypeAvailabilityQuery({})).toThrow('event_type_uri is required');
		expect(() =>
			normalizeEventTypeAvailabilityQuery({
				eventTypeUri: 'https://api.calendly.com/event_types/AAA',
				endTime: '2026-03-02T00:00:00Z',
			})
		).toThrow('start_time is required');
		expect(() =>
			normalizeEventTypeAvailabilityQuery({
				eventTypeUri: 'https://api.calendly.com/event_types/AAA',
				startTime: '2026-03-02T00:00:00Z',
			})
		).toThrow('end_time is required');
	});

	test('rejects invalid timestamps, inverted bounds, and oversized windows', () => {
		expect(() =>
			normalizeEventTypeAvailabilityQuery({
				eventTypeUri: 'https://api.calendly.com/event_types/AAA',
				startTime: '2026-03-01',
				endTime: '2026-03-02T00:00:00Z',
			})
		).toThrow('start_time must be a valid ISO-8601 timestamp');
		expect(() =>
			normalizeEventTypeAvailabilityQuery({
				eventTypeUri: 'https://api.calendly.com/event_types/AAA',
				startTime: '2026-03-03T00:00:00Z',
				endTime: '2026-03-02T00:00:00Z',
			})
		).toThrow('start_time must be less than or equal to end_time');
		expect(() =>
			normalizeEventTypeAvailabilityQuery({
				eventTypeUri: 'https://api.calendly.com/event_types/AAA',
				startTime: '2026-03-01T00:00:00Z',
				endTime: '2026-03-10T00:00:00Z',
			})
		).toThrow('availability window cannot exceed 7 days');
	});

	test('validates optional timezone', () => {
		expect(
			normalizeEventTypeAvailabilityQuery({
				eventTypeUri: 'https://api.calendly.com/event_types/AAA',
				startTime: '2026-03-01T00:00:00Z',
				endTime: '2026-03-02T00:00:00Z',
				timezone: 'America/Los_Angeles',
			}).timezone
		).toBe('America/Los_Angeles');

		expect(() =>
			normalizeEventTypeAvailabilityQuery({
				eventTypeUri: 'https://api.calendly.com/event_types/AAA',
				startTime: '2026-03-01T00:00:00Z',
				endTime: '2026-03-02T00:00:00Z',
				timezone: 'Mars/Olympus',
			})
		).toThrow('timezone must be a valid IANA timezone');
	});
});

describe('shapeEventTypeAvailabilityResult', () => {
	test('normalizes slot collection and metadata', () => {
		const shaped = shapeEventTypeAvailabilityResult(
			{
				collection: [
					{
						start_time: '2026-03-01T15:00:00Z',
						end_time: '2026-03-01T15:30:00Z',
						scheduling_url: 'https://calendly.com/example/slot-1',
						status: 'available',
						invitees_remaining: 1,
					},
					{
						start_time: '2026-03-01T16:00:00Z',
					},
				],
				pagination: {
					next_page_token: null,
				},
			},
			{
				event_type_uri: 'https://api.calendly.com/event_types/AAA',
				event_type: 'https://api.calendly.com/event_types/AAA',
				start_time: '2026-03-01T00:00:00Z',
				end_time: '2026-03-02T00:00:00Z',
				timezone: 'America/New_York',
			}
		);

		expect(shaped).toEqual({
			query: {
				event_type_uri: 'https://api.calendly.com/event_types/AAA',
				start_time: '2026-03-01T00:00:00Z',
				end_time: '2026-03-02T00:00:00Z',
				timezone: 'America/New_York',
			},
			meta: {
				slots: 2,
			},
			collection: [
				{
					start_time: '2026-03-01T15:00:00Z',
					end_time: '2026-03-01T15:30:00Z',
					scheduling_url: 'https://calendly.com/example/slot-1',
					status: 'available',
					invitees_remaining: 1,
				},
				{
					start_time: '2026-03-01T16:00:00Z',
					end_time: null,
					scheduling_url: null,
				},
			],
			pagination: {
				next_page_token: null,
			},
		});
	});
});
